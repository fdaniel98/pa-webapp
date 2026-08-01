// Validación del marcador SF6. Vive aparte del formulario para poder probarla
// sin montar React y para que la regla sea una sola: Postgres aplica la misma.

export type ScoreResult =
    | { ok: true; setsGanador: number | null; setsPerdedor: number | null }
    | { ok: false; error: string };

/**
 * Interpreta los dos campos del marcador tal como llegan del formulario.
 * El marcador es opcional, pero o se registran los dos o ninguno.
 */
export function parseScore(ganadorRaw: string, perdedorRaw: string): ScoreResult {
    const g = ganadorRaw.trim();
    const p = perdedorRaw.trim();

    if (g === "" && p === "") {
        return {ok: true, setsGanador: null, setsPerdedor: null};
    }
    if (g === "" || p === "") {
        return {ok: false, error: "Escribe los dos marcadores o déjalos vacíos."};
    }

    const setsGanador = Number(g);
    const setsPerdedor = Number(p);

    if (!Number.isInteger(setsGanador) || !Number.isInteger(setsPerdedor)) {
        return {ok: false, error: "Los marcadores deben ser números enteros positivos."};
    }
    if (setsGanador < 0 || setsPerdedor < 0) {
        return {ok: false, error: "Los marcadores deben ser números enteros positivos."};
    }
    if (setsGanador <= setsPerdedor) {
        return {ok: false, error: "El ganador debe tener más games que el perdedor."};
    }

    return {ok: true, setsGanador, setsPerdedor};
}
