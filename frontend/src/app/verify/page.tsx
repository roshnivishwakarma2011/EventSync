"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ShieldCheck, ArrowRight } from "lucide-react";
import { Logo, Footer } from "@/components/chrome";
import { Reveal } from "@/components/ui";

export default function VerifyIndex() {
  const router = useRouter();
  const [id, setId] = useState("");
  return (
    <div className="relative flex min-h-screen flex-col">
      <div className="hero-bg"><div className="orb orb-1 !opacity-30" /><div className="grid-bg" /></div>
      <div className="absolute left-6 top-6 z-20"><Logo /></div>
      <main className="relative z-10 flex flex-1 items-center justify-center px-6">
        <Reveal className="w-full max-w-md">
          <div className="card p-8 text-center">
            <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-[#22d3a7]/15 text-[#2fe3b5]"><ShieldCheck size={24} /></span>
            <h1 className="font-display mt-4 text-2xl font-bold text-white">Verify a certificate</h1>
            <p className="mt-1.5 text-sm text-[#9aa4b2]">Enter the certificate ID printed on the document (e.g. ES-2026-XXXXXX).</p>
            <form
              onSubmit={(e) => { e.preventDefault(); if (id.trim()) router.push(`/verify/${encodeURIComponent(id.trim())}`); }}
              className="mt-6 flex gap-2"
            >
              <input value={id} onChange={(e) => setId(e.target.value)} placeholder="ES-2026-…" className="input font-mono text-sm" aria-label="Certificate ID" />
              <button type="submit" className="btn btn-primary shrink-0"><ArrowRight size={15} /></button>
            </form>
          </div>
        </Reveal>
      </main>
      <Footer />
    </div>
  );
}
