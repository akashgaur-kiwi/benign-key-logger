# FleetWatch — self-hosted employee-device monitoring

A monitoring system you own and host yourself. No third-party service, no per-user fees.
Built for **company-owned Windows PCs with disclosed monitoring** (employees are told and consent).

It tracks, per machine:
- Logon / logoff / lock / unlock / startup times
- The active application and window title
- Idle time (no keyboard/mouse activity)

It deliberately does **not** capture keystrokes, passwords, screenshots, webcam or
microphone. That keeps it a legitimate workplace-monitoring tool and on the right side
of laws like India's DPDP Act and the GDPR. Get a signed acknowledgment from each
employee before deploying (see `agent/CONSENT_NOTICE.txt`).

```
 40x Windows PCs                       Your server (1 machine)
 ┌────────────────┐   HTTPS/HTTP       ┌────────────────────────┐
 │ agent.py       │ ───── POST ─────▶  │ FastAPI + SQLite       │
 │ (scheduled     │  events/activity   │ /api/*  collector      │
 │  task at logon)│                    │ /        admin dashboard│
 └────────────────┘                    └────────────────────────┘
```

## Part 1 — Set up the server (once)

On one always-on machine (a spare PC, an on-prem server, or a small cloud VM you control):

```bash
cd server
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt          # Windows: .venv\Scripts\pip

# Set your own secrets (do NOT leave the defaults):
export FLEETWATCH_AGENT_TOKEN="a-long-random-shared-secret"
export FLEETWATCH_ADMIN_USER="admin"
export FLEETWATCH_ADMIN_PASS="a-strong-password"

.venv/bin/uvicorn app:app --host 0.0.0.0 --port 8000
```

Open `http://<server-ip>:8000/` and log in. Data lives in `server/fleetwatch.db`
(back this file up).

**Production notes**
- Put it behind HTTPS (nginx/Caddy reverse proxy with a certificate) so agent traffic is encrypted.
- Keep it on your LAN or VPN; don't expose it to the open internet unless it's behind HTTPS + firewall.
- Run it as a service (systemd on Linux, or NSSM/Task Scheduler on Windows) so it restarts automatically.

## Part 2 — Deploy the agent to each PC

On each Windows 10/11 PC (needs Python 3.10+ installed "for all users"):

1. Edit `agent/agent_config.ini` — set `server =` to your server address and `token =`
   to the same value as `FLEETWATCH_AGENT_TOKEN`.
2. Copy the `agent` folder to the PC.
3. In an **elevated** PowerShell:
   ```powershell
   powershell -ExecutionPolicy Bypass -File install_agent.ps1
   ```
   This copies files to `C:\Program Files\FleetWatch`, installs dependencies, registers a
   scheduled task that runs at every logon, and shows the consent notice.

For 40 machines, push it with **Group Policy** (startup script), **Intune**, or **PsExec**
instead of doing each by hand. To remove: `uninstall_agent.ps1`.

> Tip: to avoid installing Python on every PC, build a single `agent.exe` with PyInstaller
> (`pip install pyinstaller && pyinstaller --onefile agent.py`) and deploy that instead.

## What you see in the admin dashboard
- **Home:** every machine, online/offline, current user, last-seen time.
- **Per machine:** login/logout timeline (24h), a productivity bar (productive /
  unproductive / neutral), top applications color-coded by category, and a
  recent-activity feed. Includes a per-machine **activity CSV** export.
- **Attendance** (`/attendance`): pick any date and get one row per employee with
  **first-in, last-out, present span, active time, idle time, and productive vs
  unproductive minutes**. One-click **CSV export** for HR/payroll.

### Productivity categories
`server/categories.py` classifies each app as `productive`, `unproductive`, or
`neutral`. Edit those lists to match your teams (e.g. move Slack, reclassify a design
tool). Anything unlisted is `neutral`.

### Timezone
Attendance groups by your local day. Set `FLEETWATCH_TZ_OFFSET` (hours from UTC —
IST = `5.5`) on the server. Also set `FLEETWATCH_SAMPLE_SECONDS` to match the agent's
`sample_seconds` so active-time totals are accurate.

## Security / data-loss monitoring
The **Security** page (`/security`) logs, per machine and user:
- **USB drives** connected and removed
- **Files copied to USB** drives
- **Files copied to cloud-sync folders** (OneDrive, Google Drive, Dropbox, or folders
  you list in `cloud_dirs`)

This is strong, auditable evidence for data-theft concerns — and far more defensible
than a keylogger. One-click **CSV export** included. Pair it with a Group Policy that
blocks USB storage entirely if you want to prevent (not just record) copies.

## Disclosed periodic screenshots (optional, OFF by default)
Set `screenshot_seconds` in `agent_config.ini` to a non-zero value (e.g. `600` for one
every 10 minutes) to capture the work screen. Images upload to your server under
`server/shots/` and appear on each machine's **Screenshots** page. Requires `mss` +
`Pillow` on the agent. Keep it disclosed via `CONSENT_NOTICE.txt`.

> Deliberately excluded: keystroke/password capture, webcam and microphone. These sweep
> up employees' and customers' private data and create legal + breach liability that
> device ownership does not remove.

## Deploying without Python on each PC
On one Windows build machine: `agent\build_exe.ps1` produces `dist\agent.exe`
(via PyInstaller). Ship that exe with `agent_config.ini` + `CONSENT_NOTICE.txt`,
then run `install_agent_exe.ps1` (elevated) on each PC — no Python needed there.

## Ideas to extend further
The data model is three SQLite tables (`machines`, `events`, `activity`). Easy additions:
- Weekly / monthly attendance rollups and per-employee trend charts
- Alerts (e.g. email when a USB-related process runs) — pair with a Group Policy USB block
- Website-level categorization (from browser window titles) for finer productivity data

## Legal checklist before you go live
1. Written IT & Monitoring policy stating what is collected, why, and retention period.
2. Signed employee acknowledgment.
3. Monitor company devices only, during the scope described in the policy.
4. Restrict dashboard access to authorised admins; use a strong admin password + HTTPS.
