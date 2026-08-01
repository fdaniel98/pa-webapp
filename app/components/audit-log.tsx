import {useCallback, useEffect, useState} from "react";
import {AnimatePresence, motion} from "motion/react";

import type {AuditEntry} from "~/lib/audit";
import {ACCION_LABEL, ACCIONES, describeDetalle, fetchAuditLog, purgeAuditLog} from "~/lib/audit";
import {HOVER, LIST_ITEM_MOTION, TAP} from "~/lib/motion";
import {BTN_GHOST_SM, INPUT, LABEL} from "~/lib/theme";

const PAGE_SIZE = 50;

/** Colores por familia de acción, para escanear la lista de un vistazo. */
function accionColor(accion: string) {
    if (accion.startsWith("reto_")) return "bg-[#3498db]/15 text-[#3498db]";
    if (accion.startsWith("sesion_")) return "bg-white/10 text-gray-300";
    if (accion.includes("eliminado") || accion === "ranking_reiniciado" || accion === "bitacora_purgada") {
        return "bg-[#C3073F]/15 text-[#ff8095]";
    }
    return "bg-[#F0C808]/15 text-[#F0C808]";
}

type AuditLogProps = {
    onConfirm: (message: string, action: () => void) => void;
};

export function AuditLog({onConfirm}: AuditLogProps) {
    const [entradas, setEntradas] = useState<AuditEntry[]>([]);
    const [accion, setAccion] = useState("");
    const [cargando, setCargando] = useState(true);
    const [hayMas, setHayMas] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [aviso, setAviso] = useState<string | null>(null);

    const cargar = useCallback(
        async (filtro: string, offset = 0) => {
            setCargando(true);
            try {
                const pagina = await fetchAuditLog({
                    accion: filtro || undefined,
                    limit: PAGE_SIZE,
                    offset,
                });
                setEntradas((prev) => (offset === 0 ? pagina : [...prev, ...pagina]));
                setHayMas(pagina.length === PAGE_SIZE);
                setError(null);
            } catch (err) {
                setError(err instanceof Error ? err.message : String(err));
            } finally {
                setCargando(false);
            }
        },
        []
    );

    useEffect(() => {
        void cargar(accion, 0);
    }, [cargar, accion]);

    function purgar() {
        onConfirm(
            "¿Eliminar las entradas de la bitácora con más de 180 días? Esta acción no se puede deshacer.",
            () => {
                setAviso(null);
                setError(null);
                purgeAuditLog(180)
                    .then((borradas) => {
                        setAviso(`${borradas} entrada${borradas === 1 ? "" : "s"} eliminada${borradas === 1 ? "" : "s"}.`);
                        return cargar(accion, 0);
                    })
                    .catch((err) => setError(err instanceof Error ? err.message : String(err)));
            }
        );
    }

    return (
        <div className="sf6-scroll flex min-h-0 flex-1 flex-col gap-4 overflow-auto px-1 pb-1">
            <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                    <label htmlFor="filtro-accion" className={LABEL}>
                        Filtrar por acción
                    </label>
                    <select
                        id="filtro-accion"
                        value={accion}
                        onChange={(e) => setAccion(e.target.value)}
                        className={`${INPUT} w-64`}
                    >
                        <option value="">Todas las acciones</option>
                        {ACCIONES.map((key) => (
                            <option key={key} value={key}>
                                {ACCION_LABEL[key]}
                            </option>
                        ))}
                    </select>
                </div>

                <div className="flex flex-wrap gap-2">
                    <motion.button type="button" whileHover={HOVER} whileTap={TAP} className={BTN_GHOST_SM}
                                   onClick={() => void cargar(accion, 0)}>
                        Actualizar
                    </motion.button>
                    <motion.button type="button" whileHover={HOVER} whileTap={TAP} className={BTN_GHOST_SM}
                                   onClick={purgar}>
                        Purgar (180d)
                    </motion.button>
                </div>
            </div>

            {error && (
                <p className="rounded-r-md border-l-4 border-[#C3073F] bg-[#C3073F]/10 px-3 py-2 text-xs text-[#ff8095]">
                    {error}
                </p>
            )}
            {aviso && (
                <p className="rounded-r-md border-l-4 border-[#2ecc71] bg-[#2ecc71]/10 px-3 py-2 text-xs text-[#7ee2a8]">
                    {aviso}
                </p>
            )}

            {entradas.length === 0 && !cargando ? (
                <p className="text-sm text-gray-500">
                    No hay acciones registradas{accion ? " para este filtro" : ""}.
                </p>
            ) : (
                <ul className="space-y-2">
                    <AnimatePresence mode="popLayout">
                        {entradas.map((e) => (
                            <motion.li
                                key={e.id}
                                layout
                                {...LIST_ITEM_MOTION}
                                className="rounded-md border border-[#4E4E50]/60 bg-black/20 px-3 py-2"
                            >
                                <div className="flex flex-wrap items-center gap-2 text-xs">
                                    <span className={`shrink-0 rounded-full px-2 py-0.5 font-semibold ${accionColor(e.accion)}`}>
                                        {ACCION_LABEL[e.accion] ?? e.accion}
                                    </span>
                                    <span className="font-semibold text-white">{e.actorNombre}</span>
                                    <span className="ml-auto shrink-0 text-gray-500">
                                        {new Date(e.createdAt).toLocaleString()}
                                    </span>
                                </div>
                                {Object.keys(e.detalle).length > 0 && (
                                    <p className="mt-1 break-words text-xs text-gray-400">
                                        {describeDetalle(e.detalle)}
                                    </p>
                                )}
                            </motion.li>
                        ))}
                    </AnimatePresence>
                </ul>
            )}

            {cargando && <p className="text-sm text-gray-500">Cargando bitácora...</p>}

            {hayMas && !cargando && (
                <motion.button
                    type="button"
                    whileHover={HOVER}
                    whileTap={TAP}
                    className={`${BTN_GHOST_SM} self-center`}
                    onClick={() => void cargar(accion, entradas.length)}
                >
                    Cargar más
                </motion.button>
            )}
        </div>
    );
}
