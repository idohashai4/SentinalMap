import { toPoint as mgrsToPoint } from "mgrs";

// Finds a coordinate in free text, as people post them: decimal degrees in
// either order and with or without N/S/E/W, degrees-minutes-seconds, map
// links (Google, Apple, OpenStreetMap, Bing, Yandex) and MGRS grid references.
// Returns { lat, lng, format } or null.

const valid = (lat, lng) => Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180 && !(lat === 0 && lng === 0);

function fromLink(text) {
  // Yandex writes longitude first.
  const yandex = /yandex\.[a-z.]+\/maps[^\s]*[?&]ll=(-?\d{1,3}\.\d+)(?:,|%2C)(-?\d{1,2}\.\d+)/i.exec(text);
  if (yandex && valid(parseFloat(yandex[2]), parseFloat(yandex[1]))) {
    return { lat: parseFloat(yandex[2]), lng: parseFloat(yandex[1]), format: "קישור מפה" };
  }
  const tries = [
    [/@(-?\d{1,2}\.\d+),\s*(-?\d{1,3}\.\d+)/, false],                                   // google.com/maps/@lat,lng
    [/[?&](?:q|ll|query|center|daddr|destination|sll|coordinates)=(-?\d{1,2}\.\d+)(?:,|%2C)\s*(-?\d{1,3}\.\d+)/i, false],
    [/#map=\d+(?:\.\d+)?\/(-?\d{1,2}\.\d+)\/(-?\d{1,3}\.\d+)/, false],                // openstreetmap.org/#map=z/lat/lng
    [/[?&]cp=(-?\d{1,2}\.\d+)~(-?\d{1,3}\.\d+)/, false],                                // bing.com/maps?cp=lat~lng
  ];
  for (const [re, lngFirst] of tries) {
    const m = re.exec(text);
    if (!m) continue;
    const a = parseFloat(m[1]);
    const b = parseFloat(m[2]);
    const [lat, lng] = lngFirst ? [b, a] : [a, b];
    if (valid(lat, lng)) return { lat, lng, format: "קישור מפה" };
  }
  return null;
}

// One coordinate written with degrees and optional minutes/seconds and a hemisphere letter.
const HEMI = "NSEWnsew";
const DMS_PART = String.raw`([NSEW])?\s*(\d{1,3}(?:[.,]\d+)?)\s*(?:°|º|˚|deg|d|\s)\s*(?:(\d{1,2}(?:[.,]\d+)?)\s*(?:'|′|’|m|min|\s)\s*)?(?:(\d{1,2}(?:[.,]\d+)?)\s*(?:"|″|”|''|s|sec)?\s*)?([NSEW])?`;

function fromDms(text) {
  const re = new RegExp(DMS_PART, "gi");
  const found = [];
  let m;
  while ((m = re.exec(text)) && found.length < 4) {
    if (!m[0].trim()) { re.lastIndex++; continue; }
    const hemi = (m[1] || m[5] || "").toUpperCase();
    const hasMinutes = m[3] !== undefined;
    if (!hemi && !hasMinutes) continue;          // plain numbers are handled by fromDecimal
    const num = (v) => (v === undefined ? 0 : parseFloat(v.replace(",", ".")));
    let value = num(m[2]) + num(m[3]) / 60 + num(m[4]) / 3600;
    if (hemi === "S" || hemi === "W") value = -value;
    found.push({ value, hemi, minutes: hasMinutes });
  }
  if (found.length < 2) return null;
  const [a, b] = found;
  let lat = a.value;
  let lng = b.value;
  const format = a.minutes || b.minutes ? "מעלות-דקות-שניות" : "מעלות עשרוניות";
  if ("EW".includes(a.hemi) && a.hemi && "NS".includes(b.hemi) && b.hemi) [lat, lng] = [b.value, a.value];
  if (!a.hemi && !b.hemi && Math.abs(lat) > 90) [lat, lng] = [lng, lat];
  return valid(lat, lng) ? { lat, lng, format } : null;
}

function fromDecimal(text) {
  // Two decimal numbers, each optionally signed or carrying a hemisphere letter.
  const re = /([NSEW])?\s*(-?\d{1,3}\.\d+)\s*°?\s*([NSEW])?/gi;
  const found = [];
  let m;
  while ((m = re.exec(text)) && found.length < 2) {
    const hemi = (m[1] || m[3] || "").toUpperCase();
    let value = parseFloat(m[2]);
    if (hemi === "S" || hemi === "W") value = -Math.abs(value);
    found.push({ value, hemi });
  }
  if (found.length < 2) return null;
  const [a, b] = found;
  let lat = a.value;
  let lng = b.value;
  // Explicit hemispheres decide the order; otherwise latitude first, unless it can't be one.
  if ((a.hemi === "E" || a.hemi === "W") && (b.hemi === "N" || b.hemi === "S")) [lat, lng] = [b.value, a.value];
  else if (Math.abs(lat) > 90 && Math.abs(lng) <= 90) [lat, lng] = [lng, lat];
  return valid(lat, lng) ? { lat, lng, format: "מעלות עשרוניות" } : null;
}

function fromMgrs(text) {
  const m = /\b(\d{1,2}[C-HJ-NP-X])\s*([A-HJ-NP-Z]{2})\s*(\d{1,5})\s*(\d{1,5})?\b/i.exec(text);
  if (!m) return null;
  let digits = m[3] + (m[4] || "");
  if (digits.length % 2) return null;
  try {
    const [lng, lat] = mgrsToPoint(`${m[1]}${m[2]}${digits}`.toUpperCase());
    return valid(lat, lng) ? { lat, lng, format: "MGRS" } : null;
  } catch (e) {
    return null;
  }
}

export function parseCoordinates(input) {
  const text = String(input || "").replace(/[‎‏‪-‮]/g, "").trim();
  if (!text) return null;
  return fromLink(text) || fromMgrs(text) || fromDms(text) || fromDecimal(text);
}

export const formatCoordinates = ({ lat, lng }) => `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
