import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { parseSoil, textureClass, soilNotes, buildUrl as soilUrl } from '../src/soil.js';
import { parseForecast, wateringAdvice } from '../src/forecast.js';
import { buildSeries, summarizeNdvi, tilePixel, storagePath } from '../src/ndvi.js';
import { fetchJson, SourceError } from '../src/http.js';

const load = (f) => JSON.parse(fs.readFileSync(new URL(f, import.meta.url)));

test('SoilGrids: weighted 0–30 cm averages in normal units', () => {
  const s = parseSoil(load('./fixture-soilgrids-bengaluru.json'));
  assert.ok(Math.abs(s.sand + s.silt + s.clay - 100) < 2);
  assert.ok(s.ph > 4 && s.ph < 9);
  assert.equal(s.texture, 'sandy_clay_loam');
  assert.ok(s.water.fc > s.water.wp);
  assert.match(soilUrl(12.97, 77.59), /property=phh2o/);
});

test('SoilGrids: no data (water/urban) gives null', () => {
  assert.equal(parseSoil({ properties: { layers: [{ name: 'clay', unit_measure: { d_factor: 10 }, depths: [{ label: '0-5cm', values: { mean: null } }] }] } }), null);
});

test('texture triangle classes', () => {
  assert.equal(textureClass(90, 5, 5), 'sand');
  assert.equal(textureClass(40, 40, 20), 'loam');
  assert.equal(textureClass(20, 25, 55), 'clay');
  assert.equal(textureClass(20, 65, 15), 'silt_loam');
  assert.equal(textureClass(30, 35, 35), 'clay_loam');
});

test('soil notes flag acidity, alkalinity and low carbon', () => {
  const codes = (s) => soilNotes(s).map((n) => n.code);
  assert.ok(codes({ ph: 5.0, organicCarbon: 4, sand: 70, clay: 10 }).includes('soil_acidic'));
  assert.ok(codes({ ph: 8.6, organicCarbon: 4, sand: 20, clay: 45 }).includes('soil_alkaline'));
  assert.ok(codes({ ph: 7, organicCarbon: 4, sand: 40, clay: 20 }).includes('soil_low_carbon'));
});

test('Open-Meteo: 7 days and a root-zone soil moisture reading', () => {
  const f = parseForecast(load('./fixture-openmeteo-bengaluru.json'), new Date('2026-11-14T06:00:00Z'));
  assert.equal(f.days.length, 7);
  assert.ok(f.soilMoisture > 0.05 && f.soilMoisture < 0.6);
  assert.ok(f.days.every((d) => typeof d.et0Mm === 'number'));
});

test('watering advice covers rain, dry soil, moist soil and no-soil fallback', () => {
  const days = (rain, et = 5) => Array.from({ length: 7 }, (_, i) => ({ date: `2026-11-${14 + i}`, rainMm: rain[i] ?? 0, et0Mm: et }));
  assert.equal(wateringAdvice({ days: days([10, 10]), soilMoisture: 0.1 }).code, 'rain_coming');
  const dry = wateringAdvice({ days: days([]), soilMoisture: 0.14 }, 'loam');
  assert.equal(dry.code, 'water_now');
  assert.ok(dry.amountMm >= 15 && dry.amountMm <= 50);
  assert.equal(wateringAdvice({ days: days([]), soilMoisture: 0.27 }, 'loam').code, 'no_need');
  assert.equal(wateringAdvice({ days: days([]), soilMoisture: null }).code, 'water_soon');
});

test('MODIS: cloudy and fill pixels dropped; trend and status summarised', () => {
  const series = buildSeries([
    { date: '2026-08-01', ndviRaw: 3000, qa: 0 },
    { date: '2026-08-17', ndviRaw: 4500, qa: 1 },
    { date: '2026-09-02', ndviRaw: 9000, qa: 3 }, // cloudy
    { date: '2026-09-18', ndviRaw: -3000, qa: -1 }, // no data
    { date: '2026-10-04', ndviRaw: 6800, qa: 0 },
  ]);
  assert.deepEqual(series.map((p) => p.date), ['2026-08-01', '2026-08-17', '2026-10-04']);
  const s = summarizeNdvi(series);
  assert.equal(s.status, 'dense');
  assert.equal(s.trend, 'greening');
  assert.equal(summarizeNdvi([]).status, 'no_clear_image');
});

test('MODIS: point to sinusoidal tile and pixel', () => {
  // Nagpur is on tile h25v06 (checked against the Planetary Computer item ids).
  const p = tilePixel(21.15, 79.09);
  assert.equal(p.h, 25);
  assert.equal(p.v, 6);
  assert.ok(p.col >= 0 && p.col < 4800 && p.row >= 0 && p.row < 4800);
  assert.equal(tilePixel(28.61, 77.21).v, 6);
  assert.equal(storagePath('https://modiseuwest.blob.core.windows.net/modis-061-cogs/MOD13Q1/25/06/x.tif'), 'modiseuwest/modis-061-cogs');
});

test('fetchJson reports rate limits and timeouts as source errors', async () => {
  const limited = async () => ({ ok: true, status: 200, json: async () => ({ error: true, reason: 'Daily API request limit exceeded' }) });
  await assert.rejects(fetchJson('Open-Meteo', 'x', { fetchImpl: limited }), (e) => e instanceof SourceError && /limit/.test(e.message));
  const slow = async () => { const e = new Error('t'); e.name = 'TimeoutError'; throw e; };
  await assert.rejects(fetchJson('MODIS', 'x', { fetchImpl: slow }), /timed out/);
});
