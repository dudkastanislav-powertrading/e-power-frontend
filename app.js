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
  // Central/Western additions (2026-05-19) — SDAC zones, CET/CEST
  { code: 'AT',      name: 'Austria',         iso3: 'AUT', baselevel: 121, vol: 26, season: 0.22, group: 'Central' },
  { code: 'CZ',      name: 'Czechia',         iso3: 'CZE', baselevel: 120, vol: 25, season: 0.20, group: 'Central' },
  { code: 'FR',      name: 'France',          iso3: 'FRA', baselevel:  95, vol: 28, season: 0.24, group: 'Western' },
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

// Hand-tuned border midpoints [lon, lat] — a representative point ON the
// shared border, at a known crossing where possible. Using these is more
// reliable than computing topojson.mesh intersections at runtime, and we
// only have ~12 borders to maintain. Coordinates approximate (±10 km is
// fine; arrow length is ~40 px regardless).
const BORDER_MIDPOINTS = {
  'PL-UA': [23.85, 50.50],   // SE Polish border (Hrubieszów / Lviv region)
  'SK-UA': [22.30, 48.85],   // Vyšné Nemecké – Uzhhorod
  'HU-UA': [22.60, 48.40],   // Záhony – Chop
  'RO-UA': [25.20, 47.95],   // Siret – Porubne (Bukovina)
  'MD-UA': [28.70, 48.05],   // central MD-UA frontier
  'HU-RS': [19.45, 46.10],   // Subotica
  'RO-RS': [22.40, 44.65],   // Iron Gates / Đerdap
  'BG-RS': [22.55, 43.30],   // Kalotina / Dimitrovgrad
  'HR-RS': [19.10, 45.20],   // Erdut – Bogojevo
  'BA-RS': [19.00, 44.40],   // Drina river crossing
  'ME-RS': [19.50, 43.20],   // Boljare – Brodarevo
  'MK-RS': [21.65, 42.30],   // Tabanovce – Preševo
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
  // AT/CZ/FR — added 2026-05-19. Active SDAC borders with JAO DA auctions.
  { border: 'AT-DE-LU',   zones: ['AT', 'DE-LU'] },
  { border: 'AT-CZ',      zones: ['AT', 'CZ'] },
  { border: 'AT-HU',      zones: ['AT', 'HU'] },
  { border: 'AT-SI',      zones: ['AT', 'SI'] },
  { border: 'AT-IT-NORD', zones: ['AT', 'IT-NORD'] },
  { border: 'CZ-DE-LU',   zones: ['CZ', 'DE-LU'] },
  { border: 'CZ-PL',      zones: ['CZ', 'PL'] },
  { border: 'CZ-SK',      zones: ['CZ', 'SK'] },
  { border: 'DE-LU-FR',   zones: ['DE-LU', 'FR'] },
  { border: 'ES-FR',      zones: ['ES', 'FR'] },
  { border: 'FR-IT-NORD', zones: ['FR', 'IT-NORD'] },
];

// =============================================================
// State
// =============================================================
const state = {
  mode: 'day',                // day | mtd | ytd | custom
  date: todayISO(),           // selected day for mode=day
  // year/monthIdx track the active selection for MTD / YTD modes.
  // monthIdx is 0..11 (Date.getUTCMonth() convention).
  year: new Date().getUTCFullYear(),
  monthIdx: new Date().getUTCMonth(),
  fullYear: false,            // YTD mode: false = running YTD, true = whole calendar year
  rangeFrom: null,
  rangeTo: null,
  profile: 'baseload',        // baseload | peak | offpeak | tb2 | tb4
  data: null,                 // Map<zone, [ {date, mean, peak, offpeak, tb2, tb4} ]>
  geo: null,                  // loaded TopoJSON
  borders: null,              // Map< `${border}|${direction}|${date}` -> row >
  // UI layer toggles + map navigation
  showFlows: false,           // cross-border arrows off by default
  showLabels: true,           // country code + price on map
  zoomTransform: null,        // d3.zoomTransform from d3.zoom
  selectedIso3: null,         // ISO3 of country currently shown in detail panel
};

// How many cross-border arrows to render when flows layer is ON.
// Keeps the map readable — we pick top N borders by |spread|.
const TOP_N_BORDERS = 10;

// Region presets — used by [CEE] [SEE] [Italy] [Iberia] buttons.
// Each value is { centerLon, centerLat, scale } in projection coords.
// scale multiplies the base projection.scale() of 720.
const REGION_PRESETS = {
  all:    { k: 1.0, x: 450, y: 305 },
  cee:    { k: 2.0, x: 250, y: 100 },   // Poland / Czechia / Hungary
  see:    { k: 2.3, x: 200, y: -150 },  // Balkans
  italy:  { k: 2.4, x: 150, y:  -50 },
  iberia: { k: 2.1, x: 700, y:  -80 },
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

  // Reshape: { zone -> [ {date, mean, peak, offpeak, tb2, tb4} ] }
  // Schema v3: rows are { z, d, m, p, o, t2, t4 }
  // Schema v2: rows are { z, d, m, p, o } (TB2/TB4 unavailable)
  // Schema v1: { zone, date, mean_eur, peak_eur, offpeak_eur }
  const sv = daily.schema_version || 1;
  const compact = (sv >= 2);
  const fZone = compact ? 'z' : 'zone';
  const fDate = compact ? 'd' : 'date';
  const fMean = compact ? 'm' : 'mean_eur';
  const fPeak = compact ? 'p' : 'peak_eur';
  const fOff  = compact ? 'o' : 'offpeak_eur';
  const fTb2  = sv >= 3 ? 't2' : null;
  const fTb4  = sv >= 3 ? 't4' : null;
  const map = new Map();
  for (const r of daily.rows) {
    const z = r[fZone];
    if (!map.has(z)) map.set(z, []);
    map.get(z).push({
      date: r[fDate],
      mean: r[fMean],
      peak: r[fPeak],
      offpeak: r[fOff],
      tb2: fTb2 ? r[fTb2] : null,
      tb4: fTb4 ? r[fTb4] : null,
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
    // Sync month/year pickers to the latest available month so opening
    // MTD/YTD tabs shows current data instead of a future-empty month.
    const md = parseISO(maxDate);
    state.year = md.getUTCFullYear();
    state.monthIdx = md.getUTCMonth();
    const monthSel = document.getElementById('dam-month');
    const yearSel  = document.getElementById('dam-year');
    if (monthSel) monthSel.value = `${state.year}-${String(state.monthIdx + 1).padStart(2, '0')}`;
    if (yearSel)  yearSel.value  = String(state.year);
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

  // Profile buttons
  document.querySelectorAll('.profile-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.profile-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.profile = btn.dataset.profile;
      rerender();
    });
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

  // Month picker — last 24 months down to 2021-01
  const monthSel = document.getElementById('dam-month');
  monthSel.innerHTML = '';
  const earliest = new Date(Date.UTC(2021, 0, 1));
  const now = new Date();
  const startY = now.getUTCFullYear(), startM = now.getUTCMonth();
  const months = [];
  for (let y = startY; y >= earliest.getUTCFullYear(); y--) {
    const mLast = (y === startY) ? startM : 11;
    const mFirst = (y === earliest.getUTCFullYear()) ? earliest.getUTCMonth() : 0;
    for (let m = mLast; m >= mFirst; m--) months.push({ y, m });
  }
  for (const { y, m } of months) {
    const opt = document.createElement('option');
    opt.value = `${y}-${String(m + 1).padStart(2, '0')}`;
    opt.textContent = new Date(Date.UTC(y, m, 1))
      .toLocaleString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' });
    monthSel.appendChild(opt);
  }
  monthSel.value = `${state.year}-${String(state.monthIdx + 1).padStart(2, '0')}`;
  monthSel.addEventListener('change', (e) => {
    const [y, m] = e.target.value.split('-').map(Number);
    state.year = y;
    state.monthIdx = m - 1;
    rerender();
  });

  // Year picker — 2021..current
  const yearSel = document.getElementById('dam-year');
  yearSel.innerHTML = '';
  for (let y = startY; y >= earliest.getUTCFullYear(); y--) {
    const opt = document.createElement('option');
    opt.value = String(y);
    opt.textContent = String(y);
    yearSel.appendChild(opt);
  }
  yearSel.value = String(state.year);
  yearSel.addEventListener('change', (e) => {
    state.year = Number(e.target.value);
    rerender();
  });

  // Full-year toggle (YTD mode)
  const fyBtn = document.getElementById('dam-fullyear-toggle');
  fyBtn.addEventListener('click', () => {
    state.fullYear = !state.fullYear;
    fyBtn.setAttribute('aria-pressed', String(state.fullYear));
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

  // --- Layer toggles (Prices / Cross-border / Labels) -----------------
  document.querySelectorAll('.layer-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const layer = btn.dataset.layer;
      if (layer === 'prices') {
        // Prices layer is always on (it's the primary view). Button is
        // decorative — clicking it just confirms the active state.
        btn.classList.add('active');
      } else if (layer === 'flows') {
        state.showFlows = !state.showFlows;
        btn.classList.toggle('active', state.showFlows);
      } else if (layer === 'labels') {
        state.showLabels = !state.showLabels;
        btn.classList.toggle('active', state.showLabels);
        btn.setAttribute('aria-pressed', state.showLabels ? 'true' : 'false');
      }
      if (state.geo) renderMap();
    });
  });

  // --- Region preset buttons -----------------------------------------
  document.querySelectorAll('.region-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.region-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const preset = REGION_PRESETS[btn.dataset.region] || REGION_PRESETS.all;
      const t = d3.zoomIdentity.translate(450 - preset.x * preset.k, 305 - preset.y * preset.k).scale(preset.k);
      d3.select('#europe-map').transition().duration(450).call(window.__zoomBehavior.transform, t);
    });
  });

  // --- Zoom buttons --------------------------------------------------
  document.getElementById('zoom-in').addEventListener('click', () => {
    d3.select('#europe-map').transition().duration(250).call(window.__zoomBehavior.scaleBy, 1.4);
  });
  document.getElementById('zoom-out').addEventListener('click', () => {
    d3.select('#europe-map').transition().duration(250).call(window.__zoomBehavior.scaleBy, 1 / 1.4);
  });
  document.getElementById('zoom-reset').addEventListener('click', () => {
    document.querySelectorAll('.region-btn').forEach(b => b.classList.toggle('active', b.dataset.region === 'all'));
    d3.select('#europe-map').transition().duration(400).call(window.__zoomBehavior.transform, d3.zoomIdentity);
  });

  // --- Detail panel close --------------------------------------------
  document.getElementById('detail-close').addEventListener('click', () => {
    closeDetailPanel();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeDetailPanel();
  });
}

function toggleControls() {
  // Day picker — shown in Day and Custom modes (Custom uses from/to, Day just date)
  document.getElementById('control-day').classList.toggle('hidden', state.mode !== 'day');
  // Month picker — shown in MTD mode
  document.getElementById('control-month').classList.toggle('hidden', state.mode !== 'mtd');
  // Year picker + Full-year toggle — shown in YTD mode
  document.getElementById('control-year').classList.toggle('hidden', state.mode !== 'ytd');
  document.getElementById('control-fullyear').classList.toggle('hidden', state.mode !== 'ytd');
  // Custom from/to
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
// Map a profile key to the field name on a daily row.
function profileField(profile) {
  switch (profile) {
    case 'peak':    return 'peak';
    case 'offpeak': return 'offpeak';
    case 'tb2':     return 'tb2';
    case 'tb4':     return 'tb4';
    case 'baseload':
    default:        return 'mean';
  }
}

function getZonePrice(zoneCode, mode, profile) {
  const series = state.data.get(zoneCode);
  if (!series || series.length === 0) return null;
  const field = profileField(profile);
  let slice;
  if (mode === 'day') {
    const row = series.find(r => r.date === state.date);
    if (!row) return null;
    // Fall back to mean only for peak/offpeak — TB2/TB4 are not derivable
    // from the mean, so they show as "no data" if absent on the row.
    if (row[field] != null) return row[field];
    if (field === 'peak' || field === 'offpeak') return row.mean;
    return null;
  }
  if (mode === 'mtd') {
    // Use state.year/monthIdx (set by the month picker) instead of
    // deriving from state.date, so MTD can stand on its own.
    slice = series.filter(r => {
      const d = parseISO(r.date);
      return d.getUTCMonth() === state.monthIdx
          && d.getUTCFullYear() === state.year;
    });
    // For the current month, cap at today (running MTD)
    const today = parseISO(todayISO());
    if (state.year === today.getUTCFullYear() && state.monthIdx === today.getUTCMonth()) {
      slice = slice.filter(r => parseISO(r.date) <= today);
    }
  } else if (mode === 'ytd') {
    slice = series.filter(r => parseISO(r.date).getUTCFullYear() === state.year);
    if (!state.fullYear) {
      // Running YTD: trim to today (if selected year is current year)
      const today = parseISO(todayISO());
      if (state.year === today.getUTCFullYear()) {
        slice = slice.filter(r => parseISO(r.date) <= today);
      }
    }
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
  const field = profileField(profile);
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

// Average of a series field, skipping nulls.
// peak/offpeak fall back to mean when all values are null (partial day);
// tb2/tb4 do NOT fall back — they're a derived metric, not a substitute
// for mean, so it would be misleading.
function avgField(slice, field) {
  let sum = 0, n = 0;
  for (const r of slice) {
    if (r[field] != null) { sum += r[field]; n++; }
  }
  if (n > 0) return round2(sum / n);
  if (field !== 'peak' && field !== 'offpeak') return null;
  // Fallback for peak/offpeak only: average of mean column.
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
  const profileLabel = ({
    baseload: 'baseload', peak: 'peak', offpeak: 'off-peak',
    tb2: 'TB2 spread', tb4: 'TB4 spread',
  })[state.profile] || state.profile;
  let label;
  if (state.mode === 'day') {
    label = `Day-ahead ${profileLabel} prices for ${state.date}`;
  } else if (state.mode === 'mtd') {
    const monthName = new Date(Date.UTC(state.year, state.monthIdx, 1))
      .toLocaleString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' });
    label = `Day-ahead ${profileLabel} prices · month-to-date (${monthName})`;
  } else if (state.mode === 'ytd') {
    label = `Day-ahead ${profileLabel} prices · ${state.fullYear ? `full year ${state.year}` : `year-to-date (${state.year})`}`;
  } else {
    label = `Day-ahead ${profileLabel} prices · ${state.rangeFrom} → ${state.rangeTo}`;
  }
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
  const visibleValues = Array.from(COLORED_ISO3)
    .map(iso3 => getCountryPrice(iso3, state.mode, state.profile))
    .filter(v => v != null);
  const colorScale = priceColorScale(visibleValues);

  // Root zoom-wrap group — all map content lives here so d3.zoom can
  // transform the whole layer cohesively (countries, labels, arrows).
  const zoomWrap = svg.append('g').attr('class', 'zoom-wrap');

  // Set up d3.zoom on the svg (only once per page life — we stash it on
  // window so the [+] [–] [Reset] buttons can call it).
  if (!window.__zoomBehavior) {
    const zoom = d3.zoom()
      .scaleExtent([1, 8])
      .translateExtent([[-200, -200], [1100, 800]])
      .filter((event) => {
        // Always allow wheel zoom; don't pan when starting on a country
        // path (that's a click for the detail panel).
        if (event.type === 'wheel') return true;
        return !event.target.classList || !event.target.classList.contains('country-path');
      })
      .on('zoom', (event) => {
        d3.select('.zoom-wrap').attr('transform', event.transform);
        state.zoomTransform = event.transform;
      });
    svg.call(zoom);
    window.__zoomBehavior = zoom;
  } else if (state.zoomTransform) {
    // Restore previous zoom level when re-rendering (mode/profile change)
    zoomWrap.attr('transform', state.zoomTransform);
  }

  // Country shapes
  const g = zoomWrap.append('g').attr('class', 'countries-layer');
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
      .on('click', (event, f) => {
        const iso3 = isoNum2Iso3[f.id];
        if (iso3 && COLORED_ISO3.has(iso3)) {
          showDetailPanel(iso3, f.properties.name);
          event.stopPropagation();
        }
      })
      .append('title')
        .text(f => {
          const iso3 = isoNum2Iso3[f.id] || null;
          if (!iso3 || !COLORED_ISO3.has(iso3)) return f.properties.name;
          const v = getCountryPrice(iso3, state.mode, state.profile);
          return `${f.properties.name}: ${v == null ? 'no data' : fmt(v) + ' €/MWh'}\nClick for details`;
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

  // Country labels — compact: 2-letter code + price.
  // Labels live inside zoomWrap so they zoom/pan with the map.
  if (state.showLabels) {
    const labelData = eu
      .filter(f => COLORED_ISO3.has(isoNum2Iso3[f.id] || ''))
      .map(f => {
        const iso3 = isoNum2Iso3[f.id];
        const c = path.centroid(f);
        return {
          iso3,
          name: f.properties.name,
          code: iso3ToShortCode(iso3),
          v: getCountryPrice(iso3, state.mode, state.profile),
          x: c[0], y: c[1],
        };
      });

    zoomWrap.append('g').attr('class', 'labels-layer')
      .selectAll('text')
      .data(labelData)
      .join('text')
        .attr('class', 'country-label')
        .attr('transform', d => `translate(${d.x},${d.y})`)
        .each(function(d) {
          const sel = d3.select(this);
          sel.append('tspan').attr('x', 0).attr('dy', '-0.2em').attr('class', 'code')
             .text(d.code);
          sel.append('tspan').attr('x', 0).attr('dy', '1.05em').attr('class', 'price')
             .text(d.v == null ? '—' : Math.round(d.v) + '€');
        });
  }

  // Cross-border arrows intentionally not rendered on the map.
  // Per-country neighbor spreads are still available via the
  // detail panel (click any country).

  // Legend
  renderLegend(colorScale);
}

// Short, readable code shown on the map. ISO3 → 2-letter for the well-known
// European countries; falls back to ISO3 for anything obscure.
function iso3ToShortCode(iso3) {
  const map = {
    UKR: 'UA', POL: 'PL', ROU: 'RO', HUN: 'HU', SVK: 'SK',
    GRC: 'GR', BGR: 'BG', HRV: 'HR', SVN: 'SI', SRB: 'RS',
    ITA: 'IT', DEU: 'DE', ESP: 'ES', AUT: 'AT', CZE: 'CZ',
    FRA: 'FR', MDA: 'MD', BIH: 'BA', MNE: 'ME', MKD: 'MK',
  };
  return map[iso3] || iso3;
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
    ? { baseload: 'mb', peak: 'mp', offpeak: 'mo', tb2: 'm2', tb4: 'm4' }
    : { baseload: 'sb', peak: 'sp', offpeak: 'so' /* spread TB2/TB4 not in schema yet */ };
  const key = map[profile];
  if (!key) return null;
  const v = row[key];
  return (v === null || v === undefined) ? null : v;
}

// Format an arrow label tight enough to fit on the arrow body.
// Marginal is always positive; spread is signed. Examples: 0.8, 3.7, 12, 143.
function fmtArrowValue(v, metric) {
  if (v === null || v === undefined) return '—';
  const abs = Math.abs(v);
  let digits;
  if (abs >= 100)      digits = 0;
  else if (abs >= 10)  digits = 0;
  else if (abs >= 1)   digits = 1;
  else                 digits = 2;            // sub-1 values get 2 decimals so "0.8" not "0.81"
  if (abs < 1 && abs > 0) digits = 1;          // override: keep all sub-1 to 1 decimal
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

function renderBorderArrows(svg, euFeatures, path, projection) {
  // Map ISO3 -> projected centroid. Used as a direction hint only.
  const iso2centroid = new Map();
  for (const f of euFeatures) {
    const iso3 = isoNum2Iso3[f.id];
    if (!iso3) continue;
    const c = path.centroid(f);
    if (c && isFinite(c[0]) && isFinite(c[1])) iso2centroid.set(iso3, c);
  }

  const layer = svg.append('g').attr('class', 'arrows-layer');

  // Build the candidate list first so we can rank by |value| and keep only
  // the top N — readable map > exhaustive coverage. Rest can be inspected
  // by clicking individual countries (detail panel shows all neighbors).
  const candidates = [];
  for (const b of BORDERS_TO_RENDER) {
    const [zA, zB] = b.zones;
    const isoA = ZONE_TO_ISO3[zA], isoB = ZONE_TO_ISO3[zB];
    const cA = iso2centroid.get(isoA), cB = iso2centroid.get(isoB);
    const midLonLat = BORDER_MIDPOINTS[b.border];
    if (!cA || !cB || !midLonLat) continue;
    const m = projection(midLonLat);
    if (!m || !isFinite(m[0]) || !isFinite(m[1])) continue;

    const dirAB = `${zA}>${zB}`;
    const dirBA = `${zB}>${zA}`;
    const rowAB = state.borders ? state.borders.get(`${b.border}|${dirAB}|${state.date}`) : null;
    const rowBA = state.borders ? state.borders.get(`${b.border}|${dirBA}|${state.date}`) : null;

    const vAB = borderValue(rowAB, ARROW_METRIC, state.profile);
    const vBA = borderValue(rowBA, ARROW_METRIC, state.profile);
    const rank = Math.max(vAB == null ? 0 : Math.abs(vAB), vBA == null ? 0 : Math.abs(vBA));

    candidates.push({ b, m, cA, cB, rowAB, rowBA, dirAB, dirBA, rank });
  }

  // Sort by rank (largest first) and take top N
  candidates.sort((a, b) => b.rank - a.rank);
  const visible = candidates.slice(0, TOP_N_BORDERS);

  for (const c of visible) {
    drawBorderPair(layer, c.m, c.cA, c.cB, c.rowAB, c.rowBA, c.dirAB, c.dirBA);
  }
}

// ---- arrow geometry ----------------------------------------------
// Each arrow is a filled SVG path: thick rectangular body + wider triangular
// head. Dimensions tuned to the user's reference (large, readable, visible
// over any country fill). Two arrows per border sit side-by-side along the
// shared-border axis with a small gap.
const ARROW_LEN       = 72;   // total tail→tip length
const ARROW_W_BODY    = 22;   // rectangular body width
const ARROW_W_HEAD    = 34;   // arrowhead base width (must be > W_BODY)
const ARROW_HEAD_LEN  = 22;   // arrowhead length (along the arrow axis)
const ARROW_PAIR_GAP  = 6;    // perpendicular gap between the two paired arrows

// Build the path string for a single filled arrow centered at (cx,cy),
// pointing along unit (ux,uy). Vertices traced clockwise starting at tip.
function arrowPathD(cx, cy, ux, uy) {
  const px = -uy, py = ux;            // perpendicular (left side of arrow)
  const L = ARROW_LEN, H = ARROW_HEAD_LEN;
  const Wh = ARROW_W_HEAD, Wb = ARROW_W_BODY;
  // Distance from center to tip / tail / neck along the arrow axis
  const t = L / 2;          // tip
  const n = L / 2 - H;      // neck (where head meets body)
  const b = -L / 2;         // back (tail)
  // Half-widths
  const hH = Wh / 2;
  const hB = Wb / 2;
  // Point helper
  const P = (along, across) =>
    `${(cx + ux * along + px * across).toFixed(2)},${(cy + uy * along + py * across).toFixed(2)}`;
  return [
    `M${P(t,    0)}`,         // tip
    `L${P(n,  +hH)}`,         // head-right base
    `L${P(n,  +hB)}`,         // neck-right (step in to body width)
    `L${P(b,  +hB)}`,         // tail-right
    `L${P(b,  -hB)}`,         // tail-left
    `L${P(n,  -hB)}`,         // neck-left
    `L${P(n,  -hH)}`,         // head-left base
    'Z',
  ].join(' ');
}

// Body center in screen coords — where the price label lands.
// Body extends along the arrow axis from -L/2 (tail) to L/2 - H (neck);
// midpoint = -H/2.
function arrowBodyCenter(cx, cy, ux, uy) {
  const offsetAlong = -ARROW_HEAD_LEN / 2;
  return [cx + ux * offsetAlong, cy + uy * offsetAlong];
}

// Draw the pair of arrows at a border midpoint.
function drawBorderPair(layer, m, cA, cB, rowAB, rowBA, dirAB, dirBA) {
  const [mx, my] = m;
  const dx = cB[0] - cA[0], dy = cB[1] - cA[1];
  const dist = Math.hypot(dx, dy);
  if (dist < 1) return;
  const ux = dx / dist, uy = dy / dist;     // unit vector A→B
  const px = -uy,        py = ux;            // perpendicular (along border)

  // Each arrow is offset perpendicular by (W_head + gap) / 2 from the midpoint
  // so they sit side-by-side without overlapping.
  const halfOffset = (ARROW_W_HEAD + ARROW_PAIR_GAP) / 2;
  const aCx = mx + px * halfOffset, aCy = my + py * halfOffset;
  const bCx = mx - px * halfOffset, bCy = my - py * halfOffset;

  drawFilledArrow(layer, aCx, aCy,  ux,  uy, rowAB, dirAB);
  drawFilledArrow(layer, bCx, bCy, -ux, -uy, rowBA, dirBA);
}

function drawFilledArrow(layer, cx, cy, ux, uy, row, dirLabel) {
  const v = borderValue(row, ARROW_METRIC, state.profile);
  const hasData = (v !== null);
  const cls = hasData ? 'has-data' : 'nodata';

  // Arrow body
  const path = layer.append('path')
    .attr('class', 'border-arrow ' + cls)
    .attr('d', arrowPathD(cx, cy, ux, uy));
  path.append('title').text(tipFor(row, dirLabel));

  // Label centered on the body
  const [bx, by] = arrowBodyCenter(cx, cy, ux, uy);
  const labelText = fmtArrowValue(v, ARROW_METRIC) + (hasData ? '€' : '');
  const text = layer.append('text')
    .attr('class', 'border-arrow-label ' + cls)
    .attr('x', bx).attr('y', by)
    .attr('dy', '0.35em')
    .text(labelText);
  text.append('title').text(tipFor(row, dirLabel));
}

// Tooltip text builder — shared by line + label so hovering either works.
function tipFor(row, dirLabel) {
  const f = (x) => (x === null || x === undefined) ? '—' : x;
  return row
    ? `${dirLabel}    (${row.d})\n` +
      `JAO marginal €/MW — base ${f(row.mb)} · peak ${f(row.mp)} · off ${f(row.mo)}\n` +
      `JAO marginal TB —   TB2 ${f(row.m2)} · TB4 ${f(row.m4)}\n` +
      `DAM spread €/MWh —  base ${f(row.sb)} · peak ${f(row.sp)} · off ${f(row.so)}\n` +
      `auction rent (day): ${f(row.r)} €\n` +
      `hours: ${row.hc} (mp ${row.hm}, spread ${row.hs})`
    : `${dirLabel}\nno data for ${state.date}`;
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
// Detail panel — opens when a country is clicked on the map.
// Shows current-mode price for that country with all profiles
// side by side, a 30-day sparkline, and neighbors with spreads.
// =============================================================
function showDetailPanel(iso3, fullName) {
  state.selectedIso3 = iso3;
  const panel = document.getElementById('zone-detail');
  panel.classList.remove('hidden');
  panel.setAttribute('aria-hidden', 'false');

  document.getElementById('detail-title').textContent = fullName || iso3;

  // List all zones in this country (e.g. Italy has 7 IT-* zones)
  const zones = ZONES.filter(z => z.iso3 === iso3);
  const codes = zones.map(z => z.code).join(', ');
  document.getElementById('detail-subtitle').textContent =
    codes ? `Zones: ${codes}` : iso3;

  // --- Stats grid: current value for each profile ---------------------
  const stats = [
    { label: 'Baseload',  prof: 'baseload' },
    { label: 'Peak',      prof: 'peak'     },
    { label: 'Off-peak',  prof: 'offpeak'  },
    { label: 'TB2 spread',prof: 'tb2'      },
    { label: 'TB4 spread',prof: 'tb4'      },
  ];
  const statsHtml = stats.map(s => {
    const v = getCountryPrice(iso3, state.mode, s.prof);
    const isCurrent = s.prof === state.profile;
    const cls = v == null ? 'muted' : (isCurrent ? '' : 'small');
    const val = v == null ? '—' : fmt(v) + ' €';
    return `
      <div class="detail-stat" style="${isCurrent ? 'border-color:#f5a623;background:#fff8eb;' : ''}">
        <div class="detail-stat-label">${s.label}${isCurrent ? ' ← selected' : ''}</div>
        <div class="detail-stat-value ${cls}">${val}</div>
      </div>`;
  }).join('');
  document.getElementById('detail-stats').innerHTML = statsHtml;

  // --- Sparkline: last 30 days mean -----------------------------------
  // Average over all zones in this country day-by-day.
  const today = todayISO();
  const cutoff = ymd(new Date(Date.now() - 30 * 24 * 3600 * 1000));
  const seriesByDate = new Map();
  for (const z of zones) {
    const arr = state.data && state.data.get(z.code);
    if (!arr) continue;
    for (const r of arr) {
      if (r.date < cutoff || r.date > today) continue;
      if (r.mean == null) continue;
      if (!seriesByDate.has(r.date)) seriesByDate.set(r.date, []);
      seriesByDate.get(r.date).push(r.mean);
    }
  }
  const sparkData = [...seriesByDate.entries()]
    .map(([d, vals]) => ({ d, v: vals.reduce((a, b) => a + b, 0) / vals.length }))
    .sort((a, b) => a.d.localeCompare(b.d));

  const sparkEl = document.getElementById('detail-sparkline');
  if (sparkData.length < 2) {
    sparkEl.innerHTML = '<div class="detail-sparkline-title">30-day trend</div><div style="font-size:12px;color:#8a93a0;">not enough data</div>';
  } else {
    const w = 320, h = 80, pad = 8;
    const xs = d3.scaleLinear().domain([0, sparkData.length - 1]).range([pad, w - pad]);
    const ys = d3.scaleLinear().domain(d3.extent(sparkData, p => p.v)).range([h - pad, pad]);
    const line = d3.line().x((_, i) => xs(i)).y(p => ys(p.v)).curve(d3.curveMonotoneX);
    const lastV = sparkData[sparkData.length - 1].v;
    const firstV = sparkData[0].v;
    const trendCls = lastV > firstV ? 'pos' : (lastV < firstV ? 'neg' : '');
    sparkEl.innerHTML = `
      <div class="detail-sparkline-title">30-day trend (baseload, € / MWh)</div>
      <svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none">
        <path d="${line(sparkData)}" fill="none" stroke="#f5a623" stroke-width="1.8"/>
        <circle cx="${xs(sparkData.length - 1)}" cy="${ys(lastV)}" r="3" fill="#f5a623"/>
        <text x="${w - pad}" y="${pad + 10}" text-anchor="end" font-size="11" font-weight="600" fill="#1f2730">
          ${Math.round(lastV)} €
        </text>
        <text x="${pad}" y="${h - 2}" font-size="9" fill="#8a93a0">${sparkData[0].d}</text>
        <text x="${w - pad}" y="${h - 2}" text-anchor="end" font-size="9" fill="#8a93a0">${sparkData[sparkData.length - 1].d}</text>
      </svg>`;
  }

  // --- Neighbors: cross-border spreads (DAM spread from this country) -
  const neighborsHtml = computeNeighborSpreads(iso3);
  const neighborsEl = document.getElementById('detail-neighbors');
  if (neighborsHtml) {
    neighborsEl.innerHTML = `<h4>Spreads to neighbors (€/MWh)</h4><div class="detail-neighbors-list">${neighborsHtml}</div>`;
  } else {
    neighborsEl.innerHTML = '';
  }
}

function closeDetailPanel() {
  state.selectedIso3 = null;
  const panel = document.getElementById('zone-detail');
  panel.classList.add('hidden');
  panel.setAttribute('aria-hidden', 'true');
}

function computeNeighborSpreads(iso3) {
  // Take this country's mean price (latest available date), compare to
  // each neighbor zone (also latest mean). Sign convention: positive
  // means the neighbor is more expensive than us (export opportunity).
  if (!state.data) return '';
  const myCode = ZONES.find(z => z.iso3 === iso3)?.code;
  if (!myCode) return '';
  const my = lastNonNullMean(myCode);
  if (my == null) return '';

  // List of zone codes considered "neighbors" (anything we share a border
  // with via BORDERS_TO_RENDER, plus all IT-* zones for an Italy view).
  const neighbors = new Set();
  for (const b of BORDERS_TO_RENDER) {
    if (b.zones.includes(myCode)) {
      const other = b.zones.find(z => z !== myCode);
      if (other) neighbors.add(other);
    }
  }

  const rows = [];
  for (const code of neighbors) {
    const v = lastNonNullMean(code);
    if (v == null) continue;
    const spread = v - my;
    const cls = spread > 0.5 ? 'pos' : spread < -0.5 ? 'neg' : '';
    const sign = spread > 0 ? '+' : (spread < 0 ? '−' : '');
    rows.push(`
      <div class="detail-neighbor">
        <span class="detail-neighbor-name">${code}</span>
        <span class="detail-neighbor-spread ${cls}">${sign}${Math.abs(spread).toFixed(1)} €</span>
      </div>`);
  }
  rows.sort();
  return rows.join('');
}

function lastNonNullMean(zoneCode) {
  const arr = state.data && state.data.get(zoneCode);
  if (!arr || !arr.length) return null;
  for (let i = arr.length - 1; i >= 0; i--) {
    if (arr[i].mean != null) return arr[i].mean;
  }
  return null;
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
