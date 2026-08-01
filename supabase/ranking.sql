-- =============================================================================
-- Puello Academy - Tablas del ranking, retos e historial
-- Ejecutar en Supabase > SQL Editor DESPUÉS de schema.sql (usa public.is_admin()).
-- =============================================================================
-- Diseño:
--   * Las tablas sólo se pueden LEER directamente (RLS). No hay políticas de
--     insert/update/delete: toda escritura pasa por las funciones de más abajo.
--   * Las funciones son security definer y empiezan verificando que quien llama
--     sea admin, así que las reglas del ranking (escalera, enfriamiento, corrimiento
--     de puestos) se cumplen en el servidor y no dependen de la interfaz.
--   * Cada función es atómica: si algo falla, no queda el ranking a medias.
-- =============================================================================


-- 1. TABLAS ---------------------------------------------------------------------
create table if not exists public.players
(
    id             uuid primary key     default gen_random_uuid(),
    nombre         text        not null,
    rango_actual   integer     not null,
    rango_anterior integer     not null,
    cooldown_hasta timestamptz,
    created_at     timestamptz not null default now(),
    updated_at     timestamptz not null default now(),
    constraint players_nombre_key unique (nombre),
    constraint players_rango_positivo check (rango_actual > 0),
    -- Diferida: al correr puestos, un UPDATE masivo pasa por estados duplicados
    -- de forma transitoria y sólo debe validarse al final de la transacción.
    constraint players_rango_actual_key unique (rango_actual) deferrable initially deferred
);

create table if not exists public.challenges
(
    id         uuid primary key     default gen_random_uuid(),
    retador_id uuid        not null references public.players (id) on delete cascade,
    retado_id  uuid        not null references public.players (id) on delete cascade,
    expira_en  timestamptz not null,
    created_at timestamptz not null default now(),
    constraint challenges_jugadores_distintos check (retador_id <> retado_id)
);

create index if not exists challenges_retador_idx on public.challenges (retador_id);
create index if not exists challenges_retado_idx on public.challenges (retado_id);

create table if not exists public.ranking_history
(
    id         uuid primary key     default gen_random_uuid(),
    texto      text        not null,
    created_at timestamptz not null default now()
);

create index if not exists ranking_history_created_at_idx
    on public.ranking_history (created_at desc);

drop trigger if exists players_set_updated_at on public.players;
create trigger players_set_updated_at
    before update
    on public.players
    for each row
execute function public.set_updated_at();


-- 2. ROW LEVEL SECURITY: LECTURA PARA TODOS, ESCRITURA SÓLO POR FUNCIONES --------
alter table public.players enable row level security;
alter table public.challenges enable row level security;
alter table public.ranking_history enable row level security;

drop policy if exists players_select on public.players;
create policy players_select on public.players
    for select to authenticated using (true);

drop policy if exists challenges_select on public.challenges;
create policy challenges_select on public.challenges
    for select to authenticated using (true);

drop policy if exists ranking_history_select on public.ranking_history;
create policy ranking_history_select on public.ranking_history
    for select to authenticated using (true);


-- 3. HELPERS --------------------------------------------------------------------
create or replace function public.assert_admin()
    returns void
    language plpgsql
    security definer
    set search_path = ''
as
$$
begin
    if not public.is_admin() then
        raise exception 'Sólo un administrador puede modificar el ranking.'
            using errcode = '42501';
    end if;
end;
$$;

-- Días de inmunidad del ganador y duración de un reto.
create or replace function public.ranking_cooldown()
    returns interval
    language sql
    immutable
as
$$
select interval '7 days';
$$;


-- 4. AGREGAR JUGADOR ------------------------------------------------------------
create or replace function public.add_player(p_nombre text)
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

    insert into public.players (nombre, rango_actual, rango_anterior)
    values (v_nombre, v_rango, v_rango)
    returning * into v_player;

    insert into public.ranking_history (texto)
    values (format('Nuevo retador ingresó: %s en el puesto #%s', v_nombre, v_rango));

    return v_player;
end;
$$;


-- 5. ELIMINAR JUGADOR -----------------------------------------------------------
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

    -- Los retos del jugador se borran en cascada.
    delete from public.players where id = p_id;

    update public.players
    set rango_actual   = rango_actual - 1,
        rango_anterior = case
                             when rango_anterior > v_player.rango_actual then rango_anterior - 1
                             else rango_anterior end
    where rango_actual > v_player.rango_actual;

    insert into public.ranking_history (texto)
    values (format('%s fue removido del ranking.', v_player.nombre));
end;
$$;


-- 6. LANZAR RETO ----------------------------------------------------------------
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

    return v_challenge;
end;
$$;


-- 7. RESOLVER RETO --------------------------------------------------------------
create or replace function public.resolve_challenge(p_challenge_id uuid, p_ganador_id uuid)
    returns void
    language plpgsql
    security definer
    set search_path = ''
as
$$
declare
    v_challenge   public.challenges;
    v_perdedor_id uuid;
    v_ganador     public.players;
    v_perdedor    public.players;
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
end;
$$;


-- 8. CANCELAR RETO --------------------------------------------------------------
create or replace function public.cancel_challenge(p_challenge_id uuid)
    returns void
    language plpgsql
    security definer
    set search_path = ''
as
$$
begin
    perform public.assert_admin();
    delete from public.challenges where id = p_challenge_id;
end;
$$;


-- 9. MOVER JUGADOR DE PUESTO (arrastrar y soltar) --------------------------------
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
        -- Sube: los que estaban entre el destino y su puesto bajan uno.
        update public.players
        set rango_anterior = rango_actual,
            rango_actual   = rango_actual + 1
        where rango_actual >= p_nuevo_rango
          and rango_actual < v_player.rango_actual;
    else
        -- Baja: los que estaban debajo hasta el destino suben uno.
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
end;
$$;


-- 10. REINICIAR TODO ------------------------------------------------------------
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
        'TOXIN','CAMILO','NAMELESS','STANMAKAROV','EFETE','SOMBRA','YOJOSAN','KANDELO','MOKANO','BLEYNOR',
        'FORTY','PELCHA','KINJA','KINKON','PIOLÍN','JHOEL','XEROX','NELSON V','TEMPEST','DIRETOL ZANGIEF',
        'BEUZWOLF','RONALD SNOOKY','WILMIX','GOUKISHI','ODIN','ENMA F'
        ];
begin
    perform public.assert_admin();

    delete from public.challenges;
    delete from public.ranking_history;
    delete from public.players;

    insert into public.players (nombre, rango_actual, rango_anterior)
    select nombre, posicion::integer, posicion::integer
    from unnest(v_nombres) with ordinality as t(nombre, posicion);

    insert into public.ranking_history (texto)
    values ('El ranking fue reiniciado a la lista original de la academia.');
end;
$$;


-- 11. SINCRONIZACIÓN EN VIVO (Realtime) -----------------------------------------
-- Permite que el ranking se actualice solo en todos los dispositivos abiertos.
do
$$
    begin
        alter publication supabase_realtime add table public.players;
    exception
        when duplicate_object then null;
    end;
$$;
do
$$
    begin
        alter publication supabase_realtime add table public.challenges;
    exception
        when duplicate_object then null;
    end;
$$;
do
$$
    begin
        alter publication supabase_realtime add table public.ranking_history;
    exception
        when duplicate_object then null;
    end;
$$;


-- 12. CARGA INICIAL -------------------------------------------------------------
-- Siembra la lista original sólo si la tabla está vacía (no pisa datos existentes).
insert into public.players (nombre, rango_actual, rango_anterior)
select nombre, posicion::integer, posicion::integer
from unnest(array [
    'VALAK','EDGON','YEYÉ','BRITO','MITCH','SABROSO HD','RIKAR','SIGAL','KINGNALDO','BELI',
    'TOXIN','CAMILO','NAMELESS','STANMAKAROV','EFETE','SOMBRA','YOJOSAN','KANDELO','MOKANO','BLEYNOR',
    'FORTY','PELCHA','KINJA','KINKON','PIOLÍN','JHOEL','XEROX','NELSON V','TEMPEST','DIRETOL ZANGIEF',
    'BEUZWOLF','RONALD SNOOKY','WILMIX','GOUKISHI','ODIN','ENMA F'
    ]) with ordinality as t(nombre, posicion)
where not exists (select 1 from public.players);
