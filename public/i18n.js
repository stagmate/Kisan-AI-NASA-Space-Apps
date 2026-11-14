// UI text. English and Hindi live here; regional languages are one file each in ./lang/.
// The assistant can answer in every language listed by /api/meta.
import ta from './lang/ta.js';
import kn from './lang/kn.js';
import ml from './lang/ml.js';
import te from './lang/te.js';

const REGIONAL = { ta, kn, ml, te };

export const UI_LANGS = {
  en: 'English',
  hi: 'हिन्दी',
  ta: 'தமிழ்',
  kn: 'ಕನ್ನಡ',
  ml: 'മലയാളം',
  te: 'తెలుగు',
};

const MONTHS = {
  en: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
  hi: ['जन', 'फ़र', 'मार्च', 'अप्रै', 'मई', 'जून', 'जुला', 'अग', 'सित', 'अक्टू', 'नव', 'दिस'],
};
const MONTH_KEYS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

const STRINGS = {
  en: {
    tagline: 'Farm planning with NASA climate data',
    tab_climate: 'Climate',
    tab_plan: 'Crop plan',
    tab_ask: 'Ask',
    location: 'Your field location',
    use_gps: 'Use my location',
    lat: 'Latitude',
    lon: 'Longitude',
    or_pick: 'or pick a place',
    load: 'Get climate',
    loading: 'Loading NASA data…',
    source: 'Source: NASA POWER long-term monthly averages (MERRA-2 / GPM).',
    need_location: 'Set your location first.',
    rain: 'Rain (mm)',
    temp: 'Avg temp (°C)',
    season_kharif: 'Kharif (Jun–Oct)',
    season_rabi: 'Rabi (Nov–Mar)',
    season_zaid: 'Zaid (Apr–May)',
    s_mean: 'Average',
    s_high: 'Hot afternoons',
    s_low: 'Cold nights',
    s_rain: 'Rain',
    insights: 'What this means',
    irrigation: 'Water for irrigation',
    irr_rainfed: 'None (rain only)',
    irr_limited: 'Some (well / canal, limited)',
    irr_full: 'Plenty',
    last_crop: 'Last crop grown',
    none: '— none / not sure —',
    priority: 'What matters most?',
    pr_balanced: 'Balanced',
    pr_income: 'Income',
    pr_soil: 'Soil health',
    pr_water: 'Save water',
    make_plan: 'Suggest rotation',
    plan_n: 'Plan {n}',
    score: 'Score {n}/100',
    part_fit: 'Climate fit',
    part_soil: 'Soil health',
    part_water: 'Water saving',
    part_income: 'Income',
    irr_need: 'Extra irrigation needed: about {n} mm',
    no_plans: 'No crop fits this climate with the chosen water. Try more irrigation.',
    ask_title: 'Ask the farm assistant',
    ask_lang: 'Answer language',
    ask_placeholder: 'e.g. When should I sow wheat here? How do I save water in rabi?',
    ask_send: 'Ask',
    ask_mic: 'Speak',
    ask_thinking: 'Thinking…',
    ask_hint: 'Answers use your field’s NASA climate data and crop plan when available.',
    ask_refused: 'Sorry, I can’t help with that question.',
    speak: 'Read aloud',
    error: 'Error: {msg}',
    // insights
    i_annual_rain: 'About {value} mm of rain falls in a normal year.',
    i_wettest_month: '{month} is the wettest month (about {value} mm).',
    i_hottest_month: '{month} is the hottest month (average {value}°C).',
    i_monsoon_dependent: '{value}% of yearly rain comes in Kharif. A weak monsoon hurts badly — keep a drought-tolerant backup.',
    i_frost_risk: 'Cold nights in {months} can bring frost. Protect sensitive crops.',
    i_occasional_frost: 'Frost is rare but has happened in {months}.',
    i_heat_risk: 'Afternoons above 40°C in {months}. Avoid flowering crops in this heat.',
    i_rabi_needs_irrigation: 'Rabi gets only about {value} mm rain — winter crops need irrigation or stored soil water.',
    i_rabi_some_rain: 'Rabi gets about {value} mm rain, which helps winter crops.',
    // reasons / warnings
    r_temp_ideal: 'Temperature is ideal',
    r_rain_enough: 'Rain is enough',
    r_adds_nitrogen: 'Adds nitrogen to soil',
    r_rest_soil: 'Soil rests',
    r_has_legume: 'Includes a pulse/legume that feeds the soil',
    r_legume_feeds_next: 'Legume before a hungry crop saves fertiliser',
    r_diverse_families: 'Different crop families break pest cycles',
    r_one_fallow_season: 'One season left fallow',
    w_water_short: 'Water may be short',
    w_heat_stress: 'Heat stress risk',
    w_frost_risk: 'Frost risk',
    w_no_legume: 'No legume — soil nitrogen will drop',
    w_same_family: 'Same crop family back-to-back — pests build up',
    w_heavy_after_heavy: 'Two fertiliser-hungry crops in a row',
  },
  hi: {
    tagline: 'NASA जलवायु डेटा से खेती की योजना',
    tab_climate: 'मौसम',
    tab_plan: 'फसल योजना',
    tab_ask: 'पूछें',
    location: 'आपके खेत की जगह',
    use_gps: 'मेरी जगह लें',
    lat: 'अक्षांश',
    lon: 'देशांतर',
    or_pick: 'या जगह चुनें',
    load: 'मौसम देखें',
    loading: 'NASA डेटा आ रहा है…',
    source: 'स्रोत: NASA POWER दीर्घकालिक मासिक औसत (MERRA-2 / GPM)।',
    need_location: 'पहले अपनी जगह चुनें।',
    rain: 'बारिश (मिमी)',
    temp: 'औसत तापमान (°C)',
    season_kharif: 'खरीफ़ (जून–अक्टू)',
    season_rabi: 'रबी (नव–मार्च)',
    season_zaid: 'ज़ायद (अप्रै–मई)',
    s_mean: 'औसत',
    s_high: 'गर्म दोपहर',
    s_low: 'ठंडी रात',
    s_rain: 'बारिश',
    insights: 'इसका मतलब',
    irrigation: 'सिंचाई का पानी',
    irr_rainfed: 'नहीं (सिर्फ़ बारिश)',
    irr_limited: 'थोड़ा (कुआँ / नहर)',
    irr_full: 'भरपूर',
    last_crop: 'पिछली फसल',
    none: '— कोई नहीं / पता नहीं —',
    priority: 'सबसे ज़रूरी क्या है?',
    pr_balanced: 'संतुलित',
    pr_income: 'कमाई',
    pr_soil: 'मिट्टी की सेहत',
    pr_water: 'पानी बचाना',
    make_plan: 'फसल चक्र सुझाएँ',
    plan_n: 'योजना {n}',
    score: 'अंक {n}/100',
    part_fit: 'मौसम अनुकूलता',
    part_soil: 'मिट्टी की सेहत',
    part_water: 'पानी की बचत',
    part_income: 'कमाई',
    irr_need: 'अतिरिक्त सिंचाई: लगभग {n} मिमी',
    no_plans: 'चुने गए पानी में कोई फसल इस मौसम में ठीक नहीं। ज़्यादा सिंचाई चुनकर देखें।',
    ask_title: 'खेती सहायक से पूछें',
    ask_lang: 'जवाब की भाषा',
    ask_placeholder: 'जैसे: यहाँ गेहूँ कब बोऊँ? रबी में पानी कैसे बचाऊँ?',
    ask_send: 'पूछें',
    ask_mic: 'बोलें',
    ask_thinking: 'सोच रहा है…',
    ask_hint: 'जवाब में आपके खेत का NASA मौसम डेटा और फसल योजना इस्तेमाल होती है।',
    ask_refused: 'माफ़ कीजिए, इस सवाल में मैं मदद नहीं कर सकता।',
    speak: 'सुनें',
    error: 'त्रुटि: {msg}',
    i_annual_rain: 'सामान्य साल में लगभग {value} मिमी बारिश होती है।',
    i_wettest_month: '{month} सबसे ज़्यादा बारिश वाला महीना है (लगभग {value} मिमी)।',
    i_hottest_month: '{month} सबसे गर्म महीना है (औसत {value}°C)।',
    i_monsoon_dependent: 'साल की {value}% बारिश खरीफ़ में होती है। कमज़ोर मानसून में नुकसान होगा — सूखा सहने वाली फसल तैयार रखें।',
    i_frost_risk: '{months} में ठंडी रातों में पाला पड़ सकता है। नाज़ुक फसलों को बचाएँ।',
    i_occasional_frost: '{months} में कभी-कभी पाला पड़ा है।',
    i_heat_risk: '{months} में दोपहर 40°C से ऊपर। इस गर्मी में फूल वाली फसल से बचें।',
    i_rabi_needs_irrigation: 'रबी में सिर्फ़ लगभग {value} मिमी बारिश — सर्दी की फसलों को सिंचाई चाहिए।',
    i_rabi_some_rain: 'रबी में लगभग {value} मिमी बारिश होती है, जो सर्दी की फसलों के लिए अच्छी है।',
    r_temp_ideal: 'तापमान सही है',
    r_rain_enough: 'बारिश काफ़ी है',
    r_adds_nitrogen: 'मिट्टी में नाइट्रोजन बढ़ाती है',
    r_rest_soil: 'मिट्टी को आराम',
    r_has_legume: 'दलहन फसल शामिल है, जो मिट्टी को ताक़त देती है',
    r_legume_feeds_next: 'दलहन के बाद भूखी फसल — खाद की बचत',
    r_diverse_families: 'अलग-अलग फसल परिवार कीटों का चक्र तोड़ते हैं',
    r_one_fallow_season: 'एक मौसम खेत खाली',
    w_water_short: 'पानी कम पड़ सकता है',
    w_heat_stress: 'गर्मी से नुकसान का ख़तरा',
    w_frost_risk: 'पाले का ख़तरा',
    w_no_legume: 'दलहन नहीं — मिट्टी की नाइट्रोजन घटेगी',
    w_same_family: 'एक ही परिवार की फसल लगातार — कीट बढ़ेंगे',
    w_heavy_after_heavy: 'लगातार दो ज़्यादा खाद वाली फसलें',
  },
};

const CROP_NAMES = {
  en: {
    rice: 'Rice', maize: 'Maize', pearl_millet: 'Pearl millet (bajra)', sorghum: 'Sorghum (jowar)', cotton: 'Cotton',
    soybean: 'Soybean', pigeon_pea: 'Pigeon pea (arhar)', green_gram: 'Green gram (moong)', groundnut: 'Groundnut',
    wheat: 'Wheat', barley: 'Barley', chickpea: 'Chickpea (chana)', lentil: 'Lentil (masoor)', mustard: 'Mustard',
    potato: 'Potato', onion: 'Onion', watermelon: 'Watermelon', cowpea: 'Cowpea (lobia)',
    fallow_green_manure: 'Green manure (dhaincha)', fallow: 'Leave fallow',
  },
  hi: {
    rice: 'धान', maize: 'मक्का', pearl_millet: 'बाजरा', sorghum: 'ज्वार', cotton: 'कपास', soybean: 'सोयाबीन',
    pigeon_pea: 'अरहर', green_gram: 'मूँग', groundnut: 'मूँगफली', wheat: 'गेहूँ', barley: 'जौ', chickpea: 'चना',
    lentil: 'मसूर', mustard: 'सरसों', potato: 'आलू', onion: 'प्याज़', watermelon: 'तरबूज़', cowpea: 'लोबिया',
    fallow_green_manure: 'हरी खाद (ढैंचा)', fallow: 'खेत खाली छोड़ें',
  },
};

for (const [code, pack] of Object.entries(REGIONAL)) {
  MONTHS[code] = pack.months;
  STRINGS[code] = pack.strings;
  CROP_NAMES[code] = pack.crops;
}

let current = 'en';
export function setLang(lang) {
  current = UI_LANGS[lang] ? lang : 'en';
  document.documentElement.lang = current;
}
export const getLang = () => current;

export function t(key, vars = {}) {
  const s = STRINGS[current][key] ?? STRINGS.en[key] ?? key;
  return s.replace(/\{(\w+)\}/g, (_, k) => (vars[k] ?? `{${k}}`));
}

export function monthName(key) {
  return MONTHS[current][MONTH_KEYS.indexOf(key)] ?? key;
}

export function cropName(id) {
  return CROP_NAMES[current][id] ?? CROP_NAMES.en[id] ?? id;
}

export function insightText(ins) {
  return t(`i_${ins.code}`, {
    value: ins.value,
    month: ins.month ? monthName(ins.month) : '',
    months: (ins.months ?? []).map(monthName).join(', '),
  });
}

export const _test = { STRINGS, CROP_NAMES, MONTHS };
