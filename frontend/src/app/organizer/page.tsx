"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import {
  BarChart3, CalendarDays, Camera, CheckCircle2, ChevronDown, Clock, Edit3, Hourglass, Loader2, LucideIcon,
  MapPin, Pencil, Plus, ScanLine, Star, Trash2, TrendingUp, Users, X, XCircle, Zap,
} from "lucide-react";
import { api, cx, uploadEventImage, uploadMemory, formatDate, formatTime, type Category, type EventItem, type Interest } from "@/lib/client";
import { useAuth, useToast } from "@/components/providers";
import { AnimatedNumber, Avatar, Empty, Reveal, Spinner, StatusPill, Stars } from "@/components/ui";
import { Footer, Navbar } from "@/components/chrome";
import { QrScanner } from "@/components/qr-scanner";

type MyEvent = EventItem & { waitlistSize: number };

const OTABS: { id: string; label: string; icon: LucideIcon }[] = [
  { id: "events", label: "My Events", icon: CalendarDays },
  { id: "analytics", label: "Analytics", icon: BarChart3 },
  { id: "checkin", label: "Check-in Console", icon: ScanLine },
  { id: "builder", label: "Event Builder", icon: Plus },
];

/* ============================ builder ============================ */

function Builder({
  cats, interests, editing, onSaved, onCancelEdit, toast,
}: { cats: Category[]; interests: Interest[]; editing: any | null; onSaved: () => void; onCancelEdit: () => void; toast: any }) {
  const [form, setForm] = useState({
    title: "", description: "", category: "technology", date: "", startTime: "10:00", endTime: "16:00",
    venue: "", city: "", capacity: 100, price: 0, bannerUrl: "", requirements: "", mode: "in-person" as string,
  });
  const [schedule, setSchedule] = useState<{ title: string; startTime: string; endTime: string }[]>([{ title: "Registration & coffee", startTime: "10:00", endTime: "10:30" }]);
  const [speakers, setSpeakers] = useState<{ name: string; designation: string; bio: string }[]>([]);
  const [interestIds, setInterestIds] = useState<Set<number>>(new Set());
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [photos, setPhotos] = useState<{ id: string; mediaUrl: string; caption: string }[]>([]);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [photoCaption, setPhotoCaption] = useState("");
  const isEdit = !!editing;
  const isDraft = isEdit && editing.rawStatus === "DRAFT";

  useEffect(() => {
    if (editing) {
      setForm({
        title: editing.title ?? "", description: editing.description ?? "", category: editing.category?.slug ?? "technology",
        date: editing.eventDate ?? "", startTime: editing.startTime?.slice(0, 5) ?? "10:00", endTime: editing.endTime?.slice(0, 5) ?? "16:00",
        venue: editing.location?.venue ?? "", city: editing.location?.city ?? "", capacity: editing.capacity ?? 100,
        price: editing.price ?? 0, bannerUrl: editing.bannerUrl ?? "", requirements: editing.requirements ?? "", mode: editing.mode ?? "in-person",
      });
      setSchedule(
        (editing.schedule ?? []).map((s: any) => ({ title: s.title, startTime: s.startTime?.slice(0, 5), endTime: s.endTime?.slice(0, 5) ?? "" }))
      );
      setSpeakers((editing.speakers ?? []).map((s: any) => ({ name: s.name, designation: s.designation, bio: s.bio })));
    }
  }, [editing]);

  useEffect(() => { setPhotos(editing?.memories ?? []); }, [editing]);

  const set = (k: string, v: any) => setForm((f) => ({ ...f, [k]: v }));

  const save = async (status: "DRAFT" | "PUBLISHED") => {
    if (busy) return;
    setBusy(true);
    const payload = { ...form, schedule, speakers, interestIds: [...interestIds], status };
    const res = isEdit
      ? await api(`/api/events/${editing.id}`, { method: "PATCH", body: payload })
      : await api("/api/events", { method: "POST", body: payload });
    setBusy(false);
    if (res.ok) {
      toast({ title: status === "DRAFT" ? "Draft saved" : isEdit ? "Event updated & live" : "Event published!", kind: "success" });
      onSaved();
    } else {
      toast({ title: res.error?.message ?? "Couldn't save event", kind: "error" });
    }
  };

  const preview = {
    id: editing?.id ?? "preview",
    title: form.title || "Your event title",
    eventDate: form.date || new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10),
    startTime: form.startTime,
    endTime: form.endTime,
    capacity: Number(form.capacity) || 100,
    price: Number(form.price) || 0,
    registeredCount: editing?.registeredCount ?? 0,
    seatsLeft: (Number(form.capacity) || 100) - (editing?.registeredCount ?? 0),
    bannerUrl: form.bannerUrl,
    status: "PUBLISHED",
    rawStatus: "PUBLISHED",
    category: cats.find((c) => c.slug === form.category) ?? null,
    location: form.venue || form.city ? { id: "x", venue: form.venue || "Venue", address: "", city: form.city || "City", lat: null, lng: null } : null,
    organizerName: "You",
  } as unknown as EventItem;

  return (
    <div className="grid gap-8 xl:grid-cols-[1.15fr_0.85fr]">
      <div className="space-y-6">
        {isEdit && (
          <div className="flex items-center justify-between rounded-2xl border border-[#f5a623]/30 bg-[#f5a623]/8 px-5 py-3.5">
            <p className="text-sm font-semibold text-[#ffc35c]">Editing “{editing.title}”</p>
            <button onClick={onCancelEdit} className="text-xs font-bold text-[#9aa4b2] hover:text-white">Cancel edit</button>
          </div>
        )}
        {/* core fields */}
        <div className="card space-y-5 p-6">
          <h3 className="font-display flex items-center gap-2 text-lg font-bold text-white"><Edit3 size={16} className="text-[#a78bff]" /> Essentials</h3>
          <div>
            <label className="label-xs mb-1.5 block">Event title</label>
            <input value={form.title} onChange={(e) => set("title", e.target.value)} placeholder="AI Innovation Hackathon 2026" className="input" maxLength={140} />
          </div>
          <div>
            <label className="label-xs mb-1.5 block">Description</label>
            <textarea value={form.description} onChange={(e) => set("description", e.target.value)} rows={4} placeholder="What makes this unmissable?" className="input resize-none" />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="label-xs mb-1.5 block">Category</label>
              <div className="relative">
                <select value={form.category} onChange={(e) => set("category", e.target.value)} className="input appearance-none cursor-pointer !pr-9">
                  {cats.map((c) => <option key={c.id} value={c.slug}>{c.name}</option>)}
                </select>
                <ChevronDown size={14} className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-[#5b6577]" />
              </div>
            </div>
            <div>
              <label className="label-xs mb-1.5 block">Format</label>
              <div className="flex gap-2">
                {["in-person", "online"].map((m) => (
                  <button key={m} type="button" onClick={() => set("mode", m)} className={cx("chip flex-1 justify-center !py-2.5 capitalize", form.mode === m && "chip-active !text-white")}>{m}</button>
                ))}
              </div>
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <label className="label-xs mb-1.5 block">Date</label>
              <input type="date" value={form.date} onChange={(e) => set("date", e.target.value)} className="input" />
            </div>
            <div>
              <label className="label-xs mb-1.5 block">Starts</label>
              <input type="time" value={form.startTime} onChange={(e) => set("startTime", e.target.value)} className="input" />
            </div>
            <div>
              <label className="label-xs mb-1.5 block">Ends</label>
              <input type="time" value={form.endTime} onChange={(e) => set("endTime", e.target.value)} className="input" />
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="label-xs mb-1.5 block">Venue</label>
              <input value={form.venue} onChange={(e) => set("venue", e.target.value)} placeholder="T-Hub Innovation Campus" className="input" />
            </div>
            <div>
              <label className="label-xs mb-1.5 block">City</label>
              <input value={form.city} onChange={(e) => set("city", e.target.value)} placeholder="Hyderabad" className="input" />
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="label-xs mb-1.5 block">Capacity</label>
              <input type="number" min={1} value={form.capacity} onChange={(e) => set("capacity", e.target.value)} className="input" />
            </div>
            <div>
              <label className="label-xs mb-1.5 block">Price (₹, 0 = free)</label>
              <input type="number" min={0} value={form.price} onChange={(e) => set("price", e.target.value)} className="input" />
            </div>
          </div>
          <div>
            <label className="label-xs mb-1.5 block">Banner image (optional, a default picture is used if empty)</label>
            <div className="flex flex-wrap items-center gap-3">
              <label className="btn btn-ghost cursor-pointer !px-4 !py-2.5 text-xs">
                {uploading ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />} {uploading ? "Uploading…" : "Upload image"}
                <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" className="hidden" disabled={uploading} onChange={async (e) => {
                  const f = e.target.files?.[0]; e.target.value = "";
                  if (!f) return;
                  if (f.size > 4 * 1024 * 1024) { toast({ title: "Image must be 4 MB or smaller", kind: "error" }); return; }
                  setUploading(true);
                  const r = await uploadEventImage(f);
                  setUploading(false);
                  if (r.ok) set("bannerUrl", r.data.displayUrl); else toast({ title: r.error?.message ?? "Upload failed", kind: "error" });
                }} />
              </label>
              {form.bannerUrl && <button type="button" onClick={() => set("bannerUrl", "")} className="text-xs font-bold text-[#9aa4b2] hover:text-white">Remove</button>}
            </div>
            <input value={form.bannerUrl} onChange={(e) => set("bannerUrl", e.target.value)} placeholder="…or paste an https:// image link" className="input mt-3" />
            <div className="mt-2 flex flex-wrap gap-1.5">
              {["ai-hackathon", "web-workshop", "ml-workshop", "design-meetup", "startup-summit", "music-fest", "robotics-expo", "gaming-arena", "cloud-conf", "cybersecurity-night", "marathon"].map((n) => (
                <button key={n} type="button" onClick={() => set("bannerUrl", `/images/events/${n}.jpg`)} className={cx("chip !px-2.5 !py-1 text-[10px]", form.bannerUrl.endsWith(`${n}.jpg`) && "chip-active !text-white")}>{n}</button>
              ))}
            </div>
          </div>
          <div>
            <label className="label-xs mb-1.5 block">Requirements (optional)</label>
            <input value={form.requirements} onChange={(e) => set("requirements", e.target.value)} placeholder="Laptop, ID card…" className="input" />
          </div>
          <div>
            <label className="label-xs mb-1.5 block">Matched interests (powers recommendations)</label>
            <div className="flex flex-wrap gap-2">
              {interests.map((i) => (
                <button key={i.id} type="button" onClick={() => setInterestIds((s) => { const n = new Set(s); n.has(i.id) ? n.delete(i.id) : n.add(i.id); return n; })} className={cx("chip !py-1.5 text-[11px]", interestIds.has(i.id) && "chip-active !text-white")}>
                  {i.name}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* schedule */}
        <div className="card space-y-4 p-6">
          <div className="flex items-center justify-between">
            <h3 className="font-display flex items-center gap-2 text-lg font-bold text-white"><Clock size={16} className="text-[#00d4ff]" /> Schedule</h3>
            <button onClick={() => setSchedule((s) => [...s, { title: "", startTime: "12:00", endTime: "" }])} className="chip !py-1.5 text-xs"><Plus size={12} /> Add slot</button>
          </div>
          {schedule.map((s, i) => (
            <div key={i} className="flex flex-wrap items-center gap-2">
              <input type="time" value={s.startTime} onChange={(e) => setSchedule((arr) => arr.map((x, k) => k === i ? { ...x, startTime: e.target.value } : x))} className="input !w-28" aria-label="Start time" />
              <input value={s.title} onChange={(e) => setSchedule((arr) => arr.map((x, k) => k === i ? { ...x, title: e.target.value } : x))} placeholder="Keynote: The future of…" className="input flex-1" aria-label="Session title" />
              <button onClick={() => setSchedule((arr) => arr.filter((_, k) => k !== i))} aria-label="Remove slot" className="grid h-10 w-10 place-items-center rounded-xl border border-white/10 text-[#5b6577] hover:text-[#ff8fa8]"><X size={14} /></button>
            </div>
          ))}
        </div>

        {/* speakers */}
        <div className="card space-y-4 p-6">
          <div className="flex items-center justify-between">
            <h3 className="font-display flex items-center gap-2 text-lg font-bold text-white"><Users size={16} className="text-[#ff5ca8]" /> Speakers</h3>
            <button onClick={() => setSpeakers((s) => [...s, { name: "", designation: "", bio: "" }])} className="chip !py-1.5 text-xs"><Plus size={12} /> Add speaker</button>
          </div>
          {speakers.length === 0 && <p className="text-sm text-[#5b6577]">No speakers yet — add your headliners.</p>}
          {speakers.map((s, i) => (
            <div key={i} className="flex flex-wrap gap-2 rounded-2xl border border-white/6 bg-white/[0.02] p-3">
              <input value={s.name} onChange={(e) => setSpeakers((arr) => arr.map((x, k) => k === i ? { ...x, name: e.target.value } : x))} placeholder="Name" className="input !w-40" aria-label="Speaker name" />
              <input value={s.designation} onChange={(e) => setSpeakers((arr) => arr.map((x, k) => k === i ? { ...x, designation: e.target.value } : x))} placeholder="Role — e.g. CTO, Acme" className="input flex-1" aria-label="Speaker designation" />
              <button onClick={() => setSpeakers((arr) => arr.filter((_, k) => k !== i))} aria-label="Remove speaker" className="grid h-10 w-10 place-items-center rounded-xl border border-white/10 text-[#5b6577] hover:text-[#ff8fa8]"><X size={14} /></button>
              <input value={s.bio} onChange={(e) => setSpeakers((arr) => arr.map((x, k) => k === i ? { ...x, bio: e.target.value } : x))} placeholder="One-line bio (optional)" className="input w-full" aria-label="Speaker bio" />
            </div>
          ))}
        </div>

        {isEdit && (
          <div className="card space-y-4 p-6">
            <div>
              <p className="label-xs">Event photos (shown in the Memories gallery)</p>
              <p className="mt-1 text-xs text-[#9aa4b2]">Upload photos during or after the event. Attendees see them on their dashboard.</p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <input value={photoCaption} onChange={(e) => setPhotoCaption(e.target.value)} placeholder="Caption (optional)" maxLength={300} className="input min-w-0 flex-1" aria-label="Photo caption" />
              <label className="btn btn-ghost cursor-pointer !px-4 !py-2.5 text-xs">
                {photoBusy ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />} {photoBusy ? "Uploading…" : "Add photo"}
                <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" className="hidden" disabled={photoBusy} onChange={async (e) => {
                  const f = e.target.files?.[0]; e.target.value = "";
                  if (!f) return;
                  if (f.size > 4 * 1024 * 1024) { toast({ title: "Image must be 4 MB or smaller", kind: "error" }); return; }
                  setPhotoBusy(true);
                  const r = await uploadMemory(editing.id, f, photoCaption);
                  setPhotoBusy(false);
                  if (r.ok) { setPhotos((p) => [{ id: r.data.id, mediaUrl: r.data.mediaUrl, caption: r.data.caption }, ...p]); setPhotoCaption(""); toast({ title: "Photo added", kind: "success" }); }
                  else toast({ title: r.error?.message ?? "Upload failed", kind: "error" });
                }} />
              </label>
            </div>
            {photos.length > 0 && (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {photos.map((ph) => (
                  <figure key={ph.id} className="group relative overflow-hidden rounded-xl border border-white/8">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={ph.mediaUrl} alt={ph.caption || "Event photo"} className="h-28 w-full object-cover" />
                    <button type="button" aria-label="Remove photo" onClick={async () => {
                      const r = await api(`/api/memories/${ph.id}`, { method: "DELETE" });
                      if (r.ok) setPhotos((p) => p.filter((x) => x.id !== ph.id)); else toast({ title: r.error?.message ?? "Couldn't remove photo", kind: "error" });
                    }} className="absolute right-1.5 top-1.5 grid h-7 w-7 place-items-center rounded-full bg-black/70 text-white hover:bg-[#ff6b8b]"><X size={13} /></button>
                  </figure>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="sticky bottom-4 z-20 flex flex-wrap gap-3">
          {isDraft ? (
            <>
              <button onClick={() => save("PUBLISHED")} disabled={busy || !form.title || !form.date} className="btn btn-primary flex-1 !py-3.5">
                {busy ? <Loader2 size={15} className="animate-spin" /> : <Zap size={15} />} Publish event
              </button>
              <button onClick={() => save("DRAFT")} disabled={busy || !form.title || !form.date} className="btn btn-ghost !py-3.5">Save draft</button>
            </>
          ) : (
            <button onClick={() => save("PUBLISHED")} disabled={busy || !form.title || !form.date} className="btn btn-primary flex-1 !py-3.5">
              {busy ? <Loader2 size={15} className="animate-spin" /> : <Zap size={15} />} {isEdit ? "Save changes" : "Publish event"}
            </button>
          )}
          {!isEdit && (
            <button onClick={() => save("DRAFT")} disabled={busy || !form.title || !form.date} className="btn btn-ghost !py-3.5">Save as draft</button>
          )}
        </div>
      </div>

      {/* live preview */}
      <div className="xl:sticky xl:top-24 xl:self-start">
        <p className="label-xs mb-3 flex items-center gap-2"><span className="live-dot !bg-[#7c5cff]" /> Live preview</p>
        <div className="card overflow-hidden !border-[#7c5cff]/30">
          <div className="relative h-44">
            {preview.bannerUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={preview.bannerUrl} alt="Banner preview" className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-[#7c5cff]/30 to-[#0d1220]"><Camera size={30} className="text-white/25" /></div>
            )}
            <div className="absolute inset-x-3 top-3 flex justify-between"><StatusPill status="PUBLISHED" /></div>
          </div>
          <div className="space-y-3.5 p-5">
            <span className="rounded-lg px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.14em]" style={{ color: preview.category?.color ?? "#a78bff", background: `${preview.category?.color ?? "#a78bff"}1e` }}>
              {preview.category?.name ?? "Category"}
            </span>
            <h4 className="font-display text-lg font-bold leading-snug text-white">{preview.title}</h4>
            <div className="space-y-1.5 text-[13px] text-[#9aa4b2]">
              <p className="flex items-center gap-2"><CalendarDays size={13} className="text-[#7c5cff]" /> {formatDate(preview.eventDate).month} {formatDate(preview.eventDate).day} · {formatTime(preview.startTime)} — {formatTime(preview.endTime)}</p>
              <p className="flex items-center gap-2"><MapPin size={13} className="text-[#ff5ca8]" /> {form.mode === "online" ? "Online" : `${preview.location?.venue}${form.city ? `, ${form.city}` : ""}`}</p>
              <p className="flex items-center gap-2"><Users size={13} className="text-[#00d4ff]" /> {Number(form.capacity).toLocaleString()} capacity · {Number(form.price) === 0 ? "Free" : `₹${Number(form.price).toLocaleString()}`}</p>
            </div>
            <p className="line-clamp-3 border-t border-white/6 pt-3 text-[13px] leading-relaxed text-[#9aa4b2]">{form.description || "Description preview appears here as you type…"}</p>
            {schedule.filter((s) => s.title).length > 0 && (
              <div className="border-t border-white/6 pt-3">
                <p className="label-xs mb-2">Agenda preview</p>
                {schedule.filter((s) => s.title).slice(0, 4).map((s, i) => (
                  <p key={i} className="flex gap-2 text-[12px] text-[#c8cfdd]"><span className="font-mono text-[#a78bff]">{s.startTime}</span> {s.title}</p>
                ))}
              </div>
            )}
            {speakers.filter((s) => s.name).length > 0 && (
              <div className="flex items-center gap-2 border-t border-white/6 pt-3">
                <span className="flex -space-x-2">{speakers.filter((s) => s.name).slice(0, 4).map((s, i) => <Avatar key={i} name={s.name} size={26} className="ring-2 ring-[#101728]" />)}</span>
                <p className="text-[11px] text-[#9aa4b2]">{speakers.filter((s) => s.name).length} speaker{speakers.filter((s) => s.name).length > 1 ? "s" : ""}</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ============================ main ============================ */

function OrganizerInner() {
  const params = useSearchParams();
  const router = useRouter();
  const { user, loading } = useAuth();
  const { toast } = useToast();
  const [tab, setTab] = useState(params.get("create") === "1" ? "builder" : params.get("tab") ?? "events");
  const [events, setEvents] = useState<MyEvent[]>([]);
  const [cats, setCats] = useState<Category[]>([]);
  const [interests, setInterests] = useState<Interest[]>([]);
  const [busy, setBusy] = useState(true);
  const [analyticsFor, setAnalyticsFor] = useState<string>("");
  const [analytics, setAnalytics] = useState<any>(null);
  const [analyticsBusy, setAnalyticsBusy] = useState(false);
  const [attendees, setAttendees] = useState<any[]>([]);
  const [checkinFor, setCheckinFor] = useState<string>("");
  const [token, setToken] = useState("");
  const [checkinLog, setCheckinLog] = useState<{ ok: boolean; msg: string; at: number }[]>([]);
  const [checkinBusy, setCheckinBusy] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [editing, setEditing] = useState<any | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const canHost = user && (user.role === "ORGANIZER" || user.role === "ADMIN");

  const load = useCallback(async () => {
    setBusy(true);
    const [ev, c, i] = await Promise.all([api("/api/organizer/events"), api("/api/categories"), api("/api/interests")]);
    if (ev.ok) {
      setEvents(ev.data.items);
      if (!analyticsFor && ev.data.items.length) {
        setAnalyticsFor(ev.data.items[0].id);
        setCheckinFor(ev.data.items[0].id);
      }
    }
    if (c.ok) setCats(c.data.items);
    if (i.ok) setInterests(i.data.items);
    setBusy(false);
  }, [analyticsFor]);

  useEffect(() => {
    if (!loading && !canHost) return;
    if (canHost) load();
  }, [canHost, loading, load]);

  useEffect(() => {
    const editId = params.get("edit");
    if (editId && events.length) {
      const ev = events.find((e) => e.id === editId);
      if (ev) {
        api(`/api/events/${editId}`).then((r) => {
          if (r.ok) { setEditing(r.data); setTab("builder"); }
        });
      }
    }
  }, [params, events]);

  useEffect(() => {
    if (!analyticsFor) return;
    setAnalyticsBusy(true);
    Promise.all([api(`/api/organizer/events/${analyticsFor}/analytics`), api(`/api/organizer/events/${analyticsFor}/attendees`)]).then(([a, at]) => {
      if (a.ok) setAnalytics(a.data);
      if (at.ok) setAttendees(at.data.items);
      setAnalyticsBusy(false);
    });
  }, [analyticsFor]);

  const checkIn = async (raw: string) => {
    const tok = raw.trim();
    if (!tok || checkinBusy) return;
    setCheckinBusy(true);
    const res = await api("/api/checkin", { method: "POST", body: { token: tok, eventId: checkinFor } });
    setCheckinBusy(false);
    if (res.ok) {
      setCheckinLog((l) => [{ ok: true, msg: `✓ ${res.data.attendee?.name ?? "Attendee"} checked in · +50 XP`, at: Date.now() }, ...l.slice(0, 9)]);
      setToken("");
      api(`/api/organizer/events/${analyticsFor || checkinFor}/attendees`).then((at) => at.ok && setAttendees(at.data.items));
    } else {
      setCheckinLog((l) => [{ ok: false, msg: `✕ ${res.error?.message ?? "Invalid pass"}`, at: Date.now() }, ...l.slice(0, 9)]);
    }
  };
  const doCheckin = (e: React.FormEvent) => { e.preventDefault(); checkIn(token); };
  const onScan = useCallback((text: string) => { checkIn(text); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [checkinFor, checkinBusy, analyticsFor]);

  const deleteEvent = async (id: string) => {
    setDeletingId(id);
    const res = await api(`/api/events/${id}`, { method: "DELETE" });
    setDeletingId(null);
    if (res.ok) {
      toast({ title: res.message ?? "Event removed", kind: "info" });
      await load();
    } else toast({ title: res.error?.message ?? "Couldn't delete", kind: "error" });
  };

  if (loading) return <div className="min-h-screen"><Navbar /><Spinner /></div>;

  if (!user || !canHost) {
    return (
      <div className="min-h-screen"><Navbar />
        <main className="mx-auto max-w-2xl px-6 pt-40">
          <Empty title="Organizer access required" body="This studio is for organizers. Sign in with an organizer account (demo: organizer@eventsync.dev / demo1234) or register as an organizer.">
            <div className="flex gap-3">
              <Link href="/login" className="btn btn-primary mt-2 text-sm">Organizer login</Link>
              <Link href="/register?role=ORGANIZER" className="btn btn-ghost mt-2 text-sm">Become an organizer</Link>
            </div>
          </Empty>
        </main>
        <Footer />
      </div>
    );
  }

  const analyticsEvent = events.find((e) => e.id === analyticsFor);
  const maxReg = Math.max(1, ...(analytics?.timeSeries ?? []).map((t: any) => t.registrations));

  return (
    <div className="min-h-screen">
      <Navbar />
      <main className="mx-auto max-w-7xl px-6 pb-24 pt-32 lg:px-8">
        <Reveal>
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="label-xs mb-2 flex items-center gap-2 text-[#a78bff]"><span className="h-1.5 w-1.5 rounded-full bg-[#7c5cff]" /> Organizer Studio</p>
              <h1 className="font-display text-4xl font-bold tracking-tight text-white">Host. Scan. <span className="gradient-text">Measure.</span></h1>
            </div>
            <button onClick={() => { setEditing(null); setTab("builder"); }} className="btn btn-primary"><Plus size={16} /> New event</button>
          </div>
        </Reveal>

        <div className="no-bar mt-7 flex gap-2 overflow-x-auto border-b border-white/6">
          {OTABS.map((t) => (
            <button key={t.id} onClick={() => { setTab(t.id); if (t.id === "builder") setEditing(null); }} aria-pressed={tab === t.id}
              className={cx("relative flex shrink-0 items-center gap-2 px-4 py-3 text-sm font-semibold transition-colors", tab === t.id ? "text-white" : "text-[#5b6577] hover:text-[#c8cfdd]")}>
              <t.icon size={15} className={tab === t.id ? "text-[#a78bff]" : ""} /> {t.label}
              {tab === t.id && <span className="absolute inset-x-2 bottom-0 h-[2.5px] rounded-full bg-gradient-to-r from-[#7c5cff] to-[#00d4ff]" />}
            </button>
          ))}
        </div>

        <div className="mt-8">
          {busy ? <Spinner /> : (
            <>
              {/* ---------------- EVENTS LIST ---------------- */}
              {tab === "events" && (
                <div className="grid gap-4">
                  {events.length === 0 && <Empty title="No events yet" body="Create your first event — it takes about a minute with the live builder."><button onClick={() => setTab("builder")} className="btn btn-primary mt-2 text-sm"><Plus size={14} /> Create event</button></Empty>}
                  {events.map((e, i) => {
                    const d = formatDate(e.eventDate);
                    return (
                      <Reveal key={e.id} delay={i * 50}>
                        <div className="card card-hover flex flex-wrap items-center gap-4 p-4 md:p-5">
                          {e.bannerUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={e.bannerUrl} alt="" className="h-20 w-32 rounded-xl object-cover" />
                          ) : <div className="grid h-20 w-32 place-items-center rounded-xl bg-[#7c5cff]/15"><Camera size={20} className="text-[#a78bff]" /></div>}
                          <div className="min-w-56 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <StatusPill status={e.rawStatus === "DRAFT" ? "DRAFT" : e.status} />
                              <span className="text-[11px] text-[#5b6577]">{d.weekday}, {d.month} {d.day} · {formatTime(e.startTime)}</span>
                              {e.waitlistSize > 0 && <span className="flex items-center gap-1 text-[11px] font-bold text-[#ffc35c]"><Hourglass size={10} /> {e.waitlistSize} waiting</span>}
                            </div>
                            <Link href={`/events/${e.id}`} className="mt-1 block truncate font-display text-lg font-bold text-white hover:text-[#c9baff]">{e.title}</Link>
                            <p className="mt-0.5 text-xs text-[#9aa4b2]">{e.location ? `${e.location.venue}, ${e.location.city}` : "Online"}</p>
                          </div>
                          <div className="flex items-center gap-6 pr-2">
                            {[["Registrations", e.registeredCount, "text-white"], ["Capacity used", `${e.capacity ? Math.round((e.registeredCount / e.capacity) * 100) : 0}%`, "text-[#00d4ff]"], ["Rating", e.avgRating ? `★ ${e.avgRating}` : "—", "text-[#ffc35c]"]].map(([l, v, c]) => (
                              <div key={l as string} className="hidden text-center sm:block">
                                <p className={cx("font-display text-lg font-bold", c as string)}>{v as string}</p>
                                <p className="text-[9px] font-bold uppercase tracking-widest text-[#5b6577]">{l}</p>
                              </div>
                            ))}
                          </div>
                          <div className="flex gap-2">
                            <button onClick={() => { setAnalyticsFor(e.id); setTab("analytics"); }} className="btn btn-ghost !px-3.5 !py-2.5 text-xs"><BarChart3 size={13} /> Stats</button>
                            <button onClick={() => api(`/api/events/${e.id}`).then((r) => { if (r.ok) { setEditing(r.data); setTab("builder"); } })} className="btn btn-ghost !px-3.5 !py-2.5 text-xs"><Pencil size={13} /> Edit</button>
                            <button onClick={() => deleteEvent(e.id)} disabled={deletingId === e.id} aria-label="Delete or cancel event" className="grid h-9 w-9 place-items-center rounded-xl border border-[#ff6b8b]/25 text-[#ff8fa8] transition-all hover:bg-[#ff6b8b]/10">
                              {deletingId === e.id ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
                            </button>
                          </div>
                        </div>
                      </Reveal>
                    );
                  })}
                </div>
              )}

              {/* ---------------- ANALYTICS ---------------- */}
              {tab === "analytics" && (
                <div>
                  {events.length === 0 ? <Empty title="Nothing to measure yet" body="Publish an event and registrations will start flowing in." /> : (
                    <>
                      <div className="mb-6 flex flex-wrap gap-2">
                        {events.map((e) => (
                          <button key={e.id} onClick={() => setAnalyticsFor(e.id)} className={cx("chip !py-2", analyticsFor === e.id && "chip-active !text-white")}>{e.title.slice(0, 28)}{e.title.length > 28 ? "…" : ""}</button>
                        ))}
                      </div>
                      {analyticsBusy || !analytics ? <Spinner label="Crunching numbers…" /> : (
                        <div className="space-y-6">
                          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
                            {[
                              { label: "Registrations", value: analytics.registrations, sub: `${analytics.capacityUsage}% of capacity`, color: "text-white" },
                              { label: "Checked in", value: analytics.attendance, sub: `${analytics.checkInRate}% check-in rate`, color: "text-[#2fe3b5]" },
                              { label: "Avg rating", value: analytics.avgRating, sub: `${analytics.feedbackCount} reviews`, color: "text-[#ffc35c]", float: true },
                              { label: "XP earned by attendees", value: analytics.xpEarned, sub: `${analytics.waitlistSize} on waitlist`, color: "text-[#a78bff]" },
                            ].map((s) => (
                              <Reveal key={s.label}>
                                <div className="card p-5">
                                  <p className="label-xs">{s.label}</p>
                                  <p className={cx("font-display mt-2 text-3xl font-bold", s.color)}>
                                    {s.float ? s.value : <AnimatedNumber value={s.value} />}
                                  </p>
                                  <p className="mt-1 text-[11px] text-[#5b6577]">{s.sub}</p>
                                </div>
                              </Reveal>
                            ))}
                          </div>

                          <div className="grid gap-6 lg:grid-cols-[1.6fr_1fr]">
                            {/* registrations trend */}
                            <div className="card p-6">
                              <div className="mb-4 flex items-center justify-between">
                                <h3 className="font-display flex items-center gap-2 text-base font-bold text-white"><TrendingUp size={15} className="text-[#00d4ff]" /> Registrations — last 30 days</h3>
                                <span className="text-[11px] text-[#5b6577]">{analyticsEvent?.title.slice(0, 30)}</span>
                              </div>
                              <div className="flex h-44 items-end gap-[3px]">
                                {(analytics.timeSeries ?? []).map((t: any, i: number) => (
                                  <div key={i} className="group relative flex-1">
                                    <div
                                      className="bar-anim w-full rounded-t-sm bg-gradient-to-t from-[#7c5cff]/45 to-[#7c5cff] transition-colors group-hover:from-[#00d4ff]/60 group-hover:to-[#00d4ff]"
                                      style={{ height: `${Math.max(3, (t.registrations / maxReg) * 100)}%`, animationDelay: `${i * 22}ms` }}
                                    />
                                    <span className="pointer-events-none absolute -top-7 left-1/2 -translate-x-1/2 whitespace-nowrap rounded bg-black/85 px-1.5 py-0.5 text-[9px] font-bold text-white opacity-0 group-hover:opacity-100">
                                      {t.registrations} · {t.day.slice(5)}
                                    </span>
                                  </div>
                                ))}
                              </div>
                              <div className="mt-2 flex justify-between text-[9px] text-[#5b6577]"><span>30 days ago</span><span>today</span></div>
                            </div>

                            {/* rating distribution + attendees */}
                            <div className="card p-6">
                              <h3 className="font-display mb-4 flex items-center gap-2 text-base font-bold text-white"><Star size={15} className="text-[#ffc35c]" /> Rating distribution</h3>
                              {[5, 4, 3, 2, 1].map((r, i) => {
                                const count = analytics.ratingDistribution?.find((x: any) => x.rating === r)?.count ?? 0;
                                const maxC = Math.max(1, ...(analytics.ratingDistribution ?? []).map((x: any) => x.count));
                                return (
                                  <div key={r} className="mb-2.5 flex items-center gap-3 text-xs">
                                    <span className="flex w-10 items-center gap-1 text-[#9aa4b2]">{r} <Star size={10} fill="#ffc35c" stroke="none" /></span>
                                    <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-white/6">
                                      <div className="bar-anim h-full rounded-full bg-gradient-to-r from-[#ffc35c] to-[#ff5ca8]" style={{ width: `${(count / maxC) * 100}%`, animationDelay: `${i * 60}ms` }} />
                                    </div>
                                    <span className="w-6 text-right text-[#5b6577]">{count}</span>
                                  </div>
                                );
                              })}
                              <p className="mt-4 border-t border-white/6 pt-4 text-xs text-[#9aa4b2]">
                                Capacity usage: <b className="text-white">{analytics.capacityUsage}%</b> · Cancellations: <b className="text-[#ff8fa8]">{analytics.cancellations}</b> · Views: <b className="text-white">{analytics.views}</b>
                              </p>
                            </div>
                          </div>

                          {/* attendees table */}
                          <div className="card overflow-hidden">
                            <div className="flex items-center justify-between border-b border-white/6 px-6 py-4">
                              <h3 className="font-display text-base font-bold text-white">Attendee roster</h3>
                              <span className="text-xs text-[#5b6577]">{attendees.length} rows</span>
                            </div>
                            <div className="max-h-80 overflow-y-auto">
                              <table className="w-full text-left text-[13px]">
                                <thead className="sticky top-0 bg-[#101728] text-[10px] uppercase tracking-widest text-[#5b6577]">
                                  <tr><th className="px-6 py-3">Attendee</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Registered</th><th className="px-4 py-3">Checked in</th></tr>
                                </thead>
                                <tbody className="divide-y divide-white/5">
                                  {attendees.map((a) => (
                                    <tr key={a.registrationId} className="transition-colors hover:bg-white/[0.025]">
                                      <td className="px-6 py-3">
                                        <span className="flex items-center gap-2.5"><Avatar name={a.name} size={26} /><span><span className="block font-semibold text-white">{a.name}</span>{a.email && <span className="block text-[10px] text-[#5b6577]">{a.email}</span>}</span></span>
                                      </td>
                                      <td className="px-4 py-3">
                                        <span className={cx("rounded-full px-2 py-0.5 text-[10px] font-bold", a.status === "ATTENDED" ? "bg-[#22d3a7]/15 text-[#2fe3b5]" : a.status === "CANCELLED" ? "bg-[#ff6b8b]/10 text-[#ff8fa8]" : "bg-[#7c5cff]/15 text-[#a78bff]")}>{a.status}</span>
                                      </td>
                                      <td className="px-4 py-3 text-[#9aa4b2]">{new Date(a.registeredAt).toLocaleDateString()}</td>
                                      <td className="px-4 py-3 text-[#9aa4b2]">{a.checkedInAt ? new Date(a.checkedInAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "—"}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}

              {/* ---------------- CHECK-IN ---------------- */}
              {tab === "checkin" && (
                <div className="mx-auto max-w-xl">
                  {events.length === 0 ? <Empty title="No events to check into" body="Create and publish an event first." /> : (
                    <div className="card overflow-hidden">
                      <div className="border-b border-white/8 bg-gradient-to-r from-[#22d3a7]/12 to-[#00d4ff]/8 p-6 text-center">
                        <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-[#22d3a7]/15 text-[#2fe3b5]"><ScanLine size={24} /></span>
                        <h3 className="font-display mt-3 text-xl font-bold text-white">QR Check-in Console</h3>
                        <p className="mt-1 text-sm text-[#9aa4b2]">Scan a pass or paste its token — we verify, check in, award XP & issue the certificate instantly.</p>
                      </div>
                      <div className="space-y-4 p-6">
                        <div>
                          <label className="label-xs mb-1.5 block">Checking into</label>
                          <div className="relative">
                            <select value={checkinFor} onChange={(e) => setCheckinFor(e.target.value)} className="input appearance-none cursor-pointer !pr-9">
                              {events.map((e) => <option key={e.id} value={e.id}>{e.title}</option>)}
                            </select>
                            <ChevronDown size={14} className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-[#5b6577]" />
                          </div>
                        </div>
                        <form onSubmit={doCheckin} className="flex gap-2">
                          <input value={token} onChange={(e) => setToken(e.target.value)} placeholder="Pass token — from the attendee's QR" className="input font-mono text-sm" aria-label="Pass token" />
                          <button type="submit" disabled={checkinBusy || !token.trim()} className="btn btn-cyan shrink-0">{checkinBusy ? <Loader2 size={15} className="animate-spin" /> : "Check in"}</button>
                        </form>
                        {scanning ? <QrScanner onScan={onScan} onClose={() => setScanning(false)} /> : (
                          <button type="button" onClick={() => setScanning(true)} className="btn btn-ghost w-full !py-3"><ScanLine size={15} /> Scan with camera</button>
                        )}
                        <p className="text-[11px] text-[#5b6577]">Point the camera at the QR on the attendee&apos;s pass (on their phone or in the ticket email). No camera? Paste the pass token above.</p>
                        <div className="space-y-2">
                          {checkinLog.map((l) => (
                            <p key={l.at} className={cx("flex items-center gap-2 rounded-xl border px-4 py-3 text-[13px] font-semibold", l.ok ? "border-[#22d3a7]/25 bg-[#22d3a7]/8 text-[#2fe3b5]" : "border-[#ff6b8b]/25 bg-[#ff6b8b]/8 text-[#ff8fa8]")}>
                              {l.ok ? <CheckCircle2 size={14} /> : <XCircle size={14} />} {l.msg}
                            </p>
                          ))}
                          {checkinLog.length === 0 && <p className="py-4 text-center text-sm text-[#5b6577]">Scan results will appear here.</p>}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* ---------------- BUILDER ---------------- */}
              {tab === "builder" && (
                <Builder
                  cats={cats}
                  interests={interests}
                  editing={editing}
                  toast={toast}
                  onCancelEdit={() => { setEditing(null); setTab("events"); }}
                  onSaved={async () => { setEditing(null); await load(); setTab("events"); }}
                />
              )}
            </>
          )}
        </div>
      </main>
      <Footer />
    </div>
  );
}

export default function OrganizerPage() {
  return (
    <Suspense fallback={<div className="min-h-screen"><Navbar /><Spinner /></div>}>
      <OrganizerInner />
    </Suspense>
  );
}
