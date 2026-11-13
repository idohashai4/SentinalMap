// Ground truth for a marked map area, gathered without any AI:
//   - what OpenStreetMap has inside the area (the same data the MAP layer draws its text from)
//   - which country / district the area is in
//   - Wikipedia articles located there
// The researcher hands this to the model so it describes what is really at the
// marked spot instead of guessing from a pair of coordinates.

const OVERPASS = "https://overpass-api.de/api/interpreter";
const NOMINATIM = "https://nominatim.openstreetmap.org/reverse";
const WIKIPEDIA = "https://en.wikipedia.org/w/api.php";

const MIN_HALF_SIDE_KM = 0.5;   // a click or tiny box still looks at ~1 km around it
const MAX_OVERPASS_DIAGONAL_KM = 250;
const WIDE_AREA_DIAGONAL_KM = 60;
const MAX_FEATURES = 40;

// Most security-relevant first; this order decides what survives the cap.
const KINDS = [
  { id: "military", label: "מתקן צבאי", test: (t) => t.military || t.landuse === "military" },
  { id: "airfield", label: "שדה תעופה / מנחת", test: (t) => /^(aerodrome|heliport|airstrip)$/.test(t.aeroway || "") },
  { id: "border", label: "מעבר גבול / מחסום", test: (t) => t.barrier === "border_control" || t.military === "checkpoint" },
  { id: "port", label: "נמל", test: (t) => t.harbour || t.landuse === "port" || t.industrial === "port" },
  { id: "power", label: "תשתית חשמל", test: (t) => /^(plant|substation)$/.test(t.power || "") },
  { id: "government", label: "ממשל / ביטחון פנים", test: (t) => /^(police|prison|embassy)$/.test(t.amenity || "") || /^(government|diplomatic)$/.test(t.office || "") },
  { id: "place", label: "יישוב / מקום", test: (t) => t.place },
];

const km = (a, b) => {
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLng = (b.lng - a.lng) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(h));
};

async function getJson(url, options = {}, timeoutMs = 20000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    if (!res.ok) throw new Error(`${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

// { south, west, north, east } widened so that very small selections still cover ~1 km.
export function normalizeBox(box) {
  const center = { lat: (box.south + box.north) / 2, lng: (box.west + box.east) / 2 };
  const minLat = MIN_HALF_SIDE_KM / 111;
  const minLng = MIN_HALF_SIDE_KM / (111 * Math.max(0.2, Math.cos((center.lat * Math.PI) / 180)));
  const search = {
    south: Math.min(box.south, center.lat - minLat),
    north: Math.max(box.north, center.lat + minLat),
    west: Math.min(box.west, center.lng - minLng),
    east: Math.max(box.east, center.lng + minLng),
  };
  const diagonalKm = km({ lat: box.south, lng: box.west }, { lat: box.north, lng: box.east });
  return { center, search, diagonalKm, widened: search.south !== box.south || search.west !== box.west };
}

async function fetchOsmFeatures({ center, search }, diagonalKm) {
  if (diagonalKm > MAX_OVERPASS_DIAGONAL_KM) return { features: [], skipped: "area_too_large" };
  const bbox = `(${search.south},${search.west},${search.north},${search.east})`;
  // A wide area would return thousands of hamlets; keep only the larger places there.
  const places = diagonalKm > WIDE_AREA_DIAGONAL_KM ? "city|town" : "city|town|village|hamlet|suburb|neighbourhood|quarter|locality|island";
  const query = `[out:json][timeout:20];
(
  nwr["military"]${bbox};
  nwr["landuse"="military"]${bbox};
  nwr["aeroway"~"^(aerodrome|heliport|airstrip)$"]${bbox};
  nwr["barrier"="border_control"]${bbox};
  nwr["harbour"]${bbox};
  nwr["landuse"="port"]${bbox};
  nwr["industrial"="port"]${bbox};
  nwr["power"~"^(plant|substation)$"]["name"]${bbox};
  nwr["amenity"~"^(police|prison|embassy)$"]["name"]${bbox};
  nwr["office"~"^(government|diplomatic)$"]["name"]${bbox};
  node["place"~"^(${places})$"]["name"]${bbox};
);
out center tags 300;`;

  const data = await getJson(OVERPASS, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `data=${encodeURIComponent(query)}`,
  }, 25000);

  const seen = new Set();
  const features = [];
  for (const el of data.elements || []) {
    const tags = el.tags || {};
    const kindIndex = KINDS.findIndex((k) => k.test(tags));
    if (kindIndex === -1) continue;
    const lat = el.lat ?? el.center?.lat;
    const lng = el.lon ?? el.center?.lon;
    if (typeof lat !== "number" || typeof lng !== "number") continue;
    const name = tags.name || tags["name:en"] || tags.official_name || "";
    const key = `${KINDS[kindIndex].id}|${name || `${lat.toFixed(3)},${lng.toFixed(3)}`}`;
    if (seen.has(key)) continue;
    seen.add(key);
    features.push({
      kind: KINDS[kindIndex].id,
      kindLabel: KINDS[kindIndex].label,
      kindIndex,
      name,
      nameEn: tags["name:en"] || "",
      nameHe: tags["name:he"] || "",
      detail: [tags.military, tags.aeroway, tags.power, tags.place, tags.operator].filter((v) => v && v !== "yes").join(", "),
      lat,
      lng,
      distanceKm: km(center, { lat, lng }),
    });
  }
  features.sort((a, b) => a.kindIndex - b.kindIndex || a.distanceKm - b.distanceKm);
  return { features: features.slice(0, MAX_FEATURES), total: features.length };
}

async function fetchAddress({ center }, diagonalKm) {
  const zoom = diagonalKm > 150 ? 5 : diagonalKm > 30 ? 8 : diagonalKm > 5 ? 10 : 14;
  const url = `${NOMINATIM}?format=jsonv2&lat=${center.lat}&lon=${center.lng}&zoom=${zoom}&accept-language=he,en&addressdetails=1`;
  const data = await getJson(url, {}, 12000);
  const a = data.address || {};
  return {
    display: data.display_name || "",
    country: a.country || "",
    region: a.state || a.region || a.province || "",
    district: a.county || a.state_district || a.district || "",
    locality: a.city || a.town || a.village || a.hamlet || a.suburb || "",
  };
}

async function fetchWikipedia({ center }, diagonalKm) {
  // The API caps the radius at 10 km.
  const radius = Math.round(Math.min(10000, Math.max(1000, (diagonalKm / 2) * 1000)));
  const url = `${WIKIPEDIA}?action=query&list=geosearch&gscoord=${center.lat}%7C${center.lng}&gsradius=${radius}&gslimit=20&format=json&origin=*`;
  const data = await getJson(url, {}, 12000);
  return (data.query?.geosearch || []).map((p) => ({
    title: p.title,
    url: `https://en.wikipedia.org/?curid=${p.pageid}`,
    distanceKm: p.dist / 1000,
  }));
}

// Every source is optional: one that is down or slow just leaves its part empty.
export async function gatherAreaContext(box) {
  const area = normalizeBox(box);
  const [osm, address, wiki] = await Promise.allSettled([
    fetchOsmFeatures(area, area.diagonalKm),
    fetchAddress(area, area.diagonalKm),
    fetchWikipedia(area, area.diagonalKm),
  ]);
  return {
    center: area.center,
    box,
    diagonalKm: area.diagonalKm,
    widened: area.widened,
    features: osm.status === "fulfilled" ? osm.value.features : [],
    featuresTotal: osm.status === "fulfilled" ? osm.value.total || 0 : 0,
    osmStatus: osm.status === "fulfilled" ? osm.value.skipped || "ok" : "failed",
    address: address.status === "fulfilled" ? address.value : null,
    wikipedia: wiki.status === "fulfilled" ? wiki.value : [],
  };
}
