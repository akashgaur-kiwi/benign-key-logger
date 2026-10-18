"""
FleetWatch Telegram bridge — runs on YOUR server (not on employee laptops).

What it does:
  * Sends alerts to your private Telegram chat when a session starts (and optionally
    on every active-window change).
  * Listens (long-polling) for commands from YOUR Telegram user ID only, ignoring
    everyone else.
  * Turns /lock and /shutdown into queued commands that the target agent picks up and
    executes. The bot token never leaves this server.

Commands (send to the bot):
  /list                     - list machines and online status
  /lock <HOSTNAME>          - lock that workstation
  /shutdown <HOSTNAME>      - shut it down in 60s (LockWorkStation/shutdown run on the PC)
  /cancel <HOSTNAME>        - cancel a pending shutdown
  /status <HOSTNAME>        - last-seen + current user + last app
  /help

Run:
  export TELEGRAM_BOT_TOKEN="123456:ABC..."
  export TELEGRAM_AUTHORIZED_USER_ID="123456789"
  export FLEETWATCH_DB="fleetwatch.db"          # same DB the web app uses
  export FLEETWATCH_ALERT_MODE="session"        # session | activity | off
  python telegram_bridge.py
"""
import os
import sqlite3
import time
from datetime import datetime, timezone, timedelta

import requests

DB_PATH = os.environ.get("FLEETWATCH_DB", "fleetwatch.db")
BOT_TOKEN = os.environ.get("TELEGRAM_BOT_TOKEN", "")
AUTH_ID = os.environ.get("TELEGRAM_AUTHORIZED_USER_ID", "")   # your numeric Telegram id
ALERT_MODE = os.environ.get("FLEETWATCH_ALERT_MODE", "session").lower()  # session|activity|off
TZ_OFFSET = float(os.environ.get("FLEETWATCH_TZ_OFFSET", "5.5"))

API = f"https://api.telegram.org/bot{BOT_TOKEN}"
SESSION_KINDS = {"logon", "unlock", "startup"}

if not BOT_TOKEN or not AUTH_ID:
    raise SystemExit("Set TELEGRAM_BOT_TOKEN and TELEGRAM_AUTHORIZED_USER_ID first.")


def db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def now_iso():
    return datetime.now(timezone.utc).isoformat()


def local(ts_iso):
    try:
        dt = datetime.fromisoformat(ts_iso)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return (dt + timedelta(hours=TZ_OFFSET)).strftime("%H:%M:%S")
    except Exception:
        return ts_iso


# ---------------------------------------------------------------- telegram I/O
def send(text):
    try:
        requests.post(f"{API}/sendMessage",
                      json={"chat_id": AUTH_ID, "text": text, "parse_mode": "HTML"},
                      timeout=15)
    except Exception as e:
        print("send failed:", e)


def enqueue(hostname, action, source):
    conn = db()
    conn.execute(
        "INSERT INTO commands(hostname, action, status, source, created_ts) "
        "VALUES(?,?,'pending',?,?)",
        (hostname, action, source, now_iso()),
    )
    conn.commit()
    conn.close()


def machine_exists(hostname):
    conn = db()
    row = conn.execute("SELECT 1 FROM machines WHERE hostname=?", (hostname,)).fetchone()
    conn.close()
    return row is not None


# ---------------------------------------------------------------- command handling
def handle_command(text):
    parts = text.strip().split()
    cmd = parts[0].lower().lstrip("/")
    arg = parts[1] if len(parts) > 1 else ""

    if cmd in ("start", "help"):
        return ("FleetWatch remote control\n"
                "/list — machines + status\n"
                "/lock &lt;HOST&gt; — lock workstation\n"
                "/shutdown &lt;HOST&gt; — shut down in 60s\n"
                "/cancel &lt;HOST&gt; — cancel shutdown\n"
                "/status &lt;HOST&gt; — details")

    if cmd == "list":
        conn = db()
        cutoff = (datetime.now(timezone.utc) - timedelta(minutes=5)).isoformat()
        rows = conn.execute("SELECT hostname, username, last_seen FROM machines ORDER BY hostname").fetchall()
        conn.close()
        if not rows:
            return "No machines have reported yet."
        lines = []
        for r in rows:
            on = "🟢" if (r["last_seen"] or "") >= cutoff else "⚪"
            lines.append(f"{on} <b>{r['hostname']}</b> ({r['username'] or '—'})")
        return "\n".join(lines)

    if cmd in ("lock", "shutdown", "cancel", "status"):
        if not arg:
            return f"Usage: /{cmd} &lt;HOSTNAME&gt;   (see /list)"
        if not machine_exists(arg):
            return f"Unknown machine: {arg}. Use /list."
        if cmd == "lock":
            enqueue(arg, "lock", f"telegram:{AUTH_ID}")
            return f"🔒 Lock queued for <b>{arg}</b>. It will apply within a minute."
        if cmd == "shutdown":
            enqueue(arg, "shutdown", f"telegram:{AUTH_ID}")
            return f"⛔ Shutdown (60s) queued for <b>{arg}</b>."
        if cmd == "cancel":
            enqueue(arg, "cancel_shutdown", f"telegram:{AUTH_ID}")
            return f"✅ Shutdown-cancel queued for <b>{arg}</b>."
        if cmd == "status":
            conn = db()
            m = conn.execute("SELECT * FROM machines WHERE hostname=?", (arg,)).fetchone()
            a = conn.execute("SELECT app, title, ts FROM activity WHERE hostname=? ORDER BY ts DESC LIMIT 1",
                             (arg,)).fetchone()
            conn.close()
            last_app = f"{a['app']} — {a['title']}" if a else "—"
            return (f"<b>{arg}</b>\nUser: {m['username']}\n"
                    f"Last seen: {local(m['last_seen'])}\nLast app: {last_app}")

    return "Unknown command. Send /help."


# ---------------------------------------------------------------- alerting
def alert_state_init():
    conn = db()
    ev = conn.execute("SELECT MAX(id) AS m FROM events").fetchone()["m"] or 0
    ac = conn.execute("SELECT MAX(id) AS m FROM activity").fetchone()["m"] or 0
    conn.close()
    return {"last_event": ev, "last_activity": ac, "last_app": {}}


def check_alerts(state):
    if ALERT_MODE == "off":
        return
    conn = db()
    if ALERT_MODE in ("session", "activity"):
        rows = conn.execute(
            "SELECT id, hostname, username, kind, ts FROM events WHERE id>? ORDER BY id",
            (state["last_event"],),
        ).fetchall()
        for r in rows:
            state["last_event"] = r["id"]
            if r["kind"] in SESSION_KINDS:
                send(f"▶️ <b>{r['hostname']}</b> {r['kind']} — {r['username']} at {local(r['ts'])}")
    if ALERT_MODE == "activity":
        rows = conn.execute(
            "SELECT id, hostname, username, app, title FROM activity WHERE id>? ORDER BY id",
            (state["last_activity"],),
        ).fetchall()
        for r in rows:
            state["last_activity"] = r["id"]
            # only alert when the active app changed for that host (dedupe noise)
            if state["last_app"].get(r["hostname"]) != r["app"]:
                state["last_app"][r["hostname"]] = r["app"]
                send(f"🖥 <b>{r['hostname']}</b> ({r['username']}): {r['app']} — {r['title']}")
    conn.close()


# ---------------------------------------------------------------- main loop
def main():
    print(f"Telegram bridge up. Alert mode: {ALERT_MODE}. Authorized id: {AUTH_ID}")
    send("✅ FleetWatch bridge online. Send /help for commands.")
    state = alert_state_init()
    offset = None

    while True:
        # 1. poll Telegram for commands (short long-poll so we can also push alerts)
        try:
            params = {"timeout": 5}
            if offset is not None:
                params["offset"] = offset
            resp = requests.get(f"{API}/getUpdates", params=params, timeout=15).json()
            for upd in resp.get("result", []):
                offset = upd["update_id"] + 1
                msg = upd.get("message") or upd.get("edited_message")
                if not msg:
                    continue
                from_id = str(msg.get("from", {}).get("id", ""))
                text = msg.get("text", "")
                if from_id != str(AUTH_ID):
                    # strictly ignore everyone else (log only)
                    print(f"ignored message from unauthorized id {from_id}: {text!r}")
                    continue
                if text:
                    send(handle_command(text))
        except Exception as e:
            print("poll error:", e)
            time.sleep(3)

        # 2. push any new alerts
        try:
            check_alerts(state)
        except Exception as e:
            print("alert error:", e)


if __name__ == "__main__":
    main()
