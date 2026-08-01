// Edge Function: delete-user
//
// Elimina una cuenta de auth.users (su fila en profiles se borra en cascada).
// Requiere la secret key, que nunca puede estar en el bundle del navegador, y
// verifica que quien llama sea admin. Impide borrarse a uno mismo para no dejar
// la academia sin administradores.
//
// Desplegar:  npx supabase functions deploy delete-user

import {createClient} from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON_KEY =
    Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_PUBLISHABLE_KEY")!;
const SECRET_KEY =
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? Deno.env.get("SUPABASE_SECRET_KEY")!;

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

    const callerClient = createClient(SUPABASE_URL, ANON_KEY, {
        global: {headers: {Authorization: authorization}},
        auth: {persistSession: false, autoRefreshToken: false},
    });

    const {data: callerData, error: callerError} = await callerClient.auth.getUser();
    if (callerError || !callerData.user) {
        return json({error: "Sesión inválida o expirada."}, 401, origin);
    }

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
        return json({error: "Sólo un administrador puede eliminar cuentas."}, 403, origin);
    }

    let payload: Record<string, unknown>;
    try {
        payload = await req.json();
    } catch {
        return json({error: "Cuerpo de la petición inválido."}, 400, origin);
    }

    const userId = typeof payload.user_id === "string" ? payload.user_id : "";
    if (!userId) {
        return json({error: "Falta el identificador del usuario."}, 400, origin);
    }
    if (userId === callerData.user.id) {
        return json({error: "No puedes eliminar tu propia cuenta."}, 400, origin);
    }

    // Se lee el perfil ANTES de borrar: después desaparece en cascada.
    const {data: objetivo} = await adminClient
        .from("profiles")
        .select("full_name, email, role")
        .eq("id", userId)
        .maybeSingle();

    const {error: deleteError} = await adminClient.auth.admin.deleteUser(userId);
    if (deleteError) {
        return json({error: deleteError.message}, 400, origin);
    }

    const {data: actor} = await adminClient
        .from("profiles")
        .select("full_name, email")
        .eq("id", callerData.user.id)
        .maybeSingle();

    await adminClient.from("audit_log").insert({
        actor_id: callerData.user.id,
        actor_nombre: actor?.full_name ?? actor?.email ?? "desconocido",
        accion: "usuario_eliminado",
        entidad: "profiles",
        entidad_id: userId,
        detalle: {
            usuario: objetivo?.full_name ?? objetivo?.email ?? userId,
            email: objetivo?.email ?? null,
            rol: objetivo?.role ?? null,
        },
    });

    return json({deleted: userId}, 200, origin);
});
