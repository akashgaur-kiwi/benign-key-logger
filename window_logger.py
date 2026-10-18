"""
window_logger.py — a visible, cross-platform active-window + idle logger with
daily rotation, retention cleanup, and an end-of-day usage summary.

Runs as a normal console app on Windows, macOS, and Linux. Nothing is sent
anywhere — logs stay on this machine.

    2026-10-01 14:03:22 | Google Chrome | Inbox (12) - Gmail
    2026-10-01 14:11:05 | [IDLE STATE STARTED]
    2026-10-01 14:26:40 | [ACTIVE STATE RESUMED] | Slack | general

Files (in LOG_DIR):
    window_activity_YYYY-MM-DD.log   one per day, rolls over at midnight
    summary_YYYY-MM-DD.txt           usage report written at day end / on exit
Files older than RETENTION_DAYS are deleted automatically.

No pip installs are needed for the core:
  * Windows : built-in ctypes (window + idle). Optional `pip install psutil` for
              the process name.
  * macOS   : built-in `osascript` (window) and `ioreg` (idle). First run may ask
              you to grant the terminal "Accessibility" permission for titles.
  * Linux   : needs `xdotool` (window) and `xprintidle` (idle) on X11:
                  sudo apt install xdotool xprintidle
"""

import os
import re
import subprocess
import sys
import time
from collections import defaultdict
from datetime import datetime, timedelta

LOG_DIR = "."                 # where logs/summaries live
LOG_PREFIX = "window_activity"
SUMMARY_PREFIX = "summary"
POLL_SECONDS = 1.0
IDLE_SECONDS = 300            # 5 minutes of no input = idle
RETENTION_DAYS = 30          # delete logs/summaries older than this
_MAX_TICK = 60               # ignore time deltas larger than this (system sleep)


# ================================================================ active window
def _active_windows():
    import ctypes
    from ctypes import wintypes

    user32 = ctypes.windll.user32
    hwnd = user32.GetForegroundWindow()
    length = user32.GetWindowTextLengthW(hwnd)
    buf = ctypes.create_unicode_buffer(length + 1)
    user32.GetWindowTextW(hwnd, buf, length + 1)
    title = buf.value

    app = "unknown"
    try:
        import psutil  # optional
        pid = wintypes.DWORD()
        user32.GetWindowThreadProcessId(hwnd, ctypes.byref(pid))
        app = psutil.Process(pid.value).name()
    except Exception:
        pass
    return app, title


def _active_macos():
    script = (
        'tell application "System Events"\n'
        '  set frontApp to first application process whose frontmost is true\n'
        '  set appName to name of frontApp\n'
        '  try\n'
        '    set winTitle to name of front window of frontApp\n'
        '  on error\n'
        '    set winTitle to ""\n'
        '  end try\n'
        'end tell\n'
        'return appName & "\n" & winTitle'
    )
    out = subprocess.run(["osascript", "-e", script],
                         capture_output=True, text=True, timeout=5)
    parts = out.stdout.strip().split("\n", 1)
    app = parts[0] if parts else "unknown"
    title = parts[1] if len(parts) > 1 else ""
    return app, title


def _active_linux():
    app = subprocess.run(["xdotool", "getactivewindow", "getwindowclassname"],
                         capture_output=True, text=True, timeout=5).stdout.strip() or "unknown"
    title = subprocess.run(["xdotool", "getactivewindow", "getwindowname"],
                           capture_output=True, text=True, timeout=5).stdout.strip()
    return app, title


def get_active_window():
    """Return (app_name, window_title); never raises."""
    try:
        if sys.platform == "win32":
            return _active_windows()
        if sys.platform == "darwin":
            return _active_macos()
        return _active_linux()
    except FileNotFoundError:
        return "error", "<missing helper: Linux needs 'sudo apt install xdotool'>"
    except Exception as exc:
        return "error", f"<could not read active window: {exc}>"


# ================================================================ idle time
def _idle_windows():
    import ctypes
    from ctypes import wintypes

    class LASTINPUTINFO(ctypes.Structure):
        _fields_ = [("cbSize", wintypes.UINT), ("dwTime", wintypes.DWORD)]

    info = LASTINPUTINFO()
    info.cbSize = ctypes.sizeof(info)
    ctypes.windll.user32.GetLastInputInfo(ctypes.byref(info))
    millis = ctypes.windll.kernel32.GetTickCount() - info.dwTime
    return millis / 1000.0


def _idle_macos():
    out = subprocess.run(["ioreg", "-c", "IOHIDSystem"],
                         capture_output=True, text=True, timeout=5).stdout
    m = re.search(r'"HIDIdleTime"\s*=\s*(\d+)', out)
    return int(m.group(1)) / 1_000_000_000 if m else 0.0


def _idle_linux():
    out = subprocess.run(["xprintidle"], capture_output=True, text=True, timeout=5).stdout.strip()
    return int(out) / 1000.0 if out.isdigit() else 0.0


def get_idle_seconds():
    """Seconds since last user input; returns 0.0 (active) on any error."""
    try:
        if sys.platform == "win32":
            return _idle_windows()
        if sys.platform == "darwin":
            return _idle_macos()
        return _idle_linux()
    except FileNotFoundError:
        return 0.0
    except Exception:
        return 0.0


# ================================================================ helpers
def _fmt(seconds):
    seconds = int(round(seconds))
    return f"{seconds // 3600}h {(seconds % 3600) // 60:02d}m"


def log_path(day):
    return os.path.join(LOG_DIR, f"{LOG_PREFIX}_{day}.log")


def summary_path(day):
    return os.path.join(LOG_DIR, f"{SUMMARY_PREFIX}_{day}.txt")


def today_str():
    return datetime.now().strftime("%Y-%m-%d")


def log_line(day, message):
    stamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    line = f"{stamp} | {message}"
    print(line)
    try:
        with open(log_path(day), "a", encoding="utf-8") as fh:
            fh.write(line + "\n")
    except OSError as exc:
        print(f"[warn] could not write log: {exc}", file=sys.stderr)


# ================================================================ retention cleanup
_DATE_RE = re.compile(rf"(?:{LOG_PREFIX}|{SUMMARY_PREFIX})_(\d{{4}}-\d{{2}}-\d{{2}})\.(?:log|txt)$")


def cleanup_old_logs():
    """Delete activity/summary files older than RETENTION_DAYS. Never raises."""
    cutoff = datetime.now().date() - timedelta(days=RETENTION_DAYS)
    try:
        names = os.listdir(LOG_DIR or ".")
    except OSError as exc:
        print(f"[warn] cleanup could not list dir: {exc}", file=sys.stderr)
        return
    for name in names:
        m = _DATE_RE.search(name)
        if not m:
            continue
        try:
            file_date = datetime.strptime(m.group(1), "%Y-%m-%d").date()
            if file_date < cutoff:
                os.remove(os.path.join(LOG_DIR, name))
                print(f"[cleanup] removed old file: {name}")
        except (ValueError, OSError) as exc:
            print(f"[warn] cleanup skipped {name}: {exc}", file=sys.stderr)


# ================================================================ usage tracking
class UsageTracker:
    def __init__(self):
        self.total_s = 0.0
        self.idle_s = 0.0
        self.app_s = defaultdict(float)

    def add(self, dt, is_idle, app):
        self.total_s += dt
        if is_idle:
            self.idle_s += dt
        elif app and app not in ("unknown", "error"):
            self.app_s[app] += dt

    def summary_text(self, day):
        active_s = max(0.0, self.total_s - self.idle_s)
        lines = [
            f"===== Daily Usage Summary — {day} =====",
            f"Total Monitored Time : {_fmt(self.total_s)}",
            f"Total Idle Time      : {_fmt(self.idle_s)}",
            f"Net Active Time      : {_fmt(active_s)}",
            "",
            "Top Applications by Active Duration:",
        ]
        ranked = sorted(self.app_s.items(), key=lambda kv: kv[1], reverse=True)
        if ranked:
            for i, (app, secs) in enumerate(ranked, 1):
                lines.append(f"  {i:>2}. {app:<28} {_fmt(secs)}")
        else:
            lines.append("  (no active application time recorded)")
        lines.append("=" * 42)
        return "\n".join(lines)


def write_summary(day, tracker):
    """Write the day's summary to summary_<day>.txt and append it to the log. Never raises."""
    text = tracker.summary_text(day)
    try:
        with open(summary_path(day), "w", encoding="utf-8") as fh:
            fh.write(text + "\n")
    except OSError as exc:
        print(f"[warn] could not write summary file: {exc}", file=sys.stderr)
    try:
        with open(log_path(day), "a", encoding="utf-8") as fh:
            fh.write("\n" + text + "\n")
    except OSError as exc:
        print(f"[warn] could not append summary to log: {exc}", file=sys.stderr)
    print("\n" + text + "\n")


# ================================================================ main loop
def main():
    print(f"Window logger started on {sys.platform}. "
          f"Per-day logs in '{LOG_DIR}', {RETENTION_DAYS}-day retention, "
          f"idle threshold {IDLE_SECONDS}s. Press Ctrl+C to stop.\n")

    cleanup_old_logs()
    tracker = UsageTracker()
    current_day = today_str()
    last_window = None
    is_idle = False
    last_tick = time.time()

    try:
        while True:
            now = time.time()
            dt = now - last_tick
            last_tick = now
            if dt > _MAX_TICK:   # machine was asleep/suspended — don't count it
                dt = 0.0

            day = today_str()
            if day != current_day:
                # midnight rollover: finalize yesterday, clean up, start fresh
                write_summary(current_day, tracker)
                cleanup_old_logs()
                tracker = UsageTracker()
                current_day = day
                last_window = None
                is_idle = False

            idle_for = get_idle_seconds()
            app, title = get_active_window()

            if not is_idle and idle_for >= IDLE_SECONDS:
                is_idle = True
                log_line(current_day, "[IDLE STATE STARTED]")
            elif is_idle and idle_for < IDLE_SECONDS:
                is_idle = False
                log_line(current_day, f"[ACTIVE STATE RESUMED] | {app} | {title}")
                last_window = (app, title)

            tracker.add(dt, is_idle, app)

            if not is_idle:
                current = (app, title)
                if current != last_window and app not in ("", "unknown"):
                    log_line(current_day, f"{app} | {title}")
                    last_window = current

            time.sleep(POLL_SECONDS)
    except KeyboardInterrupt:
        print("\nStopping — writing final summary...")
        write_summary(current_day, tracker)
        print("Done. Logs saved in", os.path.abspath(LOG_DIR))


if __name__ == "__main__":
    main()
