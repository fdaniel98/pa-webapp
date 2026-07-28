import {useEffect, useState} from "react";
import type {Route} from "./+types/ranking-sf6";

export function meta({}: Route.MetaArgs) {
    return [
        {title: "Puello Academy - SF6 Ranking"},
        {name: "description", content: "Ranking y sistema de retos SF6 - Puello Academy"},
    ];
}

const STORAGE_KEY = "sf6_ranking_data";
const SIETE_DIAS_MS = 7 * 24 * 60 * 60 * 1000;

type Player = {
    id: number;
    nombre: string;
    rangoActual: number;
    rangoAnterior: number;
    cooldownHasta: number | null;
};

type HistorialEntry = {
    fecha: string;
    texto: string;
};

type Reto = {
    id: number;
    retadorId: number;
    retadoId: number;
    expiraEn: number;
};

const NOMBRES_INICIALES = [
    "VALAK", "EDGON", "YEYÉ", "BRITO", "MITCH", "SABROSO HD", "RIKAR", "SIGAL", "KINGNALDO", "BELI",
    "TOXIN", "CAMILO", "NAMELESS", "STANDMAKAROV", "EFETE", "SOMBRA", "YOJOSAN", "KANDELO", "MOKANO", "BLEYNOR",
    "FORTY", "PELCHA", "KINJA", "KINKON", "PIOLÍN", "JHOEL", "XEROX", "NELSON V", "TEMPEST", "DIRETOL ZANGIEF",
    "BEUZWOLF", "RONALD SNOOKY", "WILMIX", "GOUKISHI", "ODIN", "ENMA F",
];

function initialPlayers(): Player[] {
    return NOMBRES_INICIALES.map((nombre, index) => ({
        id: index + 1,
        nombre,
        rangoActual: index + 1,
        rangoAnterior: index + 1,
        cooldownHasta: null,
    }));
}

// Solo lo que Tailwind no puede expresar: keyframes y el scrollbar personalizado.
const PAGE_CSS = `
@keyframes sf6-tab-fade {
  from { opacity: 0; transform: translateY(6px); }
  to { opacity: 1; transform: translateY(0); }
}
@keyframes sf6-modal-in {
  from { opacity: 0; transform: translateY(-8px) scale(0.98); }
  to { opacity: 1; transform: translateY(0) scale(1); }
}
.sf6-scroll::-webkit-scrollbar { width: 8px; height: 8px; }
.sf6-scroll::-webkit-scrollbar-track { background: transparent; }
.sf6-scroll::-webkit-scrollbar-thumb { background: #4E4E50; border-radius: 9999px; }
.sf6-scroll::-webkit-scrollbar-thumb:hover { background: #F0C808; }
`;

type ModalState =
    | { type: "alert"; message: string }
    | { type: "confirm"; message: string; onConfirm: () => void };

type TabKey = "ranking" | "retos" | "gestion";

const TABS: { key: TabKey; label: string }[] = [
    {key: "ranking", label: "Tabla de Posiciones"},
    {key: "retos", label: "Panel de Retos"},
    {key: "gestion", label: "Gestión de Jugadores"},
];

const PANEL = "rounded-lg border border-[#4E4E50] bg-white/5 p-5";
const SECTION_TITLE = "mb-3 text-sm font-bold uppercase italic tracking-wide text-[#F0C808]";
const LIST_ITEM = "rounded-r-md border-l-4 border-[#F0C808] bg-black/30 px-3 py-2 text-sm";
const EMPTY_ITEM = "text-sm text-gray-500";
const INPUT =
    "rounded-md border border-[#F0C808]/60 bg-[#1A1A1D] px-3 py-2 text-sm text-white placeholder:text-gray-500 transition focus:outline-none focus:ring-2 focus:ring-[#F0C808]/50";
const BTN_PRIMARY =
    "rounded-md bg-[#F0C808] px-5 py-2.5 text-sm font-bold uppercase tracking-wide text-black transition-colors hover:bg-white";
const BTN_BLUE =
    "rounded-md bg-[#3498db] px-5 py-2.5 text-sm font-bold uppercase tracking-wide text-white transition hover:brightness-110";
const BTN_WIN_SM =
    "rounded-md bg-[#2ecc71] px-3 py-1.5 text-xs font-semibold text-white transition hover:brightness-110";
const BTN_DANGER_SM =
    "rounded-md bg-[#C3073F] px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-[#ff4757]";

export default function RankingSF6() {
    const [mounted, setMounted] = useState(false);
    const [jugadores, setJugadores] = useState<Player[]>(initialPlayers);
    const [historial, setHistorial] = useState<HistorialEntry[]>([]);
    const [retosVigentes, setRetosVigentes] = useState<Reto[]>([]);

    const [challengerId, setChallengerId] = useState("");
    const [challengedId, setChallengedId] = useState("");
    const [newPlayerName, setNewPlayerName] = useState("");
    const [modal, setModal] = useState<ModalState | null>(null);
    const [activeTab, setActiveTab] = useState<TabKey>("ranking");

    function showAlert(message: string) {
        setModal({type: "alert", message});
    }

    function showConfirm(message: string, onConfirm: () => void) {
        setModal({type: "confirm", message, onConfirm});
    }

    function closeModal() {
        setModal(null);
    }

    useEffect(() => {
        if (!modal) return;

        function handleKeyDown(e: KeyboardEvent) {
            if (e.key === "Escape") closeModal();
        }

        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [modal]);

    // Carga inicial desde localStorage (solo en cliente, evita mismatches de hidratación)
    useEffect(() => {
        const dataGuardada = localStorage.getItem(STORAGE_KEY);
        if (dataGuardada) {
            try {
                const estado = JSON.parse(dataGuardada);
                setJugadores(estado.jugadores ?? initialPlayers());
                setHistorial(estado.historial ?? []);
                setRetosVigentes(estado.retosVigentes ?? []);
            } catch {
                setJugadores(initialPlayers());
            }
        } else {
            localStorage.setItem(
                STORAGE_KEY,
                JSON.stringify({jugadores: initialPlayers(), historial: [], retosVigentes: []})
            );
        }
        setMounted(true);
    }, []);

    // Persistimos cualquier cambio de estado
    useEffect(() => {
        if (!mounted) return;
        localStorage.setItem(STORAGE_KEY, JSON.stringify({jugadores, historial, retosVigentes}));
    }, [jugadores, historial, retosVigentes, mounted]);

    function lanzarReto() {
        const retadorId = parseInt(challengerId);
        const retadoId = parseInt(challengedId);

        if (!retadorId || !retadoId || retadorId === retadoId) {
            showAlert("Selecciona un retador y un retado diferentes.");
            return;
        }

        const retador = jugadores.find((j) => j.id === retadorId);
        const retado = jugadores.find((j) => j.id === retadoId);
        if (!retador || !retado) return;

        const ahora = Date.now();

        if (retador.rangoActual !== retado.rangoActual + 1) {
            showAlert(
                `Regla de Escalera: Solo puedes retar al jugador que está exactamente una posición por encima de ti (Puesto #${
                    retador.rangoActual - 1
                }).`
            );
            return;
        }

        if ((retador.cooldownHasta ?? 0) > ahora || (retado.cooldownHasta ?? 0) > ahora) {
            showAlert("Uno de los jugadores está en su periodo de enfriamiento (victorioso recientemente).");
            return;
        }

        const enReto = retosVigentes.some(
            (r) =>
                r.retadorId === retadorId ||
                r.retadoId === retadorId ||
                r.retadorId === retadoId ||
                r.retadoId === retadoId
        );
        if (enReto) {
            showAlert("Uno de los jugadores ya tiene un reto vigente.");
            return;
        }

        setRetosVigentes((prev) => [
            ...prev,
            {id: ahora, retadorId: retador.id, retadoId: retado.id, expiraEn: ahora + SIETE_DIAS_MS},
        ]);

        setChallengerId("");
        setChallengedId("");
    }

    function resolverReto(retoId: number, ganadorId: number) {
        const reto = retosVigentes.find((r) => r.id === retoId);
        if (!reto) return;

        const perdedorId = ganadorId === reto.retadorId ? reto.retadoId : reto.retadorId;

        const ganador = jugadores.find((j) => j.id === ganadorId);
        const perdedor = jugadores.find((j) => j.id === perdedorId);
        if (!ganador || !perdedor) return;

        const ahora = Date.now();

        setJugadores((prev) => {
            const updated = prev.map((j) => ({...j}));
            const g = updated.find((j) => j.id === ganadorId);
            const p = updated.find((j) => j.id === perdedorId);
            if (!g || !p) return prev;

            if (g.rangoActual > p.rangoActual) {
                const nuevoRangoGanador = p.rangoActual;

                updated.forEach((j) => {
                    if (j.rangoActual >= p.rangoActual && j.rangoActual < g.rangoActual && j.id !== g.id) {
                        j.rangoAnterior = j.rangoActual;
                        j.rangoActual += 1;
                    }
                });

                g.rangoAnterior = g.rangoActual;
                g.rangoActual = nuevoRangoGanador;
            }

            g.cooldownHasta = ahora + SIETE_DIAS_MS;
            p.cooldownHasta = null;

            return updated;
        });

        setRetosVigentes((prev) => prev.filter((r) => r.id !== retoId));

        setHistorial((prev) => [
            {fecha: new Date().toLocaleDateString(), texto: `${ganador.nombre} derrotó a ${perdedor.nombre}`},
            ...prev,
        ]);
    }

    function cancelarReto(retoId: number) {
        showConfirm(
            "¿Estás seguro de cancelar/expirar este reto? Ninguno sufrirá cambios de ranking ni cooldown.",
            () => {
                setRetosVigentes((prev) => prev.filter((r) => r.id !== retoId));
            }
        );
    }

    function agregarJugador() {
        const nombre = newPlayerName.trim().toUpperCase();

        if (!nombre) {
            showAlert("Por favor ingresa un nombre para el jugador.");
            return;
        }

        if (jugadores.some((j) => j.nombre === nombre)) {
            showAlert("Ya existe un jugador con ese nombre.");
            return;
        }

        const maxRango = jugadores.length > 0 ? Math.max(...jugadores.map((j) => j.rangoActual)) : 0;
        const nuevoRango = maxRango + 1;

        setJugadores((prev) => [
            ...prev,
            {id: Date.now(), nombre, rangoActual: nuevoRango, rangoAnterior: nuevoRango, cooldownHasta: null},
        ]);

        setHistorial((prev) => [
            {
                fecha: new Date().toLocaleDateString(),
                texto: `Nuevo retador ingresó: ${nombre} en el puesto #${nuevoRango}`
            },
            ...prev,
        ]);

        setNewPlayerName("");
    }

    function eliminarJugador(id: number) {
        const jugador = jugadores.find((j) => j.id === id);
        if (!jugador) return;

        showConfirm(
            `¿Estás seguro de eliminar a ${jugador.nombre} (Puesto #${jugador.rangoActual})? Los jugadores por debajo subirán un puesto automáticamente.`,
            () => {
                const rangoEliminado = jugador.rangoActual;

                setJugadores((prev) =>
                    prev
                        .filter((j) => j.id !== id)
                        .map((j) => {
                            if (j.rangoActual > rangoEliminado) {
                                return {
                                    ...j,
                                    rangoActual: j.rangoActual - 1,
                                    rangoAnterior: j.rangoAnterior > rangoEliminado ? j.rangoAnterior - 1 : j.rangoAnterior,
                                };
                            }
                            return j;
                        })
                );

                setRetosVigentes((prev) => prev.filter((r) => r.retadorId !== id && r.retadoId !== id));

                setHistorial((prev) => [
                    {fecha: new Date().toLocaleDateString(), texto: `${jugador.nombre} fue removido del ranking.`},
                    ...prev,
                ]);
            }
        );
    }

    function borrarTodoElStorage() {
        showConfirm(
            "¡ADVERTENCIA! Esto borrará absolutamente todo el ranking, historial y retos actuales de este dispositivo y regresará a la lista original de la academia. ¿Estás completamente seguro?",
            () => {
                localStorage.removeItem(STORAGE_KEY);
                location.reload();
            }
        );
    }

    if (!mounted) {
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
    const jugadoresOrdenadosPorNombre = [...jugadores].sort((a, b) => a.nombre.localeCompare(b.nombre));
    const jugadoresOrdenadosPorRango = [...jugadores].sort((a, b) => a.rangoActual - b.rangoActual);

    return (
        <div
            className="flex h-screen w-full flex-col overflow-hidden bg-[#0b0b0c] bg-[radial-gradient(circle,_#1a1a1d_0%,_#000000_100%)] p-4 font-sans text-white md:p-6">
            <style>{PAGE_CSS}</style>

            <h1 className="shrink-0 pb-4 text-center text-2xl font-bold italic uppercase tracking-wide text-[#F0C808] md:pb-6 md:text-3xl">
                修 Ranking - Puello Academy
            </h1>

            <div className="mx-auto grid w-full min-h-0 flex-1 max-w-[1200px] grid-cols-[2fr_1fr] gap-6">
                <div className={`${PANEL} flex min-h-0 flex-col`}>
                    <div className="mb-4 flex shrink-0 gap-1 border-b-2 border-[#4E4E50]">
                        {TABS.map((tab) => (
                            <button
                                key={tab.key}
                                onClick={() => setActiveTab(tab.key)}
                                className={`-mb-0.5 whitespace-nowrap rounded-t-md border-b-2 px-5 py-3 text-xs font-bold uppercase tracking-wide transition-colors duration-200 md:text-sm ${
                                    activeTab === tab.key
                                        ? "border-[#F0C808] bg-white/5 text-[#F0C808]"
                                        : "border-transparent text-gray-500 hover:bg-white/5 hover:text-gray-200"
                                }`}
                            >
                                {tab.label}
                            </button>
                        ))}
                    </div>

                    <div key={activeTab} className="flex min-h-0 flex-1 flex-col [animation:sf6-tab-fade_0.2s_ease]">
                        {activeTab === "ranking" && (
                            <div
                                className="sf6-scroll min-h-0 flex-1 overflow-auto rounded-md border border-[#4E4E50]/60">
                                <table className="w-full border-separate border-spacing-0 text-sm">
                                    <thead>
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
                                        <th className="sticky top-0 z-10 bg-[#F0C808] px-4 py-3 text-left text-xs font-bold uppercase tracking-wide text-black">
                                            Estado
                                        </th>
                                        <th className="sticky top-0 z-10 rounded-tr-md bg-[#F0C808] px-4 py-3 text-center text-xs font-bold uppercase tracking-wide text-black">
                                            Acción
                                        </th>
                                    </tr>
                                    </thead>
                                    <tbody>
                                    {jugadoresOrdenadosPorRango.map((j) => {
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

                                        let estadoNodo: React.ReactNode = <span
                                            className="text-xs text-gray-400">Disponible</span>;
                                        if (j.cooldownHasta && j.cooldownHasta > ahora) {
                                            const diasCooldown = Math.ceil((j.cooldownHasta - ahora) / (1000 * 60 * 60 * 24));
                                            estadoNodo = (
                                                <span
                                                    className="inline-flex rounded-full bg-[#F0C808]/15 px-2.5 py-1 text-xs font-semibold text-[#F0C808]">
                            Inmune: {diasCooldown}d
                          </span>
                                            );
                                        } else if (retosVigentes.some((r) => r.retadorId === j.id || r.retadoId === j.id)) {
                                            estadoNodo = (
                                                <span
                                                    className="inline-flex rounded-full bg-[#3498db]/15 px-2.5 py-1 text-xs font-semibold text-[#3498db]">
                            En Combate
                          </span>
                                            );
                                        }

                                        return (
                                            <tr key={j.id} className="transition-colors hover:bg-white/5">
                                                <td className="border-b border-white/10 px-4 py-3 text-center font-mono text-gray-400">
                                                    {j.rangoActual}
                                                </td>
                                                <td className="border-b border-white/10 px-4 py-3 font-semibold text-white">{j.nombre}</td>
                                                <td className={`border-b border-white/10 px-4 py-3 text-center ${cambioClase}`}>
                                                    {cambioTexto}
                                                </td>
                                                <td className="border-b border-white/10 px-4 py-3">{estadoNodo}</td>
                                                <td className="border-b border-white/10 px-4 py-3 text-center">
                                                    <button className={BTN_DANGER_SM}
                                                            onClick={() => eliminarJugador(j.id)}>
                                                        Borrar
                                                    </button>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                    </tbody>
                                </table>
                            </div>
                        )}

                        {activeTab === "retos" && (
                            <div
                                className="sf6-scroll flex min-h-0 flex-1 flex-col items-center justify-center gap-4 overflow-auto px-2">
                                <div className="flex flex-wrap items-center justify-center gap-3">
                                    <select className={INPUT} value={challengerId}
                                            onChange={(e) => setChallengerId(e.target.value)}>
                                        <option value="">Selecciona Retador...</option>
                                        {jugadoresOrdenadosPorNombre.map((j) => (
                                            <option key={j.id} value={j.id}>
                                                {j.nombre}
                                            </option>
                                        ))}
                                    </select>
                                    <span className="text-xs uppercase tracking-wide text-gray-400 ">desafía a</span>
                                    <select className={INPUT} value={challengedId}
                                            onChange={(e) => setChallengedId(e.target.value)}>
                                        <option value="">Selecciona Retado...</option>
                                        {jugadoresOrdenadosPorNombre.map((j) => (
                                            <option key={j.id} value={j.id}>
                                                {j.nombre}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                                <button className={BTN_PRIMARY} onClick={lanzarReto}>
                                    Lanzar Reto
                                </button>
                            </div>
                        )}

                        {activeTab === "gestion" && (
                            <div
                                className="sf6-scroll flex min-h-0 flex-1 flex-col items-center justify-center gap-4 overflow-auto px-2">
                                <input
                                    type="text"
                                    placeholder="Nombre del nuevo jugador"
                                    value={newPlayerName}
                                    onChange={(e) => setNewPlayerName(e.target.value)}
                                    onKeyDown={(e) => {
                                        if (e.key === "Enter") agregarJugador();
                                    }}
                                    className={`${INPUT} w-64 text-center`}
                                />
                                <button className={BTN_BLUE} onClick={agregarJugador}>
                                    Agregar al Ranking
                                </button>
                            </div>
                        )}
                    </div>
                </div>

                <div className="sf6-scroll flex min-h-0 flex-col gap-5 overflow-y-auto">
                    <div className={PANEL}>
                        <h2 className={SECTION_TITLE}>Retos Vigentes</h2>
                        <ul className="space-y-2">
                            {retosVigentes.length === 0 ? (
                                <li className={EMPTY_ITEM}>No hay retos activos.</li>
                            ) : (
                                retosVigentes.map((r) => {
                                    const retador = jugadores.find((j) => j.id === r.retadorId);
                                    const retado = jugadores.find((j) => j.id === r.retadoId);
                                    if (!retador || !retado) return null;

                                    const diasRestantes = Math.ceil((r.expiraEn - ahora) / (1000 * 60 * 60 * 24));
                                    const urgente = diasRestantes <= 2;

                                    return (
                                        <li
                                            key={r.id}
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
                                            <div className="flex flex-wrap gap-1.5">
                                                <button className={BTN_WIN_SM}
                                                        onClick={() => resolverReto(r.id, retador.id)}>
                                                    Gana {retador.nombre}
                                                </button>
                                                <button className={BTN_WIN_SM}
                                                        onClick={() => resolverReto(r.id, retado.id)}>
                                                    Gana {retado.nombre}
                                                </button>
                                                <button className={BTN_DANGER_SM} onClick={() => cancelarReto(r.id)}>
                                                    Cancelar
                                                </button>
                                            </div>
                                        </li>
                                    );
                                })
                            )}
                        </ul>
                    </div>

                    <div className={PANEL}>
                        <h2 className={SECTION_TITLE}>Historial Reciente</h2>
                        <ul className="space-y-2">
                            {historial.length === 0 ? (
                                <li className={EMPTY_ITEM}>Sin actividad reciente.</li>
                            ) : (
                                historial.slice(0, 7).map((h, index) => (
                                    <li key={index} className={LIST_ITEM}>
                                        <span className="mb-0.5 block text-xs text-gray-400">{h.fecha}</span>
                                        {h.texto}
                                    </li>
                                ))
                            )}
                        </ul>
                    </div>

                    <div className={PANEL}>
                        <h2 className={SECTION_TITLE}>Enfriamiento (7 Días)</h2>
                        <ul className="mb-3 space-y-2">
                            {(() => {
                                const enCooldown = jugadores.filter((j) => j.cooldownHasta && j.cooldownHasta > ahora);
                                if (enCooldown.length === 0) {
                                    return <li className={EMPTY_ITEM}>Nadie posee inmunidad activa.</li>;
                                }
                                return enCooldown.map((j) => {
                                    const diasCooldown = Math.ceil((j.cooldownHasta! - ahora) / (1000 * 60 * 60 * 24));
                                    return (
                                        <li key={j.id} className={LIST_ITEM}>
                                            <strong>{j.nombre}</strong> <span
                                            className="text-gray-400">- {diasCooldown} días de inmunidad</span>
                                        </li>
                                    );
                                });
                            })()}
                        </ul>
                        <button
                            className="w-full rounded-md bg-[#c0392b] py-2.5 text-sm font-bold uppercase tracking-wide text-white transition-colors hover:bg-[#C3073F]"
                            onClick={borrarTodoElStorage}
                        >
                            ⚠️ Reiniciar Todos Los Datos
                        </button>
                    </div>
                </div>
            </div>

            {modal && (
                <div
                    className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/75 p-5"
                    onClick={closeModal}
                >
                    <div
                        className="w-full max-w-[420px] rounded-xl border border-[#4E4E50] border-t-4 border-t-[#F0C808] bg-[#141416] p-6 shadow-2xl [animation:sf6-modal-in_0.15s_ease-out]"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <p className="mb-5 text-[15px] leading-relaxed text-white">{modal.message}</p>
                        <div className="flex justify-end gap-2.5">
                            {modal.type === "confirm" && (
                                <button
                                    className="rounded-md border border-[#4E4E50] px-4 py-2.5 text-xs font-bold uppercase tracking-wide text-gray-300 transition-colors hover:border-white hover:text-white"
                                    onClick={closeModal}
                                >
                                    Cancelar
                                </button>
                            )}
                            <button
                                className="rounded-md bg-[#F0C808] px-4 py-2.5 text-xs font-bold uppercase tracking-wide text-black transition-colors hover:bg-white"
                                onClick={() => {
                                    if (modal.type === "confirm") modal.onConfirm();
                                    closeModal();
                                }}
                            >
                                {modal.type === "confirm" ? "Confirmar" : "Aceptar"}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
