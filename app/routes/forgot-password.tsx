import {useState} from "react";
import {Link} from "react-router";
import {motion} from "motion/react";

import type {Route} from "./+types/forgot-password";
import {AuthShell, FormMessage} from "~/components/auth-shell";
import {authErrorMessage, useAuth} from "~/lib/auth";
import {HOVER_WIDE, TAP} from "~/lib/motion";
import {BTN_PRIMARY, INPUT, LABEL, LINK} from "~/lib/theme";

export function meta({}: Route.MetaArgs) {
    return [{title: "Recuperar contraseña - Puello Academy"}];
}

export default function ForgotPassword() {
    const {requestPasswordReset} = useAuth();

    const [email, setEmail] = useState("");
    const [error, setError] = useState<string | null>(null);
    const [sent, setSent] = useState(false);
    const [submitting, setSubmitting] = useState(false);

    async function handleSubmit(event: React.FormEvent) {
        event.preventDefault();
        setError(null);
        setSubmitting(true);
        try {
            await requestPasswordReset(email);
            setSent(true);
        } catch (err) {
            setError(authErrorMessage(err));
        } finally {
            setSubmitting(false);
        }
    }

    return (
        <AuthShell
            title="Recuperar contraseña"
            subtitle="Te enviaremos un enlace para crear una nueva contraseña."
        >
            {sent ? (
                <FormMessage tone="success">
                    Si existe una cuenta con <strong>{email}</strong>, recibirás un correo con el enlace de
                    recuperación.
                </FormMessage>
            ) : (
                <form onSubmit={handleSubmit} className="flex flex-col gap-4">
                    {error && <FormMessage tone="error">{error}</FormMessage>}

                    <div>
                        <label htmlFor="email" className={LABEL}>
                            Correo electrónico
                        </label>
                        <input
                            id="email"
                            type="email"
                            autoComplete="email"
                            required
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            placeholder="jugador@correo.com"
                            className={`${INPUT} w-full`}
                        />
                    </div>

                    <motion.button
                        type="submit"
                        disabled={submitting}
                        whileHover={submitting ? undefined : HOVER_WIDE}
                        whileTap={submitting ? undefined : TAP}
                        className={`${BTN_PRIMARY} w-full`}
                    >
                        {submitting ? "Enviando..." : "Enviar enlace"}
                    </motion.button>
                </form>
            )}

            <Link to="/login" className={`${LINK} mt-5 inline-block text-sm`}>
                Volver a iniciar sesión
            </Link>
        </AuthShell>
    );
}
