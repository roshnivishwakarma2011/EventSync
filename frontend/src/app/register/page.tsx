"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { ArrowLeft, ArrowRight, Loader2, MailCheck, Sparkles } from "lucide-react";
import { Logo } from "@/components/chrome";
import { OtpInput, useCountdown } from "@/components/otp-input";
import { useAuth, useToast } from "@/components/providers";
import { api, cx } from "@/lib/client";

function RegisterInner() {
  const router = useRouter();
  const { refresh, user } = useAuth();
  const { toast } = useToast();
  const [step, setStep] = useState<"details" | "code">("details");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [wait, setWait] = useCountdown(0);

  useEffect(() => {
    if (user) router.replace("/dashboard");
  }, [user, router]);

  // Step 1: ask the server to email a 6-digit code
  const sendCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    if (password.length < 8) { setError("Password must be at least 8 characters"); return; }
    setBusy(true); setError("");
    const res = await api("/api/auth/register", { method: "POST", body: { name, email, password } });
    setBusy(false);
    if (res.ok) {
      setEmail(res.data.email); setCode(""); setWait(res.data.resendIn ?? 30); setStep("code");
      toast({ title: "Check your email", body: `We sent a 6-digit code to ${res.data.email}`, kind: "info" });
    } else setError(res.error?.message ?? "Could not start signup");
  };

  // Step 2: check the code, which creates the account and signs the user in
  const verify = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (busy || code.length !== 6) return;
    setBusy(true); setError("");
    const res = await api("/api/auth/register/verify", { method: "POST", body: { email, code } });
    setBusy(false);
    if (res.ok) {
      await refresh();
      toast({ title: "Welcome to EventSync!", body: "Pick your interests to personalize discovery.", kind: "success" });
      router.push("/#foryou");
    } else { setError(res.error?.message ?? "Verification failed"); setCode(""); }
  };

  useEffect(() => { if (step === "code" && code.length === 6) verify(); /* auto-submit when all 6 digits are in */ // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code]);

  const resend = async () => {
    if (wait > 0 || busy) return;
    setError("");
    const res = await api("/api/auth/register/resend", { method: "POST", body: { email } });
    if (res.ok) { setWait(res.data.resendIn ?? 30); setCode(""); toast({ title: "New code sent", kind: "success" }); }
    else setError(res.error?.message ?? "Could not resend the code");
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center px-6 py-16">
      <div className="hero-bg"><div className="orb orb-1 !opacity-40" /><div className="orb orb-3 !opacity-30" /><div className="grid-bg" /></div>
      <div className="absolute left-6 top-6"><Logo /></div>
      <div className="relative z-10 w-full max-w-lg">
        <div className="card !border-white/12 p-8 shadow-2xl md:p-10">
          {step === "details" ? (
            <>
              <p className="chip mb-4 !border-[#7c5cff]/40 !text-[#c9baff]"><Sparkles size={12} /> Free forever</p>
              <h1 className="font-display text-3xl font-bold text-white">Create your account</h1>
              <p className="mt-2 text-sm text-[#9aa4b2]">Already have one? <Link href="/login" className="font-semibold text-[#a78bff] hover:text-white">Sign in</Link></p>

              <form onSubmit={sendCode} className="mt-7 space-y-4">
                <div>
                  <label htmlFor="name" className="label-xs mb-1.5 block">Full name</label>
                  <input id="name" required minLength={2} value={name} onChange={(e) => setName(e.target.value)} placeholder="Roshni Vishwakarma" className="input" autoComplete="name" />
                </div>
                <div>
                  <label htmlFor="email" className="label-xs mb-1.5 block">Email</label>
                  <input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" className="input" autoComplete="email" />
                  <p className="mt-1.5 text-[11px] text-[#5b6577]">We&apos;ll email you a code to confirm this address. Your tickets are sent here too.</p>
                </div>
                <div>
                  <label htmlFor="password" className="label-xs mb-1.5 block">Password</label>
                  <input id="password" type="password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="8+ characters" className="input" autoComplete="new-password" />
                  <div className="mt-2 flex gap-1" aria-hidden>
                    {[...Array(4)].map((_, i) => (
                      <span key={i} className={cx("h-1 flex-1 rounded-full transition-colors", password.length > i * 3 ? (password.length > 10 ? "bg-[#22d3a7]" : "bg-[#f5a623]") : "bg-white/10")} />
                    ))}
                  </div>
                </div>
                {error && <p role="alert" className="rounded-xl border border-[#ff6b8b]/30 bg-[#ff6b8b]/8 px-4 py-3 text-sm text-[#ff8fa8]">{error}</p>}
                <button type="submit" disabled={busy} className="btn btn-primary w-full !py-3.5">
                  {busy ? <Loader2 size={16} className="animate-spin" /> : <>Send verification code <ArrowRight size={16} /></>}
                </button>
              </form>
              <p className="mt-5 text-center text-[11px] leading-relaxed text-[#5b6577]">
                Want to host events? Organizer accounts are set up by an admin after you sign up.
              </p>
            </>
          ) : (
            <>
              <span className="mb-4 grid h-12 w-12 place-items-center rounded-2xl bg-[#7c5cff]/15 text-[#a78bff]"><MailCheck size={22} /></span>
              <h1 className="font-display text-3xl font-bold text-white">Verify your email</h1>
              <p className="mt-2 text-sm text-[#9aa4b2]">We sent a 6-digit code to <b className="text-white">{email}</b>. It expires in 10 minutes.</p>
              <form onSubmit={verify} className="mt-7 space-y-5">
                <OtpInput value={code} onChange={setCode} disabled={busy} />
                {error && <p role="alert" className="rounded-xl border border-[#ff6b8b]/30 bg-[#ff6b8b]/8 px-4 py-3 text-sm text-[#ff8fa8]">{error}</p>}
                <button type="submit" disabled={busy || code.length !== 6} className="btn btn-primary w-full !py-3.5">
                  {busy ? <Loader2 size={16} className="animate-spin" /> : <>Verify &amp; create account <ArrowRight size={16} /></>}
                </button>
              </form>
              <div className="mt-5 flex items-center justify-between text-sm">
                <button type="button" onClick={() => { setStep("details"); setError(""); setCode(""); }} className="flex items-center gap-1.5 text-[#9aa4b2] hover:text-white"><ArrowLeft size={14} /> Change email</button>
                <button type="button" onClick={resend} disabled={wait > 0} className="font-semibold text-[#a78bff] hover:text-white disabled:cursor-not-allowed disabled:text-[#5b6577]">
                  {wait > 0 ? `Resend code in ${wait}s` : "Resend code"}
                </button>
              </div>
              <p className="mt-5 text-center text-[11px] text-[#5b6577]">Can&apos;t find it? Check your spam folder.</p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default function RegisterPage() {
  return (
    <Suspense>
      <RegisterInner />
    </Suspense>
  );
}
