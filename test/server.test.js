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
