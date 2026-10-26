"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ArrowLeft, ArrowRight, KeyRound, Loader2 } from "lucide-react";
import { Logo } from "@/components/chrome";
import { OtpInput, useCountdown } from "@/components/otp-input";
import { useToast } from "@/components/providers";
import { api } from "@/lib/client";

export default function ForgotPasswordPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [step, setStep] = useState<"email" | "reset">("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [wait, setWait] = useCountdown(0);

  const send = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (busy || (step === "reset" && wait > 0)) return;
    setBusy(true); setError("");
    const res = await api("/api/auth/forgot", { method: "POST", body: { email } });
    setBusy(false);
    if (res.ok) { setEmail(res.data.email); setWait(res.data.resendIn ?? 30); setStep("reset"); setCode(""); }
    else setError(res.error?.message ?? "Could not send the code");
  };

  const reset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    if (code.length !== 6) { setError("Enter the 6-digit code from your email"); return; }
    if (password.length < 8) { setError("Password must be at least 8 characters"); return; }
    setBusy(true); setError("");
    const res = await api("/api/auth/reset", { method: "POST", body: { email, code, password } });
    setBusy(false);
    if (res.ok) { toast({ title: "Password updated", body: "You can sign in with your new password.", kind: "success" }); router.push("/login"); }
    else setError(res.error?.message ?? "Could not reset the password");
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center px-6 py-16">
      <div className="hero-bg"><div className="orb orb-1 !opacity-40" /><div className="grid-bg" /></div>
      <div className="absolute left-6 top-6"><Logo /></div>
      <div className="relative z-10 w-full max-w-md">
        <div className="card !border-white/12 p-8 shadow-2xl md:p-10">
          <span className="mb-4 grid h-12 w-12 place-items-center rounded-2xl bg-[#7c5cff]/15 text-[#a78bff]"><KeyRound size={22} /></span>
          <h1 className="font-display text-3xl font-bold text-white">Reset password</h1>
          {step === "email" ? (
            <>
              <p className="mt-2 text-sm text-[#9aa4b2]">Enter your email and we&apos;ll send you a 6-digit code.</p>
              <form onSubmit={send} className="mt-7 space-y-4">
                <div>
                  <label htmlFor="email" className="label-xs mb-1.5 block">Email</label>
                  <input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" className="input" autoComplete="email" />
                </div>
                {error && <p role="alert" className="rounded-xl border border-[#ff6b8b]/30 bg-[#ff6b8b]/8 px-4 py-3 text-sm text-[#ff8fa8]">{error}</p>}
                <button type="submit" disabled={busy} className="btn btn-primary w-full !py-3.5">{busy ? <Loader2 size={16} className="animate-spin" /> : <>Send code <ArrowRight size={16} /></>}</button>
              </form>
            </>
          ) : (
            <>
              <p className="mt-2 text-sm text-[#9aa4b2]">If <b className="text-white">{email}</b> has an account, a code is on its way. It expires in 10 minutes.</p>
              <form onSubmit={reset} className="mt-7 space-y-5">
                <OtpInput value={code} onChange={setCode} disabled={busy} />
                <div>
                  <label htmlFor="pw" className="label-xs mb-1.5 block">New password</label>
                  <input id="pw" type="password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="8+ characters" className="input" autoComplete="new-password" />
                </div>
                {error && <p role="alert" className="rounded-xl border border-[#ff6b8b]/30 bg-[#ff6b8b]/8 px-4 py-3 text-sm text-[#ff8fa8]">{error}</p>}
                <button type="submit" disabled={busy} className="btn btn-primary w-full !py-3.5">{busy ? <Loader2 size={16} className="animate-spin" /> : <>Update password <ArrowRight size={16} /></>}</button>
              </form>
              <div className="mt-5 flex items-center justify-between text-sm">
                <button type="button" onClick={() => { setStep("email"); setError(""); }} className="flex items-center gap-1.5 text-[#9aa4b2] hover:text-white"><ArrowLeft size={14} /> Change email</button>
                <button type="button" onClick={() => send()} disabled={wait > 0} className="font-semibold text-[#a78bff] hover:text-white disabled:cursor-not-allowed disabled:text-[#5b6577]">{wait > 0 ? `Resend in ${wait}s` : "Resend code"}</button>
              </div>
            </>
          )}
          <p className="mt-6 text-center text-sm text-[#9aa4b2]"><Link href="/login" className="font-semibold text-[#a78bff] hover:text-white">Back to sign in</Link></p>
        </div>
      </div>
    </div>
  );
}
