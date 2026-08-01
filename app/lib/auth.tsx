import {createContext, useCallback, useContext, useEffect, useMemo, useState} from "react";
import type {Session, User} from "@supabase/supabase-js";

import {recordSessionEvent} from "./audit";
import {authErrorMessage} from "./auth-errors";
import {absoluteUrl, supabase} from "./supabase";

export type Profile = {
    id: string;
    email: string | null;
    full_name: string | null;
    role: "admin" | "member";
    created_at: string;
};

type AuthContextValue = {
    session: Session | null;
    user: User | null;
    profile: Profile | null;
    /** true mientras se restaura la sesión guardada; evita parpadeos hacia /login. */
    loading: boolean;
    isAdmin: boolean;
    signIn: (email: string, password: string) => Promise<void>;
    signOut: () => Promise<void>;
    requestPasswordReset: (email: string) => Promise<void>;
    updatePassword: (password: string) => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export {authErrorMessage};

async function fetchProfile(userId: string): Promise<Profile | null> {
    const {data, error} = await supabase
        .from("profiles")
        .select("id, email, full_name, role, created_at")
        .eq("id", userId)
        .maybeSingle();

    if (error) {
        // La app sigue siendo usable sin perfil (p. ej. si la tabla aún no existe).
        console.warn("No se pudo cargar el perfil:", error.message);
        return null;
    }
    return data as Profile | null;
}

export function AuthProvider({children}: { children: React.ReactNode }) {
    const [session, setSession] = useState<Session | null>(null);
    const [profile, setProfile] = useState<Profile | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let active = true;

        supabase.auth.getSession().then(({data}) => {
            if (!active) return;
            setSession(data.session);
            setLoading(false);
        });

        const {data: subscription} = supabase.auth.onAuthStateChange((_event, nextSession) => {
            if (!active) return;
            setSession(nextSession);
            setLoading(false);
        });

        return () => {
            active = false;
            subscription.subscription.unsubscribe();
        };
    }, []);

    const userId = session?.user.id ?? null;

    useEffect(() => {
        if (!userId) {
            setProfile(null);
            return;
        }

        let active = true;
        fetchProfile(userId).then((result) => {
            if (active) setProfile(result);
        });

        return () => {
            active = false;
        };
    }, [userId]);

    const signIn = useCallback(async (email: string, password: string) => {
        const {error} = await supabase.auth.signInWithPassword({
            email: email.trim(),
            password,
        });
        if (error) throw error;

        // La bitácora nunca debe impedir entrar ni salir de la app.
        await recordSessionEvent("sesion_iniciada").catch(() => undefined);
    }, []);

    const signOut = useCallback(async () => {
        // Se registra antes de cerrar: después ya no hay sesión que identificar.
        await recordSessionEvent("sesion_cerrada").catch(() => undefined);

        const {error} = await supabase.auth.signOut();
        if (error) throw error;
    }, []);

    const requestPasswordReset = useCallback(async (email: string) => {
        const {error} = await supabase.auth.resetPasswordForEmail(email.trim(), {
            redirectTo: absoluteUrl("update-password"),
        });
        if (error) throw error;
    }, []);

    const updatePassword = useCallback(async (password: string) => {
        const {error} = await supabase.auth.updateUser({password});
        if (error) throw error;
    }, []);

    const value = useMemo<AuthContextValue>(
        () => ({
            session,
            user: session?.user ?? null,
            profile,
            loading,
            isAdmin: profile?.role === "admin",
            signIn,
            signOut,
            requestPasswordReset,
            updatePassword,
        }),
        [session, profile, loading, signIn, signOut, requestPasswordReset, updatePassword]
    );

    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
    const context = useContext(AuthContext);
    if (!context) {
        throw new Error("useAuth debe usarse dentro de <AuthProvider>.");
    }
    return context;
}
