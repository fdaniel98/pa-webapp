// Tokens de movimiento compartidos. La idea es que toda la app use el mismo
// vocabulario en vez de duraciones sueltas: los cambios de opacidad son rápidos,
// los desplazamientos usan una curva de salida suave y todo lo que el usuario
// manipula directamente (arrastrar, interruptores) usa resortes.
//
// El respeto por "prefers-reduced-motion" se configura una sola vez en root.tsx
// con <MotionConfig reducedMotion="user">, más el bloque equivalente en app.css
// para las transiciones que hace Tailwind por CSS.

/** easeOutQuint: arranca rápido y frena suave. Se siente ágil sin ser brusco. */
export const EASE = [0.22, 1, 0.36, 1] as const;

export const DUR = {
    fast: 0.15,
    base: 0.22,
    slow: 0.32,
} as const;

/** Para elementos que el usuario mueve o alterna. */
export const SPRING = {type: "spring", stiffness: 420, damping: 34, mass: 0.7} as const;
/** Más blando, para reacomodos de layout grandes (filas del ranking). */
const SPRING_SOFT = {type: "spring", stiffness: 300, damping: 32, mass: 0.9} as const;

/** Botones compactos: un empujón sutil. */
export const HOVER = {scale: 1.02};
/**
 * Botones de ancho completo: escalarlos los saca de su contenedor, así que en vez
 * de crecer se levantan un poco.
 */
export const HOVER_WIDE = {y: -1};
export const TAP = {scale: 0.97};

/**
 * El scroll programático no pasa por <MotionConfig> ni por el CSS, así que aquí se
 * consulta la preferencia a mano para no arrastrar la pantalla a quien pidió menos
 * movimiento.
 */
export function scrollBehavior(): ScrollBehavior {
    const reducido =
        typeof window !== "undefined" &&
        window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    return reducido ? "auto" : "smooth";
}

/** Aparición simple, sin desplazamiento. */
export const FADE = {
    initial: {opacity: 0},
    animate: {opacity: 1},
    exit: {opacity: 0},
    transition: {duration: DUR.fast},
} as const;

/** Elementos de lista que entran por arriba y salen hacia el lado. */
export const LIST_ITEM_MOTION = {
    initial: {opacity: 0, y: -8},
    animate: {opacity: 1, y: 0},
    exit: {opacity: 0, x: 8},
    transition: {duration: DUR.base, ease: EASE},
} as const;

/** Filas del ranking: el reacomodo por arrastre se siente mejor con resorte. */
export const ROW_MOTION = {
    initial: {opacity: 0},
    animate: {opacity: 1},
    exit: {opacity: 0},
    transition: {layout: SPRING_SOFT, opacity: {duration: DUR.fast}},
} as const;
