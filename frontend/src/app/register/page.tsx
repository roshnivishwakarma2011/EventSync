"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { ArrowLeft, ArrowRight, Loader2, MailCheck, Smartphone, Sparkles } from "lucide-react";
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
  const [gender, setGender] = useState("");
  const [dob, setDob] = useState("");
  const [phone, setPhone] = useState("");
  const [via, setVia] = useState<"email" | "phone">("email");   // where the OTP is sent
  const [sentTo, setSentTo] = useState("");                      // masked email / phone shown on the code step
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
    if (!gender) { setError("Please select your gender"); return; }
    if (!dob) { setError("Please enter your date of birth"); return; }
    if (phone.replace(/\D/g, "").length < 10) { setError("Enter a valid phone number (at least 10 digits)"); return; }
    setBusy(true); setError("");
    const res = await api("/api/auth/register", { method: "POST", body: { name, email, password, gender, dob, phone, verifyVia: via } });
    setBusy(false);
    if (res.ok) {
      setEmail(res.data.email); setVia(res.data.via ?? via); setSentTo(res.data.sentTo ?? res.data.email); setCode(""); setWait(res.data.resendIn ?? 30); setStep("code");
      toast({ title: res.data.via === "phone" ? "Check your messages" : "Check your email", body: `We sent a 6-digit code to ${res.data.sentTo ?? res.data.email}`, kind: "info" });
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

  // resend the code; pass a channel to switch (e.g. the SMS never arrived, so send it by email instead)
  const resend = async (switchTo?: "email" | "phone") => {
    if (wait > 0 || busy) return;
    setError("");
    const res = await api("/api/auth/register/resend", { method: "POST", body: { email, verifyVia: switchTo ?? via } });
    if (res.ok) {
      setVia(res.data.via ?? via); setSentTo(res.data.sentTo ?? sentTo); setWait(res.data.resendIn ?? 30); setCode("");
      toast({ title: "New code sent", body: `Sent to ${res.data.sentTo ?? ""}`, kind: "success" });
    }
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
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label htmlFor="gender" className="label-xs mb-1.5 block">Gender</label>
                    <select id="gender" required value={gender} onChange={(e) => setGender(e.target.value)} className="input">
                      <option value="" disabled>Select</option>
                      <option value="male">Male</option>
                      <option value="female">Female</option>
                      <option value="other">Other</option>
                      <option value="prefer_not_to_say">Prefer not to say</option>
                    </select>
                  </div>
                  <div>
                    <label htmlFor="dob" className="label-xs mb-1.5 block">Date of birth</label>
                    <input id="dob" type="date" required value={dob} max={new Date().toISOString().slice(0, 10)} onChange={(e) => setDob(e.target.value)} className="input" autoComplete="bday" />
                  </div>
                </div>
                <div>
                  <label htmlFor="phone" className="label-xs mb-1.5 block">Phone number</label>
                  <input id="phone" type="tel" required value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="98765 43210 or +91 98765 43210" className="input" autoComplete="tel" inputMode="tel" />
                </div>
                <div>
                  <span className="label-xs mb-1.5 block">Verify my account using</span>
                  <div className="grid gap-3 sm:grid-cols-2" role="radiogroup" aria-label="Verification method">
                    {([["email", "Email OTP", MailCheck], ["phone", "Phone OTP (SMS)", Smartphone]] as const).map(([v, label, Icon]) => (
                      <button key={v} type="button" role="radio" aria-checked={via === v} onClick={() => setVia(v)}
                        className={cx("flex items-center gap-2.5 rounded-xl border px-4 py-3 text-left text-sm transition-colors", via === v ? "border-[#7c5cff] bg-[#7c5cff]/15 text-white" : "border-white/12 text-[#9aa4b2] hover:border-white/25")}>
                        <Icon size={16} /> {label}
                      </button>
                    ))}
                  </div>
                  <p className="mt-1.5 text-[11px] text-[#5b6577]">We&apos;ll send a 6-digit code to your {via === "phone" ? "phone number" : "email"}. Tickets are always sent to your email.</p>
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
                  {busy ? <Loader2 size={16} className="animate-spin" /> : <>Send {via === "phone" ? "SMS" : "email"} code <ArrowRight size={16} /></>}
                </button>
              </form>
              <p className="mt-5 text-center text-[11px] leading-relaxed text-[#5b6577]">
                Want to host events? Organizer accounts are set up by an admin after you sign up.
              </p>
            </>
          ) : (
            <>
              <span className="mb-4 grid h-12 w-12 place-items-center rounded-2xl bg-[#7c5cff]/15 text-[#a78bff]">{via === "phone" ? <Smartphone size={22} /> : <MailCheck size={22} />}</span>
              <h1 className="font-display text-3xl font-bold text-white">{via === "phone" ? "Verify your phone" : "Verify your email"}</h1>
              <p className="mt-2 text-sm text-[#9aa4b2]">We sent a 6-digit code to <b className="text-white">{sentTo || email}</b>. It expires in 10 minutes.</p>
              <form onSubmit={verify} className="mt-7 space-y-5">
                <OtpInput value={code} onChange={setCode} disabled={busy} />
                {error && <p role="alert" className="rounded-xl border border-[#ff6b8b]/30 bg-[#ff6b8b]/8 px-4 py-3 text-sm text-[#ff8fa8]">{error}</p>}
                <button type="submit" disabled={busy || code.length !== 6} className="btn btn-primary w-full !py-3.5">
                  {busy ? <Loader2 size={16} className="animate-spin" /> : <>Verify &amp; create account <ArrowRight size={16} /></>}
                </button>
              </form>
              <div className="mt-5 flex items-center justify-between text-sm">
                <button type="button" onClick={() => { setStep("details"); setError(""); setCode(""); }} className="flex items-center gap-1.5 text-[#9aa4b2] hover:text-white"><ArrowLeft size={14} /> Change details</button>
                <button type="button" onClick={() => resend()} disabled={wait > 0} className="font-semibold text-[#a78bff] hover:text-white disabled:cursor-not-allowed disabled:text-[#5b6577]">
                  {wait > 0 ? `Resend code in ${wait}s` : "Resend code"}
                </button>
              </div>
              <p className="mt-5 text-center text-[11px] text-[#5b6577]">
                {via === "phone" ? "Didn't get the text? " : "Can't find it? Check your spam folder, or "}
                <button type="button" onClick={() => resend(via === "phone" ? "email" : "phone")} disabled={wait > 0} className="font-semibold text-[#a78bff] hover:text-white disabled:cursor-not-allowed disabled:text-[#5b6577]">
                  send the code by {via === "phone" ? "email" : "SMS"} instead
                </button>
              </p>
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