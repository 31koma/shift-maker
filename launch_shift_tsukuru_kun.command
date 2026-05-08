#!/bin/zsh

PROJECT_DIR="/Users/ks/シフト作るくん"
APP_URL="http://127.0.0.1:3000/top.html"
LOG_FILE="/tmp/shift_tsukuru_kun_server.log"

if ! /usr/bin/curl -fsS "http://127.0.0.1:3000/__shift_dev_ping" >/dev/null 2>&1; then
  PIDS=$(/usr/sbin/lsof -tiTCP:3000 -sTCP:LISTEN 2>/dev/null)
  if [ -n "$PIDS" ]; then
    echo "$PIDS" | while read -r PID; do
      if [ -n "$PID" ]; then
        kill "$PID"
      fi
    done
    sleep 1
  fi
  cd "$PROJECT_DIR" || exit 1
  nohup /usr/bin/python3 "$PROJECT_DIR/local_dev_server.py" >"$LOG_FILE" 2>&1 &
  sleep 1
fi

/usr/bin/open "$APP_URL"
