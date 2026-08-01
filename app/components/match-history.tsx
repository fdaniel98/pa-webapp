import {useCallback, useEffect, useState} from "react";
import {AnimatePresence, motion} from "motion/react";

import type {Match, PlayerRecord} from "~/lib/matches";
import {fetchMatches, fetchPlayerRecord} from "~/lib/matches";
import {HOVER, LIST_ITEM_MOTION, TAP} from "~/lib/motion";
import type {Player} from "~/lib/ranking";
import {BTN_GHOST_SM, INPUT, LABEL} from "~/lib/theme";

const PAGE_SIZE = 40;

function marcador(m: Match) {
    if (m.setsGanador === null || m.setsPerdedor === null) return "sin marcador";
    return `${m.setsGanador}-${m.setsPerdedor}`;
}

/** "#5 → #4" con color según si subió o bajó. */
function Movimiento({antes, despues}: { antes: number; despues: number }) {
    const subio = despues < antes;
    const igual = despues === antes;
    return (
        <span className={igual ? "text-gray-500" : subio ? "text-success" : "text-danger"}>
            #{antes} → #{despues}
        </span>
    );
}

export function MatchHistory({jugadores}: { jugadores: Player[] }) {
    const [playerId, setPlayerId] = useState("");
    const [matches, setMatches] = useState<Match[]>([]);
    const [record, setRecord] = useState<PlayerRecord | null>(null);
    const [cargando, setCargando] = useState(true);
    const [hayMas, setHayMas] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const cargar = useCallback(async (filtro: string, offset = 0) => {
        setCargando(true);
        try {
            // Las dos consultas son independientes: en serie se sumaban sus
            // latencias sin necesidad.
            const [pagina, recordJugador] = await Promise.all([
                fetchMatches({playerId: filtro || undefined, limit: PAGE_SIZE, offset}),
                filtro ? fetchPlayerRecord(filtro) : Promise.resolve(null),
            ]);

            setMatches((prev) => (offset === 0 ? pagina : [...prev, ...pagina]));
            setHayMas(pagina.length === PAGE_SIZE);
            setRecord(recordJugador);
            setError(null);
        } catch (err) {
            setError(err instanceof Error ? err.message : String(err));
        } finally {
            setCargando(false);
        }
    }, []);

    useEffect(() => {
        void cargar(playerId, 0);
    }, [cargar, playerId]);

    const jugadorSeleccionado = jugadores.find((j) => j.id === playerId);

    return (
        <div className="sf6-scroll flex min-h-0 flex-1 flex-col gap-4 overflow-auto px-1 pb-1">
            <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                    <label htmlFor="filtro-jugador" className={LABEL}>
                        Filtrar por jugador
                    </label>
                    <select
                        id="filtro-jugador"
                        value={playerId}
                        onChange={(e) => setPlayerId(e.target.value)}
                        className={`${INPUT} w-full sm:w-64`}
                    >
                        <option value="">Todos los enfrentamientos</option>
                        {jugadores.map((j) => (
                            <option key={j.id} value={j.id}>
                                #{j.rangoActual} {j.nombre}
                            </option>
                        ))}
                    </select>
                </div>

                <motion.button type="button" whileHover={HOVER} whileTap={TAP} className={BTN_GHOST_SM}
                               onClick={() => void cargar(playerId, 0)}>
                    Actualizar
                </motion.button>
            </div>

            {error && (
                <p className="rounded-r-md border-l-4 border-danger bg-danger/10 px-3 py-2 text-xs text-danger-soft">
                    {error}
                </p>
            )}

            {record && jugadorSeleccionado && (
                <div className="grid grid-cols-2 gap-2 rounded-md border border-brand/40 bg-brand/5 p-3 sm:grid-cols-4">
                    <Dato etiqueta="Puesto actual" valor={`#${jugadorSeleccionado.rangoActual}`}/>
                    <Dato etiqueta="Récord" valor={`${record.victorias}V - ${record.derrotas}D`}/>
                    <Dato etiqueta="Retos jugados" valor={String(record.jugados)}/>
                    <Dato
                        etiqueta="Games"
                        valor={`${record.games_a_favor} - ${record.games_en_contra}`}
                    />
                </div>
            )}

            {matches.length === 0 && !cargando ? (
                <p className="text-sm text-gray-500">
                    {playerId
                        ? "Este jugador aún no tiene enfrentamientos registrados."
                        : "Todavía no se ha resuelto ningún reto."}
                </p>
            ) : (
                <ul className="space-y-2">
                    <AnimatePresence mode="popLayout">
                        {matches.map((m) => {
                            const gano = playerId !== "" && m.ganadorId === playerId;
                            const perdio = playerId !== "" && m.perdedorId === playerId;

                            return (
                                <motion.li
                                    key={m.id}
                                    layout
                                    {...LIST_ITEM_MOTION}
                                    className={`rounded-r-md border-l-4 bg-black/20 px-3 py-2 ${
                                        gano
                                            ? "border-success"
                                            : perdio
                                                ? "border-danger"
                                                : "border-line"
                                    }`}
                                >
                                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
                                        <span className="font-semibold text-success">{m.ganadorNombre}</span>
                                        <span className="text-gray-500">venció a</span>
                                        <span className="font-semibold text-white">{m.perdedorNombre}</span>
                                        <span className="rounded bg-white/10 px-2 py-0.5 font-mono text-xs text-gray-200">
                                            {marcador(m)}
                                        </span>
                                        <span className="ml-auto text-xs text-gray-500">
                                            {new Date(m.createdAt).toLocaleDateString()}
                                        </span>
                                    </div>

                                    <div className="mt-1 flex flex-wrap gap-x-4 text-xs text-gray-400">
                                        <span>
                                            {m.ganadorNombre}:{" "}
                                            <Movimiento antes={m.puestoGanadorAntes} despues={m.puestoGanadorDespues}/>
                                        </span>
                                        <span>
                                            {m.perdedorNombre}:{" "}
                                            <Movimiento antes={m.puestoPerdedorAntes}
                                                        despues={m.puestoPerdedorDespues}/>
                                        </span>
                                        {m.reportadoPor && (
                                            <span className="text-gray-600">reportó {m.reportadoPor}</span>
                                        )}
                                    </div>

                                    {m.notas && <p className="mt-1 text-xs italic text-gray-500">{m.notas}</p>}
                                </motion.li>
                            );
                        })}
                    </AnimatePresence>
                </ul>
            )}

            {cargando && <p className="text-sm text-gray-500">Cargando historial...</p>}

            {hayMas && !cargando && (
                <motion.button
                    type="button"
                    whileHover={HOVER}
                    whileTap={TAP}
                    className={`${BTN_GHOST_SM} self-center`}
                    onClick={() => void cargar(playerId, matches.length)}
                >
                    Cargar más
                </motion.button>
            )}
        </div>
    );
}

function Dato({etiqueta, valor}: { etiqueta: string; valor: string }) {
    return (
        <div>
            <p className="text-[11px] uppercase tracking-wide text-gray-500">{etiqueta}</p>
            <p className="text-lg font-bold text-brand">{valor}</p>
        </div>
    );
}
