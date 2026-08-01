import {authErrorMessage} from "./auth-errors";

describe("authErrorMessage", () => {
    it("traduce los errores conocidos de Supabase", () => {
        expect(authErrorMessage(new Error("Invalid login credentials"))).toBe(
            "Correo o contraseña incorrectos."
        );
        expect(authErrorMessage(new Error("Email not confirmed"))).toBe(
            "Debes confirmar tu correo antes de iniciar sesión."
        );
    });

    it("traduce las dos variantes de correo ya registrado", () => {
        const esperado = "Ya existe una cuenta con ese correo.";
        expect(authErrorMessage(new Error("User already registered"))).toBe(esperado);
        expect(
            authErrorMessage(new Error("A user with this email address has already been registered"))
        ).toBe(esperado);
    });

    it("devuelve el mensaje original si no hay traducción", () => {
        expect(authErrorMessage(new Error("Something unexpected"))).toBe("Something unexpected");
    });

    it("acepta valores que no son Error", () => {
        expect(authErrorMessage("Invalid login credentials")).toBe(
            "Correo o contraseña incorrectos."
        );
        expect(authErrorMessage(null)).toBe("null");
    });
});
