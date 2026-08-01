import {useState} from "react";
import {Link, useNavigate} from "react-router";
import {motion} from "motion/react";

import type {Route} from "./+types/update-password";
import {AuthShell, FormMessage, FullScreenMessage} from "~/components/auth-shell";
import {PasswordInput} from "~/components/password-input";
import {authErrorMessage, useAuth} from "~/lib/auth";
import {HOVER_WIDE, TAP} from "~/lib/motion";
import {BTN_PRIMARY, LABEL, LINK} from "~/lib/theme";

export function meta({}: Route.MetaArgs) {
    return [{title: "Nueva contraseña - Puello Academy"}];
}

const MIN_PASSWORD_LENGTH = 8;

export default function UpdatePassword() {
    const navigate = useNavigate();
    // El enlace de recuperación crea una sesión temporal al abrir esta página.
    const {session, loading, updatePassword} = useAuth();

    const [password, setPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [error, setError] = useState<string | null>(null);
    const [submitting, setSubmitting] = useState(false);

    async function handleSubmit(event: React.FormEvent) {
        event.preventDefault();
        setError(null);

        if (password.length < MIN_PASSWORD_LENGTH) {
            setError(`La contraseña debe tener al menos ${MIN_PASSWORD_LENGTH} caracteres.`);
            return;
        }
        if (password !== confirmPassword) {
            setError("Las contraseñas no coinciden.");
            return;
        }

        setSubmitting(true);
        try {
            await updatePassword(password);
            navigate("/", {replace: true});
        } catch (err) {
            setError(authErrorMessage(err));
        } finally {
            setSubmitting(false);
        }
    }

    if (loading) {
        return <FullScreenMessage>Validando enlace...</FullScreenMessage>;
    }

    if (!session) {
        return (
            <AuthShell title="Enlace inválido">
                <FormMessage tone="error">
                    El enlace de recuperación es inválido o ya expiró. Solicita uno nuevo.
                </FormMessage>
                <Link to="/forgot-password" className={`${LINK} mt-4 inline-block text-sm`}>
                    Solicitar otro enlace
                </Link>
            </AuthShell>
        );
    }

    return (
        <AuthShell title="Nueva contraseña" subtitle="Define la contraseña con la que entrarás de ahora en adelante.">
            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
                {error && <FormMessage tone="error">{error}</FormMessage>}

                <div>
                    <label htmlFor="password" className={LABEL}>
                        Nueva contraseña
                    </label>
                    <PasswordInput
                        id="password"
                        autoComplete="new-password"
                        required
                        minLength={MIN_PASSWORD_LENGTH}
                        value={password}
                        onChange={setPassword}
                        placeholder="Mínimo 8 caracteres"
                    />
                </div>

                <div>
                    <label htmlFor="confirmPassword" className={LABEL}>
                        Confirmar contraseña
                    </label>
                    <PasswordInput
                        id="confirmPassword"
                        autoComplete="new-password"
                        required
                        value={confirmPassword}
                        onChange={setConfirmPassword}
                        placeholder="••••••••"
                    />
                </div>

                <motion.button
                    type="submit"
                    disabled={submitting}
                    whileHover={submitting ? undefined : HOVER_WIDE}
                    whileTap={submitting ? undefined : TAP}
                    className={`${BTN_PRIMARY} w-full`}
                >
                    {submitting ? "Guardando..." : "Guardar contraseña"}
                </motion.button>
            </form>
        </AuthShell>
    );
}
