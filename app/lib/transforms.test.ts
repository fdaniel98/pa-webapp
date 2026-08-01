import {toChallenge, toMatch, toPlayer} from "./transforms";
import type {ChallengeRow, MatchRow, PlayerRow} from "./transforms";

const jugadorBase: PlayerRow = {
    id: "p1",
    nombre: "VALAK",
    rango_actual: 1,
    rango_anterior: 3,
    cooldown_hasta: null,
    email: null,
};

describe("toPlayer", () => {
    it("pasa de snake_case a camelCase", () => {
        expect(toPlayer(jugadorBase)).toEqual({
            id: "p1",
            nombre: "VALAK",
            rangoActual: 1,
            rangoAnterior: 3,
            cooldownHasta: null,
            email: null,
        });
    });

    it("convierte el enfriamiento a epoch en ms", () => {
        const row = {...jugadorBase, cooldown_hasta: "2026-08-08T12:00:00.000Z"};
        expect(toPlayer(row).cooldownHasta).toBe(Date.parse("2026-08-08T12:00:00.000Z"));
    });

    it("deja null el enfriamiento cuando no hay inmunidad", () => {
        expect(toPlayer(jugadorBase).cooldownHasta).toBeNull();
    });
});

describe("toChallenge", () => {
    const reto: ChallengeRow = {
        id: "c1",
        retador_id: "p2",
        retado_id: "p1",
        expira_en: "2026-08-08T12:00:00.000Z",
    };

    it("mapea los identificadores y la caducidad", () => {
        expect(toChallenge(reto)).toEqual({
            id: "c1",
            retadorId: "p2",
            retadoId: "p1",
            expiraEn: Date.parse("2026-08-08T12:00:00.000Z"),
        });
    });
});

describe("toMatch", () => {
    const enfrentamiento: MatchRow = {
        id: "m1",
        ganador_id: "p2",
        perdedor_id: "p1",
        ganador_nombre: "EDGON",
        perdedor_nombre: "VALAK",
        sets_ganador: 3,
        sets_perdedor: 1,
        puesto_ganador_antes: 2,
        puesto_ganador_despues: 1,
        puesto_perdedor_antes: 1,
        puesto_perdedor_despues: 2,
        notas: null,
        reportado_por_nombre: "DANIEL",
        created_at: "2026-08-01T10:00:00.000Z",
    };

    it("conserva el marcador y el movimiento de puestos", () => {
        const m = toMatch(enfrentamiento);
        expect(m.setsGanador).toBe(3);
        expect(m.setsPerdedor).toBe(1);
        expect(m.puestoGanadorAntes).toBe(2);
        expect(m.puestoGanadorDespues).toBe(1);
    });

    it("admite enfrentamientos sin marcador registrado", () => {
        const m = toMatch({...enfrentamiento, sets_ganador: null, sets_perdedor: null});
        expect(m.setsGanador).toBeNull();
        expect(m.setsPerdedor).toBeNull();
    });

    it("mantiene los nombres aunque el jugador ya no exista", () => {
        const m = toMatch({...enfrentamiento, ganador_id: null, perdedor_id: null});
        expect(m.ganadorId).toBeNull();
        expect(m.ganadorNombre).toBe("EDGON");
        expect(m.perdedorNombre).toBe("VALAK");
    });
});
