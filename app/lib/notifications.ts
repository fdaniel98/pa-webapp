import {supabase} from "./supabase";

export type NotificationEstado = "pendiente" | "enviada" | "error";

export type NotificationEntry = {
    id: string;
    email: string;
    asunto: string;
    estado: NotificationEstado;
    error: string | null;
    intentos: number;
    createdAt: string;
    sentAt: string | null;
};

type NotificationRow = {
    id: string;
    email: string;
    asunto: string;
    estado: NotificationEstado;
    error: string | null;
    intentos: number;
    created_at: string;
    sent_at: string | null;
};

/** Bandeja de salida. Sólo la ven los admins (política RLS de notifications). */
export async function fetchNotifications(limit = 25): Promise<NotificationEntry[]> {
    const {data, error} = await supabase
        .from("notifications")
        .select("id, email, asunto, estado, error, intentos, created_at, sent_at")
        .order("created_at", {ascending: false})
        .limit(limit);

    if (error) throw new Error(error.message);

    return (data as NotificationRow[]).map((row) => ({
        id: row.id,
        email: row.email,
        asunto: row.asunto,
        estado: row.estado,
        error: row.error,
        intentos: row.intentos,
        createdAt: row.created_at,
        sentAt: row.sent_at,
    }));
}

/** Borra las notificaciones ya enviadas con más de `dias` de antigüedad. */
export async function purgeSentNotifications(dias = 30): Promise<number> {
    const {data, error} = await supabase.rpc("purge_sent_notifications", {p_dias: dias});
    if (error) throw new Error(error.message);
    return (data as number) ?? 0;
}
