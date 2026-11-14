// Today's mandi (wholesale market) prices from data.gov.in — "Current Daily Price of Various
// Commodities from Various Markets (Mandi)", published from Agmarknet.
// https://www.data.gov.in/resource/current-daily-price-various-commodities-various-markets-mandi
// Needs a free API key (DATA_GOV_IN_API_KEY). The API only answers servers in India.

import { fetchJson, makeCache } from './http.js';

const RESOURCE = 'https://api.data.gov.in/resource/9ef84268-d588-465a-a308-a864a43d0070';
const PAGE = 1000;
const MAX_PAGES = 5;
const cached = makeCache(3 * 60 * 60 * 1000);

// Our crop ids → patterns that match Agmarknet commodity names (which vary in spelling).
export const COMMODITY_PATTERNS = {
  rice: /^paddy|^rice\b/i,
  maize: /^maize/i,
  pearl_millet: /bajra|pearl millet/i,
  sorghum: /jowar|sorghum/i,
  cotton: /^cotton|kapas/i,
  soybean: /soya ?bean/i,
  pigeon_pea: /arhar|tur\b|red gram/i,
  green_gram: /green gram|moong/i,
  groundnut: /groundnut/i,
  wheat: /^wheat/i,
  barley: /barley|jau/i,
  chickpea: /bengal gram|^gram\b|chana/i,
  lentil: /lentil|masur|masoor/i,
  mustard: /mustard|rapeseed/i,
  potato: /^potato/i,
  onion: /^onion/i,
  watermelon: /water ?melon/i,
  cowpea: /cowpea|lobia|karamani/i,
};

export function cropForCommodity(name) {
  // Skip processed products that would distort the price (e.g. "Arhar Dal", "Groundnut Oil").
  if (/\b(dal|oil|cake|seed oil|flour|atta)\b/i.test(name)) return null;
  for (const [crop, re] of Object.entries(COMMODITY_PATTERNS)) if (re.test(name)) return crop;
  return null;
}

// New official names (as OpenStreetMap uses) → older names still common in Agmarknet.
const DISTRICT_ALIASES = {
  bengaluru: 'bangalore',
  mysuru: 'mysore',
  belagavi: 'belgaum',
  kalaburagi: 'gulbarga',
  vijayapura: 'bijapur',
  shivamogga: 'shimoga',
  tumakuru: 'tumkur',
  gurugram: 'gurgaon',
  prayagraj: 'allahabad',
  ayodhya: 'faizabad',
  chattogram: 'chittagong',
  thoothukudi: 'tuticorin',
  tiruchirappalli: 'trichy',
  puducherry: 'pondicherry',
  thiruvananthapuram: 'thiruvananthapuram',
};

const num = (v) => {
  const n = Number(String(v ?? '').replace(/,/g, ''));
  return Number.isFinite(n) && n > 0 ? n : null;
};

function median(xs) {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** "14/11/2026" → "2026-11-14" */
export function isoDate(d) {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(String(d ?? '').trim());
  return m ? `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}` : null;
}

/**
 * Summarise records per crop: median modal price (₹/quintal) across the state's mandis,
 * the range, and the farmer's own district when it reports that crop.
 */
export function summarizePrices(records, district = null) {
  const byCrop = {};
  const unmatched = new Set();
  const first = district ? district.toLowerCase().split(/\s+/)[0] : null;
  const want = first ? DISTRICT_ALIASES[first] ?? first : null;
  for (const r of records) {
    const crop = cropForCommodity(r.commodity ?? '');
    const modal = num(r.modal_price);
    if (!crop) {
      if (r.commodity) unmatched.add(r.commodity);
      continue;
    }
    if (!modal) continue;
    (byCrop[crop] ??= []).push({
      modal,
      market: r.market,
      district: r.district,
      date: isoDate(r.arrival_date),
    });
  }
  const crops = {};
  for (const [crop, rows] of Object.entries(byCrop)) {
    const modals = rows.map((r) => r.modal);
    const local = want ? rows.filter((r) => r.district?.toLowerCase().startsWith(want)) : [];
    const dates = rows.map((r) => r.date).filter(Boolean).sort();
    crops[crop] = {
      modal: Math.round(median(modals)),
      low: Math.round(Math.min(...modals)),
      high: Math.round(Math.max(...modals)),
      markets: rows.length,
      date: dates.at(-1) ?? null,
      local: local.length ? { modal: Math.round(median(local.map((r) => r.modal))), markets: local.length, example: local[0].market } : null,
    };
  }
  return { crops, unmatched: [...unmatched].slice(0, 20) };
}

export class MandiNotConfigured extends Error {}

export async function getMandiPrices(state, district, { apiKey = process.env.DATA_GOV_IN_API_KEY, fetchImpl = fetch } = {}) {
  if (!apiKey) throw new MandiNotConfigured('DATA_GOV_IN_API_KEY is not set');
  if (!state) return { state: null, crops: {}, unmatched: [] };
  // The API has used both filter spellings over time; try the current one, then the older one.
  const load = async (filterKey) => {
    const all = [];
    for (let page = 0; page < MAX_PAGES; page++) {
      const qs = new URLSearchParams({ 'api-key': apiKey, format: 'json', limit: String(PAGE), offset: String(page * PAGE) });
      qs.append(filterKey, state);
      const json = await fetchJson('data.gov.in', `${RESOURCE}?${qs}`, { fetchImpl, timeoutMs: 20_000 });
      const rows = Array.isArray(json.records) ? json.records : [];
      all.push(...rows);
      const total = Number(json.total);
      if (rows.length < PAGE || (Number.isFinite(total) && all.length >= total)) break;
    }
    return all;
  };
  const records = await cached(state, async () => {
    const rows = await load('filters[state.keyword]');
    return rows.length ? rows : load('filters[state]');
  });
  return { state, district, ...summarizePrices(records, district), records: records.length, source: 'data.gov.in (Agmarknet)' };
}
