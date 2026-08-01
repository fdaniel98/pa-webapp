-- =============================================================================
-- Puello Academy - Retos expirados y su motivo
-- Ejecutar en Supabase > SQL Editor DESPUÉS de matches.sql
-- =============================================================================
-- Hasta ahora un reto que vencía (o que un admin cancelaba) se borraba y sólo
-- dejaba una línea de texto en ranking_history, así que no había ninguna fila a
-- la que volver para explicar POR QUÉ no se jugó.
--
-- public.expired_challenges archiva cada reto cerrado sin jugarse y guarda un
-- `motivo` opcional que se puede escribir después, cuando ya se sabe la razón.
-- Igual que en matches, los nombres se guardan además como texto: si más
-- adelante se elimina un jugador, el archivo sigue siendo legible.
-- =============================================================================


-- 1. TABLA -----------------------------------------------------------------------
create table if not exists public.expired_challenges
(
    id                uuid primary key     default gen_random_uuid(),
    -- El reto original ya no existe: se guarda su id sólo para poder cruzarlo
    -- con la bitácora, por eso no lleva FK.
    challenge_id      uuid,
    retador_id        uuid references public.players (id) on delete set null,
    retado_id         uuid references public.players (id) on delete set null,
    retador_nombre    text        not null,
    retado_nombre     text        not null,
    -- 'vencido': se le acabó el plazo. 'cancelado': un admin lo cerró a mano.
    causa             text        not null,
    lanzado_en        timestamptz not null,
    expira_en         timestamptz not null,
    cerrado_en        timestamptz not null default now(),
    -- Opcional y editable: se rellena cuando se sabe por qué no se jugó.
    motivo            text,
    motivo_por        uuid references auth.users (id) on delete set null,
    motivo_por_nombre text,
    motivo_en         timestamptz,
    constraint expired_challenges_causa_valida check (causa in ('vencido', 'cancelado'))
);

create index if not exists expired_challenges_cerrado_en_idx
    on public.expired_challenges (cerrado_en desc);
create index if not exists expired_challenges_retador_idx on public.expired_challenges (retador_id);
create index if not exists expired_challenges_retado_idx on public.expired_challenges (retado_id);

alter table public.expired_challenges
    enable row level security;

-- Igual que el resto de tablas: lectura para los miembros, escritura sólo por función.
drop policy if exists expired_challenges_select on public.expired_challenges;
create policy expired_challenges_select on public.expired_challenges
    for select to authenticated using (true);


-- 2. ARCHIVAR UN RETO QUE SE CIERRA SIN JUGARSE -----------------------------------
-- Un solo sitio que copia el reto al archivo, para que caducar y cancelar dejen
-- exactamente la misma fila.
create or replace function public.archive_challenge(p_challenge public.challenges, p_causa text)
    returns public.expired_challenges
    language plpgsql
    security definer
    set search_path = ''
as
$$
declare
    v_retador  text;
    v_retado   text;
    v_expirado public.expired_challenges;
begin
    select nombre into v_retador from public.players where id = p_challenge.retador_id;
    select nombre into v_retado from public.players where id = p_challenge.retado_id;

    insert into public.expired_challenges (challenge_id, retador_id, retado_id,
                                           retador_nombre, retado_nombre,
                                           causa, lanzado_en, expira_en)
    values (p_challenge.id, p_challenge.retador_id, p_challenge.retado_id,
            coalesce(v_retador, 'Jugador eliminado'), coalesce(v_retado, 'Jugador eliminado'),
            p_causa, p_challenge.created_at, p_challenge.expira_en)
    returning * into v_expirado;

    return v_expirado;
end;
$$;

revoke execute on function public.archive_challenge(public.challenges, text) from public, anon;


-- 3. CADUCAR RETOS VENCIDOS (ahora los archiva antes de borrarlos) -----------------
create or replace function public.expire_stale_challenges()
    returns integer
    language plpgsql
    security definer
    set search_path = ''
as
$$
declare
    v_reto      public.challenges;
    v_archivado public.expired_challenges;
    v_total     integer := 0;
begin
    for v_reto in
        select * from public.challenges where expira_en < now()
        loop
            v_archivado := public.archive_challenge(v_reto, 'vencido');

            delete from public.challenges where id = v_reto.id;

            insert into public.ranking_history (texto)
            values (format('El reto entre %s y %s expiró sin jugarse.',
                           v_archivado.retador_nombre, v_archivado.retado_nombre));

            perform public.log_action('reto_expirado', 'expired_challenges', v_archivado.id,
                                      jsonb_build_object('retador', v_archivado.retador_nombre,
                                                         'retado', v_archivado.retado_nombre));

            v_total := v_total + 1;
        end loop;

    return v_total;
end;
$$;

revoke execute on function public.expire_stale_challenges() from public, anon;
grant execute on function public.expire_stale_challenges() to authenticated;


-- 4. CANCELAR RETO (también queda archivado) ---------------------------------------
create or replace function public.cancel_challenge(p_challenge_id uuid)
    returns void
    language plpgsql
    security definer
    set search_path = ''
as
$$
declare
    v_reto      public.challenges;
    v_archivado public.expired_challenges;
begin
    perform public.assert_admin();

    select * into v_reto from public.challenges where id = p_challenge_id;
    if not found then
        raise exception 'El reto ya no existe.';
    end if;

    v_archivado := public.archive_challenge(v_reto, 'cancelado');

    delete from public.challenges where id = p_challenge_id;

    insert into public.ranking_history (texto)
    values (format('El reto entre %s y %s se canceló sin jugarse.',
                   v_archivado.retador_nombre, v_archivado.retado_nombre));

    perform public.log_action('reto_cancelado', 'expired_challenges', v_archivado.id,
                              jsonb_build_object('retador', v_archivado.retador_nombre,
                                                 'retado', v_archivado.retado_nombre));
end;
$$;


-- 5. ESCRIBIR (O BORRAR) EL MOTIVO -------------------------------------------------
-- Se puede llamar tantas veces como haga falta: el motivo se conoce casi siempre
-- después de que el reto ya venció. Con el texto vacío se deja sin motivo.
create or replace function public.set_expired_challenge_reason(p_id uuid, p_motivo text)
    returns public.expired_challenges
    language plpgsql
    security definer
    set search_path = ''
as
$$
declare
    v_motivo   text;
    v_actor    text;
    v_expirado public.expired_challenges;
begin
    perform public.assert_admin();

    v_motivo := nullif(trim(p_motivo), '');
    if char_length(coalesce(v_motivo, '')) > 300 then
        raise exception 'El motivo no puede pasar de 300 caracteres.';
    end if;

    select coalesce(full_name, email)
    into v_actor
    from public.profiles
    where id = (select auth.uid());

    update public.expired_challenges
    set motivo            = v_motivo,
        motivo_por        = case when v_motivo is null then null else (select auth.uid()) end,
        motivo_por_nombre = case when v_motivo is null then null else v_actor end,
        motivo_en         = case when v_motivo is null then null else now() end
    where id = p_id
    returning * into v_expirado;

    if not found then
        raise exception 'El reto expirado ya no existe.';
    end if;

    perform public.log_action('motivo_expiracion', 'expired_challenges', p_id,
                              jsonb_build_object('retador', v_expirado.retador_nombre,
                                                 'retado', v_expirado.retado_nombre,
                                                 'motivo', coalesce(v_expirado.motivo, 'sin motivo')));

    return v_expirado;
end;
$$;

revoke execute on function public.set_expired_challenge_reason(uuid, text) from public, anon;
grant execute on function public.set_expired_challenge_reason(uuid, text) to authenticated;


-- 6. SINCRONIZACIÓN EN VIVO --------------------------------------------------------
do
$$
    begin
        alter publication supabase_realtime add table public.expired_challenges;
    exception
        when duplicate_object then null;
    end;
$$;
