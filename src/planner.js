// One-year crop rotation planner: Kharif → Rabi → Zaid.
// Each crop is scored against the season's NASA POWER climate and the farmer's water,
// then whole sequences are scored for soil health, water use and income.

import { CROPS, getCrop } from './crops.js';

export const IRRIGATION_MM = { rainfed: 0, limited: 250, full: 900 };
export const PRIORITIES = ['balanced', 'income', 'soil', 'water'];

// Only part of seasonal rain is usable by a crop (runoff, evaporation, deep drainage).
const EFFECTIVE_RAIN = 0.7;
const FALLOW = { id: 'fallow', family: 'none', nitrogen: 'light', value: 0, waterMm: 0 };

/** Score how well one crop fits one season. Returns null when it clearly cannot grow. */
export function scoreCrop(crop, season, irrigation = 'rainfed', storedMm = 0, soil = null) {
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

  const score = Math.max(0, Math.round(tempScore + waterScore + valueScore - penalty));
  return { crop: crop.id, season: season.id, score, irrigationNeed, reasons, warnings };
}

/** Best candidates for a season, highest score first. */
export function rankCrops(season, irrigation, limit = 6, storedMm = 0, soil = null) {
  return CROPS.map((c) => scoreCrop(c, season, irrigation, storedMm, soil))
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

/** Score a full sequence of picks (one per season, in calendar order). */
export function scoreSequence(picks, { lastCrop = null, priority = 'balanced' } = {}) {
  const crops = picks.map((p) => cropOf(p.crop));
  const reasons = [];
  const warnings = [];
  let soil = 50;

  const legumes = crops.filter((c) => c.nitrogen === 'fix').length;
  if (legumes > 0) {
    soil += 15 + (legumes - 1) * 5;
    reasons.push('has_legume');
  } else {
    soil -= 10;
    warnings.push('no_legume');
  }

  // Look at each crop and the one before it: last season's crop → this year's three
  // → next year's Kharif (the rotation repeats).
  const chain = [lastCrop ? cropOf(lastCrop) : null, ...crops, crops[0]];
  for (let i = 1; i < chain.length; i++) {
    const a = chain[i - 1];
    const b = chain[i];
    if (!a || !b || a.id === 'fallow' || b.id === 'fallow') continue;
    if (a.family === b.family) {
      soil -= 12;
      if (!warnings.includes('same_family')) warnings.push('same_family');
    }
    if (a.nitrogen === 'heavy' && b.nitrogen === 'heavy') {
      soil -= 6;
      if (!warnings.includes('heavy_after_heavy')) warnings.push('heavy_after_heavy');
    }
    if (a.nitrogen === 'fix' && b.nitrogen === 'heavy') {
      soil += 6;
      if (!reasons.includes('legume_feeds_next')) reasons.push('legume_feeds_next');
    }
  }
  if (new Set(crops.filter((c) => c.id !== 'fallow').map((c) => c.family)).size >= 3) {
    soil += 8;
    reasons.push('diverse_families');
  }
  soil = Math.max(0, Math.min(100, soil));

  const fit = picks.reduce((s, p) => s + p.score, 0) / picks.length;
  const irrigation = picks.reduce((s, p) => s + p.irrigationNeed, 0);
  const water = Math.max(0, 100 - irrigation / 15);
  const income = Math.min(100, (crops.reduce((s, c) => s + c.value, 0) / (crops.length * 4)) * 100);
  if (crops.some((c) => c.id === 'fallow')) reasons.push('one_fallow_season');

  const weights = {
    balanced: { fit: 0.4, soil: 0.25, water: 0.15, income: 0.2 },
    income: { fit: 0.3, soil: 0.15, water: 0.1, income: 0.45 },
    soil: { fit: 0.3, soil: 0.45, water: 0.1, income: 0.15 },
    water: { fit: 0.3, soil: 0.15, water: 0.4, income: 0.15 },
  }[priority] ?? { fit: 0.4, soil: 0.25, water: 0.15, income: 0.2 };

  const total = Math.round(fit * weights.fit + soil * weights.soil + water * weights.water + income * weights.income);
  return {
    total,
    parts: { fit: Math.round(fit), soil: Math.round(soil), water: Math.round(water), income: Math.round(income) },
    irrigationMm: irrigation,
    reasons,
    warnings,
  };
}

/**
 * Build the best rotations for a location.
 * @param {object} opts
 * @param {Array} opts.seasons      from analyzeClimate(): kharif, rabi, zaid summaries
 * @param {string} opts.irrigation  rainfed | limited | full
 * @param {string} [opts.lastCrop]  crop grown in the season before the coming Kharif
 * @param {string} [opts.priority]  balanced | income | soil | water
 */
export function planRotations({ seasons, irrigation = 'rainfed', lastCrop = null, priority = 'balanced', count = 3, soil = null }) {
  const byId = Object.fromEntries(seasons.map((s) => [s.id, s]));
  const order = ['kharif', 'rabi', 'zaid'];
  const stored = monsoonCarryover(byId.kharif.rainMm, soil);
  const options = order.map((id) => {
    const ranked = rankCrops(byId[id], irrigation, 6, id === 'rabi' ? stored : 0, soil);
    // Leaving land fallow is always possible; it scores low but is better than a failed crop.
    ranked.push({ crop: 'fallow', season: id, score: id === 'zaid' ? 45 : 30, irrigationNeed: 0, reasons: ['rest_soil'], warnings: [] });
    return ranked;
  });

  const plans = [];
  for (const k of options[0]) {
    if (lastCrop && k.crop === lastCrop) continue; // never repeat last season's crop
    for (const r of options[1]) {
      for (const z of options[2]) {
        const picks = [k, r, z];
        if (picks.filter((p) => p.crop === 'fallow').length > 1) continue; // at most one fallow season
        plans.push({ picks, ...scoreSequence(picks, { lastCrop, priority }) });
      }
    }
  }
  plans.sort((a, b) => b.total - a.total);

  if (plans.length && plans[0].picks.every((p) => p.crop === 'fallow')) {
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
