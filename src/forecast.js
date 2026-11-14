// 7-day weather forecast and modelled soil moisture from Open-Meteo,
// turned into a simple "should I water this week?" answer.
// https://open-meteo.com/en/docs

import { fetchJson, makeCache, roundCoord } from './http.js';
import { TEXTURE_WATER } from './soil.js';

const URL_BASE = 'https://api.open-meteo.com/v1/forecast';
const cached = makeCache(60 * 60 * 1000);

export function buildUrl(lat, lon) {
  const qs = new URLSearchParams({
    latitude: String(lat),
    longitude: String(lon),
    daily: 'precipitation_sum,precipitation_probability_max,et0_fao_evapotranspiration,temperature_2m_max,temperature_2m_min',
    hourly: 'soil_moisture_0_to_1cm,soil_moisture_1_to_3cm,soil_moisture_3_to_9cm,soil_moisture_9_to_27cm,soil_moisture_27_to_81cm',
    forecast_days: '7',
    timezone: 'auto',
  });
  return `${URL_BASE}?${qs}`;
}

const avg = (xs) => {
  const ok = xs.filter((x) => typeof x === 'number');
  return ok.length ? ok.reduce((a, b) => a + b, 0) / ok.length : null;
};

/** Root-zone (0–27 cm, thickness weighted) soil moisture for one hourly index. */
function rootZone(h, i) {
  const parts = [
    [h.soil_moisture_0_to_1cm?.[i], 1],
    [h.soil_moisture_1_to_3cm?.[i], 2],
    [h.soil_moisture_3_to_9cm?.[i], 6],
    [h.soil_moisture_9_to_27cm?.[i], 18],
  ].filter(([v]) => typeof v === 'number');
  if (!parts.length) return null;
  const w = parts.reduce((s, [, t]) => s + t, 0);
  return parts.reduce((s, [v, t]) => s + v * t, 0) / w;
}

export function parseForecast(json, now = new Date()) {
  const d = json?.daily;
  if (!d?.time?.length) throw new Error('Open-Meteo response has no daily forecast');
  const days = d.time.map((date, i) => ({
    date,
    rainMm: d.precipitation_sum?.[i] ?? 0,
    rainChance: d.precipitation_probability_max?.[i] ?? null,
    et0Mm: d.et0_fao_evapotranspiration?.[i] ?? null,
    tMax: d.temperature_2m_max?.[i] ?? null,
    tMin: d.temperature_2m_min?.[i] ?? null,
  }));

  // Soil moisture "now": the hourly value closest to the current local hour.
  const h = json.hourly ?? {};
  let soilMoisture = null;
  if (h.time?.length) {
    const localNow = new Date(now.getTime() + (json.utc_offset_seconds ?? 0) * 1000).toISOString().slice(0, 13);
    let idx = h.time.findIndex((t) => t.slice(0, 13) === localNow);
    if (idx < 0) idx = 0;
    const v = rootZone(h, idx);
    soilMoisture = v == null ? null : Math.round(v * 1000) / 1000;
  }
  return { days, soilMoisture, timezone: json.timezone, source: 'Open-Meteo' };
}

/**
 * Watering advice from soil moisture, the texture's water range and the coming week's rain vs. crop demand.
 * Returns { code, ... } where code is water_now | water_soon | rain_coming | no_need.
 */
export function wateringAdvice(forecast, texture = 'loam') {
  const { fc, wp } = TEXTURE_WATER[texture] ?? TEXTURE_WATER.loam;
  const rain3 = forecast.days.slice(0, 3).reduce((s, d) => s + d.rainMm, 0);
  const rain7 = forecast.days.reduce((s, d) => s + d.rainMm, 0);
  const et7 = forecast.days.reduce((s, d) => s + (d.et0Mm ?? 0), 0);
  const sm = forecast.soilMoisture;
  // Share of plant-available water still in the root zone (0 = wilting, 1 = full).
  const available = sm == null ? null : Math.max(0, Math.min(1, (sm - wp) / (fc - wp)));

  // About 25 mm brings the top 30 cm of a typical loam from half-empty back to full.
  const amountMm = available == null ? 25 : Math.round(Math.max(15, Math.min(50, (1 - available) * (fc - wp) * 300)) / 5) * 5;
  const base = { rain3: Math.round(rain3), rain7: Math.round(rain7), et7: Math.round(et7), available: available == null ? null : Math.round(available * 100) };

  if (rain3 >= 15) return { code: 'rain_coming', ...base };
  if (available != null) {
    if (available < 0.35) return { code: 'water_now', amountMm, ...base };
    if (available < 0.6 && rain7 < et7 * 0.5) return { code: 'water_soon', days: 2, amountMm, ...base };
    return { code: 'no_need', ...base };
  }
  // No soil reading: fall back to the weekly water balance.
  if (rain7 < et7 * 0.4) return { code: 'water_soon', days: 2, amountMm, ...base };
  return { code: 'no_need', ...base };
}

export async function getForecast(lat, lon, opts = {}) {
  const la = roundCoord(lat);
  const lo = roundCoord(lon);
  return cached(`${la},${lo}`, async () => parseForecast(await fetchJson('Open-Meteo', buildUrl(la, lo), { timeoutMs: 20_000, ...opts })));
}
