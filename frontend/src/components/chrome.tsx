
"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  Bell, Calendar, Compass, LayoutDashboard, LogOut,
  Menu, Moon, Plus, Search, Shield, Sparkles, Sun,
  Ticket, X, Zap,
} from "lucide-react";
import { api, cx, timeAgo, type SessionUser } from "@/lib/client";
import { useAuth, useToast } from "./providers";

/* ============================== logo ============================== */

export function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <Link href="/" className="group flex items-center gap-2.5" aria-label="EventSync home">
      <span className="relative grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-[#7c5cff] to-[#00d4ff] shadow-[0_6px_20px_-4px_rgba(124,92,255,0.7)] transition-transform duration-500 group-hover:rotate-[15deg]">
        <Zap size={18} className="text-white" strokeWidth={2.6} />
      </span>
      {!compact && (
        <span className="font-display text-[1.15rem] font-bold tracking-tight text-white">
          EVENT<span className="gradient-text">SYNC</span>
        </span>
      )}
    </Link>
  );
}

/* ============================== notifications ============================== */

function NotificationBell({ user }: { user: SessionUser }) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<any[]>([]);
  const [unread, setUnread] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  const { toast } = useToast();

  const load = async () => {
    const res = await api("/api/notifications?limit=12");
    if (res.ok) {
      setItems(res.data.items);
      setUnread(res.data.unread);
    }
  };

  useEffect(() => {
    load();
    const t = setInterval(load, 45_000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const markAll = async () => {
    await api("/api/notifications/read-all", { method: "PATCH" });
    setUnread(0);
    setItems((prev) => prev.map((i) => ({ ...i, read: true })));
    toast({ title: "All caught up", kind: "info" });
  };

  const markOne = async (n: any) => {
    if (!n.read) {
      api(`/api/notifications/${n.id}/read`, { method: "PATCH" });
      setUnread((u) => Math.max(0, u - 1));
      setItems((prev) =>
        prev.map((x) => x.id === n.id ? { ...x, read: true } : x)
      );
    }
  };

  return (
    <div className="relative" ref={ref}>
      <button
        aria-label={`Notifications${unread ? `, ${unread} unread` : ""}`}
        onClick={() => setOpen((o) => !o)}
        className="relative grid h-10 w-10 place-items-center rounded-full border border-white/10 bg-white/[0.04] text-[#9aa4b2] transition-all hover:border-[#7c5cff]/60 hover:text-white"
      >
        <Bell size={17} />
        {unread > 0 && (
          <span className="absolute -right-1 -top-1 grid h-5 min-w-5 place-items-center rounded-full bg-[#ff5ca8] px-1 text-[10px] font-bold text-white">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="modal-card glass absolute right-0 top-12 z-50 w-[min(92vw,360px)] overflow-hidden rounded-2xl border border-white/10 shadow-2xl">
          <div className="flex items-center justify-between border-b border-white/8 px-4 py-3">
            <p className="text-sm font-bold text-white">Notifications</p>
            <button onClick={markAll} className="text-xs font-semibold text-[#a78bff] hover:text-white">
              Mark all read
            </button>
          </div>
          <div className="max-h-[380px] overflow-y-auto">
            {items.length === 0 && (
              <p className="px-4 py-8 text-center text-sm text-[#9aa4b2]">
                No notifications yet.
              </p>
            )}
            {items.map((n) => (
              <Link
                key={n.id}
                href={n.link ?? "#"}
                onClick={() => { markOne(n); setOpen(false); }}
                className={cx(
                  "stagger flex gap-3 border-b border-white/5 px-4 py-3 transition-colors hover:bg-white/[0.04]",
                  !n.read && "bg-[#7c5cff]/[0.07]"
                )}
              >
                <span className={cx(
                  "mt-1.5 h-2 w-2 shrink-0 rounded-full",
                  n.read ? "bg-white/15" : "bg-[#00d4ff]"
                )} />
                <span>
                  <span className="block text-[13px] font-semibold leading-snug text-white">{n.title}</span>
                  {n.body && (
                    <span className="mt-0.5 block text-xs leading-relaxed text-[#9aa4b2]">{n.body}</span>
                  )}
                  <span className="mt-1 block text-[10px] uppercase tracking-wider text-[#5b6577]">
                    {timeAgo(n.createdAt)}
                  </span>
                </span>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ============================== navbar ============================== */

const NAV = [
  { href: "/events", label: "Discover" },
  { href: "/events?sort=trending", label: "Trending" },
  { href: "/#categories", label: "Categories" },
  { href: "/#community", label: "Community" },
  { href: "/#journey", label: "Journey" },
];

export function Navbar() {
  const { user, loading, signOut } = useAuth();
  const { toast } = useToast();
  const pathname = usePathname();
  const router = useRouter();

  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [userMenu, setUserMenu] = useState(false);
  const [theme, setTheme] = useState<"dark" | "light">("dark");

  const userMenuRef = useRef<HTMLDivElement>(null);

  /* Restore saved theme */
  useEffect(() => {
    const savedTheme = window.localStorage.getItem("eventsync-theme");
    const selectedTheme = savedTheme === "light" ? "light" : "dark";

    setTheme(selectedTheme);
    document.documentElement.dataset.theme = selectedTheme;
  }, []);

  /* Switch between light and dark */
  const toggleTheme = () => {
    const nextTheme = theme === "dark" ? "light" : "dark";

    setTheme(nextTheme);
    document.documentElement.dataset.theme = nextTheme;
    window.localStorage.setItem("eventsync-theme", nextTheme);
  };

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => setMenuOpen(false), [pathname]);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) {
        setUserMenu(false);
      }
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const doSearch = (e: React.FormEvent) => {
    e.preventDefault();
    router.push(`/events?search=${encodeURIComponent(search)}`);
    setSearchOpen(false);
  };

  const initials = user?.name
    .split(" ")
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <header
      className={cx(
        "fixed inset-x-0 top-0 z-50 transition-all duration-500",
        scrolled
          ? "glass border-b border-white/[0.07] py-3 shadow-[0_8px_40px_rgba(0,0,0,0.45)]"
          : "bg-transparent py-5"
      )}
    >
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-5 lg:px-8">
        <Logo />

        <nav className="hidden items-center gap-1 lg:flex" aria-label="Primary">
          {NAV.map((n) => {
            const active = n.href === "/events" && pathname === "/events";
            return (
              <Link
                key={n.label}
                href={n.href}
                className={cx(
                  "relative rounded-full px-4 py-2 text-sm font-medium transition-colors hover:text-white",
                  active ? "text-white" : "text-[#9aa4b2]"
                )}
              >
                {n.label}
                <span className={cx(
                  "absolute inset-x-4 -bottom-0.5 h-[2px] origin-left rounded-full bg-gradient-to-r from-[#7c5cff] to-[#00d4ff] transition-transform duration-300",
                  active ? "scale-x-100" : "scale-x-0 group-hover:scale-x-100"
                )} />
              </Link>
            );
          })}
        </nav>

        <div className="flex items-center gap-2.5">
          {/* Search */}
          <form
            onSubmit={doSearch}
            className={cx(
              "hidden items-center overflow-hidden rounded-full border border-white/10 bg-white/[0.04] transition-all duration-500 md:flex",
              searchOpen ? "w-64 px-3" : "w-10 border-transparent bg-transparent"
            )}
          >
            <button
              type="button"
              aria-label="Search events"
              onClick={() => setSearchOpen((o) => !o)}
              className="grid h-10 w-10 shrink-0 place-items-center text-[#9aa4b2] hover:text-white"
            >
              <Search size={17} />
            </button>
            {searchOpen && (
              <input
                autoFocus
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search events, cities…"
                className="w-full bg-transparent pb-0.5 text-sm text-white outline-none placeholder:text-[#5b6577]"
              />
            )}
          </form>

          {/* Light / Dark mode button */}
          <button
            type="button"
            onClick={toggleTheme}
            aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
            title={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
            className="theme-toggle grid h-10 w-10 shrink-0 place-items-center rounded-full border border-white/10 bg-white/[0.04] text-[#c8cfdd] transition-all hover:border-[#7c5cff]/60"
          >
            {theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
          </button>

          {!loading && !user && (
            <>
              <Link href="/login" className="hidden rounded-full px-4 py-2 text-sm font-semibold text-[#c8cfdd] transition-colors hover:text-white sm:block">
                Login
              </Link>
              <Link href="/register" className="btn btn-primary !rounded-full !px-5 !py-2.5 text-sm">
                Get Started
              </Link>
            </>
          )}

          {user && (
            <>
              <NotificationBell user={user} />

              {(user.role === "ORGANIZER" || user.role === "ADMIN") && (
                <Link href="/organizer?create=1" className="btn btn-cyan hidden !rounded-full !px-4 !py-2 text-[13px] md:inline-flex">
                  <Plus size={15} /> Create
                </Link>
              )}

              <div className="relative" ref={userMenuRef}>
                <button
                  onClick={() => setUserMenu((o) => !o)}
                  aria-label="Account menu"
                  className="grid h-10 w-10 place-items-center rounded-full bg-gradient-to-br from-[#7c5cff] to-[#ff5ca8] text-[13px] font-bold text-white shadow-[0_4px_16px_rgba(124,92,255,0.5)] transition-transform hover:scale-105"
                >
                  {initials}
                </button>

                {userMenu && (
                  <div className="modal-card glass absolute right-0 top-12 z-50 w-60 overflow-hidden rounded-2xl border border-white/10 shadow-2xl">
                    <div className="border-b border-white/8 px-4 py-3.5">
                      <p className="truncate text-sm font-bold text-white">{user.name}</p>
                      <p className="truncate text-xs text-[#9aa4b2]">{user.email}</p>
                      <p className="mt-1.5 inline-flex items-center gap-1 rounded-full bg-[#7c5cff]/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[#a78bff]">
                        <Sparkles size={10} /> {user.level?.name ?? "Explorer"} · {user.points ?? 0} XP
                      </p>
                    </div>

                    {[
                      { href: "/dashboard", icon: LayoutDashboard, label: "My Dashboard" },
                      { href: "/dashboard?tab=passes", icon: Ticket, label: "My Passes" },
                      ...(user.role !== "USER" ? [{ href: "/organizer", icon: Calendar, label: "Organizer Studio" }] : []),
                      ...(user.role === "ADMIN" ? [{ href: "/admin", icon: Shield, label: "Admin Console" }] : []),
                    ].map((i) => (
                      <Link
                        key={i.label}
                        href={i.href}
                        onClick={() => setUserMenu(false)}
                        className="flex items-center gap-3 px-4 py-2.5 text-sm text-[#c8cfdd] transition-colors hover:bg-white/[0.05] hover:text-white"
                      >
                        <i.icon size={15} className="text-[#7c5cff]" /> {i.label}
                      </Link>
                    ))}

                    <button
                      onClick={async () => {
                        await signOut();
                        toast({ title: "Signed out", kind: "info" });
                        router.push("/");
                        setUserMenu(false);
                      }}
                      className="flex w-full items-center gap-3 border-t border-white/8 px-4 py-3 text-sm text-[#ff8fa8] transition-colors hover:bg-white/[0.05]"
                    >
                      <LogOut size={15} /> Sign out
                    </button>
                  </div>
                )}
              </div>
            </>
          )}

          <button
            aria-label="Open menu"
            onClick={() => setMenuOpen((o) => !o)}
            className="grid h-10 w-10 place-items-center rounded-full border border-white/10 bg-white/[0.04] text-white lg:hidden"
          >
            {menuOpen ? <X size={18} /> : <Menu size={18} />}
          </button>
        </div>
      </div>

      {/* Mobile drawer */}
      <div className={cx(
        "glass overflow-hidden transition-all duration-500 lg:hidden",
        menuOpen ? "mt-3 max-h-96 border-t border-white/10" : "max-h-0"
      )}>
        <nav className="flex flex-col px-6 py-4" aria-label="Mobile">
          {NAV.map((n, i) => (
            <Link
              key={n.label}
              href={n.href}
              style={{ transitionDelay: `${i * 40}ms` }}
              className={cx(
                "border-b border-white/5 py-3.5 text-base font-semibold text-[#c8cfdd] transition-opacity duration-300",
                menuOpen ? "opacity-100" : "opacity-0"
              )}
            >
              {n.label}
            </Link>
          ))}
          {!user && (
            <Link href="/register" className="btn btn-primary mt-4">
              Get Started
            </Link>
          )}
        </nav>
      </div>
    </header>
  );
}

/* ============================== footer ============================== */

export function Footer() {
  return (
    <footer className="relative mt-28 border-t border-transparent">
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[#7c5cff] to-transparent" />

      <div className="mx-auto grid max-w-7xl gap-12 px-6 py-16 md:grid-cols-[1.4fr_1fr_1fr_1fr] lg:px-8">
        <div>
          <Logo />
          <p className="mt-4 max-w-xs text-sm leading-relaxed text-[#9aa4b2]">
            Discover experiences. Connect with people. Make every event count.
          </p>
          <div className="mt-5 flex gap-2">
            {["in", "gh", "ig", "x"].map((s) => (
              <a
                key={s}
                href="#"
                aria-label={`Social ${s}`}
                className="grid h-9 w-9 place-items-center rounded-full border border-white/10 text-[11px] font-bold uppercase text-[#9aa4b2] transition-all hover:border-[#7c5cff] hover:text-white"
              >
                {s}
              </a>
            ))}
          </div>
        </div>

        {[
          { title: "Explore", links: [["Events", "/events"], ["Trending", "/events?sort=trending"], ["Free events", "/events?free=1"], ["This weekend", "/events"]] },
          { title: "For Organizers", links: [["Create event", "/organizer?create=1"], ["Analytics", "/organizer"], ["Check-in console", "/organizer?tab=checkin"], ["Organizer login", "/login"]] },
          { title: "Platform", links: [["My dashboard", "/dashboard"], ["Leaderboard", "/#leaderboard"], ["Certificates", "/dashboard?tab=certificates"], ["Verify certificate", "/verify"]] },
        ].map((col) => (
          <div key={col.title}>
            <p className="label-xs mb-4">{col.title}</p>
            <ul className="space-y-2.5">
              {col.links.map(([label, href]) => (
                <li key={label}>
                  <Link href={href} className="text-sm text-[#9aa4b2] transition-colors hover:text-white">
                    {label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      <div className="border-t border-white/5 py-6 text-center text-xs text-[#5b6577]">
        <span className="mx-auto flex max-w-7xl flex-wrap items-center justify-center gap-2 px-6">
          <Compass size={13} className="text-[#7c5cff]" />
          Built with real data end-to-end · EventSync © {new Date().getFullYear()}
        </span>
      </div>
    </footer>
  );
}
