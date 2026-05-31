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
`manifest.json`, `dam_daily.json`, `dam_hourly_{2021..2026}.json`, `borders.json`, `border_hourly.json`, `gen_actual_{year}.json`, `gen_climatology.json`, **`forecast.json`** (новий: `{zones, dates, runs:['10:45','10:00'], data:{zone:{date:{run:{p10[24],p50[24],p90[24]}}, actual[24]}}, quality:{model_version,window,mae,bias,coverage,pinball,by_zone[],caveats[]}}` — з `tools/snapshot_export_forecast.py`). Forecast tab: mode DAM/Spread (вільний A−B; Zone B disabled у DAM), date, 1h/15min (таблиця теж), runs multi-toggle (10:45 суцільна / 10:00 amber-пунктир), інтерактивний hover (#fc-cursor+#fc-tooltip), CSV-export, quality-панель, **self-guide** (`guide:{zone:[24×{rec:'P10'|'P50'|'P90',bias,n}]}` з dam_forecast_eval) → права панель #fc-guide (банди годин) + підсвічування рекомендованої квантилі в таблиці (Base-колонка). Чарт full-width (#fc-chart, white-theme, data-labels). v=42, style.css v=39.

## Як додати новий view (рецепт)
1. index.html: `<a class="nav-link" data-view="x">X</a>` + `<section class="x-panel hidden" id="x-view">…</section>`.
2. app.js `showView`: `const isX = view==='x'; document.getElementById('x-view').classList.toggle('hidden',!isX); if(isX){await initXView(); renderX();}`.
3. Додати `initXView`/`renderX` (наприкінці app.js — самодостатній модуль).
4. Дані: новий `data/x.json` + експортер у пайплайн + запис у manifest.
5. Бампнути `?v=` у `<script src="app.js?v=N">` (cache-bust).

## Стильові класи (переюз)
`.nav-link`, `.mode-tab`, `.profile-btn`/`.seg-btn`/`.seg-toggle`, `.sp-ctrl`+`<label>`+`<select>`, `.pd-block`/`.pd-split`/`.pd-table`/`.pd-chart-wrap`, `.sp-tooltip`, `.hidden`. Палітра у `:root` (style.css).
