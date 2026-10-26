"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Activity, CalendarDays, Shield, Sparkles, Star, TrendingUp, Users, Zap } from "lucide-react";
import { api, cx } from "@/lib/client";
import { useAuth, useToast } from "@/components/providers";
import { AnimatedNumber, Avatar, Empty, Reveal, Spinner } from "@/components/ui";
import { Footer, Navbar } from "@/components/chrome";

export default function AdminPage() {
  const { user, loading } = useAuth();
  const { toast } = useToast();
  const [data, setData] = useState<any>(null);
  const [busy, setBusy] = useState(true);
  const [pendingEvents, setPendingEvents] = useState<any[]>([]);
  const [reviewingId, setReviewingId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");

  useEffect(() => {
    if (user?.role === "ADMIN") {
      Promise.all([api("/api/admin/analytics"), api("/api/admin/events/pending")]).then(([analytics, pending]) => {
        if (analytics.ok) setData(analytics.data);
        if (pending.ok) setPendingEvents(pending.data?.items ?? []);
        setBusy(false);
      });
    } else if (!loading) setBusy(false);
  }, [user, loading]);

  const changeRole = async (id: string, role: string) => {
    const r = await api(`/api/admin/users/${id}/role`, { method: "PATCH", body: { role } });
    if (r.ok) {
      setData((d: any) => ({ ...d, recentUsers: d.recentUsers.map((u: any) => (u.id === id ? { ...u, role } : u)) }));
      toast({ title: "Role updated", kind: "success" });
    } else toast({ title: r.error?.message ?? "Couldn't change the role", kind: "error" });
  };

  const decideEvent = async (id: string, action: "accept" | "reject") => {
    setReviewingId(id);
    const r = await api(`/api/admin/events/${id}/decision`, {
      method: "PATCH",
      body: { action, reason: action === "reject" ? rejectReason.trim() : "" },
    });
    setReviewingId(null);
    if (r.ok) {
      setPendingEvents((items) => items.filter((event) => String(event.id) !== String(id)));
      setRejectReason("");
      toast({ title: action === "accept" ? "Event approved and published" : "Event rejected", kind: "success" });
      const refreshed = await api("/api/admin/analytics");
      if (refreshed.ok) setData(refreshed.data);
    } else {
      toast({ title: r.error?.message ?? "Couldn't update event approval", kind: "error" });
    }
  };

  if (loading || busy) return <div className="min-h-screen"><Navbar /><Spinner label="Loading console…" /></div>;

  if (user?.role !== "ADMIN") {
    return (
      <div className="min-h-screen"><Navbar />
        <main className="mx-auto max-w-2xl px-6 pt-40">
          <Empty title="Admin only" body="This console is restricted to platform administrators (demo: admin@eventsync.dev / demo1234).">
            <Link href="/login" className="btn btn-primary mt-2 text-sm">Sign in as admin</Link>
          </Empty>
        </main>
        <Footer />
      </div>
    );
  }

  const t = data?.totals ?? {};
  const trend = data?.registrationTrend ?? [];
  const maxT = Math.max(1, ...trend.map((x: any) => x.registrations));
  const cats = data?.popularCategories ?? [];
  const totalCatReg = Math.max(1, cats.reduce((a: number, c: any) => a + c.registrations, 0));

  return (
    <div className="min-h-screen">
      <Navbar />
      <main className="mx-auto max-w-7xl px-6 pb-24 pt-32 lg:px-8">
        <Reveal>
          <p className="label-xs mb-2 flex items-center gap-2 text-[#ffc35c]"><Shield size={13} /> Admin console</p>
          <h1 className="font-display text-4xl font-bold tracking-tight text-white">Platform <span className="gradient-text">pulse.</span></h1>
        </Reveal>

        <section className="mt-8 card overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/6 px-6 py-5">
            <div>
              <h2 className="font-display text-lg font-bold text-white">Event approval queue</h2>
              <p className="mt-1 text-xs text-[#8d98aa]">Review organizer submissions before they appear publicly.</p>
            </div>
            <span className="rounded-full bg-[#ffc35c]/15 px-3 py-1 text-xs font-bold text-[#ffc35c]">{pendingEvents.length} awaiting review</span>
          </div>
          {pendingEvents.length === 0 ? (
            <div className="px-6 py-10 text-center">
              <p className="text-sm font-semibold text-white">No pending event submissions</p>
              <p className="mt-1 text-xs text-[#8d98aa]">New organizer submissions will appear here.</p>
            </div>
          ) : (
            <div className="divide-y divide-white/5">
              {pendingEvents.map((event) => (
                <article key={event.id} className="grid gap-4 px-6 py-5 lg:grid-cols-[1fr_auto] lg:items-center">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-semibold text-white">{event.title}</h3>
                      <span className="rounded-full bg-[#ffc35c]/10 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-[#ffc35c]">Pending</span>
                    </div>
                    <p className="mt-1 text-xs text-[#8d98aa]">{event.category?.name ?? event.category ?? "Event"} · {event.eventDate ?? "Date not set"} · {event.location?.venue ?? "Venue not set"}, {event.location?.city ?? ""}</p>
                    <p className="mt-2 line-clamp-2 text-sm text-[#c8cfdd]">{event.description}</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <button disabled={reviewingId === String(event.id)} onClick={() => decideEvent(String(event.id), "accept")} className="btn btn-primary text-xs disabled:opacity-50">
                      {reviewingId === String(event.id) ? "Saving…" : "Accept & publish"}
                    </button>
                    <button disabled={reviewingId === String(event.id)} onClick={() => decideEvent(String(event.id), "reject")} className="btn btn-ghost border border-rose-400/30 text-xs text-rose-300 disabled:opacity-50">
                      Reject
                    </button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>

        <div className="mt-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
          {[
            { label: "Total users", value: t.total_users, icon: Users, color: "text-white" },
            { label: "Active events", value: t.active_events, icon: CalendarDays, color: "text-[#00d4ff]" },
            { label: "Registrations", value: t.total_registrations, icon: TrendingUp, color: "text-[#a78bff]" },
            { label: "Attendance", value: t.total_attendance, icon: Activity, color: "text-[#2fe3b5]" },
            { label: "Completed events", value: t.completed_events, icon: CalendarDays, color: "text-white" },
            { label: "Avg event rating", value: t.avg_rating, icon: Star, color: "text-[#ffc35c]", float: true },
          ].map((s, i) => (
            <Reveal key={s.label} delay={i * 40}>
              <div className="card card-hover p-5">
                <p className="label-xs flex items-center gap-1.5"><s.icon size={11} className={s.color} /> {s.label}</p>
                <p className={cx("font-display mt-2 text-3xl font-bold", s.color)}>
                  {s.float ? s.value : <AnimatedNumber value={s.value ?? 0} />}
                </p>
              </div>
            </Reveal>
          ))}
        </div>

        <div className="mt-6 grid gap-6 lg:grid-cols-[1.6fr_1fr]">
          <Reveal>
            <div className="card p-6">
              <h2 className="font-display mb-4 text-base font-bold text-white">Platform registrations — last 30 days</h2>
              <div className="flex h-48 items-end gap-[3px]">
                {trend.map((d: any, i: number) => (
                  <div key={d.day} className="group relative flex-1">
                    <div className="bar-anim w-full rounded-t-sm bg-gradient-to-t from-[#00d4ff]/35 to-[#00d4ff]" style={{ height: `${Math.max(3, (d.registrations / maxT) * 100)}%`, animationDelay: `${i * 20}ms` }} />
                    <span className="pointer-events-none absolute -top-7 left-1/2 -translate-x-1/2 whitespace-nowrap rounded bg-black/85 px-1.5 py-0.5 text-[9px] font-bold text-white opacity-0 group-hover:opacity-100">{d.registrations} · {d.day.slice(5)}</span>
                  </div>
                ))}
              </div>
              <div className="mt-2 flex justify-between text-[9px] text-[#5b6577]"><span>30 days ago</span><span>today</span></div>
            </div>
          </Reveal>
          <Reveal delay={80}>
            <div className="card p-6">
              <h2 className="font-display mb-5 text-base font-bold text-white">Popular categories</h2>
              <div className="space-y-4">
                {cats.map((c: any, i: number) => (
                  <div key={c.name}>
                    <div className="mb-1.5 flex justify-between text-xs"><span className="font-semibold text-[#c8cfdd]">{c.name}</span><span className="text-[#5b6577]">{c.registrations} regs · {c.events} events</span></div>
                    <div className="h-2.5 overflow-hidden rounded-full bg-white/6">
                      <div className="bar-anim h-full rounded-full" style={{ width: `${(c.registrations / totalCatReg) * 100}%`, background: c.color, animationDelay: `${i * 80}ms` }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </Reveal>
        </div>

        <div className="mt-6 grid gap-6 lg:grid-cols-2">
          <Reveal>
            <div className="card overflow-hidden">
              <p className="label-xs border-b border-white/6 px-6 py-4">Newest members (change roles here)</p>
              <div className="divide-y divide-white/5">
                {(data?.recentUsers ?? []).map((u: any) => (
                  <div key={u.email} className="flex items-center gap-3 px-6 py-3">
                    <Avatar name={u.name} size={32} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-white">{u.name}</p>
                      <p className="truncate text-[11px] text-[#5b6577]">{u.email}</p>
                    </div>
                    {u.id === user?.id ? (
                      <span className="rounded-full bg-[#ffc35c]/15 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-[#ffc35c]">{u.role} (you)</span>
                    ) : (
                      <select aria-label={`Role for ${u.name}`} value={u.role} onChange={(e) => changeRole(u.id, e.target.value)} className="rounded-lg border border-white/10 bg-white/[0.04] px-2 py-1 text-[11px] font-bold text-white">
                        <option value="USER">Attendee</option><option value="ORGANIZER">Organizer</option><option value="ADMIN">Admin</option>
                      </select>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </Reveal>
          <Reveal delay={80}>
            <div className="card overflow-hidden">
              <p className="label-xs border-b border-white/6 px-6 py-4">Top events by registrations</p>
              <div className="divide-y divide-white/5">
                {(data?.topEvents ?? []).map((e: any, i: number) => (
                  <Link key={e.id} href={`/events/${e.id}`} className="flex items-center gap-4 px-6 py-3.5 transition-colors hover:bg-white/[0.03]">
                    <span className="font-display w-6 text-sm font-bold text-[#5b6577]">{String(i + 1).padStart(2, "0")}</span>
                    <p className="min-w-0 flex-1 truncate text-sm font-semibold text-white">{e.title}</p>
                    <span className="flex items-center gap-1.5 text-sm font-bold text-[#00d4ff]"><Users size={13} /> {e.registrations}</span>
                  </Link>
                ))}
              </div>
            </div>
          </Reveal>
        </div>

        <Reveal className="mt-6">
          <div className="card flex flex-wrap items-center justify-between gap-4 border-[#ffc35c]/25 p-5">
            <p className="flex items-center gap-2.5 text-sm text-[#c8cfdd]"><Sparkles size={15} className="text-[#ffc35c]" /> All numbers are computed live in SQL — nothing is mocked anywhere in this app.</p>
            <Link href="/organizer" className="btn btn-ghost text-sm">Open organizer studio</Link>
          </div>
        </Reveal>
      </main>
      <Footer />
    </div>
  );
}
