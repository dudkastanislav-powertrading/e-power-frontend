# SITE_MAP.md — карта сайту RedKlen (читати замість re-exploration)

> **Підтримувати актуальним.** Будь-яка зміна структури (новий view/секція/data-файл/render-функція) → одразу оновити цей файл. Останнє оновлення: 2026-05-31.
> Стек: статичний HTML + `app.js` (~227KB, vanilla ES-module + d3) + `style.css`. Без бекенду/фреймворка. Деплой: GitHub Pages. Дані: `data/*.json` (оновл. `tools/snapshot_publish.sh` з Postgres).

## Навігація (index.html `<nav class="topnav">`)
`<a class="nav-link" data-view="...">`: **dam-map** (Map), **dam-spreads** (DAM Spreads), **generation** (Fundamental), **product-dynamics** (Products), **futures** (Futures — заглушка), **forecast** (Forecast — DAM-прогноз, додано 2026-05-31).

## Перемикання view (app.js)
- Клік nav-link (~рядок 418) → знімає `.active`, ставить на клікнутий → `await showView(view)`.
- `showView(view)` (~1754): toggle `.hidden` на панелях, тоді `await init<View>()` + `render<View>()`.
- `.hidden{display:none}` — глобальне правило у style.css (працює для всіх id-секцій).

## View → секція → функції
| view | секція (id/class) | init | render | дані |
|---|---|---|---|---|
| dam-map | `.map-panel`+`.table-panel` | (в init()) | choropleth d3 | dam_daily, borders, border_hourly |
| dam-spreads | `#spreads-view` | `initSpreadsView` (1807) | `renderSpreads` | dam_hourly_{year}, jao |
| generation | `#generation-view` | `initGenView` (3297) | `renderGen` | gen_actual_{year}, gen_climatology |
| product-dynamics | `#dynamics-view` | `initDynamicsView` (3960) | `renderDynamics` | dam_hourly, gen |
| futures | — | — | заглушка | — |
| **forecast** | `#forecast-view` | `initForecastView` | `renderForecast` | **forecast.json** |

## Завантаження даних
- `init()` (~194) фетчить `data/manifest.json` → шляхи датасетів. Решта — lazy у init<View> через `fetch('./data/<file>.json',{cache:'no-cache'})`.
- `manifest.json`: `datasets.<name>.path`, `generated_at`, `zones`, `availableYears`.

## data/*.json (контракти)
`manifest.json`, **`dam_daily.json` (schema v6, 2026-07-03: +`slc`/`svc` — clean-solar capture/volume з `marts.solar_decomposition_hourly` v0-window, +`bsh` — частка B16 поза денним вікном = hybrid-BESS gauge; `sl`/`sv` = solar TOTAL as reported)**, `dam_hourly_{2021..2026}.json`, `borders.json`, `border_hourly.json`, **`gen_actual_{year}.json` (+pseudo-type `B16B` «Solar hybrid/BESS component (est.)»; B16 перейменовано «Solar (total, incl. hybrid BESS)»)**, `gen_climatology.json`, **`forecast.json`** (`{zones, dates, runs:['10:45','09:30'], data:{zone:{date:{run:{p10[24],p50[24],p90[24]}}, actual[24]}}, fund (той самий shape — unified-v1 co-champion; треки jao/v11 ВИДАЛЕНІ 2026-08-04 разом з моделями), quality:{...caveats[]}, guide, metrics, metrics_fund, drivers:{zone:{date:{resid[24],norm[24],share[24],imp[24],exp[24],tight[24]}}}, regime:{bucket,zones:{z:{vol_pct,avg3,spike}}}, analogs:{zone:[{d,sim,avg_px,px[24]}×3]}}` — з `tools/snapshot_export_forecast.py`).

**Forecast tab (розширено 2026-07-03):** режими **DAM / Spread A−B / 🎯 Spread Radar / 🔥 Tail Risk / 📈 Quality**. Постійні блоки: `#fc-regime` (стрічка §12.1: сезон-bucket, vol-перцентиль, спайк-режим) і `#fc-brief` (Morning brief: рівні D+1 P50+Δ, топ-5 спредів з headroom, стан моделі + promotion-бейджі challengers). DAM-режим додатково рендерить `#fc-drivers` («чому таке число»: residual D+1 vs 35д per-hour норма, ВДЕ-частка, JAO tight-години + **дні-аналоги**). Radar: всі пари, |P50 spread| + low-band (P10−P90) + ~45д перцентиль + zone-level JAO headroom (`fcComputeRadar`). Risk: heatmap 11×24 (синє P10<0, помаранч/червоне P90≥150/250). Чекбокс Unified (фіолетова, co-champion; JAO/v1.1 виведені 2026-08-04); hover з Δ (лейбли Прогноз/Мін–Макс/Факт); CSV-export; self-guide. **CI 2026-08-04:** P10/P90 baseline = адаптивний емпіричний Мін/Макс (P50 + trailing-21д q10/q90 залишків per zone×hour-bucket, scale 1.15, `generate_daily_forecast.py` Q_BAND; сим: coverage 0.83, ширина −12%, pinball −10%). Morning brief: таблиця рівнів лише Zone/P50/Δ (🔥 і −€ колонки видалені), спреди = статичний watchlist DE-LU−HU, HU−GR, RS−HU, RO−HU, PL−DE-LU. Radar-режим ховає #fc-brief і #fc-chart — таблиця одразу зверху. Health: MAE-таблиця baseline+Unified (Uni−b, Cover), 7-дн rolling чарт, бейдж Unified (`fcChallengerBadges`, поріг: ΔMAE<−0.3, ≥55% zone-days, n≥110). Нові функції наприкінці app.js: `fcLatestDate/fcRenderRegime/fcRenderBrief/fcComputeRadar/fcRenderRadar/fcRenderRisk/fcRenderDrivers/fcChallengerBadges/fcHideDrivers`.

**Hourly values таблиця (2026-07-03):** по одній колонці на кожен увімкнений challenger — P50 (Δ до champion) + власний коридор P10…P90 дрібним шрифтом (`fcDrawTable` перероблено 2026-08-04: колонки Мін/Прогноз/Макс (baseline) + Uni Мін/Прогноз/Макс + Факт + Δ Base + Δ Uni; guide-колонку Base прибрано; підсвітка |Δ|>25 червоним); CSV-експорт має окремі p10/p50/p90 колонки per модель. Драйвер-панель `#fc-drivers` інтерактивна (`fcBindDriversHover`: гайд+точки+тултіп: resid/норма/Δ/ВДЕ%/headroom/tight).

**PV total / PV clean (2026-07-03, CLAUDE.md §24):** Map profile-bar і Products мають окремі кнопки `pv` («PV total», B16 as reported, вкл. гібридний BESS-розряд) і `pvc` («PV clean (est.)», лише денне вікно, поля `slc`/`svc`). `weightedCapturePrice` підтримує 'pvc' (volMap). Generation view: fuel-опції «Solar (total, incl. hybrid BESS)» (B16) + «Solar hybrid/BESS component (est.)» (B16B). Definitions оновлені (два PV-capture записи з поясненням забруднення). v=55, style.css v=39.

## Як додати новий view (рецепт)
1. index.html: `<a class="nav-link" data-view="x">X</a>` + `<section class="x-panel hidden" id="x-view">…</section>`.
2. app.js `showView`: `const isX = view==='x'; document.getElementById('x-view').classList.toggle('hidden',!isX); if(isX){await initXView(); renderX();}`.
3. Додати `initXView`/`renderX` (наприкінці app.js — самодостатній модуль).
4. Дані: новий `data/x.json` + експортер у пайплайн + запис у manifest.
5. Бампнути `?v=` у `<script src="app.js?v=N">` (cache-bust).

## Стильові класи (переюз)
`.nav-link`, `.mode-tab`, `.profile-btn`/`.seg-btn`/`.seg-toggle`, `.sp-ctrl`+`<label>`+`<select>`, `.pd-block`/`.pd-split`/`.pd-table`/`.pd-chart-wrap`, `.sp-tooltip`, `.hidden`. Палітра у `:root` (style.css).
