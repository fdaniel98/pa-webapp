import {supabase} from "./supabase";
import type {ExpiredChallengeRow} from "./transforms";
import {toExpiredChallenge} from "./transforms";

/** Reto que se cerró sin jugarse: venció el plazo o un admin lo canceló. */
export type ExpiredChallenge = {
    id: string;
    retadorNombre: string;
    retadoNombre: string;
    causa: "vencido" | "cancelado";
    /** Epoch en ms. */
    expiraEn: number;
    /** Epoch en ms. */
    cerradoEn: number;
    /** Null mientras nadie haya explicado por qué no se jugó. */
    motivo: string | null;
    motivoPor: string | null;
    motivoEn: number | null;
};

const COLUMNS =
    "id, retador_nombre, retado_nombre, causa, expira_en, cerrado_en, " +
    "motivo, motivo_por_nombre, motivo_en";

export const MOTIVO_MAX = 300;

export type ExpiredChallengeFilter = {
    limit?: number;
    offset?: number;
};

export async function fetchExpiredChallenges({
                                                limit = 20,
                                                offset = 0,
                                            }: ExpiredChallengeFilter = {}): Promise<ExpiredChallenge[]> {
    const {data, error} = await supabase
        .from("expired_challenges")
        .select(COLUMNS)
        .order("cerrado_en", {ascending: false})
        .range(offset, offset + limit - 1);

    if (error) throw new Error(error.message);
    // La lista de columnas es una constante concatenada, así que supabase-js no
    // puede inferir la forma de la fila; el mapeo la fija aquí.
    return (data as unknown as ExpiredChallengeRow[]).map(toExpiredChallenge);
}

/** Guarda el motivo. Con texto vacío el reto vuelve a quedar sin motivo. */
export async function setExpiredChallengeReason(id: string, motivo: string): Promise<void> {
    const {error} = await supabase.rpc("set_expired_challenge_reason", {
        p_id: id,
        p_motivo: motivo,
    });
    if (error) throw new Error(error.message);
}
