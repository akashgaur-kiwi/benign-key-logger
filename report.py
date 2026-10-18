"""
report.py — offline analytics for window_logger.py output.

Aggregates the per-day files produced by window_logger.py:
    window_activity_YYYY-MM-DD.log   (presence / raw events)
    summary_YYYY-MM-DD.txt           (authoritative per-day totals)

over a date range, and prints a text report (and optionally a self-contained
HTML dashboard). Everything is local; nothing is sent anywhere.

Usage:
    # last 7 days (weekly)
    python report.py --start-date 2026-09-25 --end-date 2026-10-01

    # a month, with HTML dashboard
    python report.py --start-date 2026-09-01 --end-date 2026-09-30 --html

    # custom log directory and a longer top-apps list
    python report.py --start-date 2026-09-01 --end-date 2026-09-30 --log-dir ./logs --top 15
"""

import argparse
import html
import os
import re
import sys
from collections import defaultdict
from datetime import datetime, timedelta

# "2h 05m" -> minutes.  Also matches summary metric lines and per-app rows.
_DUR_RE = re.compile(r"(\d+)\s*h\s*(\d+)\s*m")
_METRIC_RE = {
    "monitored": re.compile(r"Total Monitored Time\s*:\s*(\d+)h\s*(\d+)m"),
    "idle": re.compile(r"Total Idle Time\s*:\s*(\d+)h\s*(\d+)m"),
    "active": re.compile(r"Net Active Time\s*:\s*(\d+)h\s*(\d+)m"),
}
_APP_RE = re.compile(r"^\s*\d+\.\s+(.*?)\s+(\d+)h\s+(\d+)m\s*$")


def hm_to_minutes(h, m):
    return int(h) * 60 + int(m)


def fmt_minutes(mins):
    mins = int(round(mins))
    return f"{mins // 60}h {mins % 60:02d}m"


def daterange(start, end):
    d = start
    while d <= end:
        yield d
        d += timedelta(days=1)


def parse_summary(path):
    """Parse one summary_YYYY-MM-DD.txt -> dict or None. Never raises."""
    data = {"monitored": 0, "idle": 0, "active": 0, "apps": defaultdict(int)}
    found_any = False
    try:
        with open(path, encoding="utf-8") as fh:
            lines = fh.readlines()
    except OSError as exc:
        print(f"[warn] could not read {os.path.basename(path)}: {exc}", file=sys.stderr)
        return None

    in_apps = False
    for raw in lines:
        line = raw.rstrip("\n")
        try:
            for key, rx in _METRIC_RE.items():
                m = rx.search(line)
                if m:
                    data[key] = hm_to_minutes(*m.groups())
                    found_any = True
            if "Top Applications" in line:
                in_apps = True
                continue
            if in_apps:
                am = _APP_RE.match(line)
                if am:
                    app = am.group(1).strip()
                    data["apps"][app] += hm_to_minutes(am.group(2), am.group(3))
                    found_any = True
        except Exception as exc:
            print(f"[warn] skipped unparsable line in {os.path.basename(path)}: {exc}",
                  file=sys.stderr)
            continue
    return data if found_any else None


def collect(log_dir, start, end):
    """Return (per_day, skipped_days). per_day maps date-string -> parsed summary."""
    per_day = {}
    skipped = []
    for d in daterange(start, end):
        ds = d.strftime("%Y-%m-%d")
        spath = os.path.join(log_dir, f"summary_{ds}.txt")
        lpath = os.path.join(log_dir, f"window_activity_{ds}.log")
        if os.path.isfile(spath):
            parsed = parse_summary(spath)
            if parsed:
                per_day[ds] = parsed
            else:
                skipped.append((ds, "summary present but no metrics parsed"))
        elif os.path.isfile(lpath):
            skipped.append((ds, "log exists but no summary file (logger still running?)"))
        else:
            skipped.append((ds, "no files for this day"))
    return per_day, skipped


def aggregate(per_day):
    total = {"monitored": 0, "idle": 0, "active": 0}
    apps = defaultdict(int)
    for day in per_day.values():
        total["monitored"] += day["monitored"]
        total["idle"] += day["idle"]
        total["active"] += day["active"]
        for app, mins in day["apps"].items():
            apps[app] += mins
    n = len(per_day) or 1
    avg = {
        "active": total["active"] / n,
        "idle": total["idle"] / n,
        "monitored": total["monitored"] / n,
    }
    ranked = sorted(apps.items(), key=lambda kv: kv[1], reverse=True)
    return total, avg, ranked


# ================================================================ text report
def print_text(start, end, per_day, skipped, total, avg, ranked, top):
    days = len(per_day)
    print("\n" + "=" * 52)
    print(f" Activity Report  {start:%Y-%m-%d} .. {end:%Y-%m-%d}  ({days} day(s) with data)")
    print("=" * 52)
    print(f"Cumulative Monitored Time : {fmt_minutes(total['monitored'])}")
    print(f"Cumulative Idle Time      : {fmt_minutes(total['idle'])}")
    print(f"Cumulative Net Active Time: {fmt_minutes(total['active'])}")
    print("-" * 52)
    print(f"Average / day  Active: {fmt_minutes(avg['active'])}   "
          f"Idle: {fmt_minutes(avg['idle'])}")
    print("-" * 52)
    print(f"Top {top} Applications (whole period):")
    if ranked:
        for i, (app, mins) in enumerate(ranked[:top], 1):
            print(f"  {i:>2}. {app:<28} {fmt_minutes(mins)}")
    else:
        print("  (no application data)")
    if skipped:
        print("-" * 52)
        print(f"Skipped {len(skipped)} day(s):")
        for ds, why in skipped:
            print(f"  - {ds}: {why}")
    print("=" * 52 + "\n")


# ================================================================ html dashboard
def write_html(path, start, end, per_day, total, avg, ranked, top):
    days = len(per_day)
    top_apps = ranked[:top]
    app_labels = [html.escape(a) for a, _ in top_apps]
    app_values = [round(m / 60, 2) for _, m in top_apps]  # hours

    # per-day trend (sorted by date)
    trend_labels = sorted(per_day.keys())
    trend_active = [round(per_day[d]["active"] / 60, 2) for d in trend_labels]
    trend_idle = [round(per_day[d]["idle"] / 60, 2) for d in trend_labels]

    import json
    doc = f"""<!doctype html>
<html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Activity Analytics {start:%Y-%m-%d} .. {end:%Y-%m-%d}</title>
<script src="https://cdn.jsdelivr.net/npm/chart.js@4"></script>
<style>
  :root {{ --bg:#0f1419; --panel:#1a2029; --line:#2a333f; --txt:#e4e8ee; --mut:#8b98a8;
          --ok:#34d399; --idle:#fbbf24; --accent:#60a5fa; }}
  * {{ box-sizing:border-box; }}
  body {{ margin:0; background:var(--bg); color:var(--txt);
         font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif; }}
  header {{ padding:22px; border-bottom:1px solid var(--line); }}
  h1 {{ font-size:19px; margin:0; }} .sub {{ color:var(--mut); font-size:13px; margin-top:4px; }}
  main {{ max-width:1000px; margin:0 auto; padding:22px; }}
  .cards {{ display:grid; grid-template-columns:repeat(auto-fit,minmax(180px,1fr)); gap:14px; }}
  .card {{ background:var(--panel); border:1px solid var(--line); border-radius:12px; padding:18px; }}
  .card .label {{ color:var(--mut); font-size:12.5px; }}
  .card .value {{ font-size:26px; font-weight:650; margin-top:6px; }}
  .charts {{ display:grid; grid-template-columns:1.4fr 1fr; gap:14px; margin-top:16px; }}
  @media (max-width:720px) {{ .charts {{ grid-template-columns:1fr; }} }}
  .panel {{ background:var(--panel); border:1px solid var(--line); border-radius:12px; padding:18px; }}
  h2 {{ font-size:14px; margin:0 0 12px; color:var(--mut); font-weight:600; }}
</style></head><body>
<header>
  <h1>🛰 Activity Analytics</h1>
  <div class="sub">{start:%Y-%m-%d} &ndash; {end:%Y-%m-%d} · {days} day(s) with data</div>
</header>
<main>
  <div class="cards">
    <div class="card"><div class="label">Cumulative Monitored</div><div class="value">{fmt_minutes(total['monitored'])}</div></div>
    <div class="card"><div class="label">Net Active</div><div class="value" style="color:var(--ok)">{fmt_minutes(total['active'])}</div></div>
    <div class="card"><div class="label">Idle</div><div class="value" style="color:var(--idle)">{fmt_minutes(total['idle'])}</div></div>
    <div class="card"><div class="label">Avg Active / day</div><div class="value">{fmt_minutes(avg['active'])}</div></div>
  </div>
  <div class="charts">
    <div class="panel"><h2>Top applications (hours)</h2><canvas id="apps"></canvas></div>
    <div class="panel"><h2>Active vs idle</h2><canvas id="split"></canvas></div>
  </div>
  <div class="panel" style="margin-top:14px"><h2>Daily active vs idle (hours)</h2><canvas id="trend"></canvas></div>
</main>
<script>
const APP_LABELS = {json.dumps(app_labels)};
const APP_VALUES = {json.dumps(app_values)};
const TREND_LABELS = {json.dumps(trend_labels)};
const TREND_ACTIVE = {json.dumps(trend_active)};
const TREND_IDLE = {json.dumps(trend_idle)};
const ACTIVE_H = {round(total['active'] / 60, 2)};
const IDLE_H = {round(total['idle'] / 60, 2)};
Chart.defaults.color = '#8b98a8'; Chart.defaults.borderColor = '#2a333f';
new Chart(document.getElementById('apps'), {{
  type:'bar',
  data:{{ labels:APP_LABELS, datasets:[{{ label:'Hours', data:APP_VALUES, backgroundColor:'#60a5fa' }}] }},
  options:{{ indexAxis:'y', plugins:{{legend:{{display:false}}}}, scales:{{x:{{beginAtZero:true}}}} }}
}});
new Chart(document.getElementById('split'), {{
  type:'doughnut',
  data:{{ labels:['Active','Idle'], datasets:[{{ data:[ACTIVE_H, IDLE_H], backgroundColor:['#34d399','#fbbf24'] }}] }}
}});
new Chart(document.getElementById('trend'), {{
  type:'bar',
  data:{{ labels:TREND_LABELS, datasets:[
    {{ label:'Active', data:TREND_ACTIVE, backgroundColor:'#34d399' }},
    {{ label:'Idle', data:TREND_IDLE, backgroundColor:'#fbbf24' }} ]}},
  options:{{ scales:{{x:{{stacked:true}}, y:{{stacked:true, beginAtZero:true}}}} }}
}});
</script>
</body></html>"""
    try:
        with open(path, "w", encoding="utf-8") as fh:
            fh.write(doc)
        print(f"HTML dashboard written to {path}")
    except OSError as exc:
        print(f"[warn] could not write HTML: {exc}", file=sys.stderr)


# ================================================================ cli
def valid_date(s):
    try:
        return datetime.strptime(s, "%Y-%m-%d")
    except ValueError:
        raise argparse.ArgumentTypeError(f"invalid date '{s}', expected YYYY-MM-DD")


def main():
    ap = argparse.ArgumentParser(description="Analytics for window_logger.py output.")
    ap.add_argument("--start-date", type=valid_date, required=True)
    ap.add_argument("--end-date", type=valid_date, required=True)
    ap.add_argument("--log-dir", default=".", help="directory holding the log/summary files")
    ap.add_argument("--top", type=int, default=10, help="number of top apps to show")
    ap.add_argument("--html", action="store_true", help="also write analytics_report.html")
    ap.add_argument("--html-out", default="analytics_report.html")
    args = ap.parse_args()

    if args.end_date < args.start_date:
        ap.error("--end-date must not be before --start-date")

    per_day, skipped = collect(args.log_dir, args.start_date, args.end_date)
    total, avg, ranked = aggregate(per_day)
    print_text(args.start_date, args.end_date, per_day, skipped, total, avg, ranked, args.top)

    if not per_day:
        print("No summary data found in range — nothing to visualize.", file=sys.stderr)
        return
    if args.html:
        write_html(args.html_out, args.start_date, args.end_date,
                   per_day, total, avg, ranked, args.top)


if __name__ == "__main__":
    main()
