#!/bin/zsh

# ---------------------------------------------------------------------------
# このスクリプトが置かれているフォルダを自動で使う（パスを直書きしない）
#   直書きすると、フォルダを移動・コピーしたときに
#   「別のフォルダのアプリが起動していて、直したはずが反映されない」
#   という事故が起きるため。
# ---------------------------------------------------------------------------
PROJECT_DIR="${0:A:h}"
APP_URL="http://127.0.0.1:3000/top.html"
LOG_FILE="/tmp/shift_tsukuru_kun_server.log"

echo "アプリのフォルダ: $PROJECT_DIR"

if [ ! -f "$PROJECT_DIR/local_dev_server.py" ]; then
  echo ""
  echo "エラー: local_dev_server.py が見つかりません。"
  echo "この起動ファイルは、アプリ本体と同じフォルダに置いてください。"
  echo ""
  read -r "?Enterキーで閉じます"
  exit 1
fi

# すでに3000番で動いているサーバーが「このフォルダ」のものかを確認する
RUNNING_ROOT=""
if /usr/bin/curl -fsS "http://127.0.0.1:3000/__shift_dev_ping" >/dev/null 2>&1; then
  RUNNING_ROOT=$(/usr/bin/curl -fsS "http://127.0.0.1:3000/__shift_dev_root" 2>/dev/null \
    | /usr/bin/sed -n 's/.*"root": *"\([^"]*\)".*/\1/p')
fi

NEED_RESTART=1
if [ -n "$RUNNING_ROOT" ] && [ "$RUNNING_ROOT" = "$PROJECT_DIR" ]; then
  NEED_RESTART=0
  echo "すでにこのフォルダのサーバーが動いています。"
elif [ -n "$RUNNING_ROOT" ]; then
  echo "別のフォルダのサーバーが動いています → 入れ替えます"
  echo "  動いていたフォルダ: $RUNNING_ROOT"
fi

if [ "$NEED_RESTART" = "1" ]; then
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

  if /usr/bin/curl -fsS "http://127.0.0.1:3000/__shift_dev_ping" >/dev/null 2>&1; then
    echo "サーバーを起動しました。"
    echo "バックアップ保存先: $PROJECT_DIR/backups"
  else
    echo ""
    echo "エラー: サーバーが起動できませんでした。"
    echo "詳しい原因: $LOG_FILE"
    echo ""
    /usr/bin/tail -n 20 "$LOG_FILE"
    echo ""
    read -r "?Enterキーで閉じます"
    exit 1
  fi
fi

/usr/bin/open "$APP_URL"
