"""
FleetWatch server — central collector + admin dashboard.
Self-hosted. Stores everything in a local SQLite file. No third-party service.

Run:  uvicorn app:app --host 0.0.0.0 --port 8000
"""
import csv
import io
import os
import sqlite3
import secrets
from datetime import datetime, timedelta, timezone
from contextlib import contextmanager

from fastapi import FastAPI, Request, Depends, HTTPException, Header, Form, UploadFile, File
from fastapi.responses import HTMLResponse, RedirectResponse, StreamingResponse, FileResponse
from fastapi.templating import Jinja2Templates
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from categories import categorize

# One activity sample represents this many seconds of use (matches agent sample_seconds).
SAMPLE_SECONDS = int(os.environ.get("FLEETWATCH_SAMPLE_SECONDS", "30"))

# Where uploaded screenshots are stored on the server's disk.
SHOTS_DIR = os.environ.get("FLEETWATCH_SHOTS", "shots")
os.makedirs(SHOTS_DIR, exist_ok=True)

DB_PATH = os.environ.get("FLEETWATCH_DB", "fleetwatch.db")

# Shared secret each agent must send. Change this and put the same value in the agent config.
AGENT_TOKEN = os.environ.get("FLEETWATCH_AGENT_TOKEN", "CHANGE-ME-agent-shared-secret")

# Admin dashboard login.
ADMIN_USER = os.environ.get("FLEETWATCH_ADMIN_USER", "admin")
ADMIN_PASS = os.environ.get("FLEETWATCH_ADMIN_PASS", "changeme")

app = FastAPI(title="FleetWatch")
app.mount("/static", StaticFiles(directory="static"), name="static")
templates = Jinja2Templates(directory="templates")

_sessions: set[str] = set()  # in-memory admin session tokens


@contextmanager
def db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    try:
        yield conn
        conn.commit()
    finally:
        conn.close()


def init_db():
    with db() as conn:
        conn.executescript(
            """
            CREATE TABLE IF NOT EXISTS machines (
                hostname   TEXT PRIMARY KEY,
                username   TEXT,
                os         TEXT,
                agent_ver  TEXT,
                last_seen  TEXT
            );
            CREATE TABLE IF NOT EXISTS events (
                id        INTEGER PRIMARY KEY AUTOINCREMENT,
                hostname  TEXT,
                username  TEXT,
                kind      TEXT,          -- logon | logoff | lock | unlock | startup | shutdown
                ts        TEXT
            );
            CREATE TABLE IF NOT EXISTS activity (
                id        INTEGER PRIMARY KEY AUTOINCREMENT,
                hostname  TEXT,
                username  TEXT,
                app       TEXT,          -- process / app name
                title     TEXT,          -- active window title
                idle      INTEGER,       -- 1 if user was idle during this sample
                ts        TEXT
            );
            CREATE TABLE IF NOT EXISTS security (
                id        INTEGER PRIMARY KEY AUTOINCREMENT,
                hostname  TEXT,
                username  TEXT,
                kind      TEXT,          -- usb_insert | usb_remove | file_to_usb | file_to_cloud
                detail    TEXT,          -- drive letter / file path / size
                ts        TEXT
            );
            CREATE TABLE IF NOT EXISTS screenshots (
                id        INTEGER PRIMARY KEY AUTOINCREMENT,
                hostname  TEXT,
                username  TEXT,
                path      TEXT,          -- file on disk relative to SHOTS_DIR
                ts        TEXT
            );
            CREATE TABLE IF NOT EXISTS commands (
                id           INTEGER PRIMARY KEY AUTOINCREMENT,
                hostname     TEXT,
                action       TEXT,          -- lock | shutdown | cancel_shutdown
                status       TEXT,          -- pending | delivered | done
                source       TEXT,          -- who issued it (e.g. telegram:<id>)
                created_ts   TEXT,
                delivered_ts TEXT
            );
            CREATE INDEX IF NOT EXISTS idx_cmd_host ON commands(hostname, status);
            CREATE INDEX IF NOT EXISTS idx_events_host ON events(hostname, ts);
            CREATE INDEX IF NOT EXISTS idx_act_host    ON activity(hostname, ts);
            CREATE INDEX IF NOT EXISTS idx_sec_host    ON security(hostname, ts);
            CREATE INDEX IF NOT EXISTS idx_shot_host   ON screenshots(hostname, ts);
            """
        )


init_db()


# ---------------------------------------------------------------- agent API

class EventIn(BaseModel):
    hostname: str
    username: str
    kind: str
    ts: str | None = None


class ActivityIn(BaseModel):
    hostname: str
    username: str
    app: str
    title: str = ""
    idle: bool = False
    ts: str | None = None


class Heartbeat(BaseModel):
    hostname: str
    username: str
    os: str = ""
    agent_ver: str = ""


def check_agent(x_agent_token: str = Header(default="")):
    if not secrets.compare_digest(x_agent_token, AGENT_TOKEN):
        raise HTTPException(status_code=401, detail="bad agent token")


def now():
    return datetime.now(timezone.utc).isoformat()


@app.post("/api/heartbeat", dependencies=[Depends(check_agent)])
def heartbeat(hb: Heartbeat):
    with db() as conn:
        conn.execute(
            """INSERT INTO machines(hostname, username, os, agent_ver, last_seen)
               VALUES(?,?,?,?,?)
               ON CONFLICT(hostname) DO UPDATE SET
                 username=excluded.username, os=excluded.os,
                 agent_ver=excluded.agent_ver, last_seen=excluded.last_seen""",
            (hb.hostname, hb.username, hb.os, hb.agent_ver, now()),
        )
    return {"ok": True}


@app.post("/api/event", dependencies=[Depends(check_agent)])
def post_event(ev: EventIn):
    with db() as conn:
        conn.execute(
            "INSERT INTO events(hostname, username, kind, ts) VALUES(?,?,?,?)",
            (ev.hostname, ev.username, ev.kind, ev.ts or now()),
        )
    return {"ok": True}


@app.post("/api/activity", dependencies=[Depends(check_agent)])
def post_activity(items: list[ActivityIn]):
    with db() as conn:
        conn.executemany(
            "INSERT INTO activity(hostname, username, app, title, idle, ts) VALUES(?,?,?,?,?,?)",
            [(a.hostname, a.username, a.app, a.title, int(a.idle), a.ts or now()) for a in items],
        )
    return {"ok": True, "stored": len(items)}


class SecurityIn(BaseModel):
    hostname: str
    username: str
    kind: str          # usb_insert | usb_remove | file_to_usb | file_to_cloud
    detail: str = ""
    ts: str | None = None


@app.post("/api/security", dependencies=[Depends(check_agent)])
def post_security(items: list[SecurityIn]):
    with db() as conn:
        conn.executemany(
            "INSERT INTO security(hostname, username, kind, detail, ts) VALUES(?,?,?,?,?)",
            [(s.hostname, s.username, s.kind, s.detail, s.ts or now()) for s in items],
        )
    return {"ok": True, "stored": len(items)}


@app.post("/api/screenshot", dependencies=[Depends(check_agent)])
async def post_screenshot(
    hostname: str = Form(...),
    username: str = Form(...),
    ts: str = Form(default=""),
    file: UploadFile = File(...),
):
    stamp = (ts or now()).replace(":", "").replace("-", "").replace(".", "")[:15]
    safe_host = "".join(c for c in hostname if c.isalnum() or c in "-_") or "host"
    subdir = os.path.join(SHOTS_DIR, safe_host)
    os.makedirs(subdir, exist_ok=True)
    fname = f"{stamp}_{secrets.token_hex(4)}.jpg"
    rel = os.path.join(safe_host, fname)
    with open(os.path.join(SHOTS_DIR, rel), "wb") as f:
        f.write(await file.read())
    with db() as conn:
        conn.execute(
            "INSERT INTO screenshots(hostname, username, path, ts) VALUES(?,?,?,?)",
            (hostname, username, rel, ts or now()),
        )
    return {"ok": True}


ALLOWED_ACTIONS = {"lock", "shutdown", "cancel_shutdown"}


def enqueue_command(hostname: str, action: str, source: str) -> int:
    """Queue a remote action for a machine. Returns the command id."""
    if action not in ALLOWED_ACTIONS:
        raise ValueError(f"unknown action: {action}")
    with db() as conn:
        cur = conn.execute(
            "INSERT INTO commands(hostname, action, status, source, created_ts) "
            "VALUES(?,?,'pending',?,?)",
            (hostname, action, source, now()),
        )
        return cur.lastrowid


@app.get("/api/commands", dependencies=[Depends(check_agent)])
def get_commands(hostname: str):
    """Agent polls this; returns pending commands and marks them delivered."""
    with db() as conn:
        rows = conn.execute(
            "SELECT id, action FROM commands WHERE hostname=? AND status='pending' ORDER BY id",
            (hostname,),
        ).fetchall()
        ids = [r["id"] for r in rows]
        if ids:
            conn.execute(
                f"UPDATE commands SET status='delivered', delivered_ts=? "
                f"WHERE id IN ({','.join('?' * len(ids))})",
                [now(), *ids],
            )
    return {"commands": [{"id": r["id"], "action": r["action"]} for r in rows]}


# ---------------------------------------------------------------- admin auth

def require_admin(request: Request):
    tok = request.cookies.get("fw_session", "")
    if tok not in _sessions:
        raise HTTPException(status_code=302, headers={"Location": "/login"})


@app.get("/login", response_class=HTMLResponse)
def login_form(request: Request):
    return templates.TemplateResponse(request, "login.html", {"err": ""})


@app.post("/login")
def login(request: Request, username: str = Form(...), password: str = Form(...)):
    if secrets.compare_digest(username, ADMIN_USER) and secrets.compare_digest(password, ADMIN_PASS):
        tok = secrets.token_urlsafe(32)
        _sessions.add(tok)
        r = RedirectResponse("/", status_code=302)
        r.set_cookie("fw_session", tok, httponly=True, samesite="lax")
        return r
    return templates.TemplateResponse(request, "login.html", {"err": "Invalid credentials"})


@app.get("/logout")
def logout(request: Request):
    tok = request.cookies.get("fw_session", "")
    _sessions.discard(tok)
    return RedirectResponse("/login", status_code=302)


# ---------------------------------------------------------------- dashboard

@app.get("/", response_class=HTMLResponse)
def dashboard(request: Request):
    tok = request.cookies.get("fw_session", "")
    if tok not in _sessions:
        return RedirectResponse("/login", status_code=302)

    cutoff = (datetime.now(timezone.utc) - timedelta(minutes=5)).isoformat()
    with db() as conn:
        machines = conn.execute("SELECT * FROM machines ORDER BY hostname").fetchall()
        machines = [dict(m) for m in machines]
        for m in machines:
            m["online"] = (m["last_seen"] or "") >= cutoff
    return templates.TemplateResponse(request, "dashboard.html", {"machines": machines})


@app.get("/machine/{hostname}", response_class=HTMLResponse)
def machine_detail(request: Request, hostname: str):
    tok = request.cookies.get("fw_session", "")
    if tok not in _sessions:
        return RedirectResponse("/login", status_code=302)

    since = (datetime.now(timezone.utc) - timedelta(days=1)).isoformat()
    with db() as conn:
        machine = conn.execute("SELECT * FROM machines WHERE hostname=?", (hostname,)).fetchone()
        events = conn.execute(
            "SELECT * FROM events WHERE hostname=? AND ts>=? ORDER BY ts DESC LIMIT 200",
            (hostname, since),
        ).fetchall()
        # top apps by sample count (each sample ~ one interval of active use)
        top = conn.execute(
            """SELECT app, COUNT(*) AS samples,
                      SUM(CASE WHEN idle=0 THEN 1 ELSE 0 END) AS active
               FROM activity WHERE hostname=? AND ts>=?
               GROUP BY app ORDER BY active DESC LIMIT 25""",
            (hostname, since),
        ).fetchall()
        recent = conn.execute(
            "SELECT * FROM activity WHERE hostname=? AND ts>=? ORDER BY ts DESC LIMIT 100",
            (hostname, since),
        ).fetchall()
        sec = conn.execute(
            "SELECT * FROM security WHERE hostname=? AND ts>=? ORDER BY ts DESC LIMIT 50",
            (hostname, since),
        ).fetchall()
        shot_count = conn.execute(
            "SELECT COUNT(*) AS n FROM screenshots WHERE hostname=? AND ts>=?",
            (hostname, since),
        ).fetchone()["n"]
    top = [dict(t) for t in top]
    for t in top:
        t["category"] = categorize(t["app"])
    prod = productivity_split(top)
    return templates.TemplateResponse(
        request,
        "machine.html",
        {
            "hostname": hostname,
            "machine": dict(machine) if machine else None,
            "events": [dict(e) for e in events],
            "top": top,
            "recent": [dict(r) for r in recent],
            "sec": [dict(s) for s in sec],
            "shot_count": shot_count,
            "prod": prod,
        },
    )


# ---------------------------------------------------------------- attendance

# Company-local timezone offset from UTC, in hours (IST = 5.5). Set FLEETWATCH_TZ_OFFSET.
TZ_OFFSET = float(os.environ.get("FLEETWATCH_TZ_OFFSET", "5.5"))

LOGIN_KINDS = ("logon", "unlock", "startup")
LOGOUT_KINDS = ("logoff", "lock", "shutdown")


def _local(ts_iso: str) -> datetime:
    """UTC ISO string -> naive local datetime using TZ_OFFSET."""
    dt = datetime.fromisoformat(ts_iso)
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return (dt.astimezone(timezone.utc) + timedelta(hours=TZ_OFFSET)).replace(tzinfo=None)


def _fmt_minutes(mins: float) -> str:
    mins = int(round(mins))
    return f"{mins // 60}h {mins % 60}m"


def productivity_split(rows):
    """rows: list of dicts with 'active' (sample count) and 'category'."""
    buckets = {"productive": 0, "unproductive": 0, "neutral": 0}
    for r in rows:
        buckets[r.get("category", "neutral")] += r["active"]
    total = sum(buckets.values()) or 1
    return {
        "productive_min": buckets["productive"] * SAMPLE_SECONDS / 60,
        "unproductive_min": buckets["unproductive"] * SAMPLE_SECONDS / 60,
        "neutral_min": buckets["neutral"] * SAMPLE_SECONDS / 60,
        "productive_pct": round(buckets["productive"] / total * 100),
        "unproductive_pct": round(buckets["unproductive"] / total * 100),
        "neutral_pct": round(buckets["neutral"] / total * 100),
        "fmt": _fmt_minutes,
    }


def attendance_for_date(date_str: str):
    """Return one attendance row per (hostname, username) for a local calendar date."""
    local_start = datetime.strptime(date_str, "%Y-%m-%d")
    utc_start = (local_start - timedelta(hours=TZ_OFFSET)).replace(tzinfo=timezone.utc)
    utc_end = utc_start + timedelta(days=1)
    lo, hi = utc_start.isoformat(), utc_end.isoformat()

    with db() as conn:
        events = conn.execute(
            "SELECT hostname, username, kind, ts FROM events WHERE ts>=? AND ts<? ORDER BY ts",
            (lo, hi),
        ).fetchall()
        acts = conn.execute(
            """SELECT hostname, username, app, idle, ts
               FROM activity WHERE ts>=? AND ts<? ORDER BY ts""",
            (lo, hi),
        ).fetchall()

    rows: dict[tuple, dict] = {}

    def slot(host, user):
        key = (host, user)
        if key not in rows:
            rows[key] = {
                "hostname": host, "username": user,
                "first_in": None, "last_out": None,
                "active_samples": 0, "idle_samples": 0,
                "prod_samples": 0, "unprod_samples": 0, "neutral_samples": 0,
            }
        return rows[key]

    for e in events:
        r = slot(e["hostname"], e["username"])
        t = _local(e["ts"])
        if e["kind"] in LOGIN_KINDS:
            if r["first_in"] is None or t < r["first_in"]:
                r["first_in"] = t
        if e["kind"] in LOGOUT_KINDS:
            if r["last_out"] is None or t > r["last_out"]:
                r["last_out"] = t

    for a in acts:
        r = slot(a["hostname"], a["username"])
        t = _local(a["ts"])
        # activity also bounds the working span, as a fallback for missing events
        if r["first_in"] is None or t < r["first_in"]:
            r["first_in"] = t
        if r["last_out"] is None or t > r["last_out"]:
            r["last_out"] = t
        if a["idle"]:
            r["idle_samples"] += 1
        else:
            r["active_samples"] += 1
            cat = categorize(a["app"])
            r[{"productive": "prod_samples", "unproductive": "unprod_samples"}
              .get(cat, "neutral_samples")] += 1

    out = []
    for r in rows.values():
        active_min = r["active_samples"] * SAMPLE_SECONDS / 60
        idle_min = r["idle_samples"] * SAMPLE_SECONDS / 60
        span_min = 0
        if r["first_in"] and r["last_out"]:
            span_min = max(0, (r["last_out"] - r["first_in"]).total_seconds() / 60)
        out.append({
            "hostname": r["hostname"],
            "username": r["username"],
            "first_in": r["first_in"].strftime("%H:%M") if r["first_in"] else "—",
            "last_out": r["last_out"].strftime("%H:%M") if r["last_out"] else "—",
            "span_min": span_min,
            "active_min": active_min,
            "idle_min": idle_min,
            "prod_min": r["prod_samples"] * SAMPLE_SECONDS / 60,
            "unprod_min": r["unprod_samples"] * SAMPLE_SECONDS / 60,
            "neutral_min": r["neutral_samples"] * SAMPLE_SECONDS / 60,
        })
    out.sort(key=lambda x: (x["username"] or "", x["hostname"]))
    return out


@app.get("/attendance", response_class=HTMLResponse)
def attendance(request: Request, date: str | None = None):
    tok = request.cookies.get("fw_session", "")
    if tok not in _sessions:
        return RedirectResponse("/login", status_code=302)
    if not date:
        date = (datetime.now(timezone.utc) + timedelta(hours=TZ_OFFSET)).strftime("%Y-%m-%d")
    rows = attendance_for_date(date)
    return templates.TemplateResponse(
        request, "attendance.html",
        {"date": date, "rows": rows, "fmt": _fmt_minutes, "tz": TZ_OFFSET},
    )


# ---------------------------------------------------------------- CSV exports

def _csv_response(filename: str, header: list[str], rows):
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(header)
    w.writerows(rows)
    buf.seek(0)
    return StreamingResponse(
        iter([buf.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@app.get("/export/attendance.csv")
def export_attendance(request: Request, date: str | None = None):
    if request.cookies.get("fw_session", "") not in _sessions:
        return RedirectResponse("/login", status_code=302)
    if not date:
        date = (datetime.now(timezone.utc) + timedelta(hours=TZ_OFFSET)).strftime("%Y-%m-%d")
    rows = attendance_for_date(date)
    data = [[
        date, r["username"], r["hostname"], r["first_in"], r["last_out"],
        round(r["span_min"]), round(r["active_min"]), round(r["idle_min"]),
        round(r["prod_min"]), round(r["unprod_min"]), round(r["neutral_min"]),
    ] for r in rows]
    return _csv_response(
        f"attendance-{date}.csv",
        ["date", "user", "machine", "first_in", "last_out", "span_min",
         "active_min", "idle_min", "productive_min", "unproductive_min", "neutral_min"],
        data,
    )


@app.get("/export/activity.csv")
def export_activity(request: Request, hostname: str, days: int = 1):
    if request.cookies.get("fw_session", "") not in _sessions:
        return RedirectResponse("/login", status_code=302)
    since = (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()
    with db() as conn:
        acts = conn.execute(
            "SELECT ts, username, app, title, idle FROM activity WHERE hostname=? AND ts>=? ORDER BY ts",
            (hostname, since),
        ).fetchall()
    data = [[a["ts"], a["username"], a["app"], categorize(a["app"]),
             a["title"], a["idle"]] for a in acts]
    return _csv_response(
        f"activity-{hostname}.csv",
        ["ts_utc", "user", "app", "category", "window_title", "idle"], data,
    )


@app.get("/export/security.csv")
def export_security(request: Request, days: int = 7):
    if request.cookies.get("fw_session", "") not in _sessions:
        return RedirectResponse("/login", status_code=302)
    since = (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()
    with db() as conn:
        rows = conn.execute(
            "SELECT ts, hostname, username, kind, detail FROM security WHERE ts>=? ORDER BY ts DESC",
            (since,),
        ).fetchall()
    data = [[r["ts"], r["hostname"], r["username"], r["kind"], r["detail"]] for r in rows]
    return _csv_response(
        "security-events.csv",
        ["ts_utc", "machine", "user", "kind", "detail"], data,
    )


# ---------------------------------------------------------------- security + screenshots

@app.get("/security", response_class=HTMLResponse)
def security_page(request: Request, days: int = 7):
    if request.cookies.get("fw_session", "") not in _sessions:
        return RedirectResponse("/login", status_code=302)
    since = (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()
    with db() as conn:
        rows = conn.execute(
            "SELECT * FROM security WHERE ts>=? ORDER BY ts DESC LIMIT 500",
            (since,),
        ).fetchall()
    return templates.TemplateResponse(
        request, "security.html",
        {"rows": [dict(r) for r in rows], "days": days},
    )


@app.get("/shots/{hostname}", response_class=HTMLResponse)
def shots_page(request: Request, hostname: str):
    if request.cookies.get("fw_session", "") not in _sessions:
        return RedirectResponse("/login", status_code=302)
    since = (datetime.now(timezone.utc) - timedelta(days=2)).isoformat()
    with db() as conn:
        shots = conn.execute(
            "SELECT * FROM screenshots WHERE hostname=? AND ts>=? ORDER BY ts DESC LIMIT 300",
            (hostname, since),
        ).fetchall()
    return templates.TemplateResponse(
        request, "shots.html",
        {"hostname": hostname, "shots": [dict(s) for s in shots]},
    )


@app.get("/shot/{shot_id}")
def serve_shot(request: Request, shot_id: int):
    if request.cookies.get("fw_session", "") not in _sessions:
        return RedirectResponse("/login", status_code=302)
    with db() as conn:
        row = conn.execute("SELECT path FROM screenshots WHERE id=?", (shot_id,)).fetchone()
    if not row:
        raise HTTPException(status_code=404)
    full = os.path.join(SHOTS_DIR, row["path"])
    if not os.path.isfile(full):
        raise HTTPException(status_code=404)
    return FileResponse(full, media_type="image/jpeg")
