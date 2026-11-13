// Conflict reporting from Monitor the Situation's public events feed.
// The feed sends no cross-origin headers, so it is read through the same
// plain-text relay the other external feeds use.
const API = "https://monitor-the-situation.com/api/events";
const RELAY = "https://r.jina.ai/";

// Only conflict reporting is taken from the feed. Political, humanitarian and
// economic developments are deliberately left out.
const CATEGORY = "conflict";

const SUBTYPES = {
  airstrike: "תקיפה אווירית",
  drone_strike: "תקיפת כטב״ם",
  drone_strike_military: "תקיפת כטב״ם צבאית",
  strike: "תקיפה",
  strike_aftermath: "תוצאות תקיפה",
  infrastructure_strike: "תקיפת תשתיות",
  missile_strike: "תקיפת טילים",
  missile_attack: "תקיפת טילים",
  missile_alert: "התרעת טילים",
  missile_launch: "שיגור טילים",
  missile_test: "ניסוי טילים",
  ballistic_missile_attack: "תקיפת טילים בליסטיים",
  air_raid_alert: "התרעת תקיפה אווירית",
  explosion: "פיצוץ",
  accidental_explosion: "פיצוץ בשוגג",
  attack: "תקיפה",
  armed_assault: "תקיפה חמושה",
  armed_clash: "עימות חמוש",
  border_clash: "עימות בגבול",
  ground_combat: "לחימה קרקעית",
  air_engagement: "קרב אווירי",
  air_defense: "הגנה אווירית",
  air_defense_engagement: "יירוט הגנה אווירית",
  military_activity: "פעילות צבאית",
  military_movement: "תנועה צבאית",
  military_operation: "מבצע צבאי",
  military_deployment: "פריסה צבאית",
  military_exercise: "תרגיל צבאי",
  military_alert: "כוננות צבאית",
  military_posture: "עמדה צבאית",
  military_engagement: "התקלות צבאית",
  military_assessment: "הערכה צבאית",
  military_intelligence: "מודיעין צבאי",
  military_command: "פיקוד צבאי",
  military_development: "התפתחות צבאית",
  military_preparedness: "היערכות צבאית",
  military_construction: "בנייה צבאית",
  military_technology_test: "ניסוי טכנולוגי צבאי",
  naval_movement: "תנועה ימית",
  naval_incident: "תקרית ימית",
  naval_attack: "תקיפה ימית",
  naval_operation: "מבצע ימי",
  maritime_incident: "תקרית ימית",
  maritime_attack: "תקיפה ימית",
  maritime_activity: "פעילות ימית",
  maritime_operation: "מבצע ימי",
  blockade_status: "מצור ימי",
  assassination: "התנקשות",
  shooting: "ירי",
  mass_shooting: "ירי המוני",
  kidnapping: "חטיפה",
  terrorism: "טרור",
  ied_attack: "מטען חבלה",
  sabotage: "חבלה",
  reconnaissance: "סיור",
  electronic_warfare: "לוחמה אלקטרונית",
  casualty_report: "דיווח נפגעים",
  civilian_casualties: "נפגעים אזרחיים",
  riot: "התפרעות",
  protest_violent: "מחאה אלימה",
  civil_unrest: "אי שקט אזרחי",
  communal_violence: "אלימות עדתית",
  mob_violence: "אלימות המונים",
  political_violence: "אלימות פוליטית",
  airport_closure: "סגירת שדה תעופה",
  government_statement: "הודעת ממשל",
  diplomatic_statement: "הודעה דיפלומטית",
  clarification: "הבהרה",
  intelligence_failure: "כשל מודיעיני",
  looting: "ביזה"
};

// The feed reports UTC as "YYYY-MM-DD HH:mm:ss".
function parseTime(value) {
  if (!value) return null;
  const parsed = new Date(`${value.replace(" ", "T")}Z`);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function toItem(event) {
  const detail = [
    SUBTYPES[event.subtype] || "עימות",
    event.location_name || event.country,
    event.severity ? `חומרה S${event.severity}` : null,
    typeof event.confidence === "number" ? `ביטחון ${event.confidence}%` : null
  ]
    .filter(Boolean)
    .join(" · ");

  return {
    id: `mts-${event.id}`,
    group: "mts",
    lat: event.lat,
    lon: event.lng,
    title: event.title || "דיווח עימות",
    summary: event.summary || "",
    detail,
    time: parseTime(event.created_at || event.content_updated_at || event.updated_at),
    sourceName: "Monitor the Situation",
    // Filled on demand from the event's own source reports (see fetchEventSourceUrl).
    sourceUrl: null,
    eventId: event.id
  };
}

// Pulls every conflict report the feed currently holds.
// A query narrows that set by country, region or keyword.
export async function fetchMonitorSituationConflicts(query) {
  const res = await fetch(`${RELAY}${API}`, { headers: { Accept: "text/plain" } });
  if (!res.ok) throw new Error(`feed unavailable (${res.status})`);
  const text = await res.text();
  const start = text.indexOf("[");
  const end = text.lastIndexOf("]");
  if (start === -1 || end === -1) throw new Error("feed returned no data");

  const events = JSON.parse(text.slice(start, end + 1));
  const q = (query || "").trim().toLowerCase();

  return events
    .filter((e) => e.category === CATEGORY)
    .filter((e) => typeof e.lat === "number" && typeof e.lng === "number")
    .filter((e) => {
      if (!q) return true;
      return [e.title, e.summary, e.country, e.region, e.location_name]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(q);
    })
    .sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0))
    .slice(0, 200)
    .map(toItem);
}

// Photos and clips from the feed are served through the site's own media proxy:
// twitter's video hosts refuse playback from other origins.
export function mediaProxyUrl(url) {
  return url ? `https://monitor-the-situation.com/api/media-proxy?url=${encodeURIComponent(url)}` : "";
}

// Every event is built from a set of source reports; each carries its own
// article, text and media. Fetched on demand — one request per report opened.
const signalsCache = new Map();

export async function fetchEventSignals(eventId) {
  if (!eventId) return [];
  if (signalsCache.has(eventId)) return signalsCache.get(eventId);

  const res = await fetch(`${RELAY}${API}/${eventId}/signals`, { headers: { Accept: "text/plain" } });
  if (!res.ok) return [];

  const text = await res.text();
  const start = text.indexOf("[");
  const end = text.lastIndexOf("]");
  if (start === -1 || end === -1) return [];

  const list = JSON.parse(text.slice(start, end + 1)).map((s) => ({
    id: s.id,
    sourceType: s.source_type || "",
    sourceName: s.source_name || s.source_domain || "",
    reliability: s.source_reliability || 0,
    title: s.title || "",
    content: s.content || "",
    url: s.url || "",
    time: parseTime(s.timestamp),
    media: (s.media_urls || [])
      .filter((m) => m && m.url)
      .map((m) => ({ ...m, sourceName: s.source_name || "" }))
  }));

  signalsCache.set(eventId, list);
  return list;
}

// The article the strongest source report points to, so a report links to the
// story it came from rather than to the feed itself.
export async function fetchEventSourceUrl(eventId) {
  const best = (await fetchEventSignals(eventId))
    .filter((s) => s.url)
    .sort(
      (a, b) =>
        (b.sourceType === "news") - (a.sourceType === "news") ||
        (b.reliability || 0) - (a.reliability || 0)
    )[0];

  return best ? { url: best.url, sourceName: best.sourceName } : null;
}

