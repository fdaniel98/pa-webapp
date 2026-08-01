import {FunctionsHttpError} from "@supabase/supabase-js";

import {supabase} from "./supabase";

/**
 * Llama a una Edge Function con la sesión actual y devuelve su JSON.
 * supabase-js entrega los errores HTTP como FunctionsHttpError sin leer el
 * cuerpo, así que aquí se extrae el mensaje que devolvió la función.
 */
export async function invokeFunction<T>(
    name: string,
    body: Record<string, unknown> = {}
): Promise<T> {
    const {data, error} = await supabase.functions.invoke<T>(name, {body});

    if (error) {
        throw new Error(await readFunctionError(error, name));
    }
    return data as T;
}

async function readFunctionError(error: unknown, name: string): Promise<string> {
    if (error instanceof FunctionsHttpError) {
        try {
            const body = await error.context.json();
            if (typeof body?.error === "string") return body.error;
        } catch {
            // Respuesta sin JSON: nos quedamos con el mensaje genérico.
        }
        return `La función ${name} falló. Revisa sus logs en Supabase.`;
    }
    if (error instanceof Error) return error.message;
    return String(error);
}
