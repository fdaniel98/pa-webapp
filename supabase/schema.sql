-- =============================================================================
-- Puello Academy - Estructura de tablas para el flujo de autenticación
-- Ejecutar en Supabase > SQL Editor > New query > Run
-- =============================================================================
-- Supabase ya administra los usuarios y las contraseñas en el esquema `auth`
-- (tabla auth.users). No se crea ni se modifica esa tabla: aquí sólo se agrega
-- `public.profiles`, la tabla espejo con los datos propios de la academia.
-- =============================================================================


-- 1. TABLA DE PERFILES ---------------------------------------------------------
create table if not exists public.profiles (
    id         uuid        primary key references auth.users (id) on delete cascade,
    email      text        unique,
    full_name  text,
    role       text        not null default 'member' check (role in ('admin', 'member')),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

comment on table public.profiles is 'Datos públicos de cada usuario, 1:1 con auth.users.';
comment on column public.profiles.role is 'admin = puede administrar el ranking; member = sólo consulta.';


-- 2. CREACIÓN AUTOMÁTICA DEL PERFIL AL REGISTRARSE ------------------------------
-- Se dispara cuando el formulario de registro crea el usuario en auth.users.
create or replace function public.handle_new_user()
    returns trigger
    language plpgsql
    security definer
    set search_path = ''
as
$$
begin
    insert into public.profiles (id, email, full_name)
    values (new.id, new.email, new.raw_user_meta_data ->> 'full_name')
    on conflict (id) do nothing;
    return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
    after insert
    on auth.users
    for each row
execute function public.handle_new_user();


-- 3. MANTENER updated_at AL DÍA -------------------------------------------------
create or replace function public.set_updated_at()
    returns trigger
    language plpgsql
as
$$
begin
    new.updated_at = now();
    return new;
end;
$$;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
    before update
    on public.profiles
    for each row
execute function public.set_updated_at();


-- 4. HELPER: ¿EL USUARIO ACTUAL ES ADMIN? ---------------------------------------
-- security definer para poder leer profiles sin caer en recursión de RLS.
create or replace function public.is_admin()
    returns boolean
    language sql
    stable
    security definer
    set search_path = ''
as
$$
select exists (select 1
               from public.profiles
               where id = (select auth.uid())
                 and role = 'admin');
$$;


-- 5. EVITAR QUE UN USUARIO SE ASCIENDA A SÍ MISMO -------------------------------
-- auth.uid() es null cuando la operación viene del SQL Editor o de la service
-- role key, así que desde el panel de Supabase sí puedes asignar roles a mano.
create or replace function public.prevent_role_escalation()
    returns trigger
    language plpgsql
    security definer
    set search_path = ''
as
$$
begin
    if new.role is distinct from old.role
        and (select auth.uid()) is not null
        and not public.is_admin() then
        raise exception 'No puedes cambiar tu propio rol.';
    end if;
    return new;
end;
$$;

drop trigger if exists profiles_prevent_role_escalation on public.profiles;
create trigger profiles_prevent_role_escalation
    before update
    on public.profiles
    for each row
execute function public.prevent_role_escalation();


-- 6. ROW LEVEL SECURITY ---------------------------------------------------------
alter table public.profiles
    enable row level security;

-- Cualquier usuario autenticado puede ver los perfiles (nombres del ranking).
drop policy if exists profiles_select_authenticated on public.profiles;
create policy profiles_select_authenticated
    on public.profiles
    for select
    to authenticated
    using (true);

-- Cada quien edita únicamente su propia fila.
drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own
    on public.profiles
    for update
    to authenticated
    using (id = (select auth.uid()))
    with check (id = (select auth.uid()));

-- Los admins pueden editar cualquier perfil (incluido el rol).
drop policy if exists profiles_update_admin on public.profiles;
create policy profiles_update_admin
    on public.profiles
    for update
    to authenticated
    using (public.is_admin())
    with check (public.is_admin());

-- Sin política de INSERT ni de DELETE: los perfiles los crea el trigger
-- on_auth_user_created (security definer) y se borran en cascada al eliminar el
-- usuario en auth.users. La Edge Function create-user usa la secret key, que
-- ignora RLS.


-- 7. PERFILES PARA USUARIOS YA EXISTENTES ---------------------------------------
-- Útil si creaste cuentas antes de instalar el trigger.
insert into public.profiles (id, email, full_name)
select u.id, u.email, u.raw_user_meta_data ->> 'full_name'
from auth.users u
on conflict (id) do nothing;


-- 8. NOMBRAR AL PRIMER ADMIN ----------------------------------------------------
-- No hay registro público: las cuentas se crean desde la pestaña "Usuarios" y eso
-- exige ser admin, así que el primer administrador se crea a mano una sola vez:
--   1) Authentication > Users > Add user (marca "Auto Confirm User").
--   2) Ejecuta la línea de abajo con ese correo.
-- update public.profiles set role = 'admin' where email = 'tu-correo@ejemplo.com';
