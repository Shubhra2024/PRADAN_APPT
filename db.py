import sqlite3
import json
import os

BASE = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.path.join(BASE, 'appt.db')

BASE_FY = '2026-27'      # the financial year this app was seeded for
BASE_FY_START = 2026

QUARTERS = ['Q1', 'Q2', 'Q3', 'Q4']

SCHEMA = """
CREATE TABLE IF NOT EXISTS indicators (
    code TEXT PRIMARY KEY,
    theme TEXT,
    subtheme TEXT,
    text TEXT,
    period TEXT              -- 'Cumulative' or 'Period'
);

CREATE TABLE IF NOT EXISTS districts (
    name TEXT PRIMARY KEY
);

CREATE TABLE IF NOT EXISTS blocks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    district TEXT NOT NULL,
    name TEXT NOT NULL,
    category TEXT NOT NULL DEFAULT 'Ecosystem',   -- 'Grassroot' or 'Ecosystem', from the Grassroot master mapping
    UNIQUE(district, name)
);

CREATE TABLE IF NOT EXISTS financial_years (
    fy TEXT PRIMARY KEY,       -- e.g. '2026-27'
    start_year INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS workflow_state (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    current_fy TEXT NOT NULL,
    current_quarter TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS quarter_freeze (
    fy TEXT NOT NULL,
    quarter TEXT NOT NULL,
    frozen_at TEXT DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (fy, quarter)
);

CREATE TABLE IF NOT EXISTS entries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    indicator_code TEXT NOT NULL,
    district TEXT NOT NULL,
    block_id INTEGER NOT NULL,  -- every entry is now tied to a specific block (Grassroot or Ecosystem category)
    level TEXT NOT NULL,        -- 'grassroot' or 'ecosystem' — mirrors the block's category at entry time
    fy TEXT NOT NULL,           -- financial year e.g. '2026-27'
    manual_opening REAL DEFAULT 0,  -- manually-seeded baseline (only meaningful/editable on the base FY, Cumulative indicators)
    q1_plan REAL DEFAULT 0, q2_plan REAL DEFAULT 0, q3_plan REAL DEFAULT 0, q4_plan REAL DEFAULT 0,
    q1 REAL DEFAULT 0, q2 REAL DEFAULT 0, q3 REAL DEFAULT 0, q4 REAL DEFAULT 0,   -- achieved
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(indicator_code, district, block_id, fy)
);

CREATE INDEX IF NOT EXISTS idx_entries_district ON entries(district);
CREATE INDEX IF NOT EXISTS idx_entries_indicator ON entries(indicator_code);
CREATE INDEX IF NOT EXISTS idx_entries_block ON entries(block_id);
CREATE INDEX IF NOT EXISTS idx_entries_fy ON entries(fy);
"""

def get_conn():
    conn = sqlite3.connect(DB_PATH, timeout=15)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    conn.execute("PRAGMA journal_mode = WAL")
    conn.execute("PRAGMA busy_timeout = 15000")
    return conn

def _migrate_old_entries_table(conn):
    """If an old-schema entries table exists (no 'fy' column), migrate it into the new schema."""
    cols = [r['name'] for r in conn.execute("PRAGMA table_info(entries)")]
    if not cols:
        return  # table doesn't exist yet, SCHEMA will create it
    if 'fy' in cols:
        return  # already migrated

    print("Migrating older database to the financial-year schema...")
    conn.execute("ALTER TABLE entries RENAME TO entries_old")
    conn.executescript(SCHEMA)  # (re)creates entries with the new structure + other new tables

    old_rows = conn.execute("SELECT * FROM entries_old").fetchall()
    skipped = 0
    for r in old_rows:
        old_annual_plan = r['annual_plan'] if 'annual_plan' in r.keys() else 0
        if r['block_id'] is None:
            skipped += 1  # true legacy district-wide rows are handled by _migrate_legacy_ecosystem_rows below
            continue
        conn.execute("""
            INSERT OR IGNORE INTO entries
                (indicator_code, district, block_id, level, fy,
                 q1_plan, q2_plan, q3_plan, q4_plan, q1, q2, q3, q4, updated_at)
            VALUES (?,?,?,?,?, ?,?,?,?, ?,?,?,?, ?)
        """, (
            r['indicator_code'], r['district'], r['block_id'], r['level'], BASE_FY,
            old_annual_plan / 4.0, old_annual_plan / 4.0, old_annual_plan / 4.0, old_annual_plan / 4.0,
            r['q1'], r['q2'], r['q3'], r['q4'], r['updated_at']
        ))
    conn.execute("DROP TABLE entries_old")
    print(f"Migrated {len(old_rows) - skipped} existing entries into financial year {BASE_FY}"
          f"{f' ({skipped} district-wide legacy rows carried over separately)' if skipped else ''}.")

def _migrate_add_manual_opening(conn):
    cols = [r['name'] for r in conn.execute("PRAGMA table_info(entries)")]
    if cols and 'manual_opening' not in cols:
        conn.execute("ALTER TABLE entries ADD COLUMN manual_opening REAL DEFAULT 0")
        print("Added manual_opening column to entries table.")

def _migrate_add_block_category(conn):
    cols = [r['name'] for r in conn.execute("PRAGMA table_info(blocks)")]
    if cols and 'category' not in cols:
        conn.execute("ALTER TABLE blocks ADD COLUMN category TEXT NOT NULL DEFAULT 'Ecosystem'")
        print("Added category column to blocks table (defaulted to Ecosystem).")

def _apply_grassroot_mapping(conn):
    """Marks the specific blocks named in grassroot_blocks.json as 'Grassroot'; everything else stays 'Ecosystem'."""
    path = os.path.join(BASE, 'grassroot_blocks.json')
    if not os.path.exists(path):
        return
    with open(path) as f:
        mapping = json.load(f)
    conn.execute("UPDATE blocks SET category='Ecosystem'")
    updated = 0
    for district, block_names in mapping.items():
        for name in block_names:
            cur = conn.execute("UPDATE blocks SET category='Grassroot' WHERE district=? AND name=?", (district, name))
            updated += cur.rowcount
    print(f"Applied Grassroot mapping: {updated} blocks marked Grassroot, rest are Ecosystem.")

def _migrate_legacy_ecosystem_rows(conn):
    """Old district-wide (block_id IS NULL) ecosystem entries don't fit the new per-block model.
    Preserve them by attaching to a synthetic 'District-wide (legacy)' Ecosystem block per district."""
    cols = [r['name'] for r in conn.execute("PRAGMA table_info(entries)")]
    if 'block_id' not in cols:
        return
    try:
        legacy_rows = conn.execute("SELECT * FROM entries WHERE block_id IS NULL").fetchall()
    except sqlite3.OperationalError:
        return
    if not legacy_rows:
        return
    print(f"Found {len(legacy_rows)} legacy district-wide ecosystem entries — migrating to synthetic blocks...")
    synth_ids = {}
    for r in legacy_rows:
        district = r['district']
        if district not in synth_ids:
            name = f"{district} - District-wide (legacy)"
            conn.execute("INSERT OR IGNORE INTO blocks (district, name, category) VALUES (?,?,'Ecosystem')", (district, name))
            row = conn.execute("SELECT id FROM blocks WHERE district=? AND name=?", (district, name)).fetchone()
            synth_ids[district] = row['id']
        conn.execute("UPDATE entries SET block_id=?, level='ecosystem' WHERE id=?", (synth_ids[district], r['id']))
    print(f"Migrated legacy rows into {len(synth_ids)} synthetic district-wide blocks.")

def _migrate_entries_level_from_block_category(conn):
    """Any entries still tagged level='block' (pre-Grassroot/Ecosystem split) get their level
    re-derived from their block's actual category."""
    rows = conn.execute("""
        SELECT e.id, b.category FROM entries e JOIN blocks b ON b.id = e.block_id WHERE e.level = 'block'
    """).fetchall()
    if not rows:
        return
    for r in rows:
        conn.execute("UPDATE entries SET level=? WHERE id=?", (r['category'].lower(), r['id']))
    print(f"Re-classified {len(rows)} entries into Grassroot/Ecosystem based on their block.")

def init_db(force=False):
    conn = get_conn()

    _migrate_old_entries_table(conn)
    conn.executescript(SCHEMA)
    _migrate_add_manual_opening(conn)
    _migrate_add_block_category(conn)
    conn.commit()

    cur = conn.execute("SELECT COUNT(*) c FROM indicators")
    if cur.fetchone()['c'] == 0:
        with open(os.path.join(BASE, 'indicators.json')) as f:
            indicators = json.load(f)
        with open(os.path.join(BASE, 'district_blocks.json')) as f:
            district_blocks = json.load(f)

        conn.executemany(
            "INSERT OR IGNORE INTO indicators (code, theme, subtheme, text, period) VALUES (?,?,?,?,?)",
            [(i['code'], i['theme'], i.get('subtheme'), i['text'],
              'Period' if (i.get('period') or '').strip().lower() != 'cumulative' else 'Cumulative')
             for i in indicators]
        )

        for district, blocks in district_blocks.items():
            conn.execute("INSERT OR IGNORE INTO districts (name) VALUES (?)", (district,))
            for b in blocks:
                conn.execute("INSERT OR IGNORE INTO blocks (district, name, category) VALUES (?,?,'Ecosystem')", (district, b))

        conn.commit()
        print(f"Seeded {len(indicators)} indicators and districts/blocks.")

    _apply_grassroot_mapping(conn)
    conn.commit()

    _migrate_legacy_ecosystem_rows(conn)
    _migrate_entries_level_from_block_category(conn)
    conn.commit()

    conn.execute("INSERT OR IGNORE INTO financial_years (fy, start_year) VALUES (?,?)", (BASE_FY, BASE_FY_START))
    cur = conn.execute("SELECT COUNT(*) c FROM workflow_state")
    if cur.fetchone()['c'] == 0:
        conn.execute("INSERT INTO workflow_state (id, current_fy, current_quarter) VALUES (1, ?, 'Q1')", (BASE_FY,))
    conn.commit()
    conn.close()

def next_fy_label(fy):
    """'2026-27' -> '2027-28'"""
    start = int(fy.split('-')[0])
    return f"{start + 1}-{str(start + 2)[-2:]}"

if __name__ == '__main__':
    init_db(force=True)
    print("DB initialized at", DB_PATH)
