// Exportación de los retos vigentes como PNG, con el mismo marco que la imagen
// del ranking (image-export.ts). Cada fila dice quién reta a quién, con el puesto
// de los dos, qué puesto está en juego y las fechas de lanzamiento y caducidad.

import type {Challenge, Player} from "./ranking";
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

const DIA_MS = 1000 * 60 * 60 * 24;
/** Mismo umbral que la barra lateral: a dos días o menos, el reto va en rojo. */
const DIAS_URGENTE = 2;

export type FilaReto = {
    retador: string;
    puestoRetador: number;
    retado: string;
    puestoRetado: number;
    /** El puesto que se disputa, que es el del retado. */
    puestoEnJuego: number;
    lanzado: string;
    expira: string;
    diasRestantes: number;
    urgente: boolean;
};

/**
 * Ordena por caducidad: lo que primero vence, primero se lee. Los retos cuyos
 * jugadores ya no existen se descartan, igual que hace la interfaz.
 */
export function filasParaImagenRetos(
    retos: Challenge[],
    jugadores: Player[],
    ahora: number = Date.now()
): FilaReto[] {
    const porId = new Map(jugadores.map((jugador) => [jugador.id, jugador]));

    return [...retos]
        .sort((a, b) => a.expiraEn - b.expiraEn)
        .flatMap((reto) => {
            const retador = porId.get(reto.retadorId);
            const retado = porId.get(reto.retadoId);
            if (!retador || !retado) return [];

            const diasRestantes = Math.ceil((reto.expiraEn - ahora) / DIA_MS);

            return [{
                retador: retador.nombre,
                puestoRetador: retador.rangoActual,
                retado: retado.nombre,
                puestoRetado: retado.rangoActual,
                puestoEnJuego: retado.rangoActual,
                lanzado: fechaCorta(reto.creadoEn),
                expira: fechaCorta(reto.expiraEn),
                diasRestantes,
                urgente: diasRestantes <= DIAS_URGENTE,
            }];
        });
}

// Dos líneas por fila: el enfrentamiento y el puesto en juego.
const ALTO_FILA = 62;
const ANCHO_FECHA = 124;

export function altoImagenRetos(totalFilas: number): number {
    return altoLienzo(totalFilas * ALTO_FILA);
}

export async function exportarRetosComoImagen(
    retos: Challenge[],
    jugadores: Player[]
): Promise<void> {
    const filas = filasParaImagenRetos(retos, jugadores);
    if (filas.length === 0) throw new Error("No hay retos vigentes que exportar.");

    await esperarFuentes();

    const fecha = new Date();
    const lienzo = crearLienzo(altoImagenRetos(filas.length), "Retos vigentes");
    const {ctx, colores} = lienzo;

    const xReto = MARGEN + 16;
    const xExpira = ANCHO - MARGEN - ANCHO_FECHA;
    const xLanzado = xExpira - ANCHO_FECHA;
    const anchoReto = xLanzado - xReto - 16;
    const yEncabezado = ALTO_TITULO;

    dibujarEncabezado(lienzo, yEncabezado, [
        {texto: "RETO", x: xReto, ancho: anchoReto, izquierda: true},
        {texto: "LANZADO", x: xLanzado, ancho: ANCHO_FECHA},
        {texto: "EXPIRA", x: xExpira, ancho: ANCHO_FECHA},
    ]);

    filas.forEach((fila, indice) => {
        const y = yEncabezado + ALTO_ENCABEZADO + indice * ALTO_FILA;

        dibujarFila(lienzo, y, ALTO_FILA, indice);

        // Línea 1: los dos jugadores con su puesto actual.
        ctx.textAlign = "left";
        ctx.font = `600 17px ${FUENTE}`;
        const enfrentamiento = `${fila.retador} #${fila.puestoRetador}  vs  ${fila.retado} #${fila.puestoRetado}`;
        ctx.fillStyle = colores.texto;
        ctx.fillText(recortar(ctx, enfrentamiento, anchoReto), xReto, y + 22);

        // Línea 2: qué se disputa, que es lo que no se deduce de los nombres.
        ctx.font = `400 13px ${FUENTE}`;
        ctx.fillStyle = colores.marca;
        const enJuego = `${fila.retador} reta el puesto #${fila.puestoEnJuego} de ${fila.retado}`;
        ctx.fillText(recortar(ctx, enJuego, anchoReto), xReto, y + 44);

        ctx.textAlign = "center";
        ctx.font = `400 15px ${FUENTE}`;
        ctx.fillStyle = colores.texto;
        ctx.fillText(fila.lanzado, xLanzado + ANCHO_FECHA / 2, y + 22);

        ctx.fillStyle = fila.urgente ? colores.peligro : colores.texto;
        ctx.font = `${fila.urgente ? 700 : 400} 15px ${FUENTE}`;
        ctx.fillText(fila.expira, xExpira + ANCHO_FECHA / 2, y + 22);

        ctx.font = `400 13px ${FUENTE}`;
        ctx.fillStyle = fila.urgente ? colores.peligro : colores.linea;
        const restante =
            fila.diasRestantes === 1 ? "queda 1 día" : `quedan ${fila.diasRestantes} días`;
        ctx.fillText(restante, xExpira + ANCHO_FECHA / 2, y + 44);
    });

    dibujarPie(
        lienzo,
        `Actualizado el ${fechaCorta(fecha.getTime())} · ${filas.length} ${
            filas.length === 1 ? "reto vigente" : "retos vigentes"
        }`
    );

    await descargarPng(lienzo.canvas, nombreArchivo("retos-puello-academy", fecha));
}
