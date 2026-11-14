// Soil properties from ISRIC SoilGrids 2.0 (250 m global soil maps).
// https://rest.isric.org/soilgrids/v2.0/docs

import { fetchJson, makeCache, roundCoord } from './http.js';

const URL_BASE = 'https://rest.isric.org/soilgrids/v2.0/properties/query';
const DEPTHS = ['0-5cm', '5-15cm', '15-30cm'];
const DEPTH_WEIGHTS = { '0-5cm': 5, '5-15cm': 10, '15-30cm': 15 };
const cached = makeCache(7 * 24 * 60 * 60 * 1000);

// Approximate water held between field capacity and wilting point (m³/m³) by texture.
// Used to judge soil-moisture readings and how much monsoon water carries into Rabi.
export const TEXTURE_WATER = {
  sand: { fc: 0.12, wp: 0.05 },
  loamy_sand: { fc: 0.15, wp: 0.07 },
  sandy_loam: { fc: 0.22, wp: 0.10 },
  loam: { fc: 0.28, wp: 0.13 },
  silt_loam: { fc: 0.31, wp: 0.13 },
  sandy_clay_loam: { fc: 0.29, wp: 0.17 },
  clay_loam: { fc: 0.34, wp: 0.20 },
  silty_clay_loam: { fc: 0.36, wp: 0.21 },
  sandy_clay: { fc: 0.33, wp: 0.22 },
  silty_clay: { fc: 0.39, wp: 0.25 },
  clay: { fc: 0.40, wp: 0.26 },
};

/** USDA texture class from sand / silt / clay percentages. */
export function textureClass(sand, silt, clay) {
  if (silt + 1.5 * clay < 15) return 'sand';
  if (silt + 2 * clay < 30) return 'loamy_sand';
  if (clay >= 40) {
    if (silt >= 40) return 'silty_clay';
    if (sand > 45) return 'sandy_clay';
    return 'clay';
  }
  if (clay >= 35 && sand > 45) return 'sandy_clay';
  if (clay >= 27) {
    if (sand <= 20) return 'silty_clay_loam';
    if (sand <= 45) return 'clay_loam';
  }
  if (clay >= 20 && sand > 45 && silt < 28) return 'sandy_clay_loam';
  if (silt >= 50) return 'silt_loam';
  if (clay < 7 && silt < 50) return sand > 52 ? 'sandy_loam' : 'loam';
  if (sand > 52) return 'sandy_loam';
  return 'loam';
}

export function buildUrl(lat, lon) {
  const qs = new URLSearchParams({ lat: String(lat), lon: String(lon), value: 'mean' });
  for (const p of ['clay', 'sand', 'silt', 'phh2o', 'soc']) qs.append('property', p);
  for (const d of DEPTHS) qs.append('depth', d);
  return `${URL_BASE}?${qs}`;
}

/** Weighted 0–30 cm average of each property, converted to normal units. */
export function parseSoil(json) {
  const layers = json?.properties?.layers;
  if (!Array.isArray(layers)) throw new Error('SoilGrids response has no layers');
  const out = {};
  for (const layer of layers) {
    const factor = layer.unit_measure?.d_factor ?? 1;
    let sum = 0;
    let weight = 0;
    for (const d of layer.depths ?? []) {
      const v = d.values?.mean;
      const w = DEPTH_WEIGHTS[d.label];
      if (typeof v === 'number' && w) {
        sum += (v / factor) * w;
        weight += w;
      }
    }
    if (weight) out[layer.name] = Math.round((sum / weight) * 10) / 10;
  }
  if (out.clay == null || out.sand == null || out.silt == null) return null; // water, city or no data
  const texture = textureClass(out.sand, out.silt, out.clay);
  return {
    clay: out.clay,
    sand: out.sand,
    silt: out.silt,
    ph: out.phh2o ?? null,
    organicCarbon: out.soc ?? null, // g/kg
    texture,
    water: TEXTURE_WATER[texture],
    source: 'ISRIC SoilGrids 2.0',
  };
}

/** Plain-language soil notes (codes the UI translates). */
export function soilNotes(soil) {
  if (!soil) return [];
  const notes = [];
  if (soil.ph != null) {
    if (soil.ph < 5.5) notes.push({ code: 'soil_acidic', level: 'warn', value: soil.ph });
    else if (soil.ph > 8.0) notes.push({ code: 'soil_alkaline', level: 'warn', value: soil.ph });
    else notes.push({ code: 'soil_ph_ok', level: 'good', value: soil.ph });
  }
  if (soil.organicCarbon != null) {
    notes.push(soil.organicCarbon < 7
      ? { code: 'soil_low_carbon', level: 'warn', value: soil.organicCarbon }
      : { code: 'soil_carbon_ok', level: 'good', value: soil.organicCarbon });
  }
  if (soil.sand >= 65) notes.push({ code: 'soil_sandy', level: 'info' });
  if (soil.clay >= 40) notes.push({ code: 'soil_heavy', level: 'info' });
  return notes;
}

// SoilGrids masks built-up areas and water. If the exact point has no soil (e.g. a city-centre preset),
// try points about 3 km and 7 km away and say so.
export async function getSoil(lat, lon, opts = {}) {
  const la = roundCoord(lat);
  const lo = roundCoord(lon);
  return cached(`${la},${lo}`, async () => {
    const at = async (a, b) => parseSoil(await fetchJson('SoilGrids', buildUrl(a, b), { timeoutMs: 20_000, ...opts }));
    const here = await at(la, lo);
    if (here) return here;
    for (const [dLa, dLo] of [[0.02, 0.02], [-0.05, -0.05]]) {
      const near = await at(roundCoord(la + dLa), roundCoord(lo + dLo));
      if (near) return { ...near, nearby: true };
    }
    return null;
  });
}
