/** Aviso de propiedad y derechos, visible en toda la app. */
export function Footer({className = ""}: { className?: string }) {
    return (
        <footer className={`shrink-0 text-center text-xs leading-relaxed text-gray-500 ${className}`}>
            <p>
                © {new Date().getFullYear()}{" "}
                <span className="font-semibold text-gray-400">Tomas Puello</span>. Todos los derechos
                reservados.
            </p>
            <p>
                Esta página y todo su contenido son propiedad de Tomas Puello. Prohibida su reproducción o
                distribución sin autorización.
            </p>
        </footer>
    );
}
