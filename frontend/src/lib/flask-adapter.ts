/* Connects the EventSync UI to the Flask backend (backend/app.py) WITHOUT changing the backend.
   The UI calls api("/api/...") exactly as before; this file translates each call to the Flask
   endpoint and reshapes the response into what the UI expects. */

type R = { ok: boolean; data?: any; message?: string; error?: { code: string; message: string } };
const okR = (data: any, message?: string): R => ({ ok: true, data, message });
const errR = (code: string, message: string): R => ({ ok: false, error: { code, message } });

const TOKEN = "es_token";
const EMAIL = "es_email";
const LEVELS: [number, string][] = [[0, "Explorer"], [101, "Participant"], [301, "Enthusiast"], [701, "Community Builder"], [1500, "Event Master"]];
const CATEGORIES = [
  { id: 1, name: "Technology", slug: "technology", icon: "cpu", color: "#7C5CFF" },
  { id: 2, name: "Business", slug: "business", icon: "briefcase", color: "#00D4FF" },
  { id: 3, name: "Design", slug: "design", icon: "palette", color: "#FF5CA8" },
  { id: 4, name: "Cultural", slug: "cultural", icon: "music", color: "#A78BFA" },
  { id: 5, name: "Sports", slug: "sports", icon: "trophy", color: "#22D3A7" },
  { id: 6, name: "Workshops", slug: "workshops", icon: "wrench", color: "#F59E0B" },
  { id: 7, name: "Hackathons", slug: "hackathons", icon: "code", color: "#8B5CFF" },
  { id: 8, name: "Networking", slug: "networking", icon: "users", color: "#45C8FF" },
];
const slugify = (s: string) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
const catByName = (n: string) => CATEGORIES.find((c) => c.name.toLowerCase() === String(n || "").toLowerCase()) ?? { id: 99, name: n || "General", slug: slugify(n || "general"), icon: "sparkles", color: "#7C5CFF" };
const catBySlug = (s: string) => CATEGORIES.find((c) => c.slug === s);
const NOTE_TITLES: Record<string, string> = { REGISTRATION: "Registration confirmed", WAITLIST: "Waitlist update", CHECKIN: "Checked in", CERTIFICATE: "Certificate ready", ACHIEVEMENT: "XP earned", REMINDER: "Event reminder", EVENT_UPDATE: "Event updated", EVENT_CANCELLED: "Event cancelled" };

/* ---------------- tiny cache (cleared after every write) ---------------- */
let cache: Record<string, Promise<any>> = {};
let session: any = null;
const memo = <T,>(key: string, fn: () => Promise<T>): Promise<T> => (cache[key] ??= fn());
const hasToken = () => typeof window !== "undefined" && !!localStorage.getItem(TOKEN);

/* ---------------- low-level call to Flask (through the /flask proxy) ---------------- */
async function flask(path: string, method = "GET", body?: unknown): Promise<R> {
  try {
    const token = typeof window !== "undefined" ? localStorage.getItem(TOKEN) : null;
    const res = await fetch("/flask" + path, {
      method,
      headers: { ...(body !== undefined ? { "content-type": "application/json" } : {}), ...(token ? { Authorization: "Bearer " + token } : {}) },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    const json = await res.json().catch(() => null);
    // No JSON back means the request never reached Flask (the website's proxy failed): the backend is off, crashed on start, or BACKEND_URL is wrong.
    if (json === null && res.status >= 500) return errR("NETWORK", "The website can't reach the EventSync backend. Start it with: python app.py (port 8000), then try again.");
    if (!res.ok || json?.success === false) return errR(json?.error?.code ?? "HTTP_" + res.status, json?.error?.message ?? res.statusText);
    return okR(json?.data, json?.message);
  } catch {
    return errR("NETWORK", "Cannot reach the EventSync backend. Make sure it is running (python app.py).");
  }
}

/* ---------------- mappers: Flask shapes -> UI shapes ---------------- */
const mapLevel = (xp: number) => {
  let i = 0; LEVELS.forEach(([f], k) => { if (xp >= f) i = k; });
  const next = LEVELS[i + 1];
  return { level: i + 1, name: LEVELS[i][1], points: xp, nextAt: next ? next[0] : null, nextName: next ? next[1] : null, progress: next ? (xp - LEVELS[i][0]) / (next[0] - LEVELS[i][0]) : 1 };
};
const interestList = () => memo("interests", async () => {
  const r = await flask("/api/interests");
  return (r.ok ? (r.data as string[]) : []).map((name, i) => ({ id: i + 1, name, slug: slugify(name) }));
});
async function mapUser(u: any, unread = 0) {
  const all = await interestList();
  const mine = (u.interests ?? []).map((n: string) => all.find((i) => i.name === n)).filter(Boolean);
  return {
    id: String(u.id), name: u.name, email: u.email ?? localStorage.getItem(EMAIL) ?? "", avatarUrl: null, role: u.role, authProvider: "password",
    points: u.xp ?? 0, level: mapLevel(u.xp ?? 0), interests: mine, unreadNotifications: unread,
  };
}
const mapMemory = (m: any) => ({ id: String(m.id), mediaUrl: imgUrl(m.url), caption: m.caption ?? "", createdAt: m.created_at, eventId: String(m.event_id), eventTitle: m.event, eventDate: m.event_date, attended: !!m.attended });
const imgUrl = (u?: string) => (u && u.startsWith("/uploads/") ? "/flask" + u : u || "");
const hhmm = (d: Date) => `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;

function mapEvent(f: any, x: { favs?: Set<number>; pass?: any } = {}) {
  const start = new Date(f.start);
  const end = new Date(start.getTime() + 3 * 3600 * 1000);
  const now = Date.now();
  const seatsLeft = Math.max(f.capacity - f.attending, 0);
  const status = ["CANCELLED", "DRAFT", "PENDING_REVIEW", "REJECTED"].includes(f.status) ? f.status : now > end.getTime() ? "COMPLETED" : now >= start.getTime() ? "LIVE" : "PUBLISHED";
  const loggedIn = "registered" in f;
  return {
    id: String(f.id), title: f.title, description: f.description ?? "", requirements: "", bannerUrl: imgUrl(f.image),
    eventDate: String(f.start).slice(0, 10), startTime: String(f.start).slice(11, 16), endTime: hhmm(end),
    capacity: f.capacity, price: f.price ?? 0, mode: "in-person", status, rawStatus: f.status, views: 0,
    category: catByName(f.category),
    location: { id: String(f.id), venue: f.venue ?? "", address: f.venue ?? "", city: f.city ?? "", lat: f.lat ?? null, lng: f.lng ?? null },
    organizerName: f.organizer ?? "EventSync Organizer", organizerId: "", registeredCount: f.attending, seatsLeft, avgRating: f.avg_rating ?? null, ratingCount: f.rating_count ?? 0, createdAt: f.start,
    recommendReason: f.reason,
    viewer: loggedIn ? {
      registered: !!f.registered, registrationStatus: f.registered ? (f.checked_in ? "ATTENDED" : "REGISTERED") : null,
      registrationId: x.pass?.registration_id ?? null, qrToken: x.pass?.qr_token ?? null,
      favorited: !!x.favs?.has(f.id), waitlisted: f.waitlist_position != null, waitlistPosition: f.waitlist_position ?? null,
    } : null,
  };
}
const favSet = async (): Promise<Set<number>> => {
  if (!hasToken()) return new Set();
  const r = await memo("favs", () => flask("/api/users/favorites"));
  return new Set(r.ok ? (r.data as any[]).map((e) => e.id) : []);
};
const allEvents = () => memo("allEvents", async () => {
  const r = await flask("/api/events?limit=100&sort=upcoming");
  const favs = await favSet();
  return r.ok ? (Array.isArray(r.data?.items) ? r.data.items : []).map((f) => mapEvent(f, { favs })) : [];
});
const loadRazorpay = () => new Promise<void>((resolve, reject) => {
  if ((window as any).Razorpay) return resolve();
  const existing = document.querySelector<HTMLScriptElement>('script[data-eventsync-razorpay="true"]');
  if (existing) {
    existing.addEventListener("load", () => resolve(), { once: true });
    existing.addEventListener("error", () => reject(new Error("Razorpay Checkout script could not be loaded.")), { once: true });
    return;
  }
  const s = document.createElement("script");
  s.src = "https://checkout.razorpay.com/v1/checkout.js";
  s.async = true;
  s.dataset.eventsyncRazorpay = "true";
  s.onload = () => resolve();
  s.onerror = () => {
    s.remove();
    reject(new Error("Razorpay Checkout script could not be loaded. Check your internet connection or content blockers."));
  };
  document.body.appendChild(s);
});

/* ---------------- paid events: real Razorpay checkout ---------------- */
async function payAndRegister(id: string): Promise<R> {
  const order = await flask(`/api/events/${id}/payment/order`, "POST");
  if (!order.ok) return order;
  const o = order.data;
  try {
    await loadRazorpay();
  } catch (error) {
    return errR("PAYMENT_GATEWAY_ERROR", error instanceof Error ? error.message : "Could not load Razorpay Checkout. Please try again.");
  }
  if (!(window as any).Razorpay) return errR("PAYMENT_GATEWAY_ERROR", "Could not load Razorpay Checkout. Check your internet connection and try again.");
  return new Promise<R>((resolve) => {
    let settled = false;
    const done = (r: R) => { if (!settled) { settled = true; resolve(r); } };
    const rz = new (window as any).Razorpay({
      key: o.key_id, amount: o.amount, currency: o.currency, name: "EventSync", description: o.event, order_id: o.order_id,
      prefill: { name: o.name, email: o.email }, theme: { color: "#7C5CFF" },
      handler: async (r: any) => done(await flask("/api/payments/verify", "POST", { order_id: o.order_id, payment_id: r.razorpay_payment_id, signature: r.razorpay_signature })),
      modal: { ondismiss: () => done(errR("PAYMENT_CANCELLED", "Payment cancelled")) },
    });
    rz.on("payment.failed", (r: any) => done(errR("PAYMENT_FAILED", r?.error?.description || "Payment failed. You were not charged, please try again.")));
    rz.open();
  });
}

/* image upload (organizer builder) */
export async function uploadEventImage(file: File): Promise<R> {
  try {
    const fd = new FormData(); fd.append("file", file);
    const token = localStorage.getItem(TOKEN);
    const res = await fetch("/flask/api/uploads/event-image", { method: "POST", headers: token ? { Authorization: "Bearer " + token } : {}, body: fd });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || json.success === false) return errR(json?.error?.code ?? "HTTP_" + res.status, json?.error?.message ?? "Upload failed");
    return okR({ url: json.data.url, displayUrl: imgUrl(json.data.url) });
  } catch { return errR("NETWORK", "Cannot reach the EventSync backend."); }
}
/* organizer: add a photo to an event's memories */
export async function uploadMemory(eventId: string, file: File, caption: string): Promise<R> {
  try {
    const fd = new FormData(); fd.append("file", file); fd.append("caption", caption);
    const token = localStorage.getItem(TOKEN);
    const res = await fetch(`/flask/api/events/${eventId}/memories`, { method: "POST", headers: token ? { Authorization: "Bearer " + token } : {}, body: fd });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || json.success === false) return errR(json?.error?.code ?? "HTTP_" + res.status, json?.error?.message ?? "Upload failed");
    cache = {};
    return okR(mapMemory(json.data));
  } catch { return errR("NETWORK", "Cannot reach the EventSync backend."); }
}
const rawImage = (u: string) => (u || "").replace(/^\/flask(?=\/uploads\/)/, "");

async function eventPayload(body: any) {
  const all = await interestList();
  const tags = ((body.interestIds ?? []) as number[]).map((id) => all.find((i) => i.id === id)?.name).filter(Boolean).join(",");
  const out: any = {
    title: body.title, description: body.description ?? "", category: catBySlug(body.category)?.name ?? body.category, start: `${body.date}T${body.startTime}`,
    venue: body.venue ?? "", city: body.city ?? "", capacity: Number(body.capacity) || 100, price: Number(body.price) || 0,
    image: rawImage(body.bannerUrl ?? ""), status: body.status === "DRAFT" ? "DRAFT" : "PUBLISHED", schedule: body.schedule ?? [], speakers: body.speakers ?? [],
  };
  if (tags) out.tags = tags;
  return out;
}

/* accepts the raw token, the JSON that the QR contains ({"es":"pass","t":"..."}), or a link ending in the token */
function parseToken(raw: string) {
  const t = raw.trim();
  if (t.startsWith("{")) { try { const j = JSON.parse(t); if (j?.t) return String(j.t); } catch {} }
  const m = t.match(/[?&]t(?:oken)?=([A-Za-z0-9_\-]+)/) ?? t.match(/\/([A-Za-z0-9_\-]{16,})\/?$/);
  return m ? m[1] : t;
}

/* ---------------- the router ---------------- */
export async function handle(path: string, method = "GET", body?: any): Promise<R> {
  const url = new URL(path, "http://local");
  const p = url.pathname, q = url.searchParams;
  const write = method !== "GET";
  if (write) cache = {};
  let m: RegExpMatchArray | null;

  /* ----- auth ----- */
  const signIn = (r: R, email?: string) => {
    localStorage.setItem(TOKEN, r.data.token); if (email) localStorage.setItem(EMAIL, email); cache = {};
    return mapUser(r.data.user);
  };
  if (p === "/api/auth/login") {
    const r = await flask(p, "POST", body);
    if (!r.ok) return r;
    session = await signIn(r, r.data.user.email ?? body.email);
    return okR(session, r.message);
  }
  // signup step 1: backend emails a 6-digit code (no account yet)
  if (p === "/api/auth/register") {
    const r = await flask(p, "POST", { name: body.name, email: body.email, password: body.password });
    if (!r.ok) return r;
    return okR({ pending: true, email: String(body.email).trim().toLowerCase(), expiresIn: r.data.expires_in, resendIn: r.data.resend_in }, r.message);
  }
  if (p === "/api/auth/register/resend" || p === "/api/auth/forgot") {
    const r = await flask(p, "POST", { email: body.email });
    return r.ok ? okR({ email: String(body.email).trim().toLowerCase(), expiresIn: r.data.expires_in, resendIn: r.data.resend_in }, r.message) : r;
  }
  // signup step 2: right code creates the account and signs in
  if (p === "/api/auth/register/verify") {
    const r = await flask(p, "POST", { email: body.email, code: body.code });
    if (!r.ok) return r;
    session = await signIn(r, body.email);
    return okR(session, r.message);
  }
  if (p === "/api/auth/reset") return flask(p, "POST", { email: body.email, code: body.code, password: body.password });
  if (p === "/api/auth/google") {
    const r = await flask(p, "POST", { credential: body.credential });
    if (!r.ok) return r;
    session = await signIn(r, r.data.user.email);
    return okR(session, r.message);
  }
  if (p === "/api/auth/logout") { localStorage.removeItem(TOKEN); localStorage.removeItem(EMAIL); cache = {}; session = null; return okR({}); }
  if (p === "/api/auth/me") {
    if (!hasToken()) return okR(null);
    const r = await flask("/api/me");
    if (!r.ok) { localStorage.removeItem(TOKEN); session = null; return okR(null); }
    const n = await flask("/api/notifications");
    session = await mapUser(r.data, n.ok ? (n.data as any[]).filter((x) => !x.read).length : 0);
    return okR(session);
  }

  /* ----- meta / categories / interests ----- */
  if (p === "/api/categories") {
    const ev = await allEvents();
    return okR({ items: CATEGORIES.map((c) => ({ ...c, eventCount: ev.filter((e) => e.category.slug === c.slug && e.status !== "COMPLETED" && e.status !== "CANCELLED").length })) });
  }
  if (p === "/api/interests") return okR({ items: await interestList() });
  if (p === "/api/users/interests" && method === "PUT") {
    const all = await interestList();
    const names = (body.interestIds as number[]).map((id) => all.find((i) => i.id === id)?.name).filter(Boolean);
    const r = await flask("/api/users/interests", "PUT", { interests: names });
    return r.ok ? okR({ items: all.filter((i) => names.includes(i.name)) }) : r;
  }
  if (p === "/api/meta") {
    const ev = await allEvents(); const lb = await flask("/api/leaderboard");
    return okR({ upcoming: ev.filter((e) => e.status !== "COMPLETED").length, cities: new Set(ev.map((e) => e.location.city)).size, registrations: ev.reduce((s, e) => s + e.registeredCount, 0), members: lb.ok ? lb.data.length : 0, registered: ev.filter((e) => e.viewer?.registered).length, attended: ev.filter((e) => e.viewer?.registrationStatus === "ATTENDED").length });
  }
  if (p === "/api/community") return okR({ items: [] });
  if (p === "/api/memories") {
    const r = await flask("/api/memories"); if (!r.ok) return okR({ items: [] });
    return okR({ items: (r.data as any[]).map(mapMemory) });
  }
  if ((m = p.match(/^\/api\/memories\/(\d+)$/)) && method === "DELETE") return flask(p, "DELETE");

  /* ----- events ----- */
  if (p === "/api/events" && method === "GET") {
    const params = new URLSearchParams({ limit: "100", sort: q.get("sort") ?? "upcoming" });
    if (q.get("search")) params.set("search", q.get("search")!);
    const slug = q.get("category"); if (slug && slug !== "all") params.set("category", catBySlug(slug)?.name ?? slug);
    const r = await flask(`/api/events?${params}`);
    if (!r.ok) return r;
    const favs = await favSet();
    let items = (Array.isArray(r.data?.items) ? r.data.items : []).map((f) => mapEvent(f, { favs }));
    const st = q.get("status");
    if (st === "past") items = items.filter((e) => e.status === "COMPLETED");
    else if (st === "upcoming") items = items.filter((e) => e.status !== "COMPLETED" && e.status !== "CANCELLED");
    if (q.get("free") === "1") items = items.filter((e) => e.price === 0);
    const limit = Number(q.get("limit") ?? 12), page = Number(q.get("page") ?? 1), total = items.length;
    return okR({ items: items.slice((page - 1) * limit, page * limit), pagination: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)), hasMore: page * limit < total } });
  }
  if (p === "/api/events" && method === "POST") {
    const r = await flask("/api/events", "POST", await eventPayload(body));
    return r.ok ? okR(mapEvent(r.data), r.message ?? "Event submitted") : r;
  }
  if ((m = p.match(/^\/api\/events\/(\d+)$/))) {
    const id = m[1];
    if (method === "PATCH") { const r = await flask(`/api/events/${id}`, "PATCH", await eventPayload(body)); return r.ok ? okR(mapEvent(r.data), r.message) : r; }
    if (method === "DELETE") { const r = await flask(`/api/events/${id}`, "DELETE"); return r.ok ? okR(null, "Event cancelled") : r; }
    const r = await flask(`/api/events/${id}`);
    if (!r.ok) return r;
    const favs = await favSet();
    let pass: any = null;
    if (r.data.registered) { const pr = await flask(`/api/events/${id}/pass`); if (pr.ok) pass = pr.data; }
    const e: any = mapEvent(r.data, { favs, pass });
    const times: string[] = (r.data.schedule as string[][]).map((s) => s[0]);
    e.requirements = "";
    e.schedule = (r.data.schedule as string[][]).map(([t, title], i) => ({ id: `s${i}`, title, description: "", startTime: t, endTime: times[i + 1] ?? null, sortOrder: i }));
    e.speakers = (r.data.speakers as any[]).map((sp, i) => ({ id: `sp${i}`, name: sp.name, designation: sp.designation || "Speaker", bio: sp.bio || "", photoUrl: "" }));
    e.feedback = (r.data.reviews ?? []).map((v: any) => ({ id: String(v.id), rating: v.rating, comment: v.comment, createdAt: new Date().toISOString(), userName: v.user }));
    e.memories = (r.data.memories ?? []).map((x: any) => ({ id: String(x.id), mediaUrl: imgUrl(x.url), caption: x.caption })); e.myFeedback = r.data.my_review ? { id: String(r.data.my_review.id), rating: r.data.my_review.rating, comment: r.data.my_review.comment } : null; e.waitlistSize = r.data.waitlist_size ?? 0;
    e.related = (await allEvents()).filter((x) => x.id !== e.id && x.category?.slug === e.category?.slug).slice(0, 3);
    e.canManage = session?.role === "ADMIN" || session?.role === "ORGANIZER";
    return okR(e);
  }
  if ((m = p.match(/^\/api\/events\/(\d+)\/register$/))) {
    if (method === "DELETE") return flask(p, "DELETE");
    const r = await flask(p, "POST");
    if (!r.ok && r.error?.code === "PAYMENT_REQUIRED") { const paid = await payAndRegister(m[1]); cache = {}; return paid; }
    return r;
  }
  if (/^\/api\/events\/\d+\/(waitlist|favorite)$/.test(p)) return flask(p, method);
  if (/^\/api\/events\/\d+\/feedback$/.test(p)) return flask(p, "POST", body);

  if (p === "/api/recommendations") {
    const limit = Number(q.get("limit") ?? 6);
    if (hasToken()) {
      const r = await flask("/api/recommendations");
      if (r.ok) {
        const favs = await favSet();
        const items = (r.data as any[]).map((f) => mapEvent(f, { favs })).slice(0, limit);
        return okR({ items, personalized: true });
      }
    }
    const all = (await allEvents()).filter((e) => e.status !== "COMPLETED" && e.status !== "CANCELLED");
    const items = [...all].sort((a, b) => b.registeredCount - a.registeredCount).slice(0, limit).map((e) => ({ ...e, recommendReason: "Trending" }));
    return okR({ items, personalized: false });
  }

  /* ----- me: registrations, favorites, gamification, certificates ----- */
  if (p === "/api/users/registrations") {
    const mine = (await allEvents()).filter((e) => e.viewer?.registered);
    const passes = await Promise.all(mine.map((e) => flask(`/api/events/${e.id}/pass`)));
    return okR({ items: mine.map((e, i) => {
      const pass = passes[i].ok ? passes[i].data : null;
      return { id: pass?.registration_id ?? `r${e.id}`, status: e.viewer!.registrationStatus, qrToken: pass?.qr_token ?? "", createdAt: e.createdAt, event: { ...e, viewer: { ...e.viewer, qrToken: pass?.qr_token ?? null, registrationId: pass?.registration_id ?? null } } };
    }) });
  }
  if (p === "/api/users/favorites") {
    const r = await flask(p); if (!r.ok) return r;
    return okR({ items: (r.data as any[]).map((f) => mapEvent(f, { favs: new Set([f.id]) })) });
  }
  if (p === "/api/users/gamification") {
    const [me, ev, notes, certs] = await Promise.all([flask("/api/me"), allEvents(), flask("/api/notifications"), flask("/api/certificates")]);
    if (!me.ok) return me;
    const mine = ev.filter((e) => e.viewer?.registered);
    const attendedEv = mine.filter((e) => e.viewer?.registrationStatus === "ATTENDED");
    const attended = attendedEv.length;
    const cats = new Set(attendedEv.map((e) => e.category.slug)).size;
    const rules = [
      { slug: "first-event", name: "First Event", description: "Attend your very first event", icon: "flag", xpReward: 25, ok: attended >= 1 },
      { slug: "events-5", name: "Regular", description: "Attend 5 events", icon: "flame", xpReward: 100, ok: attended >= 5 },
      { slug: "events-10", name: "Veteran", description: "Attend 10 events", icon: "medal", xpReward: 250, ok: attended >= 10 },
      { slug: "tech-explorer", name: "Tech Explorer", description: "Attend events across 3 categories", icon: "compass", xpReward: 80, ok: cats >= 3 },
      { slug: "joiner", name: "Joiner", description: "Register for 3 events", icon: "users", xpReward: 40, ok: mine.length >= 3 },
    ];
    const transactions = (notes.ok ? (notes.data as any[]) : []).filter((n) => n.type === "ACHIEVEMENT").map((n) => {
      const mm = String(n.message).match(/earned (\d+) XP \((.*)\)/);
      return { id: String(n.id), amount: mm ? Number(mm[1]) : 0, reason: "xp", note: mm ? mm[2] : n.message, createdAt: n.created_at };
    });
    return okR({
      points: me.data.xp, level: mapLevel(me.data.xp), transactions,
      stats: { registered: mine.length, attended, upcoming: mine.filter((e) => e.viewer?.registrationStatus === "REGISTERED" && e.status !== "COMPLETED").length, certificates: certs.ok ? certs.data.length : 0 },
      achievements: rules.map((r) => ({ ...r, unlockedAt: r.ok ? new Date().toISOString() : null })),
    });
  }
  if (p === "/api/certificates") {
    const r = await flask(p); if (!r.ok) return r;
    return okR({ items: (r.data as any[]).map((c) => ({ id: c.id, issuedAt: c.date, participant: c.participant, event: { id: String(c.event_id), title: c.event, date: c.date, organizer: c.organizer ?? "EventSync" } })) });
  }
  if ((m = p.match(/^\/api\/certificates\/verify\/(.+)$/))) {
    const r = await flask(p); if (!r.ok) return r;
    const d = r.data;
    return okR(d.valid
      ? { valid: true, message: "This certificate is authentic and was issued through EventSync.", certificateId: m[1], participant: d.participant, event: d.event, eventDate: d.date, issuedAt: d.date, organizer: d.organizer }
      : { valid: false, message: "No certificate was found with this ID." });
  }

  /* ----- leaderboard / notifications / assistant ----- */
  if (p === "/api/leaderboard") {
    const r = await flask("/api/leaderboard"); if (!r.ok) return r;
    const limit = Number(q.get("limit") ?? 10);
    const items = (r.data as any[]).filter((x) => x.xp > 0).slice(0, limit).map((x) => ({ id: String(x.id ?? x.rank), rank: x.rank, name: x.name, xp: x.xp, level: x.title, attended: 0, isMe: !!session && String(x.id) === String(session.id) }));
    return okR({ items, me: items.find((x) => x.isMe) ?? null });
  }
  if (p === "/api/notifications" && method === "GET") {
    if (!hasToken()) return okR({ items: [], unread: 0 });
    const r = await flask("/api/notifications"); if (!r.ok) return r;
    const limit = Number(q.get("limit") ?? 12);
    const all = (r.data as any[]).map((n) => ({ id: String(n.id), type: n.type, title: NOTE_TITLES[n.type] ?? "EventSync", body: n.message, read: n.read, link: null, createdAt: n.created_at }));
    return okR({ items: all.slice(0, limit), unread: all.filter((n) => !n.read).length });
  }
  if (p.startsWith("/api/notifications/")) return flask(p, method);
  if (p === "/api/ai/chat") {
    const r = await flask(p, "POST", body); if (!r.ok) return r;
    const favs = await favSet();
    return okR({ reply: r.data.reply, events: (r.data.events as any[]).map((f) => { const e = mapEvent(f, { favs }); return { id: e.id, title: e.title, date: e.eventDate, time: e.startTime, venue: e.location.venue, city: e.location.city, category: e.category.name, seatsLeft: e.seatsLeft }; }) });
  }

  /* ----- organizer & admin ----- */
  if (p === "/api/organizer/events") {
    const r = await flask(p); if (!r.ok) return r;
    return okR({ items: (r.data as any[]).map((f) => mapEvent(f)) });
  }
  if ((m = p.match(/^\/api\/admin\/users\/(\d+)\/role$/))) return flask(p, "PATCH", { role: body.role });
  if ((m = p.match(/^\/api\/organizer\/events\/(\d+)\/analytics$/))) {
    const r = await flask(p); if (!r.ok) return r;
    const a = r.data;
    return okR({ registrations: a.registrations, attendance: a.attendance, checkInRate: a.checkin_pct, capacityUsage: a.capacity_usage, waitlistSize: a.waitlist, avgRating: a.avg_rating ?? 0, feedbackCount: a.feedback_count, xpEarned: a.xp_earned, timeSeries: a.series ?? [], ratingDistribution: a.rating_distribution ?? [], cancellations: a.cancellations ?? 0, views: 0 });
  }
  if (/^\/api\/organizer\/events\/\d+\/attendees$/.test(p)) {
    const r = await flask(p); if (!r.ok) return r;
    return okR({ items: (r.data as any[]).map((a) => ({ registrationId: a.registration_id, name: a.name, email: a.email, status: a.status === "CHECKED_IN" ? "ATTENDED" : a.status, registeredAt: a.registered_at, checkedInAt: a.checked_in_at })) });
  }
  if (p === "/api/checkin") {
    const r = await flask("/api/checkin", "POST", { qr_token: parseToken(String(body.token ?? "")) });
    return r.ok ? okR({ attendee: { name: r.data.participant }, event: r.data.event }, r.message) : r;
  }
  if (p === "/api/admin/events/pending" && method === "GET") {
    const r = await flask(p);
    return r.ok ? okR({ items: (Array.isArray(r.data) ? r.data : []).map((f: any) => mapEvent(f)) }) : r;
  }
  const moderationMatch = p.match(/^\/api\/admin\/events\/(\d+)\/decision$/);
  if (moderationMatch && method === "PATCH") {
    const r = await flask(p, "PATCH", body);
    if (r.ok) cache = {};
    return r.ok ? okR(mapEvent(r.data), r.message) : r;
  }
  if (p === "/api/admin/analytics") {
    const r = await flask(p); if (!r.ok) return r;
    const a = r.data; const ev = await allEvents();
    return okR({
      totals: { total_users: a.users, active_events: a.active, total_registrations: a.registrations, total_attendance: a.attendance, completed_events: a.completed, avg_rating: a.avg_rating ?? 0 },
      popularCategories: (a.popular_categories as any[]).map((c) => ({ name: c.category, color: catByName(c.category).color, events: c.count, registrations: ev.filter((e) => e.category.name === c.category).reduce((s, e) => s + e.registeredCount, 0) })),
      topEvents: [...ev].sort((x, y) => y.registeredCount - x.registeredCount).slice(0, 5).map((e) => ({ id: e.id, title: e.title, registrations: e.registeredCount })),
      registrationTrend: a.registration_trend ?? [], recentUsers: (a.recent_users ?? []).map((u: any) => ({ id: String(u.id), name: u.name, email: u.email, role: u.role, createdAt: u.joined })),
    });
  }

  return errR("NOT_SUPPORTED", "This feature isn't available on the current backend.");
}
