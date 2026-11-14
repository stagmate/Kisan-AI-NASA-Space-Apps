# Kisan AI — NASA Space Apps Challenge 2026

A phone-first planning tool for small farmers in India, built on **NASA POWER** climate data.

| Tab | What it does |
|---|---|
| **Climate** | Long-term monthly rain and temperature for any location (GPS, a preset city, or lat/lon), split into the Indian cropping seasons — Kharif (Jun–Oct), Rabi (Nov–Mar), Zaid (Apr–May) — with plain-language warnings: monsoon dependence, heat, frost, dry Rabi. |
| **Crop plan** | Suggests 3 one-year rotations (Kharif → Rabi → Zaid) that fit the local climate, the farmer's irrigation, last crop and priority (balanced / income / soil health / save water), with a score breakdown and reasons. |
| **Ask** | An AI farm assistant (Claude) that answers in 9 languages (English, Hindi, Tamil, Kannada, Malayalam, Telugu, Marathi, Bengali, Punjabi), grounded in that field's NASA climate data and crop plan. Voice input and read-aloud where the browser supports it. |

The interface is available in **English, हिन्दी (Hindi), தமிழ் (Tamil), ಕನ್ನಡ (Kannada), മലയാളം (Malayalam) and తెలుగు (Telugu)**,
including crop names, month names and every warning. Voice input and read-aloud use each language's Indian locale.

> **Translations need a native-speaker check.** Tamil, Kannada, Malayalam and Telugu were written with AI help.
> Each is one file in `public/lang/<code>.js` — keep the `{placeholders}` unchanged (`npm test` checks every key,
> placeholder, crop and month). To add a language, copy one of these files, translate it, and register it in
> `public/i18n.js` and `src/assistant.js`.

## NASA data

[NASA POWER](https://power.larc.nasa.gov/) Climatology API, `AG` community, per location:

- `T2M`, `T2M_RANGE` — mean temperature and mean daily range → typical afternoon high and night low
- `T2M_MAX`, `T2M_MIN` — record extremes (context only)
- `PRECTOTCORR` — bias-corrected precipitation (mm/day → mm/month)
- `RH2M`, `ALLSKY_SFC_SW_DWN` — humidity and solar radiation

## How the rotation planner works

1. **Crop fit** (`src/planner.js#scoreCrop`): each of 19 crops (`src/crops.js`) is scored 0–100 for a season:
   temperature fit (40), water fit (40: 70% of seasonal rain + monsoon soil-moisture carry-over for Rabi + irrigation),
   and relative value (20), minus penalties for heat above the crop's limit and frost for frost-sensitive crops.
2. **Sequence score** (`scoreSequence`): soil health (legumes, legume before a heavy feeder, family diversity;
   penalties for same family back-to-back or two heavy feeders in a row, including into next year's Kharif),
   water saving (total irrigation), and income. Weights shift with the farmer's priority.
3. The best **3 plans that differ in at least 2 seasons** are shown. Last season's crop is never repeated, and
   a fallow season is allowed when nothing fits.

Crop ranges are rounded planning values from FAO/ICAR guidance, not exact prescriptions.

## Run it

```bash
npm install
export ANTHROPIC_API_KEY=...   # needed only for the Ask tab
npm start                      # http://localhost:3000
npm test                       # offline tests (NASA response fixture, mocked Claude)
```

## API

- `GET /api/climate?lat=&lon=` — monthly data, season summaries and insights
- `POST /api/plan` `{ lat, lon, irrigation: rainfed|limited|full, lastCrop?, priority? }` — rotation plans
- `POST /api/ask` `{ question, language, history?, context? }` — assistant answer
- `GET /api/meta` — crops, languages and options

## Team background

Our team previously built a separate farmer-assistant project (Kisanaiar). This repository is a **new
codebase written during the Space Apps 2026 hackathon weekend**. It reuses the idea of helping small farmers
with NASA data, but none of the earlier code.

## License

MIT
