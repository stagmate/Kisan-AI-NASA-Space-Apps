// Crop reference table. Values are rounded agronomic ranges (FAO / ICAR guidance)
// meant for planning, not precise prescriptions.
//
// tempRange: comfortable season-mean temperature (°C)
// heatLimit: max daily temperature above which yield suffers badly
// waterMm:   approximate crop water need over the season
// nitrogen:  'fix' (legume, adds N), 'heavy' (high N demand), 'light'

export const CROPS = [
  { id: 'rice', family: 'grass', seasons: ['kharif'], tempRange: [22, 34], heatLimit: 40, frostSafe: false, waterMm: 1100, nitrogen: 'heavy', value: 3 },
  { id: 'maize', family: 'grass', seasons: ['kharif', 'rabi', 'zaid'], tempRange: [18, 32], heatLimit: 40, frostSafe: false, waterMm: 550, nitrogen: 'heavy', value: 3 },
  { id: 'pearl_millet', family: 'grass', seasons: ['kharif', 'zaid'], tempRange: [24, 36], heatLimit: 46, frostSafe: false, waterMm: 350, nitrogen: 'light', value: 2 },
  { id: 'sorghum', family: 'grass', seasons: ['kharif', 'rabi'], tempRange: [20, 35], heatLimit: 44, frostSafe: false, waterMm: 450, nitrogen: 'light', value: 2 },
  { id: 'cotton', family: 'mallow', seasons: ['kharif'], tempRange: [21, 35], heatLimit: 45, frostSafe: false, waterMm: 800, nitrogen: 'heavy', value: 4 },
  { id: 'soybean', family: 'legume', seasons: ['kharif'], tempRange: [20, 32], heatLimit: 40, frostSafe: false, waterMm: 500, nitrogen: 'fix', value: 3 },
  { id: 'pigeon_pea', family: 'legume', seasons: ['kharif'], tempRange: [20, 35], heatLimit: 44, frostSafe: false, waterMm: 400, nitrogen: 'fix', value: 4 },
  { id: 'green_gram', family: 'legume', seasons: ['kharif', 'zaid'], tempRange: [25, 36], heatLimit: 44, frostSafe: false, waterMm: 300, nitrogen: 'fix', value: 3 },
  { id: 'groundnut', family: 'legume', seasons: ['kharif', 'zaid'], tempRange: [22, 33], heatLimit: 42, frostSafe: false, waterMm: 500, nitrogen: 'fix', value: 4 },
  { id: 'wheat', family: 'grass', seasons: ['rabi'], tempRange: [12, 24], heatLimit: 34, frostSafe: true, waterMm: 450, nitrogen: 'heavy', value: 3 },
  { id: 'barley', family: 'grass', seasons: ['rabi'], tempRange: [10, 24], heatLimit: 34, frostSafe: true, waterMm: 350, nitrogen: 'light', value: 2 },
  { id: 'chickpea', family: 'legume', seasons: ['rabi'], tempRange: [12, 26], heatLimit: 35, frostSafe: false, waterMm: 300, nitrogen: 'fix', value: 4 },
  { id: 'lentil', family: 'legume', seasons: ['rabi'], tempRange: [10, 24], heatLimit: 33, frostSafe: true, waterMm: 280, nitrogen: 'fix', value: 4 },
  { id: 'mustard', family: 'brassica', seasons: ['rabi'], tempRange: [10, 25], heatLimit: 35, frostSafe: true, waterMm: 300, nitrogen: 'light', value: 3 },
  { id: 'potato', family: 'nightshade', seasons: ['rabi'], tempRange: [12, 22], heatLimit: 30, frostSafe: false, waterMm: 500, nitrogen: 'heavy', value: 4 },
  { id: 'onion', family: 'allium', seasons: ['rabi', 'kharif'], tempRange: [13, 28], heatLimit: 38, frostSafe: true, waterMm: 450, nitrogen: 'light', value: 4 },
  { id: 'watermelon', family: 'cucurbit', seasons: ['zaid'], tempRange: [24, 35], heatLimit: 42, frostSafe: false, waterMm: 450, nitrogen: 'light', value: 4 },
  { id: 'cowpea', family: 'legume', seasons: ['kharif', 'zaid'], tempRange: [24, 36], heatLimit: 44, frostSafe: false, waterMm: 300, nitrogen: 'fix', value: 2 },
  { id: 'fallow_green_manure', family: 'cover', seasons: ['zaid', 'kharif'], tempRange: [20, 38], heatLimit: 46, frostSafe: false, waterMm: 250, nitrogen: 'fix', value: 0 },
];

export const CROP_IDS = CROPS.map((c) => c.id);

export function getCrop(id) {
  return CROPS.find((c) => c.id === id) ?? null;
}
