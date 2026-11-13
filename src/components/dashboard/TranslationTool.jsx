import React, { useRef, useState } from "react";
import html2canvas from "html2canvas";
import L from "leaflet";
import { Languages, Loader2, X } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { useToast } from "@/components/ui/use-toast";

const SCHEMA = {
  type: "object",
  properties: {
    items: {
      type: "array",
      items: {
        type: "object",
        properties: {
          original: { type: "string" },
          translation: { type: "string" },
          language: { type: "string" }
        }
      }
    }
  }
};

const VISION_PROMPT = `התמונה היא חיתוך מתוך מפה גאוגרפית. תפקידך לזהות את שמות המקומות שמופיעים בה ולתרגם אותם לעברית.

חוקים:
- זהה רק שמות מקומות אמיתיים: מדינות, ערים, יישובים, שכונות, רחובות, כבישים, נהרות, הרים ואתרים.
- התעלם לחלוטין מכיתובי מערכת וזכויות יוצרים של ספק האריחים (למשל OpenStreetMap, Esri, Maxar, attribution), ממספרים בודדים ומסמלי ממשק.
- אם אותו שם מופיע כמה פעמים בתמונה - החזר אותו פעם אחת בלבד.
- original: הטקסט בדיוק כפי שהוא מופיע במפה, בשפת המקור.
- translation: תרגום מדויק לעברית, בשם העברי המקובל אם קיים.
- language: שם שפת המקור בעברית (למשל: ערבית, אנגלית, רוסית).
- החזר עד 20 תוויות. אם אין תוויות - החזר מערך ריק.`;

const areaPrompt = (lat, lng) => `מה שמות המקומות, היישובים, השכונות והרחובות המרכזיים באזור הגאוגרפי שמרכזו בקואורדינטות ${lat}, ${lng} (רדיוס של כ-2 ק"מ)?
היעזר בידע ממקורות חיצוניים והחזר עד 15 שמות מוכרים בלבד.
עבור כל שם: original = השם המקומי בשפת המקור, translation = שמו בעברית, language = שפת המקור בעברית.`;

export default function TranslationTool({ mapRef, suppressDrawRef }) {
  const [active, setActive] = useState(false);
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState(null);
  const [source, setSource] = useState("");
  const { toast } = useToast();
  const drawerRef = useRef(null);
  const createdHandlerRef = useRef(null);
  const keyHandlerRef = useRef(null);
  const highlightRef = useRef(null);

  const askVision = async (fileUrl) => {
    const res = await base44.integrations.Core.InvokeLLM({
      prompt: VISION_PROMPT,
      file_urls: [fileUrl],
      response_json_schema: SCHEMA
    });
    return res?.items || [];
  };

  const askArea = async (lat, lng) => {
    const res = await base44.integrations.Core.InvokeLLM({
      prompt: areaPrompt(lat, lng),
      add_context_from_internet: true,
      model: "gemini_3_flash",
      response_json_schema: SCHEMA
    });
    return res?.items || [];
  };

  const translateBounds = async (map, bounds) => {
    setLoading(true);
    setResults(null);
    setSource("");
    clearHighlight();
    highlightRef.current = L.rectangle(bounds, {
      stroke: true,
      color: "#22d3ee",
      weight: 2,
      opacity: 1,
      fill: true,
      fillColor: "#22d3ee",
      fillOpacity: 0.12,
      dashArray: "6 4"
    }).addTo(map);
    try {
      const container = map.getContainer();
      const shot = await html2canvas(container, { useCORS: true, backgroundColor: "#0b1220", logging: false });
      const ratio = shot.width / container.clientWidth;
      const nw = map.latLngToContainerPoint(bounds.getNorthWest());
      const se = map.latLngToContainerPoint(bounds.getSouthEast());
      const x = Math.max(0, Math.round(nw.x * ratio));
      const y = Math.max(0, Math.round(nw.y * ratio));
      const w = Math.max(1, Math.min(shot.width - x, Math.round((se.x - nw.x) * ratio)));
      const h = Math.max(1, Math.min(shot.height - y, Math.round((se.y - nw.y) * ratio)));

      const crop = document.createElement("canvas");
      crop.width = w;
      crop.height = h;
      crop.getContext("2d").drawImage(shot, x, y, w, h, 0, 0, w, h);

      const blob = await new Promise((resolve) => crop.toBlob(resolve, "image/png"));
      const file = new File([blob], "map-area.png", { type: "image/png" });
      const { file_uri } = await base44.integrations.Core.UploadPrivateFile({ file });
      const { signed_url } = await base44.integrations.Core.CreateFileSignedUrl({ file_uri, expires_in: 600 });

      const items = await askVision(signed_url);
      setResults(items);
      setSource("מתוך המפה");
      if (items.length === 0) toast({ title: "לא זוהו תוויות באזור", description: "נסה לסמן אזור אחר." });
    } catch (err) {
      try {
        const center = bounds.getCenter();
        const items = await askArea(center.lat.toFixed(4), center.lng.toFixed(4));
        setResults(items);
        setSource("לפי מיקום גאוגרפי");
      } catch (e2) {
        toast({ title: "התרגום נכשל", description: "נסה שוב.", variant: "destructive" });
      }
    } finally {
      setLoading(false);
    }
  };

  const clearHighlight = () => {
    const map = mapRef.current;
    if (map && highlightRef.current) {
      map.removeLayer(highlightRef.current);
      highlightRef.current = null;
    }
  };

  const cleanup = () => {
    const map = mapRef.current;
    if (map && createdHandlerRef.current) {
      map.off(L.Draw.Event.CREATED, createdHandlerRef.current);
    }
    if (keyHandlerRef.current) {
      document.removeEventListener("keydown", keyHandlerRef.current);
    }
    createdHandlerRef.current = null;
    keyHandlerRef.current = null;
    drawerRef.current = null;
    if (suppressDrawRef) suppressDrawRef.current = false;
    setActive(false);
  };

  const cancel = () => {
    if (drawerRef.current) {
      try { drawerRef.current.disable(); } catch (e) {}
    }
    cleanup();
  };

  const start = () => {
    const map = mapRef.current;
    if (!map) return;
    setResults(null);
    setActive(true);
    clearHighlight();
    if (suppressDrawRef) suppressDrawRef.current = true;

    const drawer = new L.Draw.Rectangle(map, {
      showArea: false,
      shapeOptions: {
        stroke: true,
        color: "#22d3ee",
        weight: 2,
        opacity: 1,
        fill: true,
        fillColor: "#22d3ee",
        fillOpacity: 0.2,
        dashArray: "6 4"
      }
    });
    drawerRef.current = drawer;

    const onCreated = (e) => {
      const bounds = e.layer.getBounds();
      e.layer.remove();
      if (drawerRef.current) {
        try { drawerRef.current.disable(); } catch (err) {}
      }
      cleanup();
      translateBounds(map, bounds);
    };
    const onKey = (e) => { if (e.key === "Escape") cancel(); };

    createdHandlerRef.current = onCreated;
    keyHandlerRef.current = onKey;
    map.on(L.Draw.Event.CREATED, onCreated);
    document.addEventListener("keydown", onKey);

    drawer.enable();
  };

  return (
    <>
      <button
        onClick={loading ? undefined : (active ? cancel : start)}
        title="תרגום אזור במפה"
        className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-mono border transition-all ${
          loading
            ? "bg-black/70 text-cyan-400/60 border-white/10 cursor-default"
            : active
              ? "bg-cyan-500 text-black border-cyan-400 animate-pulse"
              : "bg-black/70 text-white/70 hover:text-white border-white/10 hover:bg-white/10"
        }`}
      >
        {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Languages className="w-3.5 h-3.5" />}
        {loading ? "מתרגם..." : active ? "סמן אזור..." : "תרגום"}
      </button>

      {(loading || results) && (
        <div className="absolute top-[3rem] right-0 z-[1000] w-72 max-w-[calc(100vw-2rem)] bg-card/95 backdrop-blur-md border border-border rounded-xl shadow-2xl shadow-black/50 overflow-hidden">
          <div className="flex items-center gap-2 px-3 py-2 border-b border-border/60 bg-muted/30">
            <Languages className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
            <span className="text-[10px] font-mono uppercase tracking-[0.18em] text-muted-foreground">תרגום אוניברסלי</span>
            <button onClick={() => { setResults(null); clearHighlight(); }} className="ml-auto text-muted-foreground hover:text-foreground transition-colors">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className="p-3 max-h-72 overflow-y-auto">
            {loading ? (
              <div className="flex items-center justify-center gap-2 py-5 text-xs font-mono text-muted-foreground">
                <Loader2 className="w-4 h-4 animate-spin" /> מתרגם את האזור...
              </div>
            ) : (
              <div className="space-y-2">
                {source && (
                  <p className="text-[9px] font-mono text-muted-foreground/60 uppercase tracking-wider">{source}</p>
                )}
                {results.length === 0 && (
                  <p className="text-xs font-mono text-muted-foreground">לא נמצאו תוויות.</p>
                )}
                {results.map((r, i) => (
                  <div key={i} className="rounded-md border border-border/50 bg-muted/20 px-2.5 py-2">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-foreground" dir="auto">{r.translation}</span>
                      {r.language && (
                        <span className="ml-auto text-[9px] font-mono text-cyan-400/80 uppercase shrink-0">{r.language}</span>
                      )}
                    </div>
                    <p className="text-[11px] font-mono text-muted-foreground mt-0.5" dir="auto">{r.original}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
