# Kisan AI — Technical Documentation

**NASA Space Apps Challenge 2026** · Live app: <https://kisan-ai-space-apps.vercel.app> · Methods page: [`/methods.html`](https://kisan-ai-space-apps.vercel.app/methods.html)

Kisan AI is a phone-first planning tool for small farmers in India. It turns NASA Earth observations and a few
supporting datasets into three plain decisions:

1. **Do I need to water this week, and how much?**
2. **Is my crop healthy, or is something wrong with my field?**
3. **Which crop rotation fits my land, my water, my constraints and my goals?**

Every number shown to the farmer is computed by explainable rules from named datasets; an AI assistant (Claude) explains
those results in nine languages but does not invent the numbers. This document lists every dataset, every algorithm
and every threshold so that an extension worker, a judge or another developer can check and reproduce the results.

---

## Contents

1. [What the app does (by tab)](#1-what-the-app-does-by-tab)
2. [System architecture](#2-system-architecture)
3. [Datasets](#3-datasets)
4. [Algorithms](#4-algorithms)
   - 4.1 [Climate summary and seasons](#41-climate-summary-and-seasons)
   - 4.2 [Soil properties and texture](#42-soil-properties-and-texture)
   - 4.3 [Watering advice (water balance)](#43-watering-advice-water-balance)
   - 4.4 [Satellite greenness (NDVI) extraction](#44-satellite-greenness-ndvi-extraction)
   - 4.5 [Data harmonisation onto a monthly grid](#45-data-harmonisation-onto-a-monthly-grid)
   - 4.6 [Season phase detection](#46-season-phase-detection)
   - 4.7 [Stress vs harvest attribution](#47-stress-vs-harvest-attribution)
   - 4.8 [Anomalies vs past years](#48-anomalies-vs-past-years)
   - 4.9 [Confidence scoring](#49-confidence-scoring)
   - 4.10 [Field vulnerability zones](#410-field-vulnerability-zones)
   - 4.11 [Crop suitability scoring](#411-crop-suitability-scoring)
   - 4.12 [Rotation planning and the eight criteria](#412-rotation-planning-and-the-eight-criteria)
   - 4.13 [What-if climate scenarios](#413-what-if-climate-scenarios)
   - 4.14 [Mandi price aggregation](#414-mandi-price-aggregation)
   - 4.15 [AI assistant](#415-ai-assistant)
5. [Crop reference table](#5-crop-reference-table)
6. [API reference](#6-api-reference)
7. [Front end, languages and accessibility](#7-front-end-languages-and-accessibility)
8. [Reliability, caching and failure handling](#8-reliability-caching-and-failure-handling)
9. [Testing](#9-testing)
10. [Deployment and configuration](#10-deployment-and-configuration)
11. [Approaches considered](#11-approaches-considered)
12. [Uncertainty, limitations and where local expertise is needed](#12-uncertainty-limitations-and-where-local-expertise-is-needed)
13. [Roadmap](#13-roadmap)
14. [Credits and attributions](#14-credits-and-attributions)

---

## 1. What the app does (by tab)

| Tab | Features |
|---|---|
| **Climate** | Field location (GPS, preset farmland points, or latitude/longitude). **Watering this week**: water now / in 2 days / hold for rain / no need, with an amount in mm, a 7-day rain, crop-water-use and temperature table. **Crop health from satellite**: latest NDVI, status, 1-month trend and an 8-month line. **Season timeline & stress check**: bare / growing / full green / decline strip, explained findings, greenness and soil wetness vs normal, a confidence level with reasons, and a month-by-month harmonised data table. **Your soil**: texture, sand/silt/clay, pH, organic carbon and advice. **Long-term climate**: monthly rain and temperature chart, Kharif/Rabi/Zaid summaries and plain-language warnings. |
| **Map** | Tap to choose the field. NASA GIBS overlays with a date slider and transparency: MODIS NDVI, SMAP L4 root-zone soil moisture, GPM IMERG rainfall, MODIS land-surface temperature, HLS 30 m imagery, GRACE water storage (2003–2022), GEDI above-ground biomass. Street map or satellite-photo background. **Field zones** on a 7×7 grid of 250 m cells: greenness, erosion risk, water-stress hotspots, frost-prone low spots, with a summary and field slope. |
| **Crop plan** | Inputs: irrigation water available, last crop, priority (balanced / income / soil health / save water), little labour or no machines, fodder needed, crops to avoid, and what-if rainfall (−40 % … +40 %) and temperature (−1 … +4 °C) sliders. Output: three Kharif → Rabi → Zaid rotations with scores, warnings, extra irrigation needed, rough gross income at today's mandi prices, "why these crops help" notes, a side-by-side comparison on eight criteria, and today's mandi prices for the field's state and district. |
| **Ask** | Chat with an AI farm assistant in 9 languages, grounded in the field's computed data; voice input and read-aloud. |
| **Learn** | Plain-language explanations of evapotranspiration, soil-moisture anomaly, NDVI, frost risk, water balance, satellite vs ground measurements, how crop types build soil, and where the farmer's judgment matters most. |

The interface is available in English, Hindi, Tamil, Kannada, Malayalam and Telugu; the assistant additionally answers in
Marathi, Bengali and Punjabi.

---

## 2. System architecture

```
 Phone browser (HTML/CSS/vanilla JS, no build step)
   public/index.html, app.js, map.js, i18n.js, lang/*.js, format.js, methods.html
        │  JSON over HTTPS
        ▼
 Node.js 20+ / Express 5 server  ─ server.js  (Vercel serverless function, Mumbai region bom1)
   /api/climate  /api/field  /api/timeline  /api/zones  /api/plan  /api/mandi  /api/ask  /api/meta  /api/health
        │
        ├─ src/nasaPower.js  ── NASA POWER climatology + daily API
        ├─ src/seasons.js    ── seasons and climate insights
        ├─ src/soil.js       ── ISRIC SoilGrids 2.0
        ├─ src/forecast.js   ── Open-Meteo forecast + soil moisture → watering advice
        ├─ src/ndvi.js       ── MODIS NDVI from Planetary Computer COGs (+ past-year normal)
        ├─ src/timeline.js   ── harmonisation, phases, stress attribution, anomalies, confidence
        ├─ src/zones.js      ── 7×7 MODIS grid + Copernicus DEM → erosion / stress / frost zones
        ├─ src/crops.js      ── crop reference table
        ├─ src/planner.js    ── crop scoring, rotation criteria, scenarios
        ├─ src/geo.js        ── OpenStreetMap Nominatim → state / district
        ├─ src/mandi.js      ── data.gov.in Agmarknet mandi prices
        ├─ src/assistant.js  ── Claude API (Anthropic SDK)
        └─ src/http.js       ── fetch with timeout, error normalisation, in-memory cache
 Map tiles are fetched by the browser directly from NASA GIBS, OpenStreetMap and Esri.
```

Design choices:

- **No database and no user accounts.** Everything is computed on request from public data for the chosen coordinates;
  the browser remembers the last location, language and tab in `localStorage`.
- **Each data source is independent.** If one fails (rate limit, outage), the page says which one and shows the rest.
- **Small dependency footprint:** `express`, `@anthropic-ai/sdk`, `geotiff` (to read single pixels from cloud-optimised GeoTIFFs). Leaflet is loaded from a CDN only when the Map tab opens.

---

## 3. Datasets

### 3.1 Summary

| # | Dataset | Provider | Variables used | Spatial resolution | Temporal resolution / latency | Access | Used in |
|---|---|---|---|---|---|---|---|
| 1 | **NASA POWER Climatology** (Agroclimatology community) | NASA LaRC | `T2M`, `T2M_RANGE`, `T2M_MAX`, `T2M_MIN`, `PRECTOTCORR`, `RH2M`, `ALLSKY_SFC_SW_DWN`, `GWETROOT`, `EVPTRNS` | 0.5° × 0.625° (~50 km, MERRA-2) | 30-year monthly normals | REST, no key | Seasons, warnings, crop suitability, normals for anomalies |
| 2 | **NASA POWER Daily** | NASA LaRC | `PRECTOTCORR`, `T2M_MAX`, `T2M_MIN`, `GWETROOT`, `EVPTRNS` | ~50 km | Daily, ~3-day lag | REST, no key | Season timeline, water balance, soil-moisture anomaly |
| 3 | **MODIS MOD13Q1 v061** (Terra) and **MYD13Q1 v061** (Aqua) vegetation indices | NASA LP DAAC, mirrored as cloud-optimised GeoTIFFs on Microsoft Planetary Computer | `250m_16_days_NDVI`, `250m_16_days_pixel_reliability` | 250 m (231.66 m sinusoidal pixels) | 16-day composites each, offset 8 days → one reading every 8 days | STAC search + SAS token, no key | NDVI card, timeline, past-year normal, zone grid |
| 4 | **ISRIC SoilGrids 2.0** | ISRIC – World Soil Information | `clay`, `sand`, `silt`, `phh2o`, `soc` at 0–5, 5–15, 15–30 cm (mean) | 250 m | Static | REST, no key | Soil card, texture water-holding, pH fit in crop scoring, monsoon carry-over |
| 5 | **Open-Meteo Forecast API** | Open-Meteo (blend of national weather models) | Daily `precipitation_sum`, `precipitation_probability_max`, `et0_fao_evapotranspiration`, `temperature_2m_max/min`; hourly `soil_moisture_0_to_1cm` … `27_to_81cm` | ~1–11 km depending on model | Hourly/daily, 7-day forecast | REST, no key | Watering advice, weekly table |
| 6 | **Copernicus DEM GLO-90** via Open-Meteo Elevation API | ESA / Copernicus | Ground elevation | 90 m | Static | REST, no key | Slope, erosion risk, frost pockets, slope input to rotation erosion score |
| 7 | **Current Daily Price of Various Commodities from Various Markets (Mandi)** | Government of India, data.gov.in (Agmarknet) | `state`, `district`, `market`, `commodity`, `arrival_date`, `min_price`, `max_price`, `modal_price` (₹/quintal) | Market | Daily, ~1 day lag | REST, free API key; answers only from Indian IPs | Mandi card, prices on plan steps, income criterion, assistant context |
| 8 | **OpenStreetMap Nominatim** reverse geocoding | OpenStreetMap Foundation | `state`, `state_district`/`county` | Administrative areas | Static | REST, no key (identified User-Agent, cached) | Field's state and district for mandi prices |
| 9 | **NASA GIBS** map layers (WMTS, EPSG:3857) | NASA ESDIS | See 3.9 | 30 m – 300 km | Daily – static | Tiles in the browser, no key | Map tab overlays |
| 10 | **OpenStreetMap** tiles and **Esri World Imagery** | OSM contributors; Esri | Base maps | — | — | Tiles in the browser | Map background |

### 3.2 NASA POWER Climatology

- **Endpoint:** `https://power.larc.nasa.gov/api/temporal/climatology/point?parameters=…&community=AG&latitude=…&longitude=…&format=JSON`
- **Underlying products:** MERRA-2 reanalysis for meteorology and soil wetness; precipitation is bias-corrected (`PRECTOTCORR`).
- **Processing:**
  - `PRECTOTCORR` (mm/day) × days in month → mm/month.
  - Typical afternoon high = `T2M + T2M_RANGE/2`; typical night low = `T2M − T2M_RANGE/2`. These drive crop scoring.
    `T2M_MAX`/`T2M_MIN` are *record* extremes over the period and are shown only as context (frost "has happened").
  - `GWETROOT` (0 = dry, 1 = saturated root zone) and `EVPTRNS` (mm/day actual evapotranspiration) provide monthly normals.
  - Values of −999 (missing) are rejected; incomplete responses raise an error.
- **Coordinates** are rounded to 0.01° for caching.

### 3.3 NASA POWER Daily

- **Endpoint:** `https://power.larc.nasa.gov/api/temporal/daily/point?parameters=PRECTOTCORR,T2M_MAX,T2M_MIN,GWETROOT,EVPTRNS&community=AG&start=YYYYMMDD&end=YYYYMMDD…`
- **Window:** the last 245 days. Days not yet published (−999, typically the last ~3 days) are dropped.
- **Why POWER for both daily and normals:** the current value and its "normal" come from the same model (MERRA-2), so the
  difference (the anomaly) is not distorted by mixing sources.

### 3.4 MODIS NDVI (MOD13Q1 / MYD13Q1 v061)

- **Catalogue:** STAC API `https://planetarycomputer.microsoft.com/api/stac/v1/search`, collection `modis-13Q1-061`
  (contains both Terra `MOD13Q1` and Aqua `MYD13Q1` items).
- **Access:** a short-lived SAS token for the storage container from
  `https://planetarycomputer.microsoft.com/api/sas/v1/token/{account}/{container}` is appended to each asset URL;
  only the bytes for one pixel (or a 7×7 window) are read with HTTP range requests through `geotiff`.
- **Bands:** `250m_16_days_NDVI` (int16, scale 0.0001, fill ≤ −2000) and `250m_16_days_pixel_reliability`
  (0 good, 1 marginal, 2 snow/ice, 3 cloudy, −1 no data). Only reliability 0 and 1 are kept.
- **Why Planetary Computer:** the ORNL DAAC MODIS web service did not respond from the serverless host during testing
  (time-outs and HTTP 503), while the same NASA product as COGs reads in ~8 s.
- **Known gap:** some late-2025 items are missing in the mirror; past-year comparisons fall back to 2 or 3 years back.

### 3.5 ISRIC SoilGrids 2.0

- **Endpoint:** `https://rest.isric.org/soilgrids/v2.0/properties/query?lat=…&lon=…&property=clay&property=sand&property=silt&property=phh2o&property=soc&depth=0-5cm&depth=5-15cm&depth=15-30cm&value=mean`
- **Units:** values are divided by each layer's `d_factor` (clay/sand/silt g/kg → %, pH×10 → pH, SOC dg/kg → g/kg).
- **Built-up areas and water are masked** in SoilGrids. See [4.2](#42-soil-properties-and-texture) for the fallback search.
- Rate limit is about 5 requests per minute per IP, so results are cached for 7 days.

### 3.6 Open-Meteo forecast

- **Endpoint:** `https://api.open-meteo.com/v1/forecast?…&forecast_days=7&timezone=auto`
- **ET₀** is the FAO-56 Penman–Monteith reference evapotranspiration (mm/day).
- **Soil moisture** is modelled volumetric water content (m³/m³) at five depths; the app uses a thickness-weighted
  0–27 cm root-zone value at the current local hour.
- The free tier has a daily request limit per IP; the error is surfaced as "Open-Meteo data is unavailable right now".

### 3.7 Copernicus DEM (via Open-Meteo Elevation)

- **Endpoint:** `https://api.open-meteo.com/v1/elevation?latitude=a,b,…&longitude=x,y,…` — the 49 cell centres of the zone grid in one request.

### 3.8 data.gov.in mandi prices and Nominatim

- **Resource:** `https://api.data.gov.in/resource/9ef84268-d588-465a-a308-a864a43d0070` with `api-key`, `format=json`,
  `limit=1000`, `offset`, and a state filter (`filters[state.keyword]`, falling back to the older `filters[state]`).
  Up to 5 pages are read per state.
- **Network:** data.gov.in rejects requests from outside India, so the Vercel functions run in Mumbai (`bom1`).
- **Nominatim:** `https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=10&accept-language=en` with an identifying
  User-Agent; results cached for 7 days (the usage policy asks for at most 1 request/s and caching).

### 3.9 NASA GIBS map layers

Tile URL pattern: `https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/{Layer}/default/{YYYY-MM-DD}/{TileMatrixSet}/{z}/{y}/{x}.png`

| Map option | GIBS layer | Native tile level | Dates offered by the slider |
|---|---|---|---|
| Crop greenness | `MODIS_Terra_NDVI_8Day` | Level 9 (~250 m) | Last 365 days (newest − 2 days) |
| Root-zone soil moisture | `SMAP_L4_Analyzed_Root_Zone_Soil_Moisture` | Level 6 (~9 km product) | Last 365 days (newest − 5 days) |
| Rainfall | `IMERG_Precipitation_Rate` (GPM IMERG daily) | Level 6 (~10 km) | Last 365 days (newest − 2 days) |
| Land surface temperature (day) | `MODIS_Terra_Land_Surface_Temp_Day` | Level 7 (~1 km) | Last 365 days |
| Field-scale photo | `HLS_S30_Nadir_BRDF_Adjusted_Reflectance` (Harmonized Landsat Sentinel-2) | Level 12 (30 m) | Last 365 days (blank on days without a clear overpass) |
| Groundwater & water storage change | `GRACE_Tellus_Liquid_Water_Equivalent_Thickness_Mascon_CRI` | Level 6 (~300 km) | One date per year near October, 2003–2022 (from GIBS capabilities) |
| Above-ground biomass | `GEDI_ISS_L4B_Aboveground_Biomass_Density_Mean_201904-202303` | Level 7 (1 km) | Static (2019–2023) |

These layers are **visual**: they are not yet read as numbers by the server (see [Roadmap](#13-roadmap)).

---

## 4. Algorithms

All thresholds below are the values in the code at the time of writing. Module and function names are given so each
step can be found and tested.

### 4.1 Climate summary and seasons

`src/seasons.js` — `summarizeSeason`, `buildInsights`, `analyzeClimate`

**Seasons** follow the Indian cropping calendar:

| Season | Months |
|---|---|
| Kharif | Jun, Jul, Aug, Sep, Oct |
| Rabi | Nov, Dec, Jan, Feb, Mar |
| Zaid | Apr, May |

For each season: mean of monthly `T2M`; **hot afternoons** = max of monthly typical highs; **cold nights** = min of monthly
typical lows; record max/min; rain = sum of monthly rain.

**Insights** (codes translated in the UI):

| Code | Rule | Level |
|---|---|---|
| `annual_rain` | Σ monthly rain | warn if < 500 mm |
| `wettest_month` | month with max rain | info |
| `hottest_month` | month with max mean T | warn if ≥ 33 °C |
| `monsoon_dependent` | Kharif rain / annual ≥ 70 % | warn |
| `frost_risk` | any month with typical night low ≤ 4 °C | warn |
| `occasional_frost` | else, any month with record min ≤ 0 °C | info |
| `heat_risk` | months with typical afternoon high ≥ 40 °C | warn |
| `rabi_needs_irrigation` / `rabi_some_rain` | Rabi rain < 100 mm / otherwise | warn / good |

### 4.2 Soil properties and texture

`src/soil.js` — `parseSoil`, `textureClass`, `soilNotes`, `getSoil`

1. **Depth-weighted 0–30 cm mean** of each property, weights 5 (0–5 cm), 10 (5–15 cm), 15 (15–30 cm) — proportional to layer thickness.
2. **USDA texture class** from sand/silt/clay with the standard texture-triangle rules (sand, loamy sand, sandy loam, loam,
   silt loam, sandy clay loam, clay loam, silty clay loam, sandy clay, silty clay, clay).
3. **Water-holding range** per texture: field capacity (FC) and wilting point (WP) in m³/m³:

| Texture | FC | WP | | Texture | FC | WP |
|---|---|---|---|---|---|---|
| sand | 0.12 | 0.05 | | sandy clay loam | 0.29 | 0.17 |
| loamy sand | 0.15 | 0.07 | | clay loam | 0.34 | 0.20 |
| sandy loam | 0.22 | 0.10 | | silty clay loam | 0.36 | 0.21 |
| loam | 0.28 | 0.13 | | sandy clay | 0.33 | 0.22 |
| silt loam | 0.31 | 0.13 | | silty clay | 0.39 | 0.25 |
| | | | | clay | 0.40 | 0.26 |

4. **Notes:** pH < 5.5 acidic, > 8.0 alkaline, else "suits most crops"; organic carbon < 7 g/kg low; sand ≥ 65 % sandy; clay ≥ 40 % heavy.
5. **Masked points (towns, water):** if the exact point returns no data, the app tries points offset by (+0.03°, +0.03°),
   (+0.10°, −0.10°), (−0.15°, −0.15°), (+0.20°, +0.20°) — about 4, 15, 23 and 30 km — and reports the distance used. If
   none has data, the UI explains that the point is in a town or on water instead of reporting an outage.

### 4.3 Watering advice (water balance)

`src/forecast.js` — `parseForecast`, `wateringAdvice`

1. **Root-zone soil moisture now** θ = thickness-weighted mean of the 0–1, 1–3, 3–9, 9–27 cm layers (weights 1, 2, 6, 18)
   at the current local hour.
2. **Plant-available water fraction** using the SoilGrids texture (loam if unknown):

   `AW = clamp((θ − WP) / (FC − WP), 0, 1)`

3. **Weekly balance:** `rain3` = rain in next 3 days, `rain7` = next 7 days, `ET7` = Σ ET₀ over 7 days.
4. **Decision:**

| Order | Condition | Advice |
|---|---|---|
| 1 | `rain3 ≥ 15 mm` | Hold — rain coming |
| 2 | `AW < 0.35` | Water now |
| 3 | `AW < 0.60` and `rain7 < 0.5 × ET7` | Water in 2 days |
| 4 | otherwise (soil reading present) | No need now |
| 5 | no soil reading: `rain7 < 0.4 × ET7` | Water in 2 days, else no need |

5. **Amount** to refill the top ~30 cm: `(1 − AW) × (FC − WP) × 300 mm`, clamped to 15–50 mm and rounded to 5 mm
   (25 mm if no soil reading).

Logged irrigation is not included (stated on the card).

### 4.4 Satellite greenness (NDVI) extraction

`src/ndvi.js` — `toSinusoidal`, `tilePixel`, `buildSeries`, `summarizeNdvi`, `getNdvi`, `getNdviNormal`

1. **Projection.** MODIS uses a sinusoidal grid on a sphere R = 6 371 007.181 m:
   `x = R·λ·cos φ`, `y = R·φ` (radians). Tile `h = ⌊(x − X₀)/T⌋`, `v = ⌊(Y₀ − y)/T⌋` with X₀ = −20 015 109.354 m,
   Y₀ = 10 007 554.677 m, tile size T = 1 111 950.5197 m; pixel = fractional part × 4800.
2. **Search** STAC for items intersecting the point over the last 8 months; keep items on the correct tile, one per
   product/period (Terra and Aqua → every 8 days).
3. **Read** the NDVI and reliability pixel for each item (6 in parallel).
4. **Clean:** drop fill values (≤ −2000) and reliability ∉ {0, 1}; NDVI = raw / 10 000.
5. **Summarise:** status from the latest value — `< 0.2` bare, `< 0.4` sparse/young, `< 0.6` moderate, else dense;
   trend vs the latest reading at least 25 days earlier — `> +0.05` greening, `< −0.05` browning, else steady.

### 4.5 Data harmonisation onto a monthly grid

`src/timeline.js` — `harmonizeMonthly`

Sources with different resolutions are brought onto one **calendar-month grid for the field**:

| Variable | From | Rule |
|---|---|---|
| Rain (mm) | POWER daily | Σ per month |
| Rain normal (mm) | POWER climatology | monthly normal / days in month × days with data (fair for part months) |
| Rain anomaly (%) | — | `(rain − normal) / normal × 100` (only if normal ≥ 10 mm) |
| Mean Tmax, heat days, frost nights | POWER daily | mean; count of Tmax ≥ 38 °C; count of Tmin ≤ 2 °C |
| Soil wetness, its normal and anomaly | POWER daily `GWETROOT`, climatology | mean; normal; mean − normal |
| ET (mm) | POWER daily `EVPTRNS` | Σ per month |
| Water balance (mm) | — | rain − ET |
| NDVI and image count | MODIS (8-day) | mean of clear readings in the month; count kept |

Months with less than 90 % of days are flagged as part months. Spatially, the field is a point on POWER's ~50 km grid and on
MODIS's 250 m grid; the coarser value is used as-is for the field (nearest-parent assignment), and the confidence notes say so.

### 4.6 Season phase detection

`src/timeline.js` — `smoothNdvi`, `detectPhases`

1. **Smoothing:** 3-point median (removes single cloud/shadow outliers) followed by 3-point mean.
2. **Label each reading** using the smoothed value v and change from the previous reading Δ:
   - `v < 0.25` → **bare**
   - `Δ ≥ +0.03` → **green-up**
   - `Δ ≤ −0.03` → **decline**
   - `v ≥ 0.45` → **peak** (full green)
   - otherwise → **steady**
3. **Merge** consecutive equal labels into segments (start value = smoothed value before the segment).
4. **Absorb noise:** green-up/decline segments with total change < 0.08 (MIN_CHANGE), and single-image non-bare segments,
   are merged into the previous segment. 0.08 is roughly the noise level of an 8-day, 250 m composite.

### 4.7 Stress vs harvest attribution

`src/timeline.js` — `explainDeclines`

For each decline segment with a drop ≥ 0.08, look at the harmonised months it spans:

- **Stress signals:** soil-wetness anomaly ≤ −0.05 (`dry_soil`), ≥ 5 heat days (`heat`), rain anomaly ≤ −40 % (`low_rain`).
- **Harvest shape:** start ≥ 0.40 and end ≤ 0.35.

| Signals | Harvest shape | Finding |
|---|---|---|
| yes | yes | `stress_or_harvest` — "may be harvest, or stress if the crop was still growing" |
| yes | no | `stress_possible` — causes listed, "check the field" |
| no | yes | `harvest_likely` |
| no | no | `decline_unexplained` — "may be harvest, pests or disease" |

Also reported: `greenup` (rise ≥ 0.08) and `bare_period` (≥ 2 bare images).

### 4.8 Anomalies vs past years

`src/ndvi.js` — `getNdviNormal`; `src/timeline.js` — `analyzeTimeline`

- **NDVI normal:** clear readings within ±12 days of the latest image's date in each of the previous 3 years; mean of all.
  `diff = latest − normal`: ≤ −0.10 **below normal** (adds a `below_normal_now` finding), ≥ +0.10 **above**, else **near normal**.
- **Soil wetness now:** latest month's `GWETROOT` mean − POWER normal for that month: ≤ −0.05 drier, ≥ +0.05 wetter, else normal.

### 4.9 Confidence scoring

`src/timeline.js` — `confidence`

Start at 3 points and subtract:

| Condition (reason code) | Points |
|---|---|
| no clear image in the last 48 days (`no_recent_images`) | −2 |
| only 1–2 clear images in the last 48 days (`few_recent_images`) | −1 |
| any gap > 40 days between clear images (`cloud_gap`) | −1 |
| no past-year images (`no_past_years`) | −1 |
| no soil-wetness normal (`no_soil_normal`) | −1 |

Level: ≥ 3 **high**, 2 **medium**, ≤ 1 **low**. The reason `coarse_pixels` (250 m and ~50 km data may mix neighbouring
fields) is always listed.

### 4.10 Field vulnerability zones

`src/zones.js` — `pixelPolygon`, `slopes`, `classifyCells`, `getZones`

1. **Grid:** a 7×7 window of MODIS pixels (~1.6 km square, each cell ≈ 6 ha) centred on the field, kept inside the tile.
   Cell corners are converted back from sinusoidal to latitude/longitude for drawing.
2. **Inputs per cell:** latest clear-composite NDVI (last 60 days) and NDVI for the same period 1, 2 or 3 years earlier
   (first available), both read as one 7×7 window; elevation at the 49 cell centres (Copernicus DEM 90 m).
3. **Slope** (%) by central differences between neighbouring cells (one-sided at edges), spacing 231.66 m:
   `slope = √(dz/dx² + dz/dy²) × 100`.
4. **Erosion risk:** `bare = 1 − min(NDVI, 0.6)/0.6`; `score = slope × (0.3 + bare)`; ≥ 4 **high**, ≥ 1.5 **medium**, else low.
5. **Water-stress hotspot:** `NDVI < median(grid) − 0.10` **and** (no past value or `NDVI < past − 0.10`) — less green than
   both its neighbours and its own past.
6. **Frost-prone low spot:** only where the climate has cold nights (any month with typical night low ≤ 4 °C or record
   min ≤ 0 °C): elevation more than 3 m below the grid mean (cold air drains into hollows).
7. The **field-centre slope** is passed to the rotation planner's erosion criterion.

### 4.11 Crop suitability scoring

`src/planner.js` — `scoreCrop`, `rankCrops`, `monsoonCarryover`

For each crop allowed in the season (score 0–100, or rejected):

| Component | Formula |
|---|---|
| Temperature fit (0–40) | `off` = distance of season mean T outside the crop's range; **reject if off > 5 °C**; score `40 − 8·off` |
| Water fit (0–40) | `available = 0.7·season rain + stored + irrigation` (rainfed 0, limited 250, full 900 mm); `ratio = available / crop water need`; **reject if ratio < 0.5**; score `min(40, 40·ratio)` |
| Value (0–20) | `5 × value index (0–4)` |
| Heat penalty | if hot afternoons > crop heat limit: `min(20, 2 × excess °C)` |
| Frost penalty | 10 if crop is frost-sensitive and cold nights ≤ 0 °C |
| Soil pH penalty | outside the crop's pH range: `min(20, 12 × distance)` |
| Labour penalty | 15 for labour-heavy crops (level 3) when the farmer has little labour/no machines |

**Monsoon carry-over to Rabi** (stored soil water):
`stored = min(200, max(0, (Kharif rain − 400) × 0.4 × f))`, where `f = clamp((FC − WP)/0.15, 0.5, 1.4)` from the soil texture
(heavier soils hold more).

Extra irrigation need per crop: `max(0, water need − 0.7·rain − stored)`. Crops the farmer chose to avoid are excluded; the top 6
per season are kept, plus "leave fallow" (score 30, or 45 in Zaid).

### 4.12 Rotation planning and the eight criteria

`src/planner.js` — `rotationCriteria`, `scoreSequence`, `planRotations`, `cropRoles`

**Search:** every Kharif × Rabi × Zaid combination of the candidates (at most one fallow season; the Kharif crop is never the
same as last season's crop) — typically ~300 combinations.

**Criteria** (0–100, higher is better). The rotation is treated as repeating, so pairs are checked from last season's crop
through Kharif → Rabi → Zaid → next Kharif:

| Criterion | Computation |
|---|---|
| **Nutrients** | 50; +15 for the first legume, +5 per extra; −15 if none; +8 for each legume → heavy feeder; −8 for each heavy → heavy |
| **Erosion protection** | `risk = Σ season (rain share × (3 − cover)/3)` + 0.2 × rain share for soil-disturbing harvests (potato, onion, groundnut); score `100(1 − risk)`; −4 per % slope above 2 % |
| **Organic matter** | `20 + (Σ residue / 9) × 60`; +20 with green manure; +5 with a deep-rooted crop |
| **Pest-cycle break** | 60; −20 per same-family pair; +25 for ≥ 3 families, +10 for 2; +5 for a fallow break |
| **Water saving** | `100 − irrigation mm / 15` |
| **Fodder** | `(Σ forage / 9) × 100` |
| **Income** | if every crop has a mandi price: `Σ (modal ₹/quintal × typical yield qtl/acre)`, scored `gross / 2500` (₹2.5 lakh/acre/year = 100); otherwise a relative value index |
| **Drought safety** | mean drought tolerance / 3 × 100 |

**Overall score:** first the season-fit average `fit` and `soil = mean(nutrients, erosion, organic, pest)`; then

`total = (fit·w_fit + soil·w_soil + water·w_water + income·w_income + drought·w_drought + fodder·w_fodder) / Σw`

| Priority | fit | soil | water | income | drought |
|---|---|---|---|---|---|
| balanced | 0.35 | 0.25 | 0.15 | 0.15 | 0.10 |
| income | 0.30 | 0.15 | 0.10 | 0.40 | 0.05 |
| soil health | 0.30 | 0.45 | 0.10 | 0.10 | 0.05 |
| save water | 0.30 | 0.15 | 0.35 | 0.10 | 0.10 |

`w_fodder = 0.15` when the farmer needs fodder; in a drier what-if year `w_drought += min(0.4, |rain %|/100 × 0.8)`.

**Selection:** sort by total; keep the best three plans that each differ from every already chosen plan in at least two seasons.

**Crop roles** shown to the farmer: `nitrogen_fixer` (legume), `cover_crop` (green manure or cover = 3), `deep_rooted`,
`drought_tolerant` (tolerance 3), `fodder` (forage 3). Reasons and warnings include: has legume, legume feeds next crop,
diverse families, covered in monsoon, green manure, one fallow season / no legume, same family back-to-back, two heavy feeders,
bare in monsoon, water may be short, heat stress, frost risk, soil too acidic/alkaline, labour heavy.

### 4.13 What-if climate scenarios

`src/planner.js` — `applyScenario`

Rainfall change (−50 … +50 %, UI −40 … +40 % in 10 % steps) multiplies each season's rain; temperature change (−3 … +5 °C,
UI −1 … +4 °C) is added to the season mean, hot-afternoon and cold-night values. Plans are recomputed with these seasons, and
drought safety is weighted up for drier scenarios (4.12).

### 4.14 Mandi price aggregation

`src/mandi.js` — `cropForCommodity`, `summarizePrices`, `getMandiPrices`; `src/geo.js` — `parsePlace`

1. **State and district** from Nominatim; Nominatim names are mapped to Agmarknet names (e.g. "National Capital Territory of
   Delhi" → "NCT of Delhi"); district suffixes "district/urban/rural" are removed; new names map to older ones
   (Bengaluru → Bangalore, Mysuru → Mysore, Gurugram → Gurgaon, Prayagraj → Allahabad, …).
2. **Commodity matching** by patterns (Agmarknet spellings vary): e.g. `^paddy|^rice` → rice, `arhar|tur|red gram` → pigeon pea,
   `bengal gram|^gram|chana` → chickpea. Processed goods (`dal`, `oil`, `cake`, `flour`, `atta`) are skipped.
3. **Rice:** paddy rows are used when present (farmers sell paddy; milled rice is about twice the price).
4. **Outliers:** rows with modal price < median/4 or > 4×median are dropped (data-entry errors such as ₹8/quintal).
5. **Per crop:** median modal price (₹/quintal), low–high range, number of reports, latest date, and — if the farmer's
   district reports it — the district's median and an example market.

### 4.15 AI assistant

`src/assistant.js`

- **Model:** Claude (`claude-opus-5-5`) through the official Anthropic SDK, `max_tokens` 4000, `effort: low`, with server-side
  fallback enabled for declined requests. A refusal is shown as "can't help with that question".
- **Input:** up to 10 previous turns (user-first, ≤ 4000 characters each), the question (≤ 1500 characters), the answer
  language, and a compact text **field context** built from the computed data: location, annual rain and seasons (POWER), soil
  (SoilGrids), current soil moisture and the watering advice (Open-Meteo), NDVI status and trend (MODIS), timeline findings with
  causes, anomaly and confidence, the current rotation plan, irrigation and last crop, and today's mandi prices.
- **System prompt rules:** simple words; low-cost steps first; base climate statements on the provided NASA data and say when it
  does not cover the question; integrated pest management and safety for chemicals, refer doses to the KVK; never invent prices,
  schemes or subsidies — only use the provided mandi prices and suggest checking the local mandi; say how sure coarse satellite
  data is and ask the farmer to confirm in the field; keep answers under ~180 words.
- **Output formatting:** bold, headings and bullet lists are rendered with a minimal escaping formatter (`public/format.js`);
  read-aloud removes the marks.
- **Languages:** English, Hindi, Marathi, Bengali, Tamil, Telugu, Kannada, Malayalam, Punjabi.

The assistant explains computed results; it does not produce the advice numbers, scores or zones.

---

## 5. Crop reference table

`src/crops.js` — rounded planning values from FAO / ICAR guidance (not prescriptions).

| Crop | Family | Seasons | Mean T range °C | Heat limit °C | Frost safe | Water mm | N | pH | Residue | Roots | Cover | Forage | Drought | Labour | Yield qtl/acre |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Rice | grass | K | 22–34 | 40 | no | 1100 | heavy | 5.0–7.5 | 2 | shallow | 2 | 2 | 0 | 3 | 20 |
| Maize | grass | K R Z | 18–32 | 40 | no | 550 | heavy | 5.5–7.5 | 3 | deep | 2 | 3 | 1 | 2 | 20 |
| Pearl millet (bajra) | grass | K Z | 24–36 | 46 | no | 350 | light | 5.5–8.0 | 2 | deep | 2 | 3 | 3 | 1 | 10 |
| Sorghum (jowar) | grass | K R | 20–35 | 44 | no | 450 | light | 5.5–8.5 | 3 | deep | 2 | 3 | 3 | 1 | 10 |
| Cotton | mallow | K | 21–35 | 45 | no | 800 | heavy | 5.8–8.0 | 1 | deep | 1 | 0 | 2 | 3 | 8 |
| Soybean | legume | K | 20–32 | 40 | no | 500 | fix | 6.0–7.5 | 1 | medium | 2 | 1 | 1 | 2 | 8 |
| Pigeon pea (arhar) | legume | K | 20–35 | 44 | no | 400 | fix | 5.0–8.0 | 2 | deep | 2 | 1 | 3 | 1 | 6 |
| Green gram (moong) | legume | K Z | 25–36 | 44 | no | 300 | fix | 6.2–7.8 | 1 | shallow | 2 | 2 | 2 | 2 | 4 |
| Groundnut | legume | K Z | 22–33 | 42 | no | 500 | fix | 5.5–7.5 | 1 | shallow | 2 | 3 | 2 | 2 | 8 |
| Wheat | grass | R | 12–24 | 34 | yes | 450 | heavy | 6.0–8.0 | 2 | medium | 2 | 2 | 1 | 1 | 18 |
| Barley | grass | R | 10–24 | 34 | yes | 350 | light | 6.0–8.5 | 2 | medium | 2 | 2 | 2 | 1 | 14 |
| Chickpea (chana) | legume | R | 12–26 | 35 | no | 300 | fix | 6.0–8.0 | 1 | deep | 1 | 1 | 3 | 1 | 7 |
| Lentil (masoor) | legume | R | 10–24 | 33 | yes | 280 | fix | 6.0–8.0 | 1 | shallow | 1 | 1 | 2 | 1 | 5 |
| Mustard | brassica | R | 10–25 | 35 | yes | 300 | light | 6.0–8.5 | 1 | deep | 2 | 0 | 2 | 1 | 7 |
| Potato | nightshade | R | 12–22 | 30 | no | 500 | heavy | 4.8–6.5 | 0 | shallow | 1 | 0 | 0 | 3 | 90 |
| Onion | allium | R K | 13–28 | 38 | yes | 450 | light | 6.0–7.5 | 0 | shallow | 0 | 0 | 0 | 3 | 80 |
| Watermelon | cucurbit | Z | 24–35 | 42 | no | 450 | light | 5.8–7.2 | 0 | shallow | 2 | 0 | 1 | 2 | 100 |
| Cowpea (lobia) | legume | K Z | 24–36 | 44 | no | 300 | fix | 5.5–7.5 | 2 | medium | 3 | 3 | 3 | 1 | 5 |
| Green manure (dhaincha) | cover | Z K | 20–38 | 46 | no | 250 | fix | 5.0–8.5 | 3 | deep | 3 | 1 | 1 | 1 | — |

K = Kharif, R = Rabi, Z = Zaid. Value index (0–4) is also used when prices are unavailable.

---

## 6. API reference

All endpoints return JSON. Coordinates are validated (−90…90, −180…180) and rounded to 0.01°.

| Method & path | Parameters | Returns |
|---|---|---|
| `GET /api/health` | — | `ok`, function `region`, whether `ANTHROPIC_API_KEY` and `DATA_GOV_IN_API_KEY` are set (true/false only) |
| `GET /api/meta` | — | crop ids, irrigation levels, priorities, assistant languages |
| `GET /api/climate` | `lat`, `lon` | monthly climatology, seasons, insights, annual rain |
| `GET /api/field` | `lat`, `lon`, optional `parts` = any of `soil,forecast,ndvi` | `soil`, `soilNotes`, `forecast`, `advice`, `ndvi`, `errors` per source, `soilMissing` |
| `GET /api/timeline` | `lat`, `lon` | `monthly` (harmonised grid), `segments`, `findings`, `anomaly`, `soilNow`, `confidence`, `lastDailyDate` |
| `GET /api/zones` | `lat`, `lon` | 49 `cells` (polygon, NDVI, past NDVI, elevation, slope, erosion, stress, frost), `counts`, `centre`, `dates`, `frostClimate` |
| `GET /api/mandi` | `lat`, `lon` | `state`, `district`, per-crop prices, unmatched commodities; `503 {code:'not_configured'}` without a key; `reason:'outside_india'` |
| `POST /api/plan` | `lat`, `lon`, `irrigation` (rainfed/limited/full), `lastCrop`, `priority`, `constraints {lowLabour, needFodder, avoid[]}`, `scenario {rainPct, tempC}`, `slopePct` | `plans` (picks, total, parts, eight `criteria`, irrigation, gross income, roles, reasons, warnings), `climate`, `soil`, `scenario`, `pricesUsed` |
| `POST /api/ask` | `question`, `language`, `history[]`, `context` | `answer`, `refused`; `503` when no Anthropic key |

Errors: `400` for invalid input, `502` for upstream failures, `429` when the assistant is rate-limited.

---

## 7. Front end, languages and accessibility

- **Plain HTML/CSS/JavaScript modules**, no framework or build step; works on low-end Android phones.
- **Languages:** `public/i18n.js` (English, Hindi) and one file per language in `public/lang/` (Tamil, Kannada, Malayalam,
  Telugu) holding UI text, crop names and month names. Tests check that every language has every key with the same `{placeholders}`.
- **Voice:** Web Speech API for speech input and read-aloud using Indian locales (`hi-IN`, `ta-IN`, `kn-IN`, …) where the phone supports them.
- **Dark mode** follows the phone setting; all text uses theme colours.
- **Progressive loading:** soil + forecast (≈1–7 s), NDVI (≈8 s), timeline (≈18 s), zones (≈9 s) and prices load independently.
- **Charts** are inline SVG (climate chart, NDVI sparkline, phase strip); the map uses Leaflet 1.9.4 loaded on demand.

---

## 8. Reliability, caching and failure handling

| Data | Cache (per serverless instance) |
|---|---|
| POWER climatology | 24 h |
| POWER daily | per day |
| SoilGrids | 7 days |
| Open-Meteo forecast | 1 h |
| MODIS NDVI series / zones | 12 h |
| MODIS past-year normal | 24 h |
| Planetary Computer SAS token | 30 min |
| Nominatim place | 7 days |
| Mandi prices per state | 3 h |

- All outside calls go through `fetchJson` with a timeout and a short, source-named error (`SoilGrids: …`, `MODIS: timed out`).
  Failed lookups are not cached.
- `/api/field` uses `Promise.allSettled`, so one failing source never hides the others; the UI names the missing source.
- MODIS pixel reads that fail are skipped; the series is built from the rest.
- API keys are read only from environment variables and are never sent to the browser; `/api/health` reports only true/false.

---

## 9. Testing

`npm test` runs 65 tests with Node's built-in test runner, offline, using saved real responses (NASA POWER Delhi, Open-Meteo and
SoilGrids Bengaluru) and hand-built samples:

| File | Covers |
|---|---|
| `climate.test.js` | POWER parsing, unit conversion, missing-value rejection, caching, Delhi season insights |
| `field.test.js` | SoilGrids averaging and texture triangle, soil notes, Open-Meteo parsing, watering decisions, MODIS cloud filtering, tile/pixel maths, source error handling, soil fallback distance |
| `timeline.test.js` | POWER daily parsing, monthly harmonisation, phase detection with noise, harvest vs stress, anomaly and confidence |
| `zones.test.js` | Sinusoidal round trip, pixel polygons, slope from a tilted plane, erosion/stress/frost flags |
| `planner.test.js` | Crop table consistency, rejection rules, pH and soil effects, eight criteria, constraints, scenarios, plan diversity |
| `mandi.test.js` | Commodity matching, median/range/district, paddy vs rice, outliers, paging and filter fallback, places |
| `assistant.test.js` | Input validation, context and language sent to Claude, refusals |
| `server.test.js` | Every endpoint with stubbed sources, error codes |
| `i18n.test.js` | All six languages: every key, placeholders, crop names, months |
| `answer.test.js` | Safe Markdown rendering and read-aloud text |

Each feature was also checked end to end in a headless phone-sized browser against the live deployment.

---

## 10. Deployment and configuration

- **Hosting:** Vercel; `server.js` default-exports the Express app; static files in `public/` are served by Vercel's CDN.
- **Region:** Mumbai (`bom1`) so data.gov.in accepts requests. `vercel.json` sets a 60 s function limit.
- **Environment variables:**

| Variable | Needed for | Without it |
|---|---|---|
| `ANTHROPIC_API_KEY` | Ask tab | Ask returns "not configured" |
| `DATA_GOV_IN_API_KEY` | Mandi prices | Prices card hidden; income uses the value index |

- **Local run:** `npm install`, then `npm start` (port 3000). Node.js ≥ 20.

---

## 11. Approaches considered

| Approach | Finds | Needs | Explainable | Status |
|---|---|---|---|---|
| Rule-based thresholds on smoothed NDVI | Bare, green-up, peak, decline | Time series only | Yes | **Used** |
| Anomalies vs climatology / past years | Drier or less green than usual | History of the place | Yes | **Used** |
| Evidence-fusion rules (soil, heat, rain) | Stress vs harvest | Harmonised grid | Yes — causes listed | **Used** |
| Weighted multi-criteria scoring | Rotation ranking | Crop table, climate, soil, prices | Yes — eight criteria shown | **Used** |
| Harmonic / double-logistic phenology (TIMESAT-style) | Season start/end dates | Several years of NDVI | Mostly | Planned |
| Z-score anomalies over 10–20 years | How unusual this year is | Long archives | Yes | Planned |
| Random forest / gradient boosting | Crop type, stress class, yield risk | Labelled fields | Partly | Needs ground truth |
| LSTM / transformer time-series models | Complex patterns | Large labelled data | Weak | Not suitable yet |
| Large language model (Claude) | Explanations in 9 languages | Computed context | Explains only | **Used** |

Explainable rules were chosen because there is no labelled ground truth for these fields yet, and every result must be
explainable to a farmer in one sentence.

---

## 12. Uncertainty, limitations and where local expertise is needed

- **Scale:** a MODIS pixel is ~6 ha; POWER cells are ~50 km; SMAP 9 km; GRACE ~300 km. Small fields mix with neighbours.
- **Clouds:** monsoon cloud cover leaves gaps in NDVI; the confidence level reflects this.
- **Models vs measurements:** soil moisture and ET are model estimates; SoilGrids is a prediction map. A soil test, a rain
  gauge and the farmer's own observation are more accurate for the exact field.
- **Archive gaps:** some 2025 MODIS items are missing in the mirror used; comparisons may use 2023–2024.
- **Prices and yields:** one day's mandi reports and typical yields; income is a rough gross figure without costs.
- **Thresholds and crop parameters** are rounded literature values and need tuning by a Krishi Vigyan Kendra per agro-climatic
  zone and variety.
- **Visual-only layers:** SMAP, GPM IMERG, GRACE, GEDI and HLS are shown on the map but not yet used in calculations.
  ECOSTRESS is not available as a GIBS layer and is not used.
- **Translations** of all five Indian languages need native-speaker review.
- **Human judgment is needed** for seed varieties, pests and diseases, soil test results, local monsoon onset, labour,
  machines, credit and buyers. The app repeats this on the plan, timeline, zones, Learn tab and in the assistant's rules.

---

## 13. Roadmap

1. With a free NASA Earthdata token: read SMAP L4 root-zone soil moisture and GPM IMERG as daily numbers for the field,
   ECOSTRESS 70 m ET and land-surface temperature for within-field water stress, and GEDI biomass; add them to the monthly
   and 250 m grids (aggregate finer data, assign coarser data).
2. Farmer-entered rain gauge readings, irrigation logs and soil tests, used for simple per-field bias correction.
3. Phenology curve fitting for sowing and harvest dates; longer anomaly baselines.
4. Validation of stress and rotation rules with a KVK on real fields for one season; supervised models once labels exist.
5. Offline support for areas with weak connectivity.

---

## 14. Credits and attributions

- **NASA:** POWER (LaRC), MODIS MOD13Q1/MYD13Q1 v061 (LP DAAC), GIBS / Worldview layers (SMAP, GPM IMERG, MODIS, HLS, GRACE, GEDI).
- **Microsoft Planetary Computer** for cloud-optimised MODIS data.
- **ISRIC – World Soil Information** for SoilGrids 2.0 (CC BY 4.0).
- **Open-Meteo** for forecast and elevation APIs (CC BY 4.0); **Copernicus DEM** © DLR/Airbus, ESA.
- **Government of India, data.gov.in / Agmarknet** for mandi prices (Government Open Data License – India).
- **OpenStreetMap contributors** for Nominatim and map tiles (ODbL); **Esri** World Imagery.
- **Anthropic** Claude API for the assistant.
- Libraries: Express, geotiff.js, Leaflet.

**Team background.** The team previously built a separate farmer-assistant project (Kisanaiar). This repository is a new
codebase written during the Space Apps 2026 hackathon weekend; it shares the goal of helping small farmers with NASA data and
uses some of the same public data sources, but none of the earlier code.
