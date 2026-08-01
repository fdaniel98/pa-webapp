import {useCallback, useEffect, useState} from "react";
import {AnimatePresence, motion} from "motion/react";

import {FormMessage} from "./auth-shell";
import type {Profile} from "~/lib/auth";
import {useAuth} from "~/lib/auth";
import {createUser, deleteUser, listProfiles, setProfileRole} from "~/lib/users";
import {HOVER, TAP} from "~/lib/motion";
import {BTN_BLUE, BTN_DANGER_SM, BTN_GHOST_SM, INPUT, LABEL} from "~/lib/theme";

const MIN_PASSWORD_LENGTH = 8;
const PASSWORD_ALPHABET = "abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function generatePassword(length = 14) {
    const bytes = new Uint32Array(length);
    crypto.getRandomValues(bytes);
    return Array.from(bytes, (n) => PASSWORD_ALPHABET[n % PASSWORD_ALPHABET.length]).join("");
}

type UserAdminProps = {
    /** Reutiliza el modal de confirmación del ranking en vez de un confirm() del navegador. */
    onConfirm: (message: string, action: () => void) => void;
};

export function UserAdmin({onConfirm}: UserAdminProps) {
    const {user} = useAuth();

    const [profiles, setProfiles] = useState<Profile[]>([]);
    const [loadingList, setLoadingList] = useState(true);
    const [listError, setListError] = useState<string | null>(null);

    const [fullName, setFullName] = useState("");
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [role, setRole] = useState<Profile["role"]>("member");
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState<string | null>(null);
    const [submitting, setSubmitting] = useState(false);

    const refresh = useCallback(async () => {
        setLoadingList(true);
        try {
            setProfiles(await listProfiles());
            setListError(null);
        } catch (err) {
            setListError(err instanceof Error ? err.message : String(err));
        } finally {
            setLoadingList(false);
        }
    }, []);

    useEffect(() => {
        void refresh();
    }, [refresh]);

    async function handleSubmit(event: React.FormEvent) {
        event.preventDefault();
        setError(null);
        setSuccess(null);

        if (!fullName.trim()) {
            setError("Ingresa el nombre del jugador.");
            return;
        }
        if (password.length < MIN_PASSWORD_LENGTH) {
            setError(`La contraseña debe tener al menos ${MIN_PASSWORD_LENGTH} caracteres.`);
            return;
        }

        setSubmitting(true);
        try {
            const created = await createUser({email, password, fullName, role});
            setSuccess(
                `Cuenta creada para ${created.full_name ?? created.email}. Comparte la contraseña con el jugador; puede cambiarla desde "¿Olvidaste tu contraseña?".`
            );
            setFullName("");
            setEmail("");
            setPassword("");
            setRole("member");
            await refresh();
        } catch (err) {
            setError(err instanceof Error ? err.message : String(err));
        } finally {
            setSubmitting(false);
        }
    }

    function cambiarRol(perfil: Profile, role: Profile["role"]) {
        if (role === perfil.role) return;

        const nombre = perfil.full_name ?? perfil.email ?? "esta cuenta";
        onConfirm(
            role === "admin"
                ? `¿Dar permisos de administrador a ${nombre}? Podrá modificar el ranking y crear cuentas.`
                : `¿Quitar los permisos de administrador a ${nombre}? Pasará a sólo lectura.`,
            () => {
                setError(null);
                setSuccess(null);
                setProfileRole(perfil.id, role)
                    .then(() => {
                        setSuccess(`Rol actualizado para ${nombre}.`);
                        return refresh();
                    })
                    .catch((err) => setError(err instanceof Error ? err.message : String(err)));
            }
        );
    }

    function eliminarCuenta(perfil: Profile) {
        const nombre = perfil.full_name ?? perfil.email ?? "esta cuenta";
        onConfirm(
            `¿Eliminar la cuenta de ${nombre}? Perderá el acceso a la app de inmediato. Esta acción no se puede deshacer.`,
            () => {
                setError(null);
                setSuccess(null);
                deleteUser(perfil.id)
                    .then(() => {
                        setSuccess(`Cuenta de ${nombre} eliminada.`);
                        return refresh();
                    })
                    .catch((err) => setError(err instanceof Error ? err.message : String(err)));
            }
        );
    }

    return (
        <div className="sf6-scroll flex min-h-0 flex-1 flex-col gap-5 overflow-auto px-1 pb-1">
            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
                <AnimatePresence mode="wait">
                    {error && <FormMessage key="error" tone="error">{error}</FormMessage>}
                    {success && <FormMessage key="success" tone="success">{success}</FormMessage>}
                </AnimatePresence>

                <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                        <label htmlFor="new-user-name" className={LABEL}>
                            Nombre de jugador
                        </label>
                        <input
                            id="new-user-name"
                            type="text"
                            required
                            value={fullName}
                            onChange={(e) => setFullName(e.target.value)}
                            placeholder="VALAK"
                            className={`${INPUT} w-full`}
                        />
                    </div>

                    <div>
                        <label htmlFor="new-user-email" className={LABEL}>
                            Correo electrónico
                        </label>
                        <input
                            id="new-user-email"
                            type="email"
                            required
                            autoComplete="off"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            placeholder="jugador@correo.com"
                            className={`${INPUT} w-full`}
                        />
                    </div>

                    <div>
                        <label htmlFor="new-user-password" className={LABEL}>
                            Contraseña temporal
                        </label>
                        <div className="flex gap-2">
                            <input
                                id="new-user-password"
                                type="text"
                                required
                                autoComplete="off"
                                minLength={MIN_PASSWORD_LENGTH}
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                placeholder="Mínimo 8 caracteres"
                                className={`${INPUT} min-w-0 flex-1`}
                            />
                            <motion.button
                                type="button"
                                whileHover={HOVER}
                                whileTap={TAP}
                                className={BTN_GHOST_SM}
                                onClick={() => setPassword(generatePassword())}
                            >
                                Generar
                            </motion.button>
                        </div>
                    </div>

                    <div>
                        <label htmlFor="new-user-role" className={LABEL}>
                            Rol
                        </label>
                        <select
                            id="new-user-role"
                            value={role}
                            onChange={(e) => setRole(e.target.value as Profile["role"])}
                            className={`${INPUT} w-full`}
                        >
                            <option value="member">Miembro (sólo consulta)</option>
                            <option value="admin">Administrador</option>
                        </select>
                    </div>
                </div>

                <motion.button
                    type="submit"
                    disabled={submitting}
                    whileHover={submitting ? undefined : HOVER}
                    whileTap={submitting ? undefined : TAP}
                    className={`${BTN_BLUE} self-start`}
                >
                    {submitting ? "Creando cuenta..." : "Crear cuenta"}
                </motion.button>
            </form>

            <div className="border-t border-line pt-4">
                <div className="mb-3 flex items-center justify-between gap-3">
                    <h3 className="text-sm font-bold uppercase italic tracking-wide text-brand">
                        Cuentas registradas ({profiles.length})
                    </h3>
                    <motion.button
                        type="button"
                        whileHover={HOVER}
                        whileTap={TAP}
                        className={BTN_GHOST_SM}
                        onClick={() => void refresh()}
                    >
                        Actualizar
                    </motion.button>
                </div>

                {listError && <FormMessage tone="error">{listError}</FormMessage>}

                {loadingList ? (
                    <p className="text-sm text-gray-500">Cargando cuentas...</p>
                ) : profiles.length === 0 ? (
                    <p className="text-sm text-gray-500">Aún no hay cuentas registradas.</p>
                ) : (
                    <div className="overflow-x-auto rounded-md border border-line/60">
                        <table className="w-full border-separate border-spacing-0 text-sm">
                            <thead>
                            <tr>
                                <th className="bg-brand px-4 py-2.5 text-left text-xs font-bold uppercase tracking-wide text-black">
                                    Jugador
                                </th>
                                <th className="bg-brand px-4 py-2.5 text-left text-xs font-bold uppercase tracking-wide text-black">
                                    Correo
                                </th>
                                <th className="bg-brand px-4 py-2.5 text-center text-xs font-bold uppercase tracking-wide text-black">
                                    Rol
                                </th>
                                <th className="bg-brand px-4 py-2.5 text-center text-xs font-bold uppercase tracking-wide text-black">
                                    Alta
                                </th>
                                <th className="bg-brand px-4 py-2.5 text-center text-xs font-bold uppercase tracking-wide text-black">
                                    Acción
                                </th>
                            </tr>
                            </thead>
                            <tbody>
                            {profiles.map((p) => {
                                const esMiCuenta = p.id === user?.id;
                                return (
                                    <tr key={p.id} className="transition-colors hover:bg-white/5">
                                        <td className="border-b border-white/10 px-4 py-2.5 font-semibold text-white">
                                            {p.full_name ?? "-"}
                                            {esMiCuenta && (
                                                <span className="ml-2 text-xs font-normal text-gray-500">(tú)</span>
                                            )}
                                        </td>
                                        <td className="border-b border-white/10 px-4 py-2.5 text-gray-400">
                                            {p.email ?? "-"}
                                        </td>
                                        <td className="border-b border-white/10 px-4 py-2.5 text-center">
                                            {/* Nadie puede cambiar su propio rol: evita quedarse sin admins. */}
                                            {esMiCuenta ? (
                                                <span
                                                    className="inline-flex rounded-full bg-brand/15 px-2.5 py-1 text-xs font-semibold text-brand">
                                                    {p.role === "admin" ? "Admin" : "Miembro"}
                                                </span>
                                            ) : (
                                                <select
                                                    value={p.role}
                                                    aria-label={`Rol de ${p.full_name ?? p.email}`}
                                                    onChange={(e) =>
                                                        cambiarRol(p, e.target.value as Profile["role"])
                                                    }
                                                    className={`${INPUT} py-1 text-xs`}
                                                >
                                                    <option value="member">Miembro</option>
                                                    <option value="admin">Admin</option>
                                                </select>
                                            )}
                                        </td>
                                        <td className="border-b border-white/10 px-4 py-2.5 text-center text-xs text-gray-400">
                                            {new Date(p.created_at).toLocaleDateString()}
                                        </td>
                                        <td className="border-b border-white/10 px-4 py-2.5 text-center">
                                            {esMiCuenta ? (
                                                <span className="text-xs text-gray-600">—</span>
                                            ) : (
                                                <motion.button
                                                    type="button"
                                                    whileHover={HOVER}
                                                    whileTap={TAP}
                                                    className={BTN_DANGER_SM}
                                                    onClick={() => eliminarCuenta(p)}
                                                >
                                                    Eliminar
                                                </motion.button>
                                            )}
                                        </td>
                                    </tr>
                                );
                            })}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    );
}
