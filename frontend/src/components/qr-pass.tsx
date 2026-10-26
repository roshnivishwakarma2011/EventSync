"use client";

import QRCode from "react-qr-code";
import { CalendarDays, Download, MapPin, Share2, ShieldCheck, X } from "lucide-react";
import { formatLongDate, formatTime, type EventItem } from "@/lib/client";
import { useToast } from "./providers";

/** The EventSync QR event pass — rendered inside modals & dashboard. */
export function QrPass({
  event,
  holderName,
  qrToken,
  status,
  compact = false,
}: {
  event: Pick<EventItem, "title" | "eventDate" | "startTime" | "location" | "id">;
  holderName: string;
  qrToken: string;
  status: string;
  compact?: boolean;
}) {
  const { toast } = useToast();
  const payload = JSON.stringify({ es: "pass", t: qrToken, e: event.id });

  const share = async () => {
    const text = `My EventSync pass for ${event.title} — ${formatLongDate(event.eventDate)}`;
    try {
      if (navigator.share) await navigator.share({ title: "EventSync Pass", text });
      else {
        await navigator.clipboard.writeText(text);
        toast({ title: "Pass details copied", kind: "success" });
      }
    } catch { /* dismissed */ }
  };

  return (
    <div className="ticket ticket-shine shine relative mx-auto w-full max-w-sm p-6">
      <div className="flex items-center justify-between">
        <span className="font-display text-sm font-bold tracking-tight text-white">
          EVENT<span className="gradient-text">SYNC</span>
        </span>
        <span className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider ${status === "ATTENDED" ? "bg-[#22d3a7]/15 text-[#2fe3b5]" : "bg-[#7c5cff]/15 text-[#a78bff]"}`}>
          <ShieldCheck size={11} /> {status === "ATTENDED" ? "Attended" : "Valid Pass"}
        </span>
      </div>

      <h3 className="font-display mt-4 text-xl font-bold leading-tight text-white">{event.title}</h3>
      <div className="mt-2 space-y-1 text-xs text-[#9aa4b2]">
        <p className="flex items-center gap-1.5"><CalendarDays size={12} className="text-[#7c5cff]" /> {formatLongDate(event.eventDate)} · {formatTime(event.startTime)}</p>
        <p className="flex items-center gap-1.5"><MapPin size={12} className="text-[#ff5ca8]" /> {event.location ? `${event.location.venue}, ${event.location.city}` : "Online"}</p>
      </div>

      <div className="mt-5 flex items-center gap-5">
        <div className="qr-frame mx-auto">
          <QRCode value={payload} size={compact ? 118 : 150} bgColor="#ffffff" fgColor="#151128" level="M" />
        </div>
      </div>

      <div className="ticket-perf" />
      <div className="mt-8 flex items-end justify-between">
        <div>
          <p className="text-[10px] uppercase tracking-[0.16em] text-[#5b6577]">Participant</p>
          <p className="text-sm font-bold text-white">{holderName}</p>
          <p className="mt-1 font-mono text-[10px] text-[#5b6577]">ID {qrToken.slice(0, 12).toUpperCase()}</p>
        </div>
        <div className="flex gap-2">
          <button onClick={share} aria-label="Share pass" className="grid h-9 w-9 place-items-center rounded-full border border-white/15 text-[#9aa4b2] transition-all hover:border-[#00d4ff] hover:text-[#00d4ff]">
            <Share2 size={14} />
          </button>
          <button
            onClick={() => toast({ title: "Screenshot your pass", body: "QR passes are verified live at the venue entrance.", kind: "info" })}
            aria-label="Download pass"
            className="grid h-9 w-9 place-items-center rounded-full border border-white/15 text-[#9aa4b2] transition-all hover:border-[#7c5cff] hover:text-[#a78bff]"
          >
            <Download size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}

export function PassModal({
  open,
  onClose,
  event,
  holderName,
  qrToken,
  status,
}: {
  open: boolean;
  onClose: () => void;
  event: Pick<EventItem, "title" | "eventDate" | "startTime" | "location" | "id"> | null;
  holderName: string;
  qrToken: string;
  status: string;
}) {
  if (!open || !event) return null;
  return (
    <div className="modal-veil fixed inset-0 z-[90] grid place-items-center bg-black/75 p-4 backdrop-blur-sm" onClick={onClose} role="dialog" aria-modal="true" aria-label="Event pass">
      <div className="modal-card relative" onClick={(e) => e.stopPropagation()}>
        <button onClick={onClose} aria-label="Close" className="absolute -right-2 -top-2 z-10 grid h-9 w-9 place-items-center rounded-full border border-white/15 bg-[#101728] text-white transition-all hover:rotate-90 hover:border-[#ff5ca8]">
          <X size={15} />
        </button>
        <QrPass event={event} holderName={holderName} qrToken={qrToken} status={status} />
        <p className="mt-4 text-center text-xs text-[#9aa4b2]">Present this QR at the entrance — the organizer scans it to check you in and +50 XP lands instantly.</p>
      </div>
    </div>
  );
}
