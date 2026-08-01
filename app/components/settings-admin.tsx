import {useCallback, useEffect, useState} from "react";
import {motion} from "motion/react";

import type {NotificationEntry} from "~/lib/notifications";
import {fetchNotifications, purgeSentNotifications} from "~/lib/notifications";
import {sendPendingNotifications} from "~/lib/ranking";
import type {AppSetting} from "~/lib/settings";
import {NOTIFICACIONES_RETOS} from "~/lib/settings";
import {HOVER, SPRING, TAP} from "~/lib/motion";
import {BTN_GHOST_SM} from "~/lib/theme";

type SettingsAdminProps = {
    ajustes: AppSetting[];
    onToggle: (key: string, enabled: boolean) => void;
};

export function SettingsAdmin({ajustes, onToggle}: SettingsAdminProps) {
    const notificaciones = ajustes.find((a) => a.key === NOTIFICACIONES_RETOS);

    return (
        <div className="sf6-scroll flex min-h-0 flex-1 flex-col gap-5 overflow-auto px-1 pb-1">
            {ajustes.length === 0 ? (
                <p className="text-sm text-gray-500">
                    No hay ajustes disponibles. ¿Ya ejecutaste <code>settings.sql</code> en Supabase?
                </p>
            ) : (
                <ul className="space-y-3">
                    {ajustes.map((ajuste) => (
                        <li
                            key={ajuste.key}
                            className="flex flex-wrap items-center justify-between gap-4 rounded-md border border-[#4E4E50]/60 bg-black/20 px-4 py-3"
                        >
                            <div className="min-w-0 flex-1">
                                <p className="text-sm font-semibold text-white">
                                    {ajuste.key === NOTIFICACIONES_RETOS
                                        ? "Notificaciones de retos por correo"
                                        : ajuste.key}
                                </p>
                                {ajuste.descripcion && (
                                    <p className="mt-0.5 text-xs text-gray-400">{ajuste.descripcion}</p>
                                )}
                            </div>
                            <Toggle
                                enabled={ajuste.enabled}
                                label={`Activar ${ajuste.key}`}
                                onChange={(next) => onToggle(ajuste.key, next)}
                            />
                        </li>
                    ))}
                </ul>
            )}

            {notificaciones && (
                <div
                    className={`rounded-r-md border-l-4 px-3 py-2 text-xs ${
                        notificaciones.enabled
                            ? "border-[#2ecc71] bg-[#2ecc71]/10 text-[#7ee2a8]"
                            : "border-[#F0C808] bg-[#F0C808]/10 text-[#F0C808]"
                    }`}
                >
                    {notificaciones.enabled ? (
                        <>
                            Los correos se envían al lanzar y al resolver un reto. Requiere un dominio verificado
                            en Resend y los secrets <code>RESEND_API_KEY</code> y <code>NOTIFICATIONS_FROM</code>{" "}
                            en la Edge Function; si falta algo, los correos quedan pendientes en la bandeja y se
                            reintentan.
                        </>
                    ) : (
                        <>
                            Apagado: los retos funcionan normal pero no se encola ni se envía ningún correo.
                            Enciéndelo cuando tengas un dominio verificado en Resend.
                        </>
                    )}
                </div>
            )}

            <Outbox/>
        </div>
    );
}

/** Bandeja de salida: qué se envió, qué falló y por qué. */
function Outbox() {
    const [entradas, setEntradas] = useState<NotificationEntry[]>([]);
    const [cargando, setCargando] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [aviso, setAviso] = useState<string | null>(null);

    const refresh = useCallback(async () => {
        setCargando(true);
        try {
            setEntradas(await fetchNotifications());
            setError(null);
        } catch (err) {
            setError(err instanceof Error ? err.message : String(err));
        } finally {
            setCargando(false);
        }
    }, []);

    useEffect(() => {
        void refresh();
    }, [refresh]);

    function reintentar() {
        setAviso(null);
        setError(null);
        sendPendingNotifications()
            .then((r) => {
                setAviso(`Procesadas ${r.procesadas}, enviadas ${r.enviadas}, fallidas ${r.fallidas.length}.`);
                return refresh();
            })
            .catch((err) => setError(err instanceof Error ? err.message : String(err)));
    }

    function purgar() {
        setAviso(null);
        setError(null);
        purgeSentNotifications(30)
            .then((borradas) => {
                setAviso(`${borradas} notificación${borradas === 1 ? "" : "es"} enviada${borradas === 1 ? "" : "s"} con más de 30 días fue${borradas === 1 ? "" : "ron"} eliminada${borradas === 1 ? "" : "s"}.`);
                return refresh();
            })
            .catch((err) => setError(err instanceof Error ? err.message : String(err)));
    }

    const pendientes = entradas.filter((e) => e.estado === "pendiente").length;
    const conError = entradas.filter((e) => e.estado === "error").length;

    return (
        <div className="border-t border-[#4E4E50] pt-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-sm font-bold uppercase italic tracking-wide text-[#F0C808]">
                    Bandeja de correos
                </h3>
                <div className="flex flex-wrap gap-2">
                    <motion.button type="button" whileHover={HOVER} whileTap={TAP} className={BTN_GHOST_SM}
                                   onClick={() => void refresh()}>
                        Actualizar
                    </motion.button>
                    <motion.button type="button" whileHover={HOVER} whileTap={TAP} className={BTN_GHOST_SM}
                                   onClick={reintentar}>
                        Enviar pendientes
                    </motion.button>
                    <motion.button type="button" whileHover={HOVER} whileTap={TAP} className={BTN_GHOST_SM}
                                   onClick={purgar}>
                        Limpiar enviadas (30d)
                    </motion.button>
                </div>
            </div>

            <p className="mb-3 text-xs text-gray-500">
                {pendientes} pendiente{pendientes === 1 ? "" : "s"} · {conError} con error
                {conError > 0 && " (agotaron los 3 intentos)"}
            </p>

            {error && (
                <p className="mb-3 rounded-r-md border-l-4 border-[#C3073F] bg-[#C3073F]/10 px-3 py-2 text-xs text-[#ff8095]">
                    {error}
                </p>
            )}
            {aviso && (
                <p className="mb-3 rounded-r-md border-l-4 border-[#2ecc71] bg-[#2ecc71]/10 px-3 py-2 text-xs text-[#7ee2a8]">
                    {aviso}
                </p>
            )}

            {cargando ? (
                <p className="text-sm text-gray-500">Cargando bandeja...</p>
            ) : entradas.length === 0 ? (
                <p className="text-sm text-gray-500">No hay correos en la bandeja.</p>
            ) : (
                <ul className="space-y-2">
                    {entradas.map((e) => (
                        <li
                            key={e.id}
                            className="flex flex-wrap items-center gap-2 rounded-md border border-[#4E4E50]/60 bg-black/20 px-3 py-2 text-xs"
                        >
                            <EstadoBadge estado={e.estado}/>
                            <span className="min-w-0 flex-1 truncate text-gray-300">{e.asunto}</span>
                            <span className="truncate text-gray-500">{e.email}</span>
                            <span className="text-gray-600">
                                {new Date(e.sentAt ?? e.createdAt).toLocaleDateString()}
                            </span>
                            {e.error && (
                                <span className="w-full truncate text-[#ff8095]" title={e.error}>
                                    {e.intentos} intento{e.intentos === 1 ? "" : "s"}: {e.error}
                                </span>
                            )}
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}

function EstadoBadge({estado}: { estado: NotificationEntry["estado"] }) {
    const estilos = {
        enviada: "bg-[#2ecc71]/15 text-[#7ee2a8]",
        pendiente: "bg-[#3498db]/15 text-[#3498db]",
        error: "bg-[#C3073F]/15 text-[#ff8095]",
    }[estado];

    return (
        <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${estilos}`}>
            {estado}
        </span>
    );
}

function Toggle({
                    enabled,
                    label,
                    onChange,
                }: {
    enabled: boolean;
    label: string;
    onChange: (next: boolean) => void;
}) {
    return (
        <div className="flex shrink-0 items-center gap-3">
            <span className={`text-xs font-bold uppercase tracking-wide ${enabled ? "text-[#2ecc71]" : "text-gray-500"}`}>
                {enabled ? "Activado" : "Apagado"}
            </span>
            <motion.button
                type="button"
                role="switch"
                aria-checked={enabled}
                aria-label={label}
                whileHover={HOVER}
                whileTap={TAP}
                onClick={() => onChange(!enabled)}
                className={`relative h-7 w-12 shrink-0 rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#F0C808]/50 ${
                    enabled ? "bg-[#2ecc71]" : "bg-[#4E4E50]"
                }`}
            >
                {/* Se anima con x (transform) en vez de alternar left/right, que
                    obligaría al navegador a recalcular layout en cada cuadro. */}
                <motion.span
                    animate={{x: enabled ? 20 : 0}}
                    transition={SPRING}
                    className="absolute left-1 top-1 h-5 w-5 rounded-full bg-white shadow"
                />
            </motion.button>
        </div>
    );
}
