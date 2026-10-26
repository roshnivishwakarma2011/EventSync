"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { CalendarRange, ChevronDown, Filter, RefreshCw, Search, SlidersHorizontal, X } from "lucide-react";
import { api, cx, type Category, type EventItem } from "@/lib/client";
import { EventCard } from "@/components/event-card";
import { Footer, Navbar } from "@/components/chrome";
import { Empty, Reveal, Spinner } from "@/components/ui";

const SORTS = [
  { id: "trending", label: "Trending" },
  { id: "upcoming", label: "Upcoming" },
  { id: "popular", label: "Most Popular" },
  { id: "rating", label: "Top Rated" },
  { id: "recent", label: "Recently Added" },
];

function ExplorerInner() {
  const params = useSearchParams();
  const router = useRouter();
  const [events, setEvents] = useState<EventItem[]>([]);
  const [cats, setCats] = useState<Category[]>([]);
  const [meta, setMeta] = useState<{ total: number; hasMore: boolean }>({ total: 0, hasMore: false });
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState(params.get("search") ?? "");
  const [debounced, setDebounced] = useState(search);
  const [category, setCategory] = useState(params.get("category") ?? "all");
  const [sort, setSort] = useState(params.get("sort") ?? "upcoming");
  const [freeOnly, setFreeOnly] = useState(params.get("free") === "1");
  const [past, setPast] = useState(false);
  const deb = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    api("/api/categories").then((r) => r.ok && setCats(r.data.items));
  }, []);

  useEffect(() => {
    clearTimeout(deb.current);
    deb.current = setTimeout(() => setDebounced(search), 380);
    return () => clearTimeout(deb.current);
  }, [search]);

  const buildQuery = useCallback(
    (p: number) => {
      const q = new URLSearchParams();
      if (debounced.trim()) q.set("search", debounced.trim());
      if (category !== "all") q.set("category", category);
      q.set("sort", sort);
      q.set("status", past ? "past" : "upcoming");
      if (freeOnly) q.set("free", "1");
      q.set("page", String(p));
      q.set("limit", "9");
      return q.toString();
    },
    [debounced, category, sort, freeOnly, past]
  );

  const load = useCallback(
    async (p: number, append = false) => {
      append ? setLoadingMore(true) : setLoading(true);
      const res = await api(`/api/events?${buildQuery(p)}`);
      if (res.ok) {
        setEvents((prev) => (append ? [...prev, ...res.data.items] : res.data.items));
        setMeta(res.data.pagination);
        setPage(p);
      }
      setLoading(false);
      setLoadingMore(false);
    },
    [buildQuery]
  );

  useEffect(() => {
    load(1);
  }, [load]);

  const activeFilters = [category !== "all", freeOnly, past, !!debounced].filter(Boolean).length;

  return (
    <div className="min-h-screen">
      <Navbar />
      <main className="mx-auto max-w-7xl px-6 pb-24 pt-32 lg:px-8">
        <Reveal>
          <p className="label-xs mb-2 flex items-center gap-2 text-[#a78bff]"><span className="h-1.5 w-1.5 rounded-full bg-[#7c5cff]" /> Explorer</p>
          <h1 className="font-display text-4xl font-bold tracking-tight text-white md:text-5xl">
            Every experience, <span className="gradient-text">one search away.</span>
          </h1>
        </Reveal>

        {/* search + controls */}
        <Reveal delay={80}>
          <div className="glass sticky top-[74px] z-30 mt-8 flex flex-col gap-3 rounded-2xl border-white/10 p-3 md:flex-row md:items-center">
            <form onSubmit={(e) => { e.preventDefault(); load(1); }} className="relative flex-1">
              <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-[#5b6577]" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search events, speakers, venues…"
                className="input !border-transparent !bg-transparent !pl-11"
                aria-label="Search events"
              />
              {search && (
                <button type="button" aria-label="Clear search" onClick={() => setSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-[#5b6577] hover:text-white">
                  <X size={15} />
                </button>
              )}
            </form>
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative">
                <SlidersHorizontal size={14} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[#5b6577]" />
                <select value={sort} onChange={(e) => setSort(e.target.value)} className="input appearance-none !w-44 cursor-pointer !pl-10 !pr-8 !py-2.5 text-sm" aria-label="Sort events">
                  {SORTS.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
                </select>
                <ChevronDown size={13} className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-[#5b6577]" />
              </div>
              <button onClick={() => setFreeOnly((v) => !v)} aria-pressed={freeOnly} className={cx("chip !py-2.5", freeOnly && "chip-active !text-[#2fe3b5]")}>Free</button>
              <button onClick={() => setPast((v) => !v)} aria-pressed={past} className={cx("chip !py-2.5", past && "chip-active")}>
                <CalendarRange size={13} /> {past ? "Past" : "Upcoming"}
              </button>
            </div>
          </div>
        </Reveal>

        {/* categories */}
        <Reveal delay={120}>
          <div className="mt-5 flex gap-2 overflow-x-auto pb-2 no-bar">
            <button onClick={() => setCategory("all")} className={cx("chip shrink-0", category === "all" && "chip-active !text-white")}>
              All {activeFilters > 0 && <span className="grid h-4 w-4 place-items-center rounded-full bg-[#ff5ca8] text-[9px] font-bold text-white"><Filter size={8} /></span>}
            </button>
            {cats.map((c) => (
              <button key={c.id} onClick={() => setCategory(c.slug)} aria-pressed={category === c.slug} className={cx("chip shrink-0", category === c.slug && "chip-active !text-white")}>
                <span className="h-1.5 w-1.5 rounded-full" style={{ background: c.color }} />
                {c.name}
                <span className="text-[10px] text-[#5b6577]">{c.eventCount}</span>
              </button>
            ))}
          </div>
        </Reveal>

        {/* results */}
        <div className="mt-4 flex items-center justify-between text-sm text-[#5b6577]">
          <p aria-live="polite">{loading ? "Searching…" : <><b className="text-white">{meta.total}</b> event{meta.total !== 1 ? "s" : ""} found</>}</p>
          <button onClick={() => { setSearch(""); setCategory("all"); setFreeOnly(false); setPast(false); setSort("upcoming"); }} className="flex items-center gap-1.5 text-xs font-semibold text-[#9aa4b2] transition-colors hover:text-white">
            <RefreshCw size={12} /> Reset
          </button>
        </div>

        {loading ? (
          <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">{[...Array(6)].map((_, i) => <div key={i} className="skeleton h-80" />)}</div>
        ) : events.length === 0 ? (
          <div className="mt-6">
            <Empty title="Nothing matches — yet" body="Try a different keyword or category, or clear your filters. New events land every week.">
              <a href="/events" onClick={(e) => { e.preventDefault(); setSearch(""); setCategory("all"); setFreeOnly(false); }} className="btn btn-ghost mt-2 text-sm">Clear filters</a>
            </Empty>
          </div>
        ) : (
          <>
            <div className="stagger mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3" key={`${debounced}-${category}-${sort}-${freeOnly}-${past}`}>
              {events.map((e) => <EventCard key={e.id} event={e} />)}
            </div>
            {meta.hasMore && (
              <div className="mt-10 text-center">
                <button onClick={() => load(page + 1, true)} disabled={loadingMore} className="btn btn-ghost">
                  {loadingMore ? "Loading…" : `Load more (${meta.total - events.length} left)`}
                </button>
              </div>
            )}
          </>
        )}
      </main>
      <Footer />
    </div>
  );
}

export default function EventsPage() {
  return (
    <Suspense fallback={<div className="min-h-screen"><Navbar /><Spinner label="Warming up the explorer…" /></div>}>
      <ExplorerInner />
    </Suspense>
  );
}
