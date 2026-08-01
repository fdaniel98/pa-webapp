-- =============================================================================
-- Puello Academy - Bitácora de acciones
-- Ejecutar en Supabase > SQL Editor DESPUÉS de fixes.sql
-- =============================================================================
-- El registro lo escriben las MISMAS funciones que hacen el cambio, dentro de su
-- transacción. Eso implica dos cosas importantes:
--   * No se puede falsear el autor: sale de auth.uid(), es decir del JWT.
--   * No se puede "olvidar" registrar: si la acción se guarda, la bitácora también;
--     si la acción falla, no queda entrada huérfana.
-- Se guarda el nombre del autor como texto además de su id, para que la bitácora
-- siga siendo legible aunque después se elimine la cuenta.
-- =============================================================================


-- 1. TABLA ----------------------------------------------------------------------
create table if not exists public.audit_log
(
    id           uuid primary key     default gen_random_uuid(),
    actor_id     uuid references auth.users (id) on delete set null,
    actor_nombre text        not null default 'sistema',
    accion       text        not null,
    entidad      text,
    entidad_id   uuid,
    detalle      jsonb       not null default '{}'::jsonb,
    created_at   timestamptz not null default now()
);

create index if not exists audit_log_created_at_idx on public.audit_log (created_at desc);
create index if not exists audit_log_accion_idx on public.audit_log (accion);

alter table public.audit_log
    enable row level security;

-- Sólo los admins leen la bitácora. Nadie escribe directamente en ella:
-- las entradas las crean funciones security definer y las Edge Functions.
drop policy if exists audit_log_select_admin on public.audit_log;
create policy audit_log_select_admin on public.audit_log
    for select to authenticated using (public.is_admin());


-- 2. HELPER ---------------------------------------------------------------------
create or replace function public.log_action(
    p_accion text,
    p_entidad text default null,
    p_entidad_id uuid default null,
    p_detalle jsonb default '{}'::jsonb
)
    returns void
    language plpgsql
    security definer
    set search_path = ''
as
$$
declare
    v_actor  uuid;
    v_nombre text;
begin
    v_actor := (select auth.uid());

    select coalesce(full_name, email)
    into v_nombre
    from public.profiles
    where id = v_actor;

    insert into public.audit_log (actor_id, actor_nombre, accion, entidad, entidad_id, detalle)
    values (v_actor, coalesce(v_nombre, 'sistema'), p_accion, p_entidad, p_entidad_id,
            coalesce(p_detalle, '{}'::jsonb));
end;
$$;

revoke execute on function public.log_action(text, text, uuid, jsonb) from public, anon;


-- 3. INICIO / CIERRE DE SESIÓN ---------------------------------------------------
-- La identidad no se puede falsear (sale del JWT), pero sí depende de que el
-- cliente llame: es un registro de conveniencia. El log de auth completo e
-- inmutable lo mantiene Supabase en auth.audit_log_entries.
create or replace function public.record_session_event(p_evento text)
    returns void
    language plpgsql
    security definer
    set search_path = ''
as
$$
begin
    if p_evento not in ('sesion_iniciada', 'sesion_cerrada') then
        raise exception 'Evento de sesión inválido.';
    end if;
    if (select auth.uid()) is null then
        return;
    end if;

    perform public.log_action(p_evento, 'auth', (select auth.uid()));
end;
$$;

revoke execute on function public.record_session_event(text) from public, anon;
grant execute on function public.record_session_event(text) to authenticated;


-- 4. JUGADORES -------------------------------------------------------------------
create or replace function public.add_player(p_nombre text, p_email text default null)
    returns public.players
    language plpgsql
    security definer
    set search_path = ''
as
$$
declare
    v_nombre text;
    v_rango  integer;
    v_player public.players;
begin
    perform public.assert_admin();

    v_nombre := upper(trim(p_nombre));
    if v_nombre = '' then
        raise exception 'Por favor ingresa un nombre para el jugador.';
    end if;
    if exists (select 1 from public.players where nombre = v_nombre) then
        raise exception 'Ya existe un jugador con ese nombre.';
    end if;

    select coalesce(max(rango_actual), 0) + 1 into v_rango from public.players;

    insert into public.players (nombre, rango_actual, rango_anterior, email)
    values (v_nombre, v_rango, v_rango, nullif(trim(p_email), ''))
    returning * into v_player;

    insert into public.ranking_history (texto)
    values (format('Nuevo retador ingresó: %s en el puesto #%s', v_nombre, v_rango));

    perform public.log_action('jugador_agregado', 'players', v_player.id,
                              jsonb_build_object('nombre', v_nombre, 'puesto', v_rango,
                                                 'email', v_player.email));

    return v_player;
exception
    when check_violation then raise exception 'El correo "%" no tiene un formato válido.', p_email;
end;
$$;


create or replace function public.remove_player(p_id uuid)
    returns void
    language plpgsql
    security definer
    set search_path = ''
as
$$
declare
    v_player public.players;
begin
    perform public.assert_admin();

    select * into v_player from public.players where id = p_id;
    if not found then
        raise exception 'El jugador ya no existe.';
    end if;

    delete from public.players where id = p_id;

    update public.players
    set rango_actual   = rango_actual - 1,
        rango_anterior = case
                             when rango_anterior > v_player.rango_actual then rango_anterior - 1
                             else rango_anterior end
    where rango_actual > v_player.rango_actual;

    insert into public.ranking_history (texto)
    values (format('%s fue removido del ranking.', v_player.nombre));

    perform public.log_action('jugador_eliminado', 'players', p_id,
                              jsonb_build_object('nombre', v_player.nombre,
                                                 'puesto', v_player.rango_actual));
end;
$$;


create or replace function public.reorder_player(p_id uuid, p_nuevo_rango integer)
    returns void
    language plpgsql
    security definer
    set search_path = ''
as
$$
declare
    v_player public.players;
    v_total  integer;
begin
    perform public.assert_admin();

    select * into v_player from public.players where id = p_id;
    if not found then
        raise exception 'El jugador ya no existe.';
    end if;

    select count(*) into v_total from public.players;
    if p_nuevo_rango < 1 or p_nuevo_rango > v_total then
        raise exception 'El puesto #% está fuera del ranking.', p_nuevo_rango;
    end if;
    if p_nuevo_rango = v_player.rango_actual then
        return;
    end if;

    if p_nuevo_rango < v_player.rango_actual then
        update public.players
        set rango_anterior = rango_actual,
            rango_actual   = rango_actual + 1
        where rango_actual >= p_nuevo_rango
          and rango_actual < v_player.rango_actual;
    else
        update public.players
        set rango_anterior = rango_actual,
            rango_actual   = rango_actual - 1
        where rango_actual > v_player.rango_actual
          and rango_actual <= p_nuevo_rango;
    end if;

    update public.players
    set rango_anterior = v_player.rango_actual,
        rango_actual   = p_nuevo_rango
    where id = p_id;

    insert into public.ranking_history (texto)
    values (format('%s fue movido del puesto #%s al puesto #%s manualmente.',
                   v_player.nombre, v_player.rango_actual, p_nuevo_rango));

    perform public.log_action('jugador_movido', 'players', p_id,
                              jsonb_build_object('nombre', v_player.nombre,
                                                 'desde', v_player.rango_actual,
                                                 'hasta', p_nuevo_rango));
end;
$$;


create or replace function public.set_player_email(p_id uuid, p_email text)
    returns public.players
    language plpgsql
    security definer
    set search_path = ''
as
$$
declare
    v_anterior text;
    v_player   public.players;
begin
    perform public.assert_admin();

    select email into v_anterior from public.players where id = p_id;

    update public.players
    set email = nullif(trim(p_email), '')
    where id = p_id
    returning * into v_player;

    if not found then
        raise exception 'El jugador ya no existe.';
    end if;

    perform public.log_action('correo_actualizado', 'players', p_id,
                              jsonb_build_object('nombre', v_player.nombre,
                                                 'anterior', v_anterior,
                                                 'nuevo', v_player.email));

    return v_player;
exception
    when check_violation then raise exception 'El correo "%" no tiene un formato válido.', p_email;
end;
$$;


-- 5. RETOS -----------------------------------------------------------------------
create or replace function public.create_challenge(p_retador_id uuid, p_retado_id uuid)
    returns public.challenges
    language plpgsql
    security definer
    set search_path = ''
as
$$
declare
    v_retador   public.players;
    v_retado    public.players;
    v_challenge public.challenges;
    v_limite    text;
begin
    perform public.assert_admin();
    perform public.expire_stale_challenges();

    if p_retador_id = p_retado_id then
        raise exception 'Selecciona un retador y un retado diferentes.';
    end if;

    select * into v_retador from public.players where id = p_retador_id;
    if not found then
        raise exception 'El retador ya no existe.';
    end if;
    select * into v_retado from public.players where id = p_retado_id;
    if not found then
        raise exception 'El retado ya no existe.';
    end if;

    if v_retador.rango_actual <> v_retado.rango_actual + 1 then
        raise exception 'Regla de Escalera: Solo puedes retar al jugador que está exactamente una posición por encima de ti (Puesto #%).',
            v_retador.rango_actual - 1;
    end if;

    if coalesce(v_retador.cooldown_hasta, '-infinity'::timestamptz) > now()
        or coalesce(v_retado.cooldown_hasta, '-infinity'::timestamptz) > now() then
        raise exception 'Uno de los jugadores está en su periodo de enfriamiento (victorioso recientemente).';
    end if;

    if exists (select 1
               from public.challenges
               where expira_en > now()
                 and (retador_id in (p_retador_id, p_retado_id)
                   or retado_id in (p_retador_id, p_retado_id))) then
        raise exception 'Uno de los jugadores ya tiene un reto vigente.';
    end if;

    insert into public.challenges (retador_id, retado_id, expira_en)
    values (p_retador_id, p_retado_id, now() + public.ranking_cooldown())
    returning * into v_challenge;

    v_limite := to_char(v_challenge.expira_en, 'DD/MM/YYYY');

    perform public.enqueue_notification(
            v_retador,
            format('Lanzaste un reto contra %s', v_retado.nombre),
            format(E'Hola %s,\n\nLanzaste un reto contra %s (puesto #%s).\nTienen hasta el %s para jugarlo.\n\nPuello Academy',
                   v_retador.nombre, v_retado.nombre, v_retado.rango_actual, v_limite));

    perform public.enqueue_notification(
            v_retado,
            format('%s te ha retado', v_retador.nombre),
            format(E'Hola %s,\n\n%s (puesto #%s) te retó por tu puesto #%s.\nTienen hasta el %s para jugarlo.\n\nPuello Academy',
                   v_retado.nombre, v_retador.nombre, v_retador.rango_actual, v_retado.rango_actual, v_limite));

    perform public.log_action('reto_lanzado', 'challenges', v_challenge.id,
                              jsonb_build_object('retador', v_retador.nombre,
                                                 'retado', v_retado.nombre,
                                                 'expira', v_limite));

    return v_challenge;
end;
$$;


create or replace function public.resolve_challenge(p_challenge_id uuid, p_ganador_id uuid)
    returns void
    language plpgsql
    security definer
    set search_path = ''
as
$$
declare
    v_challenge      public.challenges;
    v_perdedor_id    uuid;
    v_ganador        public.players;
    v_perdedor       public.players;
    v_ganador_final  public.players;
    v_perdedor_final public.players;
begin
    perform public.assert_admin();

    select * into v_challenge from public.challenges where id = p_challenge_id;
    if not found then
        raise exception 'El reto ya no existe.';
    end if;
    if p_ganador_id not in (v_challenge.retador_id, v_challenge.retado_id) then
        raise exception 'El ganador debe ser uno de los dos jugadores del reto.';
    end if;

    v_perdedor_id := case
                         when p_ganador_id = v_challenge.retador_id then v_challenge.retado_id
                         else v_challenge.retador_id end;

    select * into v_ganador from public.players where id = p_ganador_id;
    select * into v_perdedor from public.players where id = v_perdedor_id;

    if v_ganador.rango_actual > v_perdedor.rango_actual then
        update public.players
        set rango_anterior = rango_actual,
            rango_actual   = rango_actual + 1
        where rango_actual >= v_perdedor.rango_actual
          and rango_actual < v_ganador.rango_actual;

        update public.players
        set rango_anterior = v_ganador.rango_actual,
            rango_actual   = v_perdedor.rango_actual
        where id = v_ganador.id;
    end if;

    update public.players
    set cooldown_hasta = now() + public.ranking_cooldown()
    where id = v_ganador.id;

    update public.players
    set cooldown_hasta = null
    where id = v_perdedor_id;

    delete from public.challenges where id = p_challenge_id;

    insert into public.ranking_history (texto)
    values (format('%s derrotó a %s', v_ganador.nombre, v_perdedor.nombre));

    select * into v_ganador_final from public.players where id = p_ganador_id;
    select * into v_perdedor_final from public.players where id = v_perdedor_id;

    perform public.enqueue_notification(
            v_ganador_final,
            format('Ganaste tu reto contra %s', v_perdedor_final.nombre),
            format(E'Felicidades %s,\n\nDerrotaste a %s.\nTu puesto ahora es el #%s y tienes 7 días de inmunidad.\n\nPuello Academy',
                   v_ganador_final.nombre, v_perdedor_final.nombre, v_ganador_final.rango_actual));

    perform public.enqueue_notification(
            v_perdedor_final,
            format('Resultado de tu reto contra %s', v_ganador_final.nombre),
            format(E'Hola %s,\n\n%s ganó el reto.\nTu puesto actual es el #%s.\n\nPuello Academy',
                   v_perdedor_final.nombre, v_ganador_final.nombre, v_perdedor_final.rango_actual));

    perform public.log_action('reto_resuelto', 'challenges', p_challenge_id,
                              jsonb_build_object('ganador', v_ganador_final.nombre,
                                                 'perdedor', v_perdedor_final.nombre,
                                                 'puesto_ganador', v_ganador_final.rango_actual,
                                                 'puesto_perdedor', v_perdedor_final.rango_actual));
end;
$$;


create or replace function public.cancel_challenge(p_challenge_id uuid)
    returns void
    language plpgsql
    security definer
    set search_path = ''
as
$$
declare
    v_retador text;
    v_retado  text;
begin
    perform public.assert_admin();

    select retador.nombre, retado.nombre
    into v_retador, v_retado
    from public.challenges c
             join public.players retador on retador.id = c.retador_id
             join public.players retado on retado.id = c.retado_id
    where c.id = p_challenge_id;

    delete from public.challenges where id = p_challenge_id;

    perform public.log_action('reto_cancelado', 'challenges', p_challenge_id,
                              jsonb_build_object('retador', v_retador, 'retado', v_retado));
end;
$$;


create or replace function public.expire_stale_challenges()
    returns integer
    language plpgsql
    security definer
    set search_path = ''
as
$$
declare
    v_reto  record;
    v_total integer := 0;
begin
    for v_reto in
        select c.id, retador.nombre as retador_nombre, retado.nombre as retado_nombre
        from public.challenges c
                 join public.players retador on retador.id = c.retador_id
                 join public.players retado on retado.id = c.retado_id
        where c.expira_en < now()
        loop
            delete from public.challenges where id = v_reto.id;

            insert into public.ranking_history (texto)
            values (format('El reto entre %s y %s expiró sin jugarse.',
                           v_reto.retador_nombre, v_reto.retado_nombre));

            perform public.log_action('reto_expirado', 'challenges', v_reto.id,
                                      jsonb_build_object('retador', v_reto.retador_nombre,
                                                         'retado', v_reto.retado_nombre));

            v_total := v_total + 1;
        end loop;

    return v_total;
end;
$$;

revoke execute on function public.expire_stale_challenges() from public, anon;
grant execute on function public.expire_stale_challenges() to authenticated;


-- 6. RANKING COMPLETO ------------------------------------------------------------
create or replace function public.reset_ranking()
    returns void
    language plpgsql
    security definer
    set search_path = ''
as
$$
declare
    v_nombres text[] := array [
        'VALAK','EDGON','YEYÉ','BRITO','MITCH','SABROSO HD','RIKAR','SIGAL','KINGNALDO','BELI',
        'TOXIN','CAMILO','NAMELESS','STANDMAKAROV','EFETE','SOMBRA','YOJOSAN','KANDELO','MOKANO','BLEYNOR',
        'FORTY','PELCHA','KINJA','KINKON','PIOLÍN','JHOEL','XEROX','NELSON V','TEMPEST','DIRETOL ZANGIEF',
        'BEUZWOLF','RONALD SNOOKY','WILMIX','GOUKISHI','ODIN','ENMA F'
        ];
    v_antes   integer;
begin
    perform public.assert_admin();

    select count(*) into v_antes from public.players;

    delete from public.challenges;
    delete from public.ranking_history;
    delete from public.players;

    insert into public.players (nombre, rango_actual, rango_anterior)
    select nombre, posicion::integer, posicion::integer
    from unnest(v_nombres) with ordinality as t(nombre, posicion);

    insert into public.ranking_history (texto)
    values ('El ranking fue reiniciado a la lista original de la academia.');

    perform public.log_action('ranking_reiniciado', 'players', null,
                              jsonb_build_object('jugadores_antes', v_antes,
                                                 'jugadores_despues', array_length(v_nombres, 1)));
end;
$$;


-- 7. AJUSTES Y ROLES -------------------------------------------------------------
create or replace function public.set_setting(p_key text, p_enabled boolean)
    returns public.app_settings
    language plpgsql
    security definer
    set search_path = ''
as
$$
declare
    v_setting public.app_settings;
begin
    perform public.assert_admin();

    update public.app_settings
    set enabled    = p_enabled,
        updated_at = now(),
        updated_by = (select auth.uid())
    where key = p_key
    returning * into v_setting;

    if not found then
        raise exception 'El ajuste "%" no existe.', p_key;
    end if;

    perform public.log_action('ajuste_cambiado', 'app_settings', null,
                              jsonb_build_object('ajuste', p_key, 'activado', p_enabled));

    return v_setting;
end;
$$;


create or replace function public.set_profile_role(p_id uuid, p_role text)
    returns public.profiles
    language plpgsql
    security definer
    set search_path = ''
as
$$
declare
    v_anterior text;
    v_profile  public.profiles;
begin
    perform public.assert_admin();

    if p_role not in ('admin', 'member') then
        raise exception 'Rol inválido: debe ser admin o member.';
    end if;
    if p_id = (select auth.uid()) then
        raise exception 'No puedes cambiar tu propio rol.';
    end if;

    select role into v_anterior from public.profiles where id = p_id;

    update public.profiles
    set role = p_role
    where id = p_id
    returning * into v_profile;

    if not found then
        raise exception 'El usuario ya no existe.';
    end if;

    perform public.log_action('rol_cambiado', 'profiles', p_id,
                              jsonb_build_object('usuario', coalesce(v_profile.full_name, v_profile.email),
                                                 'anterior', v_anterior, 'nuevo', p_role));

    return v_profile;
end;
$$;


-- 8. LIMPIEZA DE LA BITÁCORA -----------------------------------------------------
create or replace function public.purge_audit_log(p_dias integer default 180)
    returns integer
    language plpgsql
    security definer
    set search_path = ''
as
$$
declare
    v_borradas integer;
begin
    perform public.assert_admin();

    delete from public.audit_log where created_at < now() - make_interval(days => p_dias);
    get diagnostics v_borradas = row_count;

    perform public.log_action('bitacora_purgada', 'audit_log', null,
                              jsonb_build_object('dias', p_dias, 'borradas', v_borradas));

    return v_borradas;
end;
$$;
