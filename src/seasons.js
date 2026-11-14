// Turns monthly NASA POWER climatology into farming seasons and plain-language insights.
// Seasons follow the Indian cropping calendar.

export const SEASONS = [
  { id: 'kharif', months: [5, 6, 7, 8, 9] }, // Jun–Oct, monsoon
  { id: 'rabi', months: [10, 11, 0, 1, 2] }, // Nov–Mar, winter
  { id: 'zaid', months: [3, 4] }, // Apr–May, summer
];

const round1 = (n) => Math.round(n * 10) / 10;

export function summarizeSeason(season, months) {
  const ms = season.months.map((i) => months[i]);
  const avg = (key) => ms.reduce((s, m) => s + m[key], 0) / ms.length;
  return {
    id: season.id,
    months: ms.map((m) => m.month),
    tempMean: round1(avg('tempMean')),
    // Typical hottest afternoon and coldest night in the season (used for crop scoring).
    tempMax: round1(Math.max(...ms.map((m) => m.dayHigh ?? m.tempMean))),
    tempMin: round1(Math.min(...ms.map((m) => m.nightLow ?? m.tempMean))),
    // Record extremes, shown as context only.
    recordMax: round1(Math.max(...ms.map((m) => m.tempMax ?? m.tempMean))),
    recordMin: round1(Math.min(...ms.map((m) => m.tempMin ?? m.tempMean))),
    rainMm: Math.round(ms.reduce((s, m) => s + m.rainMm, 0)),
  };
}

/**
 * Insight codes are language-neutral; the UI turns them into sentences.
 * Each has a `level` (info | good | warn) and the numbers behind it.
 */
export function buildInsights(months, seasons) {
  const insights = [];
  const annualRain = Math.round(months.reduce((s, m) => s + m.rainMm, 0));
  const wettest = months.reduce((a, b) => (b.rainMm > a.rainMm ? b : a));
  const hottest = months.reduce((a, b) => (b.tempMean > a.tempMean ? b : a));
  const kharif = seasons.find((s) => s.id === 'kharif');
  const monsoonShare = annualRain > 0 ? Math.round((kharif.rainMm / annualRain) * 100) : 0;

  insights.push({ code: 'annual_rain', level: annualRain < 500 ? 'warn' : 'info', value: annualRain });
  insights.push({ code: 'wettest_month', level: 'info', month: wettest.month, value: Math.round(wettest.rainMm) });
  insights.push({ code: 'hottest_month', level: hottest.tempMean >= 33 ? 'warn' : 'info', month: hottest.month, value: round1(hottest.tempMean) });
  if (monsoonShare >= 70) insights.push({ code: 'monsoon_dependent', level: 'warn', value: monsoonShare });

  // Cold nights: typical lows near freezing mean regular frost; record lows below 0 mean occasional frost.
  const frostMonths = months.filter((m) => (m.nightLow ?? m.tempMean) <= 4).map((m) => m.month);
  const rareFrost = months.filter((m) => !frostMonths.includes(m.month) && m.tempMin != null && m.tempMin <= 0).map((m) => m.month);
  if (frostMonths.length) insights.push({ code: 'frost_risk', level: 'warn', months: frostMonths });
  else if (rareFrost.length) insights.push({ code: 'occasional_frost', level: 'info', months: rareFrost });

  const heatMonths = months.filter((m) => (m.dayHigh ?? m.tempMean) >= 40).map((m) => m.month);
  if (heatMonths.length) insights.push({ code: 'heat_risk', level: 'warn', months: heatMonths });

  const dryRabi = seasons.find((s) => s.id === 'rabi');
  if (dryRabi.rainMm < 100) insights.push({ code: 'rabi_needs_irrigation', level: 'warn', value: dryRabi.rainMm });
  else insights.push({ code: 'rabi_some_rain', level: 'good', value: dryRabi.rainMm });

  return { annualRain, insights };
}

export function analyzeClimate(climate) {
  const seasons = SEASONS.map((s) => summarizeSeason(s, climate.months));
  const { annualRain, insights } = buildInsights(climate.months, seasons);
  return { ...climate, annualRain, seasons, insights };
}
