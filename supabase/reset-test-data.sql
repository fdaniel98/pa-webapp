-- =============================================================================
-- Puello Academy - Reinicio de datos para pruebas
-- Ejecutar en Supabase > SQL Editor cuando quieras volver a un estado limpio.
-- =============================================================================
-- BORRA: enfrentamientos, retos (vigentes y expirados), historial, bandeja de
--        correos, bitácora y el ranking completo (que se vuelve a sembrar con los
--        36 nombres originales).
--
-- NO TOCA: auth.users ni public.profiles. Las cuentas, sus contraseñas y sus
--          roles quedan intactos, así que no pierdes el acceso ni tu rol de admin.
--
-- Aviso: al resembrar los jugadores se pierden los correos que tuvieran
--        asignados, porque son filas nuevas. Los enfriamientos también se limpian.
-- =============================================================================

-- 1. Datos dependientes primero (aunque las FK son on delete set null/cascade,
--    borrarlos en orden deja la bitácora coherente).
delete from public.matches;
delete from public.notifications;
delete from public.expired_challenges;
delete from public.challenges;
delete from public.ranking_history;

-- Comenta esta línea si prefieres conservar el registro de auditoría.
delete from public.audit_log;

-- 2. Ranking desde cero, con la lista original de la academia.
delete from public.players;

insert into public.players (nombre, rango_actual, rango_anterior)
select nombre, posicion::integer, posicion::integer
from unnest(array [
    'VALAK','EDGON','YEYÉ','BRITO','MITCH','SABROSO HD','RIKAR','SIGAL','KINGNALDO','BELI',
    'TOXIN','CAMILO','NAMELESS','STANDMAKAROV','EFETE','SOMBRA','YOJOSAN','KANDELO','MOKANO','BLEYNOR',
    'FORTY','PELCHA','KINJA','KINKON','PIOLÍN','JHOEL','XEROX','NELSON V','TEMPEST','DIRETOL ZANGIEF',
    'BEUZWOLF','RONALD SNOOKY','WILMIX','GOUKISHI','ODIN','ENMA F'
    ]) with ordinality as t(nombre, posicion);

-- 3. Ajustes a sus valores por defecto (notificaciones apagadas).
update public.app_settings
set enabled    = false,
    updated_at = now(),
    updated_by = null
where key = 'notificaciones_retos';

-- 4. Comprobación: debe devolver 36 / 0 / 0 / 0 / 0 / 0 / 0 y las cuentas intactas.
select (select count(*) from public.players)            as jugadores,
       (select count(*) from public.challenges)         as retos,
       (select count(*) from public.expired_challenges) as retos_expirados,
       (select count(*) from public.matches)            as enfrentamientos,
       (select count(*) from public.ranking_history)    as historial,
       (select count(*) from public.notifications)      as correos,
       (select count(*) from public.audit_log)          as bitacora,
       (select count(*) from public.profiles)           as cuentas_conservadas,
       (select count(*) from public.profiles
         where role = 'admin')                          as admins_conservados;
