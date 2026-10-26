"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, X } from "lucide-react";

/* Camera QR scanner. Uses the browser's built-in BarcodeDetector (Chrome, Edge, Android, recent Safari).
   Camera access needs https:// or http://localhost. Where it isn't supported, the organizer pastes the token instead. */
export function QrScanner({ onScan, onClose }: { onScan: (text: string) => void; onClose: () => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const cb = useRef(onScan);
  cb.current = onScan;   // always call the latest handler without restarting the camera
  const [error, setError] = useState("");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let stream: MediaStream | null = null;
    let timer: ReturnType<typeof setInterval> | undefined;
    let stopped = false;
    let last = { text: "", at: 0 };
    (async () => {
      const Detector = (window as any).BarcodeDetector;
      if (!Detector) { setError("This browser can't scan QR codes. Use Chrome or Edge, or paste the pass token."); return; }
      if (!navigator.mediaDevices?.getUserMedia) { setError("Camera access needs https:// or http://localhost."); return; }
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" }, audio: false });
        if (stopped) { stream.getTracks().forEach((t) => t.stop()); return; }
        const v = video.current!; v.srcObject = stream; await v.play(); setReady(true);
        const det = new Detector({ formats: ["qr_code"] });
        timer = setInterval(async () => {
          try {
            const codes = await det.detect(v);
            const text = codes[0]?.rawValue as string | undefined;
            if (text && !(text === last.text && Date.now() - last.at < 4000)) { last = { text, at: Date.now() }; cb.current(text); }
          } catch { /* frame not ready yet */ }
        }, 300);
      } catch {
        setError("Couldn't open the camera. Allow camera access for this site, or paste the pass token.");
      }
    })();
    return () => { stopped = true; if (timer) clearInterval(timer); stream?.getTracks().forEach((t) => t.stop()); };
  }, []);

  return (
    <div className="overflow-hidden rounded-2xl border border-white/10 bg-black">
      <div className="relative aspect-square w-full">
        <video ref={video} playsInline muted className="h-full w-full object-cover" />
        {!error && !ready && <span className="absolute inset-0 grid place-items-center text-white"><Loader2 className="animate-spin" /></span>}
        {ready && <span className="pointer-events-none absolute inset-[18%] rounded-2xl border-2 border-[#2fe3b5]/80" />}
        {error && <p role="alert" className="absolute inset-0 grid place-items-center p-6 text-center text-sm text-[#ff8fa8]">{error}</p>}
        <button type="button" onClick={onClose} aria-label="Close scanner" className="absolute right-3 top-3 grid h-9 w-9 place-items-center rounded-full bg-black/70 text-white hover:bg-white/20"><X size={15} /></button>
      </div>
    </div>
  );
}
