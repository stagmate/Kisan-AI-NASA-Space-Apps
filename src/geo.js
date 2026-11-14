// State and district for a point, from OpenStreetMap Nominatim (reverse geocoding).
// Usage policy: https://operations.osmfoundation.org/policies/nominatim/ — identify the app,
// at most one request per second, cache results. We cache per ~1 km for a week.

import { fetchJson, makeCache, roundCoord } from './http.js';

const URL_BASE = 'https://nominatim.openstreetmap.org/reverse';
const cached = makeCache(7 * 24 * 60 * 60 * 1000);

// Nominatim names → the names data.gov.in / Agmarknet use.
const STATE_ALIASES = {
  'national capital territory of delhi': 'NCT of Delhi',
  delhi: 'NCT of Delhi',
  'jammu and kashmir': 'Jammu and Kashmir',
  odisha: 'Odisha',
  pondicherry: 'Pondicherry',
  puducherry: 'Pondicherry',
  telangana: 'Telangana',
  'andaman and nicobar islands': 'Andaman and Nicobar',
  'dadra and nagar haveli and daman and diu': 'Dadra and Nagar Haveli',
};

export function normalizeState(name) {
  if (!name) return null;
  return STATE_ALIASES[name.toLowerCase()] ?? name;
}

export function parsePlace(json) {
  const a = json?.address;
  if (!a || a.country_code !== 'in') return null;
  return {
    state: normalizeState(a.state ?? a.territory ?? null),
    district: (a.state_district ?? a.county ?? a.city_district ?? null)?.replace(/\s+(district|urban|rural)$/i, '') ?? null,
  };
}

export async function getPlace(lat, lon, { fetchImpl = fetch } = {}) {
  const la = roundCoord(lat);
  const lo = roundCoord(lon);
  return cached(`${la},${lo}`, async () => {
    const qs = new URLSearchParams({ lat: String(la), lon: String(lo), format: 'jsonv2', zoom: '10', 'accept-language': 'en' });
    const json = await fetchJson('OpenStreetMap', `${URL_BASE}?${qs}`, {
      fetchImpl,
      timeoutMs: 10_000,
      headers: { 'User-Agent': 'kisan-ai-space-apps/0.1 (NASA Space Apps 2026 demo)' },
    });
    return parsePlace(json);
  });
}
