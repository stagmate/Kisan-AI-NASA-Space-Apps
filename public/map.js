// Map tab: NASA GIBS layers with a date slider, tap-to-choose field, and field-level zones.
// Leaflet is loaded only when the tab is first opened.

const LEAFLET_CSS = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css';
const LEAFLET_JS = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js';
const GIBS = 'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best';

// One date per year near October for GRACE (water storage), from the GIBS capabilities.
const GRACE_DATES = ['2003-10-01', '2004-10-01', '2005-10-01', '2006-10-01', '2007-10-01', '2008-10-01', '2009-10-01',
  '2010-10-01', '2011-10-01', '2012-09-01', '2013-10-01', '2014-10-01', '2015-09-01', '2016-11-14', '2017-05-23',
  '2018-10-22', '2019-10-01', '2020-10-01', '2021-10-01', '2022-10-01'];

// lag = days until GIBS normally has the newest image. maxZoom = native zoom of the tiles.
export const LAYERS = {
  ndvi: { id: 'MODIS_Terra_NDVI_8Day', tms: 'GoogleMapsCompatible_Level9', ext: 'png', maxZoom: 9, lag: 2 },
  smap: { id: 'SMAP_L4_Analyzed_Root_Zone_Soil_Moisture', tms: 'GoogleMapsCompatible_Level6', ext: 'png', maxZoom: 6, lag: 5 },
  rain: { id: 'IMERG_Precipitation_Rate', tms: 'GoogleMapsCompatible_Level6', ext: 'png', maxZoom: 6, lag: 2 },
  lst: { id: 'MODIS_Terra_Land_Surface_Temp_Day', tms: 'GoogleMapsCompatible_Level7', ext: 'png', maxZoom: 7, lag: 2 },
  hls: { id: 'HLS_S30_Nadir_BRDF_Adjusted_Reflectance', tms: 'GoogleMapsCompatible_Level12', ext: 'png', maxZoom: 12, lag: 9 },
  grace: { id: 'GRACE_Tellus_Liquid_Water_Equivalent_Thickness_Mascon_CRI', tms: 'GoogleMapsCompatible_Level6', ext: 'png', maxZoom: 6, dates: GRACE_DATES },
  gedi: { id: 'GEDI_ISS_L4B_Aboveground_Biomass_Density_Mean_201904-202303', tms: 'GoogleMapsCompatible_Level7', ext: 'png', maxZoom: 7, dates: ['2019-04-18'] },
};

/** Dates the slider moves through for a layer: the last year day by day, or a fixed list. */
export function layerDates(key, now = new Date()) {
  const L = LAYERS[key];
  if (!L) return [];
  if (L.dates) return L.dates;
  const end = new Date(now.getTime() - L.lag * 864e5);
  return Array.from({ length: 365 }, (_, i) => new Date(end.getTime() - (364 - i) * 864e5).toISOString().slice(0, 10));
}

export function tileUrl(key, date) {
  const L = LAYERS[key];
  return `${GIBS}/${L.id}/default/${date}/${L.tms}/{z}/{y}/{x}.${L.ext}`;
}

function loadLeaflet() {
  if (window.L) return Promise.resolve(window.L);
  return new Promise((resolve, reject) => {
    const css = document.createElement('link');
    css.rel = 'stylesheet';
    css.href = LEAFLET_CSS;
    document.head.append(css);
    const js = document.createElement('script');
    js.src = LEAFLET_JS;
    js.onload = () => resolve(window.L);
    js.onerror = () => reject(new Error('Could not load the map library'));
    document.head.append(js);
  });
}

const ZONE_STYLE = {
  ndvi: (c) => {
    const v = c.ndvi ?? 0;
    const g = Math.round(90 + Math.min(1, Math.max(0, v)) * 120);
    return { fillColor: v < 0.2 ? '#b08a5a' : `rgb(${Math.round(200 - v * 180)},${g},${Math.round(80 - v * 60)})`, fillOpacity: 0.55 };
  },
  erosion: (c) => ({ fillColor: c.erosion === 'high' ? '#d7301f' : c.erosion === 'medium' ? '#fc8d59' : '#91cf60', fillOpacity: c.erosion === 'low' ? 0.15 : 0.55 }),
  stress: (c) => ({ fillColor: c.stress ? '#d7301f' : '#ffffff', fillOpacity: c.stress ? 0.6 : 0.05 }),
  frost: (c) => ({ fillColor: c.frost ? '#2b8cbe' : '#ffffff', fillOpacity: c.frost ? 0.6 : 0.05 }),
};

export function createMap({ el, t, esc, formatDate, getField, onUseField, onZones }) {
  let map;
  let marker;
  let picked = null;
  let base;
  let overlay = null;
  let zoneLayer = null;
  let zones = null;
  const $ = (s) => document.querySelector(s);

  function pick(e) {
    picked = { lat: e.latlng.lat, lon: e.latlng.lng };
    if (marker) marker.setLatLng(e.latlng);
    else marker = window.L.marker(e.latlng).addTo(map);
    $('#map-use').disabled = false;
  }

  async function ensure() {
    if (map) return map;
    const L = await loadLeaflet();
    const f = getField() ?? { lat: 22.5, lon: 79 };
    map = L.map(el, { zoomControl: true }).setView([f.lat, f.lon], getField() ? 13 : 5);
    base = {
      street: L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 18, attribution: '© OpenStreetMap contributors' }),
      photo: L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { maxZoom: 18, attribution: '© Esri' }),
    };
    base.street.addTo(map);
    if (getField()) marker = L.marker([f.lat, f.lon]).addTo(map);
    map.on('click', pick);
    $('#map-use').onclick = () => {
      if (!picked) return;
      onUseField(picked);
      $('#map-use').disabled = true;
    };
    $('#map-base').onchange = (e) => {
      map.removeLayer(e.target.checked ? base.street : base.photo);
      (e.target.checked ? base.photo : base.street).addTo(map);
      if (overlay) overlay.bringToFront();
      if (zoneLayer) zoneLayer.bringToFront();
    };
    $('#map-layer').onchange = () => setLayer(true);
    $('#map-date').oninput = () => setLayer(false);
    $('#map-opacity').oninput = (e) => overlay?.setOpacity(Number(e.target.value));
    document.querySelectorAll('input[name=zone-mode]').forEach((r) => (r.onchange = drawZones));
    return map;
  }

  function setLayer(resetDate) {
    const key = $('#map-layer').value;
    const dateInput = $('#map-date');
    if (overlay) {
      map.removeLayer(overlay);
      overlay = null;
    }
    $('#map-legend').textContent = key ? t(`lg_${key}`) : '';
    const dates = layerDates(key);
    dateInput.disabled = dates.length <= 1;
    if (!key) {
      $('#map-date-label').textContent = '';
      return;
    }
    dateInput.max = String(dates.length - 1);
    if (resetDate) dateInput.value = String(dates.length - 1);
    const date = dates[Number(dateInput.value)] ?? dates.at(-1);
    $('#map-date-label').textContent = t('map_date', { date: formatDate(date) });
    overlay = window.L.tileLayer(tileUrl(key, date), {
      maxNativeZoom: LAYERS[key].maxZoom,
      maxZoom: 18,
      opacity: Number($('#map-opacity').value),
      attribution: 'NASA GIBS',
    }).addTo(map);
    if (zoneLayer) zoneLayer.bringToFront();
  }

  function drawZones() {
    if (!map || !zones) return;
    const mode = document.querySelector('input[name=zone-mode]:checked')?.value ?? 'ndvi';
    if (zoneLayer) map.removeLayer(zoneLayer);
    const L = window.L;
    zoneLayer = L.featureGroup(zones.cells.map((c) => L.polygon(c.polygon, {
      weight: 0.6, color: '#333', ...ZONE_STYLE[mode](c),
    }).bindTooltip(`NDVI ${c.ndvi ?? '–'}${c.ndviLastYear != null ? ` (${c.ndviLastYear})` : ''} · ${c.elevation} m · ${c.slopePct}%`)
      .on('click', pick))).addTo(map);
    const legend = {
      ndvi: t('zl_ndvi', { date: formatDate(zones.dates.now) }),
      erosion: t('zl_erosion'),
      stress: t('zl_stress', { date: zones.dates.lastYear ? formatDate(zones.dates.lastYear) : '–' }),
      frost: zones.frostClimate ? t('zl_frost') : t('zl_frost_none'),
    }[mode];
    $('#zone-legend').textContent = legend;
  }

  async function loadZones(field, api) {
    if (!field) return;
    $('#zones-summary').textContent = t('zones_loading');
    try {
      zones = await api(`/api/zones?lat=${field.lat}&lon=${field.lon}`);
      const km = ((zones.cellSizeM * 7) / 1000).toFixed(2);
      $('#zones-summary').textContent = t('z_summary', {
        km, e: zones.counts.erosionHigh, m: zones.counts.erosionMedium, s: zones.counts.stress, f: zones.counts.frost, slope: zones.centre.slopePct,
      });
      onZones?.(zones);
      if (map) {
        drawZones();
        map.fitBounds(zones.cells.flatMap((c) => c.polygon), { padding: [20, 20] });
      }
    } catch (err) {
      $('#zones-summary').textContent = t('error', { msg: err.message });
    }
  }

  return {
    async show(api) {
      await ensure();
      setTimeout(() => map.invalidateSize(), 50);
      const f = getField();
      if (f && !zones) loadZones(f, api);
      else drawZones();
    },
    async fieldChanged(field, api) {
      zones = null;
      if (map) {
        const L = window.L;
        if (marker) marker.setLatLng([field.lat, field.lon]);
        else marker = L.marker([field.lat, field.lon]).addTo(map);
        map.setView([field.lat, field.lon], 13);
      }
      await loadZones(field, api);
    },
    refreshText() {
      if (!map) return;
      if ($('#map-layer').value) setLayer(false);
      drawZones();
    },
    get zones() {
      return zones;
    },
  };
}
