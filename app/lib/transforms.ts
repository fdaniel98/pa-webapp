// Conversión de filas de Postgres (snake_case, fechas ISO) a los tipos que usa la
// interfaz (camelCase, epoch en ms). Sin dependencias en tiempo de ejecución: los
// `import type` se borran al compilar, así que este módulo no arrastra el cliente
// de Supabase y se puede probar aislado.

import type {Challenge, HistoryEntry, Player} from "./ranking";
import type {Match} from "./matches";

export type PlayerRow = {
    id: string;
    nombre: string;
    rango_actual: number;
    rango_anterior: number;
    cooldown_hasta: string | null;
    email: string | null;
};

export type ChallengeRow = {
    id: string;
    retador_id: string;
    retado_id: string;
    expira_en: string;
};

export type HistoryRow = {
    id: string;
    texto: string;
    created_at: string;
};

export type MatchRow = {
    id: string;
    ganador_id: string | null;
    perdedor_id: string | null;
    ganador_nombre: string;
    perdedor_nombre: string;
    sets_ganador: number | null;
    sets_perdedor: number | null;
    puesto_ganador_antes: number;
    puesto_ganador_despues: number;
    puesto_perdedor_antes: number;
    puesto_perdedor_despues: number;
    notas: string | null;
    reportado_por_nombre: string | null;
    created_at: string;
};

export function toPlayer(row: PlayerRow): Player {
    return {
        id: row.id,
        nombre: row.nombre,
        rangoActual: row.rango_actual,
        rangoAnterior: row.rango_anterior,
        cooldownHasta: row.cooldown_hasta ? new Date(row.cooldown_hasta).getTime() : null,
        email: row.email,
    };
}

export function toChallenge(row: ChallengeRow): Challenge {
    return {
        id: row.id,
        retadorId: row.retador_id,
        retadoId: row.retado_id,
        expiraEn: new Date(row.expira_en).getTime(),
    };
}

export function toHistoryEntry(row: HistoryRow): HistoryEntry {
    return {
        id: row.id,
        fecha: new Date(row.created_at).toLocaleDateString(),
        texto: row.texto,
    };
}

export function toMatch(row: MatchRow): Match {
    return {
        id: row.id,
        ganadorId: row.ganador_id,
        perdedorId: row.perdedor_id,
        ganadorNombre: row.ganador_nombre,
        perdedorNombre: row.perdedor_nombre,
        setsGanador: row.sets_ganador,
        setsPerdedor: row.sets_perdedor,
        puestoGanadorAntes: row.puesto_ganador_antes,
        puestoGanadorDespues: row.puesto_ganador_despues,
        puestoPerdedorAntes: row.puesto_perdedor_antes,
        puestoPerdedorDespues: row.puesto_perdedor_despues,
        notas: row.notas,
        reportadoPor: row.reportado_por_nombre,
        createdAt: row.created_at,
    };
}
