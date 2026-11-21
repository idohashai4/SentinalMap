import React, { useRef, useState } from "react";
import html2canvas from "html2canvas";
import L from "leaflet";
import { Radar, Loader2, X, ExternalLink } from "lucide-react";
import { base44, invokeLLMDetailed } from "@/api/base44Client";
import { useToast } from "@/components/ui/use-toast";
import { gatherAreaContext, normalizeBox } from "@/lib/areaContext";
import { renderMapTextImage } from "@/lib/mapTextImage";

// What the researcher reports: the identified place and a short summary of it.
const SCHEMA = {
  type: "object",
  properties: {
    area_name: { type: "string" },
    summary: { type: "string" },
    source_urls: { type: "array", items: { type: "string" } }
  }
};

const LABELS_SCHEMA = {
  type: "object",
  properties: {
    main: { type: "string" },
    names: { type: "array", items: { type: "string" } }
  }
};

const LABELS_PROMPT = `התמונה היא קטע ממפת OpenStreetMap. השטח שסומן מוקף במסגרת כתומה (או בעיגול כתום אם סומנה נקודה). מסביב למסגרת יש שוליים רק לצורך הקשר.
תפקידך לקרוא את הכיתובים שמודפסים על המפה.

- main: שם הדבר שממלא את המסגרת הכתומה או נמצא במרכזה (למשל אצטדיון, בסיס, נמל, מבנה, שכונה), בדיוק כפי שהוא כתוב. רק כיתוב שנמצא בתוך המסגרת או נוגע בה, לא כיתוב שבשוליים מסביב. אם אין כזה - מחרוזת ריקה.
- names: כל הכיתובים שבתוך המסגרת או נוגעים בה, main ראשון, ואחריו מתקנים ואתרים, יישובים ושכונות. עד 8.

חוקים:
- כל כיתוב בדיוק כפי שהוא כתוב, אות באות, בשפת המקור, בלי תרגום. כיתוב בשתי שפות - שתיהן כפריט אחד, מופרדות ב-" / ".
- דלג על שמות רחובות וכבישים, מספרי כבישים ושמות חנויות, אלא אם הרחוב הוא הדבר היחיד שבמסגרת.
- כיתובים שבשוליים, מחוץ למסגרת, לא נכללים - גם אם הם גדולים ובולטים.
- אל תנחש: כיתוב חתוך או לא קריא - דלג. אל תוסיף שמות שאינם כתובים בתמונה.`;

// Basemaps that print place names; satellite imagery alone has no text to read.
const LAYERS_WITH_TEXT = ["street", "esri_street", "hybrid"];

const fmtKmEn = (n) => (n < 1 ? `${Math.round(n * 1000)} m` : `${n.toFixed(1)} km`);
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

// In a small area, the Wikipedia article located nearest its center is very
// likely about the thing that was marked.
const centralArticle = (ctx) =>
  ctx.diagonalKm < 2 ? [...ctx.wikipedia].sort((a, b) => a.distanceKm - b.distanceKm)[0] : undefined;

const norm = (v) => String(v || "").toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f\u064b-\u065f]/g, "").replace(/[^\p{L}\p{N}]+/gu, " ").trim();

// Whether a label (possibly "local / English") and a name refer to the same place.
function sameName(label, name) {
  const n = norm(name);
  if (n.length < 3) return false;
  return String(label || "").split("/").map(norm).filter((p) => p.length >= 3).some((p) => p === n || p.includes(n) || n.includes(p));
}

// Identification has two modes.
// 1. A label is printed on the map inside the marked area: the label is the
//    subject, and the location only confirms which place of that name it is.
// 2. No label: the subject is whatever is known to be at that spot - the named
//    object there, a recorded site, the article located there, or the settlement.

// What the map data holds about a label, matched by any of its spellings.
function labelInfo(label, ctx) {
  const site = ctx.sites.find((x) => sameName(label, x.name) || sameName(label, x.nameEn));
  const feature = ctx.features.find((f) => sameName(label, f.name) || sameName(label, f.nameEn) || sameName(label, f.nameHe));
  const article = ctx.wikipedia.find((w) => sameName(label, w.title));
  const nameEn = site?.nameEn || feature?.nameEn || (article?.lang === "en" ? article.title : "");
  return { site, feature, article, nameEn: nameEn && norm(nameEn) !== norm(label) ? nameEn : "" };
}

function identifyByLocation(ctx) {
  const nearest = (list) => [...list].sort((a, b) => a.distanceKm - b.distanceKm)[0];
  const a = ctx.address;
  if (a?.featureName) {
    const info = labelInfo(a.featureName, ctx);
    return { name: info.nameEn || a.featureName, shown: a.featureName, known: [`the named object at this spot${a.featureType ? ` (map category ${a.featureType})` : ""}`, info.site?.description, info.article?.description].filter(Boolean).join("; "), site: info.site, article: info.article };
  }
  const site = nearest(ctx.sites);
  if (site) return { name: site.nameEn || site.name, shown: site.name, known: [site.type, site.description, site.affiliation && `operated by ${site.affiliation}`].filter(Boolean).join("; "), site };
  const feature = nearest(ctx.features.filter((f) => f.kind !== "place" && (f.name || f.nameEn)));
  if (feature) return { name: feature.nameEn || feature.name, shown: feature.nameHe || feature.name || feature.nameEn, known: feature.kindLabel };
  const article = centralArticle(ctx);
  if (article) return { name: article.title, shown: article.title, known: article.description, article };
  if (a?.locality) return { name: a.locality, shown: a.locality, known: "the settlement at this spot" };
  return null;
}

const locationLine = (ctx) => {
  const a = ctx.address;
  const where = a ? [a.locality, a.district, a.region, a.country].filter(Boolean).join(", ") : "";
  return `${where || "unknown"} (coordinates ${ctx.center.lat.toFixed(5)}, ${ctx.center.lng.toFixed(5)})`;
};

// Mode 1: everything is about the label; the location only disambiguates it.
function labelQuery(label, info, ctx) {
  const today = new Date().toISOString().slice(0, 10);
  return `Today is ${today}. Research "${label}"${info.nameEn ? ` (in English: ${info.nameEn})` : ""} - the name printed on the map at this location.

Location, only to make sure you research the right "${label}" and not another place of the same name: ${locationLine(ctx)}.
${info.site || info.feature || info.article ? `Known from map data: ${[info.site && [info.site.type, info.site.description].filter(Boolean).join("; "), info.feature?.kindLabel, info.article?.description].filter(Boolean).join("; ")}\n` : ""}
About "${label}" only, answer in at most 6 short bullet points:
- What it is (for example a town, a neighbourhood, a base, a port, a facility).
- What is in it or at it: military or security sites, forces, units and organisations present.
- Who it is tied to now (who controls, operates or is identified with it), and any change with its date.
- The one or two most significant events there, with dates.

If you find nothing specific to this "${label}", answer exactly: No specific information found.`;
}

// One focused question per site. A search model answers a narrow, named
// question far better than a broad one about a pair of coordinates.
function targetQuery(target, ctx) {
  const today = new Date().toISOString().slice(0, 10);
  return `Today is ${today}. Research this exact location only, not other places with a similar name.

Name: ${target.name}${target.shown && norm(target.shown) !== norm(target.name) ? ` (also written ${target.shown})` : ""}
Coordinates: ${ctx.center.lat.toFixed(5)}, ${ctx.center.lng.toFixed(5)}${ctx.point ? "" : ` (center of the marked area, ${fmtKmEn(ctx.widthKm)} by ${fmtKmEn(ctx.heightKm)})`}
Administrative area: ${placeLine(ctx.address) || "unknown"}
Known from map data: ${target.known || "nothing further"}

First confirm that sources describe the place at these coordinates, not another place with the same name. Then answer in at most 6 short bullet points:
- What the place is, and its military or security role.
- Who it is tied to now (who controls, operates or is identified with it), and any change with its date.
- The one or two most significant events there, with dates.

Report only what sources state about this specific location. If you find nothing specific to it, answer exactly: No specific information found.`;
}

function overviewQuery(ctx) {
  const today = new Date().toISOString().slice(0, 10);
  const places = knownPlaces(ctx).filter((f) => f.kind === "place").map((f) => f.nameEn || f.name).filter(Boolean).slice(0, 6);
  return `Today is ${today}. Security situation in this specific small area: ${places.length ? places.join(", ") + " - " : ""}${placeLine(ctx.address) || `around ${ctx.center.lat.toFixed(3)}, ${ctx.center.lng.toFixed(3)}`}.

Answer in at most 5 short bullet points:
- Who controls this area now, and any change of control with its date.
- Military or security sites in it.
- The one or two most significant security events there recently, with dates.

Only these places, not the wider country or region. If nothing specific is found, answer exactly: No specific information found.`;
}

function synthesisPrompt({ ctx, label, subject, material, research, allowedUrls }) {
  const findings = research.map((r) => `### ${r.subject}\n${r.text}`);
  const where = `${ctx.address?.display || "לא אותר"} (נ"צ ${ctx.center.lat.toFixed(5)}, ${ctx.center.lng.toFixed(5)})`;
  const focus = label
    ? `הנושא הוא "${label}" - הכיתוב שסומן על המפה. כתוב רק עליו. המיקום נתון רק כדי לוודא שמדובר ב-"${label}" הנכון.`
    : subject
      ? `לא סומן כיתוב. לפי המיקום, מה שנמצא בנקודה הזו הוא: ${subject}. כתוב עליו.`
      : "לא סומן כיתוב ולא זוהה עצם מוכר בנקודה. כתוב מה ידוע על המקום הזה עצמו.";

  return `אתה חוקר מודיעין גלוי (OSINT). התאריך היום: ${new Date().toISOString().slice(0, 10)}.
${focus}
אל תוסיף שום דבר שאינו בחומר שלמטה.

## מיקום (להקשר בלבד)
${where}

## מה ידוע מנתוני המפה
${material.length ? material.join("\n") : "אין."}

## ממצאי חיפוש ברשת
${findings.length ? findings.join("\n\n") : "החיפוש ברשת לא החזיר ממצאים."}

## מה להחזיר
- area_name: שם הנושא בעברית (ובסוגריים בשפת המקור אם שונה), ואחריו המחוז או המדינה.
- summary: סיכום כללי של הנושא בפסקה אחת, 3-5 משפטים: מה המקום ותפקידו הצבאי או הביטחוני, למי הוא קשור כיום (מי שולט בו, מפעיל אותו או מזוהה איתו, וממי למי אם זה התחלף), ורקע קצר. אירועים - רק אחד או שניים המשמעותיים ביותר, משולבים בטקסט עם תאריך. לא רשימה.
- source_urls: 2-4 הקישורים הרלוונטיים ביותר על המקום עצמו, אך ורק מהרשימה הזו:
${allowedUrls.length ? allowedUrls.join("\n") : "(אין)"}

## חוקים
- רק מה שמופיע בחומר למעלה. אל תוסיף מידע מהזיכרון, ואל תמציא שמות, תאריכים, מספרים או שיוך.
- הסיכום עוסק בנושא בלבד. מקומות סמוכים שאינם חלק ממנו - השמט, גם אם יש עליהם הרבה מידע. ממצא על מקום אחר בעל שם זהה במקום אחר, או על העיר והמדינה באופן כללי - השמט.
- כשהנושא הוא יישוב או אזור, "מה יש בו" כולל אתרים, כוחות וגופים שנמצאים בתוכו. כשהנושא הוא בסיס או מתקן - מי מפעיל אותו ומה יש בו.
- כשממצאי החיפוש סותרים את נתוני המפה לגבי מי מפעיל אתר, העדף את המידע העדכני יותר וציין את השינוי.
- טענה של צד אחד בלבד - כתוב "לפי" ושם הטוען.
- סגנון: תמציתי ועובדתי, כמו סיכום מודיעין. בלי הקדמות, בלי הסתייגויות כלליות, בלי "חשוב לציין", ובלי לחזור על הקואורדינטות.
- אין מידע על המקום: summary של משפט אחד שאומר זאת.`;
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
    const hidden = ["leaflet-tooltip-pane", "leaflet-labelsPane-pane", "leaflet-marker-pane", "leaflet-overlay-pane", "leaflet-popup-pane", "leaflet-control-container"];
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
    // A click, or a drag of a few pixels, is a point; anything drawn is an area,
    // however small - a stadium or a single building is a valid area.
    const nw = map.latLngToContainerPoint(bounds.getNorthWest());
    const se = map.latLngToContainerPoint(bounds.getSouthEast());
    const isPoint = Math.abs(se.x - nw.x) < 12 && Math.abs(se.y - nw.y) < 12;

    if (isPoint) {
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
    const { search } = normalizeBox(box, { point: isPoint });
    const own = ownMarkings(L.latLngBounds([search.south, search.west], [search.north, search.east]));

    // The map's text is read from the area as drawn at the zoom the user marked
    // it at, so the labels read are the ones that were visible. If the tiles
    // cannot be loaded, the screen itself is read, when its layer prints text.
    const readMapText = async () => {
      let image = null;
      try {
        image = await renderMapTextImage(box, { zoom: map.getZoom(), layer: tileMode, point: isPoint });
      } catch (e) {
        if (LAYERS_WITH_TEXT.includes(tileMode)) {
          try { image = await captureArea(map, bounds); } catch (err) {}
        }
      }
      if (!image) return { main: "", names: [] };
      try {
        const labels = await base44.integrations.Core.InvokeLLM({
          prompt: LABELS_PROMPT,
          file_urls: [image],
          response_json_schema: LABELS_SCHEMA,
          quality: "high",
          thinking: false
        });
        const main = String(labels?.main || "").trim();
        const names = [...new Set([main, ...(labels?.names || [])].map((n) => String(n || "").trim()).filter(Boolean))].slice(0, 8);
        return { main, names };
      } catch (e) {
        return { main: "", names: [] };
      }
    };

    try {
      // 1. Identification: the names printed on the map, together with the coordinates and the map data.
      const [ctx, { main, names: readNames }] = await Promise.all([gatherAreaContext(box, { point: isPoint }), readMapText()]);

      // 2. Decide what the search is about: the label if one was read, otherwise
      //    whatever is known to be at this spot.
      const label = main || readNames[0] || "";
      let queries;
      let subject = "";
      const material = [];
      const titles = new Map();
      if (label) {
        const info = labelInfo(label, ctx);
        queries = [{ subject: label, prompt: labelQuery(label, info, ctx) }];
        if (info.site) material.push(`- ${info.site.name}: ${[info.site.type, info.site.description].filter(Boolean).join("; ")}${info.site.affiliation ? `. מפעיל/בעלים: ${info.site.affiliation}` : ""} [${info.site.url}]`);
        if (info.article) material.push(`- ${info.article.title}${info.article.description ? ` - ${info.article.description}` : ""}${info.article.extract ? `: ${info.article.extract}` : ""} [${info.article.url}]`);
        if (info.feature) material.push(`- ${info.feature.kindLabel}: ${[info.feature.name, info.feature.nameEn].filter(Boolean).join(" / ")}`);
        ctx.events.filter((e) => sameName(label, e.name) || (info.nameEn && sameName(info.nameEn, e.name))).forEach((e) => material.push(`- אירוע ${e.date || ""}: ${e.name} [${e.url}]`));
        [info.site, info.article].forEach((x) => x && titles.set(x.url, x.title || x.name));
      } else {
        const found = identifyByLocation(ctx);
        if (found) {
          subject = found.shown;
          queries = [{ subject: found.name, prompt: targetQuery(found, ctx) }];
          material.push(`- בנקודה: ${found.shown}${found.known ? ` (${found.known})` : ""}`);
          if (found.article?.extract) material.push(`- ${found.article.title}: ${found.article.extract} [${found.article.url}]`);
          [found.site, found.article].forEach((x) => x && titles.set(x.url, x.title || x.name));
        } else {
          queries = [{ subject: "המיקום", prompt: overviewQuery(ctx) }];
        }
        // Recorded events and the researcher's own markings at this spot help place it.
        ctx.events.slice(0, 4).forEach((e) => { material.push(`- אירוע שתועד בנקודה ${e.date || ""}: ${e.name} [${e.url}]`); titles.set(e.url, e.name); });
        if (own.length) material.push(`- סימונים של החוקר עצמו בנקודה: ${own.join(", ")}`);
      }

      const answers = await Promise.allSettled(
        queries.map((q) => invokeLLMDetailed({ prompt: q.prompt, add_context_from_internet: true, search_only: true, max_tokens: 700 }))
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

      // 3. One summary, written only from the gathered material.
      cited.forEach((c) => titles.set(c.url, c.title || ""));
      const res = await base44.integrations.Core.InvokeLLM({
        prompt: synthesisPrompt({ ctx, label, subject, material, research, allowedUrls: [...titles.keys()].slice(0, 20) }),
        response_json_schema: SCHEMA,
        quality: "high",
        thinking: false,
        max_tokens: 1500
      });

      const identified = label
        ? { by: "כיתוב", name: label }
        : { by: "מיקום", name: subject || ctx.address?.locality || "" };
      // Only links that were really gathered are shown; anything else the model wrote is dropped.
      // If the model picked none, the pages the web search actually used stand in.
      let picked = [...new Set(res?.source_urls || [])].filter((u) => titles.has(u));
      if (!picked.length) picked = [...new Set(cited.map((c) => c.url))];
      const sources = picked.slice(0, 4).map((url) => ({ url, title: titles.get(url) || url }));
      setResult({
        area_name: res?.area_name || identified.name || ctx.address?.display || `${lat}, ${lng}`,
        summary: res?.summary || "",
        sources,
        identified,
        coords: ctx.point
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
                  <p className="text-[10px] font-mono text-amber-400/70 mt-1" dir="auto">
                    {result.identified.name
                      ? `זוהה לפי ${result.identified.by}: ${result.identified.name}`
                      : "לא נקרא כיתוב ולא זוהה עצם מוכר — החיפוש לפי המיקום"}
                  </p>
                </div>

                {result.noWebSearch && (
                  <p className="text-[10px] font-mono text-red-300">
                    החיפוש ברשת לא היה זמין — האפיון מבוסס על נתוני מפה וויקיפדיה בלבד
                  </p>
                )}

                {result.summary && (
                  <p className="text-xs text-foreground/85 leading-relaxed whitespace-pre-wrap" dir="auto">{result.summary}</p>
                )}

                {result.sources.length > 0 && (
                  <div className="space-y-1">
                    <p className="text-[9px] font-mono text-muted-foreground/60 uppercase tracking-wider">קישורים</p>
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

                {!result.summary && (
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

