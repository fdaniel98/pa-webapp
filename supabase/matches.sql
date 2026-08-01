-- =============================================================================
-- Puello Academy - Historial de enfrentamientos y reporte de resultados
-- Ejecutar en Supabase > SQL Editor DESPUÉS de audit.sql
-- =============================================================================
-- Hasta ahora un reto resuelto sólo dejaba una línea de texto en ranking_history,
-- que no se puede filtrar ni contar. public.matches guarda cada enfrentamiento
-- como fila estructurada: quién ganó, con qué marcador y cómo se movió el ranking.
--
-- Los nombres se guardan además como texto: si más adelante se elimina un
-- jugador, su historial sigue siendo legible (las FK quedan en null).
-- =============================================================================

-- 1. TABLA -----------------------------------------------------------------------
create table if not exists public.matches
(
    id                      uuid primary key     default gen_random_uuid(),
    challenge_id            uuid,
    ganador_id              uuid references public.players (id) on delete set null,
    perdedor_id             uuid references public.players (id) on delete set null,
    ganador_nombre          text        not null,
    perdedor_nombre         text        not null,
    -- Marcador SF6 (games ganados por cada lado). Opcional: un reto puede
    -- resolverse sin registrar el marcador.
    sets_ganador            integer,
    sets_perdedor           integer,
    puesto_ganador_antes    integer     not null,
    puesto_ganador_despues  integer     not null,
    puesto_perdedor_antes   integer     not null,
    puesto_perdedor_despues integer     not null,
    notas                   text,
    reportado_por           uuid references auth.users (id) on delete set null,
    reportado_por_nombre    text,
    created_at              timestamptz not null default now(),
    constraint matches_marcador_coherente check (
        (sets_ganador is null and sets_perdedor is null)
            or (sets_ganador >= 0 and sets_perdedor >= 0 and sets_ganador > sets_perdedor)
        )
);

create index if not exists matches_created_at_idx on public.matches (created_at desc);
create index if not exists matches_ganador_idx on public.matches (ganador_id);
create index if not exists matches_perdedor_idx on public.matches (perdedor_id);

alter table public.matches
    enable row level security;

-- Todos los miembros pueden consultar el historial; sólo se escribe por función.
drop policy if exists matches_select on public.matches;
create policy matches_select on public.matches
    for select to authenticated using (true);


-- 2. RESOLVER RETO CON MARCADOR ---------------------------------------------------
-- Se elimina la versión de dos argumentos para no dejar sobrecargas ambiguas.
drop function if exists public.resolve_challenge(uuid, uuid);

create or replace function public.resolve_challenge(
    p_challenge_id uuid,
    p_ganador_id uuid,
    p_sets_ganador integer default null,
    p_sets_perdedor integer default null,
    p_notas text default null
)
    returns public.matches
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
    v_actor          text;
    v_match          public.matches;
    v_marcador       text;
begin
    perform public.assert_admin();

    select * into v_challenge from public.challenges where id = p_challenge_id;
    if not found then
        raise exception 'El reto ya no existe.';
    end if;
    if p_ganador_id not in (v_challenge.retador_id, v_challenge.retado_id) then
        raise exception 'El ganador debe ser uno de los dos jugadores del reto.';
    end if;

    -- El marcador es opcional, pero si se registra debe ser coherente.
    if (p_sets_ganador is null) <> (p_sets_perdedor is null) then
        raise exception 'Registra los dos marcadores o ninguno.';
    end if;
    if p_sets_ganador is not null then
        if p_sets_ganador < 0 or p_sets_perdedor < 0 then
            raise exception 'El marcador no puede ser negativo.';
        end if;
        if p_sets_ganador <= p_sets_perdedor then
            raise exception 'El ganador debe tener más games que el perdedor (%-%).',
                p_sets_ganador, p_sets_perdedor;
        end if;
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

    select * into v_ganador_final from public.players where id = p_ganador_id;
    select * into v_perdedor_final from public.players where id = v_perdedor_id;

    v_marcador := case
                      when p_sets_ganador is null then ''
                      else format(' (%s-%s)', p_sets_ganador, p_sets_perdedor) end;

    insert into public.ranking_history (texto)
    values (format('%s derrotó a %s%s', v_ganador.nombre, v_perdedor.nombre, v_marcador));

    select coalesce(full_name, email) into v_actor
    from public.profiles
    where id = (select auth.uid());

    insert into public.matches (challenge_id, ganador_id, perdedor_id,
                                ganador_nombre, perdedor_nombre,
                                sets_ganador, sets_perdedor,
                                puesto_ganador_antes, puesto_ganador_despues,
                                puesto_perdedor_antes, puesto_perdedor_despues,
                                notas, reportado_por, reportado_por_nombre)
    values (p_challenge_id, p_ganador_id, v_perdedor_id,
            v_ganador.nombre, v_perdedor.nombre,
            p_sets_ganador, p_sets_perdedor,
            v_ganador.rango_actual, v_ganador_final.rango_actual,
            v_perdedor.rango_actual, v_perdedor_final.rango_actual,
            nullif(trim(p_notas), ''), (select auth.uid()), v_actor)
    returning * into v_match;

    perform public.enqueue_notification(
            v_ganador_final,
            format('Ganaste tu reto contra %s', v_perdedor_final.nombre),
            format(E'Felicidades %s,\n\nDerrotaste a %s%s.\nTu puesto ahora es el #%s y tienes 7 días de inmunidad.\n\nPuello Academy',
                   v_ganador_final.nombre, v_perdedor_final.nombre, v_marcador,
                   v_ganador_final.rango_actual));

    perform public.enqueue_notification(
            v_perdedor_final,
            format('Resultado de tu reto contra %s', v_ganador_final.nombre),
            format(E'Hola %s,\n\n%s ganó el reto%s.\nTu puesto actual es el #%s.\n\nPuello Academy',
                   v_perdedor_final.nombre, v_ganador_final.nombre, v_marcador,
                   v_perdedor_final.rango_actual));

    perform public.log_action('reto_resuelto', 'matches', v_match.id,
                              jsonb_build_object('ganador', v_ganador.nombre,
                                                 'perdedor', v_perdedor.nombre,
                                                 'marcador', case
                                                                 when p_sets_ganador is null then 'sin registrar'
                                                                 else format('%s-%s', p_sets_ganador, p_sets_perdedor) end,
                                                 'puesto_ganador', v_ganador_final.rango_actual,
                                                 'puesto_perdedor', v_perdedor_final.rango_actual));

    return v_match;
end;
$$;


-- 3. RÉCORD DE UN JUGADOR ---------------------------------------------------------
-- Se cuenta en el servidor para que el récord no dependa de cuántas filas se
-- hayan paginado en pantalla.
create or replace function public.player_record(p_player_id uuid)
    returns jsonb
    language sql
    stable
    security definer
    set search_path = ''
as
$$
select jsonb_build_object(
               'victorias', count(*) filter (where ganador_id = p_player_id),
               'derrotas', count(*) filter (where perdedor_id = p_player_id),
               'jugados', count(*),
               'games_a_favor', coalesce(sum(case
                                                 when ganador_id = p_player_id then sets_ganador
                                                 else sets_perdedor end), 0),
               'games_en_contra', coalesce(sum(case
                                                   when ganador_id = p_player_id then sets_perdedor
                                                   else sets_ganador end), 0)
       )
from public.matches
where ganador_id = p_player_id
   or perdedor_id = p_player_id;
$$;

revoke execute on function public.player_record(uuid) from public, anon;
grant execute on function public.player_record(uuid) to authenticated;


-- 4. CORREGIR EL MARCADOR DE UN ENFRENTAMIENTO ------------------------------------
-- Sólo toca el marcador y las notas: el ranking ya se movió y no se recalcula.
create or replace function public.update_match_score(
    p_match_id uuid,
    p_sets_ganador integer,
    p_sets_perdedor integer,
    p_notas text default null
)
    returns public.matches
    language plpgsql
    security definer
    set search_path = ''
as
$$
declare
    v_match public.matches;
begin
    perform public.assert_admin();

    if (p_sets_ganador is null) <> (p_sets_perdedor is null) then
        raise exception 'Registra los dos marcadores o ninguno.';
    end if;
    if p_sets_ganador is not null and p_sets_ganador <= p_sets_perdedor then
        raise exception 'El ganador debe tener más games que el perdedor (%-%).',
            p_sets_ganador, p_sets_perdedor;
    end if;

    update public.matches
    set sets_ganador  = p_sets_ganador,
        sets_perdedor = p_sets_perdedor,
        notas         = coalesce(nullif(trim(p_notas), ''), notas)
    where id = p_match_id
    returning * into v_match;

    if not found then
        raise exception 'El enfrentamiento ya no existe.';
    end if;

    perform public.log_action('marcador_corregido', 'matches', p_match_id,
                              jsonb_build_object('ganador', v_match.ganador_nombre,
                                                 'perdedor', v_match.perdedor_nombre,
                                                 'marcador', format('%s-%s', p_sets_ganador, p_sets_perdedor)));

    return v_match;
end;
$$;


-- 5. SINCRONIZACIÓN EN VIVO --------------------------------------------------------
do
$$
    begin
        alter publication supabase_realtime add table public.matches;
    exception
        when duplicate_object then null;
    end;
$$;
