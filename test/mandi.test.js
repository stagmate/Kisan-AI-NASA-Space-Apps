import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cropForCommodity, summarizePrices, isoDate, getMandiPrices, MandiNotConfigured } from '../src/mandi.js';
import { parsePlace, normalizeState } from '../src/geo.js';
import { CROP_IDS } from '../src/crops.js';

// Rows in the shape data.gov.in returns for resource 9ef84268-… (prices in ₹/quintal, as strings).
const row = (commodity, district, market, modal, extra = {}) => ({
  state: 'Karnataka', district, market, commodity, variety: 'Other', grade: 'FAQ',
  arrival_date: '14/11/2026', min_price: String(modal - 200), max_price: String(modal + 200), modal_price: String(modal), ...extra,
});

test('Agmarknet commodity names map to our crops; processed goods are skipped', () => {
  assert.equal(cropForCommodity('Paddy(Dhan)(Common)'), 'rice');
  assert.equal(cropForCommodity('Arhar (Tur/Red Gram)(Whole)'), 'pigeon_pea');
  assert.equal(cropForCommodity('Bengal Gram(Gram)(Whole)'), 'chickpea');
  assert.equal(cropForCommodity('Green Gram (Moong)(Whole)'), 'green_gram');
  assert.equal(cropForCommodity('Bajra(Pearl Millet/Cumbu)'), 'pearl_millet');
  assert.equal(cropForCommodity('Jowar(Sorghum)'), 'sorghum');
  assert.equal(cropForCommodity('Soyabean'), 'soybean');
  assert.equal(cropForCommodity('Water Melon'), 'watermelon');
  assert.equal(cropForCommodity('Arhar Dal(Tur Dal)'), null);
  assert.equal(cropForCommodity('Groundnut Oil'), null);
  assert.equal(cropForCommodity('Tomato'), null);
});

test('every plannable crop has a commodity pattern', async () => {
  const { COMMODITY_PATTERNS } = await import('../src/mandi.js');
  for (const id of CROP_IDS.filter((c) => c !== 'fallow_green_manure')) assert.ok(COMMODITY_PATTERNS[id], id);
});

test('prices: median across mandis, range, and the farmer district', () => {
  const s = summarizePrices([
    row('Onion', 'Bangalore', 'Binny Mill', 2000),
    row('Onion', 'Mysore', 'Mysore', 2400),
    row('Onion', 'Hubli', 'Hubli', 3000),
    row('Maize', 'Davangere', 'Davangere', 2100),
    row('Maize', 'Davangere', 'Davangere', '', { modal_price: 'NR' }),
    row('Tomato', 'Kolar', 'Kolar', 900),
  ], 'Bengaluru');
  assert.equal(s.crops.onion.modal, 2400);
  assert.equal(s.crops.onion.low, 2000);
  assert.equal(s.crops.onion.high, 3000);
  assert.equal(s.crops.onion.markets, 3);
  assert.equal(s.crops.onion.date, '2026-11-14');
  assert.equal(s.crops.maize.markets, 1);
  assert.deepEqual(s.unmatched, ['Tomato']);
  // "Bengaluru" vs Agmarknet "Bangalore" differ; local match is a bonus, never required.
  const local = summarizePrices([row('Onion', 'Bangalore', 'Binny Mill', 2000)], 'Bengaluru');
  assert.equal(local.crops.onion.local.market ?? local.crops.onion.local.example, 'Binny Mill');
});

test('dates and places', () => {
  assert.equal(isoDate('4/1/2026'), '2026-01-04');
  assert.equal(isoDate('bad'), null);
  assert.deepEqual(parsePlace({ address: { state: 'Karnataka', state_district: 'Bengaluru Urban', country_code: 'in' } }), { state: 'Karnataka', district: 'Bengaluru' });
  assert.equal(parsePlace({ address: { state: 'Punjab', country_code: 'pk' } }), null);
  assert.equal(normalizeState('National Capital Territory of Delhi'), 'NCT of Delhi');
});

test('mandi needs a key; pages through rows and falls back to the older filter name', async () => {
  await assert.rejects(getMandiPrices('Goa', null, { apiKey: '' }), MandiNotConfigured);
  const urls = [];
  const fetchImpl = async (url) => {
    urls.push(decodeURIComponent(url));
    const older = url.includes(encodeURIComponent('filters[state]') + '=');
    const records = older ? [row('Onion', 'North Goa', 'Mapusa', 2500, { state: 'Goa' })] : [];
    return { ok: true, status: 200, json: async () => ({ records, total: records.length }) };
  };
  const out = await getMandiPrices('Goa', 'North Goa', { apiKey: 'test-key', fetchImpl });
  assert.equal(out.crops.onion.modal, 2500);
  assert.equal(urls.length, 2);
  assert.match(urls[0], /filters\[state\.keyword\]=Goa/);
  assert.equal(out.crops.onion.local.markets, 1);
});

test('paddy preferred over milled rice; outliers ignored', () => {
  const s = summarizePrices([
    row('Paddy(Dhan)(Common)', 'Mandya', 'Mandya', 2300),
    row('Paddy(Dhan)(Basmati)', 'Mandya', 'Mandya', 2500),
    row('Rice', 'Bangalore', 'Binny Mill', 5200),
    row('Onion', 'Nagpur', 'APMC Kamthi ', 3600),
    row('Onion', 'Nagpur', 'APMC Savner', 3800),
    row('Onion', 'Nagpur', 'APMC Katol', 8),
  ], 'Nagpur');
  assert.equal(s.crops.rice.modal, 2400);
  assert.equal(s.crops.rice.high, 2500);
  assert.equal(s.crops.onion.low, 3600);
  assert.equal(s.crops.onion.markets, 2);
  assert.equal(s.crops.onion.local.example, 'APMC Kamthi');
});
