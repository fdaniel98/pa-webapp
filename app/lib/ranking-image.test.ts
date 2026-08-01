import {altoImagen, cambioDePuesto, filasParaImagen} from "./ranking-image";
import {nombreArchivo} from "./image-export";
import type {Player} from "./ranking";

function jugador(nombre: string, actual: number, anterior: number): Player {
    return {
        id: nombre,
        nombre,
        rangoActual: actual,
        rangoAnterior: anterior,
        cooldownHasta: null,
        email: null,
    };
}

describe("cambioDePuesto", () => {
    it("marca la subida con el número de puestos ganados", () => {
        expect(cambioDePuesto(jugador("VALAK", 1, 3))).toEqual({texto: "▲ +2", tendencia: "sube"});
    });

    it("marca la bajada", () => {
        expect(cambioDePuesto(jugador("EDGON", 4, 2))).toEqual({texto: "▼ -2", tendencia: "baja"});
    });

    it("deja un guion cuando el puesto no cambió", () => {
        expect(cambioDePuesto(jugador("BRITO", 5, 5))).toEqual({texto: "-", tendencia: "igual"});
    });
});

describe("filasParaImagen", () => {
    it("ordena por puesto aunque la lista venga desordenada", () => {
        const filas = filasParaImagen([
            jugador("BRITO", 3, 3),
            jugador("VALAK", 1, 2),
            jugador("EDGON", 2, 1),
        ]);
        expect(filas.map((f) => f.nombre)).toEqual(["VALAK", "EDGON", "BRITO"]);
        expect(filas.map((f) => f.puesto)).toEqual([1, 2, 3]);
    });

    it("no modifica la lista que recibe", () => {
        const jugadores = [jugador("BRITO", 3, 3), jugador("VALAK", 1, 1)];
        filasParaImagen(jugadores);
        expect(jugadores.map((j) => j.nombre)).toEqual(["BRITO", "VALAK"]);
    });

    it("lleva el cambio ya formateado", () => {
        const [fila] = filasParaImagen([jugador("VALAK", 1, 4)]);
        expect(fila.cambio).toBe("▲ +3");
        expect(fila.tendencia).toBe("sube");
    });
});

describe("altoImagen", () => {
    it("crece una fila cada vez", () => {
        expect(altoImagen(11) - altoImagen(10)).toBe(altoImagen(2) - altoImagen(1));
    });

    it("reserva sitio para el título aunque no haya jugadores", () => {
        expect(altoImagen(0)).toBeGreaterThan(0);
    });
});

describe("nombreArchivo", () => {
    it("lleva la fecha con ceros a la izquierda", () => {
        expect(nombreArchivo("ranking-puello-academy", new Date(2026, 7, 1)))
            .toBe("ranking-puello-academy-2026-08-01.png");
    });

    it("distingue las dos exportaciones por el prefijo", () => {
        expect(nombreArchivo("retos-puello-academy", new Date(2026, 11, 25)))
            .toBe("retos-puello-academy-2026-12-25.png");
    });
});
