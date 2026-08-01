import {type RouteConfig, index, layout, route} from "@react-router/dev/routes";

export default [
    // Rutas públicas de autenticación. No hay registro público: las cuentas se
    // crean desde la pestaña "Usuarios" dentro de la app.
    route("login", "routes/login.tsx"),
    route("forgot-password", "routes/forgot-password.tsx"),
    route("update-password", "routes/update-password.tsx"),

    // Todo lo que va aquí adentro exige sesión iniciada.
    layout("routes/protected.tsx", [index("routes/ranking-sf6.tsx")]),
] satisfies RouteConfig;
