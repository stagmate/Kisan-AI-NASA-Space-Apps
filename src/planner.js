// One-year crop rotation planner: Kharif → Rabi → Zaid.
// Each crop is scored against the season's NASA POWER climate, the soil and the farmer's water and labour;
// whole sequences are then compared on eight explainable criteria (see rotationCriteria).

import { CROPS, getCrop } from './crops.js';

export const IRRIGATION_MM = { rainfed: 0, limited: 250, full: 900 };
export const PRIORITIES = ['balanced', 'income', 'soil', 'water'];

// Only part of seasonal rain is usable by a crop (runoff, evaporation, deep drainage).
const EFFECTIVE_RAIN = 0.7;
const FALLOW = { id: 'fallow', family: 'none', nitrogen: 'light', value: 0, waterMm: 0, residue: 0, roots: 'shallow', cover: 0, forage: 0, drought: 3, labour: 0, yieldQtlAcre: 0 };
// Harvests that dig or turn the soil (tubers, bulbs, pods underground) leave it loose and easy to wash away.
const SOIL_DISTURBING = new Set(['potato', 'onion', 'groundnut']);

/** Score how well one crop fits one season. Returns null when it clearly cannot grow. */
export function scoreCrop(crop, season, irrigation = 'rainfed', storedMm = 0, soil = null, constraints = {}) {
  if (!crop.seasons.includes(season.id)) return null;
  const warnings = [];
  const reasons = [];

  // Temperature fit (0–40)
  const [lo, hi] = crop.tempRange;
  const off = season.tempMean < lo ? lo - season.tempMean : season.tempMean > hi ? season.tempMean - hi : 0;
  if (off > 5) return null;
  const tempScore = Math.max(0, 40 - off * 8);
  if (off === 0) reasons.push('temp_ideal');

  // Water fit (0–40)
  const available = season.rainMm * EFFECTIVE_RAIN + storedMm + (IRRIGATION_MM[irrigation] ?? 0);
  const ratio = available / crop.waterMm;
  if (ratio < 0.5) return null;
  const waterScore = Math.min(40, 40 * ratio);
  const irrigationNeed = Math.max(0, Math.round(crop.waterMm - season.rainMm * EFFECTIVE_RAIN - storedMm));
  if (ratio >= 1 && irrigationNeed === 0) reasons.push('rain_enough');
  if (ratio < 1) warnings.push('water_short');

  // Value (0–20)
  const valueScore = crop.value * 5;

  // Extreme-temperature penalties
  let penalty = 0;
  if (season.tempMax > crop.heatLimit) {
    penalty += Math.min(20, (season.tempMax - crop.heatLimit) * 2);
    warnings.push('heat_stress');
  }
  if (!crop.frostSafe && season.tempMin <= 0) {
    penalty += 10;
    warnings.push('frost_risk');
  }
  if (soil?.ph != null && crop.phRange) {
    const [pLo, pHi] = crop.phRange;
    const phOff = soil.ph < pLo ? pLo - soil.ph : soil.ph > pHi ? soil.ph - pHi : 0;
    if (phOff > 0) {
      penalty += Math.min(20, Math.round(phOff * 12));
      warnings.push(soil.ph < pLo ? 'soil_too_acidic' : 'soil_too_alkaline');
    } else {
      reasons.push('soil_ph_suits');
    }
  }
  if (crop.nitrogen === 'fix') reasons.push('adds_nitrogen');
  if (constraints.lowLabour && crop.labour >= 3) {
    penalty += 15;
    warnings.push('labour_heavy');
  }

  const score = Math.max(0, Math.round(tempScore + waterScore + valueScore - penalty));
  return { crop: crop.id, season: season.id, score, irrigationNeed, reasons, warnings };
}

/** Best candidates for a season, highest score first. */
export function rankCrops(season, irrigation, limit = 6, storedMm = 0, soil = null, constraints = {}) {
  const avoid = new Set(constraints.avoid ?? []);
  return CROPS.filter((c) => !avoid.has(c.id))
    .map((c) => scoreCrop(c, season, irrigation, storedMm, soil, constraints))
    .filter(Boolean)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

function cropOf(id) {
  return id === 'fallow' ? FALLOW : getCrop(id);
}

/**
 * Soil water left after the monsoon that a Rabi crop can draw on
 * (how chickpea and mustard grow without irrigation on heavier soils).
 */
export function monsoonCarryover(kharifRainMm, soil = null) {
  // Heavier soils hold more of the monsoon for the next crop; sandy soils drain it away.
  const holding = soil?.water ? (soil.water.fc - soil.water.wp) / 0.15 : 1;
  const factor = Math.max(0.5, Math.min(1.4, holding));
  return Math.round(Math.min(200, Math.max(0, (kharifRainMm - 400) * 0.4 * factor)));
}

/** Change rainfall by a percentage and temperature by degrees, for "what if" scenarios. */
export function applyScenario(seasons, { rainPct = 0, tempC = 0 } = {}) {
  if (!rainPct && !tempC) return seasons;
  const r1 = (n) => Math.round(n * 10) / 10;
  return seasons.map((s) => ({
    ...s,
    rainMm: Math.max(0, Math.round(s.rainMm * (1 + rainPct / 100))),
    tempMean: r1(s.tempMean + tempC),
    tempMax: r1(s.tempMax + tempC),
    tempMin: r1(s.tempMin + tempC),
  }));
}

const clamp = (n) => Math.max(0, Math.min(100, Math.round(n)));

/** What each crop does for the farm, shown as short explanations. */
export function cropRoles(crop) {
  const roles = [];
  if (crop.nitrogen === 'fix') roles.push('nitrogen_fixer');
  if (crop.id === 'fallow_green_manure' || crop.cover >= 3) roles.push('cover_crop');
  if (crop.roots === 'deep') roles.push('deep_rooted');
  if (crop.drought >= 3) roles.push('drought_tolerant');
  if (crop.forage >= 3) roles.push('fodder');
  return roles;
}

/**
 * Score a rotation on eight criteria (0–100, higher is better), each with plain reasons:
 *  nutrient  – nitrogen balance: legumes add N, heavy feeders in a row drain it
 *  erosion   – protection from erosion: ground cover in the rainy seasons, digging harvests, slope
 *  organic   – organic matter from residue and green manure
 *  pest      – how well the rotation breaks pest and disease cycles (crop-family changes)
 *  water     – irrigation the rotation needs on top of rain
 *  forage    – fodder for animals
 *  market    – rough income: today's mandi price × typical yield where known
 *  drought   – how well the crops cope with a dry spell
 */
export function rotationCriteria(picks, { lastCrop = null, seasons = null, prices = null, slopePct = 0 } = {}) {
  const crops = picks.map((p) => cropOf(p.crop));
  const grown = crops.filter((c) => c.id !== 'fallow');
  const reasons = [];
  const warnings = [];
  const chain = [lastCrop ? cropOf(lastCrop) : null, ...crops, crops[0]];
  const pairs = [];
  for (let i = 1; i < chain.length; i++) if (chain[i - 1] && chain[i]) pairs.push([chain[i - 1], chain[i]]);

  // Nutrients
  let nutrient = 50;
  const legumes = grown.filter((c) => c.nitrogen === 'fix').length;
  if (legumes) {
    nutrient += 15 + (legumes - 1) * 5;
    reasons.push('has_legume');
  } else {
    nutrient -= 15;
    warnings.push('no_legume');
  }
  for (const [a, b] of pairs) {
    if (a.nitrogen === 'fix' && b.nitrogen === 'heavy') {
      nutrient += 8;
      if (!reasons.includes('legume_feeds_next')) reasons.push('legume_feeds_next');
    }
    if (a.nitrogen === 'heavy' && b.nitrogen === 'heavy') {
      nutrient -= 8;
      if (!warnings.includes('heavy_after_heavy')) warnings.push('heavy_after_heavy');
    }
  }

  // Pest and disease cycles
  let pest = 60;
  for (const [a, b] of pairs) {
    if (a.id !== 'fallow' && b.id !== 'fallow' && a.family === b.family) {
      pest -= 20;
      if (!warnings.includes('same_family')) warnings.push('same_family');
    }
  }
  const families = new Set(grown.map((c) => c.family)).size;
  if (families >= 3) {
    pest += 25;
    reasons.push('diverse_families');
  } else if (families === 2) pest += 10;
  if (crops.some((c) => c.id === 'fallow')) {
    pest += 5;
    reasons.push('one_fallow_season');
  }

  // Organic matter
  let organic = 20 + (crops.reduce((s, c) => s + (c.residue ?? 0), 0) / 9) * 60;
  if (crops.some((c) => c.id === 'fallow_green_manure')) {
    organic += 20;
    reasons.push('green_manure');
  }
  if (crops.some((c) => c.roots === 'deep')) organic += 5;

  // Erosion: weight each season's ground cover by its share of the year's rain.
  const rain = Object.fromEntries((seasons ?? []).map((s) => [s.id, s.rainMm]));
  const totalRain = Object.values(rain).reduce((a, b) => a + b, 0);
  let risk = 0;
  picks.forEach((p, i) => {
    const share = totalRain ? (rain[p.season] ?? 0) / totalRain : [0.75, 0.15, 0.1][i];
    const c = crops[i];
    risk += share * ((3 - (c.cover ?? 0)) / 3);
    if (SOIL_DISTURBING.has(c.id)) risk += share * 0.2;
  });
  let erosion = 100 * (1 - Math.min(1, risk));
  if (slopePct > 2) erosion -= (slopePct - 2) * 4;
  const kharif = crops[0];
  if (kharif.id === 'fallow') warnings.push('bare_in_monsoon');
  else if ((kharif.cover ?? 0) >= 2) reasons.push('covered_in_monsoon');

  // Water, fodder, drought
  const irrigationMm = picks.reduce((s, p) => s + (p.irrigationNeed ?? 0), 0);
  const water = 100 - irrigationMm / 15;
  const forage = (crops.reduce((s, c) => s + (c.forage ?? 0), 0) / 9) * 100;
  const drought = grown.length ? (grown.reduce((s, c) => s + c.drought, 0) / (grown.length * 3)) * 100 : 0;

  // Market: gross ₹/acre at today's mandi prices where we have them, else a rough value index.
  let grossPerAcre = 0;
  let priced = 0;
  for (const c of grown) {
    const price = prices?.[c.id]?.modal;
    if (price && c.yieldQtlAcre) {
      grossPerAcre += price * c.yieldQtlAcre;
      priced++;
    }
  }
  const valueIndex = (grown.reduce((s, c) => s + c.value, 0) / (crops.length * 4)) * 100;
  const allPriced = grown.length > 0 && priced === grown.length;
  // ₹2.5 lakh gross per acre per year scores 100.
  const market = allPriced ? Math.min(100, grossPerAcre / 2500) : valueIndex;

  return {
    nutrient: clamp(nutrient),
    erosion: clamp(erosion),
    organic: clamp(organic),
    pest: clamp(pest),
    water: clamp(water),
    forage: clamp(forage),
    market: clamp(market),
    drought: clamp(drought),
    irrigationMm,
    grossPerAcre: allPriced ? Math.round(grossPerAcre / 100) * 100 : null,
    reasons,
    warnings,
  };
}

const WEIGHTS = {
  balanced: { fit: 0.35, soil: 0.25, water: 0.15, income: 0.15, drought: 0.1 },
  income: { fit: 0.3, soil: 0.15, water: 0.1, income: 0.4, drought: 0.05 },
  soil: { fit: 0.3, soil: 0.45, water: 0.1, income: 0.1, drought: 0.05 },
  water: { fit: 0.3, soil: 0.15, water: 0.35, income: 0.1, drought: 0.1 },
};

/** Score a full sequence of picks (one per season, in calendar order). */
export function scoreSequence(picks, { lastCrop = null, priority = 'balanced', seasons = null, prices = null, slopePct = 0, needFodder = false, droughtBoost = 0 } = {}) {
  const c = rotationCriteria(picks, { lastCrop, seasons, prices, slopePct });
  const soil = (c.nutrient + c.erosion + c.organic + c.pest) / 4;
  const fit = picks.reduce((s, p) => s + p.score, 0) / picks.length;
  const w = { ...(WEIGHTS[priority] ?? WEIGHTS.balanced) };
  if (needFodder) w.forage = 0.15;
  // In a drier "what if" year, surviving a dry spell matters more.
  w.drought += droughtBoost;
  const sum = Object.values(w).reduce((a, b) => a + b, 0);
  const total = Math.round(
    (fit * w.fit + soil * w.soil + c.water * w.water + c.market * w.income + c.drought * w.drought + c.forage * (w.forage ?? 0)) / sum,
  );
  const roles = picks
    .filter((p) => p.crop !== 'fallow')
    .map((p) => ({ crop: p.crop, roles: cropRoles(cropOf(p.crop)) }))
    .filter((r) => r.roles.length);
  return {
    total,
    parts: { fit: Math.round(fit), soil: Math.round(soil), water: c.water, income: c.market },
    criteria: {
      nutrient: c.nutrient, erosion: c.erosion, organic: c.organic, pest: c.pest,
      water: c.water, forage: c.forage, market: c.market, drought: c.drought,
    },
    irrigationMm: c.irrigationMm,
    grossPerAcre: c.grossPerAcre,
    roles,
    reasons: c.reasons,
    warnings: c.warnings,
  };
}

/**
 * Build the best rotations for a location.
 * @param {object} opts
 * @param {Array} opts.seasons      from analyzeClimate(): kharif, rabi, zaid summaries
 * @param {string} opts.irrigation  rainfed | limited | full
 * @param {string} [opts.lastCrop]  crop grown in the season before the coming Kharif
 * @param {string} [opts.priority]  balanced | income | soil | water
 * @param {object} [opts.constraints] { lowLabour, needFodder, avoid: [cropId] }
 * @param {object} [opts.prices]    mandi prices by crop id ({ modal })
 * @param {number} [opts.slopePct]  field slope, for erosion risk
 */
export function planRotations({
  seasons, irrigation = 'rainfed', lastCrop = null, priority = 'balanced', count = 3, soil = null,
  constraints = {}, prices = null, slopePct = 0, rainPct = 0,
}) {
  const byId = Object.fromEntries(seasons.map((s) => [s.id, s]));
  const order = ['kharif', 'rabi', 'zaid'];
  const stored = monsoonCarryover(byId.kharif.rainMm, soil);
  const options = order.map((id) => {
    const ranked = rankCrops(byId[id], irrigation, 6, id === 'rabi' ? stored : 0, soil, constraints);
    // Leaving land fallow is always possible; it scores low but is better than a failed crop.
    ranked.push({ crop: 'fallow', season: id, score: id === 'zaid' ? 45 : 30, irrigationNeed: 0, reasons: ['rest_soil'], warnings: [] });
    return ranked;
  });

  const droughtBoost = rainPct < 0 ? Math.min(0.4, (-rainPct / 100) * 0.8) : 0;
  const opts = { lastCrop, priority, seasons, prices, slopePct, needFodder: Boolean(constraints.needFodder), droughtBoost };
  const plans = [];
  for (const k of options[0]) {
    if (lastCrop && k.crop === lastCrop) continue; // never repeat last season's crop
    for (const r of options[1]) {
      for (const z of options[2]) {
        const picks = [k, r, z];
        if (picks.filter((p) => p.crop === 'fallow').length > 1) continue; // at most one fallow season
        plans.push({ picks, ...scoreSequence(picks, opts) });
      }
    }
  }
  plans.sort((a, b) => b.total - a.total);

  if (!plans.length || plans[0].picks.every((p) => p.crop === 'fallow')) {
    return { plans: [], options, message: 'no_suitable_crops' };
  }

  // Keep plans that differ from every chosen one in at least two seasons.
  const chosen = [];
  for (const p of plans) {
    const distinct = chosen.every((c) => c.picks.filter((x, i) => x.crop !== p.picks[i].crop).length >= 2);
    if (distinct) chosen.push(p);
    if (chosen.length === count) break;
  }
  return { plans: chosen, options };
}
