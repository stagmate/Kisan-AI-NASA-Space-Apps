// Season timeline and stress check: fuses NASA POWER daily weather/soil wetness (MERRA-2, ~50 km, daily),
// NASA POWER long-term monthly normals, and MODIS NDVI (250 m, 8-day) on one monthly grid for the field,
// then explains what the vegetation curve shows. Every finding carries its evidence and a confidence level.
//
// Method (rule-based, so each step can be explained to a farmer):
//  1. Harmonise: aggregate daily data to calendar months (sum rain/ET, mean temps and soil wetness),
//     average 8-day NDVI into the same months, and attach each month's long-term normal.
//  2. Phases: lightly smooth the NDVI curve, then label each image bare / green-up / peak / decline / steady.
//  3. Explain declines: a fall in NDVI while soil is drier than normal, it is hot, or rain is far below
//     normal → "possible stress"; a fall after a peak down to bare soil with no such signal → "likely harvest".
//  4. Compare the latest NDVI with the same weeks of past years (anomaly).
//  5. Confidence from data quality: number of clear images, gaps, how fresh the data is.

import { MONTHS, DAYS_IN_MONTH } from './nasaPower.js';

const r1 = (n) => Math.round(n * 10) / 10;
const r2 = (n) => Math.round(n * 100) / 100;

/** Step 1: one row per calendar month, every source on the same monthly grid. */
export function harmonizeMonthly(daily, climatologyMonths, ndviSeries) {
  const byMonth = new Map();
  for (const d of daily) {
    const key = d.date.slice(0, 7);
    if (!byMonth.has(key)) byMonth.set(key, []);
    byMonth.get(key).push(d);
  }
  const rows = [];
  for (const [key, days] of byMonth) {
    const m = Number(key.slice(5, 7)) - 1;
    const normal = climatologyMonths[m];
    const daysInMonth = DAYS_IN_MONTH[m] + (m === 1 && Number(key.slice(0, 4)) % 4 === 0 ? 1 : 0);
    const fraction = days.length / daysInMonth;
    const sum = (k) => days.reduce((s, d) => s + (d[k] ?? 0), 0);
    const mean = (k) => {
      const v = days.map((d) => d[k]).filter((x) => x != null);
      return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
    };
    const rainMm = sum('rainMm');
    // Normal rain for the same number of days, so a part-month compares fairly.
    const rainNormal = normal ? (normal.rainMm / DAYS_IN_MONTH[m]) * days.length : null;
    const soilWet = mean('soilWet');
    const ndvi = ndviSeries.filter((p) => p.date.slice(0, 7) === key);
    rows.push({
      month: key,
      label: MONTHS[m],
      days: days.length,
      partial: fraction < 0.9,
      rainMm: Math.round(rainMm),
      rainNormalMm: rainNormal == null ? null : Math.round(rainNormal),
      rainAnomalyPct: rainNormal && rainNormal >= 10 ? Math.round(((rainMm - rainNormal) / rainNormal) * 100) : null,
      tMaxMean: r1(mean('tMax')),
      heatDays: days.filter((d) => d.tMax >= 38).length,
      frostNights: days.filter((d) => d.tMin != null && d.tMin <= 2).length,
      soilWet: soilWet == null ? null : r2(soilWet),
      soilWetNormal: normal?.soilWet ?? null,
      soilWetAnomaly: soilWet != null && normal?.soilWet != null ? r2(soilWet - normal.soilWet) : null,
      etMm: Math.round(sum('etMm')),
      // Water balance: rain in minus water used by plants and evaporation out.
      waterBalanceMm: Math.round(rainMm - sum('etMm')),
      ndvi: ndvi.length ? r2(ndvi.reduce((s, p) => s + p.ndvi, 0) / ndvi.length) : null,
      ndviImages: ndvi.length,
    });
  }
  return rows.sort((a, b) => a.month.localeCompare(b.month));
}

/** Step 2: label each NDVI image, then merge runs into segments. */
export function smoothNdvi(series) {
  // 3-point median removes single noisy readings (thin cloud, shadow); a 3-point mean then evens the curve.
  const med = series.map((p, i) => {
    const w = [series[i - 1]?.ndvi, p.ndvi, series[i + 1]?.ndvi].filter((x) => x != null).sort((x, y) => x - y);
    return w[Math.floor(w.length / 2)];
  });
  return med.map((x, i) => {
    const w = [med[i - 1], x, med[i + 1]].filter((y) => y != null);
    return w.reduce((s, y) => s + y, 0) / w.length;
  });
}

const MIN_CHANGE = 0.08; // smaller changes are within the noise of a 250 m, 8-day product

export function detectPhases(series) {
  if (series.length < 4) return [];
  const v = smoothNdvi(series);
  const labels = v.map((x, i) => {
    const slope = i ? x - v[i - 1] : 0;
    if (x < 0.25) return 'bare';
    if (slope >= 0.03) return 'greenup';
    if (slope <= -0.03) return 'decline';
    if (x >= 0.45) return 'peak';
    return 'steady';
  });
  let segments = [];
  labels.forEach((phase, i) => {
    const last = segments[segments.length - 1];
    if (last && last.phase === phase) {
      last.to = series[i].date;
      last.end = v[i];
      last.n++;
    } else segments.push({ phase, from: series[i].date, to: series[i].date, start: i ? v[i - 1] : v[i], end: v[i], n: 1 });
  });
  // Absorb short wobbles: a rise or fall smaller than MIN_CHANGE is not a real phase change.
  segments = segments.reduce((out, s) => {
    const prev = out[out.length - 1];
    const small = (s.phase === 'greenup' || s.phase === 'decline') && Math.abs(s.end - s.start) < MIN_CHANGE;
    const tiny = s.n === 1 && s.phase !== 'bare' && prev;
    if (prev && (small || tiny || prev.phase === s.phase)) {
      prev.to = s.to;
      prev.end = s.end;
      prev.n += s.n;
    } else out.push({ ...s });
    return out;
  }, []);
  return segments.map(({ n, ...s }) => ({ ...s, start: r2(s.start), end: r2(s.end), images: n }));
}

/** Step 3: explain each decline using the weather and soil of the same months. */
export function explainDeclines(segments, monthly) {
  const findings = [];
  const monthsBetween = (from, to) => monthly.filter((m) => m.month >= from.slice(0, 7) && m.month <= to.slice(0, 7));
  segments.forEach((s) => {
    const change = r2(s.end - s.start);
    if (s.phase === 'decline' && -change >= MIN_CHANGE) {
      const months = monthsBetween(s.from, s.to);
      const causes = [];
      if (months.some((m) => m.soilWetAnomaly != null && m.soilWetAnomaly <= -0.05)) causes.push('dry_soil');
      if (months.some((m) => m.heatDays >= 5)) causes.push('heat');
      if (months.some((m) => m.rainAnomalyPct != null && m.rainAnomalyPct <= -40)) causes.push('low_rain');
      // A crop that was well grown and ends near bare soil looks like a harvest.
      const harvestShape = s.start >= 0.4 && s.end <= 0.35;
      const base = { from: s.from, to: s.to, drop: -change, start: s.start, end: s.end };
      if (causes.length) findings.push({ code: harvestShape ? 'stress_or_harvest' : 'stress_possible', ...base, causes });
      else if (harvestShape) findings.push({ code: 'harvest_likely', ...base });
      else findings.push({ code: 'decline_unexplained', ...base });
    }
    if (s.phase === 'greenup' && change >= MIN_CHANGE) findings.push({ code: 'greenup', from: s.from, to: s.to, rise: change, start: s.start, end: s.end });
    if (s.phase === 'bare' && s.images >= 2) findings.push({ code: 'bare_period', from: s.from, to: s.to });
  });
  return findings;
}

/** Step 5: how sure we are, with the reasons. */
export function confidence({ series, normal, monthly, now = new Date() }) {
  const reasons = [];
  let score = 3;
  const recent = series.filter((p) => now - Date.parse(p.date) <= 48 * 864e5).length;
  if (recent === 0) {
    score -= 2;
    reasons.push('no_recent_images');
  } else if (recent < 3) {
    score -= 1;
    reasons.push('few_recent_images');
  }
  for (let i = 1; i < series.length; i++) {
    if (Date.parse(series[i].date) - Date.parse(series[i - 1].date) > 40 * 864e5) {
      score -= 1;
      reasons.push('cloud_gap');
      break;
    }
  }
  if (!normal?.values?.length) {
    score -= 1;
    reasons.push('no_past_years');
  }
  if (!monthly.some((m) => m.soilWetAnomaly != null)) {
    score -= 1;
    reasons.push('no_soil_normal');
  }
  // Always true and always worth saying: these are coarse pixels, not the field itself.
  reasons.push('coarse_pixels');
  return { level: score >= 3 ? 'high' : score >= 2 ? 'medium' : 'low', reasons };
}

/** Everything the timeline card needs. */
export function analyzeTimeline({ daily, climatologyMonths, ndvi, normal = null, now = new Date() }) {
  const series = ndvi?.series ?? [];
  const monthly = harmonizeMonthly(daily, climatologyMonths, series);
  const segments = detectPhases(series);
  const findings = explainDeclines(segments, monthly);

  // Step 4: latest greenness vs the same weeks of past years.
  const latest = series.at(-1) ?? null;
  let anomaly = null;
  if (latest && normal?.normal != null) {
    const diff = r2(latest.ndvi - normal.normal);
    anomaly = { latest: latest.ndvi, normal: normal.normal, diff, years: new Set(normal.values.map((v) => v.date.slice(0, 4))).size, status: diff <= -0.1 ? 'below' : diff >= 0.1 ? 'above' : 'near' };
    if (anomaly.status === 'below') findings.push({ code: 'below_normal_now', from: latest.date, to: latest.date, drop: -diff });
  }
  // Current soil wetness vs normal for this month (latest complete data).
  const lastMonth = monthly.at(-1) ?? null;
  const soilNow = lastMonth?.soilWetAnomaly != null ? { month: lastMonth.month, wet: lastMonth.soilWet, normal: lastMonth.soilWetNormal, diff: lastMonth.soilWetAnomaly } : null;
  return {
    monthly,
    segments,
    findings,
    anomaly,
    soilNow,
    lastDailyDate: daily.at(-1)?.date ?? null,
    confidence: confidence({ series, normal, monthly, now }),
  };
}
