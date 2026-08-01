-- =============================================================================
-- Puello Academy - Ajustes de la aplicación
-- Ejecutar en Supabase > SQL Editor DESPUÉS de notifications.sql
-- =============================================================================
-- El interruptor vive en la base de datos, no en el navegador:
--   * Se comparte entre todos los dispositivos y admins.
--   * enqueue_notification() lo consulta ANTES de encolar, así que con el
--     interruptor apagado no se guarda nada en la bandeja de salida. Al
--     encenderlo no sale una avalancha de correos viejos: sólo se notifican
--     los retos posteriores.
-- =============================================================================


-- 1. TABLA DE AJUSTES -----------------------------------------------------------
create table if not exists public.app_settings
(
    key         text primary key,
    enabled     boolean     not null default false,
    descripcion text,
    updated_at  timestamptz not null default now(),
    updated_by  uuid references auth.users (id) on delete set null
);

comment on table public.app_settings is 'Interruptores de la app, editables sólo por admins.';

-- Arranca APAGADO: sin dominio verificado en Resend los envíos fallarían.
insert into public.app_settings (key, enabled, descripcion)
values ('notificaciones_retos', false,
        'Enviar correos a los jugadores cuando se lanza o se resuelve un reto.')
on conflict (key) do nothing;


-- 2. ROW LEVEL SECURITY ---------------------------------------------------------
alter table public.app_settings
    enable row level security;

-- Todos los usuarios autenticados pueden leer el estado del interruptor.
drop policy if exists app_settings_select on public.app_settings;
create policy app_settings_select on public.app_settings
    for select to authenticated using (true);

-- Sin políticas de escritura: sólo se cambia con public.set_setting().


-- 3. LEER UN AJUSTE -------------------------------------------------------------
create or replace function public.setting_enabled(p_key text)
    returns boolean
    language sql
    stable
    security definer
    set search_path = ''
as
$$
select coalesce((select enabled from public.app_settings where key = p_key), false);
$$;


-- 4. CAMBIAR UN AJUSTE ----------------------------------------------------------
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

    return v_setting;
end;
$$;


-- 5. EL INTERRUPTOR MANDA SOBRE LA BANDEJA DE SALIDA -----------------------------
-- Reemplaza la versión de notifications.sql agregando la comprobación del ajuste.
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
    -- Notificaciones apagadas: no se encola nada.
    if not public.setting_enabled('notificaciones_retos') then
        return;
    end if;

    -- Sin correo registrado simplemente no se notifica; no es un error.
    if p_player.email is null or trim(p_player.email) = '' then
        return;
    end if;

    insert into public.notifications (player_id, email, asunto, cuerpo)
    values (p_player.id, p_player.email, p_asunto, p_cuerpo);
end;
$$;


-- 6. SINCRONIZACIÓN EN VIVO DEL AJUSTE ------------------------------------------
do
$$
    begin
        alter publication supabase_realtime add table public.app_settings;
    exception
        when duplicate_object then null;
    end;
$$;
