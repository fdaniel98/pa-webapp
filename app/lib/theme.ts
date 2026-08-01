// Estilos compartidos de la academia. Los colores son tokens definidos en
// app.css con @theme: brand, line, field, danger, success, info...

export const PAGE_BG = "page-bg";
export const PANEL = "rounded-lg border border-line bg-white/5 p-5";
export const SECTION_TITLE = "mb-3 text-sm font-bold uppercase italic tracking-wide text-brand";
export const LIST_ITEM = "rounded-r-md border-l-4 border-brand bg-black/30 px-3 py-2 text-sm";
export const EMPTY_ITEM = "text-sm text-gray-500";
export const LABEL = "mb-1.5 block text-xs font-bold uppercase tracking-wide text-gray-400";
// En móvil: 16px de fuente para que iOS no haga zoom al enfocar, y altura de
// 44px (mínimo táctil). A partir de sm vuelve al tamaño compacto de escritorio.
const INPUT_BASE =
    "min-h-11 rounded-md border border-brand/60 bg-field py-2.5 text-base text-white placeholder:text-gray-500 transition focus:outline-none focus:ring-2 focus:ring-brand/50 sm:min-h-0 sm:py-2 sm:text-sm";
export const INPUT = `${INPUT_BASE} px-3`;
/** Variante con espacio a la derecha para el botón de mostrar/ocultar contraseña. */
export const INPUT_WITH_ICON = `${INPUT_BASE} pl-3 pr-11`;
export const BTN_PRIMARY =
    "inline-flex min-h-11 items-center justify-center rounded-md bg-brand px-5 py-2.5 text-sm font-bold uppercase tracking-wide text-black transition-colors hover:bg-white disabled:cursor-not-allowed disabled:opacity-50 sm:min-h-0";
export const BTN_BLUE =
    "inline-flex min-h-11 items-center justify-center rounded-md bg-info px-5 py-2.5 text-sm font-bold uppercase tracking-wide text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50 sm:min-h-0";
export const BTN_WIN_SM =
    "inline-flex min-h-11 items-center justify-center rounded-md bg-success px-3 py-1.5 text-xs font-semibold text-white transition hover:brightness-110 sm:min-h-0";
export const BTN_DANGER_SM =
    "inline-flex min-h-11 items-center justify-center rounded-md bg-danger px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-danger-strong sm:min-h-0";
export const BTN_GHOST_SM =
    "inline-flex min-h-11 items-center justify-center rounded-md border border-line px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-gray-300 transition-colors hover:border-white hover:text-white sm:min-h-0";
export const LINK = "text-brand underline-offset-4 transition hover:underline";
