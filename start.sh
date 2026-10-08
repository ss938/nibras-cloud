#!/bin/sh
# إقلاع نسخة نبراس السحابية: ذاكرة ← خادم ← مزامنة ← جسر (أو انتظار).
set -e
export PATH="$HOME/.opencode/bin:$PATH"
PORT_NOW="${PORT:-10000}"
export OPENCODE_SERVER_PASSWORD="${OPENCODE_SERVER_PASSWORD:-nibras-internal-pass}"
echo "[boot] opencode version: $(opencode --version 2>&1 | head -2)"
echo "[boot] api help: $(opencode api --help 2>&1 | head -5)"

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
opencode serve --port "$PORT_NOW" --hostname 0.0.0.0 > /tmp/serve.log 2>&1 &
echo "[boot] serve launched in background; waiting 45s fixed..."
sleep 45
echo "[boot] wait done."

./sync.sh &
echo "[boot] sync started."
echo "[boot] starting telegram bridge..."
exec stdbuf -o0 -e0 node bridge.js
