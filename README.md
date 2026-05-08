# E-Power Frontend

Static dashboard for European DAM prices. Reads pre-built JSON snapshots
from `data/`, no backend, no live DB connection.

## Data flow

```
local Postgres (Mac)
       │
       ▼
tools/snapshot_export.py        ← runs in launchd at 14:35 + 22:05
       │
       ▼
data/manifest.json + data/*.json
       │
       ▼ git push
       ▼
GitHub repo (e-power-frontend)
       │
       ▼ Cloudflare Pages auto-deploy (~30s)
       ▼
https://e-power.pages.dev (or custom domain)
```

The local Postgres database never opens any port to the internet.
The site is a static CDN-served snapshot updated twice per day.

## Local preview

Open `index.html` in a browser directly (`file://...`) — works with mock data.
For local dev with live data refresh, run any static server in this folder:

```bash
python3 -m http.server 8000
# open http://localhost:8000
```

## Files

| Path | Purpose |
|------|---------|
| `index.html` | shell, layout, vendor library imports |
| `style.css` | all styling |
| `app.js` | data fetch, rendering, mode switching |
| `data/manifest.json` | snapshot metadata, schema version |
| `data/dam_daily.json` | (when wired) daily aggregates by zone |
| `data/dam_hourly_YYYY.json` | (when wired) hourly per year |

## Status

- [x] UI skeleton (mock data)
- [x] DAM map with Day/MTD/YTD/Custom modes
- [x] Sortable zones table
- [x] Mobile-responsive layout (basic)
- [ ] Snapshot export script
- [ ] Cloudflare Pages deployment
- [ ] Cross-border spreads view
- [ ] Power Mix view
- [ ] Custom user groups
