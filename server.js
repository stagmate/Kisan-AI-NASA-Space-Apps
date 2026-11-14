import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Anthropic from '@anthropic-ai/sdk';
import { getClimatology } from './src/nasaPower.js';
import { analyzeClimate } from './src/seasons.js';
import { planRotations, applyScenario, IRRIGATION_MM, PRIORITIES } from './src/planner.js';
import { CROP_IDS } from './src/crops.js';
import { askAssistant, LANGUAGES } from './src/assistant.js';
import { getSoil, soilNotes } from './src/soil.js';
import { getForecast, wateringAdvice } from './src/forecast.js';
import { getNdvi } from './src/ndvi.js';
import { validateCoords } from './src/nasaPower.js';
import { getPlace } from './src/geo.js';
import { getMandiPrices, MandiNotConfigured } from './src/mandi.js';

const here = path.dirname(fileURLToPath(import.meta.url));

const hasClaudeKey = () => Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);

export function createApp({
  climateSource = getClimatology,
  soilSource = getSoil,
  forecastSource = getForecast,
  ndviSource = getNdvi,
  placeSource = getPlace,
  mandiSource = getMandiPrices,
  ask = askAssistant,
  assistantReady = hasClaudeKey,
} = {}) {
  const app = express();
  app.use(express.json({ limit: '64kb' }));
  app.use(express.static(path.join(here, 'public')));

  // Says which optional keys are set (yes/no only, never the values) and where the function runs.
  app.get('/api/health', (_req, res) =>
    res.json({
      ok: true,
      region: process.env.VERCEL_REGION ?? null,
      ANTHROPIC_API_KEY: hasClaudeKey(),
      DATA_GOV_IN_API_KEY: Boolean(process.env.DATA_GOV_IN_API_KEY),
    }),
  );

  app.get('/api/meta', (_req, res) =>
    res.json({ crops: CROP_IDS, irrigation: Object.keys(IRRIGATION_MM), priorities: PRIORITIES, languages: LANGUAGES }),
  );

  app.get('/api/climate', async (req, res) => {
    try {
      const climate = await climateSource(req.query.lat, req.query.lon);
      res.json(analyzeClimate(climate));
    } catch (err) {
      sendError(res, err);
    }
  });

  // Live field data: soil (SoilGrids), 7-day forecast + soil moisture (Open-Meteo), crop greenness (MODIS).
  // Each source is independent; a failure in one is reported without hiding the others.
  app.get('/api/field', async (req, res) => {
    try {
      const { lat, lon } = validateCoords(req.query.lat, req.query.lon);
      const want = new Set(String(req.query.parts || 'soil,forecast,ndvi').split(','));
      const run = (name, fn) => (want.has(name) ? fn() : Promise.resolve(undefined));
      const [soilR, forecastR, ndviR] = await Promise.allSettled([
        run('soil', () => soilSource(lat, lon)),
        run('forecast', () => forecastSource(lat, lon)),
        run('ndvi', () => ndviSource(lat, lon)),
      ]);
      const out = { lat, lon, errors: {} };
      const take = (name, r) => {
        if (r.status === 'fulfilled') {
          if (r.value !== undefined) out[name] = r.value;
        } else {
          console.error(`${name} failed:`, r.reason?.message);
          out.errors[name] = r.reason?.message || 'unavailable';
        }
      };
      take('soil', soilR);
      take('forecast', forecastR);
      take('ndvi', ndviR);
      // No soil map anywhere near the point (inside a big town or on water): not an outage.
      if (want.has('soil') && soilR.status === 'fulfilled' && soilR.value === null) {
        delete out.soil;
        out.soilMissing = 'no_map_here';
      }
      if (out.soil) out.soilNotes = soilNotes(out.soil);
      if (out.forecast) out.advice = wateringAdvice(out.forecast, out.soil?.texture);
      res.json(out);
    } catch (err) {
      sendError(res, err);
    }
  });

  // Today's mandi prices for the field's state (data.gov.in), with the farmer's district highlighted.
  app.get('/api/mandi', async (req, res) => {
    try {
      const { lat, lon } = validateCoords(req.query.lat, req.query.lon);
      const place = await placeSource(lat, lon);
      if (!place?.state) return res.json({ state: null, crops: {}, reason: 'outside_india' });
      res.json(await mandiSource(place.state, place.district));
    } catch (err) {
      if (err instanceof MandiNotConfigured) {
        return res.status(503).json({ error: 'Mandi prices are not configured (DATA_GOV_IN_API_KEY).', code: 'not_configured' });
      }
      sendError(res, err);
    }
  });

  app.post('/api/plan', async (req, res) => {
    try {
      const {
        lat, lon, irrigation = 'rainfed', lastCrop = null, priority = 'balanced',
        constraints = {}, scenario = {}, slopePct = 0,
      } = req.body ?? {};
      if (!(irrigation in IRRIGATION_MM)) throw new RangeError('Unknown irrigation level');
      if (!PRIORITIES.includes(priority)) throw new RangeError('Unknown priority');
      if (lastCrop && !CROP_IDS.includes(lastCrop)) throw new RangeError('Unknown last crop');
      const avoid = Array.isArray(constraints.avoid) ? constraints.avoid.filter((c) => CROP_IDS.includes(c)).slice(0, 20) : [];
      const rainPct = Math.max(-50, Math.min(50, Number(scenario.rainPct) || 0));
      const tempC = Math.max(-3, Math.min(5, Number(scenario.tempC) || 0));
      const slope = Math.max(0, Math.min(60, Number(slopePct) || 0));
      const quiet = (name) => (err) => {
        console.error(`${name} failed:`, err.message);
        return null;
      };
      // Soil and prices are optional: plans still work from climate alone.
      const [climateRaw, soil, mandi] = await Promise.all([
        climateSource(lat, lon),
        soilSource(lat, lon).catch(quiet('soil')),
        placeSource(lat, lon)
          .then((place) => (place?.state ? mandiSource(place.state, place.district) : null))
          .catch((err) => (err instanceof MandiNotConfigured ? null : quiet('mandi')(err))),
      ]);
      const climate = analyzeClimate(climateRaw);
      const seasons = applyScenario(climate.seasons, { rainPct, tempC });
      const result = planRotations({
        seasons, irrigation, lastCrop, priority, soil, slopePct: slope,
        constraints: { lowLabour: Boolean(constraints.lowLabour), needFodder: Boolean(constraints.needFodder), avoid },
        prices: mandi?.crops ?? null,
        rainPct,
      });
      res.json({ climate, soil, scenario: { rainPct, tempC, seasons: rainPct || tempC ? seasons : null }, pricesUsed: Boolean(mandi?.crops), ...result });
    } catch (err) {
      sendError(res, err);
    }
  });

  app.post('/api/ask', async (req, res) => {
    if (!assistantReady()) {
      return res.status(503).json({ error: 'The AI assistant is not configured yet (set ANTHROPIC_API_KEY on the server).' });
    }
    try {
      res.json(await ask(req.body ?? {}));
    } catch (err) {
      if (err instanceof Anthropic.AuthenticationError) {
        return res.status(503).json({ error: 'The AI assistant is not configured (missing ANTHROPIC_API_KEY).' });
      }
      if (err instanceof Anthropic.RateLimitError) {
        return res.status(429).json({ error: 'The assistant is busy. Please try again in a minute.' });
      }
      if (err instanceof Anthropic.APIError) {
        console.error('Claude API error', err.status, err.message);
        return res.status(502).json({ error: 'The assistant could not answer right now.' });
      }
      sendError(res, err);
    }
  });

  return app;
}

function sendError(res, err) {
  if (err instanceof RangeError) return res.status(400).json({ error: err.message });
  console.error(err);
  res.status(502).json({ error: err.message || 'Something went wrong' });
}

// Vercel runs the default export as the app (static files in public/ are served by its CDN).
const app = createApp();
export default app;

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT) || 3000;
  app.listen(port, () => console.log(`Kisan AI running at http://localhost:${port}`));
}
