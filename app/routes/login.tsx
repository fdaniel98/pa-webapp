import {useEffect, useState} from "react";
import {Link, useLocation, useNavigate} from "react-router";
import {motion} from "motion/react";

import type {Route} from "./+types/login";
import {AuthShell, FormMessage, FullScreenMessage} from "~/components/auth-shell";
import {PasswordInput} from "~/components/password-input";
import {authErrorMessage, useAuth} from "~/lib/auth";
import {HOVER_WIDE, TAP} from "~/lib/motion";
import {BTN_PRIMARY, INPUT, LABEL, LINK} from "~/lib/theme";

export function meta({}: Route.MetaArgs) {
    return [
        {title: "Iniciar sesión - Puello Academy"},
        {name: "description", content: "Acceso al ranking de Puello Academy"},
    ];
}

export default function Login() {
    const navigate = useNavigate();
    const location = useLocation();
    const {session, loading, signIn} = useAuth();

    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [error, setError] = useState<string | null>(null);
    const [submitting, setSubmitting] = useState(false);

    const redirectTo = (location.state as { from?: string } | null)?.from ?? "/";

    useEffect(() => {
        if (!loading && session) {
            navigate(redirectTo, {replace: true});
        }
    }, [loading, session, navigate, redirectTo]);

    async function handleSubmit(event: React.FormEvent) {
        event.preventDefault();
        setError(null);
        setSubmitting(true);
        try {
            await signIn(email, password);
            navigate(redirectTo, {replace: true});
        } catch (err) {
            setError(authErrorMessage(err));
        } finally {
            setSubmitting(false);
        }
    }

    if (loading) {
        return <FullScreenMessage>Cargando sesión...</FullScreenMessage>;
    }

    return (
        <AuthShell title="Iniciar sesión" subtitle="Acceso exclusivo para miembros de la academia.">
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

                <div>
                    <label htmlFor="password" className={LABEL}>
                        Contraseña
                    </label>
                    <PasswordInput
                        id="password"
                        autoComplete="current-password"
                        required
                        value={password}
                        onChange={setPassword}
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
                    {submitting ? "Entrando..." : "Entrar"}
                </motion.button>
            </form>

            <div className="mt-5 flex flex-col gap-2 border-t border-[#4E4E50] pt-4 text-sm text-gray-400">
                <Link to="/forgot-password" className={LINK}>
                    ¿Olvidaste tu contraseña?
                </Link>
                <span>¿No tienes cuenta? Pídele a un administrador de la academia que te la cree.</span>
            </div>
        </AuthShell>
    );
}
