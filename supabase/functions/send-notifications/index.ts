// Edge Function: send-notifications
//
// Vacía la bandeja de salida (public.notifications): toma las pendientes, las
// envía con Resend y marca cada una como enviada o con error. El cliente sólo
// dice "envía lo pendiente"; los destinatarios y el texto los pone Postgres al
// encolar, así que desde el navegador no se puede escribir a cualquier correo.
//
// Secrets necesarios (Resend requiere un dominio verificado):
//   npx supabase secrets set RESEND_API_KEY="re_..."
//   npx supabase secrets set NOTIFICATIONS_FROM="Puello Academy <ranking@tudominio.com>"
//
// Desplegar:  npx supabase functions deploy send-notifications

import {createClient} from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON_KEY =
    Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_PUBLISHABLE_KEY")!;
const SECRET_KEY =
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? Deno.env.get("SUPABASE_SECRET_KEY")!;

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const NOTIFICATIONS_FROM = Deno.env.get("NOTIFICATIONS_FROM");

const ALLOWED_ORIGINS = (Deno.env.get("ALLOWED_ORIGINS") ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);

// Cuántos correos se procesan por invocación y cuántos reintentos antes de rendirse.
const BATCH_SIZE = 25;
const MAX_INTENTOS = 3;

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

type NotificationRow = {
    id: string;
    email: string;
    asunto: string;
    cuerpo: string;
    intentos: number;
};

async function sendWithResend(row: NotificationRow) {
    const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
            Authorization: `Bearer ${RESEND_API_KEY}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            from: NOTIFICATIONS_FROM,
            to: [row.email],
            subject: row.asunto,
            text: row.cuerpo,
        }),
    });

    if (!response.ok) {
        const detail = await response.text();
        throw new Error(`Resend ${response.status}: ${detail.slice(0, 300)}`);
    }
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

    // 1. Identificar a quien llama.
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

    // 2. Sólo los admins pueden disparar el envío.
    const {data: callerProfile, error: profileError} = await adminClient
        .from("profiles")
        .select("role")
        .eq("id", callerData.user.id)
        .maybeSingle();

    if (profileError) {
        return json({error: `No se pudo verificar el perfil: ${profileError.message}`}, 500, origin);
    }
    if (callerProfile?.role !== "admin") {
        return json({error: "Sólo un administrador puede enviar notificaciones."}, 403, origin);
    }

    if (!RESEND_API_KEY || !NOTIFICATIONS_FROM) {
        return json(
            {error: "Faltan los secrets RESEND_API_KEY y/o NOTIFICATIONS_FROM en la Edge Function."},
            500,
            origin
        );
    }

    // 3. Tomar el lote pendiente.
    const {data: pendientes, error: readError} = await adminClient
        .from("notifications")
        .select("id, email, asunto, cuerpo, intentos")
        .eq("estado", "pendiente")
        .order("created_at", {ascending: true})
        .limit(BATCH_SIZE);

    if (readError) {
        return json({error: `No se pudo leer la bandeja: ${readError.message}`}, 500, origin);
    }

    const filas = (pendientes ?? []) as NotificationRow[];
    let enviadas = 0;
    const fallidas: { email: string; error: string }[] = [];

    for (const fila of filas) {
        try {
            await sendWithResend(fila);
            await adminClient
                .from("notifications")
                .update({estado: "enviada", sent_at: new Date().toISOString(), error: null})
                .eq("id", fila.id);
            enviadas++;
        } catch (err) {
            const mensaje = err instanceof Error ? err.message : String(err);
            const intentos = fila.intentos + 1;
            // Se reintenta en la siguiente pasada hasta agotar MAX_INTENTOS.
            await adminClient
                .from("notifications")
                .update({
                    estado: intentos >= MAX_INTENTOS ? "error" : "pendiente",
                    intentos,
                    error: mensaje,
                })
                .eq("id", fila.id);
            fallidas.push({email: fila.email, error: mensaje});
        }
    }

    return json({procesadas: filas.length, enviadas, fallidas}, 200, origin);
});
