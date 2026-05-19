// =============================================================
// E-Power frontend — DAM Map MVP
// MVP works on synthetic mock data so the UI/UX can be validated
// before the local Postgres snapshot pipeline is wired in.
// Data contract is documented in data/manifest.json (TBD).
// =============================================================

// --- Zones definition (mirror of curated.bidding_zone) -------
const ZONES = [
  { code: 'UA',      name: 'Ukraine',         iso3: 'UKR', baselevel:  95, vol: 35, season: 0.32, group: 'CEE' },
  { code: 'PL',      name: 'Poland',          iso3: 'POL', baselevel: 118, vol: 22, season: 0.18, group: 'CEE' },
  { code: 'RO',      name: 'Romania',         iso3: 'ROU', baselevel: 115, vol: 24, season: 0.20, group: 'SEE' },
  { code: 'HU',      name: 'Hungary',         iso3: 'HUN', baselevel: 117, vol: 23, season: 0.20, group: 'CEE' },
  { code: 'SK',      name: 'Slovakia',        iso3: 'SVK', baselevel: 112, vol: 21, season: 0.18, group: 'CEE' },
  { code: 'GR',      name: 'Greece',          iso3: 'GRC', baselevel: 105, vol: 26, season: 0.22, group: 'SEE' },
  { code: 'BG',      name: 'Bulgaria',        iso3: 'BGR', baselevel: 102, vol: 22, season: 0.20, group: 'SEE' },
  { code: 'HR',      name: 'Croatia',         iso3: 'HRV', baselevel: 116, vol: 23, season: 0.20, group: 'SEE' },
  { code: 'SI',      name: 'Slovenia',        iso3: 'SVN', baselevel: 117, vol: 22, season: 0.20, group: 'SEE' },
  { code: 'RS',      name: 'Serbia',          iso3: 'SRB', baselevel: 110, vol: 22, season: 0.20, group: 'SEE' },
  { code: 'IT-NORD', name: 'Italy NORD',      iso3: 'ITA', baselevel: 142, vol: 25, season: 0.22, group: 'IT' },
  { code: 'IT-CNOR', name: 'Italy CNOR',      iso3: 'ITA', baselevel: 138, vol: 25, season: 0.22, group: 'IT' },
  { code: 'IT-CSUD', name: 'Italy CSUD',      iso3: 'ITA', baselevel: 137, vol: 25, season: 0.22, group: 'IT' },
  { code: 'IT-SUD',  name: 'Italy SUD',       iso3: 'ITA', baselevel: 134, vol: 25, season: 0.22, group: 'IT' },
  { code: 'IT-SICI', name: 'Italy Sicily',    iso3: 'ITA', baselevel: 140, vol: 26, season: 0.22, group: 'IT' },
  { code: 'IT-SARD', name: 'Italy Sardinia',  iso3: 'ITA', baselevel: 138, vol: 26, season: 0.22, group: 'IT' },
  { code: 'IT-CALA', name: 'Italy Calabria',  iso3: 'ITA', baselevel: 136, vol: 25, season: 0.22, group: 'IT' },
  { code: 'DE-LU',   name: 'Germany–Lux',     iso3: 'DEU', baselevel: 124, vol: 28, season: 0.25, group: 'Western' },
  { code: 'ES',      name: 'Spain',           iso3: 'ESP', baselevel:  72, vol: 30, season: 0.28, group: 'Western' },
];

// Set of ISO3 codes we actually colorize on the map (union of zone iso3)
const COLORED_ISO3 = new Set(ZONES.map(z => z.iso3));

// Zone code → ISO3 mapping. Extends ZONES so we can also locate countries
// that have a JAO border but no DAM zone in our DB (MD, BA, ME, MK).
const ZONE_TO_ISO3 = {
  ...Object.fromEntries(ZONES.map(z => [z.code, z.iso3])),
  // additional zones that appear only in JAO directions
  MD: 'MDA',
  BA: 'BIH',
  ME: 'MNE',
  MK: 'MKD',
};

// Border list: which physical borders to draw arrows for.
// `border` is the alpha-sorted key used by JAO (matches curated.cross_border_auction.border).
// Each border gets TWO arrows — one row per direction in the DB.
const BORDERS_TO_RENDER = [
  // UA — post-2022 synchronous coupling with ENTSO-E continental grid
  { border: 'PL-UA', zones: ['PL', 'UA'] },
  { border: 'SK-UA', zones: ['SK', 'UA'] },
  { border: 'HU-UA', zones: ['HU', 'UA'] },
  { border: 'RO-UA', zones: ['RO', 'UA'] },
  { border: 'MD-UA', zones: ['MD', 'UA'] },
  // RS — DAM both sides available for HU/RO/BG/HR
  { border: 'HU-RS', zones: ['HU', 'RS'] },
  { border: 'RO-RS', zones: ['RO', 'RS'] },
  { border: 'BG-RS', zones: ['BG', 'RS'] },
  { border: 'HR-RS', zones: ['HR', 'RS'] },
  // RS — DAM unavailable on one side; arrow falls back to JAO marginal
  { border: 'BA-RS', zones: ['BA', 'RS'] },
  { border: 'ME-RS', zones: ['ME', 'RS'] },
  { border: 'MK-RS', zones: ['MK', 'RS'] },
];

// =============================================================
// State
// =============================================================
const state = {
  mode: 'day',                // day | mtd | ytd | custom
  date: todayISO(),           // selected day for mode=day
  rangeFrom: null,
  rangeTo: null,
  profile: 'baseload',        // baseload | peak | offpeak (+ TB2/TB4 when parallel task lands)
  data: null,                 // generated mock data: Map<zone, [ {date, mean, peak, offpeak} ]>
  geo: null,                  // loaded TopoJSON
  borders: null,              // Map< `${border}|${direction}|${date}` -> row >
};

// Cross-border arrow labels show JAO marginal price (€/MW) for v1 — the
// most direct "what does capacity cost on this border" number. The tooltip
// still surfaces DAM spread + rent for context. Toggle is intentionally
// absent to keep the headline reading single-valued.
const ARROW_METRIC = 'marginal';

// =============================================================
// Init
// =============================================================
document.addEventListener('DOMContentLoaded', async () => {
  setBuildId();
  bindUI();
  document.getElementById('last-updated').textContent = 'loading…';
  try {
    await loadRealData();
  } catch (err) {
    console.warn('Real data load failed, falling back to mock:', err);
    state.data = generateMockData();
    document.getElementById('last-updated').textContent =
      'MOCK data (snapshot not found) · ' + new Date().toLocaleString('en-GB');
  }
  loadGeographyAndRender();
});

async function loadRealData() {
  const manifest = await fetch('./data/manifest.json', { cache: 'no-cache' })
    .then(r => { if (!r.ok) throw new Error('manifest 404'); return r.json(); });

  const dailyPath = './data/' + manifest.datasets.dam_daily.path;
  const daily = await fetch(dailyPath, { cache: 'no-cache' })  // fixed
    .then(r => { if (!r.ok) throw new Error('dam_daily 404'); return r.json(); });

  // Borders are optional — the daily snapshot may run before the JAO ETL
  // catches up. Treat 404 / bad JSON as "no borders" rather than fatal.
  try {
    if (manifest.datasets && manifest.datasets.borders) {
      const bpath = './data/' + manifest.datasets.borders.path;
      const bres = await fetch(bpath, { cache: 'no-cache' });
      if (bres.ok) {
        const bjson = await bres.json();
        const bmap = new Map();
        for (const r of (bjson.rows || [])) {
          bmap.set(`${r.b}|${r.dir}|${r.d}`, r);
        }
        state.borders = bmap;
      }
    }
  } catch (e) {
    console.warn('borders.json load failed (non-fatal):', e);
  }

  // Reshape: { zone -> [ {date, mean, peak, offpeak} ] }
  // Schema v2: rows are { z, d, m, p, o } compact form. v1: { zone, date, mean_eur, ... }
  const v2 = (daily.schema_version === 2);
  const fZone = v2 ? 'z' : 'zone';
  const fDate = v2 ? 'd' : 'date';
  const fMean = v2 ? 'm' : 'mean_eur';
  const fPeak = v2 ? 'p' : 'peak_eur';
  const fOff  = v2 ? 'o' : 'offpeak_eur';
  const map = new Map();
  for (const r of daily.rows) {
    const z = r[fZone];
    if (!map.has(z)) map.set(z, []);
    map.get(z).push({
      date: r[fDate],
      mean: r[fMean],
      peak: r[fPeak],
      offpeak: r[fOff],
    });
  }
  state.data = map;

  // Cap day-input upper bound to the latest available date
  let maxDate = null;
  for (const arr of map.values()) {
    if (!arr.length) continue;
    const last = arr[arr.length - 1].date;
    if (!maxDate || last > maxDate) maxDate = last;
  }
  if (maxDate) {
    state.date = maxDate;
    const di = document.getElementById('dam-date');
    di.value = maxDate; di.max = maxDate;
  }

  const ts = manifest.generated_at || daily.generated_at;
  const fmt = ts ? new Date(ts).toLocaleString('en-GB', { dateStyle: 'short', timeStyle: 'short' }) : '—';
  const zones = manifest.zones ? manifest.zones.length : map.size;
  document.getElementById('last-updated').textContent =
    `live · ${zones} zones · ${(daily.row_count ?? daily.rows.length).toLocaleString()} daily rows · last snapshot: ${fmt}`;
}

// =============================================================
// UI bindings
// =============================================================
function bindUI() {
  // Mode tabs
  document.querySelectorAll('.mode-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.mode-tab').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.mode = btn.dataset.mode;
      toggleControls();
      rerender();
    });
  });

  // Profile select
  document.getElementById('dam-profile').addEventListener('change', (e) => {
    state.profile = e.target.value;
    rerender();
  });

  // Day picker
  const dateInput = document.getElementById('dam-date');
  dateInput.value = state.date;
  dateInput.max = todayISO();
  dateInput.min = '2021-01-01';
  dateInput.addEventListener('change', (e) => {
    state.date = e.target.value;
    rerender();
  });

  // Custom range
  const fromInput = document.getElementById('dam-from');
  const toInput = document.getElementById('dam-to');
  const todayStr = todayISO();
  fromInput.value = '2024-01-01';
  toInput.value = todayStr;
  fromInput.max = todayStr; toInput.max = todayStr;
  fromInput.min = '2021-01-01'; toInput.min = '2021-01-01';
  state.rangeFrom = fromInput.value;
  state.rangeTo = toInput.value;
  fromInput.addEventListener('change', (e) => { state.rangeFrom = e.target.value; rerender(); });
  toInput.addEventListener('change',   (e) => { state.rangeTo   = e.target.value; rerender(); });

  // Top nav stub
  document.querySelectorAll('.nav-link').forEach(a => {
    a.addEventListener('click', (e) => {
      e.preventDefault();
      const view = a.dataset.view;
      if (view !== 'dam-map') {
        alert(`"${a.textContent.trim()}" — coming in next iteration. MVP is DAM Map only.`);
        return;
      }
      document.querySelectorAll('.nav-link').forEach(x => x.classList.remove('active'));
      a.classList.add('active');
    });
  });

  // Sortable headers
  let sortKey = 'zone', sortDir = 'asc';
  document.querySelectorAll('#dam-table th').forEach(th => {
    th.addEventListener('click', () => {
      const k = th.dataset.sort;
      if (k === sortKey) sortDir = (sortDir === 'asc' ? 'desc' : 'asc');
      else { sortKey = k; sortDir = (k === 'zone' ? 'asc' : 'desc'); }
      window.__sort = { key: sortKey, dir: sortDir };
      renderTable();
    });
  });
}

function toggleControls() {
  document.getElementById('control-day').classList.toggle('hidden', state.mode !== 'day');
  document.getElementById('control-custom').classList.toggle('hidden', state.mode !== 'custom');
}

function setBuildId() {
  document.getElementById('build-id').textContent =
    'mvp-' + new Date().toISOString().slice(0, 10);
}

// =============================================================
// Mock data generator (will be replaced by snapshot fetch)
// =============================================================
function generateMockData() {
  const out = new Map();
  const start = new Date('2024-01-01T00:00:00Z'); // 18-month window for snappy mock
  const end = new Date();
  end.setUTCHours(0, 0, 0, 0);

  // Common shock events (so all zones move together in plausible ways)
  const days = [];
  for (let d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
    days.push(new Date(d));
  }

  // Common European shock noise (correlated cross-market)
  const commonShock = days.map(() => (rndN() * 0.4));

  for (const z of ZONES) {
    const series = [];
    let drift = 0;
    days.forEach((d, i) => {
      const month = d.getUTCMonth();
      // Seasonal: cold months expensive, summer cheaper (renewables-heavy zones get more depressed in summer)
      const seasonal = z.baselevel * z.season * Math.cos(2 * Math.PI * (month + 0.5) / 12);
      drift = drift * 0.97 + rndN() * z.vol * 0.18;
      const idiosyncratic = rndN() * z.vol * 0.6;
      const correlated = commonShock[i] * z.vol;
      const dayOfWeek = d.getUTCDay();
      const weekendDip = (dayOfWeek === 0 || dayOfWeek === 6) ? -z.baselevel * 0.07 : 0;

      let mean = z.baselevel + seasonal + drift + idiosyncratic + correlated + weekendDip;
      // ES: occasional negative mid-day on solar-heavy summer
      if (z.code === 'ES' && (month === 5 || month === 6 || month === 7) && Math.random() < 0.12) {
        mean = mean * 0.4;
      }
      // UA: more volatile in 2022-23
      mean = Math.max(-50, mean);

      const peakMul = 1.16 + Math.random() * 0.08;
      const offMul = 0.82 + Math.random() * 0.06;
      const peak = mean * peakMul;
      const offpeak = mean * offMul;
      series.push({ date: ymd(d), mean: round2(mean), peak: round2(peak), offpeak: round2(offpeak) });
    });
    out.set(z.code, series);
  }
  return out;
}

// =============================================================
// Aggregation logic
// =============================================================
function getZonePrice(zoneCode, mode, profile) {
  const series = state.data.get(zoneCode);
  if (!series || series.length === 0) return null;
  const field = profile === 'peak' ? 'peak' : profile === 'offpeak' ? 'offpeak' : 'mean';
  let slice;
  if (mode === 'day') {
    const row = series.find(r => r.date === state.date);
    if (!row) return null;
    // peak/offpeak may be null on a partial day (DAM not yet fully published).
    // Fall back to mean so the map still shows a color for the zone.
    return row[field] != null ? row[field] : row.mean;
  }
  if (mode === 'mtd') {
    const ref = parseISO(state.date);
    const month = ref.getUTCMonth(), year = ref.getUTCFullYear();
    slice = series.filter(r => {
      const d = parseISO(r.date);
      return d.getUTCMonth() === month && d.getUTCFullYear() === year && d <= ref;
    });
  } else if (mode === 'ytd') {
    const ref = parseISO(state.date);
    const year = ref.getUTCFullYear();
    slice = series.filter(r => {
      const d = parseISO(r.date);
      return d.getUTCFullYear() === year && d <= ref;
    });
  } else if (mode === 'custom') {
    if (!state.rangeFrom || !state.rangeTo) return null;
    slice = series.filter(r => r.date >= state.rangeFrom && r.date <= state.rangeTo);
  }
  if (!slice || slice.length === 0) return null;
  return avgField(slice, field);
}

// MTD / YTD always computed against latest available date in the data,
// regardless of selected day-mode date — used in the side table for context.
function getZonePriceMTD(zoneCode) {
  return averageWindow(zoneCode, 'mtd', state.profile, todayISO());
}
function getZonePriceYTD(zoneCode) {
  return averageWindow(zoneCode, 'ytd', state.profile, todayISO());
}
function averageWindow(zoneCode, mode, profile, refDateISO) {
  const series = state.data.get(zoneCode);
  if (!series) return null;
  const field = profile === 'peak' ? 'peak' : profile === 'offpeak' ? 'offpeak' : 'mean';
  const ref = parseISO(refDateISO);
  let slice;
  if (mode === 'mtd') {
    slice = series.filter(r => {
      const d = parseISO(r.date);
      return d.getUTCMonth() === ref.getUTCMonth() && d.getUTCFullYear() === ref.getUTCFullYear() && d <= ref;
    });
  } else {
    slice = series.filter(r => {
      const d = parseISO(r.date);
      return d.getUTCFullYear() === ref.getUTCFullYear() && d <= ref;
    });
  }
  if (!slice || slice.length === 0) return null;
  return avgField(slice, field);
}

// Average of a series field, skipping nulls. If all are null (e.g. partial
// day with no peak hours yet published), falls back to the mean column so
// the map still colors the zone instead of showing it grey.
function avgField(slice, field) {
  let sum = 0, n = 0;
  for (const r of slice) {
    if (r[field] != null) { sum += r[field]; n++; }
  }
  if (n > 0) return round2(sum / n);
  // Fallback: average of mean column (always present)
  let sumM = 0, nM = 0;
  for (const r of slice) {
    if (r.mean != null) { sumM += r.mean; nM++; }
  }
  return nM > 0 ? round2(sumM / nM) : null;
}

// Country-level price = average of all zones with that ISO3
function getCountryPrice(iso3, mode, profile) {
  const zones = ZONES.filter(z => z.iso3 === iso3);
  if (!zones.length) return null;
  const vals = zones.map(z => mode === 'day'
    ? getZonePrice(z.code, 'day', profile)
    : getZonePrice(z.code, mode, profile)).filter(v => v !== null);
  if (!vals.length) return null;
  return round2(vals.reduce((a, b) => a + b, 0) / vals.length);
}

// =============================================================
// Rendering
// =============================================================
async function loadGeographyAndRender() {
  try {
    // Use Mike Bostock's world atlas, filter to Europe
    const geo = await fetch('https://cdn.jsdelivr.net/npm/world-atlas@2.0.2/countries-50m.json')
      .then(r => r.json());
    state.geo = geo;
    document.getElementById('map-status').classList.add('hidden');
    rerender();
  } catch (err) {
    document.getElementById('map-status').textContent =
      'Failed to load map geometry: ' + err.message;
    console.error(err);
  }
}

function rerender() {
  if (!state.geo) return;
  renderMap();
  renderTable();
  updateMapTitle();
}

function updateMapTitle() {
  const el = document.getElementById('map-title');
  let label;
  if (state.mode === 'day') label = `Day-ahead ${state.profile} prices for ${state.date}`;
  else if (state.mode === 'mtd') label = `Day-ahead ${state.profile} prices · month-to-date (${monthYearLabel(state.date)})`;
  else if (state.mode === 'ytd') label = `Day-ahead ${state.profile} prices · year-to-date (${parseISO(state.date).getUTCFullYear()})`;
  else label = `Day-ahead ${state.profile} prices · ${state.rangeFrom} → ${state.rangeTo}`;
  el.textContent = label;
}

function renderMap() {
  const svg = d3.select('#europe-map');
  svg.selectAll('*').remove();

  // Filter geo to European countries we want to render
  const countries = topojson.feature(state.geo, state.geo.objects.countries).features;
  const eu = countries.filter(f => isEurope(f));

  const projection = d3.geoMercator()
    .center([13, 50])
    .scale(720)
    .translate([450, 305]);
  const path = d3.geoPath().projection(projection);

  // Adaptive yellow→orange→red scale based on actual visible prices.
  // This way every Day/MTD/YTD/Custom view shows full contrast even when
  // all zones cluster in a narrow band like 80..150 EUR.
  const visibleValues = Array.from(COLORED_ISO3)
    .map(iso3 => getCountryPrice(iso3, state.mode, state.profile))
    .filter(v => v != null);
  const colorScale = priceColorScale(visibleValues);

  // Country shapes
  const g = svg.append('g').attr('class', 'countries-layer');
  g.selectAll('path')
    .data(eu)
    .join('path')
      .attr('d', path)
      .attr('class', f => {
        const iso3 = isoNum2Iso3[f.id] || null;
        return 'country-path' + (iso3 && COLORED_ISO3.has(iso3) ? ' has-data' : '');
      })
      .attr('fill', f => {
        const iso3 = isoNum2Iso3[f.id] || null;
        if (!iso3 || !COLORED_ISO3.has(iso3)) return '#e6e8ed';
        const v = getCountryPrice(iso3, state.mode, state.profile);
        return v == null ? '#e6e8ed' : colorScale(v);
      })
      .append('title')
        .text(f => {
          const iso3 = isoNum2Iso3[f.id] || null;
          if (!iso3 || !COLORED_ISO3.has(iso3)) return f.properties.name;
          const v = getCountryPrice(iso3, state.mode, state.profile);
          return `${f.properties.name}: ${v == null ? 'no data' : fmt(v) + ' €/MWh'}`;
        });

  // Crimea overlay — Natural Earth (the source for world-atlas) draws UA
  // without Crimea and folds the peninsula into Russia's polygon, which
  // doesn't match the internationally recognized border. We render a
  // synthetic Crimea polygon on top, filled with UA's price color, with
  // no stroke (so no double-outline) and overlap-extended past the
  // Perekop isthmus into existing UA territory so there's no seam in
  // the fill. The overlay does NOT extend into Russia mainland (east
  // edge stays at ~36.65°E, just past Kerch).
  const uaPriceFill = (() => {
    const v = getCountryPrice('UKR', state.mode, state.profile);
    return v == null ? '#e6e8ed' : colorScale(v);
  })();
  const crimeaFeature = {
    type: 'Feature',
    properties: { name: 'Crimea (Ukraine)', synthetic: true },
    geometry: {
      type: 'Polygon',
      coordinates: [[
        // overlap northward into mainland UA so no seam shows
        [33.40, 46.55], [34.50, 46.55],
        // northern coast / Sea of Azov side
        [35.10, 46.10], [35.95, 45.95],
        // Kerch peninsula east tip
        [36.65, 45.45], [36.20, 45.05],
        // SE → south coast (Yalta) → SW (Sevastopol)
        [34.95, 44.78], [34.10, 44.40], [33.45, 44.50],
        // western Tarkhankut peninsula
        [32.50, 45.15], [33.10, 45.55],
        // close ring
        [33.40, 46.55],
      ]],
    },
  };
  g.append('path')
    .datum(crimeaFeature)
    .attr('d', path)
    .attr('class', 'country-path crimea-overlay has-data')
    .attr('fill', uaPriceFill)
    .attr('stroke', 'none')
    .append('title')
      .text(() => {
        const v = getCountryPrice('UKR', state.mode, state.profile);
        return `Ukraine (incl. Crimea): ${v == null ? 'no data' : fmt(v) + ' €/MWh'}`;
      });

  // Country labels (only for zones we colorize) — always black bold for contrast
  svg.append('g').attr('class', 'labels-layer')
    .selectAll('text')
    .data(eu.filter(f => COLORED_ISO3.has(isoNum2Iso3[f.id] || '')))
    .join('text')
      .attr('class', 'country-label')
      .attr('transform', f => `translate(${path.centroid(f)})`)
      .each(function(f) {
        const iso3 = isoNum2Iso3[f.id];
        const v = getCountryPrice(iso3, state.mode, state.profile);
        const sel = d3.select(this);
        sel.append('tspan').attr('x', 0).attr('dy', '-0.3em').text(f.properties.name);
        sel.append('tspan').attr('x', 0).attr('dy', '1.05em').attr('class', 'price')
           .text(v == null ? '—' : fmt(v) + ' €');
      });

  // Cross-border arrows (drawn on top of country shapes so labels stay readable)
  renderBorderArrows(svg, eu, path);

  // Legend
  renderLegend(colorScale);
}

// =============================================================
// Cross-border arrow rendering
// =============================================================

// Pick the field on a border row corresponding to (metric, profile).
// Returns null if the row lacks that field. Unknown profile (e.g. tb2/tb4 –
// arriving with the parallel task) silently maps to null, which shows as
// dashed "—" arrows instead of erroring.
function borderValue(row, metric, profile) {
  if (!row) return null;
  const map = metric === 'marginal'
    ? { baseload: 'mb', peak: 'mp', offpeak: 'mo' }
    : { baseload: 'sb', peak: 'sp', offpeak: 'so' };
  const key = map[profile];
  if (!key) return null;
  const v = row[key];
  return (v === null || v === undefined) ? null : v;
}

// Format an arrow label. Spread is EUR/MWh; marginal is EUR/MW. Both are
// quite small numbers — 0..30 typical — so 1 decimal is enough.
function fmtArrowValue(v, metric) {
  if (v === null) return '—';
  const abs = Math.abs(v);
  const digits = abs >= 100 ? 0 : (abs >= 10 ? 1 : 2);
  const sign = (metric === 'spread' && v > 0) ? '+' : (v < 0 ? '−' : '');
  return sign + abs.toLocaleString('en-GB', { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

function arrowColorClass(v, metric) {
  if (v === null) return 'nodata';
  if (metric === 'marginal') return 'marg';
  // Spread: red if positive (importer side more expensive), green if negative
  if (Math.abs(v) < 0.5) return 'flat';
  return v > 0 ? 'pos' : 'neg';
}

function renderBorderArrows(svg, euFeatures, path) {
  // Map ISO3 -> projected centroid (only for features the projection
  // returns finite coords for — Mercator can blow up near the poles).
  const iso2centroid = new Map();
  for (const f of euFeatures) {
    const iso3 = isoNum2Iso3[f.id];
    if (!iso3) continue;
    const c = path.centroid(f);
    if (c && isFinite(c[0]) && isFinite(c[1])) iso2centroid.set(iso3, c);
  }

  const layer = svg.append('g').attr('class', 'arrows-layer');

  // Arrowheads tinted to match the line color (only the two we use in v1)
  const defs = layer.append('defs');
  const markers = [
    { id: 'arr-marg',   color: '#2b6cb0' },
    { id: 'arr-nodata', color: '#cdd2da' },
  ];
  for (const m of markers) {
    defs.append('marker')
      .attr('id', m.id)
      .attr('viewBox', '0 0 10 10')
      .attr('refX', 8).attr('refY', 5)
      .attr('markerWidth', 6).attr('markerHeight', 6)
      .attr('orient', 'auto-start-reverse')
      .append('path')
        .attr('d', 'M0,0 L10,5 L0,10 Z')
        .attr('fill', m.color);
  }

  for (const b of BORDERS_TO_RENDER) {
    const [zA, zB] = b.zones;
    const isoA = ZONE_TO_ISO3[zA], isoB = ZONE_TO_ISO3[zB];
    const cA = iso2centroid.get(isoA), cB = iso2centroid.get(isoB);
    if (!cA || !cB) continue; // country not in viewport — skip silently

    // Direction in JAO is "FROM>TO". Two rows per border, one each way.
    const dirAB = `${zA}>${zB}`;
    const dirBA = `${zB}>${zA}`;
    const keyAB = `${b.border}|${dirAB}|${state.date}`;
    const keyBA = `${b.border}|${dirBA}|${state.date}`;
    const rowAB = state.borders ? state.borders.get(keyAB) : null;
    const rowBA = state.borders ? state.borders.get(keyBA) : null;

    drawDirectedArrow(layer, cA, cB, rowAB, dirAB, +1);
    drawDirectedArrow(layer, cB, cA, rowBA, dirBA, -1);
  }
}

// Draw one directional arrow from `from` centroid to `to` centroid, offset
// perpendicular so the opposing direction sits on the other side of the
// midline (parity = ±1 picks the side).
function drawDirectedArrow(layer, from, to, row, dirLabel, parity) {
  const [x1, y1] = from;
  const [x2, y2] = to;
  const dx = x2 - x1, dy = y2 - y1;
  const len = Math.hypot(dx, dy);
  if (len < 8) return; // centroids too close — skip (e.g. small enclaves)

  // Unit vector along the line, and perpendicular
  const ux = dx / len, uy = dy / len;
  const px = -uy, py = ux;          // perpendicular (left-hand)

  // Pull arrow endpoints inward so they don't punch the centroid labels.
  // 18% shrink on each end works across the typical 80..220 px lengths
  // we see between European country centroids in this projection.
  const shrink = Math.min(60, len * 0.18);
  const ox = parity * 7;             // perpendicular offset (px)

  const sx = x1 + ux * shrink + px * ox;
  const sy = y1 + uy * shrink + py * ox;
  const ex = x2 - ux * shrink + px * ox;
  const ey = y2 - uy * shrink + py * ox;

  const v = borderValue(row, ARROW_METRIC, state.profile);
  const cls = arrowColorClass(v, ARROW_METRIC);
  const markerId = 'arr-' + (cls === 'marg' ? 'marg' : 'nodata');

  const line = layer.append('line')
    .attr('class', 'border-arrow-line ' + cls)
    .attr('x1', sx).attr('y1', sy)
    .attr('x2', ex).attr('y2', ey)
    .attr('marker-end', `url(#${markerId})`);

  // Tooltip: full breakdown for the direction (regardless of selected metric)
  const f = (x) => (x === null || x === undefined) ? '—' : x;
  const tip = row
    ? `${dirLabel}    (${row.d})\n` +
      `DAM spread €/MWh — base ${f(row.sb)} · peak ${f(row.sp)} · off ${f(row.so)}\n` +
      `JAO marginal €/MW — base ${f(row.mb)} · peak ${f(row.mp)} · off ${f(row.mo)}\n` +
      `auction rent (day): ${f(row.r)} €\n` +
      `hours: ${row.hc} (mp ${row.hm}, spread ${row.hs})`
    : `${dirLabel}\nno data for ${state.date}`;
  line.append('title').text(tip);

  // Label at midpoint of the drawn segment (not the full centroid line).
  // Push out a bit further on the perpendicular so it sits clear of the arrow.
  const mx = (sx + ex) / 2 + px * parity * 4;
  const my = (sy + ey) / 2 + py * parity * 4;
  const labelText = fmtArrowValue(v, ARROW_METRIC);
  layer.append('text')
    .attr('class', 'border-arrow-label' + (v === null ? ' nodata' : ''))
    .attr('x', mx).attr('y', my)
    .attr('dy', '0.35em')
    .text(labelText)
    .append('title').text(tip);
}

function renderLegend(scale) {
  const legendEl = document.getElementById('map-legend');
  legendEl.innerHTML = '';
  const stops = scale.domain();
  const grad = document.createElement('span');
  grad.className = 'legend-gradient';
  grad.style.background = `linear-gradient(to right, ${scale.range().join(',')})`;
  legendEl.appendChild(grad);
  const ticksWrap = document.createElement('span');
  ticksWrap.style.display = 'flex'; ticksWrap.style.gap = '6px';
  // Show only min/mid/max for compactness, integers, with €/MWh suffix
  const labels = [stops[0], stops[Math.floor(stops.length / 2)], stops[stops.length - 1]];
  labels.forEach((s, i) => {
    const t = document.createElement('span');
    t.textContent = Math.round(s) + (i === labels.length - 1 ? ' €' : '');
    t.style.fontSize = '10px'; t.style.color = '#5b6471';
    ticksWrap.appendChild(t);
  });
  legendEl.appendChild(ticksWrap);
}

function priceColorScale(values) {
  // Yellow → orange → red gradient anchored to actual visible range.
  // Falls back to a static range if no data yet.
  const palette = ['#fff8d6', '#ffe28a', '#fbb03b', '#f57c1f', '#d04020', '#7a1010'];
  if (!values || !values.length) {
    return d3.scaleLinear().domain([0, 50, 100, 150, 200, 280]).range(palette).clamp(true);
  }
  // Use min..max with a small floor so we don't anchor to negative outliers
  const sorted = [...values].sort((a, b) => a - b);
  const lo = Math.max(0, Math.floor(sorted[0]));
  const hi = Math.ceil(sorted[sorted.length - 1]);
  // Avoid degenerate (lo == hi) case
  const span = Math.max(hi - lo, 1);
  const stops = [0, 0.2, 0.4, 0.6, 0.8, 1].map(t => lo + t * span);
  const scale = d3.scaleLinear().domain(stops).range(palette).clamp(true);
  // Expose domain min/max for the legend
  scale._dataMin = lo;
  scale._dataMax = hi;
  return scale;
}

function renderTable() {
  const tbody = document.getElementById('dam-tbody');
  tbody.innerHTML = '';

  const rows = ZONES.map(z => ({
    zone: z.code,
    name: z.name,
    price: getZonePrice(z.code, state.mode, state.profile),
    mtd:   getZonePriceMTD(z.code),
    ytd:   getZonePriceYTD(z.code),
    group: z.group,
  }));

  // Sort
  const sortDef = window.__sort || { key: 'zone', dir: 'asc' };
  rows.sort((a, b) => {
    let cmp;
    if (sortDef.key === 'zone') cmp = a.zone.localeCompare(b.zone);
    else cmp = ((a[sortDef.key] ?? -Infinity) - (b[sortDef.key] ?? -Infinity));
    return sortDef.dir === 'asc' ? cmp : -cmp;
  });

  for (const r of rows) {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${escapeHtml(r.name)} <span class="zone-code" style="color:#8a93a0; font-size:11px;">(${r.zone})</span></td>
      <td class="num">${fmtCell(r.price)}</td>
      <td class="num">${fmtCell(r.mtd)}</td>
      <td class="num">${fmtCell(r.ytd)}</td>
    `;
    tbody.appendChild(tr);
  }
  document.getElementById('rows-count').textContent = `${rows.length} zones`;
}

function fmtCell(v) {
  if (v == null) return '<span style="color:#cdd2da;">—</span>';
  return fmt(v);
}

// =============================================================
// Helpers
// =============================================================
function todayISO() {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return ymd(d);
}
function ymd(d) {
  return d.toISOString().slice(0, 10);
}
function parseISO(s) {
  return new Date(s + 'T00:00:00Z');
}
function fmt(n) { return n.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
function round2(n) { return Math.round(n * 100) / 100; }
function rndN() { // Box-Muller approx normal
  let u = 0, v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
}
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}
function monthYearLabel(iso) {
  const d = parseISO(iso);
  return d.toLocaleString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' });
}

// Determine if a country feature belongs to "Europe" for our viewport
function isEurope(f) {
  // Approximate bounding box check from Mike Bostock world atlas centroids
  const path = d3.geoPath();
  const c = d3.geoCentroid(f);
  if (!c) return false;
  const [lon, lat] = c;
  return lon >= -25 && lon <= 45 && lat >= 33 && lat <= 72;
}

// ISO numeric to ISO3 mapping for the zones we render (minimal, expandable)
const isoNum2Iso3 = {
  // Europe — only the ones we need labels/coloring for
  '008': 'ALB','040': 'AUT','056': 'BEL','070': 'BIH','100': 'BGR',
  '112': 'BLR','191': 'HRV','196': 'CYP','203': 'CZE','208': 'DNK',
  '233': 'EST','246': 'FIN','250': 'FRA','276': 'DEU','300': 'GRC',
  '348': 'HUN','352': 'ISL','372': 'IRL','380': 'ITA','428': 'LVA',
  '440': 'LTU','442': 'LUX','470': 'MLT','492': 'MCO','498': 'MDA',
  '499': 'MNE','528': 'NLD','578': 'NOR','616': 'POL','620': 'PRT',
  '642': 'ROU','643': 'RUS','688': 'SRB','703': 'SVK','705': 'SVN',
  '724': 'ESP','752': 'SWE','756': 'CHE','792': 'TUR','804': 'UKR',
  '826': 'GBR','807': 'MKD',
  // Numeric IDs in topojson use numeric strings
  8:'ALB',40:'AUT',56:'BEL',70:'BIH',100:'BGR',112:'BLR',191:'HRV',196:'CYP',
  203:'CZE',208:'DNK',233:'EST',246:'FIN',250:'FRA',276:'DEU',300:'GRC',
  348:'HUN',352:'ISL',372:'IRL',380:'ITA',428:'LVA',440:'LTU',442:'LUX',
  470:'MLT',492:'MCO',498:'MDA',499:'MNE',528:'NLD',578:'NOR',616:'POL',
  620:'PRT',642:'ROU',643:'RUS',688:'SRB',703:'SVK',705:'SVN',724:'ESP',
  752:'SWE',756:'CHE',792:'TUR',804:'UKR',826:'GBR',807:'MKD',
};
