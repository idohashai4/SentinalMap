import React, { useRef, useState } from "react";
import html2canvas from "html2canvas";
import L from "leaflet";
import { Radar, Loader2, X, ExternalLink } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { useToast } from "@/components/ui/use-toast";
import { gatherAreaContext, normalizeBox } from "@/lib/areaContext";


const CERTAINTY = ["גבוהה", "בינונית", "נמוכה"];
const WHERE = ["בתוך האזור", "בסביבה"];

const SCHEMA = {
  type: "object",
  properties: {
    area_name: { type: "string" },
    summary: { type: "string" },
    facts: {
      type: "array",
      items: {
        type: "object",
        properties: {
          label: { type: "string" },
          value: { type: "string" },
          date: { type: "string" },
          where: { type: "string", enum: WHERE },
          certainty: { type: "string", enum: CERTAINTY },
          source_url: { type: "string" }
        }
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

const LABELS_PROMPT = `התמונה היא חיתוך מתוך מפה גאוגרפית. תפקידך לקרוא את הכיתובים שמודפסים עליה.
חוקים:
- החזר כל כיתוב בדיוק כפי שהוא כתוב במפה, אות באות, בשפת המקור, בלי תרגום ובלי תיקון.
- כלול שמות מקומות (מדינות, ערים, יישובים, שכונות, רחובות, כבישים, נהרות, הרים) וכיתובים של מתקנים: בסיסים ומחנות, שדות תעופה, נמלים, מוצבים, מחסומים, מבני ממשל ותשתיות.
- אל תנחש: כיתוב חתוך או לא קריא - דלג עליו. אל תוסיף שמות שאינם כתובים בתמונה, גם אם אתה מזהה את האזור.
- התעלם מזכויות יוצרים של ספק המפה (OpenStreetMap, Esri וכדומה), ממספרי כבישים בודדים ומסמלים.
- כל שם פעם אחת בלבד. עד 25 שמות. אם אין טקסט קריא - החזר מערך ריק.`;

// Basemaps that print place names; satellite imagery alone has no text to read.
const LAYERS_WITH_TEXT = ["street", "esri_street", "hybrid"];

const fmtKm = (n) => (n < 1 ? `${Math.round(n * 1000)} מ'` : `${n.toFixed(1)} ק"מ`);

function describeArea(ctx) {
  const { box, center, diagonalKm } = ctx;
  const size = diagonalKm < 0.2
    ? "נקודה בודדת (נבדק רדיוס של כ-500 מטר סביבה)"
    : `מלבן שאלכסונו ${fmtKm(diagonalKm)}`;
  return `מרכז: ${center.lat.toFixed(5)}, ${center.lng.toFixed(5)}
גבולות: דרום ${box.south.toFixed(5)}, צפון ${box.north.toFixed(5)}, מערב ${box.west.toFixed(5)}, מזרח ${box.east.toFixed(5)}
גודל: ${size}`;
}

function researchPrompt(ctx, mapNames, own) {
  const today = new Date().toISOString().slice(0, 10);
  const a = ctx.address;
  const where = a ? [a.locality, a.district, a.region, a.country].filter(Boolean).join(", ") : "";
  const osm = ctx.features.map((f) => {
    const names = [f.name, f.nameEn, f.nameHe].filter((v, i, arr) => v && arr.indexOf(v) === i).join(" / ") || "ללא שם";
    return `- ${f.kindLabel}: ${names}${f.detail ? ` (${f.detail})` : ""} - ${fmtKm(f.distanceKm)} ממרכז האזור`;
  });
  const wiki = ctx.wikipedia.map((w) => `- ${w.title} (${fmtKm(w.distanceKm)} מהמרכז) ${w.url}`);

  return `אתה חוקר מודיעין גלוי (OSINT) המתמחה בהיבטים ביטחוניים. התאריך היום: ${today}.
סומן אזור במפה. תפקידך לתאר מה נמצא ומה קרה באזור המסומן עצמו - לא באזור הרחב שסביבו.

## האזור המסומן
${describeArea(ctx)}
${where ? `מיקום מנהלי (מאומת): ${where}` : "מיקום מנהלי: לא אותר"}

## מה שקיים באזור לפי OpenStreetMap (נתון מאומת, לא ניחוש)
${osm.length ? osm.join("\n") : ctx.osmStatus === "ok" ? "לא נמצאו באזור יישובים או מתקנים ממופים." : "הנתון לא זמין כרגע."}

## כיתובים שנקראו מהמפה שעל המסך
${mapNames.length ? mapNames.join(", ") : "אין (שכבת לוויין ללא טקסט, או שלא זוהה טקסט)."}

## ערכי ויקיפדיה שממוקמים באזור
${wiki.length ? wiki.join("\n") : "לא נמצאו."}

## סימונים של החוקר עצמו באזור (מהמפה שלו)
${own.length ? own.join(", ") : "אין."}

## המשימה
חפש ברשת מידע ביטחוני על המקומות והמתקנים שברשימות למעלה, בשמם המדויק יחד עם שם המדינה או המחוז כדי להימנע מבלבול עם מקומות בעלי שם דומה במקום אחר.
התמקד ב: בסיסים, מחנות, מוצבים ומחסומים; כוחות וארגונים שפועלים במקום; תשתיות אסטרטגיות; תקיפות, עימותים ותקריות ביטחוניות - עם תאריכים.

## כללי דיוק - מחייבים
1. מיקום: כלול רק מה שנמצא בתוך גבולות האזור המסומן, או שנוגע ישירות למקום שמופיע ברשימות למעלה. דבר שנמצא מחוץ לגבולות אך קרוב ורלוונטי - סמן where = "בסביבה" וציין בתוך value את המרחק או את שם המקום. אל תכלול מידע כללי על המדינה או על המחוז.
2. אם שם מקום ברשימות קיים גם במדינה אחרת - ודא שהמקור מדבר על המקום הנכון לפי המדינה והמחוז.
3. כל עובדה חייבת להישען על מקור שמצאת בחיפוש. source_url = כתובת המקור המדויקת. אין מקור - אל תכלול את העובדה.
4. date = תאריך האירוע או תאריך הדיווח, בפורמט YYYY-MM-DD או YYYY-MM או YYYY. אם אינו ידוע - מחרוזת ריקה. אל תציג אירוע ישן כעדכני.
5. certainty: "גבוהה" = מאושר בכמה מקורות אמינים או במקור רשמי; "בינונית" = מקור אמין יחיד; "נמוכה" = דיווח לא מאומת, רשתות חברתיות או טענה של צד אחד.
6. אל תמציא שמות, מספרים, תאריכים או קישורים. אם לא מצאת מידע ביטחוני על האזור - אמור זאת ב-summary והחזר facts ריק. תשובה ריקה עדיפה על תשובה משוערת.

## הפלט
- area_name: שם האזור בעברית, לפי המיקום המנהלי והמקומות שברשימות.
- summary: 3-5 משפטים בעברית על מה שקיים באזור המסומן מבחינה ביטחונית. הבחן במפורש בין מה שמאומת (מהרשימות למעלה) לבין מה שעולה מדיווחים.
- facts: עד 8 עובדות, מהחדשה לישנה. label = נושא קצר, value = הנתון עצמו.
- sources: המקורות שעליהם נשענת, title ו-url מלא.`;
}

export default function ResearcherTool({ mapRef, suppressDrawRef, tileMode, shapes = [], pois = [], placeLabels = [] }) {
  const [active, setActive] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [context, setContext] = useState(null);
  const [stage, setStage] = useState("");
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
    // Only the basemap is photographed: the researcher's own labels, markers and
    // shapes would otherwise be read back as if they were printed on the map.
    const hidden = ["leaflet-tooltip-pane", "leaflet-marker-pane", "leaflet-overlay-pane", "leaflet-popup-pane", "leaflet-control-container"];
    const shot = await html2canvas(container, {
      useCORS: true,
      backgroundColor: "#0b1220",
      logging: false,
      ignoreElements: (el) => hidden.some((c) => el.classList && el.classList.contains(c))
    });
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

  // The researcher's own shapes, points and labels that fall inside the area.
  const ownMarkings = (searchBounds) => {
    const names = new Set();
    shapes.forEach((shape) => {
      if (!shape.label) return;
      try {
        if (L.geoJSON(JSON.parse(shape.geojson)).getBounds().intersects(searchBounds)) names.add(shape.label);
      } catch (e) {}
    });
    pois.forEach((p) => {
      if (p.title && p.latitude && p.longitude && searchBounds.contains([p.latitude, p.longitude])) names.add(p.title);
    });
    placeLabels.forEach((l) => {
      if (l.name && l.latitude && l.longitude && searchBounds.contains([l.latitude, l.longitude])) names.add(l.name);
    });
    return [...names].slice(0, 20);
  };

  const research = async (map, bounds) => {
    setLoading(true);
    setResult(null);
    setContext(null);
    clearHighlight();

    const center = bounds.getCenter();
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

    const box = { south: bounds.getSouth(), north: bounds.getNorth(), west: bounds.getWest(), east: bounds.getEast() };
    const { search } = normalizeBox(box);
    const own = ownMarkings(L.latLngBounds([search.south, search.west], [search.north, search.east]));

    // Reading the map's text only makes sense on a layer that prints text.
    const readMapText = async () => {
      if (!LAYERS_WITH_TEXT.includes(tileMode)) return [];
      try {
        const fileUrl = await captureArea(map, bounds);
        const labels = await base44.integrations.Core.InvokeLLM({
          prompt: LABELS_PROMPT,
          file_urls: [fileUrl],
          response_json_schema: LABELS_SCHEMA,
          quality: "high"
        });
        return [...new Set((labels?.names || []).map((n) => String(n).trim()).filter(Boolean))];
      } catch (e) {
        return [];
      }
    };

    setStage("אוסף נתוני מיקום...");
    const [ctx, names] = await Promise.all([gatherAreaContext(box), readMapText()]);
    setContext({ ...ctx, names, own, textLayer: LAYERS_WITH_TEXT.includes(tileMode) });

    setStage("מחפש ברשת...");
    try {
      const res = await base44.integrations.Core.InvokeLLM({
        prompt: researchPrompt(ctx, names, own),
        add_context_from_internet: true,
        response_json_schema: SCHEMA
      });
      // Pages the search model actually opened, as reported by the model provider.
      const cited = res?._sources || [];
      const citedUrls = new Set(cited.map((c) => c.url));
      const listed = (res?.sources || []).filter((src) => src && /^https?:\/\//.test(src.url || ""));
      const merged = [...cited, ...listed.filter((src) => !citedUrls.has(src.url))];
      setResult({
        area_name: res?.area_name || ctx.address?.display || `${center.lat.toFixed(5)}, ${center.lng.toFixed(5)}`,
        summary: res?.summary || "",
        facts: (res?.facts || []).filter((f) => f && f.value),
        sources: merged.slice(0, 8),
        webSearch: res?._webSearch !== false
      });
    } catch (e) {
      toast({ title: "הסריקה נכשלה", description: e?.message || "נסה לסמן אזור אחר.", variant: "destructive" });
    } finally {
      setLoading(false);
      setStage("");
    }
  };

  const start = () => {
    const map = mapRef.current;
    if (!map) return;
    setResult(null);
    setContext(null);
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
    setContext(null);
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

      {(loading || result || context) && (
        <div className="absolute top-[3rem] right-0 z-[1000] w-[22rem] max-w-[calc(100vw-5rem)] bg-card/95 backdrop-blur-md border border-border rounded-xl shadow-2xl shadow-black/50 overflow-hidden">
          <div className="flex items-center gap-2 px-3 py-2 border-b border-border/60 bg-muted/30">
            <Radar className="w-3.5 h-3.5 text-amber-400 shrink-0" />
            <span className="text-[10px] font-mono uppercase tracking-[0.18em] text-muted-foreground">חוקר שטח</span>
            <button onClick={close} aria-label="סגור" className="ml-auto text-muted-foreground hover:text-foreground transition-colors">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="p-3 max-h-[60vh] overflow-y-auto space-y-3" dir="rtl">
            {loading && (
              <div className="flex items-center gap-2 text-xs font-mono text-muted-foreground">
                <Loader2 className="w-4 h-4 animate-spin" /> {stage || "סורק..."}
              </div>
            )}

            {result && (
              <div>
                <h4 className="text-sm font-semibold text-foreground" dir="auto">{result.area_name}</h4>
                {!result.webSearch && (
                  <p className="mt-1 rounded border border-red-500/40 bg-red-500/10 px-2 py-1 text-[10px] font-mono text-red-300">
                    החיפוש ברשת לא היה זמין. התשובה מבוססת על ידע כללי של המודל ועלולה להיות לא מדויקת או לא עדכנית.
                  </p>
                )}
              </div>
            )}

            {context && (
              <div className="rounded-md border border-border/50 bg-muted/20 px-2.5 py-2 space-y-1.5">
                <p className="text-[9px] font-mono text-emerald-400/80 uppercase tracking-wider">נתוני מיקום מאומתים</p>
                <p className="text-[10px] font-mono text-muted-foreground" dir="ltr">
                  {context.center.lat.toFixed(5)}, {context.center.lng.toFixed(5)} · {context.diagonalKm < 0.2 ? "נקודה" : fmtKm(context.diagonalKm)}
                </p>
                {context.address?.display && (
                  <p className="text-[11px] text-foreground/85" dir="auto">{context.address.display}</p>
                )}
                {context.features.length > 0 ? (
                  <ul className="space-y-0.5">
                    {context.features.slice(0, 12).map((f, i) => (
                      <li key={i} className="flex items-baseline gap-1.5 text-[11px]">
                        <span className={`shrink-0 text-[9px] font-mono ${f.kind === "place" ? "text-muted-foreground" : "text-amber-400"}`}>{f.kindLabel}</span>
                        <span className="min-w-0 truncate text-foreground/85" dir="auto">{f.nameHe || f.name || f.nameEn || "ללא שם"}</span>
                        <span className="mr-auto shrink-0 text-[9px] font-mono text-muted-foreground/70">{fmtKm(f.distanceKm)}</span>
                      </li>
                    ))}
                    {context.featuresTotal > 12 && (
                      <li className="text-[9px] font-mono text-muted-foreground/60">ועוד {context.featuresTotal - 12} פריטים ממופים</li>
                    )}
                  </ul>
                ) : (
                  <p className="text-[10px] font-mono text-muted-foreground/70">
                    {context.osmStatus === "ok"
                      ? "אין באזור יישובים או מתקנים ממופים ב-OpenStreetMap."
                      : context.osmStatus === "area_too_large"
                        ? "האזור גדול מדי לפירוט מתקנים. סמן אזור קטן יותר לתוצאה מדויקת."
                        : "נתוני OpenStreetMap לא זמינים כרגע."}
                  </p>
                )}
                {context.names.length > 0 ? (
                  <p className="text-[10px] font-mono text-amber-400/80" dir="auto">נקרא מהמפה: {context.names.join(" · ")}</p>
                ) : (
                  <p className="text-[10px] font-mono text-muted-foreground/60">
                    {context.textLayer ? "לא זוהה טקסט על המפה באזור שסומן." : "בשכבת SAT אין טקסט לקריאה. עבור ל-MAP או HYBRID כדי שהכיתובים ייקראו."}
                  </p>
                )}
                {context.own.length > 0 && (
                  <p className="text-[10px] font-mono text-cyan-400/80" dir="auto">הסימונים שלך באזור: {context.own.join(" · ")}</p>
                )}
              </div>
            )}

            {result && (
              <>
                {result.summary && (
                  <p className="text-xs text-foreground/85 leading-relaxed whitespace-pre-wrap" dir="auto">{result.summary}</p>
                )}

                {result.facts.length > 0 && (
                  <div className="space-y-1">
                    <p className="text-[9px] font-mono text-muted-foreground/60 uppercase tracking-wider">ממצאים מדיווחים</p>
                    {result.facts.map((f, i) => (
                      <div key={i} className="rounded-md border border-border/50 bg-muted/20 px-2.5 py-1.5">
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                          <span className="text-[10px] font-mono text-amber-400/80" dir="auto">{f.label}</span>
                          {f.date && <span className="text-[9px] font-mono text-muted-foreground" dir="ltr">{f.date}</span>}
                          {f.where === "בסביבה" && <span className="text-[9px] font-mono text-cyan-400/80">בסביבה</span>}
                          {f.certainty && (
                            <span className={`mr-auto text-[9px] font-mono ${f.certainty === "גבוהה" ? "text-emerald-400" : f.certainty === "בינונית" ? "text-amber-300" : "text-red-300"}`}>
                              ודאות {f.certainty}
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-foreground/80" dir="auto">{f.value}</p>
                        {/^https?:\/\//.test(f.source_url || "") && (
                          <a href={f.source_url} target="_blank" rel="noopener noreferrer"
                            className="inline-flex max-w-full items-center gap-1 text-[10px] font-mono text-blue-400 hover:text-blue-300">
                            <ExternalLink className="w-2.5 h-2.5 shrink-0" />
                            <span className="truncate" dir="ltr">{f.source_url.replace(/^https?:\/\/(www\.)?/, "").split("/")[0]}</span>
                          </a>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {result.sources.length > 0 && (
                  <div className="space-y-1">
                    <p className="text-[9px] font-mono text-muted-foreground/60 uppercase tracking-wider">מקורות</p>
                    {result.sources.map((src, i) => (
                      <a key={i} href={src.url} target="_blank" rel="noopener noreferrer"
                        className="flex items-center gap-1.5 text-[11px] font-mono text-blue-400 hover:text-blue-300 transition-colors">
                        <ExternalLink className="w-3 h-3 shrink-0" />
                        <span className="truncate" dir="auto">{src.title || src.url}</span>
                      </a>
                    ))}
                  </div>
                )}

                {!result.summary && result.facts.length === 0 && (
                  <p className="text-xs font-mono text-muted-foreground">לא נמצא מידע ביטחוני גלוי על אזור זה.</p>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
