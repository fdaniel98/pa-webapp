import {render, screen, waitFor} from "@testing-library/react";
import userEvent from "@testing-library/user-event";

jest.mock("~/lib/expired-challenges", () => ({
    fetchExpiredChallenges: jest.fn(),
    setExpiredChallengeReason: jest.fn(),
    MOTIVO_MAX: 300,
}));

import {ExpiredChallenges} from "./expired-challenges";
import type {ExpiredChallenge} from "~/lib/expired-challenges";
import {fetchExpiredChallenges, setExpiredChallengeReason} from "~/lib/expired-challenges";

const expirado: ExpiredChallenge = {
    id: "e1",
    retadorNombre: "EDGON",
    retadoNombre: "VALAK",
    causa: "vencido",
    expiraEn: Date.parse("2026-08-08T12:00:00.000Z"),
    cerradoEn: Date.parse("2026-08-08T12:05:00.000Z"),
    motivo: null,
    motivoPor: null,
    motivoEn: null,
};

beforeEach(() => {
    (fetchExpiredChallenges as jest.Mock).mockResolvedValue([]);
    (setExpiredChallengeReason as jest.Mock).mockResolvedValue(undefined);
});

describe("ExpiredChallenges", () => {
    it("muestra el estado vacío cuando ningún reto ha expirado", async () => {
        render(<ExpiredChallenges/>);
        expect(await screen.findByText("Ningún reto ha expirado todavía.")).toBeInTheDocument();
    });

    it("marca los retos que aún no tienen motivo", async () => {
        (fetchExpiredChallenges as jest.Mock).mockResolvedValue([expirado]);
        render(<ExpiredChallenges/>);

        expect(await screen.findByText("EDGON")).toBeInTheDocument();
        expect(screen.getByText("Venció")).toBeInTheDocument();
        expect(screen.getByText("Sin motivo registrado.")).toBeInTheDocument();
        expect(screen.getByRole("button", {name: /añadir motivo/i})).toBeInTheDocument();
    });

    it("guarda el motivo que se escribe después de la expiración", async () => {
        (fetchExpiredChallenges as jest.Mock).mockResolvedValue([expirado]);
        const user = userEvent.setup();
        render(<ExpiredChallenges/>);

        await user.click(await screen.findByRole("button", {name: /añadir motivo/i}));
        await user.type(screen.getByLabelText(/motivo de la expiración/i), "Nadie coordinó la fecha");
        await user.click(screen.getByRole("button", {name: /guardar motivo/i}));

        await waitFor(() =>
            expect(setExpiredChallengeReason).toHaveBeenCalledWith("e1", "Nadie coordinó la fecha")
        );
        // Tras guardar se re-consulta para traer quién y cuándo lo anotó.
        expect(fetchExpiredChallenges).toHaveBeenLastCalledWith({limit: 20, offset: 0});
    });

    it("permite editar un motivo ya escrito partiendo del texto actual", async () => {
        (fetchExpiredChallenges as jest.Mock).mockResolvedValue([
            {...expirado, motivo: "Viaje", motivoPor: "DANIEL", motivoEn: Date.now()},
        ]);
        const user = userEvent.setup();
        render(<ExpiredChallenges/>);

        expect(await screen.findByText("Viaje")).toBeInTheDocument();
        expect(screen.getByText(/anotó DANIEL/)).toBeInTheDocument();

        await user.click(screen.getByRole("button", {name: /editar motivo/i}));
        expect(screen.getByLabelText(/motivo de la expiración/i)).toHaveValue("Viaje");
    });

    it("muestra el error si falla el guardado", async () => {
        (fetchExpiredChallenges as jest.Mock).mockResolvedValue([expirado]);
        (setExpiredChallengeReason as jest.Mock).mockRejectedValue(
            new Error("Sólo un administrador puede modificar el ranking.")
        );
        const user = userEvent.setup();
        render(<ExpiredChallenges/>);

        await user.click(await screen.findByRole("button", {name: /añadir motivo/i}));
        await user.type(screen.getByLabelText(/motivo de la expiración/i), "Lesión");
        await user.click(screen.getByRole("button", {name: /guardar motivo/i}));

        expect(
            await screen.findByText("Sólo un administrador puede modificar el ranking.")
        ).toBeInTheDocument();
    });

    it("ofrece cargar más sólo cuando la página viene llena", async () => {
        const pagina = Array.from({length: 20}, (_, i) => ({...expirado, id: `e${i}`}));
        (fetchExpiredChallenges as jest.Mock).mockResolvedValue(pagina);
        const user = userEvent.setup();
        render(<ExpiredChallenges/>);

        await user.click(await screen.findByRole("button", {name: /cargar más/i}));

        await waitFor(() =>
            expect(fetchExpiredChallenges).toHaveBeenLastCalledWith({limit: 20, offset: 20})
        );
    });
});
