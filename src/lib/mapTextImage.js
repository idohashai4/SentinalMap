// Draws the marked area exactly as the map shows it at the zoom the user was at
// when marking it, straight from the tiles of the layer on screen. The labels in
// this image are therefore the same labels the user saw: zooming in shows more
// detailed names (neighbourhoods, sites), zooming out only the major ones, and
// the researcher reads whatever was visible.
//
// SAT prints no text, so for it the OpenStreetMap map (the MAP layer) is drawn
// instead, at the same zoom. The researcher's own shapes, markers and names are
// never in the image: only the basemap tiles are.

const TILE = 256;
const MIN_READABLE = 560;   // small areas are enlarged to at least this width so the text is legible
const MAX_SCALE = 3;

const ESRI = (service) => `https://server.arcgisonline.com/ArcGIS/rest/services/${service}/MapServer/tile/{z}/{y}/{x}`;
const OSM = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";

// The tile sets each map layer is drawn from, bottom to top.
const LAYER_TILES = {
  street: [OSM],
  esri_street: [ESRI("World_Street_Map")],
  hybrid: [ESRI("World_Imagery"), ESRI("Reference/World_Boundaries_and_Places")],
  satellite: [OSM],
};

const lngToX = (lng, z) => ((lng + 180) / 360) * 2 ** z;
const latToY = (lat, z) => {
  const r = (lat * Math.PI) / 180;
  return ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * 2 ** z;
};

function loadTile(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`tile failed: ${url}`));
    img.src = url;
  });
}

async function drawLayers(templates, box, z) {
  const x0 = Math.floor(lngToX(box.west, z));
  const x1 = Math.floor(lngToX(box.east, z));
  const y0 = Math.floor(latToY(box.north, z));
  const y1 = Math.floor(latToY(box.south, z));
  const canvas = document.createElement("canvas");
  canvas.width = (x1 - x0 + 1) * TILE;
  canvas.height = (y1 - y0 + 1) * TILE;
  const ctx = canvas.getContext("2d");
  for (const template of templates) {
    const jobs = [];
    for (let x = x0; x <= x1; x++) {
      for (let y = y0; y <= y1; y++) {
        const url = template.replace("{z}", z).replace("{x}", x).replace("{y}", y);
        jobs.push(loadTile(url).then((img) => ({ img, x, y })));
      }
    }
    const loaded = await Promise.allSettled(jobs);
    const ok = loaded.filter((r) => r.status === "fulfilled").map((r) => r.value);
    if (!ok.length) throw new Error("map tiles unavailable");
    ok.forEach(({ img, x, y }) => ctx.drawImage(img, (x - x0) * TILE, (y - y0) * TILE));
  }
  return { canvas, x0, y0 };
}

// Returns a PNG data URL of the marked area, with a small margin around it so
// labels on its edge are not cut, and the marked area framed in orange (a ring
// for a single click).
// `outline`, when given, is the polygon that was marked: rings of [lng, lat].
export async function renderMapTextImage(marked, { zoom, layer = "street", point = false, outline = null }) {
  const z = Math.max(1, Math.min(19, Math.round(zoom)));
  const center = { lat: (marked.south + marked.north) / 2, lng: (marked.west + marked.east) / 2 };

  // Margin: a quarter of the area on each side, at least ~40 screen pixels.
  const degPerPxLng = 360 / (TILE * 2 ** z);
  const degPerPxLat = degPerPxLng * Math.cos((center.lat * Math.PI) / 180);
  const padLng = point ? degPerPxLng * 80 : Math.max((marked.east - marked.west) * 0.25, degPerPxLng * 40);
  const padLat = point ? degPerPxLat * 80 : Math.max((marked.north - marked.south) * 0.25, degPerPxLat * 40);
  const box = { south: marked.south - padLat, north: marked.north + padLat, west: marked.west - padLng, east: marked.east + padLng };

  let drawn;
  try {
    drawn = await drawLayers(LAYER_TILES[layer] || [OSM], box, z);
  } catch (e) {
    if ((LAYER_TILES[layer] || [OSM])[0] === OSM) throw e;
    drawn = await drawLayers([OSM], box, z);   // the layer's own tiles refused to load: OSM instead
  }
  const { canvas, x0, y0 } = drawn;

  const left = (lngToX(box.west, z) - x0) * TILE;
  const top = (latToY(box.north, z) - y0) * TILE;
  const width = Math.max(1, (lngToX(box.east, z) - x0) * TILE - left);
  const height = Math.max(1, (latToY(box.south, z) - y0) * TILE - top);

  // Same zoom, same labels - only enlarged when the area is small on screen.
  const scale = Math.min(MAX_SCALE, Math.max(1, MIN_READABLE / width));
  const out = document.createElement("canvas");
  out.width = Math.round(width * scale);
  out.height = Math.round(height * scale);
  const g = out.getContext("2d");
  g.imageSmoothingQuality = "high";
  g.drawImage(canvas, left, top, width, height, 0, 0, out.width, out.height);

  const px = (lng) => ((lngToX(lng, z) - x0) * TILE - left) * scale;
  const py = (lat) => ((latToY(lat, z) - y0) * TILE - top) * scale;
  g.strokeStyle = "#f97316";
  g.lineWidth = 4;
  if (outline) {
    g.beginPath();
    for (const ring of outline) {
      ring.forEach(([lng, lat], i) => (i ? g.lineTo(px(lng), py(lat)) : g.moveTo(px(lng), py(lat))));
      g.closePath();
    }
    g.stroke();
  } else if (point) {
    g.beginPath();
    g.arc(px(center.lng), py(center.lat), 18, 0, Math.PI * 2);
    g.stroke();
  } else {
    g.strokeRect(px(marked.west), py(marked.north), px(marked.east) - px(marked.west), py(marked.south) - py(marked.north));
  }
  return out.toDataURL("image/png");
}
