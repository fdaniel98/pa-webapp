# Puello Academy — Ranking SF6

Aplicación de ranking y sistema de retos (escalera) para Street Fighter 6 de Puello Academy.
Incluye autenticación por correo/contraseña, roles, historial de enfrentamientos con marcador,
bitácora de acciones y notificaciones por correo.

## Stack

| Pieza | Tecnología |
|---|---|
| Front-end | React 19 + React Router 8 en **modo SPA** (`ssr: false`) |
| Estilos / animación | Tailwind CSS 4 · Motion |
| Datos, auth y tiempo real | Supabase (Postgres + Auth + Realtime + Edge Functions) |
| Despliegue | GitHub Pages (sitio estático bajo `/pa-webapp/`) |

> **Importante:** la app es 100 % estática. No hay servidor propio: toda la lógica de negocio
> vive en funciones de Postgres y en Edge Functions. Por eso la *secret key* de Supabase
> nunca debe aparecer en el código del cliente.

---

## Requisitos previos

- **Node.js 20 o superior** (CI usa la 24) y npm
- Una cuenta de [Supabase](https://supabase.com) con un proyecto creado
- La CLI de Supabase, que se usa vía `npx` (no hace falta instalarla)
- *(Opcional)* Una cuenta de [Resend](https://resend.com) **con dominio verificado**, sólo si
  quieres activar las notificaciones por correo

---

## Puesta en marcha desde cero

### 1. Instalar dependencias

```bash
npm install
```

### 2. Variables de entorno

Copia el ejemplo y rellena los valores de tu proyecto Supabase
(*Project Settings → API*):

```bash
cp .env.example .env
```

Sólo **dos** variables llegan al navegador, y deben llevar el prefijo `VITE_` porque Vite
únicamente expone esas al cliente:

```dotenv
VITE_SUPABASE_URL=https://TU-PROYECTO.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=tu_publishable_o_anon_key
```

El resto (`SUPABASE_SECRET_KEY`, `SUPABASE_DB_PASSWORD`, …) son sólo para la CLI y las
Edge Functions. **Nunca pongas la secret key en una variable `VITE_`**: ese archivo se
compila dentro del bundle público.

### 3. Ejecutar los scripts SQL, en este orden

En Supabase → **SQL Editor** → *New query* → pegar → *Run*. El orden importa: cada archivo
usa funciones definidas en los anteriores.

| # | Archivo | Qué crea |
|---|---|---|
| 1 | `supabase/schema.sql` | `profiles` (espejo de `auth.users`), trigger de alta, RLS, `is_admin()` |
| 2 | `supabase/ranking.sql` | `players`, `challenges`, `ranking_history` + funciones del ranking y siembra inicial |
| 3 | `supabase/notifications.sql` | `players.email`, bandeja `notifications`, encolado de avisos |
| 4 | `supabase/settings.sql` | `app_settings` y el interruptor de notificaciones |
| 5 | `supabase/fixes.sql` | Caducidad real de retos y cambio de rol |
| 6 | `supabase/audit.sql` | `audit_log` y registro de todas las acciones |
| 7 | `supabase/matches.sql` | `matches`: historial de enfrentamientos con marcador SF6 |

Cada uno debe terminar con *Success. No rows returned*.

Comprobación rápida al final:

```sql
select (select count(*) from public.players)         as jugadores,       -- 36
       (select count(*) from public.app_settings)    as ajustes,         -- 1
       (select count(*) from pg_publication_tables
         where pubname = 'supabase_realtime' and schemaname = 'public') as tablas_en_realtime;  -- 5
```

### 4. Configurar Authentication

En el panel de Supabase:

1. **Authentication → URL Configuration → Redirect URLs**, añade:
   - `http://localhost:5173/pa-webapp/**`
   - `https://TU-USUARIO.github.io/pa-webapp/**`

   Sin esto, el enlace de recuperación de contraseña no vuelve a la app.

2. **Authentication → Sign In / Providers → Email**:
   - *Minimum password length* → **8** (la app valida con 8; si el servidor acepta menos,
     habrá contraseñas que el formulario rechaza).

3. **Authentication → Sign In / Providers → User Signups**:
   - Desactiva **Allow new users to sign up**.

   No hay registro público: las cuentas se crean desde la app, en la pestaña *Usuarios*.

### 5. Crear el primer administrador

Como crear cuentas exige ser admin, el primero se crea a mano una sola vez:

1. **Authentication → Users → Add user**, marcando *Auto Confirm User*.
2. En el SQL Editor:

```sql
update public.profiles
set role = 'admin', full_name = 'TU NOMBRE'
where email = 'tu-correo@ejemplo.com'
returning id, full_name, role;
```

Si devuelve `0 rows`, el trigger `on_auth_user_created` no creó el perfil; ejecuta la
sección 7 de `schema.sql`, que rellena los perfiles de usuarios ya existentes.

### 6. Desplegar las Edge Functions

Tres funciones necesitan la *secret key*, así que corren en el servidor de Supabase.
El `project_id` ya está en `supabase/config.toml`, por eso no hace falta `supabase link`.

```bash
npx supabase login
```

```bash
npx supabase functions deploy create-user && npx supabase functions deploy delete-user && npx supabase functions deploy send-notifications
```

| Función | Para qué | Sin desplegar |
|---|---|---|
| `create-user` | Crear cuentas desde *Usuarios* | No se pueden crear usuarios |
| `delete-user` | Eliminar cuentas | El botón *Eliminar* falla |
| `send-notifications` | Vaciar la bandeja de correos | Sólo afecta si activas notificaciones |

Recomendado, para que sólo tus dominios puedan invocarlas:

```bash
npx supabase secrets set ALLOWED_ORIGINS="http://localhost:5173,https://TU-USUARIO.github.io"
```

`SUPABASE_URL`, `SUPABASE_ANON_KEY` y `SUPABASE_SERVICE_ROLE_KEY` las inyecta Supabase
automáticamente; no hay que configurarlas.

### 7. Correo (opcional)

Las notificaciones llegan **apagadas** de fábrica y la app funciona perfectamente sin ellas.
Para activarlas hace falta un dominio verificado en Resend:

```bash
npx supabase secrets set RESEND_API_KEY="re_tu_api_key"
```

```bash
npx supabase secrets set NOTIFICATIONS_FROM="Puello Academy <ranking@tudominio.com>"
```

Después, dentro de la app: pestaña **Ajustes** → activar *Notificaciones de retos por correo*.
Los cambios de secrets aplican en la siguiente invocación, sin redesplegar.

> Con el interruptor apagado no se encola ningún correo, así que al encenderlo no sale una
> avalancha de avisos atrasados: sólo se notifican los retos posteriores.

---

## Desarrollo

```bash
npm run dev
```

La app queda en **http://localhost:5173/pa-webapp/** (ojo con el `basename`, la raíz `/` no sirve nada).

```bash
npm run typecheck
```

```bash
npm run build
```

### Reiniciar los datos para probar

`supabase/reset-test-data.sql` deja el ranking como recién instalado: borra
enfrentamientos, retos, historial, bandeja de correos y bitácora, resiembra los 36
nombres originales y apaga las notificaciones.

**No toca `auth.users` ni `profiles`**, así que las cuentas, sus contraseñas y los roles
sobreviven: no pierdes el acceso ni tu rol de admin. Termina con un `select` que confirma
los contadores en cero y las cuentas intactas.

Dos cosas sí se pierden, por diseño: los correos asignados a los jugadores y los
enfriamientos, porque los jugadores se insertan como filas nuevas. Si quieres conservar el
registro de auditoría, comenta la línea `delete from public.audit_log;`.

---

## Despliegue a GitHub Pages

El workflow `.github/workflows/deploy.yaml` publica automáticamente en cada push a `main`.

Antes del primer despliegue hay que añadir las variables en
**GitHub → Settings → Secrets and variables → Actions**:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`

Sin ellas la compilación genera una app que falla al arrancar.

El sitio se sirve bajo el subdirectorio `/pa-webapp/` (definido en `vite.config.ts` y
`react-router.config.ts`). El workflow copia `index.html` a `404.html` para que el
enrutado del lado del cliente funcione al recargar una ruta interna.

> El `Dockerfile` viene de la plantilla original y **no se usa**: el despliegue es estático.

---

## Roles y permisos

| | Miembro | Administrador |
|---|---|---|
| Ver ranking e historial | ✅ | ✅ |
| Lanzar / reportar / cancelar retos | ❌ | ✅ |
| Agregar, mover o eliminar jugadores | ❌ | ✅ |
| Gestionar cuentas y roles | ❌ | ✅ |
| Ver bitácora y ajustes | ❌ | ✅ |

Los permisos **no dependen de la interfaz**: cada función de Postgres empieza con
`assert_admin()` y las tablas sólo tienen políticas de `select`. Un miembro que llame a la
API directamente recibe *"Sólo un administrador puede modificar el ranking."*

Nadie puede cambiar su propio rol ni borrar su propia cuenta, para no dejar la academia sin
administradores.

### Pestañas

Toda la app vive en una sola pantalla con pestañas. Las de administración sólo se muestran
si tu perfil tiene `role = 'admin'`, y además cada acción se verifica en el servidor.

| Pestaña | Quién la ve | Para qué |
|---|---|---|
| **Ranking** | Todos | Tabla de posiciones. Los admins pueden reordenar arrastrando y eliminar jugadores |
| **Historial** | Todos | Enfrentamientos resueltos. Filtra por jugador y muestra su récord (V-D, games, movimiento de puestos) |
| **Retos** | Admin | Lanzar retos y reportar resultados con el marcador SF6 |
| **Jugadores** | Admin | Alta de jugadores y correos para notificaciones |
| **Usuarios** | Admin | Crear cuentas, cambiar roles y eliminar cuentas |
| **Bitácora** | Admin | Registro de todas las acciones, con filtro y purga |
| **Ajustes** | Admin | Interruptor de notificaciones y bandeja de correos |

---

## Modelo de datos

| Tabla | Contenido |
|---|---|
| `profiles` | Espejo de `auth.users` con `full_name` y `role` |
| `players` | Ranking: nombre, puesto actual/anterior, enfriamiento, correo |
| `challenges` | Retos vigentes con su fecha de caducidad |
| `matches` | Enfrentamientos resueltos: marcador SF6 y movimiento de puestos |
| `ranking_history` | Línea de tiempo legible que se muestra en la barra lateral |
| `notifications` | Bandeja de salida de correos (`pendiente` / `enviada` / `error`) |
| `audit_log` | Toda acción realizada, con su autor |
| `app_settings` | Interruptores de la app |

### Notas de arquitectura

- **Toda escritura pasa por funciones `security definer`.** Las reglas del ranking (escalera,
  enfriamiento, corrimiento de puestos) se cumplen en el servidor y son atómicas: si algo
  falla, no queda el ranking a medias.
- **Las notificaciones usan una bandeja de salida.** Los correos se encolan en la misma
  transacción que el cambio, y una Edge Function los envía aparte con reintentos. Un fallo
  del proveedor no pierde avisos ni bloquea el ranking.
- **La bitácora la escriben las mismas funciones que hacen el cambio**, así que el autor sale
  del JWT y no se puede falsear.
- **Realtime** mantiene sincronizados todos los dispositivos abiertos.

---

## Convenciones de interfaz

Antes de escribir estilos o animaciones nuevas, usa lo que ya existe.

**Colores.** Son tokens de Tailwind v4 declarados con `@theme` en `app/app.css`:
`brand`, `line`, `field`, `panel`, `surface`, `danger` (+ `-strong`, `-soft`, `-muted`),
`success` (+ `-soft`) e `info`. Se usan como cualquier color de Tailwind, con opacidad
incluida: `bg-brand/15`, `border-line/60`. **No escribas hex en las clases**; si falta un
color, añade el token. El fondo de la app es la utilidad `page-bg`.

**Clases de componente.** `app/lib/theme.ts` centraliza paneles, campos, botones y enlaces
(`PANEL`, `INPUT`, `BTN_PRIMARY`...). Cambiar un botón ahí lo cambia en toda la app.

**Animación.** `app/lib/motion.ts` define las duraciones, curvas y resortes
(`DUR`, `EASE`, `SPRING`, `HOVER`, `TAP`, `FADE`...). No inventes duraciones sueltas.
`root.tsx` envuelve la app en `<MotionConfig reducedMotion="user">` y `app.css` tiene el
bloque equivalente para las transiciones CSS, así que se respeta la preferencia del sistema.

**Responsive.** Móvil primero:

- La pantalla del ranking es de una columna y pasa a dos en `lg`.
- Alturas con `dvh`, no `vh`, para que la barra del navegador móvil no descuadre el alto.
- Campos y botones miden 44 px de alto en móvil (mínimo táctil) y vuelven a su tamaño
  compacto desde `sm`, vía `min-h-11 sm:min-h-0`.
- Los campos usan 16 px de fuente en móvil para que iOS no haga zoom al enfocar.
- Los botones son `inline-flex items-center`: con `min-h-*`, un botón en bloque no centra
  su texto verticalmente.

---

## Estructura del proyecto

```
app/
├── app.css            # @theme (tokens), utilidad page-bg, scrollbar, reduced-motion
├── root.tsx           # AuthProvider + MotionConfig
├── routes.ts          # Definición de rutas
├── components/        # Paneles de cada pestaña y UI compartida
├── lib/
│   ├── supabase.ts    # Cliente del navegador
│   ├── auth.tsx       # Sesión, perfil, rol, login/logout
│   ├── functions.ts   # Llamadas a Edge Functions
│   ├── ranking.ts     # players, challenges, ranking_history, realtime
│   ├── matches.ts     # Enfrentamientos y récord
│   ├── users.ts       # Cuentas y roles
│   ├── audit.ts       # Bitácora
│   ├── notifications.ts, settings.ts
│   └── theme.ts, motion.ts   # Tokens de estilo y movimiento
└── routes/            # login, forgot/update-password, protected (guard), ranking-sf6

supabase/
├── *.sql              # Migraciones, en el orden indicado arriba
├── reset-test-data.sql # Reinicio de datos sin borrar cuentas
├── functions/         # Edge Functions (Deno)
└── config.toml        # project_id y verify_jwt por función
```

Los paneles de las pestañas se cargan con `React.lazy`, así que un miembro no descarga la
interfaz de administración.

---

## Problemas frecuentes

| Síntoma | Causa |
|---|---|
| `Faltan VITE_SUPABASE_URL y/o VITE_SUPABASE_PUBLISHABLE_KEY` | Falta el `.env` o las variables no llevan el prefijo `VITE_`. Reinicia el servidor tras crearlo. |
| No aparecen las pestañas de administración | Tu perfil tiene `role = 'member'`. Revisa el paso 5. |
| `No se pudo cargar el ranking` | Falta ejecutar algún `.sql`, o se ejecutaron fuera de orden. |
| Crear o eliminar usuarios falla | La Edge Function no está desplegada, o `ALLOWED_ORIGINS` no incluye tu origen. |
| Los correos quedan en `pendiente` | Falta `RESEND_API_KEY` o `NOTIFICATIONS_FROM`, o el dominio no está verificado en Resend. Revisa la bandeja en *Ajustes*. |
| Los cambios no se ven en otro dispositivo | La tabla no está en la publicación `supabase_realtime`; vuelve a ejecutar el bloque correspondiente. |
| Un jugador no puede ser retado | Tiene inmunidad de 7 días o un reto vigente. Los vencidos se limpian solos al abrir la app. |

---

© Puello Academy. Esta página y todo su contenido son propiedad de Tomas Puello.
