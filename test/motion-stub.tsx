/**
 * Sustituto de `motion/react` para los tests.
 *
 * El paquete se publica como ESM y Jest compila a CommonJS, así que requerirlo tal
 * cual falla. Además, las animaciones no son lo que se quiere afirmar en un test de
 * componente: aquí se renderiza el elemento HTML equivalente y se descartan las
 * props de animación.
 */
import {createElement, forwardRef} from "react";
import type {ReactNode} from "react";

const PROPS_DE_ANIMACION = new Set([
    "whileHover", "whileTap", "whileDrag", "whileFocus", "whileInView",
    "initial", "animate", "exit", "transition", "variants",
    "layout", "layoutId", "drag", "dragConstraints", "onDragEnd", "onDragStart",
    "values", "onReorder", "axis",
]);

function limpiar(props: Record<string, unknown>) {
    const salida: Record<string, unknown> = {};
    for (const [clave, valor] of Object.entries(props)) {
        if (!PROPS_DE_ANIMACION.has(clave) && clave !== "as") salida[clave] = valor;
    }
    return salida;
}

function componentePara(tag: string) {
    return forwardRef<unknown, Record<string, unknown>>((props, ref) => {
        const etiqueta = typeof props.as === "string" ? props.as : tag;
        const {children, ...resto} = limpiar(props);
        return createElement(etiqueta, {...resto, ref}, children as ReactNode);
    });
}

// El componente de cada etiqueta se guarda: si el proxy creara uno nuevo en cada
// acceso, React vería un tipo distinto en cada render y desmontaría el subárbol,
// perdiendo el foco y el texto de los inputs que haya dentro.
const cache = new Map<string, ReturnType<typeof componentePara>>();

export const motion: Record<string, ReturnType<typeof componentePara>> = new Proxy(
    {},
    {
        get: (_objetivo, tag: string) => {
            let componente = cache.get(tag);
            if (!componente) {
                componente = componentePara(tag);
                cache.set(tag, componente);
            }
            return componente;
        },
    }
) as never;

export const AnimatePresence = ({children}: { children?: ReactNode }) => children ?? null;
export const MotionConfig = ({children}: { children?: ReactNode }) => children ?? null;

export const Reorder = {
    Group: componentePara("div"),
    Item: componentePara("div"),
};
