import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Anthropic from '@anthropic-ai/sdk';
import { getClimatology } from './src/nasaPower.js';
import { analyzeClimate } from './src/seasons.js';
import { planRotations, IRRIGATION_MM, PRIORITIES } from './src/planner.js';
import { CROP_IDS } from './src/crops.js';
import { askAssistant, LANGUAGES } from './src/assistant.js';

const here = path.dirname(fileURLToPath(import.meta.url));

const hasClaudeKey = () => Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);

export function createApp({ climateSource = getClimatology, ask = askAssistant, assistantReady = hasClaudeKey } = {}) {
  const app = express();
  app.use(express.json({ limit: '64kb' }));
  app.use(express.static(path.join(here, 'public')));

  app.get('/api/health', (_req, res) => res.json({ ok: true }));

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

  app.post('/api/plan', async (req, res) => {
    try {
      const { lat, lon, irrigation = 'rainfed', lastCrop = null, priority = 'balanced' } = req.body ?? {};
      if (!(irrigation in IRRIGATION_MM)) throw new RangeError('Unknown irrigation level');
      if (!PRIORITIES.includes(priority)) throw new RangeError('Unknown priority');
      if (lastCrop && !CROP_IDS.includes(lastCrop)) throw new RangeError('Unknown last crop');
      const climate = analyzeClimate(await climateSource(lat, lon));
      const result = planRotations({ seasons: climate.seasons, irrigation, lastCrop, priority });
      res.json({ climate, ...result });
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
