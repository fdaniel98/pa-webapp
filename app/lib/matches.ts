import {supabase} from "./supabase";
import type {MatchRow} from "./transforms";
import {toMatch} from "./transforms";

export type Match = {
    id: string;
    ganadorId: string | null;
    perdedorId: string | null;
    ganadorNombre: string;
    perdedorNombre: string;
    setsGanador: number | null;
    setsPerdedor: number | null;
    puestoGanadorAntes: number;
    puestoGanadorDespues: number;
    puestoPerdedorAntes: number;
    puestoPerdedorDespues: number;
    notas: string | null;
    reportadoPor: string | null;
    createdAt: string;
};

export type PlayerRecord = {
    victorias: number;
    derrotas: number;
    jugados: number;
    games_a_favor: number;
    games_en_contra: number;
};

const COLUMNS =
    "id, ganador_id, perdedor_id, ganador_nombre, perdedor_nombre, sets_ganador, sets_perdedor, " +
    "puesto_ganador_antes, puesto_ganador_despues, puesto_perdedor_antes, puesto_perdedor_despues, " +
    "notas, reportado_por_nombre, created_at";

export type MatchFilter = {
    /** Devuelve los enfrentamientos donde el jugador ganó o perdió. */
    playerId?: string;
    limit?: number;
    offset?: number;
};

export async function fetchMatches({
                                       playerId,
                                       limit = 40,
                                       offset = 0,
                                   }: MatchFilter = {}): Promise<Match[]> {
    let query = supabase
        .from("matches")
        .select(COLUMNS)
        .order("created_at", {ascending: false})
        .range(offset, offset + limit - 1);

    if (playerId) {
        query = query.or(`ganador_id.eq.${playerId},perdedor_id.eq.${playerId}`);
    }

    const {data, error} = await query;
    if (error) throw new Error(error.message);
    // La lista de columnas es una constante concatenada, así que supabase-js no
    // puede inferir la forma de la fila; el mapeo la fija aquí.
    return (data as unknown as MatchRow[]).map(toMatch);
}

/** Récord acumulado; se cuenta en el servidor, no sobre la página visible. */
export async function fetchPlayerRecord(playerId: string): Promise<PlayerRecord> {
    const {data, error} = await supabase.rpc("player_record", {p_player_id: playerId});
    if (error) throw new Error(error.message);
    return data as PlayerRecord;
}

export type MatchReport = {
    challengeId: string;
    ganadorId: string;
    setsGanador: number | null;
    setsPerdedor: number | null;
    notas?: string;
};

/** Reporta el resultado de un reto: mueve el ranking y guarda el enfrentamiento. */
export async function reportMatch(report: MatchReport): Promise<void> {
    const {error} = await supabase.rpc("resolve_challenge", {
        p_challenge_id: report.challengeId,
        p_ganador_id: report.ganadorId,
        p_sets_ganador: report.setsGanador,
        p_sets_perdedor: report.setsPerdedor,
        p_notas: report.notas ?? null,
    });
    if (error) throw new Error(error.message);
}

export async function updateMatchScore(
    matchId: string,
    setsGanador: number,
    setsPerdedor: number,
    notas?: string
): Promise<void> {
    const {error} = await supabase.rpc("update_match_score", {
        p_match_id: matchId,
        p_sets_ganador: setsGanador,
        p_sets_perdedor: setsPerdedor,
        p_notas: notas ?? null,
    });
    if (error) throw new Error(error.message);
}
