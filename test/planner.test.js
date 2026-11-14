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

test('soil pH penalises crops outside their range; heavier soil stores more monsoon water', () => {
  const rabi = season('rabi');
  const acid = { ph: 5.0, water: { fc: 0.28, wp: 0.13 } };
  const potato = scoreCrop(getCrop('potato'), rabi, 'full', 0, acid);
  const chickpea = scoreCrop(getCrop('chickpea'), rabi, 'full', 0, acid);
  assert.ok(chickpea.warnings.includes('soil_too_acidic'));
  assert.ok(!potato.warnings.includes('soil_too_acidic'));
  const clay = { water: { fc: 0.40, wp: 0.26 } };
  const sand = { water: { fc: 0.12, wp: 0.05 } };
  assert.ok(monsoonCarryover(700, clay) >= monsoonCarryover(700, sand));
  assert.ok(planRotations({ seasons, irrigation: 'limited', soil: acid }).plans.length > 0);
});

test('eight criteria: legumes help nutrients, monsoon cover protects soil, fodder counted', async () => {
  const { rotationCriteria, cropRoles, applyScenario } = await import('../src/planner.js');
  const pick = (crop, s, irrigationNeed = 0) => ({ crop, season: s, score: 80, irrigationNeed });
  const cereal = rotationCriteria([pick('maize', 'kharif'), pick('wheat', 'rabi', 300), pick('fallow', 'zaid')], { seasons });
  const mixed = rotationCriteria([pick('cowpea', 'kharif'), pick('wheat', 'rabi', 300), pick('fallow_green_manure', 'zaid')], { seasons });
  assert.ok(mixed.nutrient > cereal.nutrient);
  assert.ok(mixed.organic > cereal.organic);
  assert.ok(mixed.erosion >= cereal.erosion);
  const bare = rotationCriteria([pick('fallow', 'kharif'), pick('wheat', 'rabi'), pick('onion', 'zaid')], { seasons });
  assert.ok(bare.warnings.includes('bare_in_monsoon'));
  assert.ok(bare.erosion < cereal.erosion);
  const steep = rotationCriteria([pick('maize', 'kharif'), pick('wheat', 'rabi'), pick('fallow', 'zaid')], { seasons, slopePct: 10 });
  assert.ok(steep.erosion < cereal.erosion);
  assert.ok(mixed.forage > 0);
  assert.deepEqual(cropRoles(getCrop('pigeon_pea')).sort(), ['deep_rooted', 'drought_tolerant', 'nitrogen_fixer']);
  // Prices turn into a gross ₹/acre estimate only when every crop has one.
  const priced = rotationCriteria([pick('maize', 'kharif'), pick('wheat', 'rabi'), pick('fallow', 'zaid')], { seasons, prices: { maize: { modal: 2000 }, wheat: { modal: 2500 } } });
  assert.equal(priced.grossPerAcre, 2000 * 20 + 2500 * 18);
  const s2 = applyScenario(seasons, { rainPct: -20, tempC: 2 });
  assert.equal(s2[0].rainMm, Math.round(seasons[0].rainMm * 0.8));
  assert.equal(s2[1].tempMean, Math.round((seasons[1].tempMean + 2) * 10) / 10);
});

test('constraints: avoided crops never appear; low labour avoids hand-heavy crops; drier scenario needs more water', async () => {
  const base = planRotations({ seasons, irrigation: 'full' });
  const avoided = base.plans[0].picks.map((p) => p.crop).filter((c) => c !== 'fallow');
  const without = planRotations({ seasons, irrigation: 'full', constraints: { avoid: avoided } });
  for (const p of without.plans) for (const pk of p.picks) assert.ok(!avoided.includes(pk.crop));
  const low = planRotations({ seasons, irrigation: 'full', constraints: { lowLabour: true } });
  const heavy = low.plans[0].picks.filter((p) => getCrop(p.crop)?.labour >= 3);
  assert.equal(heavy.length, 0);
  const { applyScenario } = await import('../src/planner.js');
  const dry = planRotations({ seasons: applyScenario(seasons, { rainPct: -40 }), irrigation: 'full' });
  assert.ok(dry.plans[0].irrigationMm >= base.plans[0].irrigationMm || dry.plans[0].picks.some((p, i) => p.crop !== base.plans[0].picks[i].crop));
});
