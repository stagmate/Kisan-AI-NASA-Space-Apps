import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { parseClimatology } from '../src/nasaPower.js';
import { analyzeClimate } from '../src/seasons.js';
import { planRotations, scoreCrop, scoreSequence, monsoonCarryover } from '../src/planner.js';
import { getCrop, CROPS } from '../src/crops.js';

const raw = JSON.parse(fs.readFileSync(new URL('./fixture-delhi.json', import.meta.url)));
const { seasons } = analyzeClimate(parseClimatology(raw));
const season = (id) => seasons.find((s) => s.id === id);

test('crop table is consistent', () => {
  for (const c of CROPS) {
    assert.ok(c.tempRange[0] < c.tempRange[1], c.id);
    assert.ok(c.seasons.every((s) => ['kharif', 'rabi', 'zaid'].includes(s)), c.id);
  }
});

test('crops out of season or far too cold are rejected', () => {
  assert.equal(scoreCrop(getCrop('wheat'), season('kharif'), 'full'), null);
  const cold = { id: 'rabi', tempMean: 4, tempMax: 10, tempMin: -5, rainMm: 300 };
  assert.equal(scoreCrop(getCrop('chickpea'), cold, 'full'), null);
});

test('rice needs irrigation outside heavy-rain areas', () => {
  const k = season('kharif');
  assert.equal(scoreCrop(getCrop('rice'), k, 'rainfed'), null);
  const full = scoreCrop(getCrop('rice'), k, 'full');
  assert.ok(full.irrigationNeed > 0);
});

test('rotation with a legume beats continuous cereals on soil health', () => {
  const pick = (crop, s) => ({ crop, season: s, score: 80, irrigationNeed: 0 });
  const cereal = scoreSequence([pick('maize', 'kharif'), pick('wheat', 'rabi'), pick('maize', 'zaid')]);
  const mixed = scoreSequence([pick('soybean', 'kharif'), pick('wheat', 'rabi'), pick('green_gram', 'zaid')]);
  assert.ok(mixed.parts.soil > cereal.parts.soil);
  assert.ok(cereal.warnings.includes('same_family'));
  assert.ok(mixed.reasons.includes('legume_feeds_next'));
});

test('plans are distinct, never repeat the last crop, and respect irrigation', () => {
  const { plans } = planRotations({ seasons, irrigation: 'limited', lastCrop: 'soybean' });
  assert.equal(plans.length, 3);
  for (const p of plans) assert.notEqual(p.picks[0].crop, 'soybean');
  for (let i = 1; i < plans.length; i++) {
    const diff = plans[i].picks.filter((x, j) => x.crop !== plans[0].picks[j].crop).length;
    assert.ok(diff >= 2);
  }
  assert.ok(plans[0].total >= plans[1].total);
});

test('rainfed Delhi still gets a plan via monsoon soil moisture', () => {
  assert.ok(monsoonCarryover(season('kharif').rainMm) > 0);
  const { plans } = planRotations({ seasons, irrigation: 'rainfed' });
  assert.ok(plans.length >= 1);
});

test('priority changes the ranking weights', () => {
  const water = planRotations({ seasons, irrigation: 'full', priority: 'water' }).plans[0];
  const income = planRotations({ seasons, irrigation: 'full', priority: 'income' }).plans[0];
  assert.ok(water.irrigationMm <= income.irrigationMm);
});
