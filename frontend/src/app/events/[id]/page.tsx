"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowLeft, BadgeCheck, CalendarDays, CheckCircle2, Clock, Heart, ListChecks, Loader2, MapPin, Radio,
  Share2, ShieldCheck, Sparkles, Star, Ticket, Users, X, Hourglass,
} from "lucide-react";
import { api, cx, formatDate, formatLongDate, formatTime, type EventItem, type FeedbackItem, type ScheduleItem, type Speaker, type MemoryItem } from "@/lib/client";
import { useAuth, useToast } from "@/components/providers";
import { Avatar, Empty, Reveal, Spinner, Stars, StatusPill } from "@/components/ui";
import { EventCard } from "@/components/event-card";
import { PassModal } from "@/components/qr-pass";
import { Footer, Navbar } from "@/components/chrome";

interface Detail extends EventItem {
  schedule: ScheduleItem[];
  speakers: Speaker[];
  feedback: FeedbackItem[];
  myFeedback: any;
  memories: MemoryItem[];
  waitlistSize: number;
  related: EventItem[];
  canManage: boolean;
}

export default function EventDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { user, refresh } = useAuth();
  const { toast } = useToast();
  const [event, setEvent] = useState<Detail | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState<"register" | "waitlist" | "cancel" | null>(null);
  const [passOpen, setPassOpen] = useState(false);
  const [fav, setFav] = useState(false);
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState("");
  const [sendingFeedback, setSendingFeedback] = useState(false);
  const confettiRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setNotFound(false);
    setLoadError(null);
    // A malformed route parameter should never be sent to Flask as an event ID.
    if (!/^\d+$/.test(String(id)) || Number(id) < 1) {
      setNotFound(true);
      setLoadError("The event URL does not contain a valid numeric event ID.");
      setLoading(false);
      return;
    }
    try {
      const res = await api(`/api/events/${encodeURIComponent(String(id))}`);
      if (res.ok && res.data) {
        setEvent(res.data);
        setFav(!!res.data.viewer?.favorited);
      } else {
        setEvent(null);
        setNotFound(res.error?.code === "EVENT_NOT_FOUND" || res.error?.code === "HTTP_404");
        setLoadError(res.error?.message || "The EventSync API did not return event details.");
      }
    } catch (error) {
      setEvent(null);
      setLoadError(error instanceof Error ? error.message : "Unable to contact the EventSync API.");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const burst = () => {
    const el = confettiRef.current;
    if (!el) return;
    el.classList.remove("xp-pop");
    void el.offsetWidth;
    el.classList.add("xp-pop");
    setTimeout(() => el.classList.add("opacity-0"), 1800);
    setTimeout(() => el.classList.remove("opacity-0"), 2600);
  };

  const register = async () => {
    if (!user) { router.push(`/login?next=/events/${id}`); return; }
    setBusy("register");
    const res = await api(`/api/events/${id}/register`, { method: "POST" });
    setBusy(null);
    if (res.ok) {
      await load();
      await refresh();
      burst();
      toast({ title: `+${res.data?.xpEarned ?? 10} XP — You're in!`, body: `Your QR pass is ready below, and we emailed the ticket to ${user.email || "you"}.`, kind: "xp" });
      if (res.data?.achievementsUnlocked?.length) {
        toast({ title: `Achievement unlocked: ${res.data.achievementsUnlocked[0]}`, kind: "xp" });
      }
      setPassOpen(true);
    } else if (res.error?.code === "EVENT_FULL") {
      toast({ title: "Event is full", body: "Join the waitlist — we'll promote you automatically if a seat opens.", kind: "info" });
      await joinWaitlist();
    } else if (res.error?.code === "PAYMENT_CANCELLED") {
      toast({ title: "Payment cancelled", body: "You were not charged.", kind: "info" });
    } else {
      toast({ title: res.error?.message ?? "Couldn't register", kind: "error" });
    }
  };

  const joinWaitlist = async () => {
    if (!user) { router.push(`/login?next=/events/${id}`); return; }
    setBusy("waitlist");
    const res = await api(`/api/events/${id}/waitlist`, { method: "POST" });
    setBusy(null);
    if (res.ok) {
      await load();
      toast({ title: `You're #${res.data?.position} on the waitlist`, body: "Automatic promotion happens when someone cancels.", kind: "success" });
    } else {
      toast({ title: res.error?.message ?? "Couldn't join waitlist", kind: "error" });
    }
  };

  const cancel = async () => {
    setBusy("cancel");
    const res = await api(`/api/events/${id}/register`, { method: "DELETE" });
    setBusy(null);
    if (res.ok) {
      await load();
      await refresh();
      toast({ title: "Registration cancelled", body: res.data?.promotedNext ? "Your seat went to the next person on the waitlist." : undefined, kind: "info" });
    } else {
      toast({ title: res.error?.message ?? "Couldn't cancel", kind: "error" });
    }
  };

  const leaveWaitlist = async () => {
    setBusy("waitlist");
    const res = await api(`/api/events/${id}/waitlist`, { method: "DELETE" });
    setBusy(null);
    if (res.ok) { await load(); toast({ title: "Left the waitlist", kind: "info" }); }
  };

  const toggleFav = async () => {
    if (!user) { toast({ title: "Sign in to save events", kind: "info" }); return; }
    const next = !fav;
    setFav(next);
    const res = await api(`/api/events/${id}/favorite`, { method: next ? "POST" : "DELETE" });
    if (!res.ok) setFav(!next);
  };

  const submitFeedback = async () => {
    if (sendingFeedback) return;
    setSendingFeedback(true);
    const res = await api(`/api/events/${id}/feedback`, { method: "POST", body: { rating, comment } });
    setSendingFeedback(false);
    if (res.ok) {
      toast({ title: "+10 XP — Feedback saved", kind: "xp" });
      setComment("");
      await load();
      await refresh();
    } else {
      toast({ title: res.error?.message ?? "Couldn't submit feedback", kind: "error" });
    }
  };

  const share = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      toast({ title: "Link copied", kind: "success" });
    } catch { toast({ title: "Couldn't copy link", kind: "error" }); }
  };

  if (loading) return <div className="min-h-screen"><Navbar /><Spinner label="Loading event…" /></div>;
  if (notFound || !event) {
    const title = notFound ? "Event not found" : "Couldn't load this event";
    const body = notFound
      ? `Event ID ${id} was not found in the connected database, or it is not publicly available. ${loadError || "Check that the event exists and is published."}`
      : `The event details request failed. ${loadError || "Check that the Flask backend is running and the database connection is configured."}`;
    return (
      <div className="min-h-screen"><Navbar />
        <main className="mx-auto max-w-3xl px-6 pt-40"><Empty title={title} body={body}><Link href="/events" className="btn btn-primary mt-2 text-sm">Browse events</Link></Empty></main>
        <Footer />
      </div>
    );
  }

  const d = formatDate(event.eventDate);
  const fill = event.capacity ? Math.min(100, Math.round((event.registeredCount / event.capacity) * 100)) : 0;
  const registered = !!event.viewer?.registered;
  const waitlisted = !!event.viewer?.waitlisted;
  const attended = event.viewer?.registrationStatus === "ATTENDED";
  const canFeedback = !!user && (attended || (registered && event.status === "COMPLETED")) && !event.myFeedback;
  const nextItem = event.schedule.find((s) => event.status !== "LIVE" || true);

  return (
    <div className="min-h-screen">
      <Navbar />
      {/* confetti xp pop */}
      <div ref={confettiRef} className="pointer-events-none fixed left-1/2 top-24 z-[80] -translate-x-1/2 opacity-100 transition-opacity duration-700">
        <span className="rounded-2xl bg-gradient-to-r from-[#7c5cff] to-[#00d4ff] px-6 py-3 font-display text-2xl font-bold text-white shadow-2xl">+10 XP</span>
      </div>

      <main className="pb-24">
        {/* hero */}
        <div className="relative">
          <div className="absolute inset-0 overflow-hidden">
            {event.bannerUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={event.bannerUrl} alt="" className="h-full w-full scale-105 object-cover blur-[2px]" />
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-[#070a13] via-[#070a13]/82 to-[#070a13]/40" />
          </div>
          <div className="relative mx-auto max-w-7xl px-6 pb-10 pt-36 lg:px-8">
            <Reveal>
              <Link href="/events" className="mb-6 inline-flex items-center gap-2 text-sm font-semibold text-[#9aa4b2] transition-colors hover:text-white">
                <ArrowLeft size={15} /> All events
              </Link>
              <div className="flex flex-wrap items-center gap-2.5">
                <StatusPill status={event.status} />
                <span className="rounded-full border border-white/15 bg-black/40 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.14em] backdrop-blur" style={{ color: event.category?.color }}>
                  {event.category?.name}
                </span>
                {event.price === 0 ? (
                  <span className="rounded-full border border-[#22d3a7]/30 bg-[#22d3a7]/10 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.14em] text-[#2fe3b5]">Free entry</span>
                ) : (
                  <span className="rounded-full border border-white/15 bg-black/40 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.14em] text-white backdrop-blur">₹{event.price}</span>
                )}
                {event.avgRating && (
                  <span className="flex items-center gap-1.5 rounded-full border border-white/15 bg-black/40 px-3 py-1 text-[11px] font-bold text-[#ffc35c] backdrop-blur">
                    <Star size={11} fill="currentColor" /> {event.avgRating} ({event.ratingCount})
                  </span>
                )}
              </div>
              <h1 className="font-display mt-4 max-w-3xl text-balance text-4xl font-bold leading-[1.05] tracking-tight text-white md:text-[3.4rem]">
                {event.title}
              </h1>
              <div className="mt-5 flex flex-wrap gap-x-7 gap-y-2.5 text-sm text-[#c8cfdd]">
                <span className="flex items-center gap-2"><CalendarDays size={15} className="text-[#7c5cff]" /> {formatLongDate(event.eventDate)}</span>
                <span className="flex items-center gap-2"><Clock size={15} className="text-[#00d4ff]" /> {formatTime(event.startTime)} — {formatTime(event.endTime)}</span>
                <span className="flex items-center gap-2"><MapPin size={15} className="text-[#ff5ca8]" /> {event.location ? `${event.location.venue}, ${event.location.city}` : "Online"}</span>
              </div>
              <div className="mt-6 flex flex-wrap items-center gap-3">
                <Avatar name={event.organizerName} size={34} />
                <p className="text-sm text-[#9aa4b2]">Hosted by <b className="text-white">{event.organizerName}</b></p>
                {event.canManage && <Link href={`/organizer?edit=${event.id}`} className="chip !py-1.5 text-[11px]">Manage event</Link>}
              </div>
            </Reveal>
          </div>
        </div>

        <div className="mx-auto grid max-w-7xl gap-10 px-6 lg:grid-cols-[1.6fr_1fr] lg:px-8">
          {/* left column */}
          <div className="space-y-12">
            {event.status === "LIVE" && (
              <Reveal>
                <div className="card relative overflow-hidden !border-[#ff4d6d]/40 p-6">
                  <div className="absolute -right-14 -top-14 h-44 w-44 rounded-full bg-[#ff4d6d]/25 blur-[60px]" />
                  <p className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.2em] text-[#ff7d95]"><span className="live-dot" /> Live now</p>
                  <p className="font-display mt-2 text-2xl font-bold text-white">{event.registeredCount} people checked in</p>
                  {nextItem && <p className="mt-1 text-sm text-[#9aa4b2]">Next on stage: <b className="text-white">{nextItem.title}</b> · {formatTime(nextItem.startTime)}</p>}
                </div>
              </Reveal>
            )}

            <Reveal>
              <section aria-label="About this event">
                <h2 className="font-display mb-4 text-xl font-bold text-white">About this event</h2>
                <p className="whitespace-pre-line text-[15px] leading-[1.8] text-[#b8c0d0]">{event.description}</p>
                {event.requirements && (
                  <div className="mt-5 flex gap-3 rounded-2xl border border-[#f5a623]/25 bg-[#f5a623]/8 p-4">
                    <ListChecks size={17} className="mt-0.5 shrink-0 text-[#ffc35c]" />
                    <div>
                      <p className="text-sm font-bold text-[#ffc35c]">Requirements</p>
                      <p className="mt-1 text-sm leading-relaxed text-[#c8cfdd]">{event.requirements}</p>
                    </div>
                  </div>
                )}
              </section>
            </Reveal>

            {/* schedule timeline */}
            {event.schedule.length > 0 && (
              <Reveal>
                <section aria-label="Schedule">
                  <h2 className="font-display mb-6 text-xl font-bold text-white">Schedule</h2>
                  <div className="tl space-y-6">
                    {event.schedule.map((s, i) => (
                      <Reveal key={s.id} delay={i * 60}>
                        <div className="tl-item">
                          <p className="font-mono text-[13px] font-bold text-[#a78bff]">{formatTime(s.startTime)}{s.endTime ? ` — ${formatTime(s.endTime)}` : ""}</p>
                          <p className="mt-0.5 font-display text-[15px] font-bold text-white">{s.title}</p>
                          {s.description && <p className="mt-0.5 text-[13px] text-[#9aa4b2]">{s.description}</p>}
                        </div>
                      </Reveal>
                    ))}
                  </div>
                </section>
              </Reveal>
            )}

            {/* speakers */}
            {event.speakers.length > 0 && (
              <Reveal>
                <section aria-label="Speakers">
                  <h2 className="font-display mb-6 text-xl font-bold text-white">Speakers & hosts</h2>
                  <div className="grid gap-4 sm:grid-cols-2">
                    {event.speakers.map((s, i) => (
                      <Reveal key={s.id} delay={i * 70}>
                        <div className="card card-hover flex gap-4 p-5">
                          <Avatar name={s.name} size={52} />
                          <div className="min-w-0">
                            <p className="font-display text-[15px] font-bold text-white">{s.name}</p>
                            <p className="text-xs font-semibold text-[#00d4ff]">{s.designation}</p>
                            {s.bio && <p className="mt-1.5 line-clamp-2 text-[12px] leading-relaxed text-[#9aa4b2]">{s.bio}</p>}
                          </div>
                        </div>
                      </Reveal>
                    ))}
                  </div>
                </section>
              </Reveal>
            )}

            {/* memories */}
            {event.memories.length > 0 && (
              <Reveal>
                <section aria-label="Memories">
                  <h2 className="font-display mb-6 text-xl font-bold text-white">Memories from last time</h2>
                  <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                    {event.memories.map((m) => (
                      <figure key={m.id} className="card group overflow-hidden !rounded-2xl">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={m.mediaUrl} alt={m.caption} loading="lazy" className="h-32 w-full object-cover transition-transform duration-700 group-hover:scale-108 sm:h-28" />
                        {m.caption && <figcaption className="p-2.5 text-[11px] text-[#9aa4b2]">{m.caption}</figcaption>}
                      </figure>
                    ))}
                  </div>
                </section>
              </Reveal>
            )}

            {/* feedback */}
            <Reveal>
              <section aria-label="Reviews">
                <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
                  <h2 className="font-display text-xl font-bold text-white">
                    Reviews {event.ratingCount > 0 && <span className="ml-1 text-sm font-semibold text-[#9aa4b2]">★ {event.avgRating} · {event.ratingCount}</span>}
                  </h2>
                </div>
                {canFeedback && (
                  <div className="card mb-6 p-5">
                    <p className="mb-3 flex items-center gap-2 text-sm font-bold text-white"><Sparkles size={14} className="text-[#a78bff]" /> How was it? <span className="text-[11px] font-semibold text-[#2fe3b5]">+10 XP</span></p>
                    <div className="mb-3 flex gap-1.5" role="radiogroup" aria-label="Rating">
                      {[1, 2, 3, 4, 5].map((r) => (
                        <button key={r} onClick={() => setRating(r)} aria-label={`${r} star${r > 1 ? "s" : ""}`} aria-pressed={rating === r} className="transition-transform hover:scale-125">
                          <Star size={24} fill={r <= rating ? "#ffc35c" : "none"} stroke={r <= rating ? "#ffc35c" : "#4a5468"} />
                        </button>
                      ))}
                    </div>
                    <textarea value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Share one thing that stood out…" rows={2} className="input resize-none text-sm" />
                    <button onClick={submitFeedback} disabled={sendingFeedback} className="btn btn-primary mt-3 !py-2.5 text-sm">
                      {sendingFeedback ? <Loader2 size={15} className="animate-spin" /> : null} Submit review
                    </button>
                  </div>
                )}
                <div className="space-y-4">
                  {event.feedback.length === 0 && <p className="rounded-2xl border border-white/6 bg-white/[0.02] p-6 text-center text-sm text-[#9aa4b2]">No reviews yet — attend and be the first.</p>}
                  {event.myFeedback && (
                    <div className="card !border-[#7c5cff]/35 p-5">
                      <div className="flex items-center gap-3"><Avatar name={user?.name ?? "Me"} size={34} /><div><p className="text-sm font-bold text-white">You</p><Stars rating={event.myFeedback.rating} /></div></div>
                      {event.myFeedback.comment && <p className="mt-2.5 text-sm leading-relaxed text-[#b8c0d0]">{event.myFeedback.comment}</p>}
                    </div>
                  )}
                  {event.feedback.filter((f) => f.id !== event.myFeedback?.id).map((f) => (
                    <div key={f.id} className="card p-5">
                      <div className="flex items-center gap-3"><Avatar name={f.userName} size={34} /><div><p className="text-sm font-bold text-white">{f.userName}</p><Stars rating={f.rating} size={12} /></div></div>
                      {f.comment && <p className="mt-2.5 text-sm leading-relaxed text-[#b8c0d0]">{f.comment}</p>}
                    </div>
                  ))}
                </div>
              </section>
            </Reveal>
          </div>

          {/* right column — action card */}
          <div>
            <Reveal delay={100} className="lg:sticky lg:top-24">
              <div className="card overflow-hidden">
                <div className="border-b border-white/8 bg-gradient-to-r from-[#7c5cff]/14 to-[#00d4ff]/8 p-5">
                  <div className="flex items-center justify-between">
                    <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-[#9aa4b2]">Registration</p>
                    <div className="flex gap-2">
                      <button onClick={toggleFav} aria-label="Favorite" className={cx("grid h-9 w-9 place-items-center rounded-full border transition-all hover:scale-110", fav ? "border-[#ff5ca8]/60 bg-[#ff5ca8]/20 text-[#ff5ca8]" : "border-white/15 text-[#9aa4b2] hover:text-white")}>
                        <Heart size={15} fill={fav ? "currentColor" : "none"} />
                      </button>
                      <button onClick={share} aria-label="Share event" className="grid h-9 w-9 place-items-center rounded-full border border-white/15 text-[#9aa4b2] transition-all hover:scale-110 hover:text-white">
                        <Share2 size={15} />
                      </button>
                    </div>
                  </div>
                  <p className="font-display mt-2 text-3xl font-bold text-white">{event.price === 0 ? "Free" : `₹${event.price.toLocaleString()}`}</p>
                </div>
                <div className="space-y-5 p-5">
                  <div>
                    <div className="mb-2 flex items-center justify-between text-xs">
                      <span className="flex items-center gap-1.5 text-[#9aa4b2]"><Users size={13} className="text-[#00d4ff]" /><b className="text-white">{event.registeredCount}</b> / {event.capacity} seats</span>
                      <span className={cx("font-bold", fill >= 90 ? "text-[#ffc35c]" : "text-[#5b6577]")}>{fill}% full</span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-white/[0.07]">
                      <div className="h-full rounded-full bg-gradient-to-r from-[#7c5cff] to-[#00d4ff] transition-all duration-1000" style={{ width: `${fill}%` }} />
                    </div>
                    {event.waitlistSize > 0 && <p className="mt-2 flex items-center gap-1.5 text-[11px] text-[#ffc35c]"><Hourglass size={11} /> {event.waitlistSize} people on the waitlist</p>}
                  </div>

                  {event.status === "CANCELLED" ? (
                    <p className="rounded-xl border border-[#ff6b8b]/25 bg-[#ff6b8b]/8 p-4 text-center text-sm text-[#ff8fa8]">This event has been cancelled.</p>
                  ) : event.status === "COMPLETED" ? (
                    <div className="space-y-3">
                      <p className="rounded-xl border border-white/8 bg-white/[0.03] p-4 text-center text-sm text-[#9aa4b2]">
                        {attended ? "You attended this event — thanks for being part of it." : "This event has ended."}
                      </p>
                      {attended && (
                        <Link href="/dashboard?tab=certificates" className="btn btn-cyan w-full text-sm"><BadgeCheck size={15} /> View my certificate</Link>
                      )}
                    </div>
                  ) : registered ? (
                    <div className="space-y-3">
                      <div className="flex items-center gap-2.5 rounded-xl border border-[#22d3a7]/30 bg-[#22d3a7]/8 p-3.5">
                        <CheckCircle2 size={17} className="shrink-0 text-[#2fe3b5]" />
                        <p className="text-sm font-semibold text-[#2fe3b5]">{attended ? "Checked in — see you again soon" : "You're registered"}</p>
                      </div>
                      <button onClick={() => setPassOpen(true)} className="btn btn-primary w-full"><Ticket size={16} /> Show my QR pass</button>
                      {!attended && (
                        <button onClick={cancel} disabled={busy === "cancel"} className="w-full text-center text-xs font-semibold text-[#9aa4b2] transition-colors hover:text-[#ff8fa8]">
                          {busy === "cancel" ? "Cancelling…" : "Can't make it? Cancel registration"}
                        </button>
                      )}
                    </div>
                  ) : waitlisted ? (
                    <div className="space-y-3">
                      <div className="flex items-center gap-2.5 rounded-xl border border-[#f5a623]/30 bg-[#f5a623]/8 p-3.5">
                        <Hourglass size={16} className="shrink-0 text-[#ffc35c]" />
                        <p className="text-sm font-semibold text-[#ffc35c]">You're #{event.viewer?.waitlistPosition} on the waitlist</p>
                      </div>
                      <button onClick={leaveWaitlist} disabled={busy === "waitlist"} className="btn btn-ghost w-full text-sm">Leave waitlist</button>
                    </div>
                  ) : event.seatsLeft === 0 ? (
                    <div className="space-y-3">
                      <p className="rounded-xl border border-[#f5a623]/25 bg-[#f5a623]/8 p-4 text-center text-sm font-bold text-[#ffc35c]">Event full — {event.capacity}/{event.capacity} seats occupied</p>
                      <button onClick={joinWaitlist} disabled={busy === "waitlist"} className="btn btn-primary w-full">
                        {busy === "waitlist" ? <Loader2 size={15} className="animate-spin" /> : <Hourglass size={15} />} Join waitlist
                      </button>
                    </div>
                  ) : (
                    <button onClick={register} disabled={busy === "register"} className="btn btn-primary w-full !py-4 text-base">
                      {busy === "register" ? <Loader2 size={16} className="animate-spin" /> : <Ticket size={16} />}
                      {busy === "register" ? (event.price > 0 ? "Opening payment…" : "Reserving…") : event.price > 0 ? `Pay ₹${event.price.toLocaleString("en-IN")} & register` : "Register now"}
                    </button>
                  )}

                  <div className="space-y-2.5 border-t border-white/6 pt-4 text-[13px] text-[#9aa4b2]">
                    <p className="flex items-center gap-2.5"><ShieldCheck size={14} className="shrink-0 text-[#7c5cff]" /> Instant QR pass on registration</p>
                    <p className="flex items-center gap-2.5"><Sparkles size={14} className="shrink-0 text-[#00d4ff]" /> +10 XP now, +50 XP at check-in</p>
                    <p className="flex items-center gap-2.5"><BadgeCheck size={14} className="shrink-0 text-[#ff5ca8]" /> Verifiable certificate after attending</p>
                  </div>
                </div>
              </div>

              {event.location && (
                <div className="card mt-5 p-5">
                  <p className="label-xs mb-3">Venue</p>
                  <p className="text-sm font-bold text-white">{event.location.venue}</p>
                  <p className="mt-1 text-[13px] text-[#9aa4b2]">{event.location.address}{event.location.address ? ", " : ""}{event.location.city}</p>
                  <div className="mt-4 overflow-hidden rounded-xl border border-white/8">
                    {/*
                      Google Maps search-embed works from the saved venue/address without
                      requiring a browser-side API key. Coordinates are used when available;
                      otherwise the venue and city provide a location-search fallback.
                    */}
                    <iframe
                      title={`Map showing ${event.location.venue || "event venue"}`}
                      src={`https://www.google.com/maps?q=${encodeURIComponent(
                        event.location.lat != null && event.location.lng != null
                          ? `${event.location.lat},${event.location.lng}`
                          : [event.location.venue, event.location.address, event.location.city].filter(Boolean).join(", ")
                      )}&output=embed`}
                      className="h-56 w-full border-0"
                      loading="lazy"
                      referrerPolicy="no-referrer-when-downgrade"
                      allowFullScreen
                    />
                    <div className="flex flex-wrap gap-3 bg-black/20 px-3 py-2.5 text-xs">
                      <a
                        href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
                          event.location.lat != null && event.location.lng != null
                            ? `${event.location.lat},${event.location.lng}`
                            : [event.location.venue, event.location.address, event.location.city].filter(Boolean).join(", ")
                        )}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-semibold text-[#a78bff] hover:text-white"
                      >
                        Open in Google Maps ↗
                      </a>
                      <a
                        href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(
                          event.location.lat != null && event.location.lng != null
                            ? `${event.location.lat},${event.location.lng}`
                            : [event.location.venue, event.location.address, event.location.city].filter(Boolean).join(", ")
                        )}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-semibold text-[#00d4ff] hover:text-white"
                      >
                        Get directions ↗
                      </a>
                    </div>
                  </div>
                </div>
              )}
            </Reveal>
          </div>
        </div>

        {/* related */}
        {event.related.length > 0 && (
          <section className="mx-auto max-w-7xl px-6 pt-20 lg:px-8">
            <SectionHeaderLite title="You might also like" />
            <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {event.related.map((e, i) => <Reveal key={e.id} delay={i * 70}><EventCard event={e} /></Reveal>)}
            </div>
          </section>
        )}
      </main>

      {user && event.viewer?.qrToken && (
        <PassModal
          open={passOpen}
          onClose={() => setPassOpen(false)}
          event={event}
          holderName={user.name}
          qrToken={event.viewer.qrToken}
          status={event.viewer.registrationStatus ?? "REGISTERED"}
        />
      )}
      <Footer />
    </div>
  );
}

function SectionHeaderLite({ title }: { title: string }) {
  return (
    <div className="flex items-center gap-3">
      <span className="h-1.5 w-1.5 rounded-full bg-[#7c5cff] shadow-[0_0_8px_#7c5cff]" />
      <h2 className="font-display text-xl font-bold text-white">{title}</h2>
    </div>
  );
}
