import {createClient} from "@supabase/supabase-js";

// La app corre como SPA estática (ssr: false), así que Vite sólo expone
// variables con prefijo VITE_. Nunca uses aquí la SECRET KEY: este bundle es público.
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabasePublishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

if (!supabaseUrl || !supabasePublishableKey) {
    throw new Error(
        "Faltan VITE_SUPABASE_URL y/o VITE_SUPABASE_PUBLISHABLE_KEY. " +
        "Agrégalas a tu archivo .env (ver .env.example) y reinicia el servidor de desarrollo."
    );
}

export const supabase = createClient(supabaseUrl, supabasePublishableKey, {
    auth: {
        persistSession: true,
        autoRefreshToken: true,
        // Necesario para procesar los enlaces de confirmación y de recuperación de contraseña.
        detectSessionInUrl: true,
    },
});

/** URL absoluta dentro de la app, respetando el basename de GitHub Pages (/pa-webapp/). */
export function absoluteUrl(path: string) {
    const base = import.meta.env.BASE_URL.endsWith("/")
        ? import.meta.env.BASE_URL
        : `${import.meta.env.BASE_URL}/`;
    return `${window.location.origin}${base}${path.replace(/^\//, "")}`;
}
