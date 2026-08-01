// Marco común de las imágenes que exporta la app (ranking y retos): mismo ancho,
// mismo título, misma franja de cabecera y mismo pie. Cada exportador sólo pone
// sus filas, así que las dos imágenes no pueden acabar pareciéndose sólo a medias.

export const ANCHO = 760;
export const MARGEN = 28;
export const ALTO_TITULO = 104;
export const ALTO_ENCABEZADO = 46;
export const ALTO_PIE = 48;

export const TITULO_IMAGEN = "修 Ranking - Puello Academy";
export const FUENTE = '"Inter", ui-sans-serif, system-ui, sans-serif';

/** Se dibuja al doble de resolución para que el PNG aguante al ampliarlo. */
const ESCALA = 2;

export function altoLienzo(altoDeLasFilas: number): number {
    return ALTO_TITULO + ALTO_ENCABEZADO + altoDeLasFilas + ALTO_PIE;
}

export function nombreArchivo(prefijo: string, fecha: Date): string {
    const dia = [
        fecha.getFullYear(),
        String(fecha.getMonth() + 1).padStart(2, "0"),
        String(fecha.getDate()).padStart(2, "0"),
    ].join("-");
    return `${prefijo}-${dia}.png`;
}

export function fechaCorta(epoch: number): string {
    return new Date(epoch).toLocaleDateString();
}

export type Paleta = {
    marca: string;
    fondo: string;
    linea: string;
    panel: string;
    exito: string;
    peligro: string;
    texto: string;
};

/**
 * Los colores salen de los tokens de app.css, así que la imagen sigue al tema sin
 * repetir aquí la paleta. Los valores de reserva sólo actúan si el CSS todavía no
 * se aplicó (por ejemplo en un entorno sin estilos).
 */
function token(nombre: string, reserva: string): string {
    if (typeof document === "undefined") return reserva;
    const valor = getComputedStyle(document.documentElement).getPropertyValue(nombre).trim();
    return valor || reserva;
}

export function paleta(): Paleta {
    return {
        marca: token("--color-brand", "#f0c808"),
        fondo: token("--color-surface", "#0b0b0c"),
        linea: token("--color-line", "#4e4e50"),
        panel: token("--color-panel", "#141416"),
        exito: token("--color-success", "#2ecc71"),
        peligro: token("--color-danger-strong", "#ff4757"),
        texto: "#ffffff",
    };
}

export type Lienzo = {
    canvas: HTMLCanvasElement;
    ctx: CanvasRenderingContext2D;
    colores: Paleta;
    alto: number;
};

/** Fondo, borde de marca y título. El resto lo dibuja cada exportador. */
export function crearLienzo(alto: number, subtitulo?: string): Lienzo {
    const canvas = document.createElement("canvas");
    canvas.width = ANCHO * ESCALA;
    canvas.height = alto * ESCALA;

    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Este navegador no permite generar la imagen.");
    ctx.scale(ESCALA, ESCALA);

    const colores = paleta();

    ctx.fillStyle = colores.fondo;
    ctx.fillRect(0, 0, ANCHO, alto);

    ctx.strokeStyle = colores.marca;
    ctx.lineWidth = 3;
    ctx.strokeRect(1.5, 1.5, ANCHO - 3, alto - 3);

    ctx.textBaseline = "middle";
    ctx.textAlign = "center";
    ctx.fillStyle = colores.marca;
    ctx.font = `italic 700 32px ${FUENTE}`;
    // Con subtítulo el título sube para que el bloque siga midiendo lo mismo.
    ctx.fillText(TITULO_IMAGEN, ANCHO / 2, subtitulo ? 44 : ALTO_TITULO / 2, ANCHO - MARGEN * 2);

    if (subtitulo) {
        ctx.fillStyle = colores.texto;
        ctx.font = `600 16px ${FUENTE}`;
        ctx.fillText(subtitulo.toUpperCase(), ANCHO / 2, 78, ANCHO - MARGEN * 2);
    }

    return {canvas, ctx, colores, alto};
}

export type Celda = {
    texto: string;
    x: number;
    ancho: number;
    /** Por defecto centrado; a la izquierda el texto arranca justo en `x`. */
    izquierda?: boolean;
};

export function dibujarEncabezado(lienzo: Lienzo, y: number, celdas: Celda[]) {
    const {ctx, colores} = lienzo;

    ctx.fillStyle = colores.marca;
    ctx.fillRect(MARGEN, y, ANCHO - MARGEN * 2, ALTO_ENCABEZADO);

    ctx.fillStyle = colores.fondo;
    ctx.font = `700 15px ${FUENTE}`;
    for (const celda of celdas) {
        ctx.textAlign = celda.izquierda ? "left" : "center";
        ctx.fillText(celda.texto, celda.izquierda ? celda.x : celda.x + celda.ancho / 2, y + ALTO_ENCABEZADO / 2);
    }
}

/** Fondo alterno y línea inferior de una fila. */
export function dibujarFila(lienzo: Lienzo, y: number, alto: number, indice: number) {
    const {ctx, colores} = lienzo;

    if (indice % 2 === 1) {
        ctx.fillStyle = colores.panel;
        ctx.fillRect(MARGEN, y, ANCHO - MARGEN * 2, alto);
    }

    ctx.strokeStyle = colores.linea;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(MARGEN, y + alto + 0.5);
    ctx.lineTo(ANCHO - MARGEN, y + alto + 0.5);
    ctx.stroke();
}

export function dibujarPie(lienzo: Lienzo, texto: string) {
    const {ctx, colores, alto} = lienzo;
    ctx.textAlign = "center";
    ctx.fillStyle = colores.linea;
    ctx.font = `400 13px ${FUENTE}`;
    ctx.fillText(texto, ANCHO / 2, alto - ALTO_PIE / 2);
}

export function recortar(ctx: CanvasRenderingContext2D, texto: string, anchoMaximo: number): string {
    if (ctx.measureText(texto).width <= anchoMaximo) return texto;

    let corto = texto;
    while (corto.length > 1 && ctx.measureText(`${corto}…`).width > anchoMaximo) {
        corto = corto.slice(0, -1);
    }
    return `${corto}…`;
}

/** Sin esperar a las fuentes, el canvas dibuja con la de reserva del sistema. */
export function esperarFuentes(): Promise<unknown> {
    return Promise.resolve(document.fonts?.ready);
}

function aBlob(canvas: HTMLCanvasElement): Promise<Blob> {
    return new Promise((resolver, rechazar) => {
        canvas.toBlob((blob) => {
            if (blob) resolver(blob);
            else rechazar(new Error("No se pudo generar la imagen."));
        }, "image/png");
    });
}

export async function descargarPng(canvas: HTMLCanvasElement, nombre: string): Promise<void> {
    const blob = await aBlob(canvas);
    const url = URL.createObjectURL(blob);
    const enlace = document.createElement("a");
    enlace.href = url;
    enlace.download = nombre;
    enlace.click();
    URL.revokeObjectURL(url);
}
