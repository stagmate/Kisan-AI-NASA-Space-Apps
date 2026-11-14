# Kisan AI — NASA Space Apps Challenge 2026

A phone-first planning tool for small farmers in India, built on **NASA POWER** climate data.

| Tab | What it does |
|---|---|
| **Climate** | **Watering this week** from the 7-day forecast and modelled root-zone soil moisture; **crop health from satellite** (MODIS NDVI); **season timeline & stress check** (bare / green-up / peak / decline from NDVI, declines explained by soil-moisture anomaly, heat or low rain, greenness vs past years, confidence level, month-by-month harmonised data table); **your soil** (SoilGrids); long-term climate by Kharif/Rabi/Zaid with warnings. |
| **Map** | Tap to choose the field. NASA GIBS layers with a date slider and transparency: MODIS NDVI, SMAP L4 root-zone soil moisture, GPM IMERG rain, MODIS land-surface temperature, HLS 30 m imagery, GRACE water storage (2003–2022), GEDI biomass. **Field zones** on a 7×7 grid of 250 m pixels: erosion risk (slope × bare ground), water-stress hotspots, frost-prone low spots. |
| **Crop plan** | Three Kharif → Rabi → Zaid rotations compared on **eight criteria** — nutrients, erosion protection, organic matter, pest-cycle break, water, fodder, income (today's mandi price × typical yield) and drought safety. Farmer inputs: water, last crop, priority, little labour/no machines, fodder needs, crops to avoid, and **what-if rainfall/temperature sliders**. Explains how nitrogen-fixing, cover, deep-rooted and drought-tolerant crops help; mandi prices card. |
| **Ask** | AI farm assistant (Claude) in 9 languages, grounded in the field's climate, soil, forecast, satellite timeline and prices; told to state uncertainty and defer to local experts. Voice in/out. |
| **Learn** | Plain-language explanations of evapotranspiration, soil-moisture anomaly, NDVI, frost risk, water balance, satellite vs ground measurements, crop roles, and where the farmer's judgment matters most. |

**[Project proposal (PDF)](docs/Kisan-AI-Proposal.pdf)** · **[Full technical documentation](docs/DOCUMENTATION.md)** — every dataset, algorithm, threshold, API endpoint and test.

**[Methods page](public/methods.html)** (in the app at `/methods.html`): data sources and resolutions, how datasets are
harmonised onto common grids, comparison of rule-based, anomaly, phenology-fitting, machine-learning and LLM approaches,
rotation scoring, uncertainty, where local experts must validate, and next steps.

The interface is available in **English, हिन्दी (Hindi), தமிழ் (Tamil), ಕನ್ನಡ (Kannada), മലയാളം (Malayalam) and తెలుగు (Telugu)**,
including crop names, month names and every warning. Voice input and read-aloud use each language's Indian locale.

> **Translations need a native-speaker check.** Tamil, Kannada, Malayalam and Telugu were written with AI help.
> Each is one file in `public/lang/<code>.js` — keep the `{placeholders}` unchanged (`npm test` checks every key,
> placeholder, crop and month). To add a language, copy one of these files, translate it, and register it in
> `public/i18n.js` and `src/assistant.js`.

## Data sources

None of these need an API key.

| Source | Used for | Module |
|---|---|---|
| [NASA POWER](https://power.larc.nasa.gov/) climatology (`AG`) | Monthly temperature, daily range, record extremes, bias-corrected rain, humidity, sunlight → seasons, warnings, crop fit | `src/nasaPower.js`, `src/seasons.js` |
| NASA MODIS **MOD13Q1 / MYD13Q1 v061** NDVI + pixel reliability, read pixel-by-pixel from cloud-optimised GeoTIFFs on [Microsoft Planetary Computer](https://planetarycomputer.microsoft.com/dataset/modis-13Q1-061) | Crop greenness over 8 months, status and 1-month trend | `src/ndvi.js` |
| [ISRIC SoilGrids 2.0](https://www.isric.org/explore/soilgrids) (250 m) | Sand/silt/clay → texture class and water-holding range; pH; organic carbon (0–30 cm) | `src/soil.js` |
| [Open-Meteo](https://open-meteo.com/) forecast | 7-day rain, rain chance, FAO reference evapotranspiration, temperatures, and modelled soil moisture 0–27 cm | `src/forecast.js` |

**Optional, needs a free key:**

| Source | Used for | Module |
|---|---|---|
| [data.gov.in](https://www.data.gov.in/resource/current-daily-price-various-commodities-various-markets-mandi) daily mandi prices (Agmarknet), with the field's state and district from [OpenStreetMap Nominatim](https://nominatim.org/) | Median modal price (₹/quintal) per crop across the state's mandis, range, and the farmer's district; shown on the Crop plan tab and given to the assistant | `src/mandi.js`, `src/geo.js` |

Set it up: sign in at data.gov.in → **My Account → Generate API Key**, then add `DATA_GOV_IN_API_KEY` in
Vercel (Project → Settings → Environment Variables, Production) and redeploy. data.gov.in only answers servers in
India, so the project's function region is Mumbai (`bom1`). `/api/health` shows the region and whether the key is
set (true/false, never the value). Without a key the prices card simply stays hidden.

How they combine:
- **Watering advice**: root-zone soil moisture is turned into "% of plant-available water" using the SoilGrids texture's field capacity and wilting point; ≥ 15 mm of rain in 3 days → hold; < 35% → water now; < 60% and a dry week → water in 2 days. The amount refills the top 30 cm.
- **Crop plan**: SoilGrids pH penalises crops outside their pH range; heavier soils carry more monsoon water into Rabi.
- **Assistant**: gets the climate, soil, current soil moisture, watering advice and NDVI for the field.
- Each source fails independently: the page says which one is unavailable and shows the rest.

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
