// Live external layers available without any API key.
export const LIVE_GROUPS = [
  {
    id: "quakes",
    label: "רעידות אדמה",
    color: "#f59e0b",
    source: "USGS",
    hint: "עוצמה 2.5+ ב-24 השעות האחרונות"
  },
  {
    id: "nature",
    label: "אירועי טבע",
    color: "#ef4444",
    source: "NASA EONET",
    hint: "סופות, שריפות, הרי געש ושיטפונות פעילים"
  },
  {
    id: "mts",
    label: "עדכונים בזמן אמת",
    color: "#22d3ee",
    source: "Monitor the Situation",
    hint: "דיווחי עימות מ-Monitor the Situation — ללא פוליטי, הומניטרי וכלכלי",
    searchable: true,
    filterHint: "עימות · כל הדיווחים · Monitor the Situation"
  }
];

export const LIVE_COLORS = Object.fromEntries(LIVE_GROUPS.map((g) => [g.id, g.color]));

// Topic used for live items the user chooses to keep.
export const LIVE_TOPIC = "מודיעין חי";

export function timeAgo(iso) {
  if (!iso) return "";
  const diff = Date.now() - new Date(iso).getTime();
  if (Number.isNaN(diff)) return "";
  const minutes = Math.round(diff / 60000);
  if (minutes < 1) return "עכשיו";
  if (minutes < 60) return `לפני ${minutes} דק'`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `לפני ${hours} שע'`;
  return `לפני ${Math.round(hours / 24)} ימים`;
}

export async function fetchEarthquakes() {
  const res = await fetch(
    "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/2.5_day.geojson"
  );
  if (!res.ok) throw new Error("earthquakes feed failed");
  const data = await res.json();
  return (data.features || [])
    .map((f) => {
      const p = f.properties || {};
      const c = (f.geometry && f.geometry.coordinates) || [];
      return {
        id: `usgs-${f.id}`,
        group: "quakes",
        lat: c[1],
        lon: c[0],
        title: p.title || "רעידת אדמה",
        summary: p.place || "",
        detail: `עוצמה ${p.mag ?? "?"} · עומק ${Math.round(c[2] ?? 0)} ק"מ`,
        time: p.time ? new Date(p.time).toISOString() : null,
        sourceName: "USGS",
        sourceUrl: p.url || ""
      };
    })
    .filter((i) => typeof i.lat === "number" && typeof i.lon === "number");
}

export async function fetchNaturalEvents() {
  const res = await fetch("https://eonet.gsfc.nasa.gov/api/v3/events?status=open&limit=100");
  if (!res.ok) throw new Error("eonet feed failed");
  const data = await res.json();
  const items = [];

  (data.events || []).forEach((ev) => {
    const geo = (ev.geometry || [])[ev.geometry ? ev.geometry.length - 1 : 0];
    if (!geo) return;

    let lat = null;
    let lon = null;
    if (geo.type === "Point") {
      lon = geo.coordinates && geo.coordinates[0];
      lat = geo.coordinates && geo.coordinates[1];
    } else if (Array.isArray(geo.coordinates) && Array.isArray(geo.coordinates[0])) {
      const ring = geo.coordinates[0];
      const sum = ring.reduce((acc, c) => [acc[0] + (c[0] || 0), acc[1] + (c[1] || 0)], [0, 0]);
      lon = sum[0] / ring.length;
      lat = sum[1] / ring.length;
    }
    if (typeof lat !== "number" || typeof lon !== "number" || Number.isNaN(lat)) return;

    const category = (ev.categories && ev.categories[0] && ev.categories[0].title) || "אירוע טבע";
    const source = (ev.sources && ev.sources[0]) || null;

    items.push({
      id: `eonet-${ev.id}`,
      group: "nature",
      lat,
      lon,
      title: ev.title || category,
      summary: category,
      detail: geo.magnitudeValue ? `${geo.magnitudeValue} ${geo.magnitudeUnit || ""}`.trim() : "",
      time: geo.date || null,
      sourceName: (source && source.id) || "NASA EONET",
      sourceUrl: (source && source.url) || ev.link || ""
    });
  });

  return items;
}
