-- =============================================================================
-- Puello Academy - Correo de los jugadores y notificaciones por email
-- Ejecutar en Supabase > SQL Editor DESPUÉS de schema.sql y ranking.sql
-- =============================================================================
-- Diseño (bandeja de salida / outbox):
--   * Las funciones del ranking NO envían correos: encolan filas en
--     public.notifications dentro de la MISMA transacción que el cambio.
--     Si el reto se guarda, la notificación queda encolada; si algo falla, no
--     queda ni lo uno ni lo otro.
--   * La Edge Function `send-notifications` vacía la bandeja y marca cada fila
--     como enviada o con error, así que un fallo de la API de correo se puede
--     reintentar sin duplicar mensajes ya enviados.
--   * El cliente nunca decide destinatarios: sólo pide "envía lo pendiente".
-- =============================================================================


-- 1. CORREO DEL JUGADOR ---------------------------------------------------------
alter table public.players
    add column if not exists email text;

do
$do$
    begin
        alter table public.players
            add constraint players_email_formato
                check (email is null or email ~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$');
    exception
        when duplicate_object then null;
    end
$do$;

comment on column public.players.email is 'Correo para avisos de retos. Opcional: sin correo, no se notifica.';


-- 2. BANDEJA DE SALIDA ----------------------------------------------------------
create table if not exists public.notifications
(
    id         uuid primary key     default gen_random_uuid(),
    player_id  uuid references public.players (id) on delete set null,
    email      text        not null,
    asunto     text        not null,
    cuerpo     text        not null,
    estado     text        not null default 'pendiente'
        check (estado in ('pendiente', 'enviada', 'error')),
    error      text,
    intentos   integer     not null default 0,
    created_at timestamptz not null default now(),
    sent_at    timestamptz
);

create index if not exists notifications_pendientes_idx
    on public.notifications (created_at)
    where estado = 'pendiente';

alter table public.notifications enable row level security;

-- Sólo los admins pueden revisar la bandeja; nadie escribe directamente en ella.
drop policy if exists notifications_select_admin on public.notifications;
create policy notifications_select_admin on public.notifications
    for select to authenticated using (public.is_admin());


-- 3. ENCOLAR UNA NOTIFICACIÓN ----------------------------------------------------
create or replace function public.enqueue_notification(
    p_player public.players,
    p_asunto text,
    p_cuerpo text
)
    returns void
    language plpgsql
    security definer
    set search_path = ''
as
$$
begin
    -- Sin correo registrado simplemente no se notifica; no es un error.
    if p_player.email is null or trim(p_player.email) = '' then
        return;
    end if;

    insert into public.notifications (player_id, email, asunto, cuerpo)
    values (p_player.id, p_player.email, p_asunto, p_cuerpo);
end;
$$;


-- 4. ASIGNAR / ACTUALIZAR EL CORREO DE UN JUGADOR --------------------------------
create or replace function public.set_player_email(p_id uuid, p_email text)
    returns public.players
    language plpgsql
    security definer
    set search_path = ''
as
$$
declare
    v_player public.players;
begin
    perform public.assert_admin();

    update public.players
    set email = nullif(trim(p_email), '')
    where id = p_id
    returning * into v_player;

    if not found then
        raise exception 'El jugador ya no existe.';
    end if;

    return v_player;
exception
    when check_violation then raise exception 'El correo "%" no tiene un formato válido.', p_email;
end;
$$;


-- 5. AGREGAR JUGADOR (ahora acepta correo) ---------------------------------------
-- Se elimina la versión de un solo argumento para que no queden dos sobrecargas
-- ambiguas de add_player.
drop function if exists public.add_player(text);

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

    return v_player;
exception
    when check_violation then raise exception 'El correo "%" no tiene un formato válido.', p_email;
end;
$$;


-- 6. LANZAR RETO + AVISO A LOS DOS JUGADORES -------------------------------------
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

    -- Regla de escalera: sólo se reta al puesto inmediatamente superior.
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
               where retador_id in (p_retador_id, p_retado_id)
                  or retado_id in (p_retador_id, p_retado_id)) then
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

    return v_challenge;
end;
$$;


-- 7. RESOLVER RETO + AVISO DEL RESULTADO -----------------------------------------
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

    -- Sólo hay corrimiento si ganó el de abajo (número de puesto mayor).
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

    -- Se releen para notificar con los puestos ya actualizados.
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
end;
$$;


-- 8. LIMPIEZA DE LA BANDEJA (opcional, para no acumular histórico) ---------------
create or replace function public.purge_sent_notifications(p_dias integer default 30)
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

    delete
    from public.notifications
    where estado = 'enviada'
      and sent_at < now() - make_interval(days => p_dias);

    get diagnostics v_borradas = row_count;
    return v_borradas;
end;
$$;
