import {supabase} from "./supabase";

/** Correos al lanzar o resolver un reto. */
export const NOTIFICACIONES_RETOS = "notificaciones_retos";

export type AppSetting = {
    key: string;
    enabled: boolean;
    descripcion: string | null;
    updatedAt: string;
};

type SettingRow = {
    key: string;
    enabled: boolean;
    descripcion: string | null;
    updated_at: string;
};

export async function fetchSettings(): Promise<AppSetting[]> {
    const {data, error} = await supabase
        .from("app_settings")
        .select("key, enabled, descripcion, updated_at")
        .order("key", {ascending: true});

    if (error) throw new Error(error.message);

    return (data as SettingRow[]).map((row) => ({
        key: row.key,
        enabled: row.enabled,
        descripcion: row.descripcion,
        updatedAt: row.updated_at,
    }));
}

export async function setSetting(key: string, enabled: boolean): Promise<void> {
    const {error} = await supabase.rpc("set_setting", {p_key: key, p_enabled: enabled});
    if (error) throw new Error(error.message);
}
