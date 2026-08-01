import {useCallback, useEffect, useRef, useState} from "react";
import {AnimatePresence, motion, Reorder} from "motion/react";
import type {Route} from "./+types/ranking-sf6";
import {AuditLog} from "~/components/audit-log";
import {Footer} from "~/components/footer";
import {PlayerAdmin} from "~/components/player-admin";
import {SettingsAdmin} from "~/components/settings-admin";
import {UserAdmin} from "~/components/user-admin";
import {useAuth} from "~/lib/auth";
import type {AppSetting} from "~/lib/settings";
import {fetchSettings, NOTIFICACIONES_RETOS, setSetting} from "~/lib/settings";
import type {Player} from "~/lib/ranking";
import {
    addPlayer,
    cancelChallenge,
    createChallenge,
    expireStaleChallenges,
    fetchRankingState,
    removePlayer,
    reorderPlayer,
    resetRanking,
    resolveChallenge,
    sendPendingNotifications,
    setPlayerEmail,
    subscribeToRanking,
    type RankingState,
} from "~/lib/ranking";
import {DUR, EASE, FADE, HOVER, LIST_ITEM_MOTION, ROW_MOTION, SPRING, TAP} from "~/lib/motion";
import {
    BTN_DANGER_SM,
    BTN_GHOST_SM,
    BTN_PRIMARY,
    BTN_WIN_SM,
    EMPTY_ITEM,
    INPUT,
    LIST_ITEM,
    PANEL,
    SECTION_TITLE,
} from "~/lib/theme";

export function meta({}: Route.MetaArgs) {
    return [
        {title: "Puello Academy - SF6 Ranking"},
        {name: "description", content: "Ranking y sistema de retos SF6 - Puello Academy"},
    ];
}

// Solo lo que Tailwind no puede expresar: el scrollbar personalizado (las transiciones las maneja Motion).
const PAGE_CSS = `
.sf6-scroll::-webkit-scrollbar { width: 8px; height: 8px; }
.sf6-scroll::-webkit-scrollbar-track { background: transparent; }
.sf6-scroll::-webkit-scrollbar-thumb { background: #4E4E50; border-radius: 9999px; }
.sf6-scroll::-webkit-scrollbar-thumb:hover { background: #F0C808; }
`;

type ModalState =
    | { type: "alert"; message: string }
    | { type: "confirm"; message: string; onConfirm: () => void; onCancel?: () => void };

type TabKey = "ranking" | "retos" | "gestion" | "usuarios" | "bitacora" | "config";

const TABS: { key: TabKey; label: string; adminOnly?: boolean }[] = [
    {key: "ranking", label: "Tabla de Posiciones"},
    {key: "retos", label: "Panel de Retos", adminOnly: true},
    {key: "gestion", label: "Gestión de Jugadores", adminOnly: true},
    {key: "usuarios", label: "Usuarios", adminOnly: true},
    {key: "bitacora", label: "Bitácora", adminOnly: true},
    {key: "config", label: "Configuración", adminOnly: true},
];

const EMPTY_STATE: RankingState = {jugadores: [], retosVigentes: [], historial: []};
const CELL = "border-b border-white/10 px-4 py-3";

export default function RankingSF6() {
    const {user, profile, isAdmin, signOut} = useAuth();

    const [{jugadores, historial, retosVigentes}, setEstado] = useState<RankingState>(EMPTY_STATE);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);

    const [challengerId, setChallengerId] = useState("");
    const [challengedId, setChallengedId] = useState("");
    const [notifyError, setNotifyError] = useState<string | null>(null);
    const [ajustes, setAjustes] = useState<AppSetting[]>([]);
    const [modal, setModal] = useState<ModalState | null>(null);
    const [activeTab, setActiveTab] = useState<TabKey>("ranking");
    const [dragPreview, setDragPreview] = useState<Player[] | null>(null);
    const dragPreviewRef = useRef<Player[] | null>(null);

    const visibleTabs = TABS.filter((tab) => !tab.adminOnly || isAdmin);

    function showAlert(message: string) {
        setModal({type: "alert", message});
    }

    function showConfirm(message: string, onConfirm: () => void, onCancel?: () => void) {
        setModal({type: "confirm", message, onConfirm, onCancel});
    }

    function closeModal() {
        if (modal?.type === "confirm") {
            modal.onCancel?.();
        }
        setModal(null);
    }

    function confirmModal() {
        if (modal?.type === "confirm") {
            modal.onConfirm();
        }
        setModal(null);
    }

    // El perfil llega después de la sesión: si el rol deja de ser admin, salimos de la pestaña.
    useEffect(() => {
        if (!isAdmin && activeTab !== "ranking") setActiveTab("ranking");
    }, [activeTab, isAdmin]);

    useEffect(() => {
        if (!modal) return;

        function handleKeyDown(e: KeyboardEvent) {
            if (e.key === "Escape") closeModal();
        }

        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [modal]);

    const refresh = useCallback(async () => {
        try {
            const [estado, settings] = await Promise.all([fetchRankingState(), fetchSettings()]);
            setEstado(estado);
            setAjustes(settings);
            setLoadError(null);
        } catch (err) {
            setLoadError(err instanceof Error ? err.message : String(err));
        }
    }, []);

    // Carga inicial + sincronización en vivo con el resto de dispositivos.
    useEffect(() => {
        let active = true;

        // Los retos vencidos se limpian al abrir la app: si no, seguirían
        // bloqueando a sus dos jugadores para siempre.
        void expireStaleChallenges()
            .catch(() => undefined)
            .then(() => refresh())
            .finally(() => {
                if (active) setLoading(false);
            });

        const unsubscribe = subscribeToRanking(() => {
            if (active) void refresh();
        });

        return () => {
            active = false;
            unsubscribe();
        };
    }, [refresh]);

    /** Ejecuta una acción del ranking y muestra en un modal el error que devuelva Postgres. */
    async function run(action: () => Promise<void>) {
        setBusy(true);
        try {
            await action();
            await refresh();
        } catch (err) {
            showAlert(err instanceof Error ? err.message : String(err));
        } finally {
            setBusy(false);
        }
    }

    const notificacionesActivas =
        ajustes.find((a) => a.key === NOTIFICACIONES_RETOS)?.enabled ?? false;

    /**
     * Los correos ya quedaron encolados en la misma transacción del cambio, así que
     * esto sólo pide el envío: si falla, siguen pendientes para el próximo intento.
     * Con el interruptor apagado Postgres no encoló nada, así que ni llamamos.
     */
    function dispararNotificaciones() {
        if (!notificacionesActivas) return;

        setNotifyError(null);
        void sendPendingNotifications().catch((err) => {
            setNotifyError(err instanceof Error ? err.message : String(err));
        });
    }

    function cambiarAjuste(key: string, enabled: boolean) {
        void run(() => setSetting(key, enabled));
    }

    function lanzarReto() {
        if (!challengerId || !challengedId) {
            showAlert("Selecciona un retador y un retado diferentes.");
            return;
        }
        void run(async () => {
            await createChallenge(challengerId, challengedId);
            setChallengerId("");
            setChallengedId("");
            dispararNotificaciones();
        });
    }

    function resolverReto(retoId: string, ganadorId: string) {
        void run(async () => {
            await resolveChallenge(retoId, ganadorId);
            dispararNotificaciones();
        });
    }

    function cancelarReto(retoId: string) {
        showConfirm(
            "¿Estás seguro de cancelar/expirar este reto? Ninguno sufrirá cambios de ranking ni cooldown.",
            () => void run(() => cancelChallenge(retoId))
        );
    }

    function agregarJugador(nombre: string, email: string) {
        if (!nombre.trim()) {
            showAlert("Por favor ingresa un nombre para el jugador.");
            return;
        }
        void run(() => addPlayer(nombre, email));
    }

    function guardarCorreo(playerId: string, email: string) {
        void run(() => setPlayerEmail(playerId, email));
    }

    function eliminarJugador(id: string) {
        const jugador = jugadores.find((j) => j.id === id);
        if (!jugador) return;

        showConfirm(
            `¿Estás seguro de eliminar a ${jugador.nombre} (Puesto #${jugador.rangoActual})? Los jugadores por debajo subirán un puesto automáticamente.`,
            () => void run(() => removePlayer(id))
        );
    }

    function reiniciarRanking() {
        showConfirm(
            "¡ADVERTENCIA! Esto borrará el ranking, el historial y los retos de TODA la academia (no sólo de este dispositivo) y regresará a la lista original. ¿Estás completamente seguro?",
            () => void run(() => resetRanking())
        );
    }

    if (loading) {
        return (
            <div
                className="flex h-screen w-full items-center justify-center bg-[#0b0b0c] bg-[radial-gradient(circle,_#1a1a1d_0%,_#000000_100%)] font-sans text-white"
            >
                <style>{PAGE_CSS}</style>
                <p className="text-sm uppercase tracking-wide text-gray-400">Cargando ranking...</p>
            </div>
        );
    }

    const ahora = Date.now();
    const jugadoresOrdenadosPorRango = [...jugadores].sort((a, b) => a.rangoActual - b.rangoActual);
    const filasVisibles = dragPreview ?? jugadoresOrdenadosPorRango;

    function handleReorderPreview(newOrder: Player[]) {
        dragPreviewRef.current = newOrder;
        setDragPreview(newOrder);
    }

    function handleRowDragEnd(draggedItem: Player) {
        const finalOrder = dragPreviewRef.current;
        if (!finalOrder) return;

        const fromIndex = jugadoresOrdenadosPorRango.findIndex((j) => j.id === draggedItem.id);
        const toIndex = finalOrder.findIndex((j) => j.id === draggedItem.id);

        function limpiarPreview() {
            dragPreviewRef.current = null;
            setDragPreview(null);
        }

        if (fromIndex === toIndex || fromIndex === -1 || toIndex === -1) {
            limpiarPreview();
            return;
        }

        const puestoAnterior = fromIndex + 1;
        const puestoNuevo = toIndex + 1;

        showConfirm(
            `¿Confirmas mover a ${draggedItem.nombre} del puesto #${puestoAnterior} al puesto #${puestoNuevo}? El resto de jugadores se ajustará automáticamente.`,
            () => {
                void run(() => reorderPlayer(draggedItem.id, puestoNuevo)).finally(limpiarPreview);
            },
            limpiarPreview
        );
    }

    function filaContenido(j: Player) {
        const dif = j.rangoAnterior - j.rangoActual;
        let cambioTexto = "-";
        let cambioClase = "text-gray-500";
        if (dif > 0) {
            cambioTexto = `▲ +${dif}`;
            cambioClase = "font-bold text-[#2ecc71]";
        } else if (dif < 0) {
            cambioTexto = `▼ ${dif}`;
            cambioClase = "font-bold text-[#C3073F]";
        }

        let estadoNodo: React.ReactNode = <span className="text-xs text-gray-400">Disponible</span>;
        if (j.cooldownHasta && j.cooldownHasta > ahora) {
            const diasCooldown = Math.ceil((j.cooldownHasta - ahora) / (1000 * 60 * 60 * 24));
            estadoNodo = (
                <span className="inline-flex rounded-full bg-[#F0C808]/15 px-2.5 py-1 text-xs font-semibold text-[#F0C808]">
                    Inmune: {diasCooldown}d
                </span>
            );
        } else if (retosVigentes.some((r) => r.retadorId === j.id || r.retadoId === j.id)) {
            estadoNodo = (
                <span className="inline-flex rounded-full bg-[#3498db]/15 px-2.5 py-1 text-xs font-semibold text-[#3498db]">
                    En Combate
                </span>
            );
        }

        return (
            <>
                <td className={`${CELL} text-center font-mono text-gray-400`}>
                    {isAdmin && (
                        <span className="mr-2 select-none text-gray-600" aria-hidden="true">
                            ⠿
                        </span>
                    )}
                    {j.rangoActual}
                </td>
                <td className={`${CELL} font-semibold text-white`}>{j.nombre}</td>
                <td className={`${CELL} text-center ${cambioClase}`}>{cambioTexto}</td>
                <td className={CELL}>{estadoNodo}</td>
                {isAdmin && (
                    <td className={`${CELL} text-center`}>
                        <motion.button
                            whileHover={HOVER}
                            whileTap={TAP}
                            className={BTN_DANGER_SM}
                            onClick={() => eliminarJugador(j.id)}
                        >
                            Borrar
                        </motion.button>
                    </td>
                )}
            </>
        );
    }

    const encabezados = (
        <tr>
            <th className="sticky top-0 z-10 rounded-tl-md bg-[#F0C808] px-4 py-3 text-center text-xs font-bold uppercase tracking-wide text-black">
                #
            </th>
            <th className="sticky top-0 z-10 bg-[#F0C808] px-4 py-3 text-left text-xs font-bold uppercase tracking-wide text-black">
                Jugador
            </th>
            <th className="sticky top-0 z-10 bg-[#F0C808] px-4 py-3 text-center text-xs font-bold uppercase tracking-wide text-black">
                Cambio
            </th>
            <th className={`sticky top-0 z-10 bg-[#F0C808] px-4 py-3 text-left text-xs font-bold uppercase tracking-wide text-black ${isAdmin ? "" : "rounded-tr-md"}`}>
                Estado
            </th>
            {isAdmin && (
                <th className="sticky top-0 z-10 rounded-tr-md bg-[#F0C808] px-4 py-3 text-center text-xs font-bold uppercase tracking-wide text-black">
                    Acción
                </th>
            )}
        </tr>
    );

    return (
        <div
            className="flex h-screen w-full flex-col overflow-hidden bg-[#0b0b0c] bg-[radial-gradient(circle,_#1a1a1d_0%,_#000000_100%)] p-4 font-sans text-white md:p-6">
            <style>{PAGE_CSS}</style>

            <header className="flex shrink-0 flex-wrap items-center justify-between gap-3 pb-4 md:pb-6">
                <h1 className="flex-1 text-center text-2xl font-bold italic uppercase tracking-wide text-[#F0C808] md:text-3xl">
                    修 Ranking - Puello Academy
                </h1>
                <div className="flex items-center gap-3">
                    <span className="hidden text-xs text-gray-400 sm:inline">
                        {profile?.full_name ?? user?.email}
                        {!isAdmin && " · sólo lectura"}
                    </span>
                    <motion.button
                        whileHover={HOVER}
                        whileTap={TAP}
                        className={BTN_GHOST_SM}
                        onClick={() => showConfirm("¿Cerrar sesión?", () => void signOut())}
                    >
                        Cerrar sesión
                    </motion.button>
                </div>
            </header>

            {loadError && (
                <div
                    className="mx-auto mb-4 w-full max-w-[1200px] shrink-0 rounded-r-md border-l-4 border-[#C3073F] bg-[#C3073F]/10 px-3 py-2 text-sm text-[#ff8095]">
                    No se pudo cargar el ranking: {loadError}
                </div>
            )}

            {notifyError && (
                <div
                    className="mx-auto mb-4 flex w-full max-w-[1200px] shrink-0 items-center justify-between gap-3 rounded-r-md border-l-4 border-[#F0C808] bg-[#F0C808]/10 px-3 py-2 text-sm text-[#F0C808]">
                    <span>
                        El cambio se guardó, pero los correos quedaron pendientes: {notifyError}
                    </span>
                    <button
                        onClick={dispararNotificaciones}
                        className="shrink-0 text-xs font-bold uppercase tracking-wide underline underline-offset-4"
                    >
                        Reintentar
                    </button>
                </div>
            )}

            <div className="mx-auto grid w-full min-h-0 flex-1 max-w-[1200px] grid-cols-[2fr_1fr] gap-6">
                <div className={`${PANEL} flex min-h-0 flex-col ${busy ? "pointer-events-none opacity-60" : ""}`}>
                    <div className="mb-4 flex shrink-0 gap-1 border-b-2 border-[#4E4E50]">
                        {visibleTabs.map((tab) => (
                            <motion.button
                                key={tab.key}
                                onClick={() => setActiveTab(tab.key)}
                                whileHover={HOVER}
                                whileTap={TAP}
                                className={`relative -mb-0.5 whitespace-nowrap rounded-t-md px-5 py-3 text-xs font-bold uppercase tracking-wide transition-colors duration-200 md:text-sm ${
                                    activeTab === tab.key
                                        ? "bg-white/5 text-[#F0C808]"
                                        : "text-gray-500 hover:bg-white/5 hover:text-gray-200"
                                }`}
                            >
                                {tab.label}
                                {activeTab === tab.key && (
                                    <motion.div
                                        layoutId="tab-underline"
                                        className="absolute inset-x-0 -bottom-0.5 h-0.5 bg-[#F0C808]"
                                        transition={SPRING}
                                    />
                                )}
                            </motion.button>
                        ))}
                    </div>

                    {/* mode="wait" evita que las dos pestañas se solapen mientras
                        cruzan; sin AnimatePresence la saliente desaparecía de golpe. */}
                    <AnimatePresence mode="wait" initial={false}>
                    <motion.div
                        key={activeTab}
                        initial={{opacity: 0, y: 8}}
                        animate={{opacity: 1, y: 0}}
                        exit={{opacity: 0, y: -6}}
                        transition={{duration: DUR.fast, ease: EASE}}
                        className="flex min-h-0 flex-1 flex-col"
                    >
                        {activeTab === "ranking" && (
                            <div
                                className="sf6-scroll min-h-0 flex-1 overflow-auto rounded-md border border-[#4E4E50]/60">
                                <table className="w-full border-separate border-spacing-0 text-sm">
                                    <thead>{encabezados}</thead>

                                    {isAdmin ? (
                                        <Reorder.Group as="tbody" axis="y" values={filasVisibles}
                                                       onReorder={handleReorderPreview}>
                                            <AnimatePresence mode="popLayout">
                                                {filasVisibles.map((j) => (
                                                    <Reorder.Item
                                                        as="tr"
                                                        key={j.id}
                                                        value={j}
                                                        onDragEnd={() => handleRowDragEnd(j)}
                                                        {...ROW_MOTION}
                                                        whileDrag={{
                                                            scale: 1.01,
                                                            backgroundColor: "rgba(240,200,8,0.08)",
                                                            boxShadow: "0 8px 24px rgba(0,0,0,0.45)",
                                                        }}
                                                        className="cursor-grab transition-colors hover:bg-white/5"
                                                    >
                                                        {filaContenido(j)}
                                                    </Reorder.Item>
                                                ))}
                                            </AnimatePresence>
                                        </Reorder.Group>
                                    ) : (
                                        <tbody>
                                        {filasVisibles.map((j) => (
                                            <tr key={j.id} className="transition-colors hover:bg-white/5">
                                                {filaContenido(j)}
                                            </tr>
                                        ))}
                                        </tbody>
                                    )}
                                </table>
                            </div>
                        )}

                        {activeTab === "retos" && isAdmin && (
                            <div
                                className="sf6-scroll flex min-h-0 flex-1 flex-col items-center justify-center gap-4 overflow-auto px-2">
                                <div className="flex flex-wrap items-center justify-center gap-3">
                                    <select className={INPUT} value={challengerId}
                                            onChange={(e) => setChallengerId(e.target.value)}>
                                        <option value="">Selecciona Retador...</option>
                                        {jugadoresOrdenadosPorRango.map((j) => (
                                            <option key={j.id} value={j.id}>
                                                #{j.rangoActual} {j.nombre}
                                            </option>
                                        ))}
                                    </select>
                                    <span className="text-xs uppercase tracking-wide text-gray-400 ">desafía a</span>
                                    <select className={INPUT} value={challengedId}
                                            onChange={(e) => setChallengedId(e.target.value)}>
                                        <option value="">Selecciona Retado...</option>
                                        {jugadoresOrdenadosPorRango.map((j) => (
                                            <option key={j.id} value={j.id}>
                                                #{j.rangoActual} {j.nombre}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                                <motion.button whileHover={HOVER} whileTap={TAP} className={BTN_PRIMARY}
                                               onClick={lanzarReto}>
                                    Lanzar Reto
                                </motion.button>
                            </div>
                        )}

                        {activeTab === "gestion" && isAdmin && (
                            <PlayerAdmin
                                jugadores={jugadoresOrdenadosPorRango}
                                onAdd={agregarJugador}
                                onSetEmail={guardarCorreo}
                            />
                        )}

                        {activeTab === "usuarios" && isAdmin && <UserAdmin onConfirm={showConfirm}/>}

                        {activeTab === "bitacora" && isAdmin && <AuditLog onConfirm={showConfirm}/>}

                        {activeTab === "config" && isAdmin && (
                            <SettingsAdmin ajustes={ajustes} onToggle={cambiarAjuste}/>
                        )}
                    </motion.div>
                    </AnimatePresence>
                </div>

                <div className="sf6-scroll flex min-h-0 flex-col gap-5 overflow-y-auto">
                    <div className={PANEL}>
                        <h2 className={SECTION_TITLE}>Retos Vigentes</h2>
                        <ul className="space-y-2">
                            <AnimatePresence mode="popLayout">
                                {retosVigentes.length === 0 ? (
                                    <motion.li key="empty" layout {...FADE} className={EMPTY_ITEM}>
                                        No hay retos activos.
                                    </motion.li>
                                ) : (
                                    retosVigentes.map((r) => {
                                        const retador = jugadores.find((j) => j.id === r.retadorId);
                                        const retado = jugadores.find((j) => j.id === r.retadoId);
                                        if (!retador || !retado) return null;

                                        const diasRestantes = Math.ceil((r.expiraEn - ahora) / (1000 * 60 * 60 * 24));
                                        const urgente = diasRestantes <= 2;

                                        return (
                                            <motion.li
                                                key={r.id}
                                                layout
                                                {...LIST_ITEM_MOTION}
                                                className="flex flex-wrap items-center justify-between gap-3 rounded-r-md border-l-4 border-[#3498db] bg-[#3498db]/10 p-3"
                                            >
                                                <div className="text-sm">
                                                    <strong>{retador.nombre}</strong> <span
                                                    className="text-gray-400">#{retador.rangoActual}</span>{" "}
                                                    reta a <strong>{retado.nombre}</strong>{" "}
                                                    <span className="text-gray-400">#{retado.rangoActual}</span>
                                                    <div
                                                        className={`mt-1 text-xs ${urgente ? "font-bold text-[#C3073F]" : "text-gray-400"}`}>
                                                        Expira en: {diasRestantes} días
                                                    </div>
                                                </div>
                                                {isAdmin && (
                                                    <div className="flex flex-wrap gap-1.5">
                                                        <motion.button whileHover={HOVER} whileTap={TAP}
                                                                       className={BTN_WIN_SM}
                                                                       onClick={() => resolverReto(r.id, retador.id)}>
                                                            Gana {retador.nombre}
                                                        </motion.button>
                                                        <motion.button whileHover={HOVER} whileTap={TAP}
                                                                       className={BTN_WIN_SM}
                                                                       onClick={() => resolverReto(r.id, retado.id)}>
                                                            Gana {retado.nombre}
                                                        </motion.button>
                                                        <motion.button whileHover={HOVER} whileTap={TAP}
                                                                       className={BTN_DANGER_SM}
                                                                       onClick={() => cancelarReto(r.id)}>
                                                            Cancelar
                                                        </motion.button>
                                                    </div>
                                                )}
                                            </motion.li>
                                        );
                                    })
                                )}
                            </AnimatePresence>
                        </ul>
                    </div>

                    <div className={PANEL}>
                        <h2 className={SECTION_TITLE}>Historial Reciente</h2>
                        <ul className="space-y-2">
                            <AnimatePresence mode="popLayout">
                                {historial.length === 0 ? (
                                    <motion.li key="empty" layout {...FADE} className={EMPTY_ITEM}>
                                        Sin actividad reciente.
                                    </motion.li>
                                ) : (
                                    historial.slice(0, 7).map((h) => (
                                        <motion.li
                                            key={h.id}
                                            layout
                                            {...LIST_ITEM_MOTION}
                                            className={LIST_ITEM}
                                        >
                                            <span className="mb-0.5 block text-xs text-gray-400">{h.fecha}</span>
                                            {h.texto}
                                        </motion.li>
                                    ))
                                )}
                            </AnimatePresence>
                        </ul>
                    </div>

                    <div className={PANEL}>
                        <h2 className={SECTION_TITLE}>Enfriamiento (7 Días)</h2>
                        <ul className="mb-3 space-y-2">
                            <AnimatePresence mode="popLayout">
                                {(() => {
                                    const enCooldown = jugadores.filter((j) => j.cooldownHasta && j.cooldownHasta > ahora);
                                    if (enCooldown.length === 0) {
                                        return (
                                            <motion.li key="empty" layout {...FADE} className={EMPTY_ITEM}>
                                                Nadie posee inmunidad activa.
                                            </motion.li>
                                        );
                                    }
                                    return enCooldown.map((j) => {
                                        const diasCooldown = Math.ceil((j.cooldownHasta! - ahora) / (1000 * 60 * 60 * 24));
                                        return (
                                            <motion.li
                                                key={j.id}
                                                layout
                                                {...LIST_ITEM_MOTION}
                                                className={LIST_ITEM}
                                            >
                                                <strong>{j.nombre}</strong> <span
                                                className="text-gray-400">- {diasCooldown} días de inmunidad</span>
                                            </motion.li>
                                        );
                                    });
                                })()}
                            </AnimatePresence>
                        </ul>
                        {isAdmin && (
                            <motion.button
                                whileHover={HOVER}
                                whileTap={TAP}
                                className="w-full rounded-md bg-[#c0392b] py-2.5 text-sm font-bold uppercase tracking-wide text-white transition-colors hover:bg-[#C3073F]"
                                onClick={reiniciarRanking}
                            >
                                ⚠️ Reiniciar Todos Los Datos
                            </motion.button>
                        )}
                    </div>
                </div>
            </div>

            <Footer className="pt-4"/>

            <AnimatePresence>
                {modal && (
                    <motion.div
                        className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/70 p-5 backdrop-blur-sm"
                        onClick={closeModal}
                        {...FADE}
                    >
                        <motion.div
                            className="w-full max-w-[420px] rounded-xl border border-[#4E4E50] border-t-4 border-t-[#F0C808] bg-[#141416] p-6 shadow-2xl"
                            onClick={(e) => e.stopPropagation()}
                            initial={{opacity: 0, y: -8, scale: 0.97}}
                            animate={{opacity: 1, y: 0, scale: 1}}
                            exit={{opacity: 0, y: -8, scale: 0.97}}
                            transition={{duration: DUR.base, ease: EASE}}
                        >
                            <p className="mb-5 text-[15px] leading-relaxed text-white">{modal.message}</p>
                            <div className="flex justify-end gap-2.5">
                                {modal.type === "confirm" && (
                                    <motion.button
                                        whileHover={HOVER}
                                        whileTap={TAP}
                                        className="rounded-md border border-[#4E4E50] px-4 py-2.5 text-xs font-bold uppercase tracking-wide text-gray-300 transition-colors hover:border-white hover:text-white"
                                        onClick={closeModal}
                                    >
                                        Cancelar
                                    </motion.button>
                                )}
                                <motion.button
                                    whileHover={HOVER}
                                    whileTap={TAP}
                                    className="rounded-md bg-[#F0C808] px-4 py-2.5 text-xs font-bold uppercase tracking-wide text-black transition-colors hover:bg-white"
                                    onClick={confirmModal}
                                >
                                    {modal.type === "confirm" ? "Confirmar" : "Aceptar"}
                                </motion.button>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
