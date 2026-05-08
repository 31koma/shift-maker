#!/bin/zsh

PIDS=$(/usr/sbin/lsof -tiTCP:3000 -sTCP:LISTEN 2>/dev/null)

if [ -n "$PIDS" ]; then
  echo "$PIDS" | while read -r PID; do
    if [ -n "$PID" ]; then
      kill "$PID"
    fi
  done
fi
