
"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import {
  ArrowRight,
  Eye,
  EyeOff,
  Loader2,
  LogIn,
  Sparkles,
  Ticket,
  Trophy,
} from "lucide-react";

import { Logo } from "@/components/chrome";
import { useAuth, useToast } from "@/components/providers";
import { api } from "@/lib/client";

function GoogleIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24">
      <path
        fill="#4285F4"
        d="M23.5 12.3c0-.9-.1-1.5-.3-2.2H12v4.3h6.5c-.1 1.1-.8 2.7-2.4 3.8l-.02.15 3.5 2.7.24.02c2.2-2 3.5-5 3.5-8.8z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.2 0 5.9-1.1 7.9-2.9l-3.8-2.9c-1 .7-2.4 1.2-4.1 1.2-3.2 0-5.8-2.1-6.8-5.1l-.14.01-3.7 2.9-.05.13C3.2 21.3 7.3 24 12 24z"
      />
      <path
        fill="#FBBC05"
        d="M5.2 14.3c-.25-.7-.4-1.5-.4-2.3s.15-1.6.4-2.3l-.01-.16-3.75-2.9-.12.06C.5 8.3 0 10.1 0 12s.5 3.7 1.3 5.3l3.9-3z"
      />
      <path
        fill="#EA4335"
        d="M12 4.6c2.2 0 3.7 1 4.6 1.8l3.3-3.2C17.9 1.2 15.2 0 12 0 7.3 0 3.2 2.7 1.3 6.7l3.9 3c1-3 3.6-5.1 6.8-5.1z"
      />
    </svg>
  );
}

function LoginInner() {
  const router = useRouter();
  const params = useSearchParams();

  const next = params.get("next") ?? "/dashboard";

  const { refresh, user } = useAuth();
  const { toast } = useToast();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [busy, setBusy] = useState(false);
  const [googleBusy, setGoogleBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (user) router.replace(next);
  }, [user, next, router]);

  /* ================= EMAIL LOGIN ================= */

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (busy) return;

    setBusy(true);
    setError("");

    try {
      const res = await api("/api/auth/login", {
        method: "POST",
        body: { email, password },
      });

      if (res.ok) {
        await refresh();

        toast({
          title: `Welcome back, ${res.data?.name?.split(" ")[0]}!`,
          kind: "success",
        });

        router.push(next);
      } else {
        setError(res.error?.message ?? "Login failed");
      }
    } catch {
      setError("Unable to connect to the server. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  /* ================= GOOGLE LOGIN ================= */

  const googleSignIn = async () => {
    const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;

    if (!clientId) {
      setError(
        "Google login is not configured. Add NEXT_PUBLIC_GOOGLE_CLIENT_ID to frontend/.env.local."
      );
      return;
    }

    if (googleBusy) return;

    setGoogleBusy(true);
    setError("");

    try {
      const googleWindow = window as any;

      const initializeGoogle = () => {
        return new Promise<void>((resolve, reject) => {
          if (!googleWindow.google?.accounts?.id) {
            reject(new Error("Google Sign-In could not be initialized."));
            return;
          }

          googleWindow.google.accounts.id.initialize({
            client_id: clientId,

            callback: async (response: any) => {
              try {
                if (!response?.credential) {
                  throw new Error("Google did not return a credential.");
                }

                const res = await api("/api/auth/google", {
                  method: "POST",
                  body: {
                    credential: response.credential,
                  },
                });

                if (!res.ok) {
                  throw new Error(
                    res.error?.message ?? "Google authentication failed."
                  );
                }

                await refresh();

                toast({
                  title: "Signed in with Google",
                  kind: "success",
                });

                router.push(next);
                resolve();
              } catch (err) {
                reject(err);
              }
            },
          });

          googleWindow.google.accounts.id.prompt();
          resolve();
        });
      };

      if (googleWindow.google?.accounts?.id) {
        await initializeGoogle();
      } else {
        await new Promise<void>((resolve, reject) => {
          const script = document.createElement("script");

          script.src = "https://accounts.google.com/gsi/client";
          script.async = true;
          script.defer = true;

          script.onload = () => {
            initializeGoogle().then(resolve).catch(reject);
          };

          script.onerror = () => {
            reject(new Error("Unable to load Google Sign-In."));
          };

          document.head.appendChild(script);
        });
      }
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Google sign-in failed. Please try again."
      );
    } finally {
      setGoogleBusy(false);
    }
  };

  /* ================= DEMO ACCOUNTS ================= */

  const fill = (em: string) => {
    setEmail(em);
    setPassword("demo1234");
    setError("");
  };

  const googleEnabled = !!process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;

  return (
    <div className="grid min-h-screen lg:grid-cols-[1fr_1.1fr]">

      {/* LEFT BRAND PANEL */}

      <div className="relative hidden overflow-hidden lg:flex lg:flex-col lg:justify-between lg:p-14">

        <div className="hero-bg">
          <div className="orb orb-1" />
          <div className="orb orb-2" />
          <div className="grid-bg" />
        </div>

        <Logo />

        <div className="relative z-10">
          <p className="chip mb-5 !border-[#7c5cff]/40 !text-[#c9baff]">
            <Sparkles size={12} />
            Welcome back
          </p>

          <h1 className="font-display text-5xl font-bold leading-[1.02] text-white">
            Your next
            <br />
            <span className="gradient-text">experience</span>
            <br />
            is waiting.
          </h1>

          <div className="mt-10 space-y-3.5">
            {[
              ["Ticket", "QR passes live in your pocket"],
              ["Trophy", "XP, levels & the leaderboard"],
              ["LogIn", "One account for discovery & hosting"],
            ].map(([icon, text]) => {
              const Icon =
                icon === "Ticket"
                  ? Ticket
                  : icon === "Trophy"
                    ? Trophy
                    : LogIn;

              return (
                <p
                  key={text}
                  className="flex items-center gap-3 text-sm text-[#c8cfdd]"
                >
                  <span className="grid h-9 w-9 place-items-center rounded-xl border border-white/10 bg-white/[0.04]">
                    <Icon size={15} className="text-[#a78bff]" />
                  </span>
                  {text}
                </p>
              );
            })}
          </div>
        </div>

        <p className="relative z-10 text-xs text-[#5b6577]">
          Real events across Indian cities · secure payments by Razorpay
        </p>
      </div>

      {/* RIGHT LOGIN PANEL */}

      <div className="relative flex items-center justify-center px-6 py-16">

        <div className="absolute left-6 top-6 lg:hidden">
          <Logo />
        </div>

        <div className="w-full max-w-md">

          <h2 className="font-display text-3xl font-bold text-white">
            Sign in
          </h2>

          <p className="mt-2 text-sm text-[#9aa4b2]">
            New to EventSync?{" "}
            <Link
              href="/register"
              className="font-semibold text-[#a78bff] hover:text-white"
            >
              Create an account
            </Link>
          </p>

          {/* GOOGLE BUTTON */}

          <button
            type="button"
            onClick={googleSignIn}
            disabled={googleBusy}
            className="btn btn-ghost mt-8 w-full !py-3.5"
          >
            {googleBusy ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              <GoogleIcon />
            )}

            Continue with Google
          </button>

          {!googleEnabled && (
            <p className="mt-2 text-center text-xs text-amber-400">
              Configure your Google Client ID to enable Google sign-in.
            </p>
          )}

          <div className="my-6 flex items-center gap-4 text-[11px] font-bold uppercase tracking-[0.18em] text-[#5b6577]">
            <span className="h-px flex-1 bg-white/8" />
            or with email
            <span className="h-px flex-1 bg-white/8" />
          </div>

          {/* EMAIL AND PASSWORD FORM */}

          <form onSubmit={submit} className="space-y-4">

            <div>
              <label htmlFor="email" className="label-xs mb-1.5 block">
                Email
              </label>

              <input
                id="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="input"
                autoComplete="email"
              />
            </div>

            <div>
              <div className="mb-1.5 flex items-center justify-between">

                <label htmlFor="password" className="label-xs block">
                  Password
                </label>

                <Link
                  href="/forgot-password"
                  className="text-[11px] font-semibold text-[#a78bff] hover:text-white"
                >
                  Forgot password?
                </Link>
              </div>

              <div className="relative">

                <input
                  id="password"
                  type={showPw ? "text" : "password"}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="input !pr-12"
                  autoComplete="current-password"
                />

                <button
                  type="button"
                  onClick={() => setShowPw((s) => !s)}
                  aria-label={showPw ? "Hide password" : "Show password"}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-[#5b6577] hover:text-white"
                >
                  {showPw ? (
                    <EyeOff size={16} />
                  ) : (
                    <Eye size={16} />
                  )}
                </button>

              </div>
            </div>

            {error && (
              <p
                role="alert"
                className="rounded-xl border border-[#ff6b8b]/30 bg-[#ff6b8b]/8 px-4 py-3 text-sm text-[#ff8fa8]"
              >
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={busy}
              className="btn btn-primary w-full !py-3.5"
            >
              {busy ? (
                <Loader2 size={16} className="animate-spin" />
              ) : (
                <>
                  Sign in
                  <ArrowRight size={16} />
                </>
              )}
            </button>

          </form>

          {/* DEMO ACCOUNTS */}

          <div className="mt-8 rounded-2xl border border-white/8 bg-white/[0.025] p-4">

            <p className="label-xs mb-2.5">
              Demo accounts (one tap)
            </p>

            <div className="flex flex-wrap gap-2">

              {[
                ["Attendee", "demo@eventsync.dev"],
                ["Organizer", "organizer@eventsync.dev"],
                ["Admin", "admin@eventsync.dev"],
              ].map(([label, address]) => (
                <button
                  key={label}
                  type="button"
                  onClick={() => fill(address)}
                  className="chip !py-1.5 text-[11px]"
                >
                  {label}
                </button>
              ))}

            </div>
          </div>

        </div>
      </div>
    </div>
  );
}

/* ================= PAGE EXPORT ================= */

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="min-h-screen" />}>
      <LoginInner />
    </Suspense>
  );
}
