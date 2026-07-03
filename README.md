# APPT Odisha 2026-27 — Data Entry & Consolidation App

A local web application that automates your `APPT_Consolidation_Odisha_2026-27` Excel template:
block-wise data entry, automatic district and state roll-ups, and an analytical dashboard —
all running privately on your own PC (no internet/cloud needed after setup).

Built from your uploaded workbook: **339 indicators** across **31 themes**, **23 districts**,
**161 blocks**.

---

## 1. What's inside

| File | Purpose |
|---|---|
| `app.py` | Backend server (Flask) — API + serves the app |
| `db.py` | Database setup, auto-seeds indicators/districts/blocks on first run |
| `indicators.json` / `district_blocks.json` | The schema extracted from your Excel file |
| `static/` | The app itself (Data Entry, Reports, Dashboard screens) |
| `appt.db` | Your data — a single SQLite file. **Back this up / copy it to move your data.** |
| `Start_App.bat` | Double-click launcher for Windows |
| `start_app.sh` | Launcher for Mac/Linux |

## 2. First-time setup

You need **Python 3.9+** installed (get it from python.org — during install, tick "Add Python to PATH").

- **Windows:** double-click `Start_App.bat`
- **Mac/Linux:** open Terminal in this folder and run `./start_app.sh`

The first run installs Flask + openpyxl automatically, then opens the app in your browser at
`http://127.0.0.1:5050`. Next time, just run the same launcher — it starts instantly.

To stop the app, close the terminal/command window it's running in.

## 3. How to use it

### Grassroot vs Ecosystem blocks
Every block in every district is tagged **Grassroot** or **Ecosystem** based on your Grassroot
master mapping (currently: 12 specific blocks across Kendujhar, Mayurbhanj, Koraput, Rayagada,
Kandhamal, and Kalahandi are Grassroot — every other block, including all blocks in the remaining
17 districts, is Ecosystem). This isn't chosen at data-entry time — it's fixed per block. If the
mapping ever changes, tell me which blocks moved and I'll update it.

### Financial Year & Quarter workflow
The app tracks one **currently open reporting period** (a Financial Year + Quarter) at a time,
shown at the top of the Data Entry screen (e.g. "FY 2026-27 — Q1").

- **Quarterly Plan vs Achievement** — every indicator now has separate **Plan** and **Achieved**
  columns for each quarter (Q1 Plan / Q1 Achv, Q2 Plan / Q2 Achv, etc.), so you can set the whole
  year's targets upfront and fill in actuals as each quarter progresses.
- You can plan ahead for future quarters within the current year, but you can only enter
  **achievement** figures for the quarter that's currently open (you can't log Q3 actuals before Q1/Q2 have happened).
- **Freezing a quarter**: once a quarter's data is final, click **"🔒 Freeze [quarter] & open next"**.
  You'll be asked for the separate **admin password** (set in `config.py`, different from the login
  password everyone else uses) — this keeps closing a period a deliberate, restricted action.
  Freezing locks that quarter permanently (read-only from then on) and automatically opens the next
  quarter for entry. Freezing Q4 automatically starts the next Financial Year at Q1.
- **Unfreezing**: made a mistake, or need to correct a figure after closing a quarter? Click
  **"🔓 Unfreeze last quarter"** (also admin-password protected). This reopens the most recently
  frozen quarter for editing and moves the "currently open" pointer back to it. It only ever
  reverses one step at a time — you can't skip around to unfreeze an arbitrary quarter from
  further back.
- Use the **Financial Year** and **Quarter** filters on the Data Entry screen to look back at
  past (frozen) periods — they display read-only.

### Seeding a starting baseline (Opening Balance)
For **Cumulative** indicators, the very first Financial Year in the system (2026-27) shows an
editable **Opening Balance** cell. Use this to record any total your programme had already
achieved *before* you started using this app (e.g. "we'd already reached 12,000 households as of
March 2026"). Once entered, that baseline automatically carries forward into every future year
along with each year's own progress — you only ever enter it once, on the base year. From the
second Financial Year onward, the Opening Balance column becomes a read-only computed figure.

### Cumulative vs Period indicators
Each indicator is tagged **Cumulative** or **Period** (shown in its own column):
- **Cumulative** indicators carry their final total forward into the next Financial Year as an
  **Opening Balance** — so a running total is preserved year over year (e.g. total households
  reached since the programme began).
- **Period** indicators reset to zero at the start of each new Financial Year — they measure
  that year's activity only.
This carry-forward happens automatically the moment you freeze Q4 and roll into a new year —
nothing needs to be copied manually.

### Data Entry tab
1. Pick **District**, optionally narrow the **Category filter** to Grassroot-only or Ecosystem-only,
   then pick a **Block** — each option in the dropdown shows its category (e.g. "Banspal — Grassroot").
   A badge next to the freeze controls confirms which category you're editing.
2. Pick the **Financial Year** and, optionally, a single **Quarter** to focus on (or leave "All Quarters" to see the full year's grid).
3. Optionally filter by Theme or search a code/keyword (e.g. `AGR-04` or "villages covered").
4. Fill in each quarter's **Plan** and **Achv.** columns. Cells that are greyed out are either
   frozen (already closed) or not yet open (future quarter's achievement). Edited cells highlight yellow.
5. Click **💾 Save All**.

Work through every block in a district — both Grassroot and Ecosystem — before moving to the next district.

### District Report tab
Pick a district and Financial Year to see every indicator broken down **block-by-block** — Grassroot
blocks and Ecosystem blocks are shown as separate columns, tinted green/blue so the split is visible
at a glance — with Grassroot Total, Ecosystem Total, District Total, Plan, and % Achieved.
**Export Excel** downloads this exact table, tinting included.

### State Consolidation tab
Same idea for the whole state — one row per indicator, one column per **district**, plus separate
**State Grassroot** and **State Ecosystem** subtotal columns before the overall State Plan/Achieved/%.
Pick the Financial Year to view. Exportable to Excel.

### Dashboard tab
Pick a Financial Year, then see:
- KPI cards: total data points entered, overall state achievement %, **Grassroot achievement %**, **Ecosystem achievement %**, and top-performing district.
- **Achievement % by Theme**, **District Ranking**, **Quarterly Progress**, **Plan vs Achieved**.
- **Grassroot vs Ecosystem** charts — achievement % and plan-vs-achieved side by side.
- **Block-wise Heatmap** — every block color-coded by performance, tagged G/E for category.

## 4. How the numbers add up

- **Block total (this year)** = whatever you enter directly for that block's quarters (Q1+Q2+Q3+Q4 achieved) — Grassroot and Ecosystem blocks are entered the same way.
- For **Cumulative** indicators, the figure shown everywhere also includes the **Opening Balance**
  carried forward from all previous years — so District/State totals and the Dashboard reflect the
  true running total, not just this year's activity.
- For **Period** indicators, only this year's entries count (no carry-forward).
- **District Grassroot Total** = sum of that district's Grassroot-category blocks.
- **District Ecosystem Total** = sum of that district's Ecosystem-category blocks.
- **District total** = Grassroot Total + Ecosystem Total.
- **State total** = sum of all districts (with the same Grassroot/Ecosystem split available state-wide too).

## 5. Your data

Everything you enter lives in `appt.db` in this folder. It's a single file — copy it to back up,
or copy it to another PC's `appt_app` folder (replacing the empty one) to move your data over.
No data ever leaves your computer; there's no cloud sync.

## 6. If something goes wrong

- **"python not found"** — reinstall Python from python.org and tick "Add to PATH".
- **Port already in use** — another copy of the app may already be running; close that terminal window first.
- **Want to start over with blank data** — close the app, delete `appt.db`, restart the launcher (it re-seeds automatically).
