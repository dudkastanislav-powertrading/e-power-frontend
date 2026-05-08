# E-Power — End-to-End Architecture

Date: 2026-05-05
Status: Stage A (frontend skeleton) complete · Stages B–D pending

## Goals

1. **Self-hosted European DAM map** that I can open from laptop / iPhone /
   anywhere on the internet, without keeping the source database online.
2. **Zero hands-on operations** — once configured, data refreshes itself
   from ENTSO-E, computes residual load, exports a snapshot, pushes
   to GitHub, and the public site updates within a minute. No clicking,
   no logging in.
3. **Tiny budget** — $0/month for solo use. Paid tiers are optional and
   only kick in if someone else actually starts using it.
4. **Privacy** — the database lives on the Mac, never accepts inbound
   connections, and is never reachable from the internet.

## High-level diagram

```
┌──────────────────────────────────────────────────────────────────┐
│ 1. Local machine (MacBook Pro)                                   │
│                                                                  │
│   Postgres 16 (localhost:5432/epower)                            │
│   ─────────────────────────────────────                          │
│   curated.dam_price · curated.fx_rate · curated.generation_*     │
│   curated.load_* · curated.production_type                       │
│   marts.dam_price_daily · marts.residual_load                    │
│                                                                  │
│   ▲   ▲   ▲                                                      │
│   │   │   │  daily ETL (launchd at 14:30 + 22:00 fallback)       │
│   │   │   │  ├─ NBU FX                                           │
│   │   │   │  ├─ DAM prices (ENTSO-E, 19 zones + UAH→EUR conv)    │
│   │   │   │  ├─ Generation by production_type (ENTSO-E)          │
│   │   │   │  ├─ Load actual + DA forecast (ENTSO-E)              │
│   │   │   │  └─ Wind & Solar DA forecast (ENTSO-E)               │
│   │   │   │                                                      │
│   │   │   ▼  immediately after ETL → snapshot_export.py          │
│   │   │  ┌───────────────────────────────────────┐               │
│   │   │  │ tools/snapshot_export.py              │               │
│   │   │  │ Reads marts.* + curated.*             │               │
│   │   │  │ Writes data/*.json into frontend repo │               │
│   │   │  │ Commits + pushes via GitHub PAT       │               │
│   │   │  └───────────────────────────────────────┘               │
│   │   │                                                          │
│   │   └────────── DB-proxy daemon (file-queue based)             │
│   │              for Claude read-only access while developing    │
└───┼──────────────────────────────────────────────────────────────┘
    │
    │  git push (HTTPS, GitHub PAT)
    ▼
┌──────────────────────────────────────────────────────────────────┐
│ 2. GitHub repo: dudkastanislav-powertrading/e-power-frontend     │
│                                                                  │
│   ├── index.html · app.js · style.css                            │
│   ├── data/manifest.json                                         │
│   ├── data/dam_daily.json                                        │
│   └── data/dam_hourly_2021..2026.json                            │
└──────────────────────────────────────────────────────────────────┘
    │
    │  webhook → Cloudflare Pages build
    ▼
┌──────────────────────────────────────────────────────────────────┐
│ 3. Cloudflare Pages (Free tier)                                  │
│                                                                  │
│   Build: none (static files served as-is)                        │
│   Deploy: ~30s after push                                        │
│   URL: https://e-power.pages.dev (or custom domain)              │
│   CDN: ~300 PoPs globally, low latency from any device           │
└──────────────────────────────────────────────────────────────────┘
    │
    ▼
  end user (laptop / iPhone / iPad / colleague)
```

## Why static-snapshot pattern, not REST API

Three pros, one con. Pros first:

1. **The Mac is invisible to the internet.** Postgres binds to localhost
   only. There is no port forward, no tunnel, no Tailscale, no DDNS.
   If the Mac is asleep, the public site still serves yesterday's data.
2. **No infrastructure to operate.** A REST API would need a backend
   server, a hosting bill, a runtime to keep alive, a TLS cert to renew,
   and uptime to monitor. None of that exists in the snapshot pattern.
   The site is plain HTML+JSON sitting on a CDN.
3. **Speed.** First page load is one HTML + ~500 KB of vendor JS +
   a single ~1 MB JSON of daily aggregates. The user's browser does
   the work of filtering and computing aggregates. Page-to-interactive
   is ~600 ms over 4G.

The con:

- **Data is not live.** Refresh cadence equals snapshot cadence (twice
  daily). For DAM prices that's fine — DAM publishes once per day around
  noon Brussels time. For intraday or live trading screens, this pattern
  doesn't work and we'd need a real backend. We don't need that yet.

## Snapshot file layout

```
data/
├── manifest.json          ~1 KB
├── dam_daily.json         ~1.2 MB  (5y × 19 zones × 365d × 4 fields)
├── dam_hourly_2021.json   ~3.5 MB  (8760h × 19 zones × 1 field)
├── dam_hourly_2022.json   ~3.5 MB
├── dam_hourly_2023.json   ~3.5 MB
├── dam_hourly_2024.json   ~3.5 MB
├── dam_hourly_2025.json   ~3.5 MB
├── dam_hourly_2026.json   ~1.2 MB  (year-to-date)
├── generation_daily.json  ~2.0 MB  (when generation view is added)
├── load_daily.json        ~1.5 MB  (when load view is added)
└── residual_daily.json    ~1.5 MB
```

Hourly files are loaded **lazily** — the front-end only fetches the
years actually visible in the current Custom range. For Day/MTD/YTD
modes only `dam_daily.json` is needed.

## File generation (Stage B)

`tools/snapshot_export.py` will:

1. Connect to local Postgres via `psycopg`
   (connection string: `postgresql://localhost:5432/epower`).
2. Run a few prepared `COPY ... TO STDOUT WITH (FORMAT csv)` queries
   for speed; convert each to gzipped JSON in-process.
3. Atomically replace files in `~/Documents/Claude/Projects/e-power-frontend/data/`.
4. `git add data/ && git commit -m "snapshot YYYY-MM-DDTHH:MM" && git push`.
5. Append a single line to `~/Library/Logs/epower_snapshot.log`.
6. Total runtime target: <60s for the daily file, <90s including hourly.

Failures are surfaced through the macOS Notification Center (via the
existing launchd job) so an offline night doesn't go unnoticed.

## Daily schedule (launchd)

| Local time | Job | Outputs |
|------------|-----|---------|
| 14:30 | `daily_etl_all.sh` (primary) | rows in Postgres |
| 14:35 | `snapshot_export.py` (chained) | files in frontend repo |
| 14:36 | `git push` | GitHub commit |
| 14:37 | Cloudflare Pages auto-build | live site updated |
| 22:00 | Same chain (fallback) | catches up if Mac was asleep at 14:30 |

If the Mac is offline for both 14:30 and 22:00, the chain runs the moment
the Mac wakes up (launchd's `RunAtLoad` semantics).

## Front-end structure

| File | Lines | Purpose |
|------|-------|---------|
| `index.html` | ~80 | Layout, vendor lib `<script>` tags |
| `style.css` | ~250 | All CSS — including responsive breakpoints |
| `app.js` | ~330 | State, mode handling, choropleth render, table |

Vendor libs (loaded from jsDelivr CDN):
- `d3.min.js` (~250 KB) — geo projection, color scale
- `topojson-client.min.js` (~30 KB) — TopoJSON decode
- `world-atlas/countries-50m.json` (~80 KB) — country shapes

Total cold-start payload: ~360 KB JS + 80 KB geo + 1 MB data ≈ 1.4 MB.
Same as a typical news-article page.

## Modes and aggregation

| Mode | What it shows | Source field |
|------|---------------|--------------|
| Day | DAM avg for the picked day | `dam_daily.mean_eur` |
| MTD | Avg from 1st of selected month to selected day | filter `dam_daily` |
| YTD | Avg from Jan 1 of selected year to selected day | filter `dam_daily` |
| Custom | Avg between two arbitrary dates | filter `dam_daily` |

Profile filter (Baseload / Peak / Off-peak) switches between
`mean_eur` / `peak_eur` / `offpeak_eur`. Peak window matches Europe
convention: 8–20 CET, weekdays only. Off-peak is the complement.

## What's NOT in the MVP yet

- Cross-border spread analysis (HU-RO, HU-SK with PTR cost)
- Power Mix charts
- Custom user groups (My Markets-style)
- Hourly drill-down per day
- CSV export
- User authentication

These are scoped for later iterations — see Stage E task list.

## Known hard parts

1. **Italy sub-zones.** The country-level map can only color the entire
   IT polygon. We average all 7 IT-* zones into a single national value
   on the map, but the side table keeps them split. A future iteration
   will overlay sub-zone polygons drawn manually (TSO publishes shapes).

2. **DE-LU.** Treated as Germany on the map. Luxembourg is colored as
   the same value (it's part of the bidding zone).

3. **UA after 24-Feb-2022.** ENTSO-E coverage has gaps. We surface this
   in `manifest.json` so the front-end can grey out missing days
   instead of pretending zero.

4. **Cold December 2024 data point.** ENTSO-E sometimes publishes
   day-ahead prices in 15-minute resolution after the IDA reform.
   Snapshot export averages them up to hourly to keep the schema stable.
