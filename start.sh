#!/usr/bin/env bash
# Runs backend and frontend dev servers together.
# Output is shown in the terminal (prefixed) and saved to logs/backend.log and logs/frontend.log.
# Ctrl+C stops both.

set -u
ROOT="$(cd "$(dirname "$0")" && pwd)"
LOG_DIR="$ROOT/logs"
mkdir -p "$LOG_DIR"

# Vite and `node --watch` need Node 18+; use the newest nvm install if the default is older
if [ "$(node -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0)" -lt 18 ]; then
  NEWEST="$(ls -d "$HOME"/.nvm/versions/node/v* 2>/dev/null | sort -V | tail -1)"
  if [ -z "$NEWEST" ]; then
    echo "Node 18+ is required (found $(node -v 2>/dev/null || echo none))." >&2
    exit 1
  fi
  export PATH="$NEWEST/bin:$PATH"
fi
echo "Using Node $(node -v)"

STAMP="$(date '+%Y-%m-%d %H:%M:%S')"
echo "===== started $STAMP =====" >> "$LOG_DIR/backend.log"
echo "===== started $STAMP =====" >> "$LOG_DIR/frontend.log"

for dir in backend frontend; do
  if [ ! -d "$ROOT/$dir/node_modules" ]; then
    echo "[$dir] installing dependencies..."
    (cd "$ROOT/$dir" && npm install)
  fi
done

cleanup() {
  echo ""
  echo "Stopping servers..."
  kill 0 2>/dev/null
  exit 0
}
trap cleanup INT TERM

(cd "$ROOT/backend" && npm run dev 2>&1 \
  | tee -a "$LOG_DIR/backend.log" \
  | sed -u "s/^/$(printf '\033[36m')[backend]$(printf '\033[0m') /") &

(cd "$ROOT/frontend" && npm run dev 2>&1 \
  | tee -a "$LOG_DIR/frontend.log" \
  | sed -u "s/^/$(printf '\033[35m')[frontend]$(printf '\033[0m') /") &

echo "Backend and frontend running. Logs: $LOG_DIR  (Ctrl+C to stop)"
wait
