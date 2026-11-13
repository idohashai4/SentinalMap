import React, { useRef, useState } from "react";
import html2canvas from "html2canvas";
import L from "leaflet";
import { Radar, Loader2, X, ExternalLink } from "lucide-react";
import { base44, invokeLLMDetailed } from "@/api/base44Client";
import { useToast } from "@/components/ui/use-toast";
import { gatherAreaContext, normalizeBox } from "@/lib/areaContext";

// The characterisation of a marked area: where it is, who it is identified
// with, its security context, the sites inside it and what happened there.
const SCHEMA = {
  type: "object",
  properties: {
    area_name: { type: "string" },
    affiliation: { type: "string" },
    summary: { type: "string" },
    sites: {
      type: "array",
      items: {
        type: "object",
        properties: { name: { type: "string" }, type: { type: "string" }, affiliation: { type: "string" } }
      }
    },
    events: {
      type: "array",
      items: {
        type: "object",
        properties: { date: { type: "string" }, event: { type: "string" } }
      }
    },
    source_urls: { type: "array", items: { type: "string" } }
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
  // Places are taken evenly from near the center out to the edges of the area,
  // so the far corners are represented and not only the middle.
  const all = ctx.features.filter((f) => f.kind === "place").sort((a, b) => a.distanceKm - b.distanceKm);
  const room = Math.max(4, 12 - sites.length);
  const places = all.length <= room ? all : Array.from({ length: room }, (_, i) => all[Math.round((i * (all.length - 1)) / (room - 1))]);
  return [...sites.slice(0, 12), ...places];
}

const placeLine = (address) => (address ? [address.district, address.region, address.country].filter(Boolean).join(", ") : "");

// The few things most worth a dedicated web search: known security sites
// first, then security-related articles, then the main settlements.
function pickTargets(ctx, mapNames) {
  const targets = [];
  const seen = new Set();
  const add = (name, known) => {
    const key = (name || "").trim().toLowerCase();
    if (!key || seen.has(key) || targets.length >= 3) return;
    seen.add(key);
    targets.push({ name: name.trim(), known });
  };
  // Searches work best on the English name; the local name goes along as a hint.
  ctx.sites.forEach((x) => add(x.nameEn || x.name, [x.type, x.description, x.affiliation && `operated by ${x.affiliation}`, x.nameEn && x.name !== x.nameEn && `also written ${x.name}`].filter(Boolean).join("; ")));
  ctx.features.filter((f) => f.kind !== "place" && (f.name || f.nameEn)).forEach((f) => add(f.nameEn || f.name, `${f.kindLabel}${f.name && f.nameEn && f.name !== f.nameEn ? `; local name ${f.name}` : ""}`));
  ctx.wikipedia.filter((w) => w.security).forEach((w) => add(w.title, w.description));
  knownPlaces(ctx).filter((f) => f.kind === "place").forEach((f) => add(f.nameEn || f.name, `settlement${f.name && f.nameEn && f.name !== f.nameEn ? `; local name ${f.name}` : ""}`));
  mapNames.forEach((n) => add(n, "label printed on the map"));
  return targets;
}

// One focused question per site. A search model answers a narrow, named
// question far better than a broad one about a pair of coordinates.
function targetQuery(target, ctx) {
  const today = new Date().toISOString().slice(0, 10);
  return `Today is ${today}. Research this exact location only, not other places with a similar name.

Location: ${target.name}
Where: ${placeLine(ctx.address) || "unknown"} (about ${ctx.center.lat.toFixed(3)}, ${ctx.center.lng.toFixed(3)})
Known from map data: ${target.known || "nothing further"}

Answer briefly in dated bullet points:
1. What it is and its military or security role.
2. Who controls, operates or is affiliated with it now (state, army branch, armed group, international force), and any change of control with the date.
3. Forces, units or armed groups present there.
4. Notable strikes, attacks, clashes or security incidents at this location, each with its date, most recent first.

Report only what sources state about this specific location. If you find nothing specific to it, answer exactly: No specific information found.`;
}

function overviewQuery(ctx) {
  const today = new Date().toISOString().slice(0, 10);
  const places = knownPlaces(ctx).filter((f) => f.kind === "place").map((f) => f.nameEn || f.name).filter(Boolean).slice(0, 6);
  return `Today is ${today}. Security situation in this specific small area: ${places.length ? places.join(", ") + " - " : ""}${placeLine(ctx.address) || `around ${ctx.center.lat.toFixed(3)}, ${ctx.center.lng.toFixed(3)}`}.

Answer briefly in dated bullet points:
1. Who controls this area now (state forces, armed groups, international forces), and any change of control with the date.
2. Military or security sites located in it.
3. Strikes, clashes or security incidents in these specific places during the last two years, each with its date and the exact place, most recent first.

Only these places, not the wider country or region. If nothing specific is found, answer exactly: No specific information found.`;
}

function synthesisPrompt(ctx, mapNames, own, research, allowedUrls) {
  const sites = [
    ...ctx.sites.map((x) => `- ${x.name}: ${[x.type, x.description].filter(Boolean).join("; ")}${x.affiliation ? `. מפעיל/בעלים: ${x.affiliation}` : ""} [${x.url}]`),
    ...ctx.features.filter((f) => f.kind !== "place").map((f) => `- ${f.kindLabel}: ${[f.name, f.nameEn].filter((v, i, arr) => v && arr.indexOf(v) === i).join(" / ") || "ללא שם"}`),
  ];
  const places = knownPlaces(ctx).filter((f) => f.kind === "place").map((f) => f.nameHe || f.name || f.nameEn).filter(Boolean);
  const events = ctx.events.map((e) => `- ${e.date || "תאריך לא ידוע"}: ${e.name}${e.type ? ` (${e.type})` : ""} [${e.url}]`);
  const articles = ctx.wikipedia.slice(0, 8).map((w) => `- ${w.title}${w.description ? ` - ${w.description}` : ""}${w.extract ? `: ${w.extract}` : ""} [${w.url}]`);
  const findings = research.map((r) => `### ${r.subject}\n${r.text}`);

  return `אתה חוקר מודיעין גלוי (OSINT). התאריך היום: ${new Date().toISOString().slice(0, 10)}.
לפניך כל החומר שנאסף על שטח שסומן במפה. כתוב ממנו אפיון ביטחוני קצר של השטח. אל תוסיף שום דבר שאינו בחומר.

## השטח
${ctx.diagonalKm < 0.2 ? `נקודה: ${ctx.center.lat.toFixed(5)}, ${ctx.center.lng.toFixed(5)}` : `מלבן של ${fmtKm(ctx.widthKm)} על ${fmtKm(ctx.heightKm)}, מרכזו ${ctx.center.lat.toFixed(5)}, ${ctx.center.lng.toFixed(5)}`}
מיקום: ${ctx.address?.display || "לא אותר"}

## אתרים ביטחוניים בתוך השטח (נתוני מפה מאומתים)
${sites.length ? sites.join("\n") : "לא נמצאו."}

## יישובים בתוך השטח
${places.length ? places.join(", ") : "לא נמצאו."}

## אירועים שתועדו בתוך השטח
${events.length ? events.join("\n") : "לא נמצאו."}

## ערכי ויקיפדיה שממוקמים בשטח
${articles.length ? articles.join("\n") : "לא נמצאו."}

## כיתובים שנקראו מהמפה
${mapNames.length ? mapNames.join(", ") : "אין."}

## סימונים של החוקר עצמו בשטח
${own.length ? own.join(", ") : "אין."}

## ממצאי חיפוש ברשת
${findings.length ? findings.join("\n\n") : "החיפוש ברשת לא החזיר ממצאים."}

## מה להחזיר
- area_name: שם קצר בעברית. אם יש בשטח אתר ביטחוני מרכזי - שמו, ואחריו המחוז או המדינה. אחרת היישוב המרכזי והמחוז.
- affiliation: עם מי השטח או האתר המרכזי מזוהה כיום - מי שולט בו או מפעיל אותו (מדינה, זרוע צבאית, ארגון חמוש, כוח בינלאומי). שורה אחת קצרה. אם השליטה התחלפה - ציין ממי למי ומתי. אם אין מידע - מחרוזת ריקה.
- summary: ההקשר הביטחוני ב-2-4 משפטים: מה האתר או השטח, מה תפקידו הצבאי, ואילו כוחות נמצאים בו.
- sites: עד 5 אתרים ביטחוניים שבתוך השטח. name = שם האתר בעברית (ובסוגריים בשפת המקור אם שונה), type = סוג קצר (למשל "בסיס אווירי", "נמל", "מוצב"), affiliation = מי מפעיל או שולט, או מחרוזת ריקה.
- events: עד 6 אירועים ביטחוניים מרכזיים שקרו בתוך השטח, מהחדש לישן. date = YYYY-MM-DD, YYYY-MM או YYYY; event = משפט אחד: מה קרה, מי ביצע ונגד מי.
- source_urls: עד 4 כתובות שעליהן נשענת, אך ורק מהרשימה הזו:
${allowedUrls.length ? allowedUrls.join("\n") : "(אין)"}

## חוקים
- רק מה שמופיע בחומר למעלה. אל תוסיף מידע מהזיכרון, ואל תמציא שמות, תאריכים, מספרים או שיוך.
- רק מה שבתוך השטח המסומן. ממצא על מקום אחר בעל שם דומה, או על המדינה באופן כללי - השמט.
- כשממצאי החיפוש סותרים את נתוני המפה לגבי מי מפעיל אתר, העדף את המידע העדכני יותר וציין את השינוי.
- אירוע בלי תאריך בחומר - השמט. טענה של צד אחד בלבד - כתוב "לפי" ושם הטוען.
- סגנון: תמציתי ועובדתי, כמו סיכום מודיעין. בלי הקדמות, בלי הסתייגויות כלליות, בלי "חשוב לציין", ובלי לחזור על הקואורדינטות.
- אין מידע ביטחוני על השטח: summary של משפט אחד שאומר זאת, ורשימות ריקות.`;
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

    try {
      // 1. Where this is: verified map data for the area, and the text on screen.
      const [ctx, readNames] = await Promise.all([gatherAreaContext(box), readMapText()]);

      // 2. A focused web search for each site worth one, plus one for the area as a whole.
      const targets = pickTargets(ctx, readNames);
      const queries = [
        ...targets.map((t) => ({ subject: t.name, prompt: targetQuery(t, ctx) })),
        { subject: "השטח כולו", prompt: overviewQuery(ctx) },
      ];
      const answers = await Promise.allSettled(
        queries.map((q) => invokeLLMDetailed({ prompt: q.prompt, add_context_from_internet: true, search_only: true, max_tokens: 1200 }))
      );
      const research = [];
      const cited = [];
      answers.forEach((a, i) => {
        if (a.status !== "fulfilled" || typeof a.value.result !== "string") return;
        const text = a.value.result.trim();
        if (!text || /^no specific information found\.?$/i.test(text)) return;
        research.push({ subject: queries[i].subject, text });
        cited.push(...a.value.sources);
      });
      const searched = answers.some((a) => a.status === "fulfilled");

      // 3. One characterisation written only from the gathered material.
      const titles = new Map();
      cited.forEach((c) => titles.set(c.url, c.title || ""));
      ctx.wikipedia.slice(0, 8).forEach((w) => titles.set(w.url, w.title));
      [...ctx.sites, ...ctx.events].forEach((x) => titles.set(x.url, x.name));
      const res = await base44.integrations.Core.InvokeLLM({
        prompt: synthesisPrompt(ctx, readNames, own, research, [...titles.keys()].slice(0, 30)),
        response_json_schema: SCHEMA,
        quality: "high"
      });

      // With no text read from the screen, show the names the map data holds for the area.
      const names = readNames.length
        ? readNames
        : [...ctx.sites.map((x) => x.name), ...knownPlaces(ctx).map((f) => f.nameHe || f.name || f.nameEn)].filter(Boolean).slice(0, 8);
      // Only links that were really gathered are shown; anything else the model wrote is dropped.
      const sources = [...new Set(res?.source_urls || [])].filter((u) => titles.has(u)).slice(0, 4)
        .map((url) => ({ url, title: titles.get(url) || url }));
      setResult({
        area_name: res?.area_name || ctx.address?.display || names.join(", ") || `${lat}, ${lng}`,
        affiliation: res?.affiliation || "",
        summary: res?.summary || "",
        sites: (res?.sites || []).filter((x) => x && x.name).slice(0, 5),
        events: (res?.events || []).filter((x) => x && x.event).slice(0, 6),
        sources,
        names,
        coords: ctx.diagonalKm < 0.2
          ? `נקודה · ${lat}, ${lng}`
          : `שטח ${fmtKm(ctx.widthKm)} × ${fmtKm(ctx.heightKm)} · מרכז ${lat}, ${lng}`,
        noWebSearch: !searched
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
                      {result.coords}
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
                    החיפוש ברשת לא היה זמין — האפיון מבוסס על נתוני מפה וויקיפדיה בלבד
                  </p>
                )}

                {result.affiliation && (
                  <p className="text-[11px] text-foreground/90" dir="auto">
                    <span className="font-mono text-[10px] text-amber-400/80">מזוהה עם: </span>
                    {result.affiliation}
                  </p>
                )}

                {result.summary && (
                  <p className="text-xs text-foreground/85 leading-relaxed whitespace-pre-wrap" dir="auto">
                    {result.summary}
                  </p>
                )}

                {result.sites.length > 0 && (
                  <div className="space-y-1">
                    <p className="text-[9px] font-mono text-muted-foreground/60 uppercase tracking-wider">אתרים בשטח</p>
                    {result.sites.map((x, i) => (
                      <div key={i} className="rounded-md border border-border/50 bg-muted/20 px-2.5 py-1.5">
                        <p className="text-[11px] text-foreground/90" dir="auto">
                          {x.name}
                          {x.type && <span className="text-[10px] font-mono text-amber-400/80"> · {x.type}</span>}
                        </p>
                        {x.affiliation && <p className="text-[10px] text-muted-foreground" dir="auto">{x.affiliation}</p>}
                      </div>
                    ))}
                  </div>
                )}

                {result.events.length > 0 && (
                  <div className="space-y-1">
                    <p className="text-[9px] font-mono text-muted-foreground/60 uppercase tracking-wider">אירועים מרכזיים</p>
                    {result.events.map((x, i) => (
                      <div key={i} className="rounded-md border border-border/50 bg-muted/20 px-2.5 py-1.5">
                        {x.date && <span className="text-[10px] font-mono text-amber-400/80" dir="ltr">{x.date}</span>}
                        <p className="text-[11px] text-foreground/80" dir="auto">{x.event}</p>
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

                {!result.summary && result.sites.length === 0 && result.events.length === 0 && (
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

