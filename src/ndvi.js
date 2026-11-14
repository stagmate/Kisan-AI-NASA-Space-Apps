// Crop greenness (NDVI) from NASA MODIS MOD13Q1 (Terra) and MYD13Q1 (Aqua) v061:
// 250 m, 16-day composites, staggered so together they give a reading every 8 days.
// The same NASA product is mirrored as cloud-optimised GeoTIFFs on Microsoft Planetary Computer,
// which lets us read just the one pixel over the farm, without an account.
// https://planetarycomputer.microsoft.com/dataset/modis-13Q1-061

import { fromUrl } from 'geotiff';
import { fetchJson, makeCache, roundCoord } from './http.js';

export const STAC_SEARCH = 'https://planetarycomputer.microsoft.com/api/stac/v1/search';
export const TOKEN_BASE = 'https://planetarycomputer.microsoft.com/api/sas/v1/token';
export const NDVI_ASSET = '250m_16_days_NDVI';
export const QA_ASSET = '250m_16_days_pixel_reliability';
export const SPHERE_RADIUS = 6371007.181; // MODIS sinusoidal grid sphere (m)
export const GRID_X0 = -20015109.354; // left edge of tile h00
export const GRID_Y0 = 10007554.677; // top edge of tile v00
export const TILE_SIZE = 1111950.5197; // metres per tile
export const TILE_PIXELS = 4800; // 250 m product
const cached = makeCache(12 * 60 * 60 * 1000);
export const tokenCache = makeCache(30 * 60 * 1000);

/** Latitude/longitude → MODIS sinusoidal metres. */
export function toSinusoidal(lat, lon) {
  const rad = Math.PI / 180;
  return { x: SPHERE_RADIUS * lon * rad * Math.cos(lat * rad), y: SPHERE_RADIUS * lat * rad };
}

/** MODIS tile (h, v) and pixel (col, row) for a point on the 250 m sinusoidal grid. */
export function tilePixel(lat, lon) {
  const { x, y } = toSinusoidal(lat, lon);
  const gx = (x - GRID_X0) / TILE_SIZE;
  const gy = (GRID_Y0 - y) / TILE_SIZE;
  const h = Math.floor(gx);
  const v = Math.floor(gy);
  return {
    h,
    v,
    col: Math.min(TILE_PIXELS - 1, Math.floor((gx - h) * TILE_PIXELS)),
    row: Math.min(TILE_PIXELS - 1, Math.floor((gy - v) * TILE_PIXELS)),
  };
}

/** "https://<account>.blob.core.windows.net/<container>/…" → token path "<account>/<container>". */
export function storagePath(href) {
  const u = new URL(href);
  return `${u.hostname.split('.')[0]}/${u.pathname.split('/')[1]}`;
}

/**
 * Join NDVI and pixel-reliability readings into a clean series.
 * Reliability: 0 good, 1 marginal, 2 snow/ice, 3 cloudy, -1 no data. Only 0 and 1 are kept.
 * Each reading: { date: 'YYYY-MM-DD', ndviRaw: int16, qa: int }
 */
export function buildSeries(readings) {
  return readings
    .filter((r) => typeof r.ndviRaw === 'number' && r.ndviRaw > -2000 && (r.qa == null || r.qa === 0 || r.qa === 1))
    .map((r) => ({ date: r.date, ndvi: Math.round(r.ndviRaw) / 10000 }))
    .sort((p, q) => p.date.localeCompare(q.date));
}

/** Summary codes: health band for the latest reading and the trend over ~1 month. */
export function summarizeNdvi(series) {
  if (!series.length) return { latest: null, status: 'no_clear_image', trend: null };
  const latest = series[series.length - 1];
  const latestTime = Date.parse(latest.date);
  const monthAgo = [...series].reverse().find((p) => latestTime - Date.parse(p.date) >= 25 * 864e5);
  const status = latest.ndvi < 0.2 ? 'bare' : latest.ndvi < 0.4 ? 'sparse' : latest.ndvi < 0.6 ? 'moderate' : 'dense';
  let trend = null;
  if (monthAgo) {
    const diff = latest.ndvi - monthAgo.ndvi;
    trend = diff > 0.05 ? 'greening' : diff < -0.05 ? 'browning' : 'steady';
  }
  const peak = series.reduce((p, q) => (q.ndvi > p.ndvi ? q : p));
  return { latest, status, trend, peak };
}

/** Run async jobs with at most `limit` in flight. */
async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i], i);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

async function readPixel(href, token, px) {
  const tiff = await fromUrl(`${href}?${token}`, { allowFullFile: false });
  const image = await tiff.getImage();
  const [band] = await image.readRasters({ window: [px.col, px.row, px.col + 1, px.row + 1] });
  return band[0];
}

export async function getNdvi(lat, lon, { months = 8, now = new Date(), fetchImpl = fetch } = {}) {
  const la = roundCoord(lat);
  const lo = roundCoord(lon);
  return cached(`${la},${lo}`, async () => {
    const since = new Date(now.getTime() - months * 30.5 * 864e5).toISOString();
    const search = await fetchJson('MODIS', STAC_SEARCH, {
      fetchImpl,
      timeoutMs: 20_000,
      method: 'POST',
      body: JSON.stringify({
        collections: ['modis-13Q1-061'],
        intersects: { type: 'Point', coordinates: [lo, la] },
        datetime: `${since}/${now.toISOString()}`,
        limit: 40,
      }),
    });
    const px = tilePixel(la, lo);
    const tileId = `h${String(px.h).padStart(2, '0')}v${String(px.v).padStart(2, '0')}`;
    // Keep one item per product and period, on the tile that contains the point.
    const seen = new Set();
    const items = (search.features ?? []).filter((f) => {
      if (!f.assets?.[NDVI_ASSET] || !f.id.includes(`.${tileId}.`)) return false;
      const key = f.id.split('.').slice(0, 2).join('.');
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    if (!items.length) return { series: [], ...summarizeNdvi([]), source: SOURCE };

    const path = storagePath(items[0].assets[NDVI_ASSET].href);
    const { token } = await tokenCache(path, () => fetchJson('MODIS', `${TOKEN_BASE}/${path}`, { fetchImpl, timeoutMs: 15_000 }));

    const readings = await mapLimit(items, 6, async (item) => {
      try {
        const [ndviRaw, qa] = await Promise.all([
          readPixel(item.assets[NDVI_ASSET].href, token, px),
          item.assets[QA_ASSET] ? readPixel(item.assets[QA_ASSET].href, token, px) : null,
        ]);
        return { date: item.properties.start_datetime.slice(0, 10), ndviRaw, qa };
      } catch (err) {
        console.error(`MODIS pixel read failed for ${item.id}: ${err.message}`);
        return null;
      }
    });
    const ok = readings.filter(Boolean);
    if (!ok.length) throw new Error('MODIS: could not read satellite images');
    const series = buildSeries(ok);
    return { series, ...summarizeNdvi(series), source: SOURCE };
  });
}

/**
 * "Normal" greenness for the latest image's time of year: the same ±12-day window in each of the
 * previous `years` years, clear pixels only. Returns { normal, values: [{ date, ndvi }] }.
 */
export async function getNdviNormal(lat, lon, isoDate, { years = 3, fetchImpl = fetch } = {}) {
  const la = roundCoord(lat);
  const lo = roundCoord(lon);
  return normalCache(`${la},${lo},${isoDate}`, async () => {
    const px = tilePixel(la, lo);
    const tileId = `h${String(px.h).padStart(2, '0')}v${String(px.v).padStart(2, '0')}`;
    const base = new Date(`${isoDate}T00:00:00Z`);
    const windows = Array.from({ length: years }, (_, i) => {
      const d = new Date(base);
      d.setUTCFullYear(base.getUTCFullYear() - (i + 1));
      return [new Date(d.getTime() - 12 * 864e5).toISOString(), new Date(d.getTime() + 12 * 864e5).toISOString()];
    });
    const searches = await Promise.all(windows.map(([from, to]) => fetchJson('MODIS', STAC_SEARCH, {
      fetchImpl,
      timeoutMs: 20_000,
      method: 'POST',
      body: JSON.stringify({ collections: ['modis-13Q1-061'], intersects: { type: 'Point', coordinates: [lo, la] }, datetime: `${from}/${to}`, limit: 10 }),
    })));
    const items = searches.flatMap((s) => (s.features ?? []).filter((f) => f.assets?.[NDVI_ASSET] && f.id.includes(`.${tileId}.`)));
    if (!items.length) return { normal: null, values: [] };
    const path = storagePath(items[0].assets[NDVI_ASSET].href);
    const { token } = await tokenCache(path, () => fetchJson('MODIS', `${TOKEN_BASE}/${path}`, { fetchImpl, timeoutMs: 15_000 }));
    const readings = await mapLimit(items, 6, async (item) => {
      try {
        const [ndviRaw, qa] = await Promise.all([
          readPixel(item.assets[NDVI_ASSET].href, token, px),
          item.assets[QA_ASSET] ? readPixel(item.assets[QA_ASSET].href, token, px) : null,
        ]);
        return { date: item.properties.start_datetime.slice(0, 10), ndviRaw, qa };
      } catch {
        return null;
      }
    });
    const values = buildSeries(readings.filter(Boolean));
    const normal = values.length ? Math.round((values.reduce((s, v) => s + v.ndvi, 0) / values.length) * 1000) / 1000 : null;
    return { normal, values };
  });
}
const normalCache = makeCache(24 * 60 * 60 * 1000);

const SOURCE = 'NASA MODIS MOD13Q1/MYD13Q1 v061 (via Microsoft Planetary Computer)';
