import {motion} from "motion/react";

import {Footer} from "./footer";
import {DUR, EASE} from "~/lib/motion";
import {PAGE_BG, PANEL} from "~/lib/theme";

/** Pantalla completa centrada, usada mientras se restaura la sesión. */
export function FullScreenMessage({children}: { children: React.ReactNode }) {
    return (
        <div
            className={`flex h-screen w-full items-center justify-center ${PAGE_BG} font-sans text-white`}
        >
            <p className="text-sm uppercase tracking-wide text-gray-400">{children}</p>
        </div>
    );
}

/** Tarjeta centrada para las pantallas de autenticación. */
export function AuthShell({
                              title,
                              subtitle,
                              children,
                          }: {
    title: string;
    subtitle?: string;
    children: React.ReactNode;
}) {
    return (
        <div
            className={`flex min-h-screen w-full flex-col items-center justify-center ${PAGE_BG} p-4 font-sans text-white`}
        >
            <h1 className="pb-6 text-center text-2xl font-bold italic uppercase tracking-wide text-brand md:text-3xl">
                修 Puello Academy
            </h1>

            <motion.div
                initial={{opacity: 0, y: 12}}
                animate={{opacity: 1, y: 0}}
                transition={{duration: DUR.slow, ease: EASE}}
                className={`${PANEL} w-full max-w-[420px] border-t-4 border-t-brand`}
            >
                <h2 className="text-lg font-bold uppercase italic tracking-wide text-white">{title}</h2>
                {subtitle && <p className="mt-1 text-sm text-gray-400">{subtitle}</p>}
                <div className="mt-5">{children}</div>
            </motion.div>

            <Footer className="mt-8 max-w-[420px]"/>
        </div>
    );
}

/** Banner de error/éxito de los formularios. */
export function FormMessage({tone, children}: { tone: "error" | "success"; children: React.ReactNode }) {
    const styles =
        tone === "error"
            ? "border-danger bg-danger/10 text-danger-soft"
            : "border-success bg-success/10 text-success-soft";

    return (
        <motion.p
            initial={{opacity: 0, y: -6}}
            animate={{opacity: 1, y: 0}}
            transition={{duration: DUR.base, ease: EASE}}
            role={tone === "error" ? "alert" : "status"}
            className={`rounded-r-md border-l-4 px-3 py-2 text-sm ${styles}`}
        >
            {children}
        </motion.p>
    );
}
