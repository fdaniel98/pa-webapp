-- =============================================================================
-- Puello Academy - Correcciones y funciones faltantes
-- Ejecutar en Supabase > SQL Editor DESPUÉS de settings.sql
-- =============================================================================
-- 1. Caducidad real de los retos. Hasta ahora expira_en sólo se pintaba en
--    pantalla: un reto vencido seguía bloqueando a ambos jugadores para siempre
--    y el panel mostraba "Expira en: -3 días".
-- 2. Cambio de rol desde la app, sin poder degradarte a ti mismo.
-- =============================================================================


-- 1. CADUCAR RETOS VENCIDOS ------------------------------------------------------
-- No lleva assert_admin: es limpieza determinista que sólo borra retos que ya
-- vencieron, y conviene que ocurra aunque quien abra la app sea un miembro.
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

            v_total := v_total + 1;
        end loop;

    return v_total;
end;
$$;

-- Por defecto PUBLIC puede ejecutar cualquier función: aquí se limita a usuarios
-- con sesión, para que nadie sin autenticar provoque escrituras.
revoke execute on function public.expire_stale_challenges() from public, anon;
grant execute on function public.expire_stale_challenges() to authenticated;


-- 2. LANZAR RETO (ahora ignora los vencidos al validar) ---------------------------
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

    -- Limpia primero: un reto vencido ya no debe bloquear a nadie.
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

    return v_challenge;
end;
$$;


-- 3. CAMBIAR EL ROL DE UN USUARIO -------------------------------------------------
-- Se hace por función y no por UPDATE directo para poder impedir que un admin se
-- quite el rol a sí mismo y deje la academia sin administradores.
create or replace function public.set_profile_role(p_id uuid, p_role text)
    returns public.profiles
    language plpgsql
    security definer
    set search_path = ''
as
$$
declare
    v_profile public.profiles;
begin
    perform public.assert_admin();

    if p_role not in ('admin', 'member') then
        raise exception 'Rol inválido: debe ser admin o member.';
    end if;

    if p_id = (select auth.uid()) then
        raise exception 'No puedes cambiar tu propio rol.';
    end if;

    update public.profiles
    set role = p_role
    where id = p_id
    returning * into v_profile;

    if not found then
        raise exception 'El usuario ya no existe.';
    end if;

    return v_profile;
end;
$$;
