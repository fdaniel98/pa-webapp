// Estilos compartidos de la academia (paleta SF6: amarillo #F0C808 sobre negro).

export const PAGE_BG =
    "bg-[#0b0b0c] bg-[radial-gradient(circle,_#1a1a1d_0%,_#000000_100%)]";
export const PANEL = "rounded-lg border border-[#4E4E50] bg-white/5 p-5";
export const SECTION_TITLE = "mb-3 text-sm font-bold uppercase italic tracking-wide text-[#F0C808]";
export const LIST_ITEM = "rounded-r-md border-l-4 border-[#F0C808] bg-black/30 px-3 py-2 text-sm";
export const EMPTY_ITEM = "text-sm text-gray-500";
export const LABEL = "mb-1.5 block text-xs font-bold uppercase tracking-wide text-gray-400";
const INPUT_BASE =
    "rounded-md border border-[#F0C808]/60 bg-[#1A1A1D] py-2 text-sm text-white placeholder:text-gray-500 transition focus:outline-none focus:ring-2 focus:ring-[#F0C808]/50";
export const INPUT = `${INPUT_BASE} px-3`;
/** Variante con espacio a la derecha para el botón de mostrar/ocultar contraseña. */
export const INPUT_WITH_ICON = `${INPUT_BASE} pl-3 pr-11`;
export const BTN_PRIMARY =
    "rounded-md bg-[#F0C808] px-5 py-2.5 text-sm font-bold uppercase tracking-wide text-black transition-colors hover:bg-white disabled:cursor-not-allowed disabled:opacity-50";
export const BTN_BLUE =
    "rounded-md bg-[#3498db] px-5 py-2.5 text-sm font-bold uppercase tracking-wide text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50";
export const BTN_WIN_SM =
    "rounded-md bg-[#2ecc71] px-3 py-1.5 text-xs font-semibold text-white transition hover:brightness-110";
export const BTN_DANGER_SM =
    "rounded-md bg-[#C3073F] px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-[#ff4757]";
export const BTN_GHOST_SM =
    "rounded-md border border-[#4E4E50] px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-gray-300 transition-colors hover:border-white hover:text-white";
export const LINK = "text-[#F0C808] underline-offset-4 transition hover:underline";
