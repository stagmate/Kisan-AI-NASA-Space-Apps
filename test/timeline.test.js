import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { parseClimatology, parseDaily } from '../src/nasaPower.js';
import { harmonizeMonthly, detectPhases, explainDeclines, analyzeTimeline, confidence } from '../src/timeline.js';

const clim = parseClimatology(JSON.parse(fs.readFileSync(new URL('./fixture-delhi.json', import.meta.url))));
// Normals for soil wetness are not in the old fixture; add simple ones.
clim.months.forEach((m) => { m.soilWet = 0.5; });

function days(from, n, f) {
  const out = [];
  const d0 = Date.parse(`${from}T00:00:00Z`);
  for (let i = 0; i < n; i++) out.push({ date: new Date(d0 + i * 864e5).toISOString().slice(0, 10), ...f(i) });
  return out;
}

test('POWER daily parsing drops days not yet published', () => {
  const json = { properties: { parameter: {
    PRECTOTCORR: { 20261110: 1.2, 20261111: -999 }, T2M_MAX: { 20261110: 30, 20261111: -999 },
    T2M_MIN: { 20261110: 15, 20261111: -999 }, GWETROOT: { 20261110: 0.6, 20261111: -999 }, EVPTRNS: { 20261110: 3, 20261111: -999 },
  } } };
  const d = parseDaily(json);
  assert.equal(d.length, 1);
  assert.deepEqual(d[0], { date: '2026-11-10', rainMm: 1.2, tMax: 30, tMin: 15, soilWet: 0.6, etMm: 3 });
});

test('harmonise: daily sums/means and 8-day NDVI land on one monthly grid with normals', () => {
  const daily = days('2026-07-01', 62, (i) => ({ rainMm: 5, tMax: i < 31 ? 33 : 39, tMin: 25, soilWet: 0.4, etMm: 3 }));
  const ndvi = [{ date: '2026-07-04', ndvi: 0.4 }, { date: '2026-07-20', ndvi: 0.6 }, { date: '2026-08-05', ndvi: 0.7 }];
  const m = harmonizeMonthly(daily, clim.months, ndvi);
  assert.equal(m.length, 2);
  assert.equal(m[0].rainMm, 155);
  assert.equal(m[0].etMm, 93);
  assert.equal(m[0].waterBalanceMm, 62);
  assert.equal(m[0].ndvi, 0.5);
  assert.equal(m[0].ndviImages, 2);
  assert.equal(m[0].soilWetAnomaly, -0.1);
  assert.equal(m[1].heatDays, 31);
  assert.ok(m[0].rainAnomalyPct < 0); // Delhi July normal ≈ 217 mm
});

const curve = (vals, start = '2026-03-06') => vals.map((v, i) => ({ date: new Date(Date.parse(`${start}T00:00:00Z`) + i * 8 * 864e5).toISOString().slice(0, 10), ndvi: v }));

test('phases: bare → green-up → peak → decline, ignoring a one-image wobble', () => {
  const s = curve([0.18, 0.2, 0.19, 0.3, 0.42, 0.55, 0.66, 0.7, 0.62, 0.71, 0.7, 0.55, 0.4, 0.28, 0.2, 0.19]);
  const phases = detectPhases(s).map((p) => p.phase);
  assert.equal(phases[0], 'bare');
  assert.ok(phases.includes('greenup'));
  assert.ok(phases.includes('decline'));
  assert.equal(phases.filter((p) => p === 'decline').length, 1, phases.join(','));
});

test('declines: harvest when no stress signal, stress when soil was dry', () => {
  const s = curve([0.3, 0.45, 0.6, 0.72, 0.74, 0.73, 0.6, 0.45, 0.3, 0.22, 0.2], '2026-07-01');
  const segs = detectPhases(s);
  const normalMonths = [{ month: '2026-07' }, { month: '2026-08' }, { month: '2026-09' }, { month: '2026-10' }].map((m) => ({ ...m, soilWetAnomaly: 0, heatDays: 0, rainAnomalyPct: 0 }));
  assert.ok(explainDeclines(segs, normalMonths).some((f) => f.code === 'harvest_likely'));
  const dry = normalMonths.map((m) => ({ ...m, soilWetAnomaly: -0.1 }));
  const f = explainDeclines(segs, dry).find((x) => x.code.startsWith('stress'));
  assert.ok(f);
  assert.deepEqual(f.causes, ['dry_soil']);
});

test('analyzeTimeline: anomaly vs past years and confidence with reasons', () => {
  const series = curve([0.3, 0.4, 0.5, 0.55, 0.52, 0.5, 0.48], '2026-09-01');
  const daily = days('2026-09-01', 60, () => ({ rainMm: 1, tMax: 30, tMin: 18, soilWet: 0.4, etMm: 3 }));
  const out = analyzeTimeline({ daily, climatologyMonths: clim.months, ndvi: { series }, normal: { normal: 0.62, values: [{ date: '2024-10-20', ndvi: 0.62 }] }, now: new Date('2026-11-01') });
  assert.equal(out.anomaly.status, 'below');
  assert.ok(out.findings.some((f) => f.code === 'below_normal_now'));
  assert.ok(out.confidence.reasons.includes('coarse_pixels'));
  const lowConf = confidence({ series: [], normal: null, monthly: [], now: new Date() });
  assert.equal(lowConf.level, 'low');
});
