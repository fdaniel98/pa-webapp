import {useState} from "react";
import {motion} from "motion/react";

import type {MatchReport} from "~/lib/matches";
import {parseScore} from "~/lib/score";
import {HOVER, TAP} from "~/lib/motion";
import type {Challenge, Player} from "~/lib/ranking";
import {BTN_DANGER_SM, BTN_PRIMARY, INPUT, LABEL} from "~/lib/theme";

type ChallengeReportProps = {
    reto: Challenge;
    retador: Player;
    retado: Player;
    onReport: (report: MatchReport) => void;
    onCancel: (challengeId: string) => void;
};

/** Formulario para introducir el resultado SF6 de un reto vigente. */
export function ChallengeReport({reto, retador, retado, onReport, onCancel}: ChallengeReportProps) {
    const [ganadorId, setGanadorId] = useState("");
    const [setsGanador, setSetsGanador] = useState("");
    const [setsPerdedor, setSetsPerdedor] = useState("");
    const [notas, setNotas] = useState("");
    const [error, setError] = useState<string | null>(null);

    const perdedor = ganadorId === retador.id ? retado : ganadorId === retado.id ? retador : null;

    function enviar(event: React.FormEvent) {
        event.preventDefault();
        setError(null);

        if (!ganadorId) {
            setError("Selecciona quién ganó el reto.");
            return;
        }

        const marcador = parseScore(setsGanador, setsPerdedor);
        if (!marcador.ok) {
            setError(marcador.error);
            return;
        }

        onReport({
            challengeId: reto.id,
            ganadorId,
            setsGanador: marcador.setsGanador,
            setsPerdedor: marcador.setsPerdedor,
            notas,
        });
    }

    const diasRestantes = Math.ceil((reto.expiraEn - Date.now()) / (1000 * 60 * 60 * 24));

    return (
        <form
            onSubmit={enviar}
            className="rounded-r-md border-l-4 border-info bg-info/10 p-3"
        >
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-sm">
                <span>
                    <strong>{retador.nombre}</strong>{" "}
                    <span className="text-gray-400">#{retador.rangoActual}</span> reta a{" "}
                    <strong>{retado.nombre}</strong>{" "}
                    <span className="text-gray-400">#{retado.rangoActual}</span>
                </span>
                <span className={`text-xs ${diasRestantes <= 2 ? "font-bold text-danger" : "text-gray-400"}`}>
                    Expira en {diasRestantes} día{diasRestantes === 1 ? "" : "s"}
                </span>
            </div>

            {error && (
                <p className="mb-3 rounded-r-md border-l-4 border-danger bg-danger/10 px-3 py-2 text-xs text-danger-soft">
                    {error}
                </p>
            )}

            <div className="grid gap-3 sm:grid-cols-2">
                <div className="sm:col-span-2">
                    <label htmlFor={`ganador-${reto.id}`} className={LABEL}>
                        ¿Quién ganó?
                    </label>
                    <select
                        id={`ganador-${reto.id}`}
                        value={ganadorId}
                        onChange={(e) => setGanadorId(e.target.value)}
                        className={`${INPUT} w-full`}
                    >
                        <option value="">Selecciona al ganador...</option>
                        <option value={retador.id}>{retador.nombre}</option>
                        <option value={retado.id}>{retado.nombre}</option>
                    </select>
                </div>

                <div>
                    <label htmlFor={`sg-${reto.id}`} className={LABEL}>
                        Games {ganadorId ? "del ganador" : "(ganador)"}
                    </label>
                    <input
                        id={`sg-${reto.id}`}
                        type="number"
                        min={0}
                        max={99}
                        inputMode="numeric"
                        value={setsGanador}
                        onChange={(e) => setSetsGanador(e.target.value)}
                        placeholder="3"
                        className={`${INPUT} w-full`}
                    />
                </div>

                <div>
                    <label htmlFor={`sp-${reto.id}`} className={LABEL}>
                        Games {perdedor ? `de ${perdedor.nombre}` : "(perdedor)"}
                    </label>
                    <input
                        id={`sp-${reto.id}`}
                        type="number"
                        min={0}
                        max={99}
                        inputMode="numeric"
                        value={setsPerdedor}
                        onChange={(e) => setSetsPerdedor(e.target.value)}
                        placeholder="1"
                        className={`${INPUT} w-full`}
                    />
                </div>

                <div className="sm:col-span-2">
                    <label htmlFor={`notas-${reto.id}`} className={LABEL}>
                        Notas (opcional)
                    </label>
                    <input
                        id={`notas-${reto.id}`}
                        type="text"
                        value={notas}
                        onChange={(e) => setNotas(e.target.value)}
                        placeholder="Personajes, incidencias, dónde se jugó..."
                        className={`${INPUT} w-full`}
                    />
                </div>
            </div>

            <p className="mt-2 text-xs text-gray-500">
                El marcador es opcional: puedes reportar sólo quién ganó.
            </p>

            <div className="mt-3 flex flex-wrap gap-2">
                <motion.button type="submit" whileHover={HOVER} whileTap={TAP} className={BTN_PRIMARY}>
                    Reportar resultado
                </motion.button>
                <motion.button
                    type="button"
                    whileHover={HOVER}
                    whileTap={TAP}
                    className={BTN_DANGER_SM}
                    onClick={() => onCancel(reto.id)}
                >
                    Cancelar reto
                </motion.button>
            </div>
        </form>
    );
}
