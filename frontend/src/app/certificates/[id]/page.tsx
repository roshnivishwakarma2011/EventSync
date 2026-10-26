"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { ArrowLeft, Download } from "lucide-react";
import { api, formatLongDate } from "@/lib/client";
import { Spinner } from "@/components/ui";

/* Printable certificate. "Download PDF" opens the browser's print dialog: choose "Save as PDF" as the printer. */
export default function CertificatePage() {
  const { id } = useParams<{ id: string }>();
  const [data, setData] = useState<any>(null);
  const [busy, setBusy] = useState(true);

  useEffect(() => {
    api(`/api/certificates/verify/${id}`).then((r) => { setData(r.ok ? r.data : { valid: false }); setBusy(false); });
  }, [id]);

  if (busy) return <div className="min-h-screen"><Spinner label="Preparing certificate…" /></div>;
  if (!data?.valid) {
    return (
      <div className="grid min-h-screen place-items-center px-6 text-center">
        <div><p className="text-white">Certificate not found.</p><Link href="/dashboard?tab=certificates" className="mt-3 inline-block text-[#a78bff]">Back to dashboard</Link></div>
      </div>
    );
  }

  return (
    <div className="cert-page min-h-screen px-4 py-8">
      <style>{`
        @page { size: A4 landscape; margin: 0; }
        .cert-sheet { background: #fff; color: #161327; width: 100%; max-width: 1050px; aspect-ratio: 297 / 210; margin: 0 auto; position: relative; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; padding: 6%; box-shadow: 0 20px 60px rgba(0,0,0,.45); border-radius: 6px; }
        .cert-sheet::before { content: ""; position: absolute; inset: 14px; border: 2px solid #7c5cff; border-radius: 4px; pointer-events: none; }
        .cert-sheet::after { content: ""; position: absolute; inset: 22px; border: 1px solid #c9baff; border-radius: 2px; pointer-events: none; }
        .cert-bar { position: absolute; top: 0; left: 0; right: 0; height: 10px; background: linear-gradient(90deg, #7c5cff, #00b8e6, #ff5ca8); border-radius: 6px 6px 0 0; }
        @media print {
          html, body { background: #fff !important; }
          .cert-page { padding: 0 !important; min-height: 0 !important; }
          .cert-sheet { box-shadow: none; border-radius: 0; max-width: none; width: 297mm; height: 210mm; aspect-ratio: auto; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          .no-print { display: none !important; }
        }
      `}</style>
      <div className="no-print mx-auto mb-5 flex max-w-[1050px] flex-wrap items-center justify-between gap-3">
        <Link href="/dashboard?tab=certificates" className="flex items-center gap-1.5 text-sm text-[#9aa4b2] hover:text-white"><ArrowLeft size={14} /> Back</Link>
        <button onClick={() => window.print()} className="btn btn-primary text-sm"><Download size={14} /> Download PDF</button>
      </div>
      <div className="cert-sheet">
        <div className="cert-bar" />
        <p style={{ fontWeight: 800, letterSpacing: 3, fontSize: "clamp(12px,1.6vw,18px)" }}>EVENTSYNC</p>
        <p style={{ marginTop: "3%", letterSpacing: 6, textTransform: "uppercase", color: "#6d4cf0", fontWeight: 700, fontSize: "clamp(10px,1.3vw,15px)" }}>Certificate of Participation</p>
        <p style={{ marginTop: "4%", color: "#5b6577", fontSize: "clamp(11px,1.4vw,16px)" }}>This certifies that</p>
        <p style={{ marginTop: "1.5%", fontWeight: 800, fontSize: "clamp(24px,4.6vw,54px)", lineHeight: 1.1 }}>{data.participant}</p>
        <p style={{ marginTop: "2.5%", color: "#5b6577", fontSize: "clamp(11px,1.4vw,16px)" }}>successfully attended</p>
        <p style={{ marginTop: "1.5%", fontWeight: 700, color: "#4b2fd1", fontSize: "clamp(16px,2.6vw,32px)", lineHeight: 1.2 }}>{data.event}</p>
        <p style={{ marginTop: "2.5%", color: "#5b6577", fontSize: "clamp(10px,1.3vw,15px)" }}>{formatLongDate(data.eventDate)} · organized by {data.organizer}</p>
        <div style={{ position: "absolute", bottom: "7%", left: "8%", right: "8%", display: "flex", justifyContent: "space-between", alignItems: "flex-end", fontSize: "clamp(8px,1vw,12px)", color: "#5b6577", textAlign: "left" }}>
          <span style={{ fontFamily: "monospace" }}>Certificate ID<br /><b style={{ color: "#161327", fontSize: "1.15em" }}>{id}</b></span>
          <span style={{ textAlign: "right" }}>Verify at<br /><b style={{ color: "#161327" }}>{typeof window !== "undefined" ? window.location.origin : ""}/verify/{id}</b></span>
        </div>
      </div>
    </div>
  );
}
