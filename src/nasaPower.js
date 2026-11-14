// NASA POWER climatology client.
// Docs: https://power.larc.nasa.gov/docs/services/api/temporal/climatology/
// Returns long-term monthly averages for a point: temperature, extremes,
// rainfall, humidity and solar radiation.

export const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
export const DAYS_IN_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

const PARAMETERS = ['T2M', 'T2M_RANGE', 'T2M_MAX', 'T2M_MIN', 'PRECTOTCORR', 'RH2M', 'ALLSKY_SFC_SW_DWN'];
const BASE_URL = 'https://power.larc.nasa.gov/api/temporal/climatology/point';
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

const cache = new Map();

export function validateCoords(lat, lon) {
  const la = Number(lat);
  const lo = Number(lon);
  if (!Number.isFinite(la) || la < -90 || la > 90) throw new RangeError('Latitude must be between -90 and 90');
  if (!Number.isFinite(lo) || lo < -180 || lo > 180) throw new RangeError('Longitude must be between -180 and 180');
  // POWER's grid is ~0.5°; rounding keeps the cache useful without losing detail.
  return { lat: Math.round(la * 100) / 100, lon: Math.round(lo * 100) / 100 };
}

export function buildUrl(lat, lon) {
  const qs = new URLSearchParams({
    parameters: PARAMETERS.join(','),
    community: 'AG',
    latitude: String(lat),
    longitude: String(lon),
    format: 'JSON',
  });
  return `${BASE_URL}?${qs}`;
}

const round1 = (n) => Math.round(n * 10) / 10;

// POWER uses -999 for missing values.
function clean(v) {
  return typeof v === 'number' && v > -900 ? v : null;
}

/** Turn a raw POWER response into one record per month. */
export function parseClimatology(json) {
  const p = json?.properties?.parameter;
  if (!p || !p.T2M || !p.PRECTOTCORR) throw new Error('NASA POWER response is missing temperature or rainfall data');
  const months = MONTHS.map((m, i) => {
    const rainPerDay = clean(p.PRECTOTCORR[m]);
    const tempMean = clean(p.T2M[m]);
    const range = clean(p.T2M_RANGE?.[m]);
    return {
      month: m,
      index: i,
      tempMean,
      // Typical afternoon high / night low: monthly mean ± half the mean daily range.
      dayHigh: tempMean != null && range != null ? round1(tempMean + range / 2) : null,
      nightLow: tempMean != null && range != null ? round1(tempMean - range / 2) : null,
      // Record extremes over the climatology period.
      tempMax: clean(p.T2M_MAX?.[m]),
      tempMin: clean(p.T2M_MIN?.[m]),
      rainMm: rainPerDay == null ? null : Math.round(rainPerDay * DAYS_IN_MONTH[i] * 10) / 10,
      humidity: clean(p.RH2M?.[m]),
      solar: clean(p.ALLSKY_SFC_SW_DWN?.[m]),
    };
  });
  if (months.some((m) => m.tempMean == null || m.rainMm == null)) {
    throw new Error('NASA POWER returned incomplete monthly data for this location');
  }
  const [lon, lat, elevation] = json.geometry?.coordinates ?? [];
  return { lat, lon, elevation: clean(elevation), months };
}

export async function getClimatology(latIn, lonIn, { fetchImpl = fetch, now = Date.now } = {}) {
  const { lat, lon } = validateCoords(latIn, lonIn);
  const key = `${lat},${lon}`;
  const hit = cache.get(key);
  if (hit && now() - hit.at < CACHE_TTL_MS) return hit.data;

  const res = await fetchImpl(buildUrl(lat, lon), { signal: AbortSignal.timeout(30_000) });
  if (!res.ok) throw new Error(`NASA POWER request failed (HTTP ${res.status})`);
  const data = parseClimatology(await res.json());
  cache.set(key, { at: now(), data });
  return data;
}

export function clearCache() {
  cache.clear();
}
