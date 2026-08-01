import {render, screen, waitFor} from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// Se simulan los módulos de acceso a datos, no el cliente de Supabase: así
// app/lib/supabase.ts (que usa import.meta.env, ajeno a Jest) nunca se carga.
jest.mock("~/lib/users", () => ({
    listProfiles: jest.fn(),
    createUser: jest.fn(),
    setProfileRole: jest.fn(),
    deleteUser: jest.fn(),
}));
jest.mock("~/lib/auth", () => ({
    useAuth: jest.fn(),
}));

import {UserAdmin} from "./user-admin";
import type {Profile} from "~/lib/auth";
import {useAuth} from "~/lib/auth";
import {createUser, deleteUser, listProfiles, setProfileRole} from "~/lib/users";

const yo: Profile = {
    id: "u1", email: "admin@pa.com", full_name: "DANIEL",
    role: "admin", created_at: "2026-07-31T00:00:00.000Z",
};
const otro: Profile = {
    id: "u2", email: "valak@pa.com", full_name: "VALAK",
    role: "member", created_at: "2026-08-01T00:00:00.000Z",
};

/** Ejecuta la acción de confirmación de inmediato, como si se pulsara "Confirmar". */
const confirmarSiempre = jest.fn((_mensaje: string, accion: () => void) => accion());

function montar() {
    (useAuth as jest.Mock).mockReturnValue({user: {id: "u1"}});
    render(<UserAdmin onConfirm={confirmarSiempre}/>);
    return userEvent.setup();
}

beforeEach(() => {
    (listProfiles as jest.Mock).mockResolvedValue([yo, otro]);
});

describe("UserAdmin", () => {
    it("lista las cuentas al montarse", async () => {
        montar();
        expect(await screen.findByText("VALAK")).toBeInTheDocument();
        expect(screen.getByText(/Cuentas registradas \(2\)/)).toBeInTheDocument();
        expect(listProfiles).toHaveBeenCalledTimes(1);
    });

    it("no deja cambiar el rol ni borrar la propia cuenta", async () => {
        montar();
        await screen.findByText("DANIEL");

        // La fila propia se marca con "(tú)" y no ofrece select ni botón.
        expect(screen.getByText("(tú)")).toBeInTheDocument();
        expect(screen.getAllByRole("combobox", {name: /rol de/i})).toHaveLength(1);
        expect(screen.getAllByRole("button", {name: /eliminar/i})).toHaveLength(1);
    });

    it("exige contraseña de al menos 8 caracteres", async () => {
        const user = montar();
        await screen.findByText("VALAK");

        await user.type(screen.getByLabelText(/nombre de jugador/i), "NUEVO");
        await user.type(screen.getByLabelText(/correo electrónico/i), "nuevo@pa.com");
        await user.type(screen.getByLabelText(/contraseña temporal/i), "corta");
        await user.click(screen.getByRole("button", {name: /crear cuenta/i}));

        expect(
            await screen.findByText("La contraseña debe tener al menos 8 caracteres.")
        ).toBeInTheDocument();
        expect(createUser).not.toHaveBeenCalled();
    });

    it("crea la cuenta con los datos del formulario y recarga la lista", async () => {
        (createUser as jest.Mock).mockResolvedValue({...otro, full_name: "NUEVO"});
        const user = montar();
        await screen.findByText("VALAK");

        await user.type(screen.getByLabelText(/nombre de jugador/i), "NUEVO");
        await user.type(screen.getByLabelText(/correo electrónico/i), "nuevo@pa.com");
        await user.type(screen.getByLabelText(/contraseña temporal/i), "contrasena-larga");
        await user.selectOptions(screen.getByLabelText(/^rol$/i), "admin");
        await user.click(screen.getByRole("button", {name: /crear cuenta/i}));

        await waitFor(() =>
            expect(createUser).toHaveBeenCalledWith({
                fullName: "NUEVO",
                email: "nuevo@pa.com",
                password: "contrasena-larga",
                role: "admin",
            })
        );
        expect(listProfiles).toHaveBeenCalledTimes(2);
    });

    it("muestra el error que devuelve la Edge Function", async () => {
        (createUser as jest.Mock).mockRejectedValue(
            new Error("Sólo un administrador puede crear cuentas.")
        );
        const user = montar();
        await screen.findByText("VALAK");

        await user.type(screen.getByLabelText(/nombre de jugador/i), "NUEVO");
        await user.type(screen.getByLabelText(/correo electrónico/i), "nuevo@pa.com");
        await user.type(screen.getByLabelText(/contraseña temporal/i), "contrasena-larga");
        await user.click(screen.getByRole("button", {name: /crear cuenta/i}));

        expect(
            await screen.findByText("Sólo un administrador puede crear cuentas.")
        ).toBeInTheDocument();
    });

    it("pide confirmación antes de cambiar un rol", async () => {
        (setProfileRole as jest.Mock).mockResolvedValue(undefined);
        const user = montar();
        await screen.findByText("VALAK");

        await user.selectOptions(screen.getByRole("combobox", {name: /rol de VALAK/i}), "admin");

        expect(confirmarSiempre).toHaveBeenCalledWith(
            expect.stringContaining("administrador"),
            expect.any(Function)
        );
        await waitFor(() => expect(setProfileRole).toHaveBeenCalledWith("u2", "admin"));
    });

    it("pide confirmación antes de eliminar una cuenta", async () => {
        (deleteUser as jest.Mock).mockResolvedValue(undefined);
        const user = montar();
        await screen.findByText("VALAK");

        await user.click(screen.getByRole("button", {name: /eliminar/i}));

        expect(confirmarSiempre).toHaveBeenCalledWith(
            expect.stringContaining("no se puede deshacer"),
            expect.any(Function)
        );
        await waitFor(() => expect(deleteUser).toHaveBeenCalledWith("u2"));
    });

    it("genera una contraseña de al menos 8 caracteres", async () => {
        const user = montar();
        await screen.findByText("VALAK");

        const campo = screen.getByLabelText(/contraseña temporal/i) as HTMLInputElement;
        expect(campo.value).toBe("");

        await user.click(screen.getByRole("button", {name: /generar/i}));
        expect(campo.value.length).toBeGreaterThanOrEqual(8);
    });
});
