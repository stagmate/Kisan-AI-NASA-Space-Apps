import { renderAnswer, plainAnswer } from './format.js';
import { UI_LANGS, setLang, getLang, t, monthName, cropName, insightText } from './i18n.js';

const $ = (sel) => document.querySelector(sel);
const state = { climate: null, plan: null, history: [], meta: null, field: null, mandi: null };

function store(key, value) {
  try {
    if (value === undefined) return JSON.parse(localStorage.getItem(key));
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    return null;
  }
}

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

async function api(path, opts = {}) {
  const res = await fetch(path, {
    ...opts,
    headers: { 'Content-Type': 'application/json', ...(opts.headers ?? {}) },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`);
  return body;
}

function setStatus(msg, isError = false) {
  const el = $('#status');
  el.textContent = msg;
  el.classList.toggle('error', isError);
}

// ---------- language ----------
function applyText() {
  document.querySelectorAll('[data-i18n]').forEach((el) => {
    el.textContent = t(el.dataset.i18n);
  });
  $('#question').placeholder = t('ask_placeholder');
  fillCropSelect();
  if (state.climate) renderClimate();
  if (state.plan) renderPlans();
  if (state.field) renderField();
  if (state.mandi) renderMandi();
}

function fillCropSelect() {
  const sel = $('#last-crop');
  const keep = sel.value;
  const crops = state.meta?.crops ?? [];
  sel.innerHTML = `<option value="">${esc(t('none'))}</option>` +
    crops.filter((c) => c !== 'fallow_green_manure').map((c) => `<option value="${c}">${esc(cropName(c))}</option>`).join('');
  sel.value = keep;
}

// ---------- tabs ----------
function showTab(name) {
  document.querySelectorAll('[role=tab]').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tab === name)));
  document.querySelectorAll('.tab-panel').forEach((p) => (p.hidden = p.id !== `tab-${name}`));
  store('tab', name);
}

// ---------- location ----------
function getCoords() {
  const lat = parseFloat($('#lat').value);
  const lon = parseFloat($('#lon').value);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  return { lat, lon };
}

function setCoords(lat, lon) {
  $('#lat').value = lat.toFixed(2);
  $('#lon').value = lon.toFixed(2);
  store('coords', { lat, lon });
}

async function loadClimate() {
  const c = getCoords();
  if (!c) return setStatus(t('need_location'), true);
  store('coords', c);
  setStatus(t('loading'));
  loadField(c);
  try {
    state.climate = await api(`/api/climate?lat=${c.lat}&lon=${c.lon}`);
    state.plan = null;
    $('#plans').innerHTML = '';
    setStatus('');
    renderClimate();
  } catch (err) {
    setStatus(t('error', { msg: err.message }), true);
  }
}

// ---------- live field data: forecast, soil, satellite ----------
let fieldRequest = 0;
// Soil + forecast come back in a few seconds; the satellite series is slower, so it loads on its own.
async function loadField(c) {
  const id = ++fieldRequest;
  state.field = { errors: {} };
  ['#week-card', '#soil-card', '#ndvi-card'].forEach((sel) => ($(sel).hidden = true));
  $('#field-status').textContent = t('field_loading');
  const part = async (parts) => {
    try {
      const res = await api(`/api/field?lat=${c.lat}&lon=${c.lon}&parts=${parts}`);
      if (id !== fieldRequest) return; // a newer location was picked meanwhile
      const { errors, ...data } = res;
      if (data.soil) delete state.field.soilMissing;
      Object.assign(state.field, data);
      Object.assign(state.field.errors, errors);
    } catch (err) {
      if (id !== fieldRequest) return;
      for (const p of parts.split(',')) state.field.errors[p] = err.message;
    }
    renderField();
  };
  await Promise.all([part('soil,forecast'), part('ndvi')]);
  if (id === fieldRequest) renderField();
}

const SOURCE_NAMES = { forecast: 'Open-Meteo', soil: 'SoilGrids', ndvi: 'NASA MODIS' };

function renderField() {
  const f = state.field;
  if (!f) return;
  ['#week-card', '#soil-card', '#ndvi-card'].forEach((sel) => ($(sel).hidden = true));
  const missing = Object.keys(f.errors ?? {}).map((k) => t('src_unavailable', { name: SOURCE_NAMES[k] ?? k }));
  const pending = !f.forecast && !f.errors?.forecast || !f.ndvi && !f.errors?.ndvi;
  $('#field-status').textContent = [...missing, pending ? t('field_loading') : ''].join(' ').trim();

  // Watering this week
  if (f.forecast && f.advice) {
    const a = f.advice;
    const head = {
      water_now: t('adv_water_now', { mm: a.amountMm }),
      water_soon: t('adv_water_soon', { days: a.days, mm: a.amountMm }),
      rain_coming: t('adv_rain_coming', { rain: a.rain3 }),
      no_need: t('adv_no_need'),
    }[a.code];
    const detail = a.available == null
      ? t('adv_detail_nosoil', { rain: a.rain7, et: a.et7 })
      : t('adv_detail', { pct: a.available, rain: a.rain7, et: a.et7 });
    const fd = f.forecast.days;
    const loc = LOCALES[getLang()] ?? 'en-IN';
    const cells = (fn) => fd.map((d) => `<span>${fn(d)}</span>`).join('');
    const names = cells((d) => esc(new Date(`${d.date}T12:00:00`).toLocaleDateString(loc, { weekday: 'short' })));
    const dryWeek = fd.every((d) => d.rainMm < 0.5);
    const maxRain = Math.max(10, ...fd.map((d) => d.rainMm));
    const rainRow = dryWeek
      ? `<p class="dry">☀️ ${esc(t('week_dry'))}</p>`
      : `<div class="wgrid bars">${cells((d) => (d.rainMm >= 0.5 ? `<i class="rainbar" style="height:${Math.max(3, Math.round((d.rainMm / maxRain) * 40))}px"></i>` : ''))}</div>
         <div class="wgrid vals">${cells((d) => `<b>${d.rainMm >= 0.5 ? Math.round(d.rainMm) : '–'}</b>${d.rainChance >= 10 ? `<small>${d.rainChance}%</small>` : ''}`)}</div>`;
    const days = `
      <div class="wgrid names">${names}</div>
      <h4>${esc(t('week_rain'))}</h4>${rainRow}
      <h4>${esc(t('week_use'))}</h4>
      <div class="wgrid vals">${cells((d) => (d.et0Mm == null ? '–' : d.et0Mm.toFixed(1)))}</div>
      <h4>${esc(t('week_temp'))}</h4>
      <div class="wgrid vals temps">${cells((d) => `${Math.round(d.tMax)}°<br><small>${Math.round(d.tMin)}°</small>`)}</div>`;
    $('#week').innerHTML = `<p class="advice ${a.code}">${esc(head)}</p><p class="hint">${esc(detail)}</p><div class="week-table">${days}</div>`;
    $('#week-card').hidden = false;
  }

  // Satellite crop health
  if (f.ndvi) {
    const n = f.ndvi;
    let html = '';
    if (!n.latest) {
      html = `<p>${esc(t('ndvi_no_clear_image'))}</p>`;
    } else {
      html = `<p class="advice ndvi-${n.status}">${esc(t(`ndvi_${n.status}`))}</p>
        <p class="hint">${esc(t('ndvi_latest', { value: n.latest.ndvi.toFixed(2), date: formatDate(n.latest.date) }))}${n.trend ? ` · ${esc(t(`ndvi_${n.trend}`))}` : ''}</p>
        ${renderSparkline(n.series)}`;
    }
    $('#ndvi').innerHTML = html;
    $('#ndvi-card').hidden = false;
  }

  // Soil
  if (f.soil) {
    const so = f.soil;
    $('#soil').innerHTML = `<dl class="soil-dl">
        <dt>${esc(t('soil_texture'))}</dt><dd>${esc(t(`tex_${so.texture}`))}</dd>
        <dt>${esc(t('soil_mix'))}</dt><dd>${Math.round(so.sand)} / ${Math.round(so.silt)} / ${Math.round(so.clay)} %</dd>
        <dt>${esc(t('soil_ph'))}</dt><dd>${so.ph ?? '–'}</dd>
        <dt>${esc(t('soil_carbon'))}</dt><dd>${so.organicCarbon ?? '–'} g/kg</dd>
      </dl>
      ${so.nearby ? `<p class="hint">${esc(t('soil_nearby', { km: so.distanceKm ?? '?' }))}</p>` : ''}
      <ul class="insights">${(f.soilNotes ?? []).map((nt) => `<li class="${nt.level}">${esc(t(`n_${nt.code}`, { value: nt.value }))}</li>`).join('')}</ul>`;
    $('#soil-card').hidden = false;
  } else if (f.soilMissing) {
    $('#soil').innerHTML = `<p class="hint">${esc(t('soil_no_map'))}</p>`;
    $('#soil-card').hidden = false;
  }
}

const LOCALES = { en: 'en-IN', hi: 'hi-IN', ta: 'ta-IN', kn: 'kn-IN', ml: 'ml-IN', te: 'te-IN' };

function formatDate(iso) {
  return new Date(`${iso}T12:00:00`).toLocaleDateString(LOCALES[getLang()] ?? 'en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

function renderSparkline(series) {
  if (series.length < 2) return '';
  const W = 340, H = 90, pad = 6;
  const t0 = Date.parse(series[0].date), t1 = Date.parse(series[series.length - 1].date);
  const x = (d) => pad + ((Date.parse(d) - t0) / (t1 - t0 || 1)) * (W - 2 * pad);
  const y = (v) => H - pad - Math.max(0, Math.min(1, v)) * (H - 2 * pad);
  const path = series.map((p, i) => `${i ? 'L' : 'M'}${x(p.date).toFixed(1)},${y(p.ndvi).toFixed(1)}`).join(' ');
  const last = series[series.length - 1];
  return `<svg class="spark" viewBox="0 0 ${W} ${H}" role="img" aria-label="NDVI">
    <line class="grid" x1="${pad}" x2="${W - pad}" y1="${y(0.4)}" y2="${y(0.4)}"/>
    <path class="ndvi-line" d="${path}"/>
    <circle class="ndvi-dot" cx="${x(last.date).toFixed(1)}" cy="${y(last.ndvi).toFixed(1)}" r="4"/>
    <text class="axis" x="${pad}" y="${H - 1}">${esc(formatDate(series[0].date))}</text>
    <text class="axis" x="${W - pad}" y="${H - 1}" text-anchor="end">${esc(formatDate(last.date))}</text>
  </svg>`;
}

// ---------- climate view ----------
function renderChart(months) {
  const W = 340, H = 180, padL = 30, padR = 30, padT = 12, padB = 24;
  const iw = W - padL - padR, ih = H - padT - padB;
  const maxRain = Math.max(50, ...months.map((m) => m.rainMm));
  const temps = months.map((m) => m.tempMean);
  const tMin = Math.floor(Math.min(...temps) / 5) * 5, tMax = Math.ceil(Math.max(...temps) / 5) * 5 || tMin + 5;
  const bw = iw / 12;
  const x = (i) => padL + bw * i + bw / 2;
  const yT = (v) => padT + ih - ((v - tMin) / (tMax - tMin || 1)) * ih;

  const bars = months.map((m, i) => {
    const h = (m.rainMm / maxRain) * ih;
    return `<rect class="bar" x="${(padL + bw * i + 2).toFixed(1)}" y="${(padT + ih - h).toFixed(1)}" width="${(bw - 4).toFixed(1)}" height="${h.toFixed(1)}"><title>${monthName(m.month)}: ${Math.round(m.rainMm)} mm</title></rect>`;
  }).join('');
  const line = months.map((m, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${yT(m.tempMean).toFixed(1)}`).join(' ');
  const dots = months.map((m, i) => `<circle class="dot" cx="${x(i).toFixed(1)}" cy="${yT(m.tempMean).toFixed(1)}" r="3"><title>${monthName(m.month)}: ${m.tempMean.toFixed(1)}°C</title></circle>`).join('');
  const labels = months.map((m, i) => `<text class="axis" x="${x(i).toFixed(1)}" y="${H - 6}" text-anchor="middle">${esc(monthName(m.month)).slice(0, 4)}</text>`).join('');

  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(t('rain'))} / ${esc(t('temp'))}">
    <text class="axis" x="${padL}" y="10">${Math.round(maxRain)} mm</text>
    <text class="axis temp" x="${W - 4}" y="10" text-anchor="end">${tMax}°C</text>
    <text class="axis temp" x="${W - 4}" y="${padT + ih}" text-anchor="end">${tMin}°C</text>
    ${bars}<path class="line" d="${line}"/>${dots}${labels}
  </svg>
  <div class="legend"><span class="key rain"></span>${esc(t('rain'))} <span class="key temp"></span>${esc(t('temp'))}</div>`;
}

function renderClimate() {
  const c = state.climate;
  $('#climate-out').hidden = false;
  $('#chart').innerHTML = renderChart(c.months);
  $('#seasons').innerHTML = c.seasons.map((s) => `
    <div class="season ${s.id}">
      <h3>${esc(t(`season_${s.id}`))}</h3>
      <dl>
        <dt>${esc(t('s_mean'))}</dt><dd>${s.tempMean}°C</dd>
        <dt>${esc(t('s_high'))}</dt><dd>${s.tempMax}°C</dd>
        <dt>${esc(t('s_low'))}</dt><dd>${s.tempMin}°C</dd>
        <dt>${esc(t('s_rain'))}</dt><dd>${s.rainMm} mm</dd>
      </dl>
    </div>`).join('');
  $('#insights').innerHTML = c.insights.map((i) => `<li class="${i.level}">${esc(insightText(i))}</li>`).join('');
}

// ---------- rotation plans ----------
async function makePlan() {
  const c = getCoords();
  if (!c) return setStatus(t('need_location'), true);
  const body = {
    ...c,
    irrigation: $('#irrigation').value,
    lastCrop: $('#last-crop').value || null,
    priority: document.querySelector('input[name=priority]:checked').value,
  };
  store('planInput', body);
  setStatus(t('loading'));
  loadMandi(c);
  try {
    const res = await api('/api/plan', { method: 'POST', body: JSON.stringify(body) });
    state.climate = res.climate;
    state.plan = { ...res, input: body };
    setStatus('');
    renderClimate();
    renderPlans();
  } catch (err) {
    setStatus(t('error', { msg: err.message }), true);
  }
}

// ---------- mandi prices ----------
let mandiRequest = 0;
async function loadMandi(c) {
  const id = ++mandiRequest;
  try {
    const res = await fetch(`/api/mandi?lat=${c.lat}&lon=${c.lon}`);
    const body = await res.json().catch(() => ({}));
    if (id !== mandiRequest) return;
    // Not configured on this server: leave the card hidden rather than show an error.
    state.mandi = res.ok ? body : body.code === 'not_configured' ? null : { error: body.error || `HTTP ${res.status}` };
  } catch (err) {
    if (id === mandiRequest) state.mandi = { error: err.message };
  }
  renderMandi();
  if (state.plan) renderPlans();
}

const inr = (n) => Number(n).toLocaleString('en-IN');

function renderMandi() {
  const m = state.mandi;
  const card = $('#mandi-card');
  if (!m) return (card.hidden = true);
  card.hidden = false;
  if (m.error) return ($('#mandi').innerHTML = `<p class="hint">${esc(t('src_unavailable', { name: 'data.gov.in' }))}</p>`);
  if (m.reason === 'outside_india') return ($('#mandi').innerHTML = `<p class="hint">${esc(t('mandi_outside'))}</p>`);
  const entries = Object.entries(m.crops ?? {}).sort((a, b) => b[1].markets - a[1].markets);
  if (!entries.length) return ($('#mandi').innerHTML = `<p class="hint">${esc(t('mandi_none', { state: m.state }))}</p>`);
  const date = entries.map(([, v]) => v.date).filter(Boolean).sort().at(-1);
  const total = entries.reduce((s, [, v]) => s + v.markets, 0);
  $('#mandi').innerHTML = `<p class="hint">${esc(t('mandi_state', { n: total, state: m.state, date: date ? formatDate(date) : '' }))}</p>
    <ul class="prices">${entries.map(([crop, v]) => `<li>
      <span class="pname">${esc(cropName(crop))}</span>
      <span class="pval"><b>${esc(t('mandi_per_q', { price: inr(v.modal) }))}</b>
        <small>${esc(t('mandi_range', { low: inr(v.low), high: inr(v.high) }))}</small>
        ${v.local ? `<small class="local">${esc(t('mandi_local', { price: inr(v.local.modal), market: v.local.example }))}</small>` : ''}</span>
    </li>`).join('')}</ul>`;
}

function renderPlans() {
  const { plans } = state.plan;
  if (!plans.length) {
    $('#plans').innerHTML = `<div class="card"><p>${esc(t('no_plans'))}</p></div>`;
    return;
  }
  $('#plans').innerHTML = plans.map((p, idx) => {
    const steps = p.picks.map((pk) => `
      <li class="step ${pk.season}">
        <span class="season-tag">${esc(t(`season_${pk.season}`))}</span>
        <strong>${esc(cropName(pk.crop))}</strong>
        ${state.mandi?.crops?.[pk.crop] ? `<span class="pill price">${esc(t('mandi_per_q', { price: inr(state.mandi.crops[pk.crop].modal) }))}</span>` : ''}
        ${pk.warnings.map((w) => `<span class="pill warn">${esc(t(`w_${w}`))}</span>`).join('')}
      </li>`).join('');
    const parts = ['fit', 'soil', 'water', 'income'].map((k) => `
      <div class="meter"><span>${esc(t(`part_${k}`))}</span><div class="track"><div class="fill" style="width:${p.parts[k]}%"></div></div><b>${p.parts[k]}</b></div>`).join('');
    const notes = [
      ...p.reasons.map((r) => `<li class="good">${esc(t(`r_${r}`))}</li>`),
      ...p.warnings.map((w) => `<li class="warn">${esc(t(`w_${w}`))}</li>`),
    ].join('');
    return `<article class="card plan">
      <header><h3>${esc(t('plan_n', { n: idx + 1 }))}</h3><span class="score">${esc(t('score', { n: p.total }))}</span></header>
      <ol class="steps">${steps}</ol>
      ${parts}
      ${p.irrigationMm > 0 ? `<p class="hint">${esc(t('irr_need', { n: p.irrigationMm }))}</p>` : ''}
      <ul class="notes">${notes}</ul>
    </article>`;
  }).join('');
}

// ---------- assistant ----------
function fieldContext() {
  const c = state.climate;
  if (!c) return null;
  const sel = $('#preset');
  return {
    lat: c.lat, lon: c.lon,
    placeName: sel.value && sel.value === `${(+$('#lat').value).toFixed(2)},${(+$('#lon').value).toFixed(2)}` ? sel.selectedOptions[0].textContent : undefined,
    annualRain: c.annualRain,
    seasons: c.seasons,
    irrigation: state.plan?.input.irrigation,
    lastCrop: state.plan?.input.lastCrop ?? undefined,
    plan: state.plan?.plans[0]?.picks.map((p) => `${p.season}: ${p.crop}`),
    soil: state.field?.soil ?? state.plan?.soil ?? undefined,
    mandi: state.mandi?.crops ? { state: state.mandi.state, crops: state.mandi.crops } : undefined,
    soilMoisture: state.field?.forecast?.soilMoisture,
    advice: state.field?.advice,
    ndvi: state.field?.ndvi ? { latest: state.field.ndvi.latest, status: state.field.ndvi.status, trend: state.field.ndvi.trend } : undefined,
  };
}

const SPEECH_LOCALES = { en: 'en-IN', hi: 'hi-IN', mr: 'mr-IN', bn: 'bn-IN', ta: 'ta-IN', te: 'te-IN', pa: 'pa-IN', kn: 'kn-IN', ml: 'ml-IN' };

function addMessage(role, text) {
  const div = document.createElement('div');
  div.className = `msg ${role}`;
  if (role === 'assistant') div.innerHTML = renderAnswer(text);
  else div.textContent = text;
  if (role === 'assistant' && 'speechSynthesis' in window) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'speak';
    b.textContent = `🔊 ${t('speak')}`;
    b.onclick = () => {
      speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(plainAnswer(text));
      u.lang = SPEECH_LOCALES[$('#ask-lang').value] ?? 'en-IN';
      speechSynthesis.speak(u);
    };
    div.append(b);
  }
  $('#chat').append(div);
  div.scrollIntoView({ block: 'nearest' });
  return div;
}

async function ask(e) {
  e.preventDefault();
  const q = $('#question').value.trim();
  if (!q) return;
  const language = $('#ask-lang').value;
  store('askLang', language);
  addMessage('user', q);
  $('#question').value = '';
  const pending = addMessage('pending', t('ask_thinking'));
  $('#ask-send').disabled = true;
  try {
    const res = await api('/api/ask', {
      method: 'POST',
      body: JSON.stringify({ question: q, language, history: state.history, context: fieldContext() }),
    });
    pending.remove();
    const answer = res.refused ? t('ask_refused') : res.answer;
    addMessage('assistant', answer);
    if (!res.refused) state.history.push({ role: 'user', content: q }, { role: 'assistant', content: answer });
    state.history = state.history.slice(-10);
  } catch (err) {
    pending.remove();
    addMessage('error', t('error', { msg: err.message }));
  } finally {
    $('#ask-send').disabled = false;
  }
}

function setupMic() {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) return;
  const mic = $('#mic');
  mic.hidden = false;
  mic.onclick = () => {
    const rec = new SR();
    rec.lang = SPEECH_LOCALES[$('#ask-lang').value] ?? 'en-IN';
    rec.onresult = (ev) => {
      $('#question').value = ev.results[0][0].transcript;
    };
    rec.onend = () => mic.classList.remove('live');
    mic.classList.add('live');
    rec.start();
  };
}

// ---------- init ----------
async function init() {
  const uiSel = $('#ui-lang');
  uiSel.innerHTML = Object.entries(UI_LANGS).map(([k, v]) => `<option value="${k}">${v}</option>`).join('');
  setLang(store('uiLang') ?? (navigator.language ?? 'en').slice(0, 2));
  uiSel.value = getLang();
  uiSel.onchange = () => {
    setLang(uiSel.value);
    store('uiLang', uiSel.value);
    // Answer in the language the farmer just picked for the app.
    const askSel = $('#ask-lang');
    if ([...askSel.options].some((o) => o.value === uiSel.value)) {
      askSel.value = uiSel.value;
      store('askLang', uiSel.value);
    }
    applyText();
  };

  document.querySelectorAll('[role=tab]').forEach((b) => (b.onclick = () => showTab(b.dataset.tab)));
  showTab(store('tab') ?? 'climate');

  $('#gps').onclick = () => {
    if (!navigator.geolocation) return setStatus(t('error', { msg: 'GPS not available' }), true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCoords(pos.coords.latitude, pos.coords.longitude);
        loadClimate();
      },
      (err) => setStatus(t('error', { msg: err.message }), true),
      { timeout: 15000 },
    );
  };
  $('#preset').onchange = (e) => {
    if (!e.target.value) return;
    const [lat, lon] = e.target.value.split(',').map(Number);
    setCoords(lat, lon);
    loadClimate();
  };
  $('#load').onclick = loadClimate;
  $('#make-plan').onclick = makePlan;
  $('#ask-form').onsubmit = ask;
  setupMic();

  try {
    state.meta = await api('/api/meta');
  } catch {
    state.meta = { crops: [], languages: { en: 'English' } };
  }
  const askSel = $('#ask-lang');
  askSel.innerHTML = Object.entries(state.meta.languages).map(([k, v]) => `<option value="${k}">${esc(v)}</option>`).join('');
  askSel.value = store('askLang') ?? getLang();
  if (!askSel.value) askSel.value = 'en';
  applyText();


  const saved = store('coords');
  if (saved) {
    setCoords(saved.lat, saved.lon);
    loadClimate();
  }
}

init();
