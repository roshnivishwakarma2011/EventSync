"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { api, type SessionUser } from "@/lib/client";
import { CheckCircle2, XCircle, Info, Sparkles } from "lucide-react";

/* ------------------------------ auth ------------------------------ */

interface AuthCtx {
  user: SessionUser | null;
  loading: boolean;
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthCtx>({ user: null, loading: true, refresh: async () => {}, signOut: async () => {} });

export function useAuth() {
  return useContext(AuthContext);
}

/* ------------------------------ toast ------------------------------ */

interface Toast { id: number; title: string; body?: string; kind: "success" | "error" | "info" | "xp"; }
interface ToastCtx { toast: (t: Omit<Toast, "id">) => void; }

const ToastContext = createContext<ToastCtx>({ toast: () => {} });

export function useToast() {
  return useContext(ToastContext);
}

let toastId = 1;

export function Providers({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [toasts, setToasts] = useState<Toast[]>([]);

  const refresh = useCallback(async () => {
    const res = await api<SessionUser>("/api/auth/me");
    setUser(res.ok && res.data ? res.data : null);
    setLoading(false);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const signOut = useCallback(async () => {
    await api("/api/auth/logout", { method: "POST" });
    setUser(null);
  }, []);

  const toast = useCallback((t: Omit<Toast, "id">) => {
    const id = toastId++;
    setToasts((prev) => [...prev.slice(-3), { ...t, id }]);
    setTimeout(() => setToasts((prev) => prev.filter((x) => x.id !== id)), 4200);
  }, []);

  const authValue = useMemo(() => ({ user, loading, refresh, signOut }), [user, loading, refresh, signOut]);
  const toastValue = useMemo(() => ({ toast }), [toast]);

  return (
    <AuthContext.Provider value={authValue}>
      <ToastContext.Provider value={toastValue}>
        {children}
        <div className="fixed bottom-5 right-5 z-[100] flex w-[min(92vw,380px)] flex-col gap-2" role="status" aria-live="polite">
          {toasts.map((t) => (
            <div key={t.id} className="toast-in glass flex items-start gap-3 rounded-2xl border border-white/10 p-4 shadow-2xl">
              <span className="mt-0.5 shrink-0">
                {t.kind === "success" && <CheckCircle2 size={19} className="text-[#22d3a7]" />}
                {t.kind === "error" && <XCircle size={19} className="text-[#ff6b8b]" />}
                {t.kind === "info" && <Info size={19} className="text-[#45c8ff]" />}
                {t.kind === "xp" && <Sparkles size={19} className="text-[#a78bff]" />}
              </span>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-white">{t.title}</p>
                {t.body && <p className="mt-0.5 text-xs leading-relaxed text-[#9aa4b2]">{t.body}</p>}
              </div>
            </div>
          ))}
        </div>
      </ToastContext.Provider>
    </AuthContext.Provider>
  );
}
