import {render, screen, waitFor} from "@testing-library/react";
import userEvent from "@testing-library/user-event";

jest.mock("~/lib/matches", () => ({
    fetchMatches: jest.fn(),
    fetchPlayerRecord: jest.fn(),
}));

import {MatchHistory} from "./match-history";
import type {Match, PlayerRecord} from "~/lib/matches";
import {fetchMatches, fetchPlayerRecord} from "~/lib/matches";
import type {Player} from "~/lib/ranking";

const jugadores: Player[] = [
    {id: "p1", nombre: "VALAK", rangoActual: 1, rangoAnterior: 2, cooldownHasta: null, email: null},
    {id: "p2", nombre: "EDGON", rangoActual: 2, rangoAnterior: 1, cooldownHasta: null, email: null},
];

const enfrentamiento: Match = {
    id: "m1",
    ganadorId: "p1", perdedorId: "p2",
    ganadorNombre: "VALAK", perdedorNombre: "EDGON",
    setsGanador: 3, setsPerdedor: 1,
    puestoGanadorAntes: 2, puestoGanadorDespues: 1,
    puestoPerdedorAntes: 1, puestoPerdedorDespues: 2,
    notas: null, reportadoPor: "DANIEL",
    createdAt: "2026-08-01T10:00:00.000Z",
};

const record: PlayerRecord = {
    victorias: 3, derrotas: 1, jugados: 4, games_a_favor: 10, games_en_contra: 5,
};

beforeEach(() => {
    (fetchMatches as jest.Mock).mockResolvedValue([]);
    (fetchPlayerRecord as jest.Mock).mockResolvedValue(record);
});

describe("MatchHistory", () => {
    it("muestra el estado vacío cuando no hay enfrentamientos", async () => {
        render(<MatchHistory jugadores={jugadores}/>);
        expect(
            await screen.findByText("Todavía no se ha resuelto ningún reto.")
        ).toBeInTheDocument();
    });

    it("pide todos los enfrentamientos al montarse, sin filtro de jugador", async () => {
        render(<MatchHistory jugadores={jugadores}/>);
        await waitFor(() => expect(fetchMatches).toHaveBeenCalled());

        expect(fetchMatches).toHaveBeenCalledWith({playerId: undefined, limit: 40, offset: 0});
        // Sin jugador seleccionado no tiene sentido pedir un récord.
        expect(fetchPlayerRecord).not.toHaveBeenCalled();
    });

    it("pinta el marcador y el movimiento de puestos", async () => {
        (fetchMatches as jest.Mock).mockResolvedValue([enfrentamiento]);
        render(<MatchHistory jugadores={jugadores}/>);

        expect(await screen.findByText("VALAK")).toBeInTheDocument();
        expect(screen.getByText("3-1")).toBeInTheDocument();
        expect(screen.getByText("#2 → #1")).toBeInTheDocument();
        expect(screen.getByText("#1 → #2")).toBeInTheDocument();
    });

    it("indica cuando el reto se resolvió sin marcador", async () => {
        (fetchMatches as jest.Mock).mockResolvedValue([
            {...enfrentamiento, setsGanador: null, setsPerdedor: null},
        ]);
        render(<MatchHistory jugadores={jugadores}/>);
        expect(await screen.findByText("sin marcador")).toBeInTheDocument();
    });

    it("al filtrar por jugador consulta su récord y lo muestra", async () => {
        (fetchMatches as jest.Mock).mockResolvedValue([enfrentamiento]);
        const user = userEvent.setup();
        render(<MatchHistory jugadores={jugadores}/>);
        await screen.findByText("3-1");

        await user.selectOptions(screen.getByLabelText(/filtrar por jugador/i), "p1");

        await waitFor(() =>
            expect(fetchPlayerRecord).toHaveBeenCalledWith("p1")
        );
        expect(fetchMatches).toHaveBeenLastCalledWith({playerId: "p1", limit: 40, offset: 0});
        expect(await screen.findByText("3V - 1D")).toBeInTheDocument();
        expect(screen.getByText("10 - 5")).toBeInTheDocument();
    });

    it("muestra el error si falla la consulta", async () => {
        (fetchMatches as jest.Mock).mockRejectedValue(new Error("permission denied"));
        render(<MatchHistory jugadores={jugadores}/>);
        expect(await screen.findByText("permission denied")).toBeInTheDocument();
    });

    it("ofrece cargar más sólo cuando la página viene llena", async () => {
        const pagina = Array.from({length: 40}, (_, i) => ({...enfrentamiento, id: `m${i}`}));
        (fetchMatches as jest.Mock).mockResolvedValue(pagina);
        const user = userEvent.setup();
        render(<MatchHistory jugadores={jugadores}/>);

        const boton = await screen.findByRole("button", {name: /cargar más/i});
        await user.click(boton);

        await waitFor(() =>
            expect(fetchMatches).toHaveBeenLastCalledWith({
                playerId: undefined, limit: 40, offset: 40,
            })
        );
    });
});
