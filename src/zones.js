// Field-level vulnerability zones: a 7×7 grid of MODIS 250 m pixels (~1.75 km square) around the field.
// For each cell: greenness now and a year ago (MODIS NDVI via Planetary Computer), ground height from the
// Copernicus 90 m DEM (via Open-Meteo), and from those three explainable flags:
//   erosion  – slope × how bare the ground is (steep and bare washes away)
//   stress   – much less green than the neighbouring cells AND than the same cell last year
//   frost    – a low spot compared with its surroundings, where cold air settles on still nights
// Coarse by design: one cell is 6 hectares, so this shows parts of a farm or a village, not plant rows.

import { fromUrl } from 'geotiff';
import { fetchJson, makeCache, roundCoord } from './http.js';
import {
  STAC_SEARCH, TOKEN_BASE, NDVI_ASSET, SPHERE_RADIUS, GRID_X0, GRID_Y0, TILE_SIZE, TILE_PIXELS,
  tilePixel, storagePath, tokenCache,
} from './ndvi.js';

const HALF = 3; // 7×7 grid
const PIXEL = TILE_SIZE / TILE_PIXELS; // ≈ 231.66 m
const cached = makeCache(12 * 60 * 60 * 1000);

/** Sinusoidal (x, y) metres → latitude/longitude. */
export function fromSinusoidal(x, y) {
  const lat = y / SPHERE_RADIUS;
  const lon = x / (SPHERE_RADIUS * Math.cos(lat));
  return [(lat * 180) / Math.PI, (lon * 180) / Math.PI];
}

/** Corners of a pixel (h, v, col, row) as [[lat, lon] × 4]. */
export function pixelPolygon(h, v, col, row) {
  const x0 = GRID_X0 + h * TILE_SIZE + col * PIXEL;
  const y0 = GRID_Y0 - v * TILE_SIZE - row * PIXEL;
  return [
    fromSinusoidal(x0, y0),
    fromSinusoidal(x0 + PIXEL, y0),
    fromSinusoidal(x0 + PIXEL, y0 - PIXEL),
    fromSinusoidal(x0, y0 - PIXEL),
  ].map(([a, b]) => [Math.round(a * 1e6) / 1e6, Math.round(b * 1e6) / 1e6]);
}

const median = (xs) => {
  const s = xs.filter((x) => x != null).sort((a, b) => a - b);
  return s.length ? s[Math.floor(s.length / 2)] : null;
};

/** Slope (%) of each cell from its neighbours' heights (central differences). */
export function slopes(elev, n, spacing = PIXEL) {
  const at = (r, c) => elev[Math.max(0, Math.min(n - 1, r)) * n + Math.max(0, Math.min(n - 1, c))];
  const out = [];
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      const dx = (at(r, c + 1) - at(r, c - 1)) / ((c === 0 || c === n - 1 ? 1 : 2) * spacing);
      const dy = (at(r + 1, c) - at(r - 1, c)) / ((r === 0 || r === n - 1 ? 1 : 2) * spacing);
      out.push(Math.round(Math.hypot(dx, dy) * 1000) / 10);
    }
  }
  return out;
}

/** Turn the raw grids into flagged cells. Pure, so it can be tested without the network. */
export function classifyCells({ ndviNow, ndviLastYear, elev, n = 2 * HALF + 1, frostClimate = false }) {
  const slope = slopes(elev, n);
  const med = median(ndviNow);
  const meanElev = elev.reduce((a, b) => a + b, 0) / elev.length;
  return ndviNow.map((ndvi, i) => {
    const last = ndviLastYear?.[i] ?? null;
    const bare = ndvi == null ? 0.5 : Math.max(0, 1 - Math.min(ndvi, 0.6) / 0.6);
    const erosionScore = slope[i] * (0.3 + bare);
    const erosion = erosionScore >= 4 ? 'high' : erosionScore >= 1.5 ? 'medium' : 'low';
    const stress = ndvi != null && med != null && ndvi < med - 0.1 && (last == null || ndvi < last - 0.1);
    // A cell clearly below its surroundings collects cold air on calm, clear nights.
    const frost = frostClimate && elev[i] < meanElev - 3;
    return {
      ndvi: ndvi == null ? null : Math.round(ndvi * 100) / 100,
      ndviLastYear: last == null ? null : Math.round(last * 100) / 100,
      elevation: Math.round(elev[i]),
      slopePct: slope[i],
      erosion,
      stress,
      frost,
    };
  });
}

async function readWindow(href, token, col0, row0, n) {
  const tiff = await fromUrl(`${href}?${token}`, { allowFullFile: false });
  const image = await tiff.getImage();
  const [band] = await image.readRasters({ window: [col0, row0, col0 + n, row0 + n] });
  return Array.from(band, (v) => (v > -2000 ? v / 10000 : null));
}

async function latestItem(lat, lon, from, to, tileId, fetchImpl) {
  const json = await fetchJson('MODIS', STAC_SEARCH, {
    fetchImpl,
    timeoutMs: 20_000,
    method: 'POST',
    body: JSON.stringify({ collections: ['modis-13Q1-061'], intersects: { type: 'Point', coordinates: [lon, lat] }, datetime: `${from}/${to}`, limit: 12 }),
  });
  return (json.features ?? [])
    .filter((f) => f.assets?.[NDVI_ASSET] && f.id.includes(`.${tileId}.`))
    .sort((a, b) => b.properties.start_datetime.localeCompare(a.properties.start_datetime))[0] ?? null;
}

export async function getZones(lat, lon, { frostClimate = false, now = new Date(), fetchImpl = fetch } = {}) {
  const la = roundCoord(lat);
  const lo = roundCoord(lon);
  return cached(`${la},${lo},${frostClimate}`, async () => {
    const n = 2 * HALF + 1;
    const px = tilePixel(la, lo);
    const tileId = `h${String(px.h).padStart(2, '0')}v${String(px.v).padStart(2, '0')}`;
    // Keep the window inside the tile (fields right on a tile edge get a slightly off-centre grid).
    const col0 = Math.max(0, Math.min(TILE_PIXELS - n, px.col - HALF));
    const row0 = Math.max(0, Math.min(TILE_PIXELS - n, px.row - HALF));
    const iso = (d) => d.toISOString();
    const nowItem = await latestItem(la, lo, iso(new Date(now.getTime() - 60 * 864e5)), iso(now), tileId, fetchImpl);
    if (!nowItem) throw new Error('MODIS: no recent image for this area');
    // Same time of year in an earlier year: try 1, then 2, then 3 years back (the archive has gaps).
    const nowDate = new Date(nowItem.properties.start_datetime);
    let lastItem = null;
    for (let y = 1; y <= 3 && !lastItem; y++) {
      const d = new Date(nowDate);
      d.setUTCFullYear(nowDate.getUTCFullYear() - y);
      lastItem = await latestItem(la, lo, iso(new Date(d.getTime() - 12 * 864e5)), iso(new Date(d.getTime() + 12 * 864e5)), tileId, fetchImpl);
    }
    const path = storagePath(nowItem.assets[NDVI_ASSET].href);
    const { token } = await tokenCache(path, () => fetchJson('MODIS', `${TOKEN_BASE}/${path}`, { fetchImpl, timeoutMs: 15_000 }));

    const polygons = [];
    const centres = [];
    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) {
        const poly = pixelPolygon(px.h, px.v, col0 + c, row0 + r);
        polygons.push(poly);
        centres.push([(poly[0][0] + poly[2][0]) / 2, (poly[0][1] + poly[2][1]) / 2]);
      }
    }
    const elevUrl = `https://api.open-meteo.com/v1/elevation?latitude=${centres.map((p) => p[0].toFixed(5)).join(',')}&longitude=${centres.map((p) => p[1].toFixed(5)).join(',')}`;
    const [ndviNow, ndviLastYear, elevJson] = await Promise.all([
      readWindow(nowItem.assets[NDVI_ASSET].href, token, col0, row0, n),
      lastItem ? readWindow(lastItem.assets[NDVI_ASSET].href, token, col0, row0, n).catch(() => null) : null,
      fetchJson('Open-Meteo elevation', elevUrl, { fetchImpl, timeoutMs: 15_000 }),
    ]);
    const elev = elevJson.elevation;
    if (!Array.isArray(elev) || elev.length !== n * n) throw new Error('Open-Meteo elevation: unexpected response');

    const cells = classifyCells({ ndviNow, ndviLastYear, elev, n, frostClimate }).map((cell, i) => ({ ...cell, polygon: polygons[i] }));
    const centre = cells[(px.row - row0) * n + (px.col - col0)];
    return {
      cells,
      centre: { slopePct: centre.slopePct, elevation: centre.elevation },
      counts: {
        erosionHigh: cells.filter((c) => c.erosion === 'high').length,
        erosionMedium: cells.filter((c) => c.erosion === 'medium').length,
        stress: cells.filter((c) => c.stress).length,
        frost: cells.filter((c) => c.frost).length,
      },
      dates: { now: nowItem.properties.start_datetime.slice(0, 10), lastYear: lastItem?.properties.start_datetime.slice(0, 10) ?? null },
      cellSizeM: Math.round(PIXEL),
      source: 'NASA MODIS MOD13Q1/MYD13Q1 NDVI (Planetary Computer) · Copernicus DEM 90 m (Open-Meteo)',
    };
  });
}
