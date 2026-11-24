import React, { useEffect, useRef, useState } from "react";
import L from "leaflet";
import { Copy, Crosshair, Radar, Repeat, X } from "lucide-react";
import { formatCoordinates, parseCoordinates } from "@/lib/coords";
import { useToast } from "@/components/ui/use-toast";

const pinIcon = () =>
  L.divIcon({
    className: "",
    html: `<div style="position:relative;width:28px;height:28px">
      <div style="position:absolute;inset:0;border:2px solid #22d3ee;border-radius:50%;box-shadow:0 0 12px #22d3ee99"></div>
      <div style="position:absolute;left:13px;top:-6px;width:2px;height:40px;background:#22d3ee"></div>
      <div style="position:absolute;top:13px;left:-6px;height:2px;width:40px;background:#22d3ee"></div>
    </div>`,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
    popupAnchor: [0, -14],
  });

// Jump to coordinates pasted from anywhere (a post, a link, a grid reference).
// Pasting on the map itself, outside any text field, jumps straight away.
export default function CoordinateJump({ mapRef, researcherRef }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [parsed, setParsed] = useState(null);
  const markerRef = useRef(null);
  const { toast } = useToast();

  const clearMarker = () => {
    if (markerRef.current) {
      markerRef.current.remove();
      markerRef.current = null;
    }
  };

  const copy = async (coords) => {
    try {
      await navigator.clipboard.writeText(formatCoordinates(coords));
      toast({ title: "הקואורדינטות הועתקו", duration: 1500 });
    } catch (e) {}
  };

  const jump = (coords) => {
    const map = mapRef.current;
    if (!map || !coords) return;
    clearMarker();
    const marker = L.marker([coords.lat, coords.lng], { icon: pinIcon(), zIndexOffset: 1000 }).addTo(map);
    marker.bindPopup(
      `<div dir="rtl" style="font-family:'JetBrains Mono',monospace;min-width:190px">
        <div style="font-size:12px;font-weight:700;color:#22d3ee" dir="ltr">${formatCoordinates(coords)}</div>
        ${coords.format ? `<div style="font-size:10px;color:#9ca3af;margin-top:2px">זוהה כ: ${coords.format}</div>` : ""}
        <div style="display:flex;gap:6px;margin-top:8px">
          <button data-act="copy" style="flex:1;padding:4px;border:1px solid #334155;border-radius:4px;background:none;color:#e5e7eb;font-family:inherit;font-size:10px;cursor:pointer">העתק</button>
          <button data-act="research" style="flex:1;padding:4px;border:1px solid #f59e0b66;border-radius:4px;background:#f59e0b22;color:#fcd34d;font-family:inherit;font-size:10px;cursor:pointer">חקור כאן</button>
          <button data-act="clear" style="padding:4px 6px;border:1px solid #334155;border-radius:4px;background:none;color:#9ca3af;font-family:inherit;font-size:10px;cursor:pointer">הסר</button>
        </div>
      </div>`
    );
    marker.on("popupopen", (e) => {
      const el = e.popup.getElement();
      el.querySelector('[data-act="copy"]')?.addEventListener("click", () => copy(coords));
      el.querySelector('[data-act="clear"]')?.addEventListener("click", clearMarker);
      el.querySelector('[data-act="research"]')?.addEventListener("click", () => {
        marker.closePopup();
        researcherRef?.current?.researchPoint(coords.lat, coords.lng);
      });
    });
    markerRef.current = marker;
    map.flyTo([coords.lat, coords.lng], Math.max(map.getZoom(), 15), { duration: 1.2 });
    map.once("moveend", () => markerRef.current === marker && marker.openPopup());
  };

  const submit = (value = text) => {
    const coords = parseCoordinates(value);
    setParsed(coords);
    if (!coords) {
      toast({ title: "לא זוהו קואורדינטות", description: "הדבק נ\"צ עשרוני, מעלות-דקות-שניות, קישור מפה או MGRS.", variant: "destructive" });
      return;
    }
    jump(coords);
  };

  // Paste anywhere outside a text field: jump if the clipboard holds coordinates.
  useEffect(() => {
    const onPaste = (e) => {
      const t = e.target;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      const value = e.clipboardData?.getData("text") || "";
      const coords = parseCoordinates(value);
      if (!coords) return;
      e.preventDefault();
      setText(value.trim().slice(0, 200));
      setParsed(coords);
      jump(coords);
    };
    document.addEventListener("paste", onPaste);
    return () => document.removeEventListener("paste", onPaste);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => clearMarker, []);

  const swap = () => {
    if (!parsed) return;
    const swapped = { lat: parsed.lng, lng: parsed.lat, format: parsed.format };
    if (Math.abs(swapped.lat) > 90) return;
    setParsed(swapped);
    jump(swapped);
  };

  return (
    <>
      <button
        onClick={() => setOpen((v) => !v)}
        title="קפיצה לנ״צ (אפשר גם פשוט להדביק נ״צ על המפה)"
        className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-mono border transition-all ${
          open ? "bg-cyan-500 text-black border-cyan-400" : "bg-black/70 text-white/70 hover:text-white border-white/10 hover:bg-white/10"
        }`}
      >
        <Crosshair className="w-3.5 h-3.5" /> נ״צ
      </button>

      {open && (
        <div className="absolute top-[3rem] right-0 z-[1000] w-80 max-w-[calc(100vw-5rem)] bg-card/95 backdrop-blur-md border border-border rounded-xl shadow-2xl shadow-black/50 overflow-hidden" dir="rtl">
          <div className="flex items-center gap-2 px-3 py-2 border-b border-border/60 bg-muted/30">
            <Crosshair className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
            <span className="text-[10px] font-mono uppercase tracking-[0.18em] text-muted-foreground">קפיצה לנ״צ</span>
            <button onClick={() => setOpen(false)} aria-label="סגור" className="mr-auto text-muted-foreground hover:text-foreground transition-colors">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
          <form
            className="p-3 space-y-2"
            onSubmit={(e) => {
              e.preventDefault();
              submit();
            }}
          >
            <input
              autoFocus
              value={text}
              onChange={(e) => setText(e.target.value)}
              onPaste={(e) => {
                const value = e.clipboardData.getData("text");
                if (parseCoordinates(value)) {
                  e.preventDefault();
                  setText(value.trim().slice(0, 200));
                  submit(value);
                }
              }}
              placeholder="הדבק נ״צ, קישור מפה או טקסט מפוסט"
              dir="ltr"
              className="w-full bg-muted/40 border border-border rounded-md px-2.5 py-1.5 text-xs font-mono text-foreground placeholder-muted-foreground/60 focus:outline-none focus:border-cyan-400/60"
            />
            <div className="flex gap-1.5">
              <button type="submit" className="flex-1 py-1.5 rounded-md bg-cyan-500 text-black text-xs font-mono font-semibold hover:bg-cyan-400 transition-colors">
                קפוץ
              </button>
              {parsed && (
                <>
                  <button type="button" onClick={swap} title="החלף סדר (קו רוחב ↔ קו אורך)" className="px-2 rounded-md border border-border text-muted-foreground hover:text-foreground">
                    <Repeat className="w-3.5 h-3.5" />
                  </button>
                  <button type="button" onClick={() => copy(parsed)} title="העתק" className="px-2 rounded-md border border-border text-muted-foreground hover:text-foreground">
                    <Copy className="w-3.5 h-3.5" />
                  </button>
                  <button type="button" onClick={() => { setOpen(false); researcherRef?.current?.researchPoint(parsed.lat, parsed.lng); }} title="חקור כאן" className="px-2 rounded-md border border-amber-400/40 text-amber-300 hover:bg-amber-400/10">
                    <Radar className="w-3.5 h-3.5" />
                  </button>
                </>
              )}
            </div>
            {parsed && (
              <p className="text-[10px] font-mono text-muted-foreground" dir="ltr">
                {formatCoordinates(parsed)} · {parsed.format}
              </p>
            )}
            <p className="text-[9px] font-mono text-muted-foreground/60">
              נתמך: 33.27, 35.20 · 33°16′19″N 35°12′11″E · קישורי Google / Apple / OSM / Yandex · MGRS. אפשר גם להדביק ישירות על המפה.
            </p>
          </form>
        </div>
      )}
    </>
  );
}
