"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowUpRight, CalendarDays, Check, Clock, Heart, MapPin, Sparkles, Users } from "lucide-react";
import { api, cx, formatDate, formatTime, type EventItem } from "@/lib/client";
import { useAuth, useToast } from "./providers";
import { StatusPill } from "./ui";

const FALLBACK_GRADIENTS = [
  "from-[#7c5cff]/50 via-[#241d4d] to-[#0d1220]",
  "from-[#00d4ff]/40 via-[#143350] to-[#0d1220]",
  "from-[#ff5ca8]/40 via-[#3d1a3d] to-[#0d1220]",
];

export function EventCard({
  event,
  onChange,
  rank,
}: {
  event: EventItem;
  onChange?: (e: EventItem) => void;
  rank?: number;
}) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [fav, setFav] = useState(!!event.viewer?.favorited);
  const [busy, setBusy] = useState(false);
  const [tilt, setTilt] = useState({ rx: 0, ry: 0 });
  const d = formatDate(event.eventDate);
  const fill = event.capacity ? Math.round((event.registeredCount / event.capacity) * 100) : 0;
  const grad = FALLBACK_GRADIENTS[event.title.length % FALLBACK_GRADIENTS.length];

  const toggleFav = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!user) {
      toast({ title: "Sign in to save events", kind: "info" });
      return;
    }
    if (busy) return;
    setBusy(true);
    const next = !fav;
    setFav(next);
    const res = await api(`/api/events/${event.id}/favorite`, { method: next ? "POST" : "DELETE" });
    if (!res.ok) {
      setFav(!next);
      toast({ title: "Couldn't update favorites", kind: "error" });
    }
    setBusy(false);
  };

  return (
    <Link
      href={`/events/${event.id}`}
      className="ev-card card card-hover group relative flex flex-col overflow-hidden outline-none"
      style={{ transform: `perspective(900px) rotateX(${tilt.rx}deg) rotateY(${tilt.ry}deg)` }}
      onPointerMove={(e) => {
        const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
        const px = (e.clientX - r.left) / r.width - 0.5;
        const py = (e.clientY - r.top) / r.height - 0.5;
        setTilt({ rx: -py * 4, ry: px * 5 });
      }}
      onPointerLeave={() => setTilt({ rx: 0, ry: 0 })}
    >
      {rank !== undefined && (
        <span className="absolute left-4 top-4 z-20 font-display text-5xl font-bold text-white/10">{String(rank).padStart(2, "0")}</span>
      )}
      <div className="relative h-44 overflow-hidden">
        {event.bannerUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={event.bannerUrl} alt={event.title} loading="lazy" className="ev-img h-full w-full object-cover" />
        ) : (
          <div className={cx("ev-img h-full w-full bg-gradient-to-br", grad)} />
        )}
        <div className="ev-shade absolute inset-0 bg-gradient-to-t from-[#0d1220] via-[#0d1220]/30 to-transparent" style={{ opacity: 0.65 }} />
        <div className="absolute inset-x-3 top-3 flex items-start justify-between">
          <StatusPill status={event.status} />
          <button
            onClick={toggleFav}
            aria-label={fav ? "Remove from favorites" : "Save to favorites"}
            className={cx(
              "grid h-9 w-9 place-items-center rounded-full border backdrop-blur transition-all hover:scale-110",
              fav ? "border-[#ff5ca8]/60 bg-[#ff5ca8]/25 text-[#ff5ca8]" : "border-white/15 bg-black/40 text-white/80 hover:text-white"
            )}
          >
            <Heart size={15} fill={fav ? "currentColor" : "none"} />
          </button>
        </div>
        <div className="absolute bottom-3 left-3 flex items-center gap-2">
          <span className="rounded-lg bg-black/55 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.14em] backdrop-blur" style={{ color: event.category?.color ?? "#a78bff" }}>
            {event.category?.name ?? "Event"}
          </span>
          {event.price === 0 && <span className="rounded-lg bg-[#22d3a7]/20 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.14em] text-[#2fe3b5] backdrop-blur">Free</span>}
          {event.mode === "online" && <span className="rounded-lg bg-white/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.14em] text-white/85 backdrop-blur">Online</span>}
        </div>
        <div className="ev-cta absolute bottom-3 right-3">
          <span className="grid h-10 w-10 place-items-center rounded-full bg-white text-black shadow-xl">
            <ArrowUpRight size={17} />
          </span>
        </div>
      </div>

      <div className="flex flex-1 flex-col gap-3 p-5">
        {event.recommendReason && (
          <p className="flex items-center gap-1.5 text-[11px] font-semibold text-[#a78bff]">
            <Sparkles size={11} /> {event.recommendReason}
          </p>
        )}
        <h3 className="font-display text-[1.12rem] font-bold leading-snug text-white transition-colors group-hover:text-[#c9baff]">
          {event.title}
        </h3>
        <div className="space-y-1.5 text-[13px] text-[#9aa4b2]">
          <p className="flex items-center gap-2">
            <CalendarDays size={14} className="text-[#7c5cff]" /> {d.weekday}, {d.month} {d.day}, {d.year}
            <span className="text-[#3d465c]">·</span>
            <Clock size={14} className="text-[#00d4ff]" /> {formatTime(event.startTime)}
          </p>
          <p className="flex items-center gap-2">
            <MapPin size={14} className="text-[#ff5ca8]" /> {event.location ? `${event.location.venue}, ${event.location.city}` : "Online"}
          </p>
        </div>

        <div className="mt-auto space-y-2 pt-1">
          <div className="flex items-center justify-between text-xs">
            <span className="flex items-center gap-1.5 text-[#9aa4b2]">
              <Users size={13} className="text-[#00d4ff]" />
              <b className="text-white">{event.registeredCount.toLocaleString()}</b> attending
            </span>
            <span className={cx("font-semibold", fill >= 90 ? "text-[#ffc35c]" : "text-[#5b6577]")}>
              {event.seatsLeft === 0 ? "Sold out" : `${event.seatsLeft} left`}
            </span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-white/[0.07]">
            <div
              className="h-full rounded-full bg-gradient-to-r from-[#7c5cff] to-[#00d4ff] transition-all duration-700"
              style={{ width: `${Math.min(100, fill)}%` }}
            />
          </div>
          <div className="flex items-center justify-between pt-1 text-xs text-[#5b6577]">
            <span>by {event.organizerName}</span>
            {event.avgRating ? <span className="font-semibold text-[#ffc35c]">★ {event.avgRating}</span> : null}
            {event.viewer?.registered && (
              <span className="flex items-center gap-1 font-semibold text-[#2fe3b5]"><Check size={12} /> Going</span>
            )}
          </div>
        </div>
      </div>
    </Link>
  );
}
