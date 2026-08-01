import {Navigate, Outlet, useLocation} from "react-router";

import {FullScreenMessage} from "~/components/auth-shell";
import {useAuth} from "~/lib/auth";

/**
 * Layout que protege todas las rutas hijas: sin sesión activa, redirige a /login
 * y recuerda a dónde quería entrar el usuario.
 */
export default function Protected() {
    const {session, loading} = useAuth();
    const location = useLocation();

    if (loading) {
        return <FullScreenMessage>Cargando sesión...</FullScreenMessage>;
    }

    if (!session) {
        return (
            <Navigate
                to="/login"
                replace
                state={{from: `${location.pathname}${location.search}`}}
            />
        );
    }

    return <Outlet/>;
}
