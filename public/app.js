import { UI_LANGS, setLang, getLang, t, monthName, cropName, insightText } from './i18n.js';

const $ = (sel) => document.querySelector(sel);
const state = { climate: null, plan: null, history: [], meta: null };

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
  };
}

const SPEECH_LOCALES = { en: 'en-IN', hi: 'hi-IN', mr: 'mr-IN', bn: 'bn-IN', ta: 'ta-IN', te: 'te-IN', pa: 'pa-IN', kn: 'kn-IN', ml: 'ml-IN' };

function addMessage(role, text) {
  const div = document.createElement('div');
  div.className = `msg ${role}`;
  div.textContent = text;
  if (role === 'assistant' && 'speechSynthesis' in window) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'speak';
    b.textContent = `🔊 ${t('speak')}`;
    b.onclick = () => {
      speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = SPEECH_LOCALES[$('#ask-lang').value] ?? 'en-IN';
      speechSynthesis.speak(u);
    };
    div.append(document.createElement('br'), b);
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
