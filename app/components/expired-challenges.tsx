import {useCallback, useEffect, useState} from "react";
import {AnimatePresence, motion} from "motion/react";

import type {ExpiredChallenge} from "~/lib/expired-challenges";
import {
    fetchExpiredChallenges,
    MOTIVO_MAX,
    setExpiredChallengeReason,
} from "~/lib/expired-challenges";
import {HOVER, LIST_ITEM_MOTION, TAP} from "~/lib/motion";
import {BTN_GHOST_SM, BTN_PRIMARY, EMPTY_ITEM, INPUT} from "~/lib/theme";

const PAGE_SIZE = 20;

function fecha(epoch: number) {
    return new Date(epoch).toLocaleDateString();
}

/**
 * Retos que se cerraron sin jugarse. El motivo es opcional y se escribe cuando se
 * sabe, casi siempre días después de que el reto venciera.
 *
 * `recargar` es un contador: la lista se re-consulta cuando el ranking acaba de
 * cerrar un reto, sin esperar a que el admin pulse Actualizar.
 */
export function ExpiredChallenges({recargar = 0}: { recargar?: number }) {
    const [retos, setRetos] = useState<ExpiredChallenge[]>([]);
    const [cargando, setCargando] = useState(true);
    const [hayMas, setHayMas] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [editandoId, setEditandoId] = useState<string | null>(null);
    const [borrador, setBorrador] = useState("");
    const [guardando, setGuardando] = useState(false);

    const cargar = useCallback(async (offset = 0) => {
        setCargando(true);
        try {
            const pagina = await fetchExpiredChallenges({limit: PAGE_SIZE, offset});
            setRetos((prev) => (offset === 0 ? pagina : [...prev, ...pagina]));
            setHayMas(pagina.length === PAGE_SIZE);
            setError(null);
        } catch (err) {
            setError(err instanceof Error ? err.message : String(err));
        } finally {
            setCargando(false);
        }
    }, []);

    useEffect(() => {
        void cargar(0);
    }, [cargar, recargar]);

    function abrirEdicion(reto: ExpiredChallenge) {
        setEditandoId(reto.id);
        setBorrador(reto.motivo ?? "");
        setError(null);
    }

    function cerrarEdicion() {
        setEditandoId(null);
        setBorrador("");
    }

    async function guardar(event: React.FormEvent, reto: ExpiredChallenge) {
        event.preventDefault();
        setGuardando(true);
        try {
            await setExpiredChallengeReason(reto.id, borrador);
            cerrarEdicion();
            // Se recarga la primera página: el motivo también trae quién y cuándo
            // lo escribió, y eso lo pone Postgres.
            await cargar(0);
        } catch (err) {
            setError(err instanceof Error ? err.message : String(err));
        } finally {
            setGuardando(false);
        }
    }

    return (
        <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between gap-3">
                <p className="text-xs text-gray-500">
                    Un reto vencido o cancelado no cambia el ranking. Anota aquí por qué no se jugó.
                </p>
                <motion.button
                    type="button"
                    whileHover={HOVER}
                    whileTap={TAP}
                    className={BTN_GHOST_SM}
                    onClick={() => void cargar(0)}
                >
                    Actualizar
                </motion.button>
            </div>

            {error && (
                <p className="rounded-r-md border-l-4 border-danger bg-danger/10 px-3 py-2 text-xs text-danger-soft">
                    {error}
                </p>
            )}

            {retos.length === 0 && !cargando ? (
                <p className={EMPTY_ITEM}>Ningún reto ha expirado todavía.</p>
            ) : (
                <ul className="space-y-2">
                    <AnimatePresence mode="popLayout">
                        {retos.map((r) => (
                            <motion.li
                                key={r.id}
                                layout
                                {...LIST_ITEM_MOTION}
                                className="rounded-r-md border-l-4 border-danger-muted bg-black/20 px-3 py-2"
                            >
                                <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
                                    <span className="font-semibold text-white">{r.retadorNombre}</span>
                                    <span className="text-gray-500">retaba a</span>
                                    <span className="font-semibold text-white">{r.retadoNombre}</span>
                                    <span
                                        className="rounded bg-white/10 px-2 py-0.5 text-xs uppercase tracking-wide text-gray-300">
                                        {r.causa === "vencido" ? "Venció" : "Cancelado"}
                                    </span>
                                    <span className="ml-auto text-xs text-gray-500">{fecha(r.cerradoEn)}</span>
                                </div>

                                {editandoId === r.id ? (
                                    <form onSubmit={(e) => void guardar(e, r)} className="mt-2">
                                        <label htmlFor={`motivo-${r.id}`} className="sr-only">
                                            Motivo de la expiración
                                        </label>
                                        <input
                                            id={`motivo-${r.id}`}
                                            type="text"
                                            value={borrador}
                                            maxLength={MOTIVO_MAX}
                                            onChange={(e) => setBorrador(e.target.value)}
                                            placeholder="Viaje, lesión, no coincidieron horarios..."
                                            className={`${INPUT} w-full`}
                                        />
                                        <div className="mt-2 flex flex-wrap items-center gap-2">
                                            <motion.button
                                                type="submit"
                                                whileHover={HOVER}
                                                whileTap={TAP}
                                                disabled={guardando}
                                                className={BTN_PRIMARY}
                                            >
                                                Guardar motivo
                                            </motion.button>
                                            <motion.button
                                                type="button"
                                                whileHover={HOVER}
                                                whileTap={TAP}
                                                className={BTN_GHOST_SM}
                                                onClick={cerrarEdicion}
                                            >
                                                Cancelar
                                            </motion.button>
                                            <span className="text-xs text-gray-500">
                                                Déjalo vacío para quitar el motivo.
                                            </span>
                                        </div>
                                    </form>
                                ) : (
                                    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
                                        {r.motivo ? (
                                            <p className="text-xs italic text-gray-300">{r.motivo}</p>
                                        ) : (
                                            <p className="text-xs text-gray-500">Sin motivo registrado.</p>
                                        )}
                                        <motion.button
                                            type="button"
                                            whileHover={HOVER}
                                            whileTap={TAP}
                                            className={BTN_GHOST_SM}
                                            onClick={() => abrirEdicion(r)}
                                        >
                                            {r.motivo ? "Editar motivo" : "Añadir motivo"}
                                        </motion.button>
                                        {r.motivoPor && (
                                            <span className="text-xs text-gray-600">
                                                anotó {r.motivoPor}
                                                {r.motivoEn ? ` · ${fecha(r.motivoEn)}` : ""}
                                            </span>
                                        )}
                                    </div>
                                )}
                            </motion.li>
                        ))}
                    </AnimatePresence>
                </ul>
            )}

            {cargando && <p className={EMPTY_ITEM}>Cargando retos expirados...</p>}

            {hayMas && !cargando && (
                <motion.button
                    type="button"
                    whileHover={HOVER}
                    whileTap={TAP}
                    className={`${BTN_GHOST_SM} self-center`}
                    onClick={() => void cargar(retos.length)}
                >
                    Cargar más
                </motion.button>
            )}
        </div>
    );
}
