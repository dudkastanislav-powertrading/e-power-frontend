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

  // Re-render the chart-heavy views on window resize so SVG viewBoxes
  // stay 1:1 with their container pixels. Debounced to avoid thrashing.
  let __resizeTimer = null;
  window.addEventListener('resize', () => {
    if (__resizeTimer) clearTimeout(__resizeTimer);
    __resizeTimer = setTimeout(() => {
      const spreadsVisible = !document.getElementById('spreads-view').classList.contains('hidden');
      const genPanel = document.getElementById('generation-view');
      const genVisible = genPanel && !genPanel.classList.contains('hidden');
      if (spreadsVisible && state.spreads && state.spreads.isInit) {
        try { renderSpreads(); } catch (e) { console.warn(e); }
      }
      if (genVisible && state.gen && state.gen.isInit) {
        try { renderGen(); } catch (e) { console.warn(e); }
      }
      const pdPanel2 = document.getElementById('dynamics-view');
      const pdVisible = pdPanel2 && !pdPanel2.classList.contains('hidden');
      if (pdVisible && state.pd && state.pd.isInit) {
        try { renderDynamics(); } catch (e) { console.warn(e); }
      }
    }, 200);
  });
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

  // Hourly border data feeds the JAO marginal-price line overlay on the
  // Market Spreads tab. Structure: borders[border][direction] →
  // Map(`${date}|${hour}` → {spread, marginal}). 404 / parse errors are
  // non-fatal — the overlay just won't render.
  try {
    if (manifest.datasets && manifest.datasets.border_hourly) {
      const bhpath = './data/' + manifest.datasets.border_hourly.path;
      const bhres = await fetch(bhpath, { cache: 'no-cache' });
      if (bhres.ok) {
        const bhjson = await bhres.json();
        // bhjson.borders = { "PL-DE_LU": { "PL>DE_LU": [{d,h,spread,marginal}, ...] } }
        const idx = new Map();   // `${border}|${dir}|${date}|${hour}` → {spread, marginal}
        const byPair = new Map();// `${border}|${dir}` → array, for iteration
        const bs = bhjson.borders || {};
        for (const b of Object.keys(bs)) {
          for (const dir of Object.keys(bs[b])) {
            const arr = bs[b][dir] || [];
            byPair.set(`${b}|${dir}`, arr);
            for (const r of arr) {
              idx.set(`${b}|${dir}|${r.d}|${r.h}`, r);
            }
          }
        }
        state.borderHourly = { idx, byPair };
      }
    }
  } catch (e) {
    console.warn('border_hourly.json load failed (non-fatal):', e);
  }

  // Reshape: { zone -> [ {date, mean, peak, offpeak, tb2, tb4, pv, wind,
  //                       pvVol, windVol} ] }
  // Schema v5: adds wv/sv — daily MWh volume for true volume-weighted
  //            period capture aggregation.
  // Schema v4: rows are { z, d, m, p, o, t2, t4, wp, sl }   (PV/Wind capture)
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
  const fWind = sv >= 4 ? 'wp' : null;
  const fPv   = sv >= 4 ? 'sl' : null;
  const fWv   = sv >= 5 ? 'wv' : null;
  const fSv   = sv >= 5 ? 'sv' : null;
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
      wind: fWind ? r[fWind] : null,
      pv: fPv ? r[fPv] : null,
      windVol: fWv ? r[fWv] : null,
      pvVol:   fSv ? r[fSv] : null,
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

  // Top nav — switch between DAM map and Market Spreads views.
  document.querySelectorAll('.nav-link').forEach(a => {
    a.addEventListener('click', async (e) => {
      e.preventDefault();
      const view = a.dataset.view;
      if (view === 'futures') {
        alert(`"${a.textContent.trim()}" — coming in next iteration.`);
        return;
      }
      document.querySelectorAll('.nav-link').forEach(x => x.classList.remove('active'));
      a.classList.add('active');
      await showView(view);
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

  // --- Zoom buttons --------------------------------------------------
  document.getElementById('zoom-in').addEventListener('click', () => {
    d3.select('#europe-map').transition().duration(250).call(window.__zoomBehavior.scaleBy, 1.4);
  });
  document.getElementById('zoom-out').addEventListener('click', () => {
    d3.select('#europe-map').transition().duration(250).call(window.__zoomBehavior.scaleBy, 1 / 1.4);
  });
  document.getElementById('zoom-reset').addEventListener('click', () => {
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
    case 'pv':      return 'pv';     // solar-weighted capture price
    case 'wind':    return 'wind';   // wind-weighted capture price (B18+B19)
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
  // For PV/Wind, period aggregation must be volume-weighted, not arithmetic.
  if (profile === 'pv' || profile === 'wind') {
    return weightedCapturePrice(slice, profile);
  }
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
  // Volume-weighted aggregate for PV / Wind, arithmetic mean otherwise.
  if (profile === 'pv' || profile === 'wind') {
    return weightedCapturePrice(slice, profile);
  }
  return avgField(slice, field);
}

// True volume-weighted period capture for PV / Wind.
//   period_capture = SUM(daily_capture × daily_volume) / SUM(daily_volume)
// Each day's `pv` / `wind` is already volume-weighted INSIDE that day (24h
// hourly weights); here we weight days against each other by their actual
// MWh produced, so high-production days dominate as they should.
// Returns null if no day has a usable (capture, volume>0) pair.
function weightedCapturePrice(slice, profile) {
  if (profile !== 'pv' && profile !== 'wind') return null;
  const capField = profile;                              // 'pv' or 'wind'
  const volField = profile === 'pv' ? 'pvVol' : 'windVol';
  let num = 0, den = 0;
  for (const r of slice) {
    const v = r[volField];
    const p = r[capField];
    if (v != null && v > 0 && p != null) {
      num += p * v;
      den += v;
    }
  }
  return den > 0 ? round2(num / den) : null;
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
    pv: 'PV capture', wind: 'Wind capture',
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
          // Vertical layout: code (top) → price (mid) → delta (bottom if applicable)
          const showDelta = state.profile !== 'baseload' && d.v != null;
          const baseV = showDelta ? getCountryPrice(d.iso3, state.mode, 'baseload') : null;
          let deltaTxt = null, deltaCls = null;
          if (showDelta && baseV != null && baseV !== 0) {
            const dp = ((d.v - baseV) / Math.abs(baseV)) * 100;
            const sign = dp > 0 ? '+' : (dp < 0 ? '−' : '');
            deltaTxt = `(${sign}${Math.abs(dp).toFixed(0)}%)`;
            deltaCls = dp > 0.5 ? 'delta up' : (dp < -0.5 ? 'delta down' : 'delta flat');
          }
          // Top-align so the block stays centered when 2 or 3 lines.
          const linesCount = (showDelta && deltaTxt) ? 3 : 2;
          const topDy = linesCount === 3 ? '-0.85em' : '-0.2em';
          sel.append('tspan').attr('x', 0).attr('dy', topDy).attr('class', 'code')
             .text(d.code);
          sel.append('tspan').attr('x', 0).attr('dy', '1.05em').attr('class', 'price')
             .text(d.v == null ? '—' : Math.round(d.v) + '€');
          if (deltaTxt) {
            sel.append('tspan').attr('x', 0).attr('dy', '1.05em')
               .attr('class', deltaCls)
               .text(deltaTxt);
          }
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
    { label: 'PV capture',prof: 'pv'       },
    { label: 'Wind capture', prof: 'wind'  },
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

  // --- Sparkline: shape adapts to current mode -----------------------
  // Day:    daily series for the 30 days ending on the selected day
  // MTD:    daily series for every day of the selected month
  // YTD:    monthly aggregates for the 12 months of the selected year
  // Custom: daily for short ranges (<=180d), monthly for longer
  renderDetailSparkline(zones);

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

// =============================================================
// Sparkline that adapts to the currently selected mode.
//   day    → 30-day daily trend ending on state.date
//   mtd    → daily trend for the selected month
//   ytd    → 12 monthly aggregates for state.year
//   custom → daily for ranges ≤180d, monthly otherwise
// Country-level values = average across all zones of the country.
// =============================================================
function renderDetailSparkline(zones) {
  const el = document.getElementById('detail-sparkline');
  if (!el) return;
  if (!zones || !zones.length || !state.data) { el.innerHTML = ''; return; }

  const field = profileField(state.profile);
  const codes = zones.map(z => z.code);

  let points = [];
  let title = '';

  if (state.mode === 'day') {
    const endDate = parseISO(state.date);
    const startDate = new Date(endDate);
    startDate.setUTCDate(startDate.getUTCDate() - 29);
    points = sparkDailyPoints(codes, field, startDate, endDate);
    title = `30-day trend · ending ${state.date}`;
  } else if (state.mode === 'mtd') {
    const startDate = new Date(Date.UTC(state.year, state.monthIdx, 1));
    let endDate = new Date(Date.UTC(state.year, state.monthIdx + 1, 0));
    const today = parseISO(todayISO());
    if (state.year === today.getUTCFullYear() && state.monthIdx === today.getUTCMonth()) {
      endDate = today;
    }
    points = sparkDailyPoints(codes, field, startDate, endDate);
    const monthName = startDate.toLocaleString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' });
    title = `Daily trend · ${monthName}`;
  } else if (state.mode === 'ytd') {
    const today = parseISO(todayISO());
    const endMonth = (!state.fullYear && state.year === today.getUTCFullYear())
      ? today.getUTCMonth() : 11;
    points = sparkMonthlyPointsForYear(codes, field, state.year, endMonth);
    title = `Monthly trend · ${state.year}${state.fullYear ? '' : ' (YTD)'}`;
  } else if (state.mode === 'custom') {
    if (!state.rangeFrom || !state.rangeTo) { el.innerHTML = ''; return; }
    const startDate = parseISO(state.rangeFrom);
    const endDate = parseISO(state.rangeTo);
    const spanDays = Math.round((endDate - startDate) / 86400000) + 1;
    if (spanDays <= 180) {
      points = sparkDailyPoints(codes, field, startDate, endDate);
      title = `Daily trend · ${state.rangeFrom} → ${state.rangeTo}`;
    } else {
      points = sparkMonthlyPointsBetween(codes, field, startDate, endDate);
      title = `Monthly trend · ${state.rangeFrom} → ${state.rangeTo}`;
    }
  }

  const valid = points.filter(p => p.value != null);
  if (valid.length === 0) {
    el.innerHTML = `<div class="detail-sparkline-title">${escapeHtml(title)}</div>
                    <div style="color:#cdd2da;font-size:12px;">No data for this period.</div>`;
    return;
  }

  // SVG sketch — width is responsive via viewBox.
  const W = 280, H = 80, padX = 8, padY = 14;
  const minVal = Math.min(...valid.map(p => p.value));
  const maxVal = Math.max(...valid.map(p => p.value));
  const spanVal = Math.max(maxVal - minVal, 1);
  const N = points.length;
  const xFor = i => padX + (i / Math.max(N - 1, 1)) * (W - 2 * padX);
  const yFor = v => H - padY - ((v - minVal) / spanVal) * (H - 2 * padY);

  let d = '';
  let prevDrawn = false;
  for (let i = 0; i < N; i++) {
    const v = points[i].value;
    if (v == null) { prevDrawn = false; continue; }
    const x = xFor(i), y = yFor(v);
    d += (prevDrawn ? ' L' : ' M') + x.toFixed(1) + ' ' + y.toFixed(1);
    prevDrawn = true;
  }

  // Last valid point: highlighted with a dot + value label
  let lastIdx = -1;
  for (let i = N - 1; i >= 0; i--) {
    if (points[i].value != null) { lastIdx = i; break; }
  }
  const lastDot = lastIdx >= 0
    ? `<circle cx="${xFor(lastIdx).toFixed(1)}" cy="${yFor(points[lastIdx].value).toFixed(1)}" r="3" fill="#f5a623"></circle>
       <text x="${(xFor(lastIdx) - 4).toFixed(1)}" y="${(yFor(points[lastIdx].value) - 6).toFixed(1)}" text-anchor="end" style="font-size:10px;fill:#5b6271;font-weight:600;">${escapeHtml(fmt(points[lastIdx].value))}</text>`
    : '';

  // X-axis tick labels — pick ~4 evenly spaced points
  const tickCount = Math.min(4, N);
  const tickSet = new Set();
  for (let k = 0; k < tickCount; k++) {
    tickSet.add(Math.round((k / Math.max(tickCount - 1, 1)) * (N - 1)));
  }
  const ticksSvg = Array.from(tickSet).map(i => {
    const x = xFor(i).toFixed(1);
    return `<text x="${x}" y="${H - 2}" text-anchor="middle" style="font-size:9px;fill:#8a93a0;">${escapeHtml(points[i].label || '')}</text>`;
  }).join('');

  // Min/max labels stuck to left edge
  const yLabels = `
    <text x="${padX}" y="${(yFor(maxVal) - 3).toFixed(1)}" style="font-size:9px;fill:#8a93a0;">${escapeHtml(fmt(maxVal))}</text>
    <text x="${padX}" y="${(yFor(minVal) + 10).toFixed(1)}" style="font-size:9px;fill:#8a93a0;">${escapeHtml(fmt(minVal))}</text>
  `;

  el.innerHTML = `
    <div class="detail-sparkline-title">${escapeHtml(title)}</div>
    <svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">
      ${yLabels}
      <path d="${d}" fill="none" stroke="#f5a623" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round" />
      ${lastDot}
      ${ticksSvg}
    </svg>
  `;
}

// Average across all zones of the country for a single day's row.
function sparkDayValue(codes, field, dateISO) {
  let sum = 0, n = 0;
  for (const code of codes) {
    const series = state.data.get(code);
    if (!series) continue;
    const row = series.find(r => r.date === dateISO);
    if (!row) continue;
    let v = row[field];
    if (v == null && (field === 'peak' || field === 'offpeak')) v = row.mean;
    if (v != null) { sum += v; n++; }
  }
  return n > 0 ? round2(sum / n) : null;
}

// One point per day in [startDate, endDate].
function sparkDailyPoints(codes, field, startDate, endDate) {
  const out = [];
  const cur = new Date(startDate);
  while (cur <= endDate) {
    const dateISO = ymd(cur);
    const value = sparkDayValue(codes, field, dateISO);
    out.push({
      date: dateISO,
      label: cur.toLocaleString('en-GB', { day: '2-digit', month: 'short', timeZone: 'UTC' }),
      value,
    });
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return out;
}

// Aggregate value over a month for the given country's zones.
function sparkMonthValue(codes, field, year, monthIdx) {
  const sISO = ymd(new Date(Date.UTC(year, monthIdx, 1)));
  const eISO = ymd(new Date(Date.UTC(year, monthIdx + 1, 0)));
  let sum = 0, n = 0;
  for (const code of codes) {
    const series = state.data.get(code);
    if (!series) continue;
    for (const row of series) {
      if (row.date < sISO || row.date > eISO) continue;
      let v = row[field];
      if (v == null && (field === 'peak' || field === 'offpeak')) v = row.mean;
      if (v != null) { sum += v; n++; }
    }
  }
  return n > 0 ? round2(sum / n) : null;
}

// 12 (or fewer) monthly points for a single year.
function sparkMonthlyPointsForYear(codes, field, year, endMonthInclusive) {
  const out = [];
  for (let m = 0; m <= endMonthInclusive; m++) {
    const sd = new Date(Date.UTC(year, m, 1));
    out.push({
      date: ymd(sd),
      label: sd.toLocaleString('en-GB', { month: 'short', timeZone: 'UTC' }),
      value: sparkMonthValue(codes, field, year, m),
    });
  }
  return out;
}

// Monthly points spanning startDate..endDate across calendar months.
function sparkMonthlyPointsBetween(codes, field, startDate, endDate) {
  const out = [];
  let y = startDate.getUTCFullYear();
  let m = startDate.getUTCMonth();
  const endY = endDate.getUTCFullYear();
  const endM = endDate.getUTCMonth();
  while (y < endY || (y === endY && m <= endM)) {
    const sd = new Date(Date.UTC(y, m, 1));
    out.push({
      date: ymd(sd),
      label: sd.toLocaleString('en-GB', { month: 'short', year: '2-digit', timeZone: 'UTC' }),
      value: sparkMonthValue(codes, field, y, m),
    });
    m++;
    if (m > 11) { m = 0; y++; }
  }
  return out;
}

function computeNeighborSpreads(iso3) {
  // Compute mean price for THIS country aggregated over the currently
  // selected window (Day → that day; MTD → that month; YTD → that year;
  // Custom → from..to). Then compute the same for each neighbor and
  // surface the difference.
  // Sign convention: positive means the neighbor is more expensive
  // than us (i.e. export opportunity from our side).
  if (!state.data) return '';
  const my = getCountryPrice(iso3, state.mode, state.profile);
  if (my == null) return '';

  // List of zone codes considered "neighbors" — anything we share a
  // physical border with via BORDERS_TO_RENDER.
  const myZones = ZONES.filter(z => z.iso3 === iso3).map(z => z.code);
  const neighbors = new Set();
  for (const b of BORDERS_TO_RENDER) {
    for (const myCode of myZones) {
      if (b.zones.includes(myCode)) {
        const other = b.zones.find(z => z !== myCode);
        if (other && !myZones.includes(other)) neighbors.add(other);
      }
    }
  }

  // Aggregate neighbor by iso3 (so e.g. PL is one row, not duplicated by zone)
  const seenIso = new Set();
  const rows = [];
  for (const code of neighbors) {
    const otherIso = ZONE_TO_ISO3[code];
    if (!otherIso || seenIso.has(otherIso)) continue;
    seenIso.add(otherIso);
    const v = getCountryPrice(otherIso, state.mode, state.profile);
    if (v == null) continue;
    const spread = v - my;
    const cls = spread > 0.5 ? 'pos' : spread < -0.5 ? 'neg' : '';
    const sign = spread > 0 ? '+' : (spread < 0 ? '−' : '');
    const shortCode = iso3ToShortCode(otherIso);
    rows.push({
      iso: otherIso,
      html: `
        <div class="detail-neighbor">
          <span class="detail-neighbor-name">${shortCode}</span>
          <span class="detail-neighbor-spread ${cls}">${sign}${Math.abs(spread).toFixed(1)} €</span>
        </div>`,
    });
  }
  // Sort by absolute spread descending — biggest opportunities first
  rows.sort((a, b) => {
    const va = parseFloat(a.html.match(/[+−](\d+\.\d+)/)?.[1] || '0');
    const vb = parseFloat(b.html.match(/[+−](\d+\.\d+)/)?.[1] || '0');
    return vb - va;
  });
  return rows.map(r => r.html).join('');
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

// =============================================================
// =============================================================
// MARKET SPREADS TAB
// Two-country hourly DAM spread analysis. Lazy-loaded data files
// dam_hourly_YYYY.json. State is mostly self-contained in
// state.spreads; reuses BORDERS_TO_RENDER and state.borders for
// the JAO marginal-price ("CBC") overlay.
// =============================================================
// =============================================================

state.spreads = {
  isInit: false,
  hourlyByYear: new Map(),     // year -> Map(`${zone}|${date}` -> Array<number>)
  loadedYears: new Set(),
  pendingYearLoads: new Map(), // year -> Promise (dedup concurrent loads)
  availableYears: [],          // from manifest
  zoneA: 'HU',
  zoneB: 'RO',
  spreadType: 'effective',     // effective | full
  svs: 'include',              // include | exclude (only matters for stats; bars stay raw)
  direction: 'a2b',            // a2b | b2a  (sym removed 2026-05-28)
  dayDate: null,
  monthYM: null,               // 'YYYY-MM'
  yearY: null,                 // number
};

// ----- View switching ----------------------------------------
async function showView(view) {
  const isMap = view === 'dam-map';
  const isSpreads = view === 'dam-spreads';
  const isGen = view === 'generation';
  const isPD = view === 'product-dynamics';

  document.querySelector('.map-panel').classList.toggle('hidden', !isMap);
  document.querySelector('.table-panel').classList.toggle('hidden', !isMap);
  // Detail panel stays hidden when leaving map; reopens only via clicks
  if (!isMap) {
    document.querySelector('.zone-detail-panel').classList.add('hidden');
  }
  document.getElementById('spreads-view').classList.toggle('hidden', !isSpreads);
  const genPanel = document.getElementById('generation-view');
  if (genPanel) genPanel.classList.toggle('hidden', !isGen);
  const pdPanel = document.getElementById('dynamics-view');
  if (pdPanel) pdPanel.classList.toggle('hidden', !isPD);

  if (isSpreads) {
    await initSpreadsView();
    renderSpreads();
  }
  if (isGen) {
    await initGenView();
    renderGen();
  }
  if (isPD) {
    try {
      await initDynamicsView();
      renderDynamics();
    } catch (e) {
      console.error('[product-dynamics]', e);
      const st = document.getElementById('pd-status');
      if (st) {
        st.textContent = 'Render error: ' + (e && e.message || e) + ' — open browser console for stack.';
        st.classList.remove('hidden');
        st.classList.add('error');
      }
    }
  }
}

// Make .hidden = display:none for map-panel/table-panel via inline style
// (the existing CSS only applies .hidden to specific overlays). We need
// it to work universally inside the spreads view, so:
(function injectHiddenRule() {
  const css = `.map-panel.hidden, .table-panel.hidden { display: none !important; }`;
  const tag = document.createElement('style');
  tag.textContent = css;
  document.head.appendChild(tag);
})();

// ----- Init -------------------------------------------------
async function initSpreadsView() {
  if (state.spreads.isInit) return;
  populateSpreadsSelects();
  initSpreadsDefaults();
  bindSpreadsControls();
  state.spreads.isInit = true;
  await loadSpreadsManifest();
  // Pre-load the year for the default day so the first render has data.
  if (state.spreads.dayDate) {
    await loadHourlyYear(yearOfISO(state.spreads.dayDate));
  }
}

function populateSpreadsSelects() {
  const sortedZones = ZONES.slice().sort((a, b) => a.code.localeCompare(b.code));
  const aSel = document.getElementById('sp-zone-a');
  const bSel = document.getElementById('sp-zone-b');
  for (const sel of [aSel, bSel]) {
    sel.innerHTML = '';
    for (const z of sortedZones) {
      const opt = document.createElement('option');
      opt.value = z.code;
      opt.textContent = `${z.code} — ${z.name}`;
      sel.appendChild(opt);
    }
  }
  aSel.value = state.spreads.zoneA;
  bSel.value = state.spreads.zoneB;
}

function initSpreadsDefaults() {
  // Day default: latest data we have (from state.date which is capped to maxDate)
  state.spreads.dayDate = state.date || todayISO();
  document.getElementById('sp-day-date').value = state.spreads.dayDate;

  // Month default: month of dayDate
  const d = parseISO(state.spreads.dayDate);
  const ym = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
  state.spreads.monthYM = ym;
  document.getElementById('sp-month-pick').value = ym;

  // Year default: current year of dayDate
  state.spreads.yearY = d.getUTCFullYear();
}

function bindSpreadsControls() {
  // When the user picks a different pair, reset direction to a2b so the
  // toolbar isn't stuck on a stale b2a setting from the previous pair.
  function resetDirToA2B() {
    state.spreads.direction = 'a2b';
    document.querySelectorAll('[data-sp-dir]').forEach(b => {
      b.classList.toggle('active', b.dataset.spDir === 'a2b');
    });
  }
  document.getElementById('sp-zone-a').addEventListener('change', async (e) => {
    state.spreads.zoneA = e.target.value;
    resetDirToA2B();
    await ensureNeededYearsLoaded();
    renderSpreads();
  });
  document.getElementById('sp-zone-b').addEventListener('change', async (e) => {
    state.spreads.zoneB = e.target.value;
    resetDirToA2B();
    await ensureNeededYearsLoaded();
    renderSpreads();
  });

  // Toggles
  document.querySelectorAll('[data-spread-type]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('[data-spread-type]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.spreads.spreadType = btn.dataset.spreadType;
      renderSpreads();
    });
  });
  document.querySelectorAll('[data-svs]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('[data-svs]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.spreads.svs = btn.dataset.svs;
      renderSpreads();
    });
  });
  document.querySelectorAll('[data-sp-dir]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('[data-sp-dir]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.spreads.direction = btn.dataset.spDir;
      renderSpreads();
    });
  });

  // Date pickers
  document.getElementById('sp-day-date').addEventListener('change', async (e) => {
    state.spreads.dayDate = e.target.value;
    await ensureNeededYearsLoaded();
    renderSpreads();
  });
  document.getElementById('sp-month-pick').addEventListener('change', async (e) => {
    state.spreads.monthYM = e.target.value;
    await ensureNeededYearsLoaded();
    renderSpreads();
  });
  document.getElementById('sp-year-pick').addEventListener('change', async (e) => {
    state.spreads.yearY = parseInt(e.target.value);
    await ensureNeededYearsLoaded();
    renderSpreads();
  });
}

async function loadSpreadsManifest() {
  try {
    const m = await fetch('./data/manifest.json', { cache: 'no-cache' }).then(r => r.json());
    const h = m.datasets && m.datasets.dam_hourly;
    if (h && Array.isArray(h.years)) {
      state.spreads.availableYears = h.years.map(y => y.year).sort();
      populateSpYearSelect();
    } else {
      setSpStatus('Hourly DAM dataset not yet present in manifest. Regenerate snapshot.', 'error');
    }
  } catch (e) {
    setSpStatus(`Manifest load failed: ${e.message}`, 'error');
  }
}

function populateSpYearSelect() {
  const sel = document.getElementById('sp-year-pick');
  sel.innerHTML = '';
  for (const y of state.spreads.availableYears) {
    const opt = document.createElement('option');
    opt.value = String(y);
    opt.textContent = String(y);
    sel.appendChild(opt);
  }
  // Default = year of dayDate, clamped to available
  let y = state.spreads.yearY;
  if (!state.spreads.availableYears.includes(y)) {
    y = state.spreads.availableYears[state.spreads.availableYears.length - 1];
    state.spreads.yearY = y;
  }
  sel.value = String(y);
}

// ----- Hourly data loading ----------------------------------
function yearOfISO(iso) { return parseInt(iso.slice(0, 4), 10); }

async function loadHourlyYear(year) {
  const sp = state.spreads;
  if (sp.loadedYears.has(year)) return;
  if (sp.pendingYearLoads.has(year)) return sp.pendingYearLoads.get(year);
  if (sp.availableYears.length && !sp.availableYears.includes(year)) return;

  setSpStatus(`Loading ${year} hourly data…`);
  const p = fetch(`./data/dam_hourly_${year}.json`, { cache: 'no-cache' })
    .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
    .then(j => {
      const idx = new Map();
      for (const row of (j.rows || [])) {
        idx.set(`${row.z}|${row.d}`, row.p);
      }
      sp.hourlyByYear.set(year, idx);
      sp.loadedYears.add(year);
      sp.pendingYearLoads.delete(year);
      hideSpStatus();
    })
    .catch(err => {
      sp.pendingYearLoads.delete(year);
      setSpStatus(`Failed to load ${year}: ${err.message}`, 'error');
    });
  sp.pendingYearLoads.set(year, p);
  return p;
}

async function ensureNeededYearsLoaded() {
  const sp = state.spreads;
  const need = new Set();
  if (sp.dayDate) need.add(yearOfISO(sp.dayDate));
  if (sp.monthYM) need.add(parseInt(sp.monthYM.slice(0, 4), 10));
  if (sp.yearY)   need.add(sp.yearY);
  await Promise.all([...need].map(y => loadHourlyYear(y)));
}

function setSpStatus(msg, level) {
  const el = document.getElementById('spreads-status');
  el.textContent = msg;
  el.classList.remove('hidden');
  el.classList.toggle('error', level === 'error');
}
function hideSpStatus() {
  document.getElementById('spreads-status').classList.add('hidden');
}

// ----- Pair spread computation ------------------------------
// Return array of 24 numbers (or null where no data) for a single date.
// One side = single zone, no country averaging (zone code is the unit).
function pairHoursForDate(zoneA, zoneB, isoDate) {
  const yr = yearOfISO(isoDate);
  const yearIdx = state.spreads.hourlyByYear.get(yr);
  if (!yearIdx) return null;
  const arrA = yearIdx.get(`${zoneA}|${isoDate}`);
  const arrB = yearIdx.get(`${zoneB}|${isoDate}`);
  if (!arrA || !arrB) return null;
  const n = Math.min(arrA.length, arrB.length, 24);
  const out = new Array(24).fill(null);
  for (let i = 0; i < n; i++) {
    if (arrA[i] == null || arrB[i] == null) continue;
    out[i] = arrB[i] - arrA[i];  // base raw spread (B − A)
  }
  return out;
}

// Apply direction + effective/full transforms to a raw 24h spread array.
// Returns the displayable array of 24 (or 23/25) values.
function applySpreadMode(rawArr) {
  if (!rawArr) return null;
  const { direction, spreadType } = state.spreads;
  return rawArr.map(v => {
    if (v == null) return null;
    const signed = (direction === 'a2b') ? v : -v;
    if (spreadType === 'effective') return Math.max(0, signed);
    return signed;
  });
}

// Aggregate raw daily 24h arrays into a single 24h profile (avg per hour).
function avgProfile(arrays) {
  const sums = new Array(24).fill(0);
  const cnts = new Array(24).fill(0);
  for (const arr of arrays) {
    if (!arr) continue;
    for (let h = 0; h < 24; h++) {
      if (arr[h] != null) { sums[h] += arr[h]; cnts[h]++; }
    }
  }
  return sums.map((s, h) => cnts[h] > 0 ? s / cnts[h] : null);
}

function rawDayArrays(zoneA, zoneB, isoDates) {
  return isoDates.map(d => pairHoursForDate(zoneA, zoneB, d));
}

function isoDatesOfMonth(ym) {
  const [yy, mm] = ym.split('-').map(Number);
  const last = new Date(Date.UTC(yy, mm, 0)).getUTCDate();
  const out = [];
  for (let d = 1; d <= last; d++) {
    out.push(`${yy}-${String(mm).padStart(2, '0')}-${String(d).padStart(2, '0')}`);
  }
  return out;
}
function isoDatesOfYear(y) {
  const out = [];
  for (let m = 1; m <= 12; m++) {
    const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
    for (let d = 1; d <= last; d++) {
      out.push(`${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`);
    }
  }
  return out;
}

// ----- Aggregations for side-stats table --------------------
// Returns { base, effective, count, hoursPositive, totalHours }
function aggregateStats(rawArrays) {
  let sumSigned = 0, sumEffective = 0, count = 0, positive = 0;
  const dir = state.spreads.direction;
  for (const arr of rawArrays || []) {
    if (!arr) continue;
    for (const v of arr) {
      if (v == null) continue;
      const signed = (dir === 'a2b') ? v : -v;
      sumSigned += signed;
      sumEffective += Math.max(0, signed);
      if (signed > 0) positive++;
      count++;
    }
  }
  if (count === 0) return { base: null, effective: null, count: 0, positive: 0 };
  return {
    base: sumSigned / count,
    effective: sumEffective / count,
    count,
    positive,
    pctPositive: positive / count,
  };
}

// ----- Hourly JAO marginal-price helpers -----------------------------
// The line overlay on the spreads chart pulls from state.borderHourly,
// which is keyed by `${border}|${dir}|${date}|${hour}`. Returns an array
// of 24 (or 23/25 on DST days) numbers in EUR/MW — or null if no data.
//
// direction = 'a2b' → use border-dir A→B
// direction = 'b2a' → use border-dir B→A
function _borderKey(zoneA, zoneB) {
  return [zoneA, zoneB].sort().join('-');
}
function _wantDirsFor(zoneA, zoneB) {
  const sp = state.spreads;
  const dirAB = `${zoneA}>${zoneB}`;
  const dirBA = `${zoneB}>${zoneA}`;
  return sp.direction === 'a2b' ? [dirAB] : [dirBA];
}

// Hourly marginal price for a single date — returns 24-element array
// (or null if borderHourly is not loaded). Direction handled per setting.
function hourlyMarginalForDate(zoneA, zoneB, isoDate) {
  if (!state.borderHourly) return null;
  const b = _borderKey(zoneA, zoneB);
  const wantDirs = _wantDirsFor(zoneA, zoneB);
  const out = new Array(24).fill(null);
  for (let h = 1; h <= 24; h++) {
    let sum = 0, n = 0;
    for (const dir of wantDirs) {
      const row = state.borderHourly.idx.get(`${b}|${dir}|${isoDate}|${h}`);
      if (row && row.marginal != null) { sum += row.marginal; n++; }
    }
    out[h - 1] = n > 0 ? sum / n : null;
  }
  // If literally every hour is null, return null so callers can skip overlay.
  if (out.every(v => v == null)) return null;
  return out;
}

// ----- Hourly ATC (offered_mw) helpers -------------------------------
// Cross-border auction "available transmission capacity" per hour, used
// to grey-out bars when no physical flow was possible. atc lives on the
// same border_hourly row as marginal/spread (schema_version 2+).
//
// Coverage model:
//   - hasJaoCoverage(A,B): true if there is any borderHourly row for the
//     selected direction(s). False ⇒ non-JAO border (e.g. PL↔DE-LU SDAC) ⇒
//     no atc constraint applies, treat every hour as "flowable".
//   - For JAO-covered borders, an hour is "blocked" if atc IS NULL or
//     atc < 1 MW (round-off tolerance). Otherwise "flowable".
function hasJaoCoverage(zoneA, zoneB) {
  if (!state.borderHourly) return false;
  const b = _borderKey(zoneA, zoneB);
  const wantDirs = _wantDirsFor(zoneA, zoneB);
  for (const dir of wantDirs) {
    if (state.borderHourly.byPair.has(`${b}|${dir}`)) return true;
  }
  return false;
}

// Returns 24-element array of atc values (MW). null = no JAO row for that
// hour. Returns null entirely if border is not JAO-covered at all (so
// callers can skip greying logic uniformly).
function hourlyAtcForDate(zoneA, zoneB, isoDate) {
  if (!state.borderHourly) return null;
  if (!hasJaoCoverage(zoneA, zoneB)) return null;
  const b = _borderKey(zoneA, zoneB);
  const wantDirs = _wantDirsFor(zoneA, zoneB);
  const out = new Array(24).fill(null);
  for (let h = 1; h <= 24; h++) {
    // We average atc across selected directions — matches how marginal is
    // resolved. With sym gone there's always exactly one direction so this
    // is effectively a single lookup.
    let sum = 0, n = 0;
    for (const dir of wantDirs) {
      const row = state.borderHourly.idx.get(`${b}|${dir}|${isoDate}|${h}`);
      if (row && row.atc != null) { sum += row.atc; n++; }
    }
    out[h - 1] = n > 0 ? sum / n : null;
  }
  return out;
}

// 24h profile of atc averaged over a list of dates (for Month/Year hourly
// charts). Returns null if border has no JAO coverage. Per hour: averaged
// across days where atc is non-null; days with null are skipped, not
// counted as 0. If every entry is null the function still returns the
// array (so the chart can render — every hour just won't be greyed).
function avgHourlyAtcForDates(zoneA, zoneB, isoDates) {
  if (!hasJaoCoverage(zoneA, zoneB)) return null;
  const sums = new Array(24).fill(0);
  const cnts = new Array(24).fill(0);
  for (const d of isoDates) {
    const arr = hourlyAtcForDate(zoneA, zoneB, d);
    if (!arr) continue;
    for (let h = 0; h < 24; h++) {
      if (arr[h] != null) { sums[h] += arr[h]; cnts[h]++; }
    }
  }
  return sums.map((s, h) => cnts[h] > 0 ? s / cnts[h] : null);
}

// ATC stats over a period — used for the "Lost potential" summary row.
//
// Returns {
//   covered:        bool,                  // border is JAO-covered
//   theoreticalAvg: number|null,           // AVG(signed spread) over ALL hours
//   effectiveAvg:   number|null,           // AVG(signed spread) over flowable hours
//   lostAvg:        number|null,           // theoretical − effective (€/MWh)
//   blockedHours:   int,                   // count of (atc<1 || atc null) hours
//   blockedAbsSum:  number,                // Σ |signed spread| over blocked hours
//   totalHours:     int,                   // hours with any spread data
// }
//
// For non-JAO borders (covered=false), theoretical == effective and
// blockedHours = 0. Callers display "n/a — no ATC data" in that case.
function atcAwareStats(zoneA, zoneB, isoDates) {
  const dir = state.spreads.direction;
  const covered = hasJaoCoverage(zoneA, zoneB);
  let sumAll = 0, cntAll = 0;
  let sumEff = 0, cntEff = 0;
  let blockedHours = 0, blockedAbsSum = 0;
  for (const d of isoDates) {
    const raw = pairHoursForDate(zoneA, zoneB, d);
    if (!raw) continue;
    const atcArr = covered ? hourlyAtcForDate(zoneA, zoneB, d) : null;
    for (let h = 0; h < raw.length && h < 24; h++) {
      const v = raw[h];
      if (v == null) continue;
      const signed = (dir === 'a2b') ? v : -v;
      sumAll += signed; cntAll++;
      const atc = atcArr ? atcArr[h] : null;
      // Non-covered borders: every hour is flowable. Covered borders:
      // flowable ⇔ atc != null && atc >= 1.
      const flowable = !covered || (atc != null && atc >= 1);
      if (flowable) { sumEff += signed; cntEff++; }
      else { blockedHours++; blockedAbsSum += Math.abs(signed); }
    }
  }
  const theoreticalAvg = cntAll > 0 ? sumAll / cntAll : null;
  const effectiveAvg   = cntEff > 0 ? sumEff / cntEff : null;
  const lostAvg = (theoreticalAvg != null && effectiveAvg != null)
                  ? theoreticalAvg - effectiveAvg
                  : null;
  return {
    covered,
    theoreticalAvg,
    effectiveAvg,
    lostAvg,
    blockedHours,
    blockedAbsSum,
    totalHours: cntAll,
  };
}

// 24-hour profile of the marginal price averaged over a list of dates.
// Useful for the Month / Year 24h-profile charts.
function avgHourlyMarginalForDates(zoneA, zoneB, isoDates) {
  if (!state.borderHourly) return null;
  const sums = new Array(24).fill(0);
  const cnts = new Array(24).fill(0);
  for (const d of isoDates) {
    const arr = hourlyMarginalForDate(zoneA, zoneB, d);
    if (!arr) continue;
    for (let h = 0; h < 24; h++) {
      if (arr[h] != null) { sums[h] += arr[h]; cnts[h]++; }
    }
  }
  const out = sums.map((s, h) => cnts[h] > 0 ? s / cnts[h] : null);
  if (out.every(v => v == null)) return null;
  return out;
}

// JAO mp average for a given period of ISO dates. Returns € per MWh (we
// treat marginal_price_eur_mw as €/MWh for net-spread math — matches the
// energylive convention).
function jaoMpForPeriod(zoneA, zoneB, isoDates) {
  if (!state.borders) return null;
  // Border code in JAO is alpha-sorted (e.g. "HU-RO"); direction is "HU>RO".
  const sp = state.spreads;
  const b1 = [zoneA, zoneB].sort().join('-');
  const wantDir = sp.direction === 'a2b' ? `${zoneA}>${zoneB}` : `${zoneB}>${zoneA}`;
  let sum = 0, n = 0;
  for (const d of isoDates) {
    const row = state.borders.get(`${b1}|${wantDir}|${d}`);
    if (row && row.mb != null) { sum += row.mb; n++; }
  }
  return n > 0 ? sum / n : null;
}

// ----- Rendering --------------------------------------------
function renderSpreads() {
  if (!state.spreads.isInit) return;
  const { zoneA, zoneB } = state.spreads;
  if (zoneA === zoneB) {
    setSpStatus('Pick two different countries.', 'error');
    return;
  }
  hideSpStatus();
  renderSpDay();
  renderSpMonth();
  renderSpYear();
  renderSpAnalysis();
}

function pairLabel() {
  const { zoneA, zoneB, direction } = state.spreads;
  return direction === 'a2b' ? `${zoneA} → ${zoneB}` : `${zoneB} → ${zoneA}`;
}

function sectionTitle(prefix, periodLabel) {
  const { spreadType } = state.spreads;
  const kind = spreadType === 'effective' ? 'Effective' : 'Full';
  return `${prefix}: ${periodLabel} · ${pairLabel()} · ${kind}`;
}

// ----- Day section ------------------------------------------
function renderSpDay() {
  const { zoneA, zoneB, dayDate } = state.spreads;
  document.getElementById('sp-day-title').textContent =
    sectionTitle('Day', dayDate);

  const raw = pairHoursForDate(zoneA, zoneB, dayDate);
  const displayArr = applySpreadMode(raw);
  const mpArr = hourlyMarginalForDate(zoneA, zoneB, dayDate);
  const atcArr = hourlyAtcForDate(zoneA, zoneB, dayDate);
  drawHourBars('sp-day-chart', displayArr, {
    ctx: `${pairLabel()} · ${dayDate}`,
    lineArr: mpArr,
    atcArr,
  });

  const stats = aggregateStats(raw ? [raw] : []);
  const mp = jaoMpForPeriod(zoneA, zoneB, [dayDate]);
  const atcStats = atcAwareStats(zoneA, zoneB, [dayDate]);
  fillSideStats('sp-day-stats', `Day ${dayDate}`, stats, mp, atcStats);
}

// ----- Month section ----------------------------------------
function renderSpMonth() {
  const { zoneA, zoneB, monthYM } = state.spreads;
  document.getElementById('sp-month-title').textContent =
    sectionTitle('Month', monthYM);

  const days = isoDatesOfMonth(monthYM);
  const dayArrays = rawDayArrays(zoneA, zoneB, days);

  // Daily series: one bar per day = avg over hours of displayed value
  const dailyVals = dayArrays.map(arr => {
    const disp = applySpreadMode(arr);
    if (!disp) return null;
    let s = 0, n = 0;
    for (const v of disp) { if (v != null) { s += v; n++; } }
    return n > 0 ? s / n : null;
  });
  drawDailyBars('sp-month-daily', dailyVals, days);

  // 24h profile averaged across the month
  const displayed = dayArrays.map(applySpreadMode);
  const profile = avgProfile(displayed);
  const mpProfile = avgHourlyMarginalForDates(zoneA, zoneB, days);
  const atcProfile = avgHourlyAtcForDates(zoneA, zoneB, days);
  drawHourBars('sp-month-hourly', profile, {
    ctx: `${pairLabel()} · ${monthYM} · 24h avg`,
    lineArr: mpProfile,
    atcArr: atcProfile,
  });

  const stats = aggregateStats(dayArrays);
  const mp = jaoMpForPeriod(zoneA, zoneB, days);
  const atcStats = atcAwareStats(zoneA, zoneB, days);
  fillSideStats('sp-month-stats', `Month ${monthYM}`, stats, mp, atcStats);
}

// ----- Year section -----------------------------------------
function renderSpYear() {
  const { zoneA, zoneB, yearY } = state.spreads;
  document.getElementById('sp-year-title').textContent =
    sectionTitle('Year', String(yearY));

  const dates = isoDatesOfYear(yearY);
  // Cap to today if it's the current year
  const today = todayISO();
  const datesEff = dates.filter(d => d <= today);
  const dayArrays = rawDayArrays(zoneA, zoneB, datesEff);

  // Monthly aggregates
  const months = [];
  for (let m = 0; m < 12; m++) {
    const yyyy_mm = `${yearY}-${String(m + 1).padStart(2, '0')}`;
    const idxInPeriod = [];
    for (let i = 0; i < datesEff.length; i++) {
      if (datesEff[i].slice(0, 7) === yyyy_mm) idxInPeriod.push(i);
    }
    let s = 0, n = 0;
    for (const i of idxInPeriod) {
      const disp = applySpreadMode(dayArrays[i]);
      if (!disp) continue;
      for (const v of disp) { if (v != null) { s += v; n++; } }
    }
    months.push({ ym: yyyy_mm, val: n > 0 ? s / n : null });
  }
  drawMonthlyBars('sp-year-monthly', months);

  // 24h profile averaged across the year
  const displayed = dayArrays.map(applySpreadMode);
  const profile = avgProfile(displayed);
  const mpProfile = avgHourlyMarginalForDates(zoneA, zoneB, datesEff);
  const atcProfile = avgHourlyAtcForDates(zoneA, zoneB, datesEff);
  drawHourBars('sp-year-hourly', profile, {
    ctx: `${pairLabel()} · ${yearY} · 24h avg`,
    lineArr: mpProfile,
    atcArr: atcProfile,
  });

  const stats = aggregateStats(dayArrays);
  const mp = jaoMpForPeriod(zoneA, zoneB, datesEff);
  const atcStats = atcAwareStats(zoneA, zoneB, datesEff);
  fillSideStats('sp-year-stats', `Year ${yearY}`, stats, mp, atcStats);
}

// ----- Earnings ---------------------------------------------
// "Earnings if you trade 1 MWh in every positive-spread hour."
//
//   revenueEur  = SUM over (d,h) where effective_spread(d,h) > 0 of spread
//   costEur     = SUM over those (d,h) of daily CBC (JAO mp) for that day
//   netEur      = revenueEur − costEur
//   mwh         = count of positive hours (1 MWh per hour)
//
// If borders has no JAO row for a day, costs are skipped for that day —
// we treat it as "no allocation cost incurred" rather than zero out
// revenue. The function therefore returns null mp days separately so
// callers can decide whether to surface that as a caveat.
function computeEarnings(zoneA, zoneB, isoDates) {
  let revenue = 0, cost = 0, mwh = 0, hoursPositive = 0, totalHours = 0;
  let daysMissingMp = 0, daysWithMp = 0;
  const { direction } = state.spreads;

  // Cache daily mp lookups so we don't hit state.borders 24x per day
  const dailyMp = new Map();   // d → mp value or null
  const b1 = [zoneA, zoneB].sort().join('-');
  const dirAB = `${zoneA}>${zoneB}`;
  const dirBA = `${zoneB}>${zoneA}`;
  const wantDir = direction === 'a2b' ? dirAB : dirBA;
  function getDailyMp(d) {
    if (dailyMp.has(d)) return dailyMp.get(d);
    if (!state.borders) { dailyMp.set(d, null); return null; }
    const row = state.borders.get(`${b1}|${wantDir}|${d}`);
    const val = (row && row.mb != null) ? row.mb : null;
    dailyMp.set(d, val);
    return val;
  }

  for (const d of isoDates) {
    const raw = pairHoursForDate(zoneA, zoneB, d);
    if (!raw) continue;
    const mp = getDailyMp(d);
    if (mp != null) daysWithMp++;
    else daysMissingMp++;

    for (const v of raw) {
      if (v == null) continue;
      totalHours++;
      const signed = (direction === 'a2b') ? v : -v;
      if (signed > 0) {
        revenue += signed;
        if (mp != null) cost += mp;
        hoursPositive++;
        mwh++;
      }
    }
  }
  return {
    revenueEur: revenue,
    costEur: cost,
    netEur: revenue - cost,
    mwh,
    hoursPositive,
    totalHours,
    daysWithMp,
    daysMissingMp,
  };
}

// ----- Analysis block ---------------------------------------
function renderSpAnalysis() {
  const { zoneA, zoneB, yearY, spreadType, svs, direction } = state.spreads;

  const today = todayISO();
  const yearDates = isoDatesOfYear(yearY).filter(d => d <= today);
  const dayArrays = rawDayArrays(zoneA, zoneB, yearDates);

  // --- Headline earnings: best month + selected year YTD --------------
  // Loop monthly within the selected year, compute earnings per month,
  // pick the best.
  let bestMonth = null, bestMonthEarn = null;
  for (let m = 0; m < 12; m++) {
    const ym = `${yearY}-${String(m + 1).padStart(2, '0')}`;
    const mDates = isoDatesOfMonth(ym).filter(d => d <= today);
    if (mDates.length === 0) continue;
    const e = computeEarnings(zoneA, zoneB, mDates);
    if (e.totalHours === 0) continue;
    if (!bestMonthEarn || e.netEur > bestMonthEarn.netEur) {
      bestMonthEarn = e; bestMonth = ym;
    }
  }
  const yearEarn = computeEarnings(zoneA, zoneB, yearDates);

  const monthLabels = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const bestMonthHuman = bestMonth
    ? `${monthLabels[parseInt(bestMonth.slice(5), 10) - 1]} ${bestMonth.slice(0, 4)}`
    : '—';

  // --- Other stats (existing) -----------------------------------------
  const profile = avgProfile(dayArrays.map(applySpreadMode));
  let bestH = -1, bestV = -Infinity;
  let worstH = -1, worstV = Infinity;
  for (let h = 0; h < 24; h++) {
    if (profile[h] == null) continue;
    if (profile[h] > bestV) { bestV = profile[h]; bestH = h; }
    if (profile[h] < worstV) { worstV = profile[h]; worstH = h; }
  }

  let bestDay = null, bestDayVal = -Infinity;
  for (let i = 0; i < dayArrays.length; i++) {
    const disp = applySpreadMode(dayArrays[i]);
    if (!disp) continue;
    let s = 0;
    for (const v of disp) { if (v != null) s += v; }
    if (s > bestDayVal) { bestDayVal = s; bestDay = yearDates[i]; }
  }
  const stats = aggregateStats(dayArrays);
  const mp = jaoMpForPeriod(zoneA, zoneB, yearDates);
  const netAvg = (stats.effective != null && mp != null && svs === 'include')
    ? stats.effective - mp
    : (stats.effective != null ? stats.effective : null);

  // --- Render ----------------------------------------------------------
  const fmtEur = v => (v == null || !isFinite(v)) ? '—'
                     : (v >= 0 ? '+' : '−') + Math.abs(v).toLocaleString('en-GB', {maximumFractionDigits: 0}) + ' €';
  const fmtMwh = v => (v == null) ? '—' : v.toLocaleString('en-GB') + ' MWh';

  const earningsCardHTML = (title, earn, periodTxt) => {
    if (!earn || earn.totalHours === 0) {
      return `
        <div class="sp-earn-card">
          <div class="sp-earn-title">${escapeHtml(title)}</div>
          <div class="sp-earn-period">${escapeHtml(periodTxt)}</div>
          <div class="sp-earn-mwh">—</div>
          <div class="sp-earn-eur">No data</div>
        </div>`;
    }
    const incCBC = svs === 'include';
    const net = incCBC ? earn.netEur : earn.revenueEur;
    const mpCaveat = (earn.daysMissingMp > 0 && incCBC)
      ? `<div class="sp-earn-warn">CBC unavailable for ${earn.daysMissingMp} of ${earn.daysWithMp + earn.daysMissingMp} days — cost may be under-counted.</div>`
      : '';
    return `
      <div class="sp-earn-card">
        <div class="sp-earn-title">${escapeHtml(title)}</div>
        <div class="sp-earn-period">${escapeHtml(periodTxt)}</div>
        <div class="sp-earn-mwh">${fmtMwh(earn.mwh)}</div>
        <div class="sp-earn-sub">max theoretical volume (${earn.hoursPositive} positive hours × 1 MWh)</div>
        <div class="sp-earn-eur ${net >= 0 ? 'pos' : 'neg'}">${fmtEur(net)}</div>
        <div class="sp-earn-sub">
          Revenue ${fmtEur(earn.revenueEur)} ${incCBC ? `· CBC −${Math.round(earn.costEur).toLocaleString('en-GB')} €` : '· CBC excluded'}
        </div>
        ${mpCaveat}
      </div>`;
  };

  const items = [
    { lbl: 'Base spread (avg)',
      val: stats.base != null ? `${stats.base.toFixed(2)} €/MWh` : '—',
      sub: 'Signed average over hours' },
    { lbl: 'Effective spread (avg)',
      val: stats.effective != null ? `${stats.effective.toFixed(2)} €/MWh` : '—',
      sub: 'max(0, signed) averaged' },
    { lbl: '% positive hours',
      val: stats.pctPositive != null ? `${(stats.pctPositive * 100).toFixed(1)}%` : '—',
      sub: `${stats.positive ?? 0} of ${stats.count ?? 0} hours` },
    { lbl: 'CBC (avg JAO mp)',
      val: mp != null ? `${mp.toFixed(2)} €/MWh` : 'n/a',
      sub: 'Daily mp averaged over period' },
    { lbl: 'Net spread (avg)',
      val: netAvg != null ? `${netAvg.toFixed(2)} €/MWh` : '—',
      sub: svs === 'include' ? 'effective − CBC' : 'effective only' },
    { lbl: 'Best hour (CET)',
      val: bestH >= 0 ? `${bestH + 1}h · ${bestV.toFixed(1)} €` : '—',
      sub: 'Highest avg effective spread' },
    { lbl: 'Worst hour (CET)',
      val: worstH >= 0 ? `${worstH + 1}h · ${worstV.toFixed(1)} €` : '—',
      sub: 'Lowest avg displayed value' },
    { lbl: 'Best day',
      val: bestDay && bestDayVal > -Infinity ? `${bestDay} · ${bestDayVal.toFixed(0)} €` : '—',
      sub: 'Total effective spread (€/MWh·24h)' },
  ];

  document.getElementById('sp-analysis-body').innerHTML =
    `<div class="sp-earnings-row">
       ${earningsCardHTML('Best month earnings', bestMonthEarn, bestMonthHuman)}
       ${earningsCardHTML('Year-to-date earnings', yearEarn, `${yearY} (through ${today})`)}
     </div>
     <div class="sp-analysis-grid">` +
    items.map(it => `
      <div class="sp-analysis-stat">
        <div class="lbl">${escapeHtml(it.lbl)}</div>
        <div class="val">${escapeHtml(it.val)}</div>
        <div class="sub">${escapeHtml(it.sub)}</div>
      </div>`).join('') +
    `</div>` +
    `<p style="margin-top:10px;font-size:12px;color:#5b6271;">
       Period: Year ${yearY} · Pair: ${escapeHtml(pairLabel())} · Mode: ${escapeHtml(spreadType)} · CBC: ${escapeHtml(svs)} · Direction: ${escapeHtml(direction)}.
       Earnings model: trade 1 MWh in each positive-spread hour, pay daily CBC per MWh.
     </p>`;
}

// ----- Side-stats panel -------------------------------------
// `atcStats` is the result of atcAwareStats() and feeds the Theoretical /
// Effective / Lost-potential rows. Passing null preserves backward-compat
// (rows just won't render).
function fillSideStats(elId, periodLabel, stats, mp, atcStats) {
  const { svs } = state.spreads;
  const fmtV = v => v == null ? '<span class="val muted">—</span>'
                              : `<span class="val">${v.toFixed(2)} €</span>`;
  const netAvg = (stats.effective != null && mp != null && svs === 'include')
    ? stats.effective - mp
    : (stats.effective != null ? stats.effective : null);

  // ----- Theoretical / Effective (ATC>0) / Lost potential ---------------
  // These three rows replace the rough "Base/Effective avg" intuition with
  // a flow-aware view: how much €/MWh would you give up if you could only
  // trade when transmission was actually available.
  let atcBlock = '';
  if (atcStats) {
    if (!atcStats.covered) {
      atcBlock = `
        <div class="sp-stat-row"><span class="lbl">Theoretical spread</span>${fmtV(atcStats.theoreticalAvg)}</div>
        <div class="sp-stat-row"><span class="lbl">Effective spread (ATC&gt;0)</span><span class="val muted">n/a — no ATC data</span></div>
        <div class="sp-stat-row"><span class="lbl">Lost potential</span><span class="val muted">0.00 €</span></div>
      `;
    } else {
      // Subline shows blocked-hour count + Σ|spread| equivalence
      const blk = atcStats.blockedHours;
      const blkSub = blk > 0
        ? `<div class="sp-substat">${blk} h blocked · Σ|spread| = ${atcStats.blockedAbsSum.toFixed(0)} €/MWh-equiv</div>`
        : '';
      atcBlock = `
        <div class="sp-stat-row"><span class="lbl">Theoretical spread</span>${fmtV(atcStats.theoreticalAvg)}</div>
        <div class="sp-stat-row"><span class="lbl">Effective spread (ATC&gt;0)</span>${fmtV(atcStats.effectiveAvg)}</div>
        <div class="sp-stat-row"><span class="lbl">Lost potential</span>${fmtV(atcStats.lostAvg)}</div>
        ${blkSub}
      `;
    }
  }

  const html = `
    <h4>${escapeHtml(periodLabel)}</h4>
    ${atcBlock}
    <div class="sp-stat-row"><span class="lbl">Base spread</span>${fmtV(stats.base)}</div>
    <div class="sp-stat-row"><span class="lbl">Effective avg</span>${fmtV(stats.effective)}</div>
    <div class="sp-stat-row"><span class="lbl">CBC (JAO mp)</span>${fmtV(mp)}</div>
    <div class="sp-stat-row net"><span class="lbl">Net spread</span>${fmtV(netAvg)}</div>
    <div class="sp-stat-row"><span class="lbl">Hours analysed</span><span class="val">${stats.count ?? 0}</span></div>
    <div class="sp-stat-row"><span class="lbl">Positive hours</span><span class="val">${stats.positive ?? 0} (${stats.pctPositive ? (stats.pctPositive * 100).toFixed(0) : 0}%)</span></div>
  `;
  document.getElementById(elId).innerHTML = html;
}

// ----- SVG bar drawers --------------------------------------
// Common: vertically centered axis, positive green, negative red, zero line.
// Returns chart dimensions in CSS pixels. Sets the SVG viewBox to match
// so 1 user-coord unit = 1 CSS pixel — text and ticks render crisply
// regardless of container width. Falls back to a hidden-panel-safe default
// when the parent is still display:none at measure time.
function spChartDims(svg, fallbackH) {
  const node = svg.node();
  const rect = node.getBoundingClientRect();
  const cssH = parseFloat(getComputedStyle(node).height) || fallbackH || 240;
  const W = Math.max(rect.width || 0, 240);
  const H = Math.max(cssH, 120);
  svg.attr('viewBox', `0 0 ${W} ${H}`)
     .attr('preserveAspectRatio', 'xMidYMid meet');
  return { W, H };
}

// Each drawer wires a tooltip callback that formats the bar context.
//
// opts.atcArr (optional, length matching arr): hourly ATC values in MW.
//   - null entry on a JAO-covered border ⇒ bar greyed (treated as 0)
//   - numeric < 1                          ⇒ bar greyed (no flow possible)
//   - numeric >= 1                         ⇒ bar coloured green/red as usual
//   - omit the array entirely on non-JAO borders ⇒ no greying applied
function drawHourBars(svgId, arr, opts) {
  const svg = d3.select(`#${svgId}`);
  svg.selectAll('*').remove();
  const { W, H } = spChartDims(svg, 280);
  // When a line overlay is supplied we need extra padding on the right
  // for the second y-axis labels.
  const lineArr = opts && opts.lineArr;
  const hasLine = Array.isArray(lineArr) && lineArr.some(v => v != null);
  const atcArr = (opts && Array.isArray(opts.atcArr)) ? opts.atcArr : null;
  // Single shared y-axis since 2026-05-29 — JAO marginal (€/MW) is plotted
  // on the same scale as DAM spread (€/MWh) so users can compare height
  // visually. No right-side ticks → keep padR small.
  const padL = 42, padR = 10, padT = 14, padB = 28;
  if (!arr) {
    svg.append('text')
       .attr('x', W / 2).attr('y', H / 2).attr('text-anchor', 'middle')
       .attr('fill', '#cdd2da').attr('font-size', 14)
       .text('No data');
    return;
  }
  const ctx = (opts && opts.ctx) || '';
  // A bar is "blocked" (grey) when an ATC array is provided AND the
  // entry is either missing or < 1 MW. Without an array (non-JAO border),
  // no bars are greyed.
  const isBlocked = (i) => {
    if (!atcArr) return false;
    const a = atcArr[i];
    return (a == null || a < 1);
  };
  drawBarsAxis(svg, arr, {
    W, H, padL, padR, padT, padB,
    xLabel: i => String(i + 1),
    xLabelEvery: 1,
    lineArr: hasLine ? lineArr : null,
    lineLabel: 'JAO marginal €/MW',
    lineColor: '#f97316',
    barColorFor: (i, v) => isBlocked(i)
        ? '#D1D5DB'                            // light grey — no flow
        : (v >= 0 ? '#3aa775' : '#d8463a'),
    tooltipFor: (i, v) => {
      const hour = i + 1;
      const valTxt = v == null ? '<span class="lbl">no data</span>'
                                : `<strong>${(v >= 0 ? '+' : '')}${v.toFixed(2)} €/MWh</strong>`;
      let mpRow = '';
      if (hasLine) {
        const mv = lineArr[i];
        // On blocked hours the marginal price is still the auction
        // clearing price (capacity offered was 0 → typically 0 €/MW,
        // but JAO may still publish a value). We surface that with a
        // small caveat so the user doesn't misread it as live trade.
        const mpTxt = mv == null ? '<span class="lbl">no data</span>'
                                  : `<strong>${mv.toFixed(2)} €/MW</strong>`;
        const mpNote = (atcArr && isBlocked(i) && mv != null)
            ? ' <span class="lbl">(no capacity offered)</span>' : '';
        mpRow = `<div class="row"><span class="lbl">JAO marginal</span>${mpTxt}${mpNote}</div>`;
      }
      let atcRow = '';
      if (atcArr) {
        const a = atcArr[i];
        if (a == null) {
          atcRow = `<div class="row"><span class="lbl">ATC</span><span class="lbl">no data (treated as 0)</span></div>`;
        } else if (a < 1) {
          atcRow = `<div class="row"><span class="lbl">ATC</span><strong>0 MW</strong> <span class="lbl">(no flow possible)</span></div>`;
        } else {
          atcRow = `<div class="row"><span class="lbl">ATC</span><strong>${a.toFixed(0)} MW</strong></div>`;
        }
      }
      return `
        <div class="ttl">${ctx || 'Hour'}</div>
        <div class="row"><span class="lbl">CET hour</span><span>${hour}</span></div>
        <div class="row"><span class="lbl">Spread</span>${valTxt}</div>
        ${atcRow}
        ${mpRow}`;
    },
  });
}

function drawDailyBars(svgId, arr, isoDates) {
  const svg = d3.select(`#${svgId}`);
  svg.selectAll('*').remove();
  const { W, H } = spChartDims(svg, 240);
  const padL = 38, padR = 10, padT = 14, padB = 30;
  if (!arr || arr.every(v => v == null)) {
    svg.append('text').attr('x', W/2).attr('y', H/2).attr('text-anchor','middle')
       .attr('fill','#cdd2da').attr('font-size',12).text('No data');
    return;
  }
  drawBarsAxis(svg, arr, {
    W, H, padL, padR, padT, padB,
    xLabel: i => String(i + 1),
    xLabelEvery: arr.length > 20 ? 3 : 2,
    tooltipFor: (i, v) => {
      const dateLabel = isoDates && isoDates[i] ? isoDates[i] : `Day ${i + 1}`;
      const valTxt = v == null ? '<span class="lbl">no data</span>'
                                : `<strong>${(v >= 0 ? '+' : '')}${v.toFixed(2)} €/MWh</strong>`;
      return `
        <div class="ttl">Daily average</div>
        <div class="row"><span class="lbl">Date</span><span>${dateLabel}</span></div>
        <div class="row"><span class="lbl">Avg</span>${valTxt}</div>`;
    },
  });
}

function drawMonthlyBars(svgId, months) {
  const svg = d3.select(`#${svgId}`);
  svg.selectAll('*').remove();
  const { W, H } = spChartDims(svg, 240);
  const padL = 38, padR = 10, padT = 14, padB = 30;
  const arr = months.map(m => m.val);
  if (arr.every(v => v == null)) {
    svg.append('text').attr('x', W/2).attr('y', H/2).attr('text-anchor','middle')
       .attr('fill','#cdd2da').attr('font-size',12).text('No data');
    return;
  }
  const monthLabels = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  drawBarsAxis(svg, arr, {
    W, H, padL, padR, padT, padB,
    xLabel: i => monthLabels[i] || '',
    xLabelEvery: 1,
    tooltipFor: (i, v) => {
      const ymLabel = months[i] && months[i].ym ? months[i].ym : monthLabels[i];
      const valTxt = v == null ? '<span class="lbl">no data</span>'
                                : `<strong>${(v >= 0 ? '+' : '')}${v.toFixed(2)} €/MWh</strong>`;
      return `
        <div class="ttl">Monthly average</div>
        <div class="row"><span class="lbl">Month</span><span>${ymLabel}</span></div>
        <div class="row"><span class="lbl">Avg</span>${valTxt}</div>`;
    },
  });
}

// Core SVG bar plotter with zero-line axis, hover, animated enter.
// opts.tooltipFor(i, v) → string returned by the tooltip when hovering bar i.
function drawBarsAxis(svg, arr, opts) {
  const { W, H, padL, padR, padT, padB, xLabel, xLabelEvery, tooltipFor } = opts;
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;

  // Determine y range. Since 2026-05-29 the JAO marginal line shares the
  // same left axis as the spread bars, so its values participate in the
  // min/max sweep. €/MW and €/MWh are kept on one scale on purpose —
  // makes them visually comparable.
  const lineArr = opts.lineArr;
  const lineNumeric = (Array.isArray(lineArr) ? lineArr.filter(v => v != null) : []);
  const valid = arr.filter(v => v != null).concat(lineNumeric);
  let yMin = Math.min(0, ...valid);
  let yMax = Math.max(0, ...valid);
  if (yMin === yMax) { yMin -= 1; yMax += 1; }
  const pad = (yMax - yMin) * 0.08;
  yMin -= pad; yMax += pad;
  const yScale = v => padT + innerH * (1 - (v - yMin) / (yMax - yMin));
  const zeroY = yScale(0);

  const n = arr.length;
  const step = innerW / n;
  const barW = step * 0.78;

  // Y grid + labels at min/zero/max
  const yTicks = [yMax, 0, yMin].filter((v, i, a) => a.indexOf(v) === i);
  yTicks.forEach(v => {
    const y = yScale(v);
    svg.append('line')
       .attr('class', v === 0 ? 'y-zero' : 'y-grid')
       .attr('x1', padL).attr('x2', W - padR)
       .attr('y1', y).attr('y2', y);
    svg.append('text')
       .attr('class', 'y-tick')
       .attr('x', padL - 4).attr('y', y + 3)
       .attr('text-anchor', 'end')
       .text(v.toFixed(1));
  });

  // Column-background rects (whole-column hover target). Drawn UNDER bars so
  // they highlight on hover but never steal pointer events from the bar
  // itself — keeping bar-specific brightness intact.
  const colBgs = [];
  for (let i = 0; i < n; i++) {
    const cb = svg.append('rect')
      .attr('class', 'col-bg')
      .attr('data-idx', i)
      .attr('x', padL + step * i)
      .attr('y', padT)
      .attr('width', step)
      .attr('height', innerH);
    colBgs.push(cb);
  }

  // X labels
  const xLabels = [];
  for (let i = 0; i < n; i++) {
    if (xLabelEvery && (i % xLabelEvery !== 0) && i !== n - 1) continue;
    const x = padL + step * i + step / 2;
    const lab = svg.append('text')
      .attr('class', 'x-label')
      .attr('data-idx', i)
      .attr('x', x).attr('y', H - 10)
      .attr('text-anchor', 'middle')
      .text(xLabel(i));
    xLabels.push(lab);
  }

  // Tooltip + hover wiring
  const tooltipEl = document.getElementById('sp-tooltip');
  function showTooltip(i, evt) {
    if (!tooltipEl) return;
    const txt = tooltipFor ? tooltipFor(i, arr[i]) : '';
    if (!txt) return;
    tooltipEl.innerHTML = txt;
    tooltipEl.classList.add('visible');
    const x = evt.clientX + 14;
    const y = evt.clientY + 14;
    // Keep tooltip inside viewport
    const tw = tooltipEl.offsetWidth, th = tooltipEl.offsetHeight;
    const vw = window.innerWidth, vh = window.innerHeight;
    tooltipEl.style.left = `${Math.min(x, vw - tw - 8)}px`;
    tooltipEl.style.top  = `${Math.min(y, vh - th - 8)}px`;
  }
  function hideTooltip() {
    if (tooltipEl) tooltipEl.classList.remove('visible');
  }

  function setHotColumn(i) {
    colBgs.forEach((cb, idx) => cb.classed('hot', idx === i));
    xLabels.forEach(lab => {
      lab.classed('hot', parseInt(lab.attr('data-idx'), 10) === i);
    });
  }
  function clearHotColumn() {
    colBgs.forEach(cb => cb.classed('hot', false));
    xLabels.forEach(lab => lab.classed('hot', false));
  }

  // Bars — drawn with d3 transition for a smooth grow-from-zero entry.
  // `barColorFor(i, v)` lets callers override the default green/red logic
  // (used to grey-out hours where transmission capacity is zero).
  const barColorFor = opts.barColorFor;
  for (let i = 0; i < n; i++) {
    const v = arr[i];
    if (v == null) continue;
    const x = padL + step * i + (step - barW) / 2;
    const yFinal = v >= 0 ? yScale(v) : zeroY;
    const hFinal = Math.abs(yScale(v) - zeroY);
    const color = barColorFor
        ? barColorFor(i, v)
        : (v >= 0 ? '#3aa775' : '#d8463a');

    const bar = svg.append('rect')
      .attr('class', 'bar')
      .attr('data-idx', i)
      .attr('x', x).attr('width', barW)
      .attr('y', zeroY).attr('height', 0)
      .attr('fill', color)
      .attr('opacity', 0.92);

    bar.transition()
       .duration(420)
       .ease(d3.easeCubicOut)
       .delay(i * 8)
       .attr('y', yFinal)
       .attr('height', hFinal);

    bar.on('mouseenter', (evt) => {
         setHotColumn(i);
         showTooltip(i, evt);
       })
       .on('mousemove', (evt) => { showTooltip(i, evt); })
       .on('mouseleave', () => {
         clearHotColumn();
         hideTooltip();
       });
  }

  // Whole-column hover via the col-bg rect — captures cursor between
  // bars (e.g. when bar is 0-height for that hour).
  for (let i = 0; i < n; i++) {
    const hit = svg.append('rect')
      .attr('x', padL + step * i)
      .attr('y', padT)
      .attr('width', step)
      .attr('height', innerH)
      .attr('fill', 'transparent')
      .style('pointer-events', 'all');
    hit.on('mouseenter', (evt) => {
         setHotColumn(i);
         showTooltip(i, evt);
       })
       .on('mousemove', (evt) => { showTooltip(i, evt); })
       .on('mouseleave', () => {
         clearHotColumn();
         hideTooltip();
       });
  }

  // ----- Optional line overlay (JAO marginal price, SHARED left Y-axis) -----
  // Single y-axis: marginal (€/MW) and spread (€/MWh) are numerically close
  // for DA auctions and visually comparable on one scale. No right-side
  // ticks anymore — the legend disambiguates units.
  if (lineArr && lineArr.length) {
    const lineColor = opts.lineColor || '#f97316';
    const lineLabel = opts.lineLabel || 'line';

    // Build a polyline from non-null segments — spanGaps:false equivalent.
    // We split on nulls so the path breaks instead of crossing through gaps.
    let seg = [];
    const segments = [];
    for (let i = 0; i < lineArr.length; i++) {
      const v = lineArr[i];
      const cx = padL + step * i + step / 2;
      if (v == null) {
        if (seg.length > 0) { segments.push(seg); seg = []; }
        continue;
      }
      seg.push({ x: cx, y: yScale(v), i, v });
    }
    if (seg.length > 0) segments.push(seg);

    const lineGen = d3.line().x(p => p.x).y(p => p.y);
    for (const s of segments) {
      svg.append('path')
         .attr('d', lineGen(s))
         .attr('fill', 'none')
         .attr('stroke', lineColor)
         .attr('stroke-width', 2)
         .attr('opacity', 0.95)
         .attr('stroke-linejoin', 'round')
         .attr('stroke-linecap', 'round');
    }

    // Point markers — render after the path so they sit on top.
    for (const s of segments) {
      for (const p of s) {
        svg.append('circle')
           .attr('cx', p.x).attr('cy', p.y).attr('r', 2.6)
           .attr('fill', lineColor)
           .attr('stroke', '#fff').attr('stroke-width', 0.6)
           .style('pointer-events', 'none');
      }
    }

    // Tiny legend in the top-right corner.
    const legX = W - padR - 4;
    const legY = padT + 4;
    const legG = svg.append('g').attr('class', 'sp-line-legend');
    legG.append('line')
        .attr('x1', legX - 86).attr('x2', legX - 70)
        .attr('y1', legY + 5).attr('y2', legY + 5)
        .attr('stroke', lineColor).attr('stroke-width', 2);
    legG.append('text')
        .attr('x', legX - 66).attr('y', legY + 8)
        .attr('font-size', 10).attr('fill', lineColor)
        .text(lineLabel);
  }
}

// =============================================================
// =============================================================
// ACTUAL GENERATION TAB
// Zone × production-type line-chart explorer with actual MW,
// historical-mean baseline and P5-P95 corridor.
// =============================================================
// =============================================================

state.gen = {
  isInit: false,
  zone: 'HU',
  type: 'B16',         // 'B16' Solar default; pseudo-type 'WIND' = B18+B19
  dayDate: null,
  monthYM: null,
  yearY: null,
  // Data
  actualByYear: new Map(),    // year -> Map(`${z}|${t}|${d}` -> [24 floats])
  loadedYears: new Set(),
  pendingYearLoads: new Map(),
  availableYears: [],
  typeCodes: {},
  // Climatology indexes
  climDaily: null,    // Map(`${z}|${t}|${doy}` -> {mean,p5,p95,p50,n})
  climHourly: null,   // Map(`${z}|${t}|${m}|${h}` -> stats)
  climMonthly: null,  // Map(`${z}|${t}|${m}` -> stats)
  climLoaded: false,
  climPending: null,
};

// Production-type dropdown configuration. 'WIND' is a pseudo-type that
// combines B18+B19 client-side. 'IMP' and 'EXP' are commercial cross-
// border flow aggregates (curated.commercial_exchange), not generation;
// the backend already sums them across all partner zones per hour.
const GEN_TYPE_OPTIONS = [
  { code: 'B16',  label: 'Solar' },
  { code: 'WIND', label: 'Wind (Onshore + Offshore)' },
  { code: 'B14',  label: 'Nuclear' },
  { code: 'B12',  label: 'Hydro Reservoir' },
  { code: 'B11',  label: 'Hydro Run-of-river' },
  { code: 'B10',  label: 'Hydro Pumped Storage' },
  { code: 'B04',  label: 'Fossil Gas' },
  { code: 'B05',  label: 'Fossil Hard Coal' },
  { code: 'B02',  label: 'Brown Coal / Lignite' },
  { code: 'B01',  label: 'Biomass' },
  { code: 'IMP',  label: 'Commercial Import (all partners)' },
  { code: 'EXP',  label: 'Commercial Export (all partners)' },
];
const WIND_COMPONENTS = ['B18', 'B19'];

// ----- Init -------------------------------------------------
async function initGenView() {
  if (state.gen.isInit) return;

  populateGenSelects();
  initGenDefaults();
  bindGenControls();
  state.gen.isInit = true;

  // Manifest already loaded by spreads; reuse availableYears if possible
  await loadGenManifest();
  await Promise.all([loadGenClimatology(), loadGenActualYear(yearOfISO(state.gen.dayDate))]);
}

function populateGenSelects() {
  const zSel = document.getElementById('gen-zone');
  const tSel = document.getElementById('gen-type');
  zSel.innerHTML = '';
  ZONES.slice().sort((a, b) => a.code.localeCompare(b.code)).forEach(z => {
    const opt = document.createElement('option');
    opt.value = z.code;
    opt.textContent = `${z.code} — ${z.name}`;
    zSel.appendChild(opt);
  });
  tSel.innerHTML = '';
  GEN_TYPE_OPTIONS.forEach(t => {
    const opt = document.createElement('option');
    opt.value = t.code;
    opt.textContent = t.label;
    tSel.appendChild(opt);
  });
  zSel.value = state.gen.zone;
  tSel.value = state.gen.type;
}

function initGenDefaults() {
  state.gen.dayDate = state.date || todayISO();
  document.getElementById('gen-day-date').value = state.gen.dayDate;
  const d = parseISO(state.gen.dayDate);
  const ym = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
  state.gen.monthYM = ym;
  document.getElementById('gen-month-pick').value = ym;
  state.gen.yearY = d.getUTCFullYear();
}

function bindGenControls() {
  document.getElementById('gen-zone').addEventListener('change', async (e) => {
    state.gen.zone = e.target.value;
    renderGen();
  });
  document.getElementById('gen-type').addEventListener('change', async (e) => {
    state.gen.type = e.target.value;
    renderGen();
  });
  document.getElementById('gen-day-date').addEventListener('change', async (e) => {
    state.gen.dayDate = e.target.value;
    await ensureGenYearLoaded(yearOfISO(state.gen.dayDate));
    renderGen();
  });
  document.getElementById('gen-month-pick').addEventListener('change', async (e) => {
    state.gen.monthYM = e.target.value;
    await ensureGenYearLoaded(parseInt(e.target.value.slice(0, 4), 10));
    renderGen();
  });
  document.getElementById('gen-year-pick').addEventListener('change', async (e) => {
    state.gen.yearY = parseInt(e.target.value, 10);
    await ensureGenYearLoaded(state.gen.yearY);
    renderGen();
  });
}

async function loadGenManifest() {
  try {
    const m = await fetch('./data/manifest.json', { cache: 'no-cache' }).then(r => r.json());
    const g = m.datasets && m.datasets.gen_actual;
    if (g && Array.isArray(g.years)) {
      state.gen.availableYears = g.years.map(y => y.year).sort();
      state.gen.typeCodes = g.type_codes || {};
      populateGenYearSelect();
    } else {
      setGenStatus('Generation dataset not in manifest. Regenerate snapshot.', 'error');
    }
  } catch (e) {
    setGenStatus(`Manifest load failed: ${e.message}`, 'error');
  }
}

function populateGenYearSelect() {
  const sel = document.getElementById('gen-year-pick');
  sel.innerHTML = '';
  for (const y of state.gen.availableYears) {
    const opt = document.createElement('option');
    opt.value = String(y);
    opt.textContent = String(y);
    sel.appendChild(opt);
  }
  let y = state.gen.yearY;
  if (!state.gen.availableYears.includes(y)) {
    y = state.gen.availableYears[state.gen.availableYears.length - 1];
    state.gen.yearY = y;
  }
  sel.value = String(y);
}

async function loadGenActualYear(year) {
  const g = state.gen;
  if (!year) return;
  if (g.loadedYears.has(year)) return;
  if (g.pendingYearLoads.has(year)) return g.pendingYearLoads.get(year);
  if (g.availableYears.length && !g.availableYears.includes(year)) return;
  setGenStatus(`Loading ${year} generation data…`);
  const p = fetch(`./data/gen_actual_${year}.json`, { cache: 'no-cache' })
    .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
    .then(j => {
      const idx = new Map();
      for (const row of (j.rows || [])) {
        idx.set(`${row.z}|${row.t}|${row.d}`, row.p);
      }
      g.actualByYear.set(year, idx);
      g.loadedYears.add(year);
      g.pendingYearLoads.delete(year);
      maybeHideGenStatus();
    })
    .catch(err => {
      g.pendingYearLoads.delete(year);
      setGenStatus(`Failed to load ${year}: ${err.message}`, 'error');
    });
  g.pendingYearLoads.set(year, p);
  return p;
}

async function loadGenClimatology() {
  const g = state.gen;
  if (g.climLoaded) return;
  if (g.climPending) return g.climPending;
  setGenStatus('Loading climatology…');
  g.climPending = fetch('./data/gen_climatology.json', { cache: 'no-cache' })
    .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
    .then(j => {
      g.climDaily = new Map();
      for (const r of (j.daily || [])) {
        g.climDaily.set(`${r.z}|${r.t}|${r.doy}`, r);
      }
      g.climHourly = new Map();
      for (const r of (j.hourly || [])) {
        g.climHourly.set(`${r.z}|${r.t}|${r.m}|${r.h}`, r);
      }
      g.climMonthly = new Map();
      for (const r of (j.monthly || [])) {
        g.climMonthly.set(`${r.z}|${r.t}|${r.m}`, r);
      }
      g.climLoaded = true;
      g.climPending = null;
      maybeHideGenStatus();
    })
    .catch(err => {
      g.climPending = null;
      setGenStatus(`Climatology load failed: ${err.message}`, 'error');
    });
  return g.climPending;
}

async function ensureGenYearLoaded(year) {
  await loadGenActualYear(year);
}

function setGenStatus(msg, level) {
  const el = document.getElementById('gen-status');
  el.textContent = msg;
  el.classList.remove('hidden');
  el.classList.toggle('error', level === 'error');
}
function maybeHideGenStatus() {
  const g = state.gen;
  if (g.climLoaded && g.loadedYears.size > 0) {
    document.getElementById('gen-status').classList.add('hidden');
  }
}

// ----- Data lookups -----------------------------------------
// Day-of-year (1..366) for an ISO date string, leap-year aware.
function doyOfISO(iso) {
  const d = parseISO(iso);
  const start = Date.UTC(d.getUTCFullYear(), 0, 1);
  return Math.floor((d.getTime() - start) / 86400000) + 1;
}

// Resolve the effective production-type code(s) for a UI selection.
// 'WIND' expands to [B18, B19]; everything else stays as one code.
function genTypeCodes(uiType) {
  return uiType === 'WIND' ? WIND_COMPONENTS : [uiType];
}

// Actual hourly array for one day. For pseudo-type WIND, sums components.
function genActualHoursForDate(zone, uiType, isoDate) {
  const yr = yearOfISO(isoDate);
  const yearIdx = state.gen.actualByYear.get(yr);
  if (!yearIdx) return null;
  const codes = genTypeCodes(uiType);
  const out = new Array(24).fill(null);
  let anyHit = false;
  for (const code of codes) {
    const arr = yearIdx.get(`${zone}|${code}|${isoDate}`);
    if (!arr) continue;
    anyHit = true;
    for (let i = 0; i < Math.min(arr.length, 24); i++) {
      if (arr[i] == null) continue;
      out[i] = (out[i] == null ? 0 : out[i]) + arr[i];
    }
  }
  return anyHit ? out : null;
}

// Daily average for a date.
function genActualDailyAvg(zone, uiType, isoDate) {
  const arr = genActualHoursForDate(zone, uiType, isoDate);
  if (!arr) return null;
  let s = 0, n = 0;
  for (const v of arr) { if (v != null) { s += v; n++; } }
  return n > 0 ? s / n : null;
}

// Climatology lookups — pseudo-type WIND sums components stats.
function climLookup(map, keyParts, codes) {
  // keyParts is [...prefix without type]; we append type and try to merge stats
  let mean = 0, p5 = 0, p95 = 0, p50 = 0, n = Infinity, anyHit = false;
  for (const code of codes) {
    const key = [keyParts[0], code, ...keyParts.slice(1)].join('|');
    const v = map.get(key);
    if (!v) continue;
    anyHit = true;
    mean += v.mean ?? 0;
    p5   += v.p5   ?? 0;
    p95  += v.p95  ?? 0;
    p50  += v.p50  ?? 0;
    if (v.n != null) n = Math.min(n, v.n);
  }
  if (!anyHit) return null;
  return { mean, p5, p95, p50, n: n === Infinity ? null : n };
}

function climForDoy(zone, uiType, doy) {
  if (!state.gen.climDaily) return null;
  return climLookup(state.gen.climDaily, [zone, doy], genTypeCodes(uiType));
}
function climForMonthHour(zone, uiType, month, hour) {
  if (!state.gen.climHourly) return null;
  return climLookup(state.gen.climHourly, [zone, month, hour], genTypeCodes(uiType));
}
function climForMonth(zone, uiType, month) {
  if (!state.gen.climMonthly) return null;
  return climLookup(state.gen.climMonthly, [zone, month], genTypeCodes(uiType));
}

// ----- Render entry -----------------------------------------
function renderGen() {
  if (!state.gen.isInit) return;
  if (!state.gen.climLoaded) { return; }   // wait for climatology
  renderGenDay();
  renderGenMonth();
  renderGenYear();
}

function genTypeLabel(code) {
  const opt = GEN_TYPE_OPTIONS.find(o => o.code === code);
  return opt ? opt.label : code;
}

// ----- Day section ------------------------------------------
function renderGenDay() {
  const { zone, type, dayDate } = state.gen;
  document.getElementById('gen-day-title').textContent =
    `Day: ${dayDate} · ${zone} · ${genTypeLabel(type)}`;

  const actual = genActualHoursForDate(zone, type, dayDate);
  const month = parseInt(dayDate.slice(5, 7), 10);

  const points = [];
  for (let h = 1; h <= 24; h++) {
    const clim = climForMonthHour(zone, type, month, h);
    points.push({
      x: h,
      label: String(h),
      actual: actual ? actual[h - 1] : null,
      mean:   clim ? clim.mean : null,
      p5:     clim ? clim.p5   : null,
      p95:    clim ? clim.p95  : null,
    });
  }
  drawGenLineChart('gen-day-chart', points, {
    xAxisTitle: 'CET hour',
    tooltipFor: (p) => formatGenTooltip('Hour ' + p.label, p),
  });
  fillGenStats('gen-day-stats', `Day ${dayDate}`, points);
}

// ----- Month section ----------------------------------------
function renderGenMonth() {
  const { zone, type, monthYM } = state.gen;
  document.getElementById('gen-month-title').textContent =
    `Month: ${monthYM} · ${zone} · ${genTypeLabel(type)}`;

  const month = parseInt(monthYM.slice(5), 10);
  const days = isoDatesOfMonth(monthYM);

  // Daily series
  const dailyPoints = days.map((iso, i) => {
    const doy = doyOfISO(iso);
    const clim = climForDoy(zone, type, doy);
    return {
      x: i + 1,
      label: iso.slice(8),
      isoDate: iso,
      actual: genActualDailyAvg(zone, type, iso),
      mean: clim ? clim.mean : null,
      p5:   clim ? clim.p5   : null,
      p95:  clim ? clim.p95  : null,
    };
  });
  drawGenLineChart('gen-month-daily', dailyPoints, {
    xAxisTitle: 'Day of month',
    xLabelEvery: dailyPoints.length > 18 ? 3 : 2,
    tooltipFor: (p) => formatGenTooltip(p.isoDate, p),
  });

  // 24h profile over month (avg actual at hour h across days)
  const profilePoints = [];
  for (let h = 1; h <= 24; h++) {
    let s = 0, n = 0;
    for (const iso of days) {
      const arr = genActualHoursForDate(zone, type, iso);
      if (arr && arr[h - 1] != null) { s += arr[h - 1]; n++; }
    }
    const actualAvg = n > 0 ? s / n : null;
    const clim = climForMonthHour(zone, type, month, h);
    profilePoints.push({
      x: h, label: String(h),
      actual: actualAvg,
      mean: clim ? clim.mean : null,
      p5:   clim ? clim.p5   : null,
      p95:  clim ? clim.p95  : null,
    });
  }
  drawGenLineChart('gen-month-hourly', profilePoints, {
    xAxisTitle: 'CET hour',
    tooltipFor: (p) => formatGenTooltip('Hour ' + p.label, p),
  });

  fillGenStats('gen-month-stats', `Month ${monthYM}`, dailyPoints);
}

// ----- Year section -----------------------------------------
function renderGenYear() {
  const { zone, type, yearY } = state.gen;
  document.getElementById('gen-year-title').textContent =
    `Year: ${yearY} · ${zone} · ${genTypeLabel(type)}`;

  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const today = todayISO();

  // Monthly series
  const monthlyPoints = months.map((mLab, mi) => {
    const m = mi + 1;
    const ym = `${yearY}-${String(m).padStart(2, '0')}`;
    const days = isoDatesOfMonth(ym).filter(d => d <= today);
    let s = 0, n = 0;
    for (const iso of days) {
      const v = genActualDailyAvg(zone, type, iso);
      if (v != null) { s += v; n++; }
    }
    const actual = n > 0 ? s / n : null;
    const clim = climForMonth(zone, type, m);
    return {
      x: m, label: mLab, monthLabel: ym,
      actual,
      mean: clim ? clim.mean : null,
      p5:   clim ? clim.p5   : null,
      p95:  clim ? clim.p95  : null,
    };
  });
  drawGenLineChart('gen-year-monthly', monthlyPoints, {
    xAxisTitle: 'Month',
    xLabelEvery: 1,
    tooltipFor: (p) => formatGenTooltip(p.monthLabel, p),
  });

  // 24h profile over year: avg actual at hour h across all days of yearY
  // Climatology baseline: average over all 12 months' (month, hour) cells.
  const yearDates = isoDatesOfYear(yearY).filter(d => d <= today);
  const yearProfile = [];
  for (let h = 1; h <= 24; h++) {
    let sumA = 0, nA = 0;
    for (const iso of yearDates) {
      const arr = genActualHoursForDate(zone, type, iso);
      if (arr && arr[h - 1] != null) { sumA += arr[h - 1]; nA++; }
    }
    const actualAvg = nA > 0 ? sumA / nA : null;
    // Combine clim across 12 months
    let cm = 0, c5 = 0, c95 = 0, cn = 0;
    for (let m = 1; m <= 12; m++) {
      const cell = climForMonthHour(zone, type, m, h);
      if (!cell || cell.mean == null) continue;
      cm += cell.mean; c5 += cell.p5; c95 += cell.p95; cn++;
    }
    const mean = cn > 0 ? cm / cn : null;
    const p5 = cn > 0 ? c5 / cn : null;
    const p95 = cn > 0 ? c95 / cn : null;
    yearProfile.push({ x: h, label: String(h), actual: actualAvg, mean, p5, p95 });
  }
  drawGenLineChart('gen-year-hourly', yearProfile, {
    xAxisTitle: 'CET hour',
    tooltipFor: (p) => formatGenTooltip('Hour ' + p.label, p),
  });

  fillGenStats('gen-year-stats', `Year ${yearY}`, monthlyPoints);
}

// ----- Side stats -------------------------------------------
function fillGenStats(elId, periodLabel, points) {
  const validActual = points.filter(p => p.actual != null);
  const validMean   = points.filter(p => p.mean   != null);
  const avgA = validActual.length ? validActual.reduce((a, p) => a + p.actual, 0) / validActual.length : null;
  const avgM = validMean.length   ? validMean.reduce((a, p) => a + p.mean,   0) / validMean.length   : null;
  const deviation = (avgA != null && avgM != null && avgM > 0)
    ? ((avgA - avgM) / avgM) * 100 : null;

  // Find peak (actual)
  let peak = null, peakV = -Infinity;
  for (const p of points) {
    if (p.actual != null && p.actual > peakV) { peakV = p.actual; peak = p; }
  }
  const fmtMw = v => v == null ? '<span class="val muted">—</span>'
                                : `<span class="val">${v.toFixed(0)} MW</span>`;
  const devTxt = deviation == null ? '<span class="val muted">—</span>'
    : `<span class="val" style="color:${deviation >= 0 ? '#2a9460' : '#c63b2f'};">${deviation >= 0 ? '+' : ''}${deviation.toFixed(1)}%</span>`;
  document.getElementById(elId).innerHTML = `
    <h4>${escapeHtml(periodLabel)}</h4>
    <div class="sp-stat-row"><span class="lbl">Actual avg</span>${fmtMw(avgA)}</div>
    <div class="sp-stat-row"><span class="lbl">Historical mean</span>${fmtMw(avgM)}</div>
    <div class="sp-stat-row net"><span class="lbl">vs historical</span>${devTxt}</div>
    <div class="sp-stat-row"><span class="lbl">Peak actual</span>${
      peak ? `<span class="val">${peakV.toFixed(0)} MW · ${escapeHtml(peak.label)}</span>` : '<span class="val muted">—</span>'
    }</div>
    <div class="sp-stat-row"><span class="lbl">Points</span><span class="val">${validActual.length}/${points.length}</span></div>
    <div class="gen-legend" style="margin-top:8px;">
      <span><span class="swatch actual"></span>Actual</span>
      <span><span class="swatch hist-mean"></span>Hist mean</span>
      <span><span class="swatch corridor"></span>P5–P95</span>
    </div>
  `;
}

// ----- Tooltip formatter ------------------------------------
function formatGenTooltip(headerLabel, p) {
  const fmt = v => v == null ? '<span class="lbl">—</span>'
                              : `<strong>${v.toFixed(0)} MW</strong>`;
  return `
    <div class="ttl">${escapeHtml(headerLabel)}</div>
    <div class="row"><span class="lbl">Actual</span>${fmt(p.actual)}</div>
    <div class="row"><span class="lbl">Hist mean</span>${fmt(p.mean)}</div>
    <div class="row"><span class="lbl">P5–P95</span>${
      p.p5 != null && p.p95 != null
        ? `<strong>${p.p5.toFixed(0)}–${p.p95.toFixed(0)} MW</strong>`
        : '<span class="lbl">—</span>'
    }</div>`;
}

// ----- Line chart drawer ------------------------------------
function drawGenLineChart(svgId, points, opts) {
  const svg = d3.select(`#${svgId}`);
  svg.selectAll('*').remove();
  svg.classed('gen-svg', true);
  // For the day-section chart we want a taller canvas (280px); CSS sets 240
  // for other gen charts so we fall back to that.
  const isDayChart = svgId === 'gen-day-chart';
  const { W, H } = spChartDims(svg, isDayChart ? 280 : 240);
  const padL = 44, padR = 14, padT = 14, padB = 30;
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;

  // Collect numeric values for y-range
  const allVals = [];
  for (const p of points) {
    if (p.actual != null) allVals.push(p.actual);
    if (p.mean   != null) allVals.push(p.mean);
    if (p.p5     != null) allVals.push(p.p5);
    if (p.p95    != null) allVals.push(p.p95);
  }
  if (allVals.length === 0) {
    svg.append('text').attr('x', W / 2).attr('y', H / 2).attr('text-anchor', 'middle')
       .attr('fill', '#cdd2da').attr('font-size', 13).text('No data');
    return;
  }
  let yMin = Math.min(0, ...allVals);
  let yMax = Math.max(...allVals);
  if (yMin === yMax) { yMax = yMin + 1; }
  const pad = (yMax - yMin) * 0.08;
  yMax += pad;
  if (yMin < 0) yMin -= pad;
  const yScale = v => padT + innerH * (1 - (v - yMin) / (yMax - yMin));

  const n = points.length;
  const xScale = i => padL + (n === 1 ? innerW / 2 : (i / (n - 1)) * innerW);

  // Y gridlines + tick labels (4-5 ticks)
  const tickCount = 5;
  const tickStep = (yMax - yMin) / (tickCount - 1);
  for (let k = 0; k < tickCount; k++) {
    const v = yMin + tickStep * k;
    const y = yScale(v);
    svg.append('line')
       .attr('class', Math.abs(v) < 1e-6 ? 'y-zero' : 'y-grid')
       .attr('x1', padL).attr('x2', W - padR)
       .attr('y1', y).attr('y2', y);
    svg.append('text')
       .attr('class', 'y-tick')
       .attr('x', padL - 5).attr('y', y + 3)
       .attr('text-anchor', 'end')
       .text(v.toFixed(0));
  }

  // P5-P95 corridor (path with upper + lower boundaries)
  const cPts = points.filter(p => p.p5 != null && p.p95 != null);
  if (cPts.length >= 2) {
    let d = '';
    // upper edge L→R
    for (let i = 0; i < points.length; i++) {
      const p = points[i];
      if (p.p95 == null) continue;
      d += (d === '' ? 'M' : ' L') + xScale(i).toFixed(1) + ' ' + yScale(p.p95).toFixed(1);
    }
    // lower edge R→L
    for (let i = points.length - 1; i >= 0; i--) {
      const p = points[i];
      if (p.p5 == null) continue;
      d += ' L' + xScale(i).toFixed(1) + ' ' + yScale(p.p5).toFixed(1);
    }
    d += ' Z';
    svg.append('path').attr('class', 'corridor').attr('d', d)
       .attr('opacity', 0)
       .transition().duration(500).attr('opacity', 1);
  }

  // Historical mean line (dashed)
  const meanLine = d3.line()
    .defined(d => d.mean != null)
    .x((d, i) => xScale(i))
    .y(d => yScale(d.mean))
    .curve(d3.curveMonotoneX);
  svg.append('path').datum(points).attr('class', 'hist-mean')
     .attr('d', meanLine).attr('opacity', 0)
     .transition().duration(500).delay(150).attr('opacity', 1);

  // Actual line (solid)
  const actualLine = d3.line()
    .defined(d => d.actual != null)
    .x((d, i) => xScale(i))
    .y(d => yScale(d.actual))
    .curve(d3.curveMonotoneX);
  svg.append('path').datum(points).attr('class', 'actual')
     .attr('d', actualLine).attr('opacity', 0)
     .transition().duration(500).delay(300).attr('opacity', 1);

  // X labels
  const xLabelEvery = opts.xLabelEvery || 1;
  const xLabels = [];
  for (let i = 0; i < n; i++) {
    if (i % xLabelEvery !== 0 && i !== n - 1) continue;
    const lab = svg.append('text')
      .attr('class', 'x-label')
      .attr('data-idx', i)
      .attr('x', xScale(i)).attr('y', H - 10)
      .attr('text-anchor', 'middle')
      .text(points[i].label);
    xLabels.push(lab);
  }

  // Vertical crosshair + dots (hidden initially)
  const cross = svg.append('line')
    .attr('class', 'crosshair')
    .attr('y1', padT).attr('y2', H - padB);
  const aDot = svg.append('circle').attr('class', 'actual-dot').attr('r', 4);
  const hDot = svg.append('circle').attr('class', 'hist-dot').attr('r', 4);

  // Tooltip element
  const tt = document.getElementById('gen-tooltip');
  function showTooltip(i, evt) {
    if (!tt) return;
    tt.innerHTML = opts.tooltipFor(points[i]);
    tt.classList.add('visible');
    const x = evt.clientX + 14, y = evt.clientY + 14;
    const tw = tt.offsetWidth, th = tt.offsetHeight;
    tt.style.left = `${Math.min(x, window.innerWidth - tw - 8)}px`;
    tt.style.top  = `${Math.min(y, window.innerHeight - th - 8)}px`;
  }
  function hideTooltip() { if (tt) tt.classList.remove('visible'); }
  function setHotIdx(i) {
    cross.attr('x1', xScale(i)).attr('x2', xScale(i)).classed('visible', true);
    const p = points[i];
    if (p.actual != null) {
      aDot.attr('cx', xScale(i)).attr('cy', yScale(p.actual)).classed('hot', true);
    } else aDot.classed('hot', false);
    if (p.mean != null) {
      hDot.attr('cx', xScale(i)).attr('cy', yScale(p.mean)).classed('hot', true);
    } else hDot.classed('hot', false);
    xLabels.forEach(lab => lab.classed('hot', parseInt(lab.attr('data-idx'), 10) === i));
  }
  function clearHot() {
    cross.classed('visible', false);
    aDot.classed('hot', false);
    hDot.classed('hot', false);
    xLabels.forEach(lab => lab.classed('hot', false));
  }

  // Invisible hit-zones — one per data point
  for (let i = 0; i < n; i++) {
    const halfStep = innerW / Math.max(n - 1, 1) / 2;
    const x0 = xScale(i) - halfStep;
    const w  = halfStep * 2;
    svg.append('rect')
      .attr('x', x0).attr('y', padT)
      .attr('width', w).attr('height', innerH)
      .attr('fill', 'transparent').style('pointer-events', 'all')
      .on('mouseenter', (evt) => { setHotIdx(i); showTooltip(i, evt); })
      .on('mousemove',  (evt) => { showTooltip(i, evt); })
      .on('mouseleave', () => { clearHot(); hideTooltip(); });
  }
}

// =============================================================
// =============================================================
// PRODUCT DYNAMICS TAB
// Per-zone trend explorer for Peak / Off-peak / TB2 / TB4 /
// PV capture / Wind capture across multiple time horizons,
// expressed as % of baseload (default) or absolute EUR/MWh.
// =============================================================
// =============================================================

state.pd = {
  isInit: false,
  zone: 'HU',
  product: 'peak',     // peak | offpeak | tb2 | tb4 | pv | wind
  unit: 'pct',         // pct | eur
};

// Friendly product names — match the option labels in #pd-product.
const PD_PRODUCT_LABELS = {
  peak: 'Peak', offpeak: 'Off-peak',
  tb2: 'TB2 spread', tb4: 'TB4 spread',
  pv: 'PV capture', wind: 'Wind capture',
};

// Year color palette: older years stay grey, recent year emphasised blue,
// current year amber. Chronological darkening within the grey ramp.
function pdYearColor(year, currentYear) {
  if (year === currentYear) return '#BA7517';   // amber
  if (year === currentYear - 1) return '#378ADD';  // blue
  // Map prior years to grey ramp; older = lighter.
  const ageBack = currentYear - 1 - year;       // 1..N
  const palette = ['#5F5E5A', '#888780', '#B4B2A9', '#D3D1C7', '#E0DED7'];
  return palette[Math.min(ageBack - 1, palette.length - 1)] || '#D3D1C7';
}

// ----- Init -------------------------------------------------
async function initDynamicsView() {
  if (state.pd.isInit) return;
  populatePdZoneSelect();
  bindPdControls();
  state.pd.isInit = true;
  if (!state.data) setPdStatus('Waiting for daily DAM dataset…', 'error');
  else hidePdStatus();
}

function populatePdZoneSelect() {
  const sel = document.getElementById('pd-zone');
  sel.innerHTML = '';
  for (const z of ZONES.slice().sort((a, b) => a.code.localeCompare(b.code))) {
    const opt = document.createElement('option');
    opt.value = z.code;
    opt.textContent = `${z.code} — ${z.name}`;
    sel.appendChild(opt);
  }
  sel.value = state.pd.zone;
}

function bindPdControls() {
  document.getElementById('pd-zone').addEventListener('change', (e) => {
    state.pd.zone = e.target.value;
    renderDynamics();
  });
  document.getElementById('pd-product').addEventListener('change', (e) => {
    state.pd.product = e.target.value;
    renderDynamics();
  });
  document.querySelectorAll('[data-pd-unit]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('[data-pd-unit]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.pd.unit = btn.dataset.pdUnit;
      renderDynamics();
    });
  });
}

function setPdStatus(msg, level) {
  const el = document.getElementById('pd-status');
  el.textContent = msg;
  el.classList.remove('hidden');
  el.classList.toggle('error', level === 'error');
}
function hidePdStatus() {
  document.getElementById('pd-status').classList.add('hidden');
}

// ----- Aggregations -----------------------------------------
// productField maps UI key → dam_daily.json reshaped key
function pdProductField(p) {
  return ({ peak:'peak', offpeak:'offpeak', tb2:'tb2', tb4:'tb4', pv:'pv', wind:'wind' })[p] || 'mean';
}
// Spread-class products are expressed as ratio of baseload, not delta.
function pdIsSpreadProduct(p) {
  return p === 'tb2' || p === 'tb4';
}

// Mean of a numeric field across rows; falls back to mean for peak/offpeak.
function pdMeanField(rows, field) {
  let s = 0, n = 0;
  for (const r of rows) {
    if (r[field] != null) { s += r[field]; n++; }
  }
  if (n > 0) return s / n;
  if (field === 'peak' || field === 'offpeak') {
    let sm = 0, nm = 0;
    for (const r of rows) if (r.mean != null) { sm += r.mean; nm++; }
    return nm > 0 ? sm / nm : null;
  }
  return null;
}

// Returns {value, baseload, pct, rowsUsed} for the given (zone, product,
// inclusive date range MM/DD bounds within year).
function pdAggregate(zone, product, year, monthFrom, monthTo) {
  const series = state.data && state.data.get(zone);
  if (!series) return null;
  const fromISO = `${year}-${String(monthFrom).padStart(2, '0')}-01`;
  const lastDay = new Date(Date.UTC(year, monthTo, 0)).getUTCDate();
  const toISO = `${year}-${String(monthTo).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
  const rows = series.filter(r => r.date >= fromISO && r.date <= toISO);
  if (rows.length === 0) return null;
  const field = pdProductField(product);
  // PV/Wind → volume-weighted period capture (SUM(p·v) / SUM(v)).
  // Everything else → arithmetic mean of daily values.
  const value = (product === 'pv' || product === 'wind')
    ? weightedCapturePrice(rows, product)
    : pdMeanField(rows, field);
  const baseload = pdMeanField(rows, 'mean');
  if (value == null && baseload == null) return null;
  // % computation
  let pct = null;
  if (baseload != null && baseload !== 0 && value != null) {
    pct = pdIsSpreadProduct(product)
        ? (value / Math.abs(baseload)) * 100
        : ((value - baseload) / Math.abs(baseload)) * 100;
  }
  return { value, baseload, pct, days: rows.length };
}

// Available years in state.data, sorted ascending.
function pdAvailableYears() {
  if (!state.data) return [];
  const ys = new Set();
  for (const arr of state.data.values()) {
    for (const r of arr) ys.add(parseInt(r.date.slice(0, 4), 10));
  }
  return [...ys].sort((a, b) => a - b);
}

// ----- Render entry -----------------------------------------
function renderDynamics() {
  if (!state.pd.isInit) return;
  if (!state.data) { setPdStatus('Daily dataset not loaded.', 'error'); return; }
  hidePdStatus();
  const { zone, product, unit } = state.pd;
  const unitLabel = unit === 'pct' ? '% vs baseload' : 'EUR/MWh';
  const productLabel = PD_PRODUCT_LABELS[product] || product;
  document.getElementById('pd-title-monthly').textContent =
    `Monthly — ${productLabel} · ${zone} · ${unitLabel}`;
  document.getElementById('pd-title-quarterly').textContent =
    `Quarterly — ${productLabel} · ${zone} · ${unitLabel}`;
  document.getElementById('pd-title-yearly').textContent =
    `Yearly — ${productLabel} · ${zone} · ${unitLabel}`;

  const years = pdAvailableYears();
  const currentYear = new Date().getUTCFullYear();
  // Keep last 5 years + current = up to 6 columns
  const yearsShown = years.slice(-6);

  renderPdMonthly(yearsShown, currentYear);
  renderPdQuarterly(yearsShown, currentYear);
  renderPdYearly(yearsShown, currentYear);
}

// ----- Monthly section --------------------------------------
function renderPdMonthly(years, currentYear) {
  const { zone, product, unit } = state.pd;
  // 12 months × N years → values
  const matrix = years.map(y => {
    const cells = [];
    for (let m = 1; m <= 12; m++) {
      const agg = pdAggregate(zone, product, y, m, m);
      cells.push(agg);
    }
    return { year: y, cells };
  });

  // Transposed table: rows = years (+ Avg row), cols = months 1..12 (+ Avg col)
  const monthLabels = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const tbl = document.getElementById('pd-table-monthly');
  let thead = '<thead><tr><th>Year</th>';
  for (let m = 1; m <= 12; m++) thead += `<th>${m}</th>`;
  thead += '<th>Avg</th></tr></thead>';
  let tbody = '<tbody>';
  for (let yi = 0; yi < years.length; yi++) {
    const isCur = years[yi] === currentYear;
    tbody += `<tr class="${isCur ? 'pd-cur-row' : ''}"><td>${String(years[yi]).slice(2)}</td>`;
    for (let m = 0; m < 12; m++) {
      const cell = matrix[yi].cells[m];
      tbody += `<td class="${cell == null ? 'pd-na' : ''}">${pdFmtCell(cell, unit)}</td>`;
    }
    // Row average across months
    const valid = matrix[yi].cells.filter(c => c != null);
    let avg = null;
    if (valid.length) {
      const key = unit === 'pct' ? 'pct' : 'value';
      const arr = valid.map(c => c[key]).filter(v => v != null);
      if (arr.length) avg = arr.reduce((a, b) => a + b, 0) / arr.length;
    }
    tbody += `<td>${avg == null ? '—' : pdFmtVal(avg, unit)}</td></tr>`;
  }
  // Avg row across years per month
  tbody += '<tr class="pd-avg"><td>Avg</td>';
  let grandSum = 0, grandN = 0;
  for (let m = 0; m < 12; m++) {
    let s = 0, n = 0;
    for (let yi = 0; yi < years.length; yi++) {
      const c = matrix[yi].cells[m];
      if (!c) continue;
      const v = unit === 'pct' ? c.pct : c.value;
      if (v != null) { s += v; n++; }
    }
    const v = n > 0 ? s / n : null;
    if (v != null) { grandSum += v; grandN++; }
    tbody += `<td>${v == null ? '—' : pdFmtVal(v, unit)}</td>`;
  }
  const grandAvg = grandN > 0 ? grandSum / grandN : null;
  tbody += `<td>${grandAvg == null ? '—' : pdFmtVal(grandAvg, unit)}</td></tr></tbody>`;
  tbl.innerHTML = thead + tbody;

  // Chart: x = 1..12, one curve per year
  const seriesData = matrix.map(({ year, cells }) => ({
    year,
    points: cells.map((c, i) => ({ x: i + 1, label: monthLabels[i],
      v: c == null ? null : (unit === 'pct' ? c.pct : c.value),
    })),
  }));
  drawPdMultiYearChart('pd-chart-monthly', 'pd-legend-monthly', seriesData,
    monthLabels, currentYear, 1);

  document.getElementById('pd-summary-monthly').innerHTML =
    pdSummaryMonthly(matrix, years, currentYear, unit);
}

// ----- Quarterly section ------------------------------------
function renderPdQuarterly(years, currentYear) {
  const { zone, product, unit } = state.pd;
  // 4 quarters × N years
  const QUARTER_MONTHS = [[1,3],[4,6],[7,9],[10,12]];
  const matrix = years.map(y => ({
    year: y,
    cells: QUARTER_MONTHS.map(([mFrom, mTo]) => pdAggregate(zone, product, y, mFrom, mTo)),
  }));
  // Transposed: rows = years (+ Avg row), cols = Q1..Q4 (+ Avg col)
  const tbl = document.getElementById('pd-table-quarterly');
  let thead = '<thead><tr><th>Year</th><th>Q1</th><th>Q2</th><th>Q3</th><th>Q4</th><th>Avg</th></tr></thead>';
  let tbody = '<tbody>';
  for (let yi = 0; yi < years.length; yi++) {
    const isCur = years[yi] === currentYear;
    tbody += `<tr class="${isCur ? 'pd-cur-row' : ''}"><td>${String(years[yi]).slice(2)}</td>`;
    for (let q = 0; q < 4; q++) {
      const cell = matrix[yi].cells[q];
      tbody += `<td class="${cell == null ? 'pd-na' : ''}">${pdFmtCell(cell, unit)}</td>`;
    }
    const valid = matrix[yi].cells.filter(c => c != null);
    let avg = null;
    if (valid.length) {
      const key = unit === 'pct' ? 'pct' : 'value';
      const arr = valid.map(c => c[key]).filter(v => v != null);
      if (arr.length) avg = arr.reduce((a, b) => a + b, 0) / arr.length;
    }
    tbody += `<td>${avg == null ? '—' : pdFmtVal(avg, unit)}</td></tr>`;
  }
  // Avg row across years per quarter
  tbody += '<tr class="pd-avg"><td>Avg</td>';
  let gSum = 0, gN = 0;
  for (let q = 0; q < 4; q++) {
    let s = 0, n = 0;
    for (let yi = 0; yi < years.length; yi++) {
      const c = matrix[yi].cells[q];
      if (!c) continue;
      const v = unit === 'pct' ? c.pct : c.value;
      if (v != null) { s += v; n++; }
    }
    const v = n > 0 ? s / n : null;
    if (v != null) { gSum += v; gN++; }
    tbody += `<td>${v == null ? '—' : pdFmtVal(v, unit)}</td>`;
  }
  const gAvg = gN > 0 ? gSum / gN : null;
  tbody += `<td>${gAvg == null ? '—' : pdFmtVal(gAvg, unit)}</td></tr></tbody>`;
  tbl.innerHTML = thead + tbody;

  const qLabels = ['Q1','Q2','Q3','Q4'];
  const seriesData = matrix.map(({ year, cells }) => ({
    year,
    points: cells.map((c, i) => ({ x: i + 1, label: qLabels[i],
      v: c == null ? null : (unit === 'pct' ? c.pct : c.value),
    })),
  }));
  drawPdMultiYearChart('pd-chart-quarterly', 'pd-legend-quarterly', seriesData,
    qLabels, currentYear, 1);

  document.getElementById('pd-summary-quarterly').innerHTML =
    pdSummaryQuarterly(matrix, years, currentYear, unit);
}

// ----- Yearly section ---------------------------------------
function renderPdYearly(years, currentYear) {
  const { zone, product, unit } = state.pd;
  const cells = years.map(y => pdAggregate(zone, product, y, 1, 12));

  // Transposed table: cols = years (with current-year column highlighted),
  // rows = Value / YoY / Days.
  let thead = '<thead><tr><th>Metric</th>';
  for (let i = 0; i < years.length; i++) {
    const isCur = years[i] === currentYear;
    thead += `<th class="${isCur ? 'pd-cur-col' : ''}" style="${isCur ? 'color:#b87510;' : ''}">${String(years[i]).slice(2)}</th>`;
  }
  thead += '</tr></thead>';

  // Row 1 — Value
  let row1 = `<tr><td>Value</td>`;
  for (let i = 0; i < years.length; i++) {
    const c = cells[i];
    const isCur = years[i] === currentYear;
    const v = c == null ? '—' : pdFmtVal(unit === 'pct' ? c.pct : c.value, unit);
    row1 += `<td style="${isCur ? 'background:rgba(245,166,35,0.10);font-weight:700;color:#b87510;' : ''}">${v}</td>`;
  }
  row1 += '</tr>';

  // Row 2 — YoY
  let row2 = '<tr><td>YoY</td>';
  for (let i = 0; i < years.length; i++) {
    const cur = cells[i];
    const prev = i > 0 ? cells[i - 1] : null;
    const isCur = years[i] === currentYear;
    let yoyFmt = '—';
    if (cur != null && prev != null) {
      const k = unit === 'pct' ? 'pct' : 'value';
      if (cur[k] != null && prev[k] != null) {
        const d = cur[k] - prev[k];
        yoyFmt = (d >= 0 ? '+' : '') + pdFmtVal(d, unit);
      }
    }
    row2 += `<td style="${isCur ? 'background:rgba(245,166,35,0.10);' : ''}">${yoyFmt}</td>`;
  }
  row2 += '</tr>';

  // Row 3 — Days
  let row3 = '<tr><td>Days</td>';
  for (let i = 0; i < years.length; i++) {
    const c = cells[i];
    const isCur = years[i] === currentYear;
    const days = c ? c.days : 0;
    row3 += `<td style="${isCur ? 'background:rgba(245,166,35,0.10);' : ''}">${days}${isCur ? ' ytd' : ''}</td>`;
  }
  row3 += '</tr>';

  document.getElementById('pd-table-yearly').innerHTML = thead + '<tbody>' + row1 + row2 + row3 + '</tbody>';

  // Chart: single curve with linear regression trend (closed-year-only).
  // Partial current year shows as a data point but is excluded from the
  // regression so the trend stays stable until year-end.
  const pts = years.map((y, i) => {
    const c = cells[i];
    return { x: i + 1, label: String(y), year: y,
      v: c == null ? null : (unit === 'pct' ? c.pct : c.value),
    };
  });
  const cutoff = pdLatestClosedMonth();
  const closedPts = pts.filter(p => p.v != null && pdIsYearClosed(p.year, cutoff));
  const regression = closedPts.length >= 2
    ? pdLinearRegression(closedPts.map(p => p.x), closedPts.map(p => p.v))
    : { slope: null, intercept: null, r2: null, n: 0 };
  drawPdYearlyChart('pd-chart-yearly', 'pd-legend-yearly', pts, regression, currentYear);

  document.getElementById('pd-summary-yearly').innerHTML =
    pdSummaryYearly(cells, years, currentYear, unit, regression);
}

// ----- Formatting helpers -----------------------------------
function pdFmtCell(cell, unit) {
  if (cell == null) return '—';
  const v = unit === 'pct' ? cell.pct : cell.value;
  return v == null ? '—' : pdFmtVal(v, unit);
}
function pdFmtVal(v, unit) {
  if (v == null) return '—';
  if (unit === 'pct') {
    const sign = v > 0 ? '+' : '';
    return `${sign}${v.toFixed(1)}%`;
  }
  return v.toFixed(1);
}

// ----- Linear regression ------------------------------------
function pdLinearRegression(xs, ys) {
  const n = xs.length;
  if (n < 2) return { slope: null, intercept: null, r2: null, n };
  const xMean = xs.reduce((a, b) => a + b, 0) / n;
  const yMean = ys.reduce((a, b) => a + b, 0) / n;
  let num = 0, den = 0;
  for (let i = 0; i < n; i++) {
    num += (xs[i] - xMean) * (ys[i] - yMean);
    den += (xs[i] - xMean) ** 2;
  }
  if (den === 0) return { slope: 0, intercept: yMean, r2: 0, n };
  const slope = num / den;
  const intercept = yMean - slope * xMean;
  let ssRes = 0, ssTot = 0;
  for (let i = 0; i < n; i++) {
    const yi = intercept + slope * xs[i];
    ssRes += (ys[i] - yi) ** 2;
    ssTot += (ys[i] - yMean) ** 2;
  }
  const r2 = ssTot === 0 ? 1 : 1 - ssRes / ssTot;
  return { slope, intercept, r2, n };
}

// ----- "Latest closed month" rule ---------------------------
// Summaries should not flicker mid-month from partial data. A month is
// considered "closed" only on day 5 of the following month. So on May 29
// the latest closed month is April; on June 4 it is still April; on June 5
// it becomes May.
function pdLatestClosedMonth() {
  const today = new Date();
  const day = today.getUTCDate();
  let m = today.getUTCMonth() + 1;     // 1..12
  let y = today.getUTCFullYear();
  m = day >= 5 ? m - 1 : m - 2;
  while (m <= 0) { m += 12; y -= 1; }
  return { year: y, month: m };
}
function pdIsCellClosed(year, month1To12, cutoff) {
  if (year < cutoff.year) return true;
  if (year > cutoff.year) return false;
  return month1To12 <= cutoff.month;
}
function pdIsQuarterClosed(year, quarter1To4, cutoff) {
  // A quarter is closed if its last month is at or before cutoff
  return pdIsCellClosed(year, quarter1To4 * 3, cutoff);
}
function pdIsYearClosed(year, cutoff) {
  return pdIsCellClosed(year, 12, cutoff);
}
function pdCutoffLabel(cutoff) {
  const monthLabels = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${monthLabels[cutoff.month - 1]} ${cutoff.year}`;
}

// ----- Auto-generated summaries -----------------------------
function pdTrendTag(r2, slope, unit) {
  if (slope == null || r2 == null) return { tag: 'flat', text: 'no clear trend' };
  // Noise floor: for % unit, slope < 0.3 pp/yr is noise; for EUR ~1 EUR/yr
  const noiseFloor = unit === 'pct' ? 0.3 : 1.0;
  if (Math.abs(slope) < noiseFloor || r2 < 0.40) return { tag: 'flat', text: 'no clear trend' };
  if (r2 >= 0.70) return { tag: 'strong', text: slope > 0 ? 'strong upward' : 'strong downward' };
  return { tag: '', text: slope > 0 ? 'moderate upward' : 'moderate downward' };
}

function pdSummaryMonthly(matrix, years, currentYear, unit) {
  // Trend analysis uses only fully CLOSED months (per the 5th-of-month rule
  // — see pdLatestClosedMonth). Current partial month is excluded so the
  // comment doesn't flicker mid-month.
  const cutoff = pdLatestClosedMonth();
  const filtered = matrix.map(({ year, cells }) => ({
    year,
    cells: cells.map((c, mi) => pdIsCellClosed(year, mi + 1, cutoff) ? c : null),
  }));
  const annual = filtered.map(({ year, cells }) => {
    const arr = cells.map(c => c == null ? null : (unit === 'pct' ? c.pct : c.value))
                     .filter(v => v != null);
    return { year, avg: arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null };
  }).filter(a => a.avg != null);
  // Reuse `matrix` reference name below by aliasing the filtered set.
  matrix = filtered;
  if (annual.length < 2) return `<span class="pd-tag flat">N/A</span>Insufficient history to assess monthly trend.`;
  const xs = annual.map(a => a.year);
  const ys = annual.map(a => a.avg);
  const reg = pdLinearRegression(xs, ys);
  const trend = pdTrendTag(reg.r2, reg.slope, unit);

  const first = annual[0], last = annual[annual.length - 1];
  const deltaTxt = pdFmtVal(last.avg - first.avg, unit);
  const u = unit === 'pct' ? '%' : ' €';

  // Find which months expanded/compressed most
  let bestMonth = null, bestDelta = -Infinity, worstMonth = null, worstDelta = Infinity;
  const monthLabels = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  if (matrix.length >= 2) {
    const firstM = matrix.find(m => m.year === first.year);
    const lastM  = matrix.find(m => m.year === last.year);
    if (firstM && lastM) {
      for (let m = 0; m < 12; m++) {
        const f = firstM.cells[m], l = lastM.cells[m];
        if (f && l) {
          const k = unit === 'pct' ? 'pct' : 'value';
          if (f[k] != null && l[k] != null) {
            const d = l[k] - f[k];
            if (d > bestDelta)  { bestDelta = d;  bestMonth = monthLabels[m]; }
            if (d < worstDelta) { worstDelta = d; worstMonth = monthLabels[m]; }
          }
        }
      }
    }
  }

  if (trend.tag === 'flat') {
    return `<span class="pd-tag flat">No trend</span>` +
           `Annual averages stayed within ${pdFmtVal(Math.max(...ys) - Math.min(...ys), unit)} range over ${annual.length} years (R²=${reg.r2 == null ? '—' : reg.r2.toFixed(2)}). ` +
           `No systematic monthly directional pattern detected.`;
  }
  return `<span class="pd-tag ${trend.tag}">${trend.text}</span>` +
         `<strong>Annual mean shifted ${deltaTxt} over ${last.year - first.year} years</strong> (slope ${pdFmtVal(reg.slope, unit)}/yr, R²=${reg.r2.toFixed(2)}). ` +
         (bestMonth ? `Largest expansion: <strong>${bestMonth}</strong> (${pdFmtVal(bestDelta, unit)}). ` : '') +
         (worstMonth && worstMonth !== bestMonth ? `Largest compression: <strong>${worstMonth}</strong> (${pdFmtVal(worstDelta, unit)}). ` : '') +
         `Idea: the seasonal months with biggest expansion are where forward premium has most repriced — those carry the most directional information for Cal-front hedging.`;
}

function pdSummaryQuarterly(matrix, years, currentYear, unit) {
  // Drop in-progress quarter from analysis (5th-day rule on month boundary).
  const cutoff = pdLatestClosedMonth();
  const filtered = matrix.map(({ year, cells }) => ({
    year,
    cells: cells.map((c, qi) => pdIsQuarterClosed(year, qi + 1, cutoff) ? c : null),
  }));
  matrix = filtered;
  const annual = matrix.map(({ year, cells }) => {
    const arr = cells.map(c => c == null ? null : (unit === 'pct' ? c.pct : c.value))
                     .filter(v => v != null);
    return { year, avg: arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null };
  }).filter(a => a.avg != null);
  if (annual.length < 2) return `<span class="pd-tag flat">N/A</span>Insufficient history.`;
  const xs = annual.map(a => a.year);
  const ys = annual.map(a => a.avg);
  const reg = pdLinearRegression(xs, ys);
  const trend = pdTrendTag(reg.r2, reg.slope, unit);

  // Per-quarter regression — find which quarters carry the trend
  const qDeltas = [];
  for (let q = 0; q < 4; q++) {
    const pts = matrix.map(({ year, cells }) => {
      const c = cells[q];
      const v = c == null ? null : (unit === 'pct' ? c.pct : c.value);
      return { year, v };
    }).filter(p => p.v != null);
    if (pts.length >= 2) {
      const r = pdLinearRegression(pts.map(p => p.year), pts.map(p => p.v));
      qDeltas.push({ q: q + 1, slope: r.slope, r2: r.r2, n: pts.length });
    }
  }
  qDeltas.sort((a, b) => b.slope - a.slope);
  const topQ = qDeltas[0], botQ = qDeltas[qDeltas.length - 1];

  if (trend.tag === 'flat' && (!topQ || Math.abs(topQ.slope - botQ.slope) < (unit === 'pct' ? 0.5 : 2))) {
    return `<span class="pd-tag flat">No trend</span>` +
           `Quarterly averages mostly mean-revert (R²=${reg.r2 == null ? '—' : reg.r2.toFixed(2)}). ` +
           `No structurally diverging seasonal pattern detected.`;
  }
  const direction = trend.tag === 'flat' ? 'mixed' : trend.text;
  return `<span class="pd-tag ${trend.tag || ''}">${direction}</span>` +
         (topQ && botQ && topQ !== botQ
           ? `<strong>Q${topQ.q}</strong> trending strongest (slope ${pdFmtVal(topQ.slope, unit)}/yr, R²=${topQ.r2.toFixed(2)}); ` +
             `<strong>Q${botQ.q}</strong> weakest (slope ${pdFmtVal(botQ.slope, unit)}/yr). `
           : ``) +
         (topQ && botQ && topQ.q !== botQ.q
           ? `Idea: a long Q${topQ.q} / short Q${botQ.q} calendar spread captures the divergence if it persists. Re-validate against forward curve before sizing.`
           : ``);
}

function pdSummaryYearly(cells, years, currentYear, unit, regression) {
  // Yearly summary uses only FULLY CLOSED years (December must be closed
  // per the 5th-day rule). Partial current YTD year is excluded so the
  // trend interpretation doesn't shift mid-year.
  const cutoff = pdLatestClosedMonth();
  const closedPairs = years.map((y, i) => ({ y, c: cells[i] }))
                           .filter(p => pdIsYearClosed(p.y, cutoff));
  const valid = closedPairs.map(p => ({ y: p.y,
    v: p.c == null ? null : (unit === 'pct' ? p.c.pct : p.c.value) }))
                           .filter(p => p.v != null);
  if (valid.length < 3) {
    return `<span class="pd-tag flat">N/A</span>Need at least 3 fully-closed years for a yearly trend. ` +
           `Data through ${pdCutoffLabel(cutoff)}.`;
  }
  // Re-compute regression on the closed-only subset
  regression = pdLinearRegression(valid.map(p => p.y), valid.map(p => p.v));
  const trend = pdTrendTag(regression.r2, regression.slope, unit);
  const first = valid[0], last = valid[valid.length - 1];
  const deltaTxt = pdFmtVal(last.v - first.v, unit);
  const slopeTxt = pdFmtVal(regression.slope, unit);

  if (trend.tag === 'flat') {
    return `<span class="pd-tag flat">No trend</span>` +
           `${valid.length}-year sample shows no significant slope (slope ${slopeTxt}/yr, R²=${regression.r2.toFixed(2)}). ` +
           `Mean reverts around ${pdFmtVal(valid.reduce((a, b) => a + b.v, 0) / valid.length, unit)}. ` +
           `Implication: no structural drift; trade against the mean rather than the direction.`;
  }
  return `<span class="pd-tag ${trend.tag}">${trend.text}</span>` +
         `<strong>${deltaTxt} shift over ${last.y - first.y} years</strong> ` +
         `(annual slope ${slopeTxt}/yr, R²=${regression.r2.toFixed(2)}${regression.r2 >= 0.7 ? ' — high confidence' : ''}). ` +
         `Implication: trend has persisted beyond a single-year shock; forward Cal pricing should respect at least the ${slopeTxt}/yr extrapolation, ` +
         `and any reversion below the trend line is a candidate ${trend.text.includes('upward') ? 'long' : 'short'} entry.`;
}

// ----- Chart drawer: multi-year curves (monthly/quarterly) ---
function drawPdMultiYearChart(svgId, legendId, seriesData, xLabels, currentYear, xLabelEvery) {
  const svg = d3.select(`#${svgId}`);
  svg.selectAll('*').remove();
  svg.classed('pd-svg', true);
  const { W, H } = spChartDims(svg, 230);
  const padL = 42, padR = 14, padT = 14, padB = 28;
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;

  // Collect Y range
  const allVals = [];
  for (const s of seriesData) for (const p of s.points) if (p.v != null) allVals.push(p.v);
  if (allVals.length === 0) {
    svg.append('text').attr('x', W/2).attr('y', H/2).attr('text-anchor','middle')
       .attr('fill','#cdd2da').attr('font-size',13).text('No data');
    document.getElementById(legendId).innerHTML = '';
    return;
  }
  let yMin = Math.min(0, ...allVals);
  let yMax = Math.max(0, ...allVals);
  if (yMin === yMax) yMax = yMin + 1;
  const pad = (yMax - yMin) * 0.10;
  yMin -= pad; yMax += pad;
  const yScale = v => padT + innerH * (1 - (v - yMin) / (yMax - yMin));
  const zeroY = yScale(0);

  const n = xLabels.length;
  const xScale = i => padL + (n === 1 ? innerW / 2 : (i / (n - 1)) * innerW);

  // Gridlines + Y labels (5 ticks)
  for (let k = 0; k < 5; k++) {
    const v = yMin + (yMax - yMin) * k / 4;
    const y = yScale(v);
    svg.append('line').attr('class', Math.abs(v) < 1e-6 ? 'pd-zero' : 'pd-grid')
       .attr('x1', padL).attr('x2', W - padR).attr('y1', y).attr('y2', y);
    svg.append('text').attr('class', 'pd-tick')
       .attr('x', padL - 5).attr('y', y + 3).attr('text-anchor', 'end')
       .text(state.pd.unit === 'pct' ? `${v.toFixed(0)}%` : v.toFixed(0));
  }

  // Per-year line paths
  const linePaths = [];
  for (const s of seriesData) {
    const color = pdYearColor(s.year, currentYear);
    const lineGen = d3.line()
      .defined(d => d.v != null)
      .x((d, i) => xScale(i))
      .y(d => yScale(d.v))
      .curve(d3.curveMonotoneX);
    const path = svg.append('path').datum(s.points)
       .attr('class', 'pd-line' + (s.year === currentYear ? ' current' : ''))
       .attr('stroke', color)
       .attr('d', lineGen)
       .attr('opacity', 0);
    path.transition().duration(450).delay(50).attr('opacity', 1);
    linePaths.push({ year: s.year, color, points: s.points });
  }

  // Glowing value labels for the CURRENT-YEAR curve.
  // For each non-null point of the current year, render an amber dot + a
  // rounded badge with the value above the line. drawn last so they sit
  // on top of everything else.
  const curSeries = seriesData.find(s => s.year === currentYear);
  if (curSeries) {
    const fmtV = v => state.pd.unit === 'pct'
      ? `${v >= 0 ? '+' : ''}${v.toFixed(1)}%`
      : `${v.toFixed(1)}`;
    for (let i = 0; i < curSeries.points.length; i++) {
      const p = curSeries.points[i];
      if (p.v == null) continue;
      const cx = xScale(i), cy = yScale(p.v);
      // Glow dot
      svg.append('circle').attr('class', 'pd-cur-dot')
         .attr('cx', cx).attr('cy', cy).attr('r', 3.6)
         .attr('opacity', 0)
         .transition().duration(380).delay(250 + i * 25).attr('opacity', 1);
      // Label badge — position above the point (or below if near top)
      const txt = fmtV(p.v);
      const charW = 6.0;          // approx glyph width @10px
      const w = txt.length * charW + 8;
      const h = 14;
      const above = cy > padT + h + 6;
      const lblY = above ? cy - 10 : cy + 12;
      const g = svg.append('g').attr('opacity', 0);
      g.append('rect').attr('class', 'pd-cur-label-bg')
       .attr('x', cx - w / 2).attr('y', lblY - h + 2)
       .attr('width', w).attr('height', h)
       .attr('rx', 3).attr('ry', 3);
      g.append('text').attr('class', 'pd-cur-label')
       .attr('x', cx).attr('y', lblY - 1)
       .attr('text-anchor', 'middle')
       .text(txt);
      g.transition().duration(380).delay(280 + i * 25).attr('opacity', 1);
    }
  }

  // X labels
  const xLabelEls = [];
  for (let i = 0; i < n; i++) {
    if (xLabelEvery && (i % xLabelEvery !== 0) && i !== n - 1) continue;
    const lab = svg.append('text')
      .attr('class', 'pd-xlabel')
      .attr('data-idx', i)
      .attr('x', xScale(i)).attr('y', H - 10).attr('text-anchor', 'middle')
      .text(xLabels[i]);
    xLabelEls.push(lab);
  }

  // Crosshair + per-series dots
  const cross = svg.append('line').attr('class', 'pd-cross')
    .attr('y1', padT).attr('y2', H - padB);
  const dots = linePaths.map(lp =>
    svg.append('circle').attr('class', 'pd-dot').attr('r', 4)
       .attr('stroke', lp.color)
  );

  const tt = document.getElementById('pd-tooltip');
  function showTip(i, evt) {
    if (!tt) return;
    const rows = linePaths.map((lp, li) => {
      const p = lp.points[i];
      if (!p || p.v == null) return null;
      return { year: lp.year, color: lp.color, v: p.v };
    }).filter(Boolean).sort((a, b) => b.year - a.year);
    if (!rows.length) return;
    const valFmt = v => state.pd.unit === 'pct' ? `${v >= 0 ? '+' : ''}${v.toFixed(1)}%` : `${v.toFixed(1)} €`;
    tt.innerHTML =
      `<div class="ttl">${escapeHtml(xLabels[i])}</div>` +
      rows.map(r => `<div class="row"><span class="lbl" style="color:${r.color};font-weight:600;">${r.year}</span><strong>${valFmt(r.v)}</strong></div>`).join('');
    tt.classList.add('visible');
    const x = evt.clientX + 14, y = evt.clientY + 14;
    const tw = tt.offsetWidth, th = tt.offsetHeight;
    tt.style.left = `${Math.min(x, window.innerWidth - tw - 8)}px`;
    tt.style.top  = `${Math.min(y, window.innerHeight - th - 8)}px`;
  }
  function hideTip() { if (tt) tt.classList.remove('visible'); }
  function setHotIdx(i) {
    cross.attr('x1', xScale(i)).attr('x2', xScale(i)).classed('visible', true);
    linePaths.forEach((lp, li) => {
      const p = lp.points[i];
      if (p && p.v != null) {
        dots[li].attr('cx', xScale(i)).attr('cy', yScale(p.v)).classed('hot', true);
      } else {
        dots[li].classed('hot', false);
      }
    });
    xLabelEls.forEach(lab => lab.classed('hot', parseInt(lab.attr('data-idx'), 10) === i));
  }
  function clearHot() {
    cross.classed('visible', false);
    dots.forEach(d => d.classed('hot', false));
    xLabelEls.forEach(lab => lab.classed('hot', false));
  }

  for (let i = 0; i < n; i++) {
    const halfStep = innerW / Math.max(n - 1, 1) / 2;
    const x0 = xScale(i) - halfStep;
    svg.append('rect')
      .attr('x', x0).attr('y', padT)
      .attr('width', halfStep * 2).attr('height', innerH)
      .attr('fill', 'transparent').style('pointer-events', 'all')
      .on('mouseenter', (evt) => { setHotIdx(i); showTip(i, evt); })
      .on('mousemove',  (evt) => { showTip(i, evt); })
      .on('mouseleave', () => { clearHot(); hideTip(); });
  }

  // Legend
  const legendEl = document.getElementById(legendId);
  legendEl.innerHTML = seriesData.map(s => {
    const c = pdYearColor(s.year, currentYear);
    const ytdMark = s.year === currentYear ? ' YTD' : '';
    return `<span><span class="pd-sw" style="background:${c};"></span>${s.year}${ytdMark}</span>`;
  }).join('');
}

// ----- Chart drawer: yearly single curve + trend -----------
function drawPdYearlyChart(svgId, legendId, points, regression, currentYear) {
  const svg = d3.select(`#${svgId}`);
  svg.selectAll('*').remove();
  svg.classed('pd-svg', true);
  const { W, H } = spChartDims(svg, 230);
  const padL = 44, padR = 14, padT = 14, padB = 28;
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;

  const vals = points.map(p => p.v).filter(v => v != null);
  if (vals.length === 0) {
    svg.append('text').attr('x', W/2).attr('y', H/2).attr('text-anchor','middle')
       .attr('fill','#cdd2da').attr('font-size',13).text('No data');
    document.getElementById(legendId).innerHTML = '';
    return;
  }
  let yMin = Math.min(0, ...vals);
  let yMax = Math.max(0, ...vals);
  if (yMin === yMax) yMax = yMin + 1;
  const padY = (yMax - yMin) * 0.10;
  yMin -= padY; yMax += padY;
  const yScale = v => padT + innerH * (1 - (v - yMin) / (yMax - yMin));

  const n = points.length;
  const xScale = i => padL + (n === 1 ? innerW / 2 : (i / (n - 1)) * innerW);

  // Gridlines
  for (let k = 0; k < 5; k++) {
    const v = yMin + (yMax - yMin) * k / 4;
    const y = yScale(v);
    svg.append('line').attr('class', Math.abs(v) < 1e-6 ? 'pd-zero' : 'pd-grid')
       .attr('x1', padL).attr('x2', W - padR).attr('y1', y).attr('y2', y);
    svg.append('text').attr('class', 'pd-tick')
       .attr('x', padL - 5).attr('y', y + 3).attr('text-anchor', 'end')
       .text(state.pd.unit === 'pct' ? `${v.toFixed(0)}%` : v.toFixed(0));
  }

  // Trend line first (so actual line is drawn on top)
  if (regression && regression.slope != null) {
    const xMinIdx = 1, xMaxIdx = n;
    const y0 = regression.intercept + regression.slope * xMinIdx;
    const y1 = regression.intercept + regression.slope * xMaxIdx;
    svg.append('line').attr('class', 'pd-trend')
       .attr('x1', xScale(0)).attr('x2', xScale(n - 1))
       .attr('y1', yScale(y0)).attr('y2', yScale(y1));
  }

  // Actual line
  const lineGen = d3.line()
    .defined(d => d.v != null)
    .x((d, i) => xScale(i))
    .y(d => yScale(d.v))
    .curve(d3.curveMonotoneX);
  svg.append('path').datum(points)
     .attr('class', 'pd-line current')
     .attr('stroke', '#378ADD')
     .attr('d', lineGen)
     .attr('opacity', 0)
     .transition().duration(450).delay(50).attr('opacity', 1);

  // Year-coloured anchor dots
  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    if (p.v == null) continue;
    const isCur = p.year === currentYear;
    svg.append('circle')
       .attr('class', isCur ? 'pd-cur-dot' : '')
       .attr('cx', xScale(i)).attr('cy', yScale(p.v))
       .attr('r', isCur ? 4.5 : 3.2)
       .attr('fill', pdYearColor(p.year, currentYear))
       .attr('stroke', '#fff').attr('stroke-width', 1);
  }
  // Glowing badge for current year value
  const curIdx = points.findIndex(p => p.year === currentYear && p.v != null);
  if (curIdx >= 0) {
    const p = points[curIdx];
    const cx = xScale(curIdx), cy = yScale(p.v);
    const fmtV = v => state.pd.unit === 'pct'
      ? `${v >= 0 ? '+' : ''}${v.toFixed(1)}%`
      : `${v.toFixed(1)}`;
    const txt = fmtV(p.v);
    const w = txt.length * 6 + 8;
    const h = 14;
    const above = cy > padT + h + 6;
    const lblY = above ? cy - 10 : cy + 12;
    svg.append('rect').attr('class', 'pd-cur-label-bg')
       .attr('x', cx - w / 2).attr('y', lblY - h + 2)
       .attr('width', w).attr('height', h)
       .attr('rx', 3).attr('ry', 3);
    svg.append('text').attr('class', 'pd-cur-label')
       .attr('x', cx).attr('y', lblY - 1)
       .attr('text-anchor', 'middle')
       .text(txt);
  }

  // X labels
  const xLabelEls = [];
  for (let i = 0; i < n; i++) {
    const lab = svg.append('text')
      .attr('class', 'pd-xlabel')
      .attr('data-idx', i)
      .attr('x', xScale(i)).attr('y', H - 10).attr('text-anchor', 'middle')
      .text(points[i].label);
    xLabelEls.push(lab);
  }

  // Crosshair + tooltip
  const cross = svg.append('line').attr('class', 'pd-cross')
    .attr('y1', padT).attr('y2', H - padB);
  const hot = svg.append('circle').attr('class', 'pd-dot').attr('r', 5)
    .attr('stroke', '#f5a623').attr('stroke-width', 2);

  const tt = document.getElementById('pd-tooltip');
  function showTip(i, evt) {
    if (!tt) return;
    const p = points[i];
    if (p.v == null) return;
    const valFmt = state.pd.unit === 'pct'
      ? `${p.v >= 0 ? '+' : ''}${p.v.toFixed(1)}%`
      : `${p.v.toFixed(1)} €`;
    const trendV = regression && regression.slope != null
      ? regression.intercept + regression.slope * (i + 1) : null;
    const trendFmt = trendV != null
      ? (state.pd.unit === 'pct'
          ? `${trendV >= 0 ? '+' : ''}${trendV.toFixed(1)}%`
          : `${trendV.toFixed(1)} €`)
      : null;
    tt.innerHTML =
      `<div class="ttl">${p.year}</div>` +
      `<div class="row"><span class="lbl">Actual</span><strong>${valFmt}</strong></div>` +
      (trendFmt ? `<div class="row"><span class="lbl">Trend</span>${trendFmt}</div>` : '');
    tt.classList.add('visible');
    const x = evt.clientX + 14, y = evt.clientY + 14;
    const tw = tt.offsetWidth, th = tt.offsetHeight;
    tt.style.left = `${Math.min(x, window.innerWidth - tw - 8)}px`;
    tt.style.top  = `${Math.min(y, window.innerHeight - th - 8)}px`;
  }
  function hideTip() { if (tt) tt.classList.remove('visible'); }
  function setHotIdx(i) {
    const p = points[i];
    if (!p || p.v == null) { hot.classed('hot', false); return; }
    cross.attr('x1', xScale(i)).attr('x2', xScale(i)).classed('visible', true);
    hot.attr('cx', xScale(i)).attr('cy', yScale(p.v))
       .attr('fill', pdYearColor(p.year, currentYear))
       .classed('hot', true);
    xLabelEls.forEach(lab => lab.classed('hot', parseInt(lab.attr('data-idx'), 10) === i));
  }
  function clearHot() {
    cross.classed('visible', false);
    hot.classed('hot', false);
    xLabelEls.forEach(lab => lab.classed('hot', false));
  }
  for (let i = 0; i < n; i++) {
    const halfStep = innerW / Math.max(n - 1, 1) / 2;
    svg.append('rect')
      .attr('x', xScale(i) - halfStep).attr('y', padT)
      .attr('width', halfStep * 2).attr('height', innerH)
      .attr('fill', 'transparent').style('pointer-events', 'all')
      .on('mouseenter', (evt) => { setHotIdx(i); showTip(i, evt); })
      .on('mousemove',  (evt) => { showTip(i, evt); })
      .on('mouseleave', () => { clearHot(); hideTip(); });
  }

  // Legend
  const legendEl = document.getElementById(legendId);
  legendEl.innerHTML =
    `<span><span class="pd-sw" style="background:#378ADD;"></span>Annual avg</span>` +
    `<span><span class="pd-sw" style="background:#2c3340;border-top:1px dashed #2c3340;background:none;"></span>OLS trend</span>` +
    (regression && regression.r2 != null ? `<span style="color:#8a93a0;">R² = ${regression.r2.toFixed(2)}</span>` : '');
}
