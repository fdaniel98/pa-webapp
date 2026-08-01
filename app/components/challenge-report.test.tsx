import {render, screen} from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import {ChallengeReport} from "./challenge-report";
import type {Challenge, Player} from "~/lib/ranking";

// Este componente sólo importa tipos de ~/lib/ranking y ~/lib/matches, y esos
// imports se borran al compilar: no hace falta simular nada.

const retador: Player = {
    id: "p2", nombre: "EDGON", rangoActual: 2, rangoAnterior: 2, cooldownHasta: null, email: null,
};
const retado: Player = {
    id: "p1", nombre: "VALAK", rangoActual: 1, rangoAnterior: 1, cooldownHasta: null, email: null,
};
const reto: Challenge = {
    id: "c1", retadorId: "p2", retadoId: "p1",
    creadoEn: Date.now() - 2 * 24 * 60 * 60 * 1000,
    expiraEn: Date.now() + 5 * 24 * 60 * 60 * 1000,
};

function montar(destacado = false) {
    const onReport = jest.fn();
    const onCancel = jest.fn();
    render(
        <ChallengeReport reto={reto} retador={retador} retado={retado} destacado={destacado}
                         onReport={onReport} onCancel={onCancel}/>
    );
    return {onReport, onCancel, user: userEvent.setup()};
}

// jsdom no implementa scrollIntoView.
const scrollIntoView = jest.fn();
beforeAll(() => {
    Element.prototype.scrollIntoView = scrollIntoView;
});

describe("ChallengeReport", () => {
    it("muestra a los dos jugadores y los días que faltan", () => {
        montar();
        expect(screen.getByText("EDGON", {selector: "strong"})).toBeInTheDocument();
        expect(screen.getByText("VALAK", {selector: "strong"})).toBeInTheDocument();
        expect(screen.getByText(/Expira en 5 días/)).toBeInTheDocument();
    });

    it("exige elegir ganador antes de reportar", async () => {
        const {onReport, user} = montar();
        await user.click(screen.getByRole("button", {name: /reportar resultado/i}));
        expect(await screen.findByText("Selecciona quién ganó el reto.")).toBeInTheDocument();
        expect(onReport).not.toHaveBeenCalled();
    });

    it("reporta con marcador", async () => {
        const {onReport, user} = montar();
        await user.selectOptions(screen.getByLabelText(/quién ganó/i), "p1");
        await user.type(screen.getByLabelText(/games del ganador/i), "3");
        await user.type(screen.getByLabelText(/games de EDGON/i), "1");
        await user.click(screen.getByRole("button", {name: /reportar resultado/i}));

        expect(onReport).toHaveBeenCalledWith({
            challengeId: "c1", ganadorId: "p1",
            setsGanador: 3, setsPerdedor: 1, notas: "",
        });
    });

    it("permite reportar sólo quién ganó, sin marcador", async () => {
        const {onReport, user} = montar();
        await user.selectOptions(screen.getByLabelText(/quién ganó/i), "p2");
        await user.click(screen.getByRole("button", {name: /reportar resultado/i}));

        expect(onReport).toHaveBeenCalledWith(
            expect.objectContaining({ganadorId: "p2", setsGanador: null, setsPerdedor: null})
        );
    });

    it("rechaza rellenar sólo un marcador", async () => {
        const {onReport, user} = montar();
        await user.selectOptions(screen.getByLabelText(/quién ganó/i), "p1");
        await user.type(screen.getByLabelText(/games del ganador/i), "3");
        await user.click(screen.getByRole("button", {name: /reportar resultado/i}));

        expect(
            await screen.findByText("Escribe los dos marcadores o déjalos vacíos.")
        ).toBeInTheDocument();
        expect(onReport).not.toHaveBeenCalled();
    });

    it("rechaza que el ganador tenga menos games", async () => {
        const {onReport, user} = montar();
        await user.selectOptions(screen.getByLabelText(/quién ganó/i), "p1");
        await user.type(screen.getByLabelText(/games del ganador/i), "1");
        await user.type(screen.getByLabelText(/games de EDGON/i), "3");
        await user.click(screen.getByRole("button", {name: /reportar resultado/i}));

        expect(
            await screen.findByText("El ganador debe tener más games que el perdedor.")
        ).toBeInTheDocument();
        expect(onReport).not.toHaveBeenCalled();
    });

    it("no se mueve solo cuando no es el reto elegido", () => {
        montar();
        expect(scrollIntoView).not.toHaveBeenCalled();
        expect(screen.getByLabelText(/quién ganó/i)).not.toHaveFocus();
    });

    it("se busca solo y toma el foco cuando llega desde Retos Vigentes", () => {
        montar(true);
        expect(scrollIntoView).toHaveBeenCalled();
        expect(screen.getByLabelText(/quién ganó/i)).toHaveFocus();
    });

    it("cancela el reto sin reportar", async () => {
        const {onReport, onCancel, user} = montar();
        await user.click(screen.getByRole("button", {name: /cancelar reto/i}));
        expect(onCancel).toHaveBeenCalledWith("c1");
        expect(onReport).not.toHaveBeenCalled();
    });
});
