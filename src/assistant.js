// Multilingual farm assistant backed by Claude.
// Answers are grounded in the NASA POWER climate summary and rotation plan for the farmer's location.

import Anthropic from '@anthropic-ai/sdk';

export const LANGUAGES = {
  en: 'English',
  hi: 'Hindi (हिन्दी)',
  mr: 'Marathi (मराठी)',
  bn: 'Bengali (বাংলা)',
  ta: 'Tamil (தமிழ்)',
  te: 'Telugu (తెలుగు)',
  kn: 'Kannada (ಕನ್ನಡ)',
  ml: 'Malayalam (മലയാളം)',
  pa: 'Punjabi (ਪੰਜਾਬੀ)',
};

const MODEL = 'claude-opus-5-5';
const MAX_QUESTION_CHARS = 1500;
const MAX_HISTORY = 10;

const SYSTEM_PROMPT = `You are Kisan AI, a friendly agronomy helper for small farmers in India.

How to answer:
- Use simple words a farmer with little schooling can follow. Short sentences, short paragraphs.
- Give practical, low-cost steps first. Mention local units (acre, bigha, quintal) when useful.
- Base climate statements on the NASA POWER data in the field context. If the data does not cover the question, say so instead of guessing.
- For pesticides or chemicals, prefer integrated pest management, give safety precautions, and suggest checking with the local Krishi Vigyan Kendra (KVK) or agriculture officer for doses.
- Never invent prices, government schemes or subsidy amounts. Use only the mandi prices in the field context, say they are today's reported prices, and suggest checking the local mandi before selling.
- Satellite and model data are coarse (250 m pixels, ~50 km weather cells). When you use them, say how sure the data is and ask the farmer to confirm what they see in the field. Local knowledge, the KVK and the agriculture officer are the final judges.
- Keep answers under about 180 words unless the farmer asks for more detail.`;

let client = null;
function getClient() {
  if (!client) client = new Anthropic();
  return client;
}

/** Compact, stable text version of the field context for the prompt. */
export function formatContext(ctx) {
  if (!ctx || !ctx.seasons) return 'No field data provided.';
  const lines = [`Location: ${ctx.lat}, ${ctx.lon}${ctx.placeName ? ` (${ctx.placeName})` : ''}`];
  lines.push(`Annual rainfall (NASA POWER long-term average): ${ctx.annualRain} mm`);
  for (const s of ctx.seasons) {
    lines.push(`${s.id}: mean ${s.tempMean}°C, hottest ${s.tempMax}°C, coldest ${s.tempMin}°C, rain ${s.rainMm} mm`);
  }
  if (ctx.soil) {
    const so = ctx.soil;
    lines.push(`Soil (ISRIC SoilGrids, 0-30 cm): ${so.texture?.replace(/_/g, ' ')}, sand ${so.sand}%, clay ${so.clay}%, pH ${so.ph ?? '?'}, organic carbon ${so.organicCarbon ?? '?'} g/kg`);
  }
  if (ctx.soilMoisture != null) lines.push(`Root-zone soil moisture now (Open-Meteo model): ${ctx.soilMoisture} m³/m³`);
  if (ctx.advice) lines.push(`Watering advice shown to farmer: ${ctx.advice.code}${ctx.advice.amountMm ? ` (~${ctx.advice.amountMm} mm)` : ''}; rain next 7 days ${ctx.advice.rain7} mm vs crop demand ${ctx.advice.et7} mm`);
  if (ctx.ndvi?.latest) lines.push(`Satellite greenness (NASA MODIS NDVI) on ${ctx.ndvi.latest.date}: ${ctx.ndvi.latest.ndvi} (${ctx.ndvi.status}${ctx.ndvi.trend ? `, ${ctx.ndvi.trend} over the last month` : ''})`);
  if (ctx.mandi?.crops) {
    const prices = Object.entries(ctx.mandi.crops)
      .slice(0, 12)
      .map(([crop, v]) => `${crop} ₹${v.modal}/quintal (${v.markets} reports${v.date ? `, ${v.date}` : ''})`);
    if (prices.length) lines.push(`Today's mandi modal prices in ${ctx.mandi.state} (data.gov.in): ${prices.join('; ')}`);
  }
  if (ctx.timeline) {
    const tl = ctx.timeline;
    const f = (tl.findings ?? []).slice(-6).map((x) => `${x.code} ${x.from}..${x.to}${x.causes?.length ? ` (with ${x.causes.join(', ')})` : ''}${x.drop != null ? ` drop ${x.drop}` : ''}`);
    if (f.length) lines.push(`Season timeline from MODIS NDVI + NASA POWER (rule-based, confidence ${tl.confidence}): ${f.join('; ')}`);
    if (tl.anomaly) lines.push(`Latest NDVI ${tl.anomaly.latest} vs normal ${tl.anomaly.normal} for this time of year (${tl.anomaly.status})`);
    if (tl.soilNow) lines.push(`NASA POWER root-zone soil wetness this month ${tl.soilNow.wet} vs normal ${tl.soilNow.normal}`);
  }
  if (ctx.irrigation) lines.push(`Irrigation available: ${ctx.irrigation}`);
  if (ctx.lastCrop) lines.push(`Last crop: ${ctx.lastCrop}`);
  if (Array.isArray(ctx.plan) && ctx.plan.length) lines.push(`Suggested rotation: ${ctx.plan.join(' → ')}`);
  return lines.join('\n');
}

export function validateQuestion({ question, language, history }) {
  if (typeof question !== 'string' || !question.trim()) throw new RangeError('Question is required');
  if (question.length > MAX_QUESTION_CHARS) throw new RangeError(`Question is too long (max ${MAX_QUESTION_CHARS} characters)`);
  if (language && !LANGUAGES[language]) throw new RangeError('Unsupported language');
  const cleanHistory = Array.isArray(history)
    ? history
        .filter((m) => (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string' && m.content.trim())
        .slice(-MAX_HISTORY)
        .map((m) => ({ role: m.role, content: m.content.slice(0, 4000) }))
    : [];
  // The conversation must start with a user turn.
  while (cleanHistory.length && cleanHistory[0].role !== 'user') cleanHistory.shift();
  return { question: question.trim(), language: language || 'en', history: cleanHistory };
}

export async function askAssistant(input, { anthropic = getClient() } = {}) {
  const { question, language, history } = validateQuestion(input);
  const langName = LANGUAGES[language];

  const messages = [
    ...history,
    {
      role: 'user',
      content: `Field context:\n${formatContext(input.context)}\n\nAnswer in ${langName}.\n\nQuestion: ${question}`,
    },
  ];

  const response = await anthropic.beta.messages.create({
    model: MODEL,
    max_tokens: 4000,
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    output_config: { effort: 'low' },
    system: SYSTEM_PROMPT,
    messages,
  });

  if (response.stop_reason === 'refusal') {
    return { answer: null, refused: true };
  }
  const answer = response.content
    .filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join('\n')
    .trim();
  return { answer, refused: false };
}
