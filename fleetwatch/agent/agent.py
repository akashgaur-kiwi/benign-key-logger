"""
FleetWatch agent — runs on each company Windows PC.

Reports to YOUR server only. At an interval it tracks:
  * logon / logoff / lock / unlock / startup
  * the active application + window title
  * whether the user is idle
  * USB drives plugged in / removed, and files copied to USB or cloud-sync folders
  * (optional) disclosed periodic screenshots

It does NOT capture keystrokes, passwords, webcam or microphone.
Screenshots are OFF by default (screenshot_seconds = 0) and, when enabled, are
disclosed monitoring of a company-owned device — see CONSENT_NOTICE.txt.

Config is read from agent_config.ini next to this file.
"""
import configparser
import ctypes
import getpass
import io
import os
import platform
import socket
import string
import subprocess
import sys
import time
from ctypes import wintypes
from datetime import datetime, timezone

import requests

AGENT_VER = "1.1.0"

# ---------------------------------------------------------------- config
cfg = configparser.ConfigParser()
_here = os.path.dirname(os.path.abspath(__file__))
cfg.read(os.path.join(_here, "agent_config.ini"))
SERVER = cfg.get("fleetwatch", "server", fallback="http://localhost:8000").rstrip("/")
TOKEN = cfg.get("fleetwatch", "token", fallback="CHANGE-ME-agent-shared-secret")
SAMPLE_SECONDS = cfg.getint("fleetwatch", "sample_seconds", fallback=30)
IDLE_SECONDS = cfg.getint("fleetwatch", "idle_seconds", fallback=120)
FLUSH_EVERY = cfg.getint("fleetwatch", "flush_every", fallback=10)
SECURITY_SECONDS = cfg.getint("fleetwatch", "security_seconds", fallback=60)
COMMAND_SECONDS = cfg.getint("fleetwatch", "command_seconds", fallback=30)
ALLOW_REMOTE = cfg.getboolean("fleetwatch", "allow_remote_commands", fallback=True)
SCREENSHOT_SECONDS = cfg.getint("fleetwatch", "screenshot_seconds", fallback=0)  # 0 = disabled
SCREENSHOT_QUALITY = cfg.getint("fleetwatch", "screenshot_quality", fallback=40)
CLOUD_DIRS_RAW = cfg.get("fleetwatch", "cloud_dirs", fallback="")

HOST = socket.gethostname()
USER = getpass.getuser()
HEADERS = {"X-Agent-Token": TOKEN}

# Default cloud-sync folders to watch for outbound file copies.
_home = os.path.expanduser("~")
DEFAULT_CLOUD = [
    os.path.join(_home, "OneDrive"),
    os.path.join(_home, "Google Drive"),
    os.path.join(_home, "GoogleDrive"),
    os.path.join(_home, "Dropbox"),
]
CLOUD_DIRS = [p.strip() for p in CLOUD_DIRS_RAW.split(";") if p.strip()] or DEFAULT_CLOUD

MAX_FILES_PER_ROOT = 5000  # safety cap when scanning a drive/folder


def now_iso():
    return datetime.now(timezone.utc).isoformat()


# ---------------------------------------------------------------- windows APIs
IS_WIN = sys.platform == "win32"
user32 = ctypes.windll.user32 if IS_WIN else None
kernel32 = ctypes.windll.kernel32 if IS_WIN else None
DRIVE_REMOVABLE = 2


class LASTINPUTINFO(ctypes.Structure):
    _fields_ = [("cbSize", wintypes.UINT), ("dwTime", wintypes.DWORD)]


def idle_seconds() -> float:
    if not IS_WIN:
        return 0.0
    info = LASTINPUTINFO()
    info.cbSize = ctypes.sizeof(info)
    user32.GetLastInputInfo(ctypes.byref(info))
    return (kernel32.GetTickCount() - info.dwTime) / 1000.0


def active_window():
    if not IS_WIN:
        return ("n/a", "non-windows test host")
    hwnd = user32.GetForegroundWindow()
    length = user32.GetWindowTextLengthW(hwnd)
    buf = ctypes.create_unicode_buffer(length + 1)
    user32.GetWindowTextW(hwnd, buf, length + 1)
    title = buf.value
    pid = wintypes.DWORD()
    user32.GetWindowThreadProcessId(hwnd, ctypes.byref(pid))
    proc = "unknown"
    try:
        import psutil
        proc = psutil.Process(pid.value).name()
    except Exception:
        pass
    return (proc, title)


def is_locked() -> bool:
    if not IS_WIN:
        return False
    hdesktop = user32.OpenInputDesktop(0, False, 0x0100)
    if not hdesktop:
        return True
    user32.CloseDesktop(hdesktop)
    return False


def removable_drives() -> list[str]:
    """Return roots of currently-mounted removable drives, e.g. ['E:\\']."""
    if not IS_WIN:
        return []
    out = []
    mask = kernel32.GetLogicalDrives()
    for i, letter in enumerate(string.ascii_uppercase):
        if mask & (1 << i):
            root = f"{letter}:\\"
            if kernel32.GetDriveTypeW(root) == DRIVE_REMOVABLE:
                out.append(root)
    return out


# ---------------------------------------------------------------- reporting
def post(path, payload, timeout=10):
    try:
        requests.post(f"{SERVER}{path}", json=payload, headers=HEADERS, timeout=timeout)
        return True
    except Exception:
        return False


def send_event(kind):
    post("/api/event", {"hostname": HOST, "username": USER, "kind": kind, "ts": now_iso()})


def send_security(items):
    if items:
        post("/api/security", items)


def heartbeat():
    post("/api/heartbeat", {
        "hostname": HOST, "username": USER,
        "os": f"{platform.system()} {platform.release()}",
        "agent_ver": AGENT_VER,
    })


def send_screenshot():
    """Capture the screen and upload it. Requires mss + Pillow. No-op on failure."""
    try:
        import mss
        from PIL import Image
        with mss.mss() as sct:
            shot = sct.grab(sct.monitors[0])  # all monitors combined
        img = Image.frombytes("RGB", shot.size, shot.bgra, "raw", "BGRX")
        buf = io.BytesIO()
        img.save(buf, format="JPEG", quality=SCREENSHOT_QUALITY)
        buf.seek(0)
        requests.post(
            f"{SERVER}/api/screenshot",
            headers=HEADERS,
            data={"hostname": HOST, "username": USER, "ts": now_iso()},
            files={"file": ("shot.jpg", buf, "image/jpeg")},
            timeout=20,
        )
    except Exception:
        pass


# ---------------------------------------------------------------- file / usb watch
class FileWatch:
    """Detects newly-added files under watched roots (removable drives + cloud dirs)."""

    def __init__(self):
        self.known: dict[str, set[str]] = {}   # root -> set of file paths seen
        self.removable_seen: set[str] = set()

    def _scan_root(self, root: str) -> set[str]:
        files = set()
        count = 0
        for dirpath, _dirs, names in os.walk(root):
            for n in names:
                files.add(os.path.join(dirpath, n))
                count += 1
                if count >= MAX_FILES_PER_ROOT:
                    return files
        return files

    def poll(self) -> list[dict]:
        events: list[dict] = []
        ts = now_iso()

        # 1. USB insert / remove
        current = set(removable_drives())
        for root in current - self.removable_seen:
            events.append(_sec("usb_insert", f"Drive {root}", ts))
            self.known[root] = self._scan_root(root)  # baseline; don't flag pre-existing files
        for root in self.removable_seen - current:
            events.append(_sec("usb_remove", f"Drive {root}", ts))
            self.known.pop(root, None)
        self.removable_seen = current

        # 2. New files on removable drives
        for root in current:
            events += self._diff_root(root, "file_to_usb", ts)

        # 3. New files in cloud-sync folders
        for root in CLOUD_DIRS:
            if os.path.isdir(root):
                if root not in self.known:
                    self.known[root] = self._scan_root(root)  # baseline first time
                    continue
                events += self._diff_root(root, "file_to_cloud", ts)

        return events

    def _diff_root(self, root, kind, ts) -> list[dict]:
        prev = self.known.get(root, set())
        now_set = self._scan_root(root)
        new = now_set - prev
        self.known[root] = now_set
        out = []
        for path in list(new)[:50]:  # cap noise per interval
            try:
                size = os.path.getsize(path)
            except OSError:
                size = 0
            out.append(_sec(kind, f"{path} ({size} bytes)", ts))
        return out


def _sec(kind, detail, ts):
    return {"hostname": HOST, "username": USER, "kind": kind, "detail": detail, "ts": ts}


# ---------------------------------------------------------------- remote commands
def execute_command(action: str):
    """Run an allowed remote admin action locally. Whitelisted only."""
    if not IS_WIN:
        print(f"[cmd] would run '{action}' (non-windows test host)")
        return
    if action == "lock":
        subprocess.run(["rundll32.exe", "user32.dll,LockWorkStation"], check=False)
    elif action == "shutdown":
        subprocess.run(["shutdown", "/s", "/t", "60",
                        "/c", "This PC will shut down in 60 seconds (IT)."], check=False)
    elif action == "cancel_shutdown":
        subprocess.run(["shutdown", "/a"], check=False)
    else:
        print(f"[cmd] ignored unknown action: {action}")


def poll_commands():
    if not ALLOW_REMOTE:
        return
    try:
        r = requests.get(f"{SERVER}/api/commands", params={"hostname": HOST},
                         headers=HEADERS, timeout=10)
        for cmd in r.json().get("commands", []):
            print(f"[cmd] executing {cmd['action']} (id {cmd['id']})")
            execute_command(cmd["action"])
    except Exception:
        pass


# ---------------------------------------------------------------- main loop
def main():
    send_event("startup")
    send_event("logon")
    heartbeat()

    buffer = []
    was_locked = False
    last_hb = 0.0
    last_sec = 0.0
    last_shot = 0.0
    last_cmd = 0.0
    watcher = FileWatch()
    watcher.poll()  # establish baseline without flagging existing files

    print(f"FleetWatch agent {AGENT_VER} on {HOST} as {USER} -> {SERVER} "
          f"(screenshots={'on' if SCREENSHOT_SECONDS else 'off'})")

    try:
        while True:
            locked = is_locked()
            if locked and not was_locked:
                send_event("lock")
            elif not locked and was_locked:
                send_event("unlock")
            was_locked = locked

            if not locked:
                idle = idle_seconds() >= IDLE_SECONDS
                app, title = active_window()
                buffer.append({
                    "hostname": HOST, "username": USER,
                    "app": app, "title": title, "idle": idle, "ts": now_iso(),
                })

            if len(buffer) >= FLUSH_EVERY:
                if post("/api/activity", buffer):
                    buffer = []

            nowt = time.time()
            if nowt - last_sec >= SECURITY_SECONDS:
                send_security(watcher.poll())
                last_sec = nowt
            if SCREENSHOT_SECONDS and not locked and nowt - last_shot >= SCREENSHOT_SECONDS:
                send_screenshot()
                last_shot = nowt
            if nowt - last_cmd >= COMMAND_SECONDS:
                poll_commands()
                last_cmd = nowt
            if nowt - last_hb > 60:
                heartbeat()
                last_hb = nowt

            time.sleep(SAMPLE_SECONDS)
    except KeyboardInterrupt:
        pass
    finally:
        if buffer:
            post("/api/activity", buffer)
        send_event("logoff")


if __name__ == "__main__":
    main()
