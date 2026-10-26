"use client";

import { useEffect, useRef, useState } from "react";
import { cx } from "@/lib/client";

/* 6 separate boxes. Supports typing, backspace, arrow keys and pasting the whole code. */
export function OtpInput({ value, onChange, disabled, length = 6 }: { value: string; onChange: (v: string) => void; disabled?: boolean; length?: number }) {
  const refs = useRef<(HTMLInputElement | null)[]>([]);
  const digits = value.padEnd(length, " ").slice(0, length).split("");

  const put = (i: number, raw: string) => {
    const clean = raw.replace(/\D/g, "");
    if (!clean) return;
    const chars = value.split("");
    clean.split("").forEach((c, k) => { if (i + k < length) chars[i + k] = c; });
    const next = chars.join("").replace(/\s/g, "").slice(0, length);
    onChange(next);
    refs.current[Math.min(i + clean.length, length - 1)]?.focus();
  };

  return (
    <div className="flex justify-between gap-2" role="group" aria-label="6-digit verification code">
      {digits.map((d, i) => (
        <input
          key={i}
          ref={(el) => { refs.current[i] = el; }}
          value={d.trim()}
          disabled={disabled}
          inputMode="numeric"
          autoComplete={i === 0 ? "one-time-code" : "off"}
          maxLength={length}
          aria-label={`Digit ${i + 1}`}
          onChange={(e) => put(i, e.target.value)}
          onPaste={(e) => { e.preventDefault(); put(0, e.clipboardData.getData("text")); }}
          onFocus={(e) => e.target.select()}
          onKeyDown={(e) => {
            if (e.key === "Backspace") {
              e.preventDefault();
              if (value[i]) onChange(value.slice(0, i) + value.slice(i + 1));
              else if (i > 0) { onChange(value.slice(0, i - 1) + value.slice(i)); refs.current[i - 1]?.focus(); }
            } else if (e.key === "ArrowLeft" && i > 0) refs.current[i - 1]?.focus();
            else if (e.key === "ArrowRight" && i < length - 1) refs.current[i + 1]?.focus();
          }}
          className={cx("input !px-0 text-center font-mono text-2xl font-bold", d.trim() && "!border-[#7c5cff]/70")}
          style={{ width: "100%", maxWidth: 56, height: 58 }}
        />
      ))}
    </div>
  );
}

/* seconds countdown helper for the "Resend code" button */
export function useCountdown(start: number) {
  const [left, setLeft] = useState(start);
  useEffect(() => {
    if (left <= 0) return;
    const t = setTimeout(() => setLeft((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [left]);
  return [left, setLeft] as const;
}
