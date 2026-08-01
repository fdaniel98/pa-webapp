// Separado de auth.tsx a propósito: aquí no se importa el cliente de Supabase,
// así que la traducción de errores se puede probar sin sesión ni variables de entorno.

const ERROR_MESSAGES: Record<string, string> = {
    "Invalid login credentials": "Correo o contraseña incorrectos.",
    "Email not confirmed": "Debes confirmar tu correo antes de iniciar sesión.",
    "User already registered": "Ya existe una cuenta con ese correo.",
    "A user with this email address has already been registered":
        "Ya existe una cuenta con ese correo.",
    "Password should be at least 6 characters":
        "La contraseña debe tener al menos 6 caracteres.",
    "New password should be different from the old password":
        "La nueva contraseña debe ser distinta a la anterior.",
    "Email rate limit exceeded":
        "Demasiados intentos. Espera unos minutos antes de volver a intentarlo.",
};

/** Traduce los errores de Supabase a mensajes en español para el usuario. */
export function authErrorMessage(error: unknown): string {
    const raw = error instanceof Error ? error.message : String(error);
    return ERROR_MESSAGES[raw] ?? raw;
}
