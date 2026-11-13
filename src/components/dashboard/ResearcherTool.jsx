import React, { useRef, useState } from "react";
import html2canvas from "html2canvas";
import L from "leaflet";
import { Radar, Loader2, X, ExternalLink } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { useToast } from "@/components/ui/use-toast";
import { gatherAreaContext, normalizeBox } from "@/lib/areaContext";

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

const LABELS_PROMPT = `התמונה היא חיתוך מתוך מפה גאוגרפית. תפקידך לקרוא את הכיתובים שמודפסים עליה.
חוקים:
- החזר כל כיתוב בדיוק כפי שהוא כתוב במפה, אות באות, בשפת המקור, בלי תרגום ובלי תיקון.
- כלול שמות מקומות (ערים, יישובים, שכונות, רחובות, כבישים, נהרות, הרים) וכיתובים של מתקנים: בסיסים, מחנות, שדות תעופה, נמלים, מוצבים, מחסומים, מבני ממשל ותשתיות.
- אל תנחש: כיתוב חתוך או לא קריא - דלג עליו. אל תוסיף שמות שאינם כתובים בתמונה, גם אם אתה מזהה את האזור.
- התעלם מזכויות יוצרים של ספק המפה (OpenStreetMap, Esri), ממספרים בודדים ומסמלים.
- כל שם פעם אחת בלבד. עד 10 שמות. אם אין טקסט קריא - החזר מערך ריק.`;

// Basemaps that print place names; satellite imagery alone has no text to read.
const LAYERS_WITH_TEXT = ["street", "esri_street", "hybrid"];

const fmtKm = (n) => (n < 1 ? `${Math.round(n * 1000)} מ'` : `${n.toFixed(1)} ק"מ`);

// What is verifiably inside the marked area. Security sites always go in;
// ordinary place names only fill the remaining room, nearest first.
function knownPlaces(ctx) {
  const sites = ctx.features.filter((f) => f.kind !== "place");
  const places = ctx.features.filter((f) => f.kind === "place").slice(0, Math.max(3, 10 - sites.length));
  return [...sites.slice(0, 12), ...places];
}

function researchPrompt(ctx, mapNames, own) {
  const { center, box, address } = ctx;
  const where = address ? [address.locality, address.district, address.region, address.country].filter(Boolean).join(", ") : "";
  const places = knownPlaces(ctx).map((f) => {
    const names = [f.name, f.nameEn, f.nameHe].filter((v, i, arr) => v && arr.indexOf(v) === i).join(" / ") || "ללא שם";
    return `- ${f.kindLabel}: ${names} (${fmtKm(f.distanceKm)} מהמרכז)`;
  });
  const wiki = ctx.wikipedia.slice(0, 6).map((w) => w.title);

  return `אתה חוקר מודיעין גלוי (OSINT) המתמחה בהיבטים ביטחוניים. התאריך היום: ${new Date().toISOString().slice(0, 10)}.
סומן אזור במפה שמרכזו ${center.lat.toFixed(5)}, ${center.lng.toFixed(5)} (גבולות: ${box.south.toFixed(4)} עד ${box.north.toFixed(4)} צפון, ${box.west.toFixed(4)} עד ${box.east.toFixed(4)} מזרח).
${where ? `המיקום: ${where}.` : ""}

מה שנמצא באזור בפועל (נתוני מפה מאומתים):
${places.length ? places.join("\n") : "לא נמצאו יישובים או מתקנים ממופים."}

כיתובים שנקראו מהמפה: ${mapNames.length ? mapNames.join(", ") : "אין"}
ערכי ויקיפדיה באזור: ${wiki.length ? wiki.join(", ") : "אין"}
סימונים של החוקר באזור: ${own.length ? own.join(", ") : "אין"}

המשימה: אפיין את האזור המסומן מבחינה ביטחונית. חפש ברשת על המקומות שברשימות למעלה בשמם המדויק, יחד עם שם המדינה או המחוז, כדי לא להתבלבל עם מקום בעל שם דומה במקום אחר.

התמקד בהיבטים ביטחוניים בלבד: בסיסים ומתקנים צבאיים, מחנות, מוצבים ומחסומים, כוחות וארגונים שפועלים במקום, תשתיות אסטרטגיות (שדות תעופה, נמלים, תחנות כוח), ואירועי עימות, תקיפות ותקריות ביטחוניות.

החזר:
- area_name: שם האזור בעברית, קצר (יישוב או מתקן, ואחריו המחוז או המדינה).
- summary: 3-5 משפטים בעברית על מה שקיים באזור המסומן מבחינה צבאית וביטחונית.
- facts: עד 6 עובדות ביטחוניות, החשובות ביותר בלבד. label = נושא קצר (2-3 מילים), value = הנתון עצמו במשפט אחד, כולל תאריך כשמדובר באירוע.
- sources: עד 4 קישורים למקורות שמצאת, כל אחד עם title ו-url מלא.

חוקים:
- רק האזור המסומן. אל תכתוב על המדינה או המחוז באופן כללי, ואל תכלול מקום שמחוץ לגבולות אלא אם הוא נוגע ישירות למה שבתוכם - ואז ציין את המרחק.
- רק מידע שמצאת במקור. אל תמציא עובדות, שמות, מספרים, תאריכים או קישורים. עדיף פחות עובדות מאשר עובדה לא בטוחה.
- סגנון: תמציתי ועובדתי, כמו סיכום מודיעין קצר. בלי הקדמות, בלי הסתייגויות כלליות, בלי "חשוב לציין" או "על פי המידע", ובלי לחזור על הקואורדינטות או על נוסח המשימה.
- אם אין מידע ביטחוני על האזור - summary של משפט אחד שאומר זאת, ו-facts ריק.`;
}

export default function ResearcherTool({ mapRef, suppressDrawRef, tileMode, shapes = [], pois = [], placeLabels = [] }) {
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
    return [...names].slice(0, 12);
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

    // Verified map data for the area and the text on screen, gathered side by side.
    const [ctx, readNames] = await Promise.all([gatherAreaContext(box), readMapText()]);
    // With no text read from the screen, show the names the map data holds for the area.
    const names = readNames.length
      ? readNames
      : knownPlaces(ctx).map((f) => f.nameHe || f.name || f.nameEn).filter(Boolean).slice(0, 8);

    try {
      const res = await base44.integrations.Core.InvokeLLM({
        prompt: researchPrompt(ctx, readNames, own),
        add_context_from_internet: true,
        response_json_schema: SCHEMA
      });
      // Pages the search model really opened come first; links the model only wrote come after.
      const cited = res?._sources || [];
      const citedUrls = new Set(cited.map((c) => c.url));
      const listed = (res?.sources || []).filter((src) => src && /^https?:\/\//.test(src.url || ""));
      setResult({
        area_name: res?.area_name || ctx.address?.display || names.join(", ") || `${lat}, ${lng}`,
        summary: res?.summary || "",
        facts: (res?.facts || []).filter((f) => f && f.value).slice(0, 6),
        sources: [...cited, ...listed.filter((src) => !citedUrls.has(src.url))].slice(0, 4),
        names,
        coords: `${lat}, ${lng}`,
        noWebSearch: res?._webSearch === false
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
        <div className="absolute top-[3rem] right-0 z-[1000] w-80 max-w-[calc(100vw-5rem)] bg-card/95 backdrop-blur-md border border-border rounded-xl shadow-2xl shadow-black/50 overflow-hidden">
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

                {result.noWebSearch && (
                  <p className="text-[10px] font-mono text-red-300">
                    החיפוש ברשת לא היה זמין — התשובה מבוססת על ידע כללי של המודל
                  </p>
                )}

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

