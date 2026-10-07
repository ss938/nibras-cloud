#!/bin/sh
# إقلاع نسخة نبراس السحابية: ذاكرة ← خادم ← مزامنة ← جسر (أو انتظار).
set -e
export PATH="$HOME/.opencode/bin:$PATH"
PORT_NOW="${PORT:-10000}"

echo "[boot] memory pull..."
if [ -n "$GIT_TOKEN" ]; then
  rm -rf /tmp/mem
  git clone --depth 1 "https://x-access-token:${GIT_TOKEN}@github.com/${MEMORY_REPO}.git" /tmp/mem
  [ -f /tmp/mem/MEMORY.md ] && cp /tmp/mem/MEMORY.md /app/MEMORY.md
  [ -f /tmp/mem/USER.md ] && cp /tmp/mem/USER.md /app/USER.md
  echo "[boot] memory ready."
else
  echo "[boot] no GIT_TOKEN — using baked-in memory."
fi

echo "[boot] starting opencode serve on :$PORT_NOW ..."
opencode serve --port "$PORT_NOW" --hostname 0.0.0.0 &
for i in $(seq 1 30); do
  curl -sf "http://localhost:$PORT_NOW/" >/dev/null 2>&1 && break
  sleep 2
done
curl -sf "http://localhost:$PORT_NOW/" >/dev/null 2>&1 && echo "[boot] serve is up." || echo "[boot] WARNING: serve not responding yet."

./sync.sh &

if [ "$START_BRIDGE" = "1" ]; then
  echo "[boot] starting telegram bridge..."
  exec node bridge.js
else
  echo "[boot] STANDBY (START_BRIDGE!=1) — serve only, no telegram polling."
  wait
fi
