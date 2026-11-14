import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { parseClimatology, validateCoords, buildUrl, getClimatology, clearCache } from '../src/nasaPower.js';
import { analyzeClimate } from '../src/seasons.js';

const raw = JSON.parse(fs.readFileSync(new URL('./fixture-delhi.json', import.meta.url)));

test('parses 12 months with rain converted to mm/month', () => {
  const c = parseClimatology(raw);
  assert.equal(c.months.length, 12);
  const jul = c.months[6];
  assert.equal(jul.month, 'JUL');
  assert.equal(jul.rainMm, Math.round(raw.properties.parameter.PRECTOTCORR.JUL * 31 * 10) / 10);
  assert.ok(jul.dayHigh > jul.tempMean && jul.nightLow < jul.tempMean);
});

test('rejects bad coordinates and incomplete data', () => {
  assert.throws(() => validateCoords(100, 0), RangeError);
  assert.throws(() => validateCoords('x', 0), RangeError);
  assert.throws(() => parseClimatology({ properties: { parameter: {} } }));
  const broken = structuredClone(raw);
  broken.properties.parameter.T2M.MAR = -999;
  assert.throws(() => parseClimatology(broken), /incomplete/);
});

test('builds an AG-community climatology URL', () => {
  const url = new URL(buildUrl(28.6, 77.2));
  assert.equal(url.searchParams.get('community'), 'AG');
  assert.match(url.searchParams.get('parameters'), /PRECTOTCORR/);
});

test('caches responses per location', async () => {
  clearCache();
  let calls = 0;
  const fetchImpl = async () => { calls++; return { ok: true, json: async () => raw }; };
  await getClimatology(28.6, 77.2, { fetchImpl });
  await getClimatology(28.6, 77.2, { fetchImpl });
  assert.equal(calls, 1);
});

test('Delhi: monsoon-dependent, dry rabi, hot zaid', () => {
  const c = analyzeClimate(parseClimatology(raw));
  const codes = c.insights.map((i) => i.code);
  assert.ok(codes.includes('monsoon_dependent'));
  assert.ok(codes.includes('rabi_needs_irrigation'));
  assert.ok(codes.includes('heat_risk'));
  const [kharif, rabi, zaid] = c.seasons;
  assert.ok(kharif.rainMm > 500 && rabi.rainMm < 100);
  assert.ok(rabi.tempMean < kharif.tempMean && zaid.tempMax > 40);
  assert.equal(Math.round(c.months.reduce((s, m) => s + m.rainMm, 0)), c.annualRain);
});
