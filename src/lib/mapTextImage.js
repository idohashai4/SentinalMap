// Draws the OpenStreetMap map (the MAP layer, which prints place and site names)
// for an area straight from its tiles, whatever layer is on screen. The image is
// what the researcher reads the map's text from, so it works on SAT as well.

const TILE_URL = (z, x, y) => `https://tile.openstreetmap.org/${z}/${x}/${y}.png`;
const TILE = 256;
const MAX_TILES = 16;       // at most a 4×4 block: ~1 MB of image, one quick request
const TARGET_WIDTH = 640;   // zoom in until the area is at least this wide, so labels are legible

const lngToX = (lng, z) => ((lng + 180) / 360) * 2 ** z;
const latToY = (lat, z) => {
  const r = (lat * Math.PI) / 180;
  return ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * 2 ** z;
};

function tileRange(box, z) {
  const x0 = Math.floor(lngToX(box.west, z));
  const x1 = Math.floor(lngToX(box.east, z));
  const y0 = Math.floor(latToY(box.north, z));
  const y1 = Math.floor(latToY(box.south, z));
  return { x0, x1, y0, y1, count: (x1 - x0 + 1) * (y1 - y0 + 1) };
}

// The most detailed zoom at which the area still fits in MAX_TILES tiles,
// starting from what is on screen and zooming in while the area is small.
function chooseZoom(box, screenZoom) {
  let z = Math.max(3, Math.min(18, Math.round(screenZoom)));
  const width = (zoom) => (lngToX(box.east, zoom) - lngToX(box.west, zoom)) * TILE;
  while (z < 18 && width(z) < TARGET_WIDTH && tileRange(box, z + 1).count <= MAX_TILES) z++;
  while (z > 3 && tileRange(box, z).count > MAX_TILES) z--;
  return z;
}

function loadTile(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`tile failed: ${url}`));
    img.src = url;
  });
}

// Returns a PNG data URL of the area on the OpenStreetMap map.
export async function renderMapTextImage(box, screenZoom) {
  const z = chooseZoom(box, screenZoom);
  const { x0, x1, y0, y1 } = tileRange(box, z);
  const canvas = document.createElement("canvas");
  canvas.width = (x1 - x0 + 1) * TILE;
  canvas.height = (y1 - y0 + 1) * TILE;
  const ctx = canvas.getContext("2d");

  const jobs = [];
  for (let x = x0; x <= x1; x++) {
    for (let y = y0; y <= y1; y++) {
      jobs.push(loadTile(TILE_URL(z, x, y)).then((img) => ctx.drawImage(img, (x - x0) * TILE, (y - y0) * TILE)));
    }
  }
  const loaded = await Promise.allSettled(jobs);
  if (loaded.every((r) => r.status === "rejected")) throw new Error("map tiles unavailable");

  // Crop the tile block to the area itself.
  const left = Math.round((lngToX(box.west, z) - x0) * TILE);
  const top = Math.round((latToY(box.north, z) - y0) * TILE);
  const width = Math.max(1, Math.round((lngToX(box.east, z) - x0) * TILE) - left);
  const height = Math.max(1, Math.round((latToY(box.south, z) - y0) * TILE) - top);
  const crop = document.createElement("canvas");
  crop.width = width;
  crop.height = height;
  crop.getContext("2d").drawImage(canvas, left, top, width, height, 0, 0, width, height);
  return crop.toDataURL("image/png");
}
