import {invokeFunction} from "./functions";
import type {ChallengeRow, HistoryRow, PlayerRow} from "./transforms";
import {toChallenge, toHistoryEntry, toPlayer} from "./transforms";
import {supabase} from "./supabase";

export type Player = {
    id: string;
    nombre: string;
    rangoActual: number;
    rangoAnterior: number;
    /** Epoch en ms, o null si el jugador no tiene inmunidad activa. */
    cooldownHasta: number | null;
    /** Sin correo, al jugador simplemente no se le notifica. */
    email: string | null;
};

export type Challenge = {
    id: string;
    retadorId: string;
    retadoId: string;
    /** Epoch en ms. */
    expiraEn: number;
};

export type HistoryEntry = {
    id: string;
    fecha: string;
    texto: string;
};

export type RankingState = {
    jugadores: Player[];
    retosVigentes: Challenge[];
    historial: HistoryEntry[];
};

/** Trae el estado completo del ranking en una sola pasada. */
export async function fetchRankingState(): Promise<RankingState> {
    const [players, challenges, history] = await Promise.all([
        supabase
            .from("players")
            .select("id, nombre, rango_actual, rango_anterior, cooldown_hasta, email")
            .order("rango_actual", {ascending: true}),
        supabase.from("challenges").select("id, retador_id, retado_id, expira_en"),
        supabase
            .from("ranking_history")
            .select("id, texto, created_at")
            .order("created_at", {ascending: false})
            .limit(50),
    ]);

    if (players.error) throw new Error(players.error.message);
    if (challenges.error) throw new Error(challenges.error.message);
    if (history.error) throw new Error(history.error.message);

    const ahora = Date.now();

    return {
        jugadores: (players.data as PlayerRow[]).map(toPlayer),
        // Defensa por si un reto venció entre la limpieza y esta consulta: nunca
        // debe pintarse un "Expira en: -3 días".
        retosVigentes: (challenges.data as ChallengeRow[])
            .map(toChallenge)
            .filter((reto) => reto.expiraEn > ahora),
        historial: (history.data as HistoryRow[]).map(toHistoryEntry),
    };
}

/**
 * Borra los retos que ya vencieron y los registra en el historial.
 * No exige ser admin: es limpieza determinista y conviene que ocurra en cuanto
 * alguien abre la app, no sólo cuando entra un administrador.
 */
export function expireStaleChallenges() {
    return callRpc("expire_stale_challenges");
}

/**
 * Las reglas del ranking viven en funciones de Postgres: son atómicas y verifican
 * que quien llama sea admin, así que no se pueden saltar desde el cliente.
 */
async function callRpc(fn: string, args: Record<string, unknown> = {}) {
    const {error} = await supabase.rpc(fn, args);
    if (error) throw new Error(error.message);
}

export function addPlayer(nombre: string, email?: string) {
    return callRpc("add_player", {p_nombre: nombre, p_email: email ?? null});
}

export function setPlayerEmail(playerId: string, email: string) {
    return callRpc("set_player_email", {p_id: playerId, p_email: email});
}

export function removePlayer(playerId: string) {
    return callRpc("remove_player", {p_id: playerId});
}

export function createChallenge(retadorId: string, retadoId: string) {
    return callRpc("create_challenge", {p_retador_id: retadorId, p_retado_id: retadoId});
}

export function cancelChallenge(challengeId: string) {
    return callRpc("cancel_challenge", {p_challenge_id: challengeId});
}

export function reorderPlayer(playerId: string, nuevoRango: number) {
    return callRpc("reorder_player", {p_id: playerId, p_nuevo_rango: nuevoRango});
}

export function resetRanking() {
    return callRpc("reset_ranking");
}

export type NotificationResult = {
    procesadas: number;
    enviadas: number;
    fallidas: { email: string; error: string }[];
};

/**
 * Vacía la bandeja de salida. Las funciones de Postgres ya dejaron encoladas las
 * notificaciones al guardar el reto, así que aquí sólo se pide el envío: si esta
 * llamada falla, los correos siguen pendientes y salen en el próximo intento.
 */
export function sendPendingNotifications() {
    return invokeFunction<NotificationResult>("send-notifications");
}

/** Se re-consulta el ranking cuando alguien más lo cambia desde otro dispositivo. */
export function subscribeToRanking(onChange: () => void) {
    const channel = supabase
        .channel("ranking-changes")
        .on("postgres_changes", {event: "*", schema: "public", table: "players"}, onChange)
        .on("postgres_changes", {event: "*", schema: "public", table: "challenges"}, onChange)
        .on("postgres_changes", {event: "*", schema: "public", table: "ranking_history"}, onChange)
        .on("postgres_changes", {event: "*", schema: "public", table: "app_settings"}, onChange)
        .on("postgres_changes", {event: "*", schema: "public", table: "matches"}, onChange)
        .subscribe();

    return () => {
        void supabase.removeChannel(channel);
    };
}
