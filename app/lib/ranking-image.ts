// Exportación del ranking como PNG. La imagen se dibuja en un canvas en vez de
// capturar el DOM: así sale siempre con las tres columnas que se comparten
// (puesto, jugador y cambio) sin las acciones de administración.
//
// El marco (título, franja de cabecera, pie) es el de image-export.ts, común con
// la imagen de retos.

import type {Player} from "./ranking";
import {
    ALTO_ENCABEZADO,
    ALTO_TITULO,
    altoLienzo,
    ANCHO,
    crearLienzo,
    descargarPng,
    dibujarEncabezado,
    dibujarFila,
    dibujarPie,
    esperarFuentes,
    fechaCorta,
    FUENTE,
    MARGEN,
    nombreArchivo,
    recortar,
} from "./image-export";

export type Tendencia = "sube" | "baja" | "igual";

export type FilaRanking = {
    puesto: number;
    nombre: string;
    /** Ya formateado: "▲ +2", "▼ -1" o "-". */
    cambio: string;
    tendencia: Tendencia;
};

/** El movimiento respecto al puesto anterior, tal y como se pinta en la tabla. */
export function cambioDePuesto(jugador: Player): { texto: string; tendencia: Tendencia } {
    const diferencia = jugador.rangoAnterior - jugador.rangoActual;
    if (diferencia > 0) return {texto: `▲ +${diferencia}`, tendencia: "sube"};
    if (diferencia < 0) return {texto: `▼ ${diferencia}`, tendencia: "baja"};
    return {texto: "-", tendencia: "igual"};
}

/** Ordena por puesto: la imagen no depende de cómo venga la lista. */
export function filasParaImagen(jugadores: Player[]): FilaRanking[] {
    return [...jugadores]
        .sort((a, b) => a.rangoActual - b.rangoActual)
        .map((jugador) => {
            const cambio = cambioDePuesto(jugador);
            return {
                puesto: jugador.rangoActual,
                nombre: jugador.nombre,
                cambio: cambio.texto,
                tendencia: cambio.tendencia,
            };
        });
}

const ALTO_FILA = 42;
const ANCHO_PUESTO = 84;
const ANCHO_CAMBIO = 150;

export function altoImagen(totalFilas: number): number {
    return altoLienzo(totalFilas * ALTO_FILA);
}

/** Genera el PNG del ranking y lo descarga. */
export async function exportarRankingComoImagen(jugadores: Player[]): Promise<void> {
    const filas = filasParaImagen(jugadores);
    if (filas.length === 0) throw new Error("No hay jugadores que exportar.");

    await esperarFuentes();

    const fecha = new Date();
    const lienzo = crearLienzo(altoImagen(filas.length));
    const {ctx, colores} = lienzo;

    const xPuesto = MARGEN;
    const xNombre = xPuesto + ANCHO_PUESTO;
    const xCambio = ANCHO - MARGEN - ANCHO_CAMBIO;
    const anchoNombre = xCambio - xNombre - 16;
    const yEncabezado = ALTO_TITULO;

    dibujarEncabezado(lienzo, yEncabezado, [
        {texto: "#", x: xPuesto, ancho: ANCHO_PUESTO},
        {texto: "JUGADOR", x: xNombre, ancho: anchoNombre, izquierda: true},
        {texto: "CAMBIO", x: xCambio, ancho: ANCHO_CAMBIO},
    ]);

    filas.forEach((fila, indice) => {
        const y = yEncabezado + ALTO_ENCABEZADO + indice * ALTO_FILA;
        const yTexto = y + ALTO_FILA / 2;

        dibujarFila(lienzo, y, ALTO_FILA, indice);

        ctx.textAlign = "center";
        ctx.fillStyle = colores.marca;
        ctx.font = `600 17px ${FUENTE}`;
        ctx.fillText(String(fila.puesto), xPuesto + ANCHO_PUESTO / 2, yTexto);

        ctx.textAlign = "left";
        ctx.fillStyle = colores.texto;
        ctx.font = `600 17px ${FUENTE}`;
        ctx.fillText(recortar(ctx, fila.nombre, anchoNombre), xNombre, yTexto);

        ctx.textAlign = "center";
        ctx.fillStyle =
            fila.tendencia === "sube"
                ? colores.exito
                : fila.tendencia === "baja"
                    ? colores.peligro
                    : colores.linea;
        ctx.font = `${fila.tendencia === "igual" ? 400 : 700} 16px ${FUENTE}`;
        ctx.fillText(fila.cambio, xCambio + ANCHO_CAMBIO / 2, yTexto);
    });

    dibujarPie(lienzo, `Actualizado el ${fechaCorta(fecha.getTime())} · ${filas.length} jugadores`);

    await descargarPng(lienzo.canvas, nombreArchivo("ranking-puello-academy", fecha));
}
