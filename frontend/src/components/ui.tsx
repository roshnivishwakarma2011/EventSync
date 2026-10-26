"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { cx } from "@/lib/client";

/* Reveal on scroll (IntersectionObserver) */
export function Reveal({
  children,
  className,
  delay = 0,
  variant = "up",
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
  variant?: "up" | "left";
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => entries.forEach((e) => e.isIntersecting && (el.classList.add("in"), io.disconnect())),
      { threshold: 0.12, rootMargin: "0px 0px -40px 0px" }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return (
    <div ref={ref} className={cx(variant === "left" ? "reveal-left" : "reveal", className)} style={{ transitionDelay: `${delay}ms` }}>
      {children}
    </div>
  );
}

/* Animated count-up number */
export function AnimatedNumber({ value, duration = 1400, className }: { value: number; duration?: number; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [display, setDisplay] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let raf = 0;
    const io = new IntersectionObserver(
      (entries) => {
        if (!entries[0].isIntersecting) return;
        io.disconnect();
        const start = performance.now();
        const tick = (t: number) => {
          const p = Math.min(1, (t - start) / duration);
          const eased = 1 - Math.pow(1 - p, 3);
          setDisplay(Math.round(value * eased));
          if (p < 1) raf = requestAnimationFrame(tick);
        };
        raf = requestAnimationFrame(tick);
      },
      { threshold: 0.4 }
    );
    io.observe(el);
    return () => { io.disconnect(); cancelAnimationFrame(raf); };
  }, [value, duration]);
  return <span ref={ref} className={className}>{display.toLocaleString()}</span>;
}

export function SectionHeading({ kicker, title, sub, center = false }: { kicker: string; title: ReactNode; sub?: string; center?: boolean }) {
  return (
    <Reveal className={cx("mb-10", center && "text-center")}>
      <p className={cx("label-xs mb-3 flex items-center gap-2 text-[#a78bff]", center && "justify-center")}>
        <span className="inline-block h-1.5 w-1.5 rounded-full bg-[#7c5cff] shadow-[0_0_8px_#7c5cff]" /> {kicker}
      </p>
      <h2 className="font-display text-balance text-3xl font-bold leading-[1.08] text-white md:text-[2.6rem]">{title}</h2>
      {sub && <p className={cx("mt-3 max-w-xl text-[15px] leading-relaxed text-[#9aa4b2]", center && "mx-auto")}>{sub}</p>}
    </Reveal>
  );
}

export function Spinner({ label }: { label?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-16">
      <span className="h-9 w-9 animate-spin rounded-full border-[3px] border-[#7c5cff]/20 border-t-[#7c5cff]" />
      {label && <p className="text-sm text-[#9aa4b2]">{label}</p>}
    </div>
  );
}

export function StatusPill({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    PUBLISHED: { label: "Open", cls: "bg-[#22d3a7]/15 text-[#2fe3b5] border-[#22d3a7]/30" },
    FULL: { label: "Almost Full", cls: "bg-[#f5a623]/15 text-[#ffc35c] border-[#f5a623]/30" },
    LIVE: { label: "LIVE NOW", cls: "bg-[#ff4d6d]/15 text-[#ff7d95] border-[#ff4d6d]/40" },
    COMPLETED: { label: "Completed", cls: "bg-white/10 text-[#9aa4b2] border-white/15" },
    CANCELLED: { label: "Cancelled", cls: "bg-[#ff6b8b]/10 text-[#ff8fa8] border-[#ff6b8b]/25" },
    DRAFT: { label: "Draft", cls: "bg-white/5 text-[#9aa4b2] border-white/10" },
  };
  const s = map[status] ?? map.PUBLISHED;
  return (
    <span className={cx("inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider backdrop-blur", s.cls)}>
      {status === "LIVE" && <span className="live-dot" />}
      {s.label}
    </span>
  );
}

export function Avatar({ name, size = 36, className }: { name: string; size?: number; className?: string }) {
  const initials = name.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase();
  const hue = (name.charCodeAt(0) * 7 + (name.charCodeAt(1) || 3) * 13) % 360;
  return (
    <span
      aria-hidden
      className={cx("grid shrink-0 place-items-center rounded-full font-bold text-white", className)}
      style={{ width: size, height: size, fontSize: size * 0.36, background: `linear-gradient(135deg, hsl(${hue} 70% 55%), hsl(${(hue + 60) % 360} 80% 45%))` }}
    >
      {initials}
    </span>
  );
}

export function Stars({ rating, size = 14 }: { rating: number; size?: number }) {
  return (
    <span className="inline-flex items-center gap-0.5" aria-label={`${rating} out of 5 stars`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <svg key={i} width={size} height={size} viewBox="0 0 24 24" fill={i <= Math.round(rating) ? "#ffc35c" : "none"} stroke={i <= Math.round(rating) ? "#ffc35c" : "#4a5468"} strokeWidth="2">
          <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
        </svg>
      ))}
    </span>
  );
}

export function Empty({ title, body, children }: { title: string; body?: string; children?: ReactNode }) {
  return (
    <div className="card flex flex-col items-center gap-3 px-8 py-14 text-center">
      <div className="grid h-14 w-14 place-items-center rounded-2xl bg-[#7c5cff]/10 text-2xl">✦</div>
      <p className="font-display text-lg font-bold text-white">{title}</p>
      {body && <p className="max-w-sm text-sm leading-relaxed text-[#9aa4b2]">{body}</p>}
      {children}
    </div>
  );
}
