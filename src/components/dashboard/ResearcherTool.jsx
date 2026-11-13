import React, { useRef, useState } from "react";
import html2canvas from "html2canvas";
import L from "leaflet";
import { Radar, Loader2, X, ExternalLink } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { useToast } from "@/components/ui/use-toast";

const SCHEMA = {
  type: "object",
  properties: {
    area_name: { type: "string" },
    summary: { type: "string" },
    facts: {
      type: "array",
      items: {
        type: "object",
        properties: { label: { type: "string" }, value: { type: "string" } }
      }
    },
    sources: {
      type: "array",
      items: {
        type: "object",
        properties: { title: { type: "string" }, url: { type: "string" } }
      }
    }
  }
};

const LABELS_SCHEMA = {
  type: "object",
  properties: {
    names: { type: "array", items: { type: "string" } }
  }
};

const LABELS_PROMPT = `התמונה היא חיתוך מתוך מפה גאוגרפית. תפקידך לזהות את הכיתובים שמופיעים בה.
חוקים:
- זהה שמות מקומות אמיתיים: מדינות, ערים, יישובים, שכונות, רחובות, כבישים, נהרות, הרים ואתרים.
- זהה גם כיתובים בעלי משמעות ביטחונית אם יש כאלה: שמות בסיסים או מחנות צבאיים, מתקנים, שדות תעופה, נמלים, מוצבים, מחסומים, אתרים ממשלתיים או תשתיות אסטרטגיות.
- התעלם לחלוטין מכיתובי מערכת וזכויות יוצרים של ספק האריחים (למשל OpenStreetMap, Esri, attribution), ממספרים בודדים ומסמלי ממשק.
- אם אותו שם מופיע כמה פעמים - החזר אותו פעם אחת בלבד.
- החזר כל שם בדיוק כפי שהוא מופיע במפה, בשפת המקור, בלי תרגום.
- החזר עד 10 שמות. אם אין שמות - החזר מערך ריק.`;

const researchPrompt = (names, lat, lng) => `אתה חוקר מודיעין גלוי (OSINT) המתמחה בהיבטים ביטחוניים. סומן אזור במפה שמרכזו בקואורדינטות ${lat}, ${lng}.

כיתובים שזוהו על גבי המפה באזור: ${names.length ? names.join(", ") : "לא זוהה טקסט על גבי המפה"}

המשימה: אפיין את האזור מבחינה ביטחונית, בשילוב שני מקורות הזיהוי — המיקום הגאוגרפי עצמו (הקואורדינטות) והכיתובים שזוהו על המפה. אם זוהה טקסט — חפש במפורש על השמות האלה; אם לא זוהה טקסט — הסתמך על מה שנמצא בפועל בקואורדינטות שסומנו.

התמקד בהיבטים ביטחוניים בלבד: פעילות צבאית או ביטחונית ידועה, בסיסים ומתקנים צבאיים, מחנות, מוצבים ומחסומים, גופי ממשל וביטחון, כוחות וארגונים שפועלים באזור, תשתיות אסטרטגיות (שדות תעופה, נמלים, תחנות כוח), ואירועי עימות, לחימה, טרור או תקריות ביטחוניות.

החזר:
- area_name: שם האזור או המקומות שזוהו, בעברית.
- summary: סקירה ביטחונית של 3-5 משפטים בעברית על מה שקיים באזור מבחינה צבאית, ביטחונית וממשלתית.
- facts: עד 6 עובדות ביטחוניות מרכזיות, כל אחת עם label (נושא קצר) ו-value (הנתון עצמו).
- sources: עד 4 קישורים למקורות ציבוריים שמצאת, כל אחד עם title ו-url מלא.

חוקים: הסתמך רק על מידע גלוי שמצאת. אל תמציא עובדות, קישורים או שמות. אם אין מידע זמין — החזר summary קצר שמסביר זאת.`;

export default function ResearcherTool({ mapRef, suppressDrawRef }) {
  const [active, setActive] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const { toast } = useToast();
  const drawerRef = useRef(null);
  const createdHandlerRef = useRef(null);
  const keyHandlerRef = useRef(null);
  const highlightRef = useRef(null);

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

  const captureArea = async (map, bounds) => {
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
    const file = new File([blob], "research-area.png", { type: "image/png" });
    const { file_uri } = await base44.integrations.Core.UploadPrivateFile({ file });
    const { signed_url } = await base44.integrations.Core.CreateFileSignedUrl({ file_uri, expires_in: 600 });
    return signed_url;
  };

  const research = async (map, bounds) => {
    setLoading(true);
    setResult(null);
    clearHighlight();

    const center = bounds.getCenter();
    const lat = center.lat.toFixed(5);
    const lng = center.lng.toFixed(5);
    const meters = center.distanceTo(bounds.getNorthEast());

    if (meters < 100) {
      highlightRef.current = L.circleMarker(center, {
        radius: 7,
        color: "#f59e0b",
        weight: 2,
        fillColor: "#f59e0b",
        fillOpacity: 0.4
      }).addTo(map);
    } else {
      highlightRef.current = L.rectangle(bounds, {
        stroke: true,
        color: "#f59e0b",
        weight: 2,
        opacity: 1,
        fill: true,
        fillColor: "#f59e0b",
        fillOpacity: 0.12,
        dashArray: "6 4"
      }).addTo(map);
    }

    let names = [];
    try {
      const fileUrl = await captureArea(map, bounds);
      const labels = await base44.integrations.Core.InvokeLLM({
        prompt: LABELS_PROMPT,
        file_urls: [fileUrl],
        response_json_schema: LABELS_SCHEMA
      });
      names = (labels?.names || []).filter(Boolean);
    } catch (e) {
      names = [];
    }

    try {
      const res = await base44.integrations.Core.InvokeLLM({
        prompt: researchPrompt(names, lat, lng),
        add_context_from_internet: true,
        model: "gemini_3_flash",
        response_json_schema: SCHEMA
      });
      setResult({
        area_name: res?.area_name || names.join(", ") || `${lat}, ${lng}`,
        summary: res?.summary || "",
        facts: res?.facts || [],
        sources: (res?.sources || []).filter(s => s && s.url),
        names,
        coords: `${lat}, ${lng}`
      });
    } catch (e) {
      toast({ title: "הסריקה נכשלה", description: "נסה לסמן אזור אחר.", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const start = () => {
    const map = mapRef.current;
    if (!map) return;
    setResult(null);
    setActive(true);
    clearHighlight();
    if (suppressDrawRef) suppressDrawRef.current = true;

    const drawer = new L.Draw.Rectangle(map, {
      showArea: false,
      shapeOptions: {
        stroke: true,
        color: "#f59e0b",
        weight: 2,
        opacity: 1,
        fill: true,
        fillColor: "#f59e0b",
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
      research(map, bounds);
    };
    const onKey = (e) => { if (e.key === "Escape") cancel(); };

    createdHandlerRef.current = onCreated;
    keyHandlerRef.current = onKey;
    map.on(L.Draw.Event.CREATED, onCreated);
    document.addEventListener("keydown", onKey);

    drawer.enable();
  };

  const close = () => {
    setResult(null);
    clearHighlight();
  };

  return (
    <>
      <button
        onClick={loading ? undefined : (active ? cancel : start)}
        title="חוקר שטח — סריקת מידע גלוי"
        className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-mono border transition-all ${
          loading
            ? "bg-black/70 text-amber-400/60 border-white/10 cursor-default"
            : active
              ? "bg-amber-500 text-black border-amber-400 animate-pulse"
              : "bg-black/70 text-white/70 hover:text-white border-white/10 hover:bg-white/10"
        }`}
      >
        {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Radar className="w-3.5 h-3.5" />}
        {loading ? "סורק..." : active ? "סמן אזור..." : "חוקר שטח"}
      </button>

      {(loading || result) && (
        <div className="absolute top-[3rem] right-0 z-[1000] w-80 max-w-[calc(100vw-2rem)] bg-card/95 backdrop-blur-md border border-border rounded-xl shadow-2xl shadow-black/50 overflow-hidden">
          <div className="flex items-center gap-2 px-3 py-2 border-b border-border/60 bg-muted/30">
            <Radar className="w-3.5 h-3.5 text-amber-400 shrink-0" />
            <span className="text-[10px] font-mono uppercase tracking-[0.18em] text-muted-foreground">חוקר שטח</span>
            <button onClick={close} className="ml-auto text-muted-foreground hover:text-foreground transition-colors">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="p-3 max-h-[22rem] overflow-y-auto">
            {loading ? (
              <div className="flex items-center justify-center gap-2 py-5 text-xs font-mono text-muted-foreground">
                <Loader2 className="w-4 h-4 animate-spin" /> סורק את הרשת...
              </div>
            ) : (
              <div className="space-y-3">
                <div>
                  <h4 className="text-sm font-semibold text-foreground" dir="auto">{result.area_name}</h4>
                  {result.coords && (
                    <p className="text-[10px] font-mono text-muted-foreground/60 mt-1" dir="auto">
                      מיקום: {result.coords}
                    </p>
                  )}
                  {result.names?.length > 0 ? (
                    <p className="text-[10px] font-mono text-amber-400/70 mt-1" dir="auto">
                      זוהה במפה: {result.names.join(" · ")}
                    </p>
                  ) : (
                    <p className="text-[10px] font-mono text-muted-foreground/50 mt-1">
                      לא זוהה טקסט על המפה — הסריקה מבוססת על המיקום
                    </p>
                  )}
                </div>

                {result.summary && (
                  <p className="text-xs text-foreground/85 leading-relaxed whitespace-pre-wrap" dir="auto">
                    {result.summary}
                  </p>
                )}

                {result.facts.length > 0 && (
                  <div className="space-y-1">
                    <p className="text-[9px] font-mono text-muted-foreground/60 uppercase tracking-wider">עובדות מרכזיות</p>
                    {result.facts.map((f, i) => (
                      <div key={i} className="rounded-md border border-border/50 bg-muted/20 px-2.5 py-1.5">
                        <span className="text-[10px] font-mono text-amber-400/80">{f.label}</span>
                        <p className="text-[11px] text-foreground/80" dir="auto">{f.value}</p>
                      </div>
                    ))}
                  </div>
                )}

                {result.sources.length > 0 && (
                  <div className="space-y-1">
                    <p className="text-[9px] font-mono text-muted-foreground/60 uppercase tracking-wider">מקורות</p>
                    {result.sources.map((s, i) => (
                      <a
                        key={i}
                        href={s.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1.5 text-[11px] font-mono text-blue-400 hover:text-blue-300 transition-colors"
                      >
                        <ExternalLink className="w-3 h-3 shrink-0" />
                        <span className="truncate">{s.title || s.url}</span>
                      </a>
                    ))}
                  </div>
                )}

                {!result.summary && result.facts.length === 0 && (
                  <p className="text-xs font-mono text-muted-foreground">לא נמצא מידע גלוי על אזור זה.</p>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}

