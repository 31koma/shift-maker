do shell script "if /usr/bin/curl -fsS 'http://127.0.0.1:3000/__shift_dev_ping' >/dev/null 2>&1; then true; else PIDS=$(/usr/sbin/lsof -tiTCP:3000 -sTCP:LISTEN 2>/dev/null); if [ -n \"$PIDS\" ]; then echo \"$PIDS\" | while read PID; do if [ -n \"$PID\" ]; then kill \"$PID\"; fi; done; sleep 1; fi; cd '/Users/ks/シフト作るくん' && nohup /usr/bin/python3 '/Users/ks/シフト作るくん/local_dev_server.py' >/tmp/shift_tsukuru_kun_server.log 2>&1 & fi"
delay 1
open location "http://127.0.0.1:3000/top.html"
