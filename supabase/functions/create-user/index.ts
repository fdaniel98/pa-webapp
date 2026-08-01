// Edge Function: create-user
//
// Crea cuentas de la academia con la secret key de Supabase, que nunca puede
// estar en el bundle del navegador. Antes de crear nada verifica que quien llama
// tenga sesión activa y rol 'admin' en public.profiles, así que la restricción no
// depende de que la pestaña "Usuarios" esté oculta en la interfaz.
//
// Desplegar:  npx supabase functions deploy create-user

import {createClient} from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON_KEY =
    Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_PUBLISHABLE_KEY")!;
const SECRET_KEY =
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? Deno.env.get("SUPABASE_SECRET_KEY")!;

// Orígenes permitidos: dev local y GitHub Pages. Ajusta ALLOWED_ORIGINS con tu
// dominio real (secret de la función) si publicas en otro lado.
const ALLOWED_ORIGINS = (Deno.env.get("ALLOWED_ORIGINS") ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);

function corsHeaders(origin: string | null) {
    const allowed =
        ALLOWED_ORIGINS.length === 0 || (origin && ALLOWED_ORIGINS.includes(origin))
            ? origin ?? "*"
            : ALLOWED_ORIGINS[0];

    return {
        "Access-Control-Allow-Origin": allowed,
        "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Vary": "Origin",
    };
}

function json(body: unknown, status: number, origin: string | null) {
    return new Response(JSON.stringify(body), {
        status,
        headers: {...corsHeaders(origin), "Content-Type": "application/json"},
    });
}

const VALID_ROLES = ["admin", "member"] as const;
const MIN_PASSWORD_LENGTH = 8;

Deno.serve(async (req) => {
    const origin = req.headers.get("Origin");

    if (req.method === "OPTIONS") {
        return new Response("ok", {headers: corsHeaders(origin)});
    }
    if (req.method !== "POST") {
        return json({error: "Método no permitido."}, 405, origin);
    }

    const authorization = req.headers.get("Authorization");
    if (!authorization) {
        return json({error: "Falta la sesión del usuario."}, 401, origin);
    }

    // 1. Identificar a quien llama, usando su propio JWT.
    const callerClient = createClient(SUPABASE_URL, ANON_KEY, {
        global: {headers: {Authorization: authorization}},
        auth: {persistSession: false, autoRefreshToken: false},
    });

    const {data: callerData, error: callerError} = await callerClient.auth.getUser();
    if (callerError || !callerData.user) {
        return json({error: "Sesión inválida o expirada."}, 401, origin);
    }

    // 2. Sólo los admins pueden crear cuentas.
    const adminClient = createClient(SUPABASE_URL, SECRET_KEY, {
        auth: {persistSession: false, autoRefreshToken: false},
    });

    const {data: callerProfile, error: profileError} = await adminClient
        .from("profiles")
        .select("role")
        .eq("id", callerData.user.id)
        .maybeSingle();

    if (profileError) {
        return json({error: `No se pudo verificar el perfil: ${profileError.message}`}, 500, origin);
    }
    if (callerProfile?.role !== "admin") {
        return json({error: "Sólo un administrador puede crear cuentas."}, 403, origin);
    }

    // 3. Validar la entrada.
    let payload: Record<string, unknown>;
    try {
        payload = await req.json();
    } catch {
        return json({error: "Cuerpo de la petición inválido."}, 400, origin);
    }

    const email = typeof payload.email === "string" ? payload.email.trim() : "";
    const password = typeof payload.password === "string" ? payload.password : "";
    const fullName = typeof payload.full_name === "string" ? payload.full_name.trim() : "";
    const role = typeof payload.role === "string" ? payload.role : "member";

    if (!email || !email.includes("@")) {
        return json({error: "Correo electrónico inválido."}, 400, origin);
    }
    if (password.length < MIN_PASSWORD_LENGTH) {
        return json(
            {error: `La contraseña debe tener al menos ${MIN_PASSWORD_LENGTH} caracteres.`},
            400,
            origin
        );
    }
    if (!fullName) {
        return json({error: "El nombre de jugador es obligatorio."}, 400, origin);
    }
    if (!VALID_ROLES.includes(role as typeof VALID_ROLES[number])) {
        return json({error: "Rol inválido."}, 400, origin);
    }

    // 4. Crear la cuenta ya confirmada (no hay correo de verificación que abrir).
    const {data: created, error: createError} = await adminClient.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: {full_name: fullName},
    });

    if (createError || !created.user) {
        return json({error: createError?.message ?? "No se pudo crear la cuenta."}, 400, origin);
    }

    // 5. El trigger on_auth_user_created ya insertó el perfil; fijamos el rol.
    const {data: profile, error: updateError} = await adminClient
        .from("profiles")
        .update({full_name: fullName, role})
        .eq("id", created.user.id)
        .select("id, email, full_name, role, created_at")
        .single();

    if (updateError) {
        return json(
            {error: `Cuenta creada, pero no se pudo asignar el perfil: ${updateError.message}`},
            500,
            origin
        );
    }

    // La bitácora se escribe aquí porque esta función usa la secret key: dentro
    // de Postgres auth.uid() sería null, así que el autor se registra explícito.
    const {data: actor} = await adminClient
        .from("profiles")
        .select("full_name, email")
        .eq("id", callerData.user.id)
        .maybeSingle();

    await adminClient.from("audit_log").insert({
        actor_id: callerData.user.id,
        actor_nombre: actor?.full_name ?? actor?.email ?? "desconocido",
        accion: "usuario_creado",
        entidad: "profiles",
        entidad_id: created.user.id,
        detalle: {usuario: fullName, email, rol: role},
    });

    return json({profile}, 201, origin);
});
