#!/bin/sh
# مزامنة الذاكرة مع مستودع GitHub الخاص (آخر كاتب يفوز، بناءً على زمن التعديل).
# يعمل في الخلفية داخل الحاوية.
while true; do
  sleep 120
  cd /tmp/mem 2>/dev/null || continue
  git pull --quiet 2>/dev/null
  for f in MEMORY.md USER.md; do
    if [ "/app/$f" -nt "$f" ]; then
      cp "/app/$f" "$f"
    elif [ "$f" -nt "/app/$f" ]; then
      cp "$f" "/app/$f"
    fi
  done
  if ! git diff --quiet 2>/dev/null; then
    git add MEMORY.md USER.md 2>/dev/null
    git -c user.name="nibras-cloud" -c user.email="nibras@local" commit -qm "cloud memory sync $(date -u +%F-%T)" 2>/dev/null
    git push --quiet 2>/dev/null && echo "[sync] pushed at $(date -u +%T)"
  fi
done
