// Crop reference table. Values are rounded agronomic ranges (FAO / ICAR guidance)
// meant for planning, not precise prescriptions.
//
// tempRange: comfortable season-mean temperature (°C)
// heatLimit: max daily temperature above which yield suffers badly
// waterMm:   approximate crop water need over the season
// nitrogen:  'fix' (legume, adds N), 'heavy' (high N demand), 'light'
// phRange:   soil pH (in water) the crop tolerates well
// residue:   0–3, crop residue left to build organic matter (if not burnt or removed)
// roots:     shallow | medium | deep — deep roots open subsoil and reach stored water
// cover:     0–3, how well the canopy shields soil from rain splash and runoff
// forage:    0–3, fodder for animals (straw, stover, haulms, green fodder)
// drought:   0–3, tolerance of dry spells
// labour:    1–3, hand labour needed (3 = transplanting, hand harvest/picking, digging)
// yieldQtlAcre: typical yield, quintals per acre, for rough income estimates only

export const CROPS = [
  { id: 'rice', family: 'grass', seasons: ['kharif'], tempRange: [22, 34], heatLimit: 40, frostSafe: false, waterMm: 1100, nitrogen: 'heavy', value: 3, phRange: [5.0, 7.5], residue: 2, roots: 'shallow', cover: 2, forage: 2, drought: 0, labour: 3, yieldQtlAcre: 20 },
  { id: 'maize', family: 'grass', seasons: ['kharif', 'rabi', 'zaid'], tempRange: [18, 32], heatLimit: 40, frostSafe: false, waterMm: 550, nitrogen: 'heavy', value: 3, phRange: [5.5, 7.5], residue: 3, roots: 'deep', cover: 2, forage: 3, drought: 1, labour: 2, yieldQtlAcre: 20 },
  { id: 'pearl_millet', family: 'grass', seasons: ['kharif', 'zaid'], tempRange: [24, 36], heatLimit: 46, frostSafe: false, waterMm: 350, nitrogen: 'light', value: 2, phRange: [5.5, 8.0], residue: 2, roots: 'deep', cover: 2, forage: 3, drought: 3, labour: 1, yieldQtlAcre: 10 },
  { id: 'sorghum', family: 'grass', seasons: ['kharif', 'rabi'], tempRange: [20, 35], heatLimit: 44, frostSafe: false, waterMm: 450, nitrogen: 'light', value: 2, phRange: [5.5, 8.5], residue: 3, roots: 'deep', cover: 2, forage: 3, drought: 3, labour: 1, yieldQtlAcre: 10 },
  { id: 'cotton', family: 'mallow', seasons: ['kharif'], tempRange: [21, 35], heatLimit: 45, frostSafe: false, waterMm: 800, nitrogen: 'heavy', value: 4, phRange: [5.8, 8.0], residue: 1, roots: 'deep', cover: 1, forage: 0, drought: 2, labour: 3, yieldQtlAcre: 8 },
  { id: 'soybean', family: 'legume', seasons: ['kharif'], tempRange: [20, 32], heatLimit: 40, frostSafe: false, waterMm: 500, nitrogen: 'fix', value: 3, phRange: [6.0, 7.5], residue: 1, roots: 'medium', cover: 2, forage: 1, drought: 1, labour: 2, yieldQtlAcre: 8 },
  { id: 'pigeon_pea', family: 'legume', seasons: ['kharif'], tempRange: [20, 35], heatLimit: 44, frostSafe: false, waterMm: 400, nitrogen: 'fix', value: 4, phRange: [5.0, 8.0], residue: 2, roots: 'deep', cover: 2, forage: 1, drought: 3, labour: 1, yieldQtlAcre: 6 },
  { id: 'green_gram', family: 'legume', seasons: ['kharif', 'zaid'], tempRange: [25, 36], heatLimit: 44, frostSafe: false, waterMm: 300, nitrogen: 'fix', value: 3, phRange: [6.2, 7.8], residue: 1, roots: 'shallow', cover: 2, forage: 2, drought: 2, labour: 2, yieldQtlAcre: 4 },
  { id: 'groundnut', family: 'legume', seasons: ['kharif', 'zaid'], tempRange: [22, 33], heatLimit: 42, frostSafe: false, waterMm: 500, nitrogen: 'fix', value: 4, phRange: [5.5, 7.5], residue: 1, roots: 'shallow', cover: 2, forage: 3, drought: 2, labour: 2, yieldQtlAcre: 8 },
  { id: 'wheat', family: 'grass', seasons: ['rabi'], tempRange: [12, 24], heatLimit: 34, frostSafe: true, waterMm: 450, nitrogen: 'heavy', value: 3, phRange: [6.0, 8.0], residue: 2, roots: 'medium', cover: 2, forage: 2, drought: 1, labour: 1, yieldQtlAcre: 18 },
  { id: 'barley', family: 'grass', seasons: ['rabi'], tempRange: [10, 24], heatLimit: 34, frostSafe: true, waterMm: 350, nitrogen: 'light', value: 2, phRange: [6.0, 8.5], residue: 2, roots: 'medium', cover: 2, forage: 2, drought: 2, labour: 1, yieldQtlAcre: 14 },
  { id: 'chickpea', family: 'legume', seasons: ['rabi'], tempRange: [12, 26], heatLimit: 35, frostSafe: false, waterMm: 300, nitrogen: 'fix', value: 4, phRange: [6.0, 8.0], residue: 1, roots: 'deep', cover: 1, forage: 1, drought: 3, labour: 1, yieldQtlAcre: 7 },
  { id: 'lentil', family: 'legume', seasons: ['rabi'], tempRange: [10, 24], heatLimit: 33, frostSafe: true, waterMm: 280, nitrogen: 'fix', value: 4, phRange: [6.0, 8.0], residue: 1, roots: 'shallow', cover: 1, forage: 1, drought: 2, labour: 1, yieldQtlAcre: 5 },
  { id: 'mustard', family: 'brassica', seasons: ['rabi'], tempRange: [10, 25], heatLimit: 35, frostSafe: true, waterMm: 300, nitrogen: 'light', value: 3, phRange: [6.0, 8.5], residue: 1, roots: 'deep', cover: 2, forage: 0, drought: 2, labour: 1, yieldQtlAcre: 7 },
  { id: 'potato', family: 'nightshade', seasons: ['rabi'], tempRange: [12, 22], heatLimit: 30, frostSafe: false, waterMm: 500, nitrogen: 'heavy', value: 4, phRange: [4.8, 6.5], residue: 0, roots: 'shallow', cover: 1, forage: 0, drought: 0, labour: 3, yieldQtlAcre: 90 },
  { id: 'onion', family: 'allium', seasons: ['rabi', 'kharif'], tempRange: [13, 28], heatLimit: 38, frostSafe: true, waterMm: 450, nitrogen: 'light', value: 4, phRange: [6.0, 7.5], residue: 0, roots: 'shallow', cover: 0, forage: 0, drought: 0, labour: 3, yieldQtlAcre: 80 },
  { id: 'watermelon', family: 'cucurbit', seasons: ['zaid'], tempRange: [24, 35], heatLimit: 42, frostSafe: false, waterMm: 450, nitrogen: 'light', value: 4, phRange: [5.8, 7.2], residue: 0, roots: 'shallow', cover: 2, forage: 0, drought: 1, labour: 2, yieldQtlAcre: 100 },
  { id: 'cowpea', family: 'legume', seasons: ['kharif', 'zaid'], tempRange: [24, 36], heatLimit: 44, frostSafe: false, waterMm: 300, nitrogen: 'fix', value: 2, phRange: [5.5, 7.5], residue: 2, roots: 'medium', cover: 3, forage: 3, drought: 3, labour: 1, yieldQtlAcre: 5 },
  { id: 'fallow_green_manure', family: 'cover', seasons: ['zaid', 'kharif'], tempRange: [20, 38], heatLimit: 46, frostSafe: false, waterMm: 250, nitrogen: 'fix', value: 0, phRange: [5.0, 8.5], residue: 3, roots: 'deep', cover: 3, forage: 1, drought: 1, labour: 1, yieldQtlAcre: 0 },
];

export const CROP_IDS = CROPS.map((c) => c.id);

export function getCrop(id) {
  return CROPS.find((c) => c.id === id) ?? null;
}
