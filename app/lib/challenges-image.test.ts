import {altoImagenRetos, filasParaImagenRetos} from "./challenges-image";
import type {Challenge, Player} from "./ranking";

const DIA = 1000 * 60 * 60 * 24;
const AHORA = Date.parse("2026-08-01T12:00:00.000Z");

function jugador(id: string, nombre: string, rango: number): Player {
    return {id, nombre, rangoActual: rango, rangoAnterior: rango, cooldownHasta: null, email: null};
}

function reto(id: string, retadorId: string, retadoId: string, diasParaExpirar: number): Challenge {
    return {
        id,
        retadorId,
        retadoId,
        creadoEn: AHORA - (7 - diasParaExpirar) * DIA,
        expiraEn: AHORA + diasParaExpirar * DIA,
    };
}

const jugadores = [
    jugador("p1", "VALAK", 1),
    jugador("p2", "EDGON", 2),
    jugador("p3", "YEYÉ", 3),
    jugador("p4", "BRITO", 4),
];

describe("filasParaImagenRetos", () => {
    it("dice qué puesto se disputa: el del retado", () => {
        const [fila] = filasParaImagenRetos([reto("c1", "p2", "p1", 5)], jugadores, AHORA);
        expect(fila.retador).toBe("EDGON");
        expect(fila.puestoRetador).toBe(2);
        expect(fila.retado).toBe("VALAK");
        expect(fila.puestoRetado).toBe(1);
        expect(fila.puestoEnJuego).toBe(1);
    });

    it("lleva las dos fechas ya formateadas", () => {
        const [fila] = filasParaImagenRetos([reto("c1", "p2", "p1", 5)], jugadores, AHORA);
        expect(fila.lanzado).toBe(new Date(AHORA - 2 * DIA).toLocaleDateString());
        expect(fila.expira).toBe(new Date(AHORA + 5 * DIA).toLocaleDateString());
    });

    it("ordena por caducidad: primero el que menos aguanta", () => {
        const filas = filasParaImagenRetos(
            [reto("c1", "p2", "p1", 6), reto("c2", "p4", "p3", 1)],
            jugadores,
            AHORA
        );
        expect(filas.map((f) => f.retador)).toEqual(["BRITO", "EDGON"]);
    });

    it("marca como urgente el reto al que le quedan dos días o menos", () => {
        const filas = filasParaImagenRetos(
            [reto("c1", "p2", "p1", 2), reto("c2", "p4", "p3", 3)],
            jugadores,
            AHORA
        );
        expect(filas[0]).toMatchObject({diasRestantes: 2, urgente: true});
        expect(filas[1]).toMatchObject({diasRestantes: 3, urgente: false});
    });

    it("descarta el reto cuyo jugador ya no está en el ranking", () => {
        const filas = filasParaImagenRetos([reto("c1", "p2", "fantasma", 4)], jugadores, AHORA);
        expect(filas).toEqual([]);
    });

    it("no modifica la lista que recibe", () => {
        const retos = [reto("c1", "p2", "p1", 6), reto("c2", "p4", "p3", 1)];
        filasParaImagenRetos(retos, jugadores, AHORA);
        expect(retos.map((r) => r.id)).toEqual(["c1", "c2"]);
    });
});

describe("altoImagenRetos", () => {
    it("crece una fila cada vez", () => {
        expect(altoImagenRetos(4) - altoImagenRetos(3)).toBe(altoImagenRetos(2) - altoImagenRetos(1));
    });

    it("deja sitio al título aunque no haya retos", () => {
        expect(altoImagenRetos(0)).toBeGreaterThan(0);
    });
});
