import {useEffect, useState} from "react";
import {motion} from "motion/react";

import type {Player} from "~/lib/ranking";
import {HOVER, TAP} from "~/lib/motion";
import {BTN_BLUE, BTN_GHOST_SM, INPUT, LABEL} from "~/lib/theme";

type PlayerAdminProps = {
    jugadores: Player[];
    onAdd: (nombre: string, email: string) => void;
    onSetEmail: (playerId: string, email: string) => void;
};

export function PlayerAdmin({jugadores, onAdd, onSetEmail}: PlayerAdminProps) {
    const [nombre, setNombre] = useState("");
    const [email, setEmail] = useState("");

    const sinCorreo = jugadores.filter((j) => !j.email).length;

    function agregar() {
        onAdd(nombre, email);
        setNombre("");
        setEmail("");
    }

    return (
        <div className="sf6-scroll flex min-h-0 flex-1 flex-col gap-5 overflow-auto px-1 pb-1">
            <div className="grid gap-4 sm:grid-cols-2">
                <div>
                    <label htmlFor="nuevo-jugador" className={LABEL}>
                        Nombre del nuevo jugador
                    </label>
                    <input
                        id="nuevo-jugador"
                        type="text"
                        value={nombre}
                        onChange={(e) => setNombre(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === "Enter") agregar();
                        }}
                        placeholder="VALAK"
                        className={`${INPUT} w-full`}
                    />
                </div>

                <div>
                    <label htmlFor="nuevo-jugador-email" className={LABEL}>
                        Correo (opcional)
                    </label>
                    <input
                        id="nuevo-jugador-email"
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === "Enter") agregar();
                        }}
                        placeholder="jugador@correo.com"
                        className={`${INPUT} w-full`}
                    />
                </div>
            </div>

            <motion.button whileHover={HOVER} whileTap={TAP} className={`${BTN_BLUE} self-start`} onClick={agregar}>
                Agregar al Ranking
            </motion.button>

            <div className="border-t border-[#4E4E50] pt-4">
                <h3 className="mb-1 text-sm font-bold uppercase italic tracking-wide text-[#F0C808]">
                    Correos para notificaciones
                </h3>
                <p className="mb-3 text-xs text-gray-500">
                    Los avisos de retos se envían a estos correos.{" "}
                    {sinCorreo > 0
                        ? `${sinCorreo} jugador${sinCorreo === 1 ? "" : "es"} sin correo no recibirá${sinCorreo === 1 ? "" : "n"} nada.`
                        : "Todos los jugadores tienen correo."}
                </p>

                <ul className="space-y-2">
                    {jugadores.map((j) => (
                        <EmailRow key={j.id} jugador={j} onSave={onSetEmail}/>
                    ))}
                </ul>
            </div>
        </div>
    );
}

function EmailRow({jugador, onSave}: { jugador: Player; onSave: (id: string, email: string) => void }) {
    const [valor, setValor] = useState(jugador.email ?? "");

    // Si el ranking se recarga (o llega un cambio en vivo), reflejamos el valor guardado.
    useEffect(() => {
        setValor(jugador.email ?? "");
    }, [jugador.email]);

    const cambiado = valor.trim() !== (jugador.email ?? "");

    return (
        <li className="flex flex-wrap items-center gap-2 rounded-md border border-[#4E4E50]/60 bg-black/20 px-3 py-2">
            <span className="w-8 shrink-0 font-mono text-xs text-gray-500">#{jugador.rangoActual}</span>
            <span className="w-32 shrink-0 truncate text-sm font-semibold text-white">{jugador.nombre}</span>
            <input
                type="email"
                value={valor}
                onChange={(e) => setValor(e.target.value)}
                onKeyDown={(e) => {
                    if (e.key === "Enter" && cambiado) onSave(jugador.id, valor);
                }}
                placeholder="sin correo"
                aria-label={`Correo de ${jugador.nombre}`}
                className={`${INPUT} min-w-0 flex-1`}
            />
            <motion.button
                type="button"
                disabled={!cambiado}
                whileHover={cambiado ? HOVER : undefined}
                whileTap={cambiado ? TAP : undefined}
                className={`${BTN_GHOST_SM} disabled:cursor-not-allowed disabled:opacity-40`}
                onClick={() => onSave(jugador.id, valor)}
            >
                Guardar
            </motion.button>
        </li>
    );
}
