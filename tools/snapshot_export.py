#!/usr/bin/env python3
"""
snapshot_export.py — generate static JSON snapshots from local Postgres
for the E-Power frontend.

Run nightly from launchd, immediately after daily ETL completes.

Usage:
    python3 tools/snapshot_export.py \
        --db postgresql://localhost:5432/epower \
        --out ../e-power-frontend/data

Notes:
    - Reads from marts.dam_price_daily (built by migration 001)
    - Reads from curated.dam_price for hourly file split by year
    - All times are returned in CET (Europe/Berlin) per project convention
    - Output files are atomically replaced (tmp + rename)
"""

import argparse
import datetime as dt
import json
import os
import sys
import tempfile
from pathlib import Path

try:
    import psycopg
except ImportError:
    print("ERROR: psycopg not installed. Run:", file=sys.stderr)
    print("  pip3 install --break-system-packages psycopg[binary]", file=sys.stderr)
    sys.exit(1)


# ---- queries ---------------------------------------------------------

QUERY_DAM_DAILY = """
SELECT
    bidding_zone                                               AS zone,
    delivery_date::text                                        AS date,
    avg_price::float                                           AS mean_eur,
    peak_avg::float                                            AS peak_eur,
    offpeak_avg::float                                         AS offpeak_eur
FROM marts.dam_price_daily
WHERE delivery_date >= CURRENT_DATE - INTERVAL '5 years 1 month'
ORDER BY zone, delivery_date;
"""

QUERY_DAM_HOURLY_YEAR = """
SELECT
    bidding_zone                                               AS zone,
    (delivery_start AT TIME ZONE 'Europe/Berlin')::text        AS delivery_start_cet,
    EXTRACT(hour FROM delivery_start AT TIME ZONE 'Europe/Berlin')::int + 1
                                                               AS hour_cet,
    price_eur_mwh::float                                       AS price_eur
FROM curated.dam_price
WHERE version = 1
  AND (delivery_start AT TIME ZONE 'Europe/Berlin') >= make_timestamp(%s, 1, 1, 0, 0, 0)
  AND (delivery_start AT TIME ZONE 'Europe/Berlin') <  make_timestamp(%s, 1, 1, 0, 0, 0)
ORDER BY zone, delivery_start;
"""

QUERY_ZONES = """
SELECT code AS zone, country, timezone
FROM curated.bidding_zone
WHERE is_active = TRUE
ORDER BY code;
"""


# ---- export helpers --------------------------------------------------

def write_atomic(path: Path, payload: dict) -> int:
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp = tempfile.mkstemp(dir=str(path.parent), prefix=path.name + ".", suffix=".tmp")
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            json.dump(payload, f, separators=(",", ":"), ensure_ascii=False)
            size = f.tell()
        os.replace(tmp, path)
        return size
    except Exception:
        if os.path.exists(tmp):
            os.unlink(tmp)
        raise


def fetch_rows(conn, query: str, *params) -> list[dict]:
    with conn.cursor() as cur:
        cur.execute(query, params)
        cols = [c.name for c in cur.description]
        return [dict(zip(cols, row)) for row in cur.fetchall()]


# ---- main pipeline ---------------------------------------------------

def export_all(db_url: str, out_dir: Path) -> dict:
    started = dt.datetime.now(dt.timezone.utc)
    summary = {"started_at": started.isoformat(), "files": {}}

    with psycopg.connect(db_url, autocommit=True) as conn:
        # 1. Zones
        zones = fetch_rows(conn, QUERY_ZONES)
        summary["files"]["zones.json"] = {
            "size_bytes": write_atomic(out_dir / "zones.json", {"zones": zones}),
            "row_count": len(zones),
        }

        # 2. DAM daily aggregates
        daily = fetch_rows(conn, QUERY_DAM_DAILY)
        summary["files"]["dam_daily.json"] = {
            "size_bytes": write_atomic(out_dir / "dam_daily.json", {"rows": daily}),
            "row_count": len(daily),
        }

        # 3. DAM hourly per year
        current_year = started.year
        for yr in range(current_year - 4, current_year + 1):
            rows = fetch_rows(conn, QUERY_DAM_HOURLY_YEAR, yr, yr + 1)
            if not rows:
                continue
            fname = f"dam_hourly_{yr}.json"
            summary["files"][fname] = {
                "size_bytes": write_atomic(out_dir / fname, {"year": yr, "rows": rows}),
                "row_count": len(rows),
            }

    # 4. Manifest
    manifest = {
        "schema_version": 1,
        "generated_at": dt.datetime.now(dt.timezone.utc).isoformat(),
        "source": "local_postgres",
        "datasets": list(summary["files"].keys()),
        "row_counts": {k: v["row_count"] for k, v in summary["files"].items()},
    }
    summary["files"]["manifest.json"] = {
        "size_bytes": write_atomic(out_dir / "manifest.json", manifest),
        "row_count": None,
    }

    summary["finished_at"] = dt.datetime.now(dt.timezone.utc).isoformat()
    return summary


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(description="Export local Postgres → frontend JSON")
    parser.add_argument("--db", default=os.environ.get(
        "EPOWER_DB_URL", "postgresql://localhost:5432/epower"))
    parser.add_argument("--out", required=True, type=Path,
                        help="Output directory (e.g. ../e-power-frontend/data)")
    args = parser.parse_args(argv)

    out_dir = args.out.resolve()
    out_dir.mkdir(parents=True, exist_ok=True)

    summary = export_all(args.db, out_dir)
    print(json.dumps(summary, indent=2, default=str))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
