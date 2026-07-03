#!/usr/bin/env bash
cd "$(dirname "$0")"
echo "============================================"
echo "  APPT Odisha 2026-27  -  Starting App"
echo "============================================"
python3 -m pip install -r requirements.txt --quiet
( sleep 1.5 && (open http://127.0.0.1:5050 2>/dev/null || xdg-open http://127.0.0.1:5050 2>/dev/null) ) &
python3 app.py
