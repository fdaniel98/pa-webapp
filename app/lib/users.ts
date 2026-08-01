import type {Profile} from "./auth";
import {invokeFunction} from "./functions";
import {supabase} from "./supabase";

export type NewUserInput = {
    email: string;
    password: string;
    fullName: string;
    role: Profile["role"];
};

/** Lista los perfiles de la academia, del más reciente al más antiguo. */
export async function listProfiles(): Promise<Profile[]> {
    const {data, error} = await supabase
        .from("profiles")
        .select("id, email, full_name, role, created_at")
        .order("created_at", {ascending: false});

    if (error) throw new Error(error.message);
    return (data ?? []) as Profile[];
}

/**
 * Crea una cuenta nueva a través de la Edge Function `create-user`.
 *
 * La creación vive en el servidor porque requiere la secret key de Supabase, que
 * jamás puede viajar en este bundle. La función también verifica que quien llama
 * sea admin, así que la protección no depende sólo de la interfaz.
 */
export async function createUser(input: NewUserInput): Promise<Profile> {
    const data = await invokeFunction<{ profile: Profile }>("create-user", {
        email: input.email.trim(),
        password: input.password,
        full_name: input.fullName.trim(),
        role: input.role,
    });

    if (!data?.profile) {
        throw new Error("La función create-user no devolvió el perfil creado.");
    }
    return data.profile;
}

/**
 * Cambia el rol de otro usuario. Pasa por una función de Postgres para que el
 * servidor pueda impedir que un admin se degrade a sí mismo y deje la academia
 * sin administradores.
 */
export async function setProfileRole(userId: string, role: Profile["role"]): Promise<void> {
    const {error} = await supabase.rpc("set_profile_role", {p_id: userId, p_role: role});
    if (error) throw new Error(error.message);
}

/** Elimina la cuenta de auth.users; su perfil se borra en cascada. */
export async function deleteUser(userId: string): Promise<void> {
    await invokeFunction<{ deleted: string }>("delete-user", {user_id: userId});
}
