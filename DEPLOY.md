# Deploying APPT Odisha App for Multi-Device / Multi-Location Access

This turns the app from "runs on my PC only" into a real internet link that anyone on your
team can open from Koraput, Mayurbhanj, Bhubaneswar — anywhere — at the same time.

**Recommended: PythonAnywhere** — free, no credit card, keeps your data safely on disk between
sessions, and doesn't need any command-line skills. Steps below.

---

## Before you deploy: set your password

Open `config.py` in this folder and change:
```python
LOGIN_PASSWORD = "Pradan@2026"        # <- change this to something only your team knows
ADMIN_PASSWORD = "PradanAdmin@2026"   # <- change this too; only give it to whoever should freeze/unfreeze periods
SECRET_KEY = "change-this-to-any-random-text-1f4e78-appt"   # <- change to any random text
```
Everyone entering data uses the shared `LOGIN_PASSWORD` to sign in. The separate `ADMIN_PASSWORD`
is asked for specifically when someone tries to **freeze** or **unfreeze** a quarter — keep it
restricted to whoever owns that decision (e.g. the M&E lead), since it's not tied to a named user
account, just a second password prompt. Save the file before uploading.

---

## Option A — PythonAnywhere (recommended, free, persistent, easiest)

1. **Create a free account** at https://www.pythonanywhere.com (Beginner/Free plan).

2. **Upload your app folder.**
   - Go to the **Files** tab.
   - Create a new folder, e.g. `appt_app`.
   - Upload every file from your local `appt_app` folder into it (drag-and-drop works, or use
     "Upload a file" one at a time — for the whole folder, zip it, upload the zip, then in a
     **Bash console** run `unzip APPT_Odisha_App.zip`).

3. **Open a Bash console** (Consoles tab → Bash) and install dependencies:
   ```
   cd appt_app
   pip install --user -r requirements.txt
   ```

4. **Create the web app.**
   - Go to the **Web** tab → **Add a new web app** → choose **Manual configuration** → **Python 3.10** (or whatever's offered).

5. **Point it at your app.**
   - On the Web tab, find **"Code" → WSGI configuration file** and click it to edit.
   - Delete everything in that file and replace it with:
     ```python
     import sys
     path = '/home/YOURUSERNAME/appt_app'
     if path not in sys.path:
         sys.path.insert(0, path)

     from app import app as application
     ```
     (replace `YOURUSERNAME` with your actual PythonAnywhere username, shown in the file path at the top of the page)
   - Save.

6. **Set the working directory.**
   - Still on the Web tab, set **"Source code"** and **"Working directory"** to `/home/YOURUSERNAME/appt_app`.

7. **Reload the app** — big green **Reload** button at the top of the Web tab.

8. **Your link is ready:** `https://YOURUSERNAME.pythonanywhere.com`
   Share this with your team. Everyone signs in with the shared password from `config.py`.

Your data (`appt.db`) stays on PythonAnywhere's disk permanently — it won't reset when you
reload the app. Back it up occasionally via the Files tab (download `appt.db`).

---

## Option B — Render.com (also free to start, a bit more technical)

1. Push this folder to a GitHub repository (or use Render's "Deploy from a folder" if offered).
2. On https://render.com, **New → Web Service**, connect the repo.
3. Build command: `pip install -r requirements.txt`
   Start command: (already set via the included `Procfile`, or use)
   `gunicorn -w 2 -b 0.0.0.0:$PORT app:app`
4. **Important:** Render's free tier disk is *not* persistent — your data will reset on every
   redeploy/restart. Add a **paid Persistent Disk** (Render dashboard → your service → Disks)
   mounted at `/opt/render/project/src` and set an environment variable
   `APPT_PASSWORD` / `APPT_SECRET_KEY` there instead of editing `config.py`, for a safer setup.
5. Your link: `https://your-service-name.onrender.com`

---

## A note on concurrent editing

The app now uses SQLite's WAL mode, which safely handles multiple people entering data into
*different* blocks/districts at the same time. If two people happen to edit the exact same
block/indicator within the same second, the second save wins — so it's best if each team
member/district office "owns" their own blocks rather than everyone editing the same rows.

## Security note

The shared password is basic protection suitable for an internal team tool — it stops random
internet visitors from finding and editing your data, but everyone with the password has full
edit access (there's no per-district/per-user permission separation in this version). If you
later need different access levels (e.g. field staff can only enter their own block, not edit
others'), let me know and I can add that.
