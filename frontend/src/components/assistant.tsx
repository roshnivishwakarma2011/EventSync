"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Bot, MapPin, SendHorizonal, Sparkles, X } from "lucide-react";
import { api, cx, formatDate, formatTime } from "@/lib/client";
import { useAuth } from "./providers";

interface ChatMsg {
  role: "user" | "ai";
  text: string;
  events?: { id: string; title: string; date: string; time: string; venue: string; city: string; category: string; seatsLeft: number }[];
}

const SUGGESTIONS = [
  "What events are happening this weekend?",
  "Show me AI events",
  "Which events match my interests?",
  "Which events are almost full?",
];

export function Assistant() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [msgs, setMsgs] = useState<ChatMsg[]>([
    { role: "ai", text: "Hey! I'm the EventSync AI — I answer from the live event database. Ask me about this weekend, AI events, or what's almost full." },
  ]);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [msgs, busy]);

  const ask = async (text = input) => {
    const message = text.trim();
    if (!message || busy) return;
    setInput("");
    setMsgs((m) => [...m, { role: "user", text: message }]);
    setBusy(true);
    const res = await api("/api/ai/chat", { method: "POST", body: { message } });
    setBusy(false);
    if (res.ok) {
      setMsgs((m) => [...m, { role: "ai", text: res.data.reply, events: res.data.events }]);
    } else {
      setMsgs((m) => [...m, { role: "ai", text: res.error?.message ?? "Something glitched — try again in a moment." }]);
    }
  };

  return (
    <>
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label={open ? "Close EventSync AI" : "Ask EventSync AI"}
        className={cx(
          "fixed bottom-5 left-5 z-[95] flex h-14 w-14 items-center justify-center rounded-full shadow-[0_10px_32px_-6px_rgba(124,92,255,0.8)] transition-all duration-300 hover:scale-110 active:scale-95",
          open ? "bg-[#101728] border border-white/15" : "bg-gradient-to-br from-[#7c5cff] to-[#00d4ff]"
        )}
      >
        {open ? <X size={20} className="text-white" /> : <Bot size={22} className="text-white" />}
        {!open && <span className="absolute -right-0.5 -top-0.5 h-3.5 w-3.5 rounded-full border-2 border-[#070a13] bg-[#22d3a7]" />}
      </button>

      {open && (
        <div className="chat-pop glass fixed bottom-24 left-5 z-[95] flex h-[min(600px,72vh)] w-[min(92vw,400px)] flex-col overflow-hidden rounded-3xl border border-white/12 shadow-2xl" role="dialog" aria-label="EventSync AI assistant">
          <div className="flex items-center gap-3 border-b border-white/8 bg-gradient-to-r from-[#7c5cff]/20 to-[#00d4ff]/10 px-5 py-4">
            <span className="grid h-10 w-10 place-items-center rounded-2xl bg-gradient-to-br from-[#7c5cff] to-[#00d4ff]">
              <Sparkles size={18} className="text-white" />
            </span>
            <div>
              <p className="font-display text-sm font-bold text-white">Ask EventSync</p>
              <p className="flex items-center gap-1.5 text-[11px] text-[#2fe3b5]">
                <span className="h-1.5 w-1.5 rounded-full bg-[#22d3a7]" /> Live on the event database
              </p>
            </div>
          </div>

          <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
            {msgs.map((m, i) => (
              <div key={i} className={cx("flex", m.role === "user" ? "justify-end" : "justify-start")}>
                <div className={cx(
                  "max-w-[88%] rounded-2xl px-4 py-3 text-[13px] leading-relaxed",
                  m.role === "user"
                    ? "rounded-br-sm bg-gradient-to-br from-[#7c5cff] to-[#5e3df5] text-white"
                    : "rounded-bl-sm border border-white/8 bg-white/[0.05] text-[#dfe4f0]"
                )}>
                  <p className="whitespace-pre-wrap">{m.text}</p>
                  {m.events && m.events.length > 0 && (
                    <div className="mt-3 space-y-2">
                      {m.events.map((e) => (
                        <Link
                          key={e.id}
                          href={`/events/${e.id}`}
                          onClick={() => setOpen(false)}
                          className="block rounded-xl border border-white/10 bg-black/30 px-3 py-2 transition-all hover:border-[#7c5cff]/60 hover:bg-[#7c5cff]/10"
                        >
                          <p className="text-[12px] font-bold text-white">{e.title}</p>
                          <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[10.5px] text-[#9aa4b2]">
                            <span>{formatDate(e.date).month} {formatDate(e.date).day} · {formatTime(e.time)}</span>
                            <span className="flex items-center gap-0.5"><MapPin size={9} /> {e.city || e.venue}</span>
                            <span className="text-[#00d4ff]">{e.seatsLeft} seats left</span>
                          </p>
                        </Link>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}
            {busy && (
              <div className="flex justify-start">
                <div className="typing rounded-2xl rounded-bl-sm border border-white/8 bg-white/[0.05] px-4 py-3.5">
                  <span/><span/><span/>
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          {msgs.length < 3 && (
            <div className="flex gap-1.5 overflow-x-auto px-4 pb-2 no-bar">
              {SUGGESTIONS.map((s) => (
                <button key={s} onClick={() => ask(s)} className="chip shrink-0 !py-1.5 text-[11px]">{s}</button>
              ))}
            </div>
          )}

          <form
            onSubmit={(e) => { e.preventDefault(); ask(); }}
            className="flex items-center gap-2 border-t border-white/8 p-3"
          >
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={user ? "Ask about events, interests, seats…" : "Ask me anything about events…"}
              className="input !rounded-xl !py-2.5 text-[13px]"
              aria-label="Ask EventSync AI"
            />
            <button type="submit" aria-label="Send" disabled={busy || !input.trim()} className="btn btn-primary !rounded-xl !px-3.5 !py-2.5">
              <SendHorizonal size={16} />
            </button>
          </form>
        </div>
      )}
    </>
  );
}
