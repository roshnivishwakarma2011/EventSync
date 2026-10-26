"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useState } from "react";
import {
  Award, BadgeCheck, Bell, Bookmark, CalendarDays, Camera, CheckCircle2, Compass, Download, ExternalLink,
  Flame, Hourglass, Medal, QrCode, Share2, Sparkles, Star, Ticket, Trophy, Users, Wrench, X, Zap, Loader2,
} from "lucide-react";
import { api, cx, formatDate, formatLongDate, formatTime, timeAgo, type EventItem, type Interest } from "@/lib/client";
import { useAuth, useToast } from "@/components/providers";
import { AnimatedNumber, Avatar, Empty, Reveal, SectionHeading, Spinner, StatusPill } from "@/components/ui";
import { EventCard } from "@/components/event-card";
import { PassModal, QrPass } from "@/components/qr-pass";
import { Footer, Navbar } from "@/components/chrome";

const ACH_ICONS: Record<string, any> = { flag: Zap, flame: Flame, medal: Medal, compass: Compass, users: Users, wrench: Wrench, sunrise: Star, message: Camera, star: Star, trophy: Trophy };
const TABS = [
  { id: "overview", label: "Overview", icon: Sparkles },
  { id: "passes", label: "My Passes", icon: QrCode },
  { id: "journey", label: "Journey", icon: Trophy },
  { id: "certificates", label: "Certificates", icon: Award },
  { id: "favorites", label: "Favorites", icon: Bookmark },
  { id: "memories", label: "Memories", icon: Camera },
  { id: "profile", label: "Profile & Interests", icon: Users },
];

function DashboardInner() {
  const params = useSearchParams();
  const router = useRouter();
  const { user, loading, refresh } = useAuth();
  const { toast } = useToast();
  const [tab, setTab] = useState(params.get("tab") ?? "overview");
  const [regs, setRegs] = useState<any[]>([]);
  const [gam, setGam] = useState<any>(null);
  const [certs, setCerts] = useState<any[]>([]);
  const [favs, setFavs] = useState<EventItem[]>([]);
  const [memories, setMemories] = useState<any[]>([]);
  const [interests, setInterests] = useState<Interest[]>([]);
  const [myInterests, setMyInterests] = useState<Set<number>>(new Set());
  const [notifications, setNotifications] = useState<any[]>([]);
  const [board, setBoard] = useState<any>(null);
  const [busy, setBusy] = useState(true);
  const [passSel, setPassSel] = useState<any>(null);
  const [certSel, setCertSel] = useState<any>(null);
  const [cancelling, setCancelling] = useState<string | null>(null);
  const [savingProfile, setSavingProfile] = useState(false);

  const load = useCallback(async () => {
    setBusy(true);
    const [r, g, c, f, m, i, n, b] = await Promise.all([
      api("/api/users/registrations"),
      api("/api/users/gamification"),
      api("/api/certificates"),
      api("/api/users/favorites"),
      api("/api/memories"),
      api("/api/interests"),
      api("/api/notifications?limit=6"),
      api("/api/leaderboard?limit=100"),
    ]);
    if (r.ok) setRegs(r.data.items);
    if (g.ok) setGam(g.data);
    if (c.ok) setCerts(c.data.items);
    if (f.ok) setFavs(f.data.items);
    if (m.ok) setMemories(m.data.items.filter((x: any) => x.attended));
    if (i.ok) setInterests(i.data.items);
    if (n.ok) setNotifications(n.data.items);
    if (b.ok) setBoard(b.data);
    setBusy(false);
  }, []);

  // Load once per signed-in user. Depending on the whole `user` object caused an endless
  // refresh -> new user object -> load -> refresh loop (the "syncing your data" flicker).
  const userId = user?.id;
  useEffect(() => {
    if (!loading && !userId) router.replace(`/login?next=/dashboard`);
  }, [loading, userId, router]);

  useEffect(() => {
    if (userId) load();
  }, [userId, load]);

  const interestKey = (user?.interests ?? []).map((x: Interest) => x.id).join(",");
  useEffect(() => {
    setMyInterests(new Set(interestKey ? interestKey.split(",").map(Number) : []));
  }, [interestKey]);

  if (loading || !user) return <div className="min-h-screen"><Navbar /><Spinner label="Loading your hub…" /></div>;

  const upcoming = regs.filter((r) => r.event && ["REGISTERED", "CHECKED_IN"].includes(r.status) && r.event.status !== "COMPLETED" && r.event.status !== "CANCELLED");
  const attended = regs.filter((r) => r.status === "ATTENDED");
  const myRank = board?.items?.findIndex((x: any) => x.isMe);

  const cancelReg = async (r: any) => {
    setCancelling(r.id);
    const res = await api(`/api/events/${r.event.id}/register`, { method: "DELETE" });
    setCancelling(null);
    if (res.ok) {
      toast({ title: "Registration cancelled", kind: "info" });
      await load();
    } else toast({ title: res.error?.message ?? "Couldn't cancel", kind: "error" });
  };

  const toggleInterest = async (id: number) => {
    const next = new Set(myInterests);
    next.has(id) ? next.delete(id) : next.add(id);
    setMyInterests(next);
    setSavingProfile(true);
    await api("/api/users/interests", { method: "PUT", body: { interestIds: [...next] } });
    await refresh();
    setSavingProfile(false);
    toast({ title: "Interests updated", body: "Recommendations re-tuned instantly.", kind: "success" });
  };

  const shareCert = async (id: string) => {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/verify/${id}`);
      toast({ title: "Verification link copied", kind: "success" });
    } catch { toast({ title: "Copy failed", kind: "error" }); }
  };

  return (
    <div className="min-h-screen">
      <Navbar />
      <main className="mx-auto max-w-7xl px-6 pb-24 pt-32 lg:px-8">
        {/* header card */}
        <Reveal>
          <div className="card relative overflow-hidden p-7 md:p-9">
            <div className="orb orb-1 !opacity-25" />
            <div className="relative z-10 flex flex-wrap items-center gap-6">
              <Avatar name={user.name} size={68} />
              <div className="min-w-0 flex-1">
                <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-[#a78bff]">EventSync XP</p>
                <h1 className="font-display mt-1 truncate text-2xl font-bold text-white md:text-3xl">Hey {user.name.split(" ")[0]}
                  <span className="ml-3 align-middle text-sm font-semibold text-[#9aa4b2]">Level {gam?.level?.level} · {gam?.level?.name}</span>
                </h1>
                <div className="mt-3 max-w-sm">
                  <div className="h-2 overflow-hidden rounded-full bg-white/8">
                    <div className="h-full rounded-full bg-gradient-to-r from-[#7c5cff] to-[#00d4ff] transition-all duration-1000" style={{ width: `${Math.round((gam?.level?.progress ?? 0) * 100)}%` }} />
                  </div>
                  <p className="mt-1.5 text-[11px] text-[#5b6577]">{gam?.points?.toLocaleString() ?? 0} XP {gam?.level?.nextAt ? `· ${gam.level.nextAt - gam.points} to ${gam.level.nextName}` : "· top level"}</p>
                </div>
              </div>
              <div className="flex flex-wrap gap-3">
                {[["Events attended", attended.length], ["Upcoming", upcoming.length], ["Certificates", certs.length], ["Global rank", myRank >= 0 ? `#${myRank + 1}` : "—"]].map(([l, v]) => (
                  <div key={l} className="rounded-2xl border border-white/8 bg-black/30 px-5 py-3.5 text-center">
                    <p className="font-display text-xl font-bold text-white">{typeof v === "number" ? <AnimatedNumber value={v} /> : v}</p>
                    <p className="mt-0.5 text-[9.5px] font-bold uppercase tracking-widest text-[#5b6577]">{l}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </Reveal>

        {/* tabs */}
        <div className="no-bar mt-7 flex gap-2 overflow-x-auto border-b border-white/6 pb-px">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              aria-pressed={tab === t.id}
              className={cx(
                "relative flex shrink-0 items-center gap-2 px-4 py-3 text-sm font-semibold transition-colors",
                tab === t.id ? "text-white" : "text-[#5b6577] hover:text-[#c8cfdd]"
              )}
            >
              <t.icon size={15} className={tab === t.id ? "text-[#a78bff]" : ""} /> {t.label}
              {tab === t.id && <span className="absolute inset-x-2 bottom-0 h-[2.5px] rounded-full bg-gradient-to-r from-[#7c5cff] to-[#00d4ff]" />}
            </button>
          ))}
        </div>

        {busy ? (
          <Spinner label="Syncing your data…" />
        ) : (
          <div className="mt-8">
            {/* ------------------------------ OVERVIEW ------------------------------ */}
            {tab === "overview" && (
              <div className="grid gap-8 lg:grid-cols-[1.5fr_1fr]">
                <section>
                  <h2 className="font-display mb-5 text-lg font-bold text-white">Upcoming for you</h2>
                  {upcoming.length === 0 ? (
                    <Empty title="No upcoming events" body="Your next experience is out there — go grab a seat.">
                      <Link href="/events" className="btn btn-primary mt-2 text-sm">Discover events</Link>
                    </Empty>
                  ) : (
                    <div className="space-y-4">
                      {upcoming.slice(0, 4).map((r) => {
                        const d = formatDate(r.event.eventDate);
                        return (
                          <div key={r.id} className="card card-hover flex flex-wrap items-center gap-4 p-4">
                            {r.event.bannerUrl && (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={r.event.bannerUrl} alt="" className="h-16 w-24 rounded-xl object-cover" />
                            )}
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2"><StatusPill status={r.event.status} /><span className="text-[11px] font-semibold text-[#5b6577]">{d.weekday}, {d.month} {d.day} · {formatTime(r.event.startTime)}</span></div>
                              <Link href={`/events/${r.event.id}`} className="mt-1 block truncate font-display text-[15px] font-bold text-white hover:text-[#c9baff]">{r.event.title}</Link>
                              <p className="text-xs text-[#9aa4b2]">{r.event.location ? `${r.event.location.venue}, ${r.event.location.city}` : "Online"}</p>
                            </div>
                            <button onClick={() => setPassSel(r)} className="btn btn-ghost !px-4 !py-2.5 text-xs"><QrCode size={14} /> Pass</button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                  <h2 className="font-display mb-5 mt-10 text-lg font-bold text-white">Latest XP activity</h2>
                  <div className="card divide-y divide-white/5">
                    {(gam?.transactions ?? []).slice(0, 6).map((t: any) => (
                      <div key={t.id} className="flex items-center gap-3 px-5 py-3.5">
                        <span className={cx("grid h-8 w-8 shrink-0 place-items-center rounded-lg", t.amount >= 50 ? "bg-[#00d4ff]/15 text-[#45c8ff]" : "bg-[#7c5cff]/15 text-[#a78bff]")}>
                          <Zap size={13} />
                        </span>
                        <p className="flex-1 truncate text-[13px] text-[#c8cfdd]">{t.note || t.reason}</p>
                        <span className="font-display text-sm font-bold text-[#2fe3b5]">+{t.amount}</span>
                        <span className="w-16 text-right text-[10px] text-[#5b6577]">{timeAgo(t.createdAt)}</span>
                      </div>
                    ))}
                    {(gam?.transactions ?? []).length === 0 && <p className="px-5 py-6 text-sm text-[#9aa4b2]">Register for an event to start earning XP.</p>}
                  </div>
                </section>
                <section>
                  <h2 className="font-display mb-5 text-lg font-bold text-white">Notification feed</h2>
                  <div className="space-y-3">
                    {notifications.length === 0 && <Empty title="All quiet" body="Event reminders and updates will show up here." />}
                    {notifications.map((n) => (
                      <Link key={n.id} href={n.link ?? "#"} className={cx("card flex gap-3 p-4 transition-colors hover:!border-[#7c5cff]/40", !n.read && "!border-[#00d4ff]/25 bg-[#00d4ff]/[0.04]")}>
                        <Bell size={15} className={cx("mt-0.5 shrink-0", n.read ? "text-[#5b6577]" : "text-[#00d4ff]")} />
                        <span>
                          <span className="block text-[13px] font-semibold text-white">{n.title}</span>
                          {n.body && <span className="mt-0.5 block text-xs text-[#9aa4b2]">{n.body}</span>}
                          <span className="mt-1 block text-[10px] text-[#5b6577]">{timeAgo(n.createdAt)}</span>
                        </span>
                      </Link>
                    ))}
                  </div>
                </section>
              </div>
            )}

            {/* ------------------------------ PASSES ------------------------------ */}
            {tab === "passes" && (
              <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-3">
                {regs.filter((r) => r.status !== "CANCELLED" && r.event).length === 0 && (
                  <div className="col-span-full"><Empty title="No passes yet" body="Register for an event and your QR pass appears here instantly."><Link href="/events" className="btn btn-primary mt-2 text-sm">Find an event</Link></Empty></div>
                )}
                {regs.filter((r) => r.status !== "CANCELLED" && r.event).map((r, i) => (
                  <Reveal key={r.id} delay={i * 60}>
                    <div className="relative">
                      <QrPass compact event={r.event} holderName={user.name} qrToken={r.qrToken} status={r.status} />
                      {r.status === "REGISTERED" && (
                        <button
                          onClick={() => cancelReg(r)}
                          disabled={cancelling === r.id}
                          className="mt-3 w-full text-center text-xs font-semibold text-[#5b6577] transition-colors hover:text-[#ff8fa8]"
                        >
                          {cancelling === r.id ? "Cancelling…" : "Cancel registration"}
                        </button>
                      )}
                    </div>
                  </Reveal>
                ))}
              </div>
            )}

            {/* ------------------------------ JOURNEY ------------------------------ */}
            {tab === "journey" && gam && (
              <div>
                <div className="grid gap-6 lg:grid-cols-[1fr_1.5fr]">
                  <div className="card relative overflow-hidden p-7">
                    <div className="absolute -right-12 -top-12 h-48 w-48 rounded-full bg-[#7c5cff]/15 blur-[60px]" />
                    <p className="label-xs">Current level</p>
                    <p className="font-display mt-2 text-4xl font-bold text-white">{gam.level.name}</p>
                    <p className="mt-1 text-sm text-[#9aa4b2]">Level {gam.level.level}</p>
                    <div className="mt-6">
                      <div className="mb-1.5 flex justify-between text-xs text-[#5b6577]"><span>{gam.points.toLocaleString()} XP</span><span>{gam.level.nextAt ? `${gam.level.nextAt.toLocaleString()} XP` : "MAX"}</span></div>
                      <div className="h-3 overflow-hidden rounded-full bg-white/8">
                        <div className="h-full rounded-full bg-gradient-to-r from-[#7c5cff] to-[#00d4ff]" style={{ width: `${Math.round(gam.level.progress * 100)}%` }} />
                      </div>
                    </div>
                    <div className="mt-7 grid grid-cols-3 gap-3 text-center">
                      {[["Registered", gam.stats.registered], ["Attended", gam.stats.attended], ["Upcoming", gam.stats.upcoming]].map(([l, v]) => (
                        <div key={l as string} className="rounded-xl border border-white/6 bg-black/25 py-3.5">
                          <p className="font-display text-xl font-bold text-white">{v as number}</p>
                          <p className="text-[9px] font-bold uppercase tracking-widest text-[#5b6577]">{l}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div>
                    <h3 className="font-display mb-4 text-lg font-bold text-white">Achievements</h3>
                    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                      {gam.achievements.map((a: any, i: number) => {
                        const Icon = ACH_ICONS[a.icon] ?? Trophy;
                        const unlocked = !!a.unlockedAt;
                        return (
                          <Reveal key={a.slug} delay={i * 40}>
                            <div className={cx("relative rounded-2xl border p-4 transition-all hover:-translate-y-1", unlocked ? "border-[#7c5cff]/40 bg-[#7c5cff]/10" : "border-white/6 bg-white/[0.02] opacity-55")}>
                              <div className="flex items-center justify-between">
                                <span className={cx("grid h-10 w-10 place-items-center rounded-xl", unlocked ? "bg-gradient-to-br from-[#7c5cff] to-[#00d4ff] text-white shadow-[0_4px_16px_rgba(124,92,255,0.5)]" : "bg-white/8 text-[#5b6577]")}>
                                  <Icon size={17} />
                                </span>
                                {unlocked ? <CheckCircle2 size={15} className="text-[#2fe3b5]" /> : <span className="rounded-full bg-white/8 px-2 py-0.5 text-[9px] font-bold text-[#5b6577]">+{a.xpReward} XP</span>}
                              </div>
                              <p className="mt-2.5 text-[13px] font-bold text-white">{a.name}</p>
                              <p className="mt-0.5 text-[11px] leading-snug text-[#9aa4b2]">{a.description}</p>
                            </div>
                          </Reveal>
                        );
                      })}
                    </div>
                  </div>
                </div>
                <h3 className="font-display mb-4 mt-10 text-lg font-bold text-white">XP history</h3>
                <div className="card divide-y divide-white/5">
                  {gam.transactions.map((t: any) => (
                    <div key={t.id} className="flex items-center gap-3 px-5 py-3">
                      <span className="badge grid h-7 w-7 place-items-center rounded-lg bg-[#7c5cff]/12 text-[10px] text-[#a78bff]"><Zap size={12} /></span>
                      <p className="flex-1 text-[13px] text-[#c8cfdd]">{t.note || t.reason}</p>
                      <span className="text-[11px] uppercase tracking-wider text-[#5b6577]">{t.reason}</span>
                      <span className="w-12 text-right font-display text-sm font-bold text-[#2fe3b5]">+{t.amount}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ------------------------------ CERTIFICATES ------------------------------ */}
            {tab === "certificates" && (
              <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
                {certs.length === 0 && (
                  <div className="col-span-full"><Empty title="No certificates yet" body="Attend an event and check in with your QR pass — a verifiable certificate is issued automatically." /></div>
                )}
                {certs.map((c, i) => (
                  <Reveal key={c.id} delay={i * 60}>
                    <div className="card card-hover flex h-full flex-col overflow-hidden">
                      <div className="relative border-b border-white/8 bg-gradient-to-br from-[#7c5cff]/25 via-[#101728] to-[#00d4ff]/15 p-5">
                        <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#a78bff]">Certificate of Participation</p>
                        <p className="font-display mt-2 line-clamp-2 text-lg font-bold text-white">{c.event?.title}</p>
                        <p className="mt-1.5 flex items-center gap-1.5 text-[11px] text-[#9aa4b2]"><CalendarDays size={11} /> {c.event ? formatLongDate(c.event.date) : ""}</p>
                      </div>
                      <div className="flex flex-1 flex-col gap-3 p-5">
                        <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-[#5b6577]">
                          <span>ID <b className="font-mono text-[#9aa4b2]">{c.id}</b></span>
                          <span>by <b className="text-[#9aa4b2]">{c.event?.organizer}</b></span>
                        </div>
                        <div className="mt-auto flex gap-2">
                          <button onClick={() => setCertSel(c)} className="btn btn-ghost flex-1 !py-2.5 text-xs">View</button>
                          <a href={`/certificates/${c.id}`} className="btn btn-primary flex-1 !py-2.5 text-xs"><Download size={13} /> PDF</a>
                          <button onClick={() => shareCert(c.id)} aria-label="Copy verification link" className="btn btn-ghost !px-3 !py-2.5"><Share2 size={13} /></button>
                        </div>
                      </div>
                    </div>
                  </Reveal>
                ))}
              </div>
            )}

            {/* ------------------------------ FAVORITES ------------------------------ */}
            {tab === "favorites" && (
              <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                {favs.length === 0 && (
                  <div className="col-span-full"><Empty title="Nothing saved yet" body="Tap the heart on any event card and it'll wait for you here."><Link href="/events" className="btn btn-primary mt-2 text-sm">Browse events</Link></Empty></div>
                )}
                {favs.map((e) => <EventCard key={e.id} event={e} />)}
              </div>
            )}

            {/* ------------------------------ MEMORIES ------------------------------ */}
            {tab === "memories" && (
              <div>
                {attended.length > 0 && (
                  <div className="mb-8">
                    <h3 className="font-display mb-4 text-lg font-bold text-white">Events you attended</h3>
                    <div className="flex flex-wrap gap-3">
                      {attended.map((r) => (
                        <Link key={r.id} href={`/events/${r.event?.id}`} className="chip !py-2"><CheckCircle2 size={13} className="text-[#2fe3b5]" /> {r.event?.title}</Link>
                      ))}
                    </div>
                  </div>
                )}
                {memories.length === 0 ? (
                  <Empty title="No memories captured yet" body="After you attend events, the photos organizers share will land here." />
                ) : (
                  <div className="columns-2 gap-4 space-y-4 md:columns-3">
                    {memories.map((m) => (
                      <figure key={m.id} className="card break-inside-avoid overflow-hidden !rounded-2xl">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={m.mediaUrl} alt={m.caption} loading="lazy" className="w-full object-cover" />
                        <figcaption className="p-3.5">
                          <p className="text-[11px] font-bold uppercase tracking-widest text-[#a78bff]">{m.eventTitle}</p>
                          <p className="mt-1 text-[12px] text-[#c8cfdd]">{m.caption}</p>
                        </figcaption>
                      </figure>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* ------------------------------ PROFILE ------------------------------ */}
            {tab === "profile" && (
              <div className="grid gap-8 lg:grid-cols-2">
                <div className="card p-6">
                  <h3 className="font-display mb-5 text-lg font-bold text-white">Profile</h3>
                  <div className="space-y-4">
                    <div>
                      <span className="label-xs">Name</span>
                      <p className="mt-1 text-sm font-semibold text-white">{user.name}</p>
                    </div>
                    <div>
                      <span className="label-xs">Email</span>
                      <p className="mt-1 text-sm text-[#c8cfdd]">{user.email}</p>
                    </div>
                    <div>
                      <span className="label-xs">Account type</span>
                      <p className="mt-1"><span className="chip !py-1 text-[11px]">{user.role}</span></p>
                    </div>
                    <div>
                      <span className="label-xs">Sign-in method</span>
                      <p className="mt-1 text-sm text-[#c8cfdd]">{user.authProvider === "google" ? "Google" : "Email + password"}</p>
                    </div>
                  </div>
                </div>
                <div className="card p-6">
                  <div className="mb-1 flex items-center justify-between">
                    <h3 className="font-display text-lg font-bold text-white">My interests</h3>
                    {savingProfile && <Loader2 size={14} className="animate-spin text-[#a78bff]" />}
                  </div>
                  <p className="mb-4 text-xs text-[#9aa4b2]">These power the “For You” engine and the AI assistant’s picks.</p>
                  <div className="flex flex-wrap gap-2">
                    {interests.map((i) => (
                      <button key={i.id} onClick={() => toggleInterest(i.id)} aria-pressed={myInterests.has(i.id)} className={cx("chip !py-2", myInterests.has(i.id) && "chip-active !text-white")}>
                        {myInterests.has(i.id) && <CheckCircle2 size={12} className="text-[#a78bff]" />}{i.name}
                      </button>
                    ))}
                  </div>
                  <Link href="/#foryou" className="btn btn-ghost mt-6 text-sm">See recommendations <ExternalLink size={13} /></Link>
                </div>
              </div>
            )}
          </div>
        )}
      </main>

      {/* certificate preview modal */}
      {certSel && (
        <div className="modal-veil fixed inset-0 z-[90] grid place-items-center bg-black/75 p-4 backdrop-blur-sm" onClick={() => setCertSel(null)} role="dialog" aria-modal="true" aria-label="Certificate preview">
          <div className="modal-card w-full max-w-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="ticket relative overflow-hidden !rounded-3xl p-8 md:p-12">
              <div className="absolute inset-x-0 top-0 h-1.5 bg-gradient-to-r from-[#7c5cff] via-[#00d4ff] to-[#ff5ca8]" />
              <div className="flex items-start justify-between">
                <span className="font-display text-lg font-bold text-white">EVENT<span className="gradient-text">SYNC</span></span>
                <button onClick={() => setCertSel(null)} aria-label="Close" className="grid h-9 w-9 place-items-center rounded-full border border-white/15 text-white transition-all hover:rotate-90"><X size={15} /></button>
              </div>
              <p className="mt-8 text-center text-[11px] font-bold uppercase tracking-[0.3em] text-[#a78bff]">Certificate of Participation</p>
              <p className="mt-6 text-center text-xs text-[#9aa4b2]">This certifies that</p>
              <p className="font-display mt-2 text-center text-3xl font-bold text-white">{user.name}</p>
              <p className="mt-3 text-center text-xs text-[#9aa4b2]">successfully attended</p>
              <p className="font-display mt-2 text-center text-xl font-bold gradient-text">{certSel.event?.title}</p>
              <p className="mt-3 text-center text-[11px] text-[#5b6577]">{certSel.event ? formatLongDate(certSel.event.date) : ""} · organized by {certSel.event?.organizer}</p>
              <div className="mt-8 flex items-center justify-between border-t border-white/8 pt-5">
                <p className="font-mono text-[10px] text-[#5b6577]">{certSel.id}</p>
                <Link href={`/verify/${certSel.id}`} className="flex items-center gap-1.5 text-xs font-bold text-[#00d4ff] hover:text-white">Verify <ExternalLink size={12} /></Link>
              </div>
            </div>
            <div className="mt-4 flex justify-center gap-3">
              <a href={`/certificates/${certSel.id}`} className="btn btn-primary text-sm"><Download size={14} /> Download PDF</a>
              <a href={`/verify/${certSel.id}`} className="btn btn-ghost text-sm"><ExternalLink size={14} /> Verify online</a>
              <button onClick={() => shareCert(certSel.id)} className="btn btn-ghost text-sm"><Share2 size={14} /> Copy verify link</button>
            </div>
          </div>
        </div>
      )}

      {passSel?.event && (
        <PassModal open={!!passSel} onClose={() => setPassSel(null)} event={passSel.event} holderName={user.name} qrToken={passSel.qrToken} status={passSel.status} />
      )}
      <Footer />
    </div>
  );
}

export default function DashboardPage() {
  return (
    <Suspense fallback={<div className="min-h-screen"><Navbar /><Spinner /></div>}>
      <DashboardInner />
    </Suspense>
  );
}
