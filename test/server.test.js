import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createApp } from '../server.js';
import { parseClimatology } from '../src/nasaPower.js';

const raw = JSON.parse(fs.readFileSync(new URL('./fixture-delhi.json', import.meta.url)));
let server, base;

before(async () => {
  const app = createApp({
    climateSource: async (lat, lon) => {
      if (Number(lat) > 90) throw new RangeError('Latitude must be between -90 and 90');
      return parseClimatology(raw);
    },
    ask: async ({ question }) => ({ answer: `echo: ${question}`, refused: false }),
    assistantReady: () => true,
    placeSource: async () => null,
    soilSource: async () => ({ clay: 30, sand: 40, silt: 30, ph: 6.8, organicCarbon: 9, texture: 'clay_loam', water: { fc: 0.34, wp: 0.2 } }),
    forecastSource: async () => ({ days: Array.from({ length: 7 }, (_, i) => ({ date: `2026-11-${14 + i}`, rainMm: 0, et0Mm: 4 })), soilMoisture: 0.22 }),
    ndviSource: async () => { throw new Error('MODIS: timed out'); },
  });
  server = app.listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => server.close());

test('GET /api/climate returns seasons and insights', async () => {
  const res = await fetch(`${base}/api/climate?lat=28.6&lon=77.2`);
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.seasons.length, 3);
  assert.ok(body.insights.length > 0);
});

test('bad coordinates give 400', async () => {
  const res = await fetch(`${base}/api/climate?lat=200&lon=77`);
  assert.equal(res.status, 400);
});

test('POST /api/plan validates input and returns plans', async () => {
  const post = (body) => fetch(`${base}/api/plan`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  assert.equal((await post({ lat: 28.6, lon: 77.2, irrigation: 'lots' })).status, 400);
  assert.equal((await post({ lat: 28.6, lon: 77.2, lastCrop: 'banana' })).status, 400);
  const res = await post({ lat: 28.6, lon: 77.2, irrigation: 'limited', lastCrop: 'wheat' });
  assert.equal(res.status, 200);
  assert.ok((await res.json()).plans.length > 0);
});

test('POST /api/ask and static page are served', async () => {
  const res = await fetch(`${base}/api/ask`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ question: 'hi' }) });
  assert.equal((await res.json()).answer, 'echo: hi');
  const page = await fetch(`${base}/`);
  assert.match(await page.text(), /Kisan AI/);
});

test('ask returns 503 when no Claude key is configured', async () => {
  const app = createApp({ assistantReady: () => false });
  const s = app.listen(0);
  await new Promise((r) => s.once('listening', r));
  const res = await fetch(`http://127.0.0.1:${s.address().port}/api/ask`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ question: 'hi' }) });
  assert.equal(res.status, 503);
  s.close();
});

test('GET /api/field returns soil, forecast and advice; a failed source is reported, not fatal', async () => {
  const res = await fetch(`${base}/api/field?lat=28.6&lon=77.2`);
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.soil.texture, 'clay_loam');
  assert.equal(body.advice.code, 'water_now');
  assert.ok(Array.isArray(body.soilNotes));
  assert.match(body.errors.ndvi, /MODIS/);
  assert.equal(body.ndvi, undefined);
});

test('POST /api/plan includes soil and uses it', async () => {
  const res = await fetch(`${base}/api/plan`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ lat: 28.6, lon: 77.2 }) });
  const body = await res.json();
  assert.equal(body.soil.ph, 6.8);
});

test('a point with no soil map is reported as soilMissing, not as an outage', async () => {
  const app = createApp({
    soilSource: async () => null,
    forecastSource: async () => ({ days: [{ date: '2026-11-14', rainMm: 0, et0Mm: 4 }], soilMoisture: null }),
    ndviSource: async () => ({ series: [] }),
  });
  const s = app.listen(0);
  await new Promise((r) => s.once('listening', r));
  const body = await (await fetch(`http://127.0.0.1:${s.address().port}/api/field?lat=12.96&lon=77.59`)).json();
  assert.equal(body.soilMissing, 'no_map_here');
  assert.equal(body.errors.soil, undefined);
  s.close();
});

test('GET /api/mandi: prices for the field state; 503 code when no key; outside India', async () => {
  const { MandiNotConfigured } = await import('../src/mandi.js');
  const mk = (opts) => {
    const a = createApp(opts);
    const s = a.listen(0);
    return new Promise((r) => s.once('listening', () => r(s)));
  };
  const s1 = await mk({ placeSource: async () => ({ state: 'Karnataka', district: 'Bengaluru' }), mandiSource: async (st) => ({ state: st, crops: { onion: { modal: 2400 } } }) });
  const b1 = await (await fetch(`http://127.0.0.1:${s1.address().port}/api/mandi?lat=13.1&lon=77.45`)).json();
  assert.equal(b1.state, 'Karnataka');
  assert.equal(b1.crops.onion.modal, 2400);
  s1.close();
  const s2 = await mk({ placeSource: async () => ({ state: 'Karnataka' }), mandiSource: async () => { throw new MandiNotConfigured('x'); } });
  const r2 = await fetch(`http://127.0.0.1:${s2.address().port}/api/mandi?lat=13.1&lon=77.45`);
  assert.equal(r2.status, 503);
  assert.equal((await r2.json()).code, 'not_configured');
  s2.close();
  const s3 = await mk({ placeSource: async () => null });
  const b3 = await (await fetch(`http://127.0.0.1:${s3.address().port}/api/mandi?lat=40&lon=-100`)).json();
  assert.equal(b3.reason, 'outside_india');
  s3.close();
});
