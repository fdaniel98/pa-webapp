import {supabase} from "./supabase";

export type AuditEntry = {
    id: string;
    actorNombre: string;
    accion: string;
    entidad: string | null;
    entidadId: string | null;
    detalle: Record<string, unknown>;
    createdAt: string;
};

type AuditRow = {
    id: string;
    actor_nombre: string;
    accion: string;
    entidad: string | null;
    entidad_id: string | null;
    detalle: Record<string, unknown> | null;
    created_at: string;
};

/** Etiquetas legibles para cada acción registrada. */
export const ACCION_LABEL: Record<string, string> = {
    jugador_agregado: "Jugador agregado",
    jugador_eliminado: "Jugador eliminado",
    jugador_movido: "Jugador movido de puesto",
    correo_actualizado: "Correo actualizado",
    reto_lanzado: "Reto lanzado",
    reto_resuelto: "Reto resuelto",
    reto_cancelado: "Reto cancelado",
    reto_expirado: "Reto expirado",
    ranking_reiniciado: "Ranking reiniciado",
    ajuste_cambiado: "Ajuste cambiado",
    rol_cambiado: "Rol cambiado",
    usuario_creado: "Usuario creado",
    usuario_eliminado: "Usuario eliminado",
    sesion_iniciada: "Sesión iniciada",
    sesion_cerrada: "Sesión cerrada",
    bitacora_purgada: "Bitácora purgada",
};

export const ACCIONES = Object.keys(ACCION_LABEL);

export type AuditFilter = {
    accion?: string;
    limit?: number;
    offset?: number;
};

/** Bitácora. Sólo la ven los admins (política RLS de audit_log). */
export async function fetchAuditLog({accion, limit = 50, offset = 0}: AuditFilter = {}): Promise<
    AuditEntry[]
> {
    let query = supabase
        .from("audit_log")
        .select("id, actor_nombre, accion, entidad, entidad_id, detalle, created_at")
        .order("created_at", {ascending: false})
        .range(offset, offset + limit - 1);

    if (accion) query = query.eq("accion", accion);

    const {data, error} = await query;
    if (error) throw new Error(error.message);

    return (data as AuditRow[]).map((row) => ({
        id: row.id,
        actorNombre: row.actor_nombre,
        accion: row.accion,
        entidad: row.entidad,
        entidadId: row.entidad_id,
        detalle: row.detalle ?? {},
        createdAt: row.created_at,
    }));
}

/**
 * Registra inicio/cierre de sesión. La identidad sale del JWT y no se puede
 * falsear, pero depende de que el cliente llame: el log de auth completo lo
 * mantiene Supabase por su cuenta.
 */
export async function recordSessionEvent(evento: "sesion_iniciada" | "sesion_cerrada") {
    const {error} = await supabase.rpc("record_session_event", {p_evento: evento});
    if (error) throw new Error(error.message);
}

export async function purgeAuditLog(dias = 180): Promise<number> {
    const {data, error} = await supabase.rpc("purge_audit_log", {p_dias: dias});
    if (error) throw new Error(error.message);
    return (data as number) ?? 0;
}

/** Convierte el jsonb de detalle en algo legible en una línea. */
export function describeDetalle(detalle: Record<string, unknown>): string {
    return Object.entries(detalle)
        .filter(([, value]) => value !== null && value !== undefined && value !== "")
        .map(([key, value]) => `${key}: ${String(value)}`)
        .join(" · ");
}
