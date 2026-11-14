import L from "leaflet";

// Names on the map (shape labels and place labels) placed without overlap.
// After every move or zoom, only names that fit next to the ones already
// placed are drawn; a name that would cover another one is folded into it,
// and that name shows a "+N" badge. Clicking the badge zooms into the folded
// names, which then spread out, much like clustered markers.
//
// Only the names that fit in view exist in the page at any time, instead of a
// permanent tooltip per shape, which keeps panning and zooming fast.

const PANE = "labelsPane";
const GAP = 4;              // minimum empty pixels between two names
const BADGE_W = 26;         // room taken by the "+N" badge

let measureCtx = null;
function textWidth(text, font) {
  if (!measureCtx) measureCtx = document.createElement("canvas").getContext("2d");
  measureCtx.font = font;
  return measureCtx.measureText(text).width;
}

const escapeHtml = (str) =>
  String(str == null ? "" : str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const PLACE_SIZES = { small: 11, medium: 14, large: 18 };

// Bounding box and its middle, read straight from the GeoJSON so it works
// before (or without) the shape being on the map.
function geoBounds(geojson) {
  let south = 90, north = -90, west = 180, east = -180;
  const walk = (c) => {
    if (typeof c[0] === "number") {
      west = Math.min(west, c[0]); east = Math.max(east, c[0]);
      south = Math.min(south, c[1]); north = Math.max(north, c[1]);
    } else c.forEach(walk);
  };
  const geom = geojson.type === "Feature" ? geojson.geometry : geojson;
  if (!geom || !geom.coordinates) return null;
  walk(geom.coordinates);
  if (south > north) return null;
  return L.latLngBounds([south, west], [north, east]);
}

export class LabelDeclutter {
  constructor(map) {
    this.map = map;
    if (!map.getPane(PANE)) {
      const pane = map.createPane(PANE);
      pane.style.zIndex = 640;           // above shapes and markers, below popups
      pane.style.pointerEvents = "none";
    }
    this.group = L.layerGroup().addTo(map);
    this.items = [];
    this.boundsCache = new Map();
    this.scheduled = false;
    this.onMove = () => this.schedule();
    this.onZoomStart = () => { map.getPane(PANE).style.opacity = "0"; };
    map.on("moveend zoomend resize", this.onMove);
    map.on("zoomstart", this.onZoomStart);
  }

  destroy() {
    this.map.off("moveend zoomend resize", this.onMove);
    this.map.off("zoomstart", this.onZoomStart);
    this.group.remove();
  }

  // shapes: [{ id, label, geojson }], places: [{ id, name, latitude, longitude, color, font_size }]
  setData(shapes, places) {
    const items = [];
    for (const p of places) {
      if (!p.name || !p.latitude || !p.longitude) continue;
      const size = PLACE_SIZES[p.font_size] || 14;
      items.push({
        kind: "place",
        text: p.name,
        latlng: L.latLng(p.latitude, p.longitude),
        font: `700 ${size}px "JetBrains Mono", monospace`,
        height: size + 6,
        pad: 0,
        color: p.color || "#facc15",
        size,
      });
    }
    for (const s of shapes) {
      if (!s.label) continue;
      const key = `${s.id}|${s.geojson.length}`;
      let bounds = this.boundsCache.get(key);
      if (bounds === undefined) {
        try { bounds = geoBounds(JSON.parse(s.geojson)); } catch (e) { bounds = null; }
        this.boundsCache.set(key, bounds);
      }
      if (!bounds) continue;
      items.push({
        kind: "shape",
        text: s.label,
        latlng: bounds.getCenter(),
        bounds,
        font: `600 11px "JetBrains Mono", monospace`,
        height: 20,
        pad: 14,
      });
    }
    this.items = items;
    this.schedule();
  }

  schedule() {
    if (this.scheduled) return;
    this.scheduled = true;
    requestAnimationFrame(() => {
      this.scheduled = false;
      this.render();
    });
  }

  render() {
    const map = this.map;
    if (!map._loaded) return;
    const view = map.getBounds().pad(0.05);
    const size = map.getSize();

    // Who gets a name first: place labels the user wrote, then shapes that look
    // biggest on screen at this zoom.
    const candidates = [];
    for (const item of this.items) {
      if (!view.contains(item.latlng)) continue;
      const pt = map.latLngToContainerPoint(item.latlng);
      let area = Infinity;
      if (item.bounds) {
        const a = map.latLngToContainerPoint(item.bounds.getNorthWest());
        const b = map.latLngToContainerPoint(item.bounds.getSouthEast());
        area = Math.abs(b.x - a.x) * Math.abs(b.y - a.y);
      }
      candidates.push({ item, pt, area });
    }
    candidates.sort((a, b) => (a.item.kind === b.item.kind ? b.area - a.area : a.item.kind === "place" ? -1 : 1));

    const placed = [];
    for (const c of candidates) {
      const w = textWidth(c.item.text, c.item.font) + c.item.pad;
      const box = { x0: c.pt.x - w / 2, x1: c.pt.x + w / 2, y0: c.pt.y - c.item.height / 2, y1: c.pt.y + c.item.height / 2 };
      if (box.x1 < 0 || box.x0 > size.x || box.y1 < 0 || box.y0 > size.y) continue;
      // Every name keeps room on its right for a badge it may get later.
      const hit = placed.find((p) =>
        box.x0 < p.box.x1 + BADGE_W + GAP && box.x1 + BADGE_W + GAP > p.box.x0 &&
        box.y0 < p.box.y1 + GAP && box.y1 + GAP > p.box.y0);
      if (hit) hit.members.push(c.item);
      else placed.push({ ...c, box, members: [] });
    }

    this.group.clearLayers();
    for (const p of placed) this.group.addLayer(this.labelMarker(p));
    map.getPane(PANE).style.opacity = "1";
  }

  labelMarker(p) {
    const { item, members } = p;
    const badge = members.length
      ? `<button type="button" class="map-label-badge" title="${members.length} שמות נוספים כאן — לחץ להגדלה">+${members.length}</button>`
      : "";
    const text = escapeHtml(item.text);
    const html = item.kind === "place"
      ? `<div class="map-place-label" style="color:${item.color};font-size:${item.size}px">${text}${badge}</div>`
      : `<div class="map-shape-label">${text}${badge}</div>`;
    const marker = L.marker(item.latlng, {
      pane: PANE,
      interactive: false,
      keyboard: false,
      icon: L.divIcon({ className: "map-label-anchor", html, iconSize: [0, 0], iconAnchor: [0, 0] }),
    });
    if (members.length) {
      marker.on("add", () => {
        const btn = marker.getElement()?.querySelector(".map-label-badge");
        if (!btn) return;
        L.DomEvent.disableClickPropagation(btn);
        btn.addEventListener("click", () => {
          const all = [item, ...members];
          const bounds = L.latLngBounds(all.map((m) => m.latlng));
          all.forEach((m) => m.bounds && bounds.extend(m.bounds));
          const next = Math.min(this.map.getBoundsZoom(bounds.pad(0.2)), this.map.getMaxZoom());
          // Always zoom in at least two steps, so names close together come apart.
          this.map.flyTo(bounds.getCenter(), Math.max(next, this.map.getZoom() + 2), { duration: 0.6 });
        });
      });
    }
    return marker;
  }
}
