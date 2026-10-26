"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowRight, ArrowUpRight, Bot, CalendarDays, ChevronRight, Compass, Cpu, Flame, MapPin, Medal, Music,
  Palette, Plus, Radio, ShieldCheck, Sparkles, Star, Ticket, Trophy, Users, Wrench, Zap, CheckCircle2, Camera, BadgeCheck,
} from "lucide-react";
import { api, cx, formatDate, formatTime, type Category, type EventItem, type Interest, type MemoryItem } from "@/lib/client";
import { useAuth, useToast } from "@/components/providers";
import { AnimatedNumber, Avatar, Reveal, SectionHeading, StatusPill } from "@/components/ui";
import { EventCard } from "@/components/event-card";
import { Footer, Navbar } from "@/components/chrome";

const CAT_ICONS: Record<string, any> = { cpu: Cpu, briefcase: Compass, palette: Palette, music: Music, trophy: Trophy, wrench: Wrench, code: Zap, users: Users, sparkles: Sparkles };
const ACH_ICONS: Record<string, any> = { flag: Zap, flame: Flame, medal: Medal, compass: Compass, users: Users, wrench: Wrench, sunrise: Star, message: Bot, star: Star, trophy: Trophy };

/* ============================== HERO ============================== */

function Hero({ featured, stats, live }: { featured: EventItem[]; stats: any; live: EventItem | null }) {
  const { user } = useAuth();
  return (
    <section className="relative flex min-h-[100svh] items-center overflow-hidden pt-28 pb-16">
      <div className="hero-bg">
        <div className="grid-bg" />
        <div className="orb orb-1" /> <div className="orb orb-2" /> <div className="orb orb-3" />
        <div className="beam" />
      </div>

      <div className="relative z-10 mx-auto grid w-full max-w-7xl items-center gap-14 px-6 lg:grid-cols-[1.05fr_0.95fr] lg:px-8">
        <div>
          <Reveal>
            <p className="chip mb-6 !border-[#7c5cff]/40 !bg-[#7c5cff]/10 !text-[#c9baff]">
              <Sparkles size={13} /> The intelligent event discovery platform
            </p>
          </Reveal>
          <Reveal delay={80}>
            <h1 className="font-display text-balance text-[clamp(2.7rem,7vw,5rem)] font-bold leading-[0.98] tracking-tight text-white">
              Discover Events<br />That <span className="gradient-text">Move You.</span>
            </h1>
          </Reveal>
          <Reveal delay={160}>
            <p className="mt-6 max-w-md text-lg leading-relaxed text-[#9aa4b2]">
              Find experiences, connect with people, earn XP and make every event count — all synced in one place.
            </p>
          </Reveal>
          <Reveal delay={240}>
            <div className="mt-9 flex flex-wrap items-center gap-4">
              <Link href="/events" className="btn btn-primary text-base">
                Explore Events <ArrowRight size={17} />
              </Link>
              <Link href={user ? "/organizer?create=1" : "/register?role=ORGANIZER"} className="btn btn-ghost text-base">
                <Plus size={17} /> Create an Event
              </Link>
            </div>
          </Reveal>
          <Reveal delay={320}>
            <div className="mt-12 flex flex-wrap gap-8 border-t border-white/8 pt-7">
              {[
                { v: stats?.upcoming ?? 0, l: "Live events" },
                { v: stats?.registrations ?? 0, l: "Registrations" },
                { v: stats?.members ?? 0, l: "Members" },
                { v: stats?.cities ?? 0, l: "Cities" },
              ].map((s) => (
                <div key={s.l}>
                  <p className="font-display text-3xl font-bold text-white"><AnimatedNumber value={s.v} /></p>
                  <p className="mt-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-[#5b6577]">{s.l}</p>
                </div>
              ))}
            </div>
          </Reveal>
        </div>

        {/* floating card composition */}
        <div className="relative hidden h-[560px] lg:block" aria-hidden>
          <div className="absolute left-1/2 top-1/2 h-[430px] w-[430px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-[#7c5cff]/20" />
          <div className="absolute left-1/2 top-1/2 h-[560px] w-[560px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-[#00d4ff]/10" />
          {featured.slice(0, 3).map((e, i) => {
            const d = formatDate(e.eventDate);
            const pos = [
              { cls: "left-0 top-6", r: "-6deg", anim: "float-slow" },
              { cls: "right-0 top-40", r: "5deg", anim: "float-slower" },
              { cls: "left-10 bottom-0", r: "-3deg", anim: "float-slow" },
            ][i];
            return (
              <div key={e.id} className={cx("absolute w-64", pos.cls, pos.anim)} style={{ "--r": pos.r, animationDelay: `${i * 1.2}s` } as any}>
                <Link href={`/events/${e.id}`} className="glass block overflow-hidden rounded-2xl border border-white/10 p-4 shadow-2xl transition-transform hover:scale-[1.03]">
                  {e.bannerUrl && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={e.bannerUrl} alt="" className="mb-3 h-24 w-full rounded-xl object-cover" />
                  )}
                  <div className="flex items-center justify-between">
                    <p className="rounded-md px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest" style={{ color: e.category?.color, background: `${e.category?.color}20` }}>{e.category?.name}</p>
                    <p className="font-display text-xl font-bold leading-none text-white">{d.day}<span className="ml-1 text-[10px] font-semibold uppercase text-[#9aa4b2]">{d.month}</span></p>
                  </div>
                  <p className="mt-2 line-clamp-2 text-[13px] font-bold leading-snug text-white">{e.title}</p>
                  <div className="mt-3 flex items-center justify-between">
                    <span className="flex -space-x-2">
                      {e.title.split(" ").slice(0, 3).map((w, k) => <Avatar key={k} name={w + (k + 2)} size={22} className="ring-2 ring-[#101728]" />)}
                    </span>
                    <p className="text-[11px] font-semibold text-[#00d4ff]">{e.registeredCount} attending</p>
                  </div>
                </Link>
              </div>
            );
          })}
          {live && (
            <div className="absolute right-6 top-2 float-slower">
              <Link href={`/events/${live.id}`} className="glass flex items-center gap-2.5 rounded-full border border-[#ff4d6d]/30 py-2 pl-3 pr-4 shadow-2xl">
                <span className="live-dot" />
                <span className="text-xs font-bold text-white">LIVE: {live.title.slice(0, 24)}{live.title.length > 24 ? "…" : ""}</span>
                <span className="text-[11px] font-semibold text-[#ff7d95]">{live.registeredCount} checked in</span>
              </Link>
            </div>
          )}
          <div className="absolute bottom-10 right-4 float-slow" style={{ animationDelay: "2s" }}>
            <div className="glass flex items-center gap-3 rounded-2xl border border-white/10 px-4 py-3 shadow-2xl">
              <span className="grid h-9 w-9 place-items-center rounded-xl bg-[#22d3a7]/20 text-[#2fe3b5]"><BadgeCheck size={17} /></span>
              <div>
                <p className="text-xs font-bold text-white">XP & certificates</p>
                <p className="text-[10px] text-[#9aa4b2]">earned at every check-in</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <a href="#foryou" aria-label="Scroll down" className="absolute bottom-7 left-1/2 z-10 -translate-x-1/2 text-[#5b6577] transition-colors hover:text-white">
        <span className="block h-10 w-6 rounded-full border border-current p-1"><span className="mx-auto block h-2.5 w-1 animate-bounce rounded-full bg-current" /></span>
      </a>
    </section>
  );
}

/* ============================== FOR YOU + INTERESTS ============================== */

function ForYou({ user }: { user: any }) {
  const { toast } = useToast();
  const [recs, setRecs] = useState<EventItem[]>([]);
  const [interests, setInterests] = useState<Interest[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [personalized, setPersonalized] = useState(false);
  const loaded = useRef(false);

  const loadRecs = async () => {
    const res = await api("/api/recommendations?limit=6");
    if (res.ok) {
      setRecs(res.data.items);
      setPersonalized(res.data.personalized);
    }
    setLoading(false);
  };

  useEffect(() => {
    (async () => {
      const [ire, me] = await Promise.all([api("/api/interests"), api("/api/auth/me")]);
      if (ire.ok) setInterests(ire.data.items);
      if (me.ok && me.data?.interests) setSelected(new Set(me.data.interests.map((i: Interest) => i.id)));
      await loadRecs();
      loaded.current = true;
    })();
  }, [user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggle = async (id: number) => {
    const next = new Set(selected);
    next.has(id) ? next.delete(id) : next.add(id);
    setSelected(next);
    if (!user) return;
    setSaving(true);
    const res = await api("/api/users/interests", { method: "PUT", body: { interestIds: [...next] } });
    setSaving(false);
    if (res.ok) {
      await loadRecs();
    } else {
      toast({ title: "Couldn't save interests", kind: "error" });
    }
  };

  return (
    <section id="foryou" className="relative mx-auto max-w-7xl px-6 py-24 lg:px-8">
      <SectionHeading
        kicker={personalized ? "Personalized for you" : "What are you into?"}
        title={<>Events <span className="gradient-text">For You</span></>}
        sub={
          personalized
            ? "Tuned live from your interests, favorites and event history. Tap an interest to re-tune instantly."
            : "Pick your interests — the discovery engine re-ranks events in real time. Sign in to keep them saved."
        }
      />
      <Reveal delay={100}>
        <div className="mb-9 flex flex-wrap items-center gap-2">
          {interests.map((i) => (
            <button
              key={i.id}
              onClick={() => toggle(i.id)}
              aria-pressed={selected.has(i.id)}
              className={cx("chip !py-2 !text-[13px]", selected.has(i.id) && "chip-active !text-white")}
            >
              {selected.has(i.id) && <CheckCircle2 size={13} className="text-[#a78bff]" />}
              {i.name}
            </button>
          ))}
          {saving && <span className="text-xs text-[#a78bff]">syncing…</span>}
          {!user && selected.size > 0 && (
            <Link href="/register" className="chip !border-[#00d4ff]/40 !text-[#00d4ff]">Save my interests →</Link>
          )}
        </div>
      </Reveal>
      {loading ? (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">{[...Array(6)].map((_, i) => <div key={i} className="skeleton h-80" />)}</div>
      ) : (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {recs.map((e, i) => (
            <Reveal key={e.id} delay={i * 70}>
              <EventCard event={e} rank={i + 1} />
            </Reveal>
          ))}
        </div>
      )}
      <Reveal className="mt-9 text-center">
        <Link href="/events" className="btn btn-ghost">Browse all events <ArrowRight size={15} /></Link>
      </Reveal>
    </section>
  );
}

/* ============================== CATEGORIES MARQUEE ============================== */

function Categories({ cats }: { cats: Category[] }) {
  const track = [...cats, ...cats];
  return (
    <section id="categories" className="overflow-hidden border-y border-white/5 bg-[#0a0e1a]/60 py-8">
      <div className="marquee-track">
        {track.map((c, i) => {
          const Icon = CAT_ICONS[c.icon] ?? Sparkles;
          return (
            <Link key={`${c.id}-${i}`} href={`/events?category=${c.slug}`} className="card flex shrink-0 items-center gap-3 !rounded-2xl px-6 py-4 transition-all hover:!border-[#7c5cff]/50">
              <span className="grid h-10 w-10 place-items-center rounded-xl" style={{ background: `${c.color}1c`, color: c.color }}>
                <Icon size={18} />
              </span>
              <span>
                <span className="block text-sm font-bold text-white">{c.name}</span>
                <span className="block text-[11px] text-[#5b6577]">{c.eventCount ?? 0} events</span>
              </span>
            </Link>
          );
        })}
      </div>
    </section>
  );
}

/* ============================== LIVE NOW ============================== */

function LiveSection({ live }: { live: EventItem | null }) {
  if (!live) return null;
  return (
    <section className="mx-auto max-w-7xl px-6 py-10 lg:px-8">
      <Reveal>
        <Link href={`/events/${live.id}`} className="card card-hover relative flex flex-col gap-6 overflow-hidden p-8 md:flex-row md:items-center md:p-10">
          <div className="absolute -right-20 -top-20 h-64 w-64 rounded-full bg-[#ff4d6d]/20 blur-[80px]" />
          <div className="flex-1">
            <p className="mb-3 inline-flex items-center gap-2 rounded-full border border-[#ff4d6d]/40 bg-[#ff4d6d]/10 px-3.5 py-1.5 text-[11px] font-bold uppercase tracking-[0.18em] text-[#ff7d95]">
              <span className="live-dot" /> Happening right now
            </p>
            <h3 className="font-display text-2xl font-bold text-white md:text-3xl">{live.title}</h3>
            <p className="mt-2 flex flex-wrap items-center gap-3 text-sm text-[#9aa4b2]">
              <span className="flex items-center gap-1.5"><Radio size={14} className="text-[#ff7d95]" /> {live.registeredCount} people checked in</span>
              <span className="flex items-center gap-1.5"><MapPin size={14} className="text-[#ff5ca8]" /> {live.location?.venue}</span>
            </p>
          </div>
          <div className="grid grid-cols-2 gap-4 md:w-72">
            <div className="rounded-2xl border border-white/8 bg-black/30 p-4 text-center">
              <p className="font-display text-3xl font-bold text-white"><AnimatedNumber value={live.registeredCount} /></p>
              <p className="mt-1 text-[10px] font-bold uppercase tracking-widest text-[#5b6577]">Attending</p>
            </div>
            <div className="rounded-2xl border border-white/8 bg-black/30 p-4 text-center">
              <p className="font-display text-3xl font-bold text-[#2fe3b5]">{live.seatsLeft}</p>
              <p className="mt-1 text-[10px] font-bold uppercase tracking-widest text-[#5b6577]">Seats left</p>
            </div>
            <span className="btn btn-cyan col-span-2 text-sm">Jump in live <ArrowUpRight size={15} /></span>
          </div>
        </Link>
      </Reveal>
    </section>
  );
}

/* ============================== JOURNEY / GAMIFICATION ============================== */

function Journey({ user, gam }: { user: any; gam: any }) {
  const level = user?.level;
  const achievements = gam?.achievements?.slice(0, 6) ?? [];
  return (
    <section id="journey" className="relative mx-auto max-w-7xl px-6 py-24 lg:px-8">
      <div className="grid items-center gap-12 lg:grid-cols-[0.9fr_1.1fr]">
        <Reveal variant="left">
          <p className="label-xs mb-3 flex items-center gap-2 text-[#a78bff]"><span className="h-1.5 w-1.5 rounded-full bg-[#7c5cff]" /> Gamified journey</p>
          <h2 className="font-display text-balance text-3xl font-bold leading-[1.08] text-white md:text-[2.6rem]">
            Your Event <span className="gradient-text">Journey</span>
          </h2>
          <p className="mt-4 max-w-md text-[15px] leading-relaxed text-[#9aa4b2]">
            Every registration, check-in and review earns XP. Level up from Explorer to Event Master, unlock achievements and climb the leaderboard — automatically.
          </p>
          <div className="mt-8 space-y-3">
            {[["Register", "+10 XP", "bg-[#7c5cff]/15 text-[#a78bff]"], ["Check-in with your QR pass", "+50 XP", "bg-[#00d4ff]/15 text-[#45c8ff]"], ["Leave feedback", "+10 XP", "bg-[#ff5ca8]/15 text-[#ff8fc0]"], ["Unlock achievements", "up to +250 XP", "bg-[#22d3a7]/15 text-[#2fe3b5]"]].map(([a, x, cls]) => (
              <div key={a} className="flex items-center justify-between rounded-xl border border-white/6 bg-white/[0.025] px-4 py-3">
                <span className="text-sm text-[#c8cfdd]">{a}</span>
                <span className={cx("rounded-full px-2.5 py-1 text-[11px] font-bold", cls)}>{x}</span>
              </div>
            ))}
          </div>
        </Reveal>
        <Reveal delay={140}>
          {user && gam ? (
            <div className="card relative overflow-hidden p-8">
              <div className="absolute -right-16 -top-16 h-56 w-56 rounded-full bg-[#7c5cff]/15 blur-[70px]" />
              <div className="flex flex-wrap items-center gap-7">
                <div className="relative h-36 w-36">
                  <svg viewBox="0 0 120 120" className="ring h-full w-full">
                    <circle cx="60" cy="60" r="52" fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth="10" />
                    <circle cx="60" cy="60" r="52" fill="none" stroke="url(#ringGrad)" strokeWidth="10" strokeLinecap="round"
                      strokeDasharray={2 * Math.PI * 52} strokeDashoffset={2 * Math.PI * 52 * (1 - Math.min(1, level?.progress ?? 0))} />
                    <defs><linearGradient id="ringGrad" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stopColor="#7c5cff" /><stop offset="100%" stopColor="#00d4ff" /></linearGradient></defs>
                  </svg>
                  <div className="absolute inset-0 grid place-items-center text-center">
                    <div>
                      <p className="font-display text-2xl font-bold text-white"><AnimatedNumber value={gam.points} /></p>
                      <p className="text-[10px] font-bold uppercase tracking-widest text-[#5b6577]">EventSync XP</p>
                    </div>
                  </div>
                </div>
                <div className="min-w-44 flex-1">
                  <p className="chip !border-[#7c5cff]/40 !text-[#c9baff]"><Medal size={12} /> Level {level?.level} · {level?.name}</p>
                  <p className="mt-3 text-sm text-[#9aa4b2]">
                    {level?.nextAt ? <><b className="text-white">{level.nextAt - gam.points} XP</b> to <b className="text-white">{level.nextName}</b></> : "Max level reached — legend status."}
                  </p>
                  <div className="mt-4 grid grid-cols-3 gap-3 text-center">
                    {[["Attended", gam.stats?.attended], ["Registered", gam.stats?.registered], ["Upcoming", gam.stats?.upcoming]].map(([l, v]) => (
                      <div key={l as string} className="rounded-xl border border-white/6 bg-black/25 py-3">
                        <p className="font-display text-xl font-bold text-white">{v as number}</p>
                        <p className="text-[9.5px] font-bold uppercase tracking-widest text-[#5b6577]">{l}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
              <div className="mt-7 grid grid-cols-2 gap-3 sm:grid-cols-3">
                {achievements.map((a: any) => {
                  const Icon = ACH_ICONS[a.icon] ?? Trophy;
                  const unlocked = !!a.unlockedAt;
                  return (
                    <div key={a.slug} className={cx("rounded-2xl border p-3.5 transition-all hover:-translate-y-1", unlocked ? "border-[#7c5cff]/40 bg-[#7c5cff]/10" : "border-white/6 bg-white/[0.02] opacity-50")}>
                      <span className={cx("grid h-9 w-9 place-items-center rounded-xl", unlocked ? "bg-gradient-to-br from-[#7c5cff] to-[#00d4ff] text-white" : "bg-white/8 text-[#5b6577]")}><Icon size={16} /></span>
                      <p className="mt-2 text-[13px] font-bold text-white">{a.name}</p>
                      <p className="mt-0.5 line-clamp-2 text-[11px] text-[#9aa4b2]">{a.description}</p>
                    </div>
                  );
                })}
              </div>
              <Link href="/dashboard?tab=journey" className="btn btn-ghost mt-6 w-full text-sm">Open full journey <ArrowRight size={14} /></Link>
            </div>
          ) : (
            <div className="card relative overflow-hidden p-8">
              <div className="absolute -right-16 -top-16 h-56 w-56 rounded-full bg-[#00d4ff]/12 blur-[70px]" />
              <p className="font-display text-xl font-bold text-white">The ladder to <span className="gradient-text">Event Master</span></p>
              <div className="mt-6 space-y-4">
                {[["Explorer", "0 XP", 18], ["Participant", "101 XP", 38], ["Enthusiast", "301 XP", 58], ["Community Builder", "701 XP", 78], ["Event Master", "1,501 XP", 100]].map(([n, x, w], i) => (
                  <div key={n as string} className="group">
                    <div className="mb-1.5 flex justify-between text-[13px]"><span className="font-semibold text-[#c8cfdd]">{n}</span><span className="text-[#5b6577]">{x}</span></div>
                    <div className="h-2.5 overflow-hidden rounded-full bg-white/6">
                      <div className="h-full rounded-full bg-gradient-to-r from-[#7c5cff] to-[#00d4ff] transition-all duration-1000" style={{ width: `${w}%`, transitionDelay: `${i * 120}ms` }} />
                    </div>
                  </div>
                ))}
              </div>
              <Link href="/register" className="btn btn-primary mt-7 w-full text-sm">Start earning XP <Zap size={14} /></Link>
            </div>
          )}
        </Reveal>
      </div>
    </section>
  );
}

/* ============================== LEADERBOARD ============================== */

function Leaderboard({ items, me }: { items: any[]; me: any }) {
  const podium = items.slice(0, 3);
  const rest = items.slice(3, 8);
  const medal = ["#ffc35c", "#c8cfdd", "#e08b5a"];
  return (
    <section id="leaderboard" className="mx-auto max-w-7xl px-6 py-24 lg:px-8">
      <SectionHeading center kicker="Community" title={<>EventSync <span className="gradient-text">Leaderboard</span></>} sub="The most active explorers this season. Every point here is earned from real check-ins." />
      <div className="mx-auto max-w-3xl">
        <div className="mb-4 grid grid-cols-3 items-end gap-3">
          {[podium[1], podium[0], podium[2]].filter(Boolean).map((p) => {
            const isFirst = p.rank === 1;
            return (
              <Reveal key={p.rank} delay={p.rank * 90}>
                <div className={cx("card flex flex-col items-center gap-2 px-3 pb-5 text-center", isFirst ? "!border-[#ffc35c]/40 pt-8 pb-7 shadow-[0_0_50px_-12px_rgba(255,195,92,0.35)]" : "pt-6")}>
                  <span className="font-display text-xs font-bold uppercase tracking-widest" style={{ color: medal[p.rank - 1] }}>#{p.rank}</span>
                  <Avatar name={p.name} size={isFirst ? 58 : 46} />
                  <p className="max-w-full truncate text-sm font-bold text-white">{p.name}</p>
                  <p className="font-display text-lg font-bold" style={{ color: medal[p.rank - 1] }}><AnimatedNumber value={p.xp} /> <span className="text-[10px]">XP</span></p>
                  <p className="text-[10px] text-[#5b6577]">{p.level}</p>
                </div>
              </Reveal>
            );
          })}
        </div>
        <Reveal delay={200}>
          <div className="card divide-y divide-white/5 overflow-hidden">
            {rest.map((p) => (
              <div key={p.rank} className="flex items-center gap-4 px-5 py-3.5 transition-colors hover:bg-white/[0.03]">
                <span className="w-7 font-display text-sm font-bold text-[#5b6577]">{String(p.rank).padStart(2, "0")}</span>
                <Avatar name={p.name} size={34} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-white">{p.name}</p>
                  <p className="text-[11px] text-[#5b6577]">{p.level} · {p.attended} attended</p>
                </div>
                <p className="font-display text-sm font-bold text-[#a78bff]">{p.xp.toLocaleString()} XP</p>
              </div>
            ))}
            {rest.length === 0 && podium.length === 0 && <p className="px-5 py-8 text-center text-sm text-[#9aa4b2]">The leaderboard is warming up — join an event to claim a spot.</p>}
            {me?.rank && (
              <div className="flex items-center gap-4 bg-[#7c5cff]/10 px-5 py-3.5">
                <span className="w-7 font-display text-sm font-bold text-[#a78bff]">#{me.rank}</span>
                <Avatar name={me.name} size={34} />
                <p className="flex-1 text-sm font-bold text-white">You</p>
                <Link href="/dashboard?tab=journey" className="text-xs font-semibold text-[#00d4ff]">View stats →</Link>
              </div>
            )}
          </div>
        </Reveal>
      </div>
    </section>
  );
}

/* ============================== COMMUNITY ============================== */

function Community({ people }: { people: any[] }) {
  if (!people.length) return null;
  return (
    <section id="community" className="mx-auto max-w-7xl px-6 py-24 lg:px-8">
      <SectionHeading kicker="Shared interests" title={<>People You <span className="gradient-text">May Meet</span></>} sub="Matched on real shared interests from the community — no spammy contact info, ever." />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {people.slice(0, 4).map((p, i) => (
          <Reveal key={p.id} delay={i * 80}>
            <div className="card card-hover flex h-full flex-col items-center p-6 text-center">
              <Avatar name={p.name} size={62} />
              <p className="mt-3 text-sm font-bold text-white">{p.name}</p>
              <p className="mt-0.5 text-[11px] text-[#5b6577]">{p.level} · {p.eventsAttended} events</p>
              {p.sharedInterests?.length > 0 && (
                <div className="mt-3 flex flex-wrap justify-center gap-1.5">
                  {p.sharedInterests.slice(0, 3).map((s: string) => (
                    <span key={s} className="rounded-full bg-[#7c5cff]/12 px-2 py-0.5 text-[10px] font-semibold text-[#c9baff]">{s}</span>
                  ))}
                </div>
              )}
              {p.sharedCount > 0 && <p className="mt-2 text-[11px] text-[#00d4ff]">You both like {p.sharedCount} of these</p>}
              <Link href="/events" className="btn btn-ghost mt-4 w-full !py-2 text-xs">Meet at an event</Link>
            </div>
          </Reveal>
        ))}
      </div>
    </section>
  );
}

/* ============================== MAP ============================== */

function EventMap({ events }: { events: EventItem[] }) {
  const [sel, setSel] = useState<EventItem | null>(null);
  const pinRefs = useRef<Record<string, number>>({});
  const withLoc = events.filter((e) => e.location?.lat && e.location?.lng);
  const project = (lat: number, lng: number) => {
    const x = Math.min(96, Math.max(4, ((lng - 68) / (98 - 68)) * 92 + 4));
    const y = Math.min(92, Math.max(6, (1 - (lat - 6) / (32)) * 88 + 6));
    return { x, y };
  };
  return (
    <section className="mx-auto max-w-7xl px-6 py-24 lg:px-8">
      <SectionHeading kicker="Explore the map" title={<>Events <span className="gradient-text">Near You</span></>} sub="Live markers plotted from real venue coordinates. Tap one to peek." />
      <Reveal>
        <div className="card relative h-[440px] overflow-hidden !rounded-3xl">
          <div className="grid-bg absolute inset-0 opacity-60" />
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(124,92,255,0.14),transparent_50%),radial-gradient(circle_at_75%_70%,rgba(0,212,255,0.12),transparent_50%)]" />
          <svg className="absolute inset-0 h-full w-full opacity-50" aria-hidden>
            <path d="M 8% 30% Q 30% 12% 55% 25% T 92% 45%" fill="none" stroke="rgba(124,92,255,0.25)" strokeDasharray="6 8" />
            <path d="M 15% 75% Q 45% 55% 70% 78% T 95% 60%" fill="none" stroke="rgba(0,212,255,0.2)" strokeDasharray="6 8" />
          </svg>
          <p className="absolute left-5 top-5 z-10 flex items-center gap-2 rounded-full bg-black/45 px-3 py-1.5 text-[11px] font-bold uppercase tracking-widest text-[#9aa4b2] backdrop-blur">
            <MapPin size={12} className="text-[#7c5cff]" /> Event Map
          </p>
          {withLoc.map((e, i) => {
            const { x, y } = project(e.location!.lat!, e.location!.lng!);
            return (
              <button
                key={e.id}
                onClick={() => setSel(sel?.id === e.id ? null : e)}
                aria-label={`${e.title} in ${e.location!.city}`}
                className="map-pin group absolute z-10"
                style={{ left: `${x}%`, top: `${y}%`, animationDelay: `${i * 0.4}s` }}
              >
                <span className="relative block">
                  <span className="absolute -inset-2 rounded-full opacity-40 blur transition-opacity group-hover:opacity-90" style={{ background: e.category?.color ?? "#7c5cff" }} />
                  <MapPin size={26} fill={e.category?.color ?? "#7c5cff"} className="relative text-black/50" />
                </span>
                <span className="pointer-events-none absolute -top-8 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-lg bg-black/80 px-2 py-1 text-[10px] font-bold text-white opacity-0 backdrop-blur transition-opacity group-hover:opacity-100">
                  {e.location!.city}
                </span>
              </button>
            );
          })}
          {sel && (
            <div className="modal-card absolute bottom-4 left-4 right-4 z-20 md:left-6 md:right-auto md:w-96">
              <div className="glass rounded-2xl border border-white/12 p-5 shadow-2xl">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <StatusPill status={sel.status} />
                    <h4 className="mt-2 font-display text-lg font-bold leading-tight text-white">{sel.title}</h4>
                    <p className="mt-1 text-xs text-[#9aa4b2]">{formatDate(sel.eventDate).month} {formatDate(sel.eventDate).day} · {formatTime(sel.startTime)} · {sel.location?.venue}, {sel.location?.city}</p>
                  </div>
                  <button onClick={() => setSel(null)} aria-label="Close" className="text-[#5b6577] hover:text-white">✕</button>
                </div>
                <div className="mt-3 flex items-center justify-between">
                  <p className="text-xs text-[#00d4ff]">{sel.registeredCount} attending · {sel.seatsLeft} left</p>
                  <Link href={`/events/${sel.id}`} className="btn btn-primary !px-4 !py-2 text-xs">View <ArrowUpRight size={12} /></Link>
                </div>
              </div>
            </div>
          )}
        </div>
      </Reveal>
    </section>
  );
}

/* ============================== MEMORIES ============================== */

function Memories({ memories }: { memories: MemoryItem[] }) {
  if (!memories.length) return null;
  return (
    <section className="mx-auto max-w-7xl px-6 py-24 lg:px-8">
      <SectionHeading kicker="Afterglow" title={<>Event <span className="gradient-text">Memories</span></>} sub="Real moments from past events, uploaded by organizers." />
      <div className="flex snap-x gap-4 overflow-x-auto pb-4 no-bar">
        {memories.map((m, i) => (
          <Reveal key={m.id} delay={i * 60} className="shrink-0">
            <Link href={`/events/${m.eventId}`} className="card group relative block w-72 overflow-hidden !rounded-2xl">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={m.mediaUrl} alt={m.caption} loading="lazy" className="h-44 w-full object-cover transition-transform duration-700 group-hover:scale-108" />
              <div className="p-4">
                <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-widest text-[#a78bff]"><Camera size={11} /> {m.eventTitle}</p>
                <p className="mt-1.5 line-clamp-2 text-[13px] text-[#c8cfdd]">{m.caption}</p>
                {m.attended && <p className="mt-2 flex items-center gap-1 text-[11px] font-bold text-[#2fe3b5]"><CheckCircle2 size={11} /> You were there</p>}
              </div>
            </Link>
          </Reveal>
        ))}
      </div>
    </section>
  );
}

/* ============================== CTA ============================== */

function FinalCta() {
  const { user } = useAuth();
  return (
    <section className="mx-auto max-w-7xl px-6 py-16 lg:px-8">
      <Reveal>
        <div className="card relative overflow-hidden !border-[#7c5cff]/30 px-8 py-16 text-center md:py-20">
          <div className="orb orb-1 !opacity-30" />
          <div className="orb orb-2 !opacity-25" />
          <div className="relative z-10">
            <p className="chip mx-auto mb-5 !border-[#7c5cff]/40 !text-[#c9baff]"><Ticket size={12} /> Your next experience is one tap away</p>
            <h2 className="font-display mx-auto max-w-2xl text-balance text-3xl font-bold leading-tight text-white md:text-5xl">
              Stop scrolling.<br />Start <span className="gradient-text">showing up.</span>
            </h2>
            <div className="mt-8 flex flex-wrap justify-center gap-4">
              <Link href="/events" className="btn btn-primary text-base">Find my event <ArrowRight size={16} /></Link>
              {!user && <Link href="/register" className="btn btn-ghost text-base">Create free account</Link>}
            </div>
          </div>
        </div>
      </Reveal>
    </section>
  );
}

/* ============================== PAGE ============================== */

export default function LandingPage() {
  const { user } = useAuth();
  const [featured, setFeatured] = useState<EventItem[]>([]);
  const [trending, setTrending] = useState<EventItem[]>([]);
  const [mapEvents, setMapEvents] = useState<EventItem[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [cats, setCats] = useState<Category[]>([]);
  const [board, setBoard] = useState<any>({ items: [] });
  const [people, setPeople] = useState<any[]>([]);
  const [memories, setMemories] = useState<MemoryItem[]>([]);
  const [gam, setGam] = useState<any>(null);
  const [live, setLive] = useState<EventItem | null>(null);

  useEffect(() => {
    (async () => {
      const [meta, c, t, b, ppl, mem, mapRes, upcoming] = await Promise.all([
        api("/api/meta"),
        api("/api/categories"),
        api("/api/events?sort=trending&limit=6"),
        api("/api/leaderboard?limit=8"),
        api("/api/community"),
        api("/api/memories"),
        api("/api/events?sort=popular&limit=14"),
        api("/api/events?status=upcoming&limit=8"),
      ]);
      if (meta.ok) setStats(meta.data);
      if (c.ok) setCats(c.data.items);
      if (t.ok) {
        setTrending(t.data.items);
        setFeatured(t.data.items.slice(0, 3));
      }
      if (b.ok) setBoard(b.data);
      if (ppl.ok) setPeople(ppl.data.items);
      if (mem.ok) setMemories(mem.data.items);
      if (mapRes.ok) setMapEvents(mapRes.data.items);
      if (upcoming.ok) {
        const lv = upcoming.data.items.find((e: EventItem) => e.status === "LIVE");
        if (lv) setLive(lv);
      }
    })();
  }, []);

  useEffect(() => {
    if (user) api("/api/users/gamification").then((r) => r.ok && setGam(r.data));
  }, [user]);

  const boardMe = useMemo(() => board?.me, [board]);

  return (
    <div className="relative min-h-screen">
      <Navbar />
      <main>
        <Hero featured={featured} stats={stats} live={live} />
        <Categories cats={cats} />
        <ForYou user={user} />
        <LiveSection live={live} />
        {/* trending */}
        <section id="trending" className="mx-auto max-w-7xl px-6 py-16 lg:px-8">
          <SectionHeading kicker="Hot right now" title={<>Trending <span className="gradient-text">This Week</span></>} sub="Ranked by real views and registrations across the platform." />
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {trending.length === 0 && [...Array(3)].map((_, i) => <div key={i} className="skeleton h-80" />)}
            {trending.slice(0, 3).map((e, i) => (
              <Reveal key={e.id} delay={i * 80}><EventCard event={e} rank={i + 1} /></Reveal>
            ))}
          </div>
        </section>
        <Journey user={user} gam={gam} />
        <Leaderboard items={board.items ?? []} me={boardMe} />
        <EventMap events={mapEvents} />
        <Community people={people} />
        <Memories memories={memories} />
        <FinalCta />
      </main>
      <Footer />
    </div>
  );
}
