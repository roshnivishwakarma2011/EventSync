"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { BadgeCheck, CalendarDays, ShieldCheck, XOctagon } from "lucide-react";
import { api, formatLongDate } from "@/lib/client";
import { Logo, Footer } from "@/components/chrome";
import { Reveal, Spinner } from "@/components/ui";

/** PUBLIC certificate verification — no login required. */
export default function VerifyPage() {
  const { id } = useParams<{ id: string }>();
  const [data, setData] = useState<any>(null);
  const [busy, setBusy] = useState(true);

  useEffect(() => {
    api(`/api/certificates/verify/${id}`).then((r) => {
      setData(r.ok ? r.data : { valid: false, message: r.error?.message ?? "Verification failed" });
      setBusy(false);
    });
  }, [id]);

  return (
    <div className="relative flex min-h-screen flex-col">
      <div className="hero-bg"><div className="orb orb-1 !opacity-30" /><div className="orb orb-2 !opacity-25" /><div className="grid-bg" /></div>
      <div className="absolute left-6 top-6 z-20"><Logo /></div>
      <main className="relative z-10 flex flex-1 items-center justify-center px-6 py-24">
        {busy ? (
          <Spinner label="Verifying certificate…" />
        ) : (
          <Reveal className="w-full max-w-lg">
            <div className={`card overflow-hidden !rounded-3xl ${data.valid ? "!border-[#22d3a7]/40 shadow-[0_0_80px_-20px_rgba(34,211,167,0.4)]" : "!border-[#ff6b8b]/40"}`}>
              <div className={`p-8 text-center ${data.valid ? "bg-gradient-to-b from-[#22d3a7]/15 to-transparent" : "bg-gradient-to-b from-[#ff6b8b]/15 to-transparent"}`}>
                <span className={`mx-auto grid h-16 w-16 place-items-center rounded-2xl ${data.valid ? "bg-[#22d3a7]/15 text-[#2fe3b5]" : "bg-[#ff6b8b]/15 text-[#ff8fa8]"}`}>
                  {data.valid ? <BadgeCheck size={30} /> : <XOctagon size={30} />}
                </span>
                <h1 className="font-display mt-4 text-2xl font-bold text-white">{data.valid ? "Certificate verified" : "Invalid certificate"}</h1>
                <p className="mt-1.5 text-sm text-[#9aa4b2]">{data.message}</p>
              </div>
              {data.valid && (
                <div className="space-y-4 border-t border-white/6 p-8">
                  <div>
                    <p className="label-xs">Participant</p>
                    <p className="font-display mt-1 text-xl font-bold text-white">{data.participant}</p>
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <p className="label-xs">Event</p>
                      <p className="mt-1 text-sm font-semibold text-[#c8cfdd]">{data.event}</p>
                    </div>
                    <div>
                      <p className="label-xs">Organizer</p>
                      <p className="mt-1 text-sm font-semibold text-[#c8cfdd]">{data.organizer}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 text-[13px] text-[#9aa4b2]">
                    <CalendarDays size={13} className="text-[#7c5cff]" /> {data.eventDate ? formatLongDate(data.eventDate) : ""}
                  </div>
                  <div className="flex items-center justify-between rounded-xl border border-white/8 bg-black/25 px-4 py-3">
                    <span className="font-mono text-[11px] text-[#5b6577]">{data.certificateId}</span>
                    <span className="flex items-center gap-1.5 text-[11px] font-bold text-[#2fe3b5]"><ShieldCheck size={12} /> Issued {new Date(data.issuedAt).toLocaleDateString()}</span>
                  </div>
                </div>
              )}
            </div>
            <p className="mt-6 text-center text-xs text-[#5b6577]">
              Verified live against the EventSync attendance ledger · <Link href="/" className="text-[#a78bff] hover:text-white">Explore EventSync</Link>
            </p>
          </Reveal>
        )}
      </main>
      <Footer />
    </div>
  );
}
