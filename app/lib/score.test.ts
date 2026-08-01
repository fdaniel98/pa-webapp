import {parseScore} from "./score";

describe("parseScore", () => {
    it("acepta que no se registre marcador", () => {
        expect(parseScore("", "")).toEqual({ok: true, setsGanador: null, setsPerdedor: null});
    });

    it("trata los espacios en blanco como campo vacío", () => {
        expect(parseScore("   ", "  ")).toEqual({ok: true, setsGanador: null, setsPerdedor: null});
    });

    it("acepta un marcador válido", () => {
        expect(parseScore("3", "1")).toEqual({ok: true, setsGanador: 3, setsPerdedor: 1});
    });

    it("permite 0 para el perdedor", () => {
        expect(parseScore("2", "0")).toEqual({ok: true, setsGanador: 2, setsPerdedor: 0});
    });

    it("rechaza que sólo se rellene uno de los dos campos", () => {
        expect(parseScore("3", "")).toEqual({
            ok: false,
            error: "Escribe los dos marcadores o déjalos vacíos.",
        });
        expect(parseScore("", "1")).toEqual({
            ok: false,
            error: "Escribe los dos marcadores o déjalos vacíos.",
        });
    });

    it("rechaza el empate: en SF6 alguien tiene que ganar el set", () => {
        expect(parseScore("2", "2")).toEqual({
            ok: false,
            error: "El ganador debe tener más games que el perdedor.",
        });
    });

    it("rechaza que el ganador tenga menos games que el perdedor", () => {
        expect(parseScore("1", "3")).toEqual({
            ok: false,
            error: "El ganador debe tener más games que el perdedor.",
        });
    });

    it("rechaza decimales y texto", () => {
        expect(parseScore("2.5", "1").ok).toBe(false);
        expect(parseScore("tres", "1").ok).toBe(false);
    });

    it("rechaza negativos", () => {
        expect(parseScore("-1", "-3").ok).toBe(false);
    });
});
