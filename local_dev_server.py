#!/usr/bin/env python3
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
import hashlib
import json
import os
import re
from datetime import datetime
from pathlib import Path
from urllib.parse import urlparse, parse_qs


ROOT = Path(__file__).resolve().parent
WATCH_EXTENSIONS = {".html", ".css", ".js"}
HOST = "127.0.0.1"
PORT = 3000

# --- バックアップ設定 ---------------------------------------------------------
# localStorage は「ブラウザのデータを消す」「別ブラウザで開く」だけで全部消える。
# そこでアプリ側から送られてきたデータを、このフォルダの backups/ に実ファイルとして残す。
BACKUP_DIR = ROOT / "backups"
BACKUP_KEEP = 200                      # 残す世代数（古いものから自動削除）
BACKUP_MAX_TOTAL_BYTES = 300 * 1024 * 1024   # backups/ 全体の上限。超えた分は古いものから削除
BACKUP_NAME_RE = re.compile(r"^[0-9]{8}-[0-9]{6}-[a-z]+[0-9]*\.json$")

LIVE_RELOAD_SCRIPT = """
<script>
(() => {
  const endpoint = "/__shift_dev_version";
  let currentVersion = "";

  async function checkVersion() {
    try {
      const response = await fetch(endpoint, { cache: "no-store" });
      if (!response.ok) return;
      const data = await response.json();
      if (!currentVersion) {
        currentVersion = data.version;
        return;
      }
      if (data.version && data.version !== currentVersion) {
        window.location.reload();
      }
    } catch (error) {
      // Keep the app usable even if the dev server is briefly restarting.
    }
  }

  window.setInterval(checkVersion, 1000);
  checkVersion();
})();
</script>
"""


def get_version():
    latest = 0
    for path in ROOT.rglob("*"):
        if not path.is_file() or path.suffix not in WATCH_EXTENSIONS:
            continue
        if ".git" in path.parts or "backups" in path.parts:
            continue
        try:
            latest = max(latest, path.stat().st_mtime_ns)
        except OSError:
            continue
    return str(latest)


# --- バックアップのファイル操作 ------------------------------------------------

def list_backup_files():
    """新しい順に並べて返す。同じ秒に複数保存されてもファイル更新時刻で正しく並ぶ。"""
    if not BACKUP_DIR.is_dir():
        return []
    files = [p for p in BACKUP_DIR.iterdir() if p.is_file() and BACKUP_NAME_RE.match(p.name)]

    def sort_key(path):
        try:
            mtime = path.stat().st_mtime_ns
        except OSError:
            mtime = 0
        return (mtime, path.name)

    return sorted(files, key=sort_key, reverse=True)


def read_backup_payload(path):
    try:
        with path.open("r", encoding="utf-8") as f:
            return json.load(f)
    except (OSError, ValueError):
        return None


def payload_fingerprint(payload):
    """データ部分だけのハッシュ。保存時刻やURLの違いで別扱いにならないようにする。"""
    data = payload.get("data") if isinstance(payload, dict) else None
    canonical = json.dumps(data, ensure_ascii=False, sort_keys=True)
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


def prune_backups():
    """世代数と合計サイズの両方で古いものから削る。最新1件は必ず残す。"""
    files = list_backup_files()

    doomed = list(files[BACKUP_KEEP:])
    kept = files[:BACKUP_KEEP]

    running = 0
    for index, path in enumerate(kept):
        try:
            running += path.stat().st_size
        except OSError:
            continue
        if running > BACKUP_MAX_TOTAL_BYTES and index > 0:
            doomed.extend(kept[index:])
            break

    for path in doomed:
        try:
            path.unlink()
        except OSError:
            pass


def save_backup(payload):
    """同じ内容なら保存しない（無駄な世代を増やさない）。"""
    source = str(payload.get("source") or "auto")
    source = re.sub(r"[^a-z]", "", source.lower()) or "auto"

    fingerprint = payload_fingerprint(payload)
    existing = list_backup_files()
    if existing:
        latest = read_backup_payload(existing[0])
        if latest is not None and payload_fingerprint(latest) == fingerprint:
            return {"skipped": True, "reason": "same-as-latest", "latest": existing[0].name}

    BACKUP_DIR.mkdir(exist_ok=True)
    stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    name = f"{stamp}-{source}.json"
    target = BACKUP_DIR / name
    counter = 1
    while target.exists():
        name = f"{stamp}-{source}{counter}.json"
        target = BACKUP_DIR / name
        counter += 1

    payload = dict(payload)
    payload["savedAtServer"] = datetime.now().isoformat(timespec="seconds")
    payload["fingerprint"] = fingerprint

    tmp = target.with_name(target.name + ".tmp")
    with tmp.open("w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=1)
    os.replace(tmp, target)

    prune_backups()
    return {"saved": name, "total": len(list_backup_files())}


def count_entries(key, parsed):
    """人が見て意味のある件数を出す（キーごとに数え方が違う）。"""
    if parsed is None:
        return 0
    if key == "shiftApp_staffData" and isinstance(parsed, dict):
        # スタッフの人数
        return sum(len(v) for v in parsed.values() if isinstance(v, list))
    if key == "shiftApp_requestData" and isinstance(parsed, dict):
        # 希望の入力件数（日付×スタッフ）
        return sum(len(v) for v in parsed.values() if isinstance(v, dict))
    if isinstance(parsed, (dict, list)):
        # eventData なら日数、savedShiftResults なら保存件数
        return len(parsed)
    return 1


def backup_summary(path):
    payload = read_backup_payload(path)
    counts = {}
    if isinstance(payload, dict):
        data = payload.get("data") or {}
        for key, raw in data.items():
            try:
                parsed = json.loads(raw) if isinstance(raw, str) else raw
            except ValueError:
                parsed = None
            counts[key] = count_entries(key, parsed)
    try:
        size = path.stat().st_size
    except OSError:
        size = 0
    return {
        "name": path.name,
        "bytes": size,
        "savedAt": (payload or {}).get("savedAtServer") or (payload or {}).get("savedAt") or "",
        "source": (payload or {}).get("source") or "",
        "origin": (payload or {}).get("origin") or "",
        "counts": counts,
    }


class DevRequestHandler(SimpleHTTPRequestHandler):
    server_version = "ShiftTsukuruKunDev/1.1"

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def end_headers(self):
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()

    # --- localhost / 127.0.0.1 の統一 ---------------------------------------
    # ブラウザは localhost:3000 と 127.0.0.1:3000 を「別サイト」として扱うため、
    # localStorage も別々になり「入力が消えた」ように見える。127.0.0.1 に寄せる。
    def redirect_to_canonical_host(self):
        host = (self.headers.get("Host") or "").rsplit(":", 1)[0].strip().lower()
        if host not in ("localhost", "::1", "[::1]"):
            return False
        target = f"http://{HOST}:{PORT}{self.path}"
        self.send_response(301)
        self.send_header("Location", target)
        self.send_header("Content-Length", "0")
        self.end_headers()
        return True

    def send_json(self, obj, status=200):
        payload = json.dumps(obj, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    def do_GET(self):
        if self.redirect_to_canonical_host():
            return

        parsed = urlparse(self.path)
        route = parsed.path

        if route == "/__shift_dev_ping":
            self.send_response(200)
            self.send_header("Content-Type", "text/plain; charset=utf-8")
            self.end_headers()
            self.wfile.write(b"ok")
            return

        if route == "/__shift_dev_version":
            self.send_json({"version": get_version()})
            return

        # いま動いているサーバーが「どのフォルダ」を配信しているかを返す。
        # アプリのコピーが複数あると、古い方が動いていても見分けがつかないため。
        if route == "/__shift_dev_root":
            self.send_json({"root": str(ROOT), "backupDir": str(BACKUP_DIR)})
            return

        if route == "/__shift_backup_list":
            try:
                items = [backup_summary(p) for p in list_backup_files()]
                self.send_json({"ok": True, "dir": str(BACKUP_DIR), "items": items})
            except Exception as error:
                self.send_json({"ok": False, "error": str(error)}, 500)
            return

        if route == "/__shift_backup_get":
            name = (parse_qs(parsed.query).get("name") or [""])[0]
            if not BACKUP_NAME_RE.match(name):
                self.send_json({"ok": False, "error": "invalid name"}, 400)
                return
            target = BACKUP_DIR / name
            if not target.is_file():
                self.send_json({"ok": False, "error": "not found"}, 404)
                return
            payload = read_backup_payload(target)
            if payload is None:
                self.send_json({"ok": False, "error": "broken file"}, 500)
                return
            self.send_json({"ok": True, "payload": payload})
            return

        return super().do_GET()

    def do_POST(self):
        if self.redirect_to_canonical_host():
            return

        route = urlparse(self.path).path
        if route != "/__shift_backup":
            self.send_error(404, "Not found")
            return

        try:
            length = int(self.headers.get("Content-Length") or 0)
        except ValueError:
            length = 0
        if length <= 0 or length > 40 * 1024 * 1024:
            self.send_json({"ok": False, "error": "bad content length"}, 400)
            return

        try:
            raw = self.rfile.read(length)
            payload = json.loads(raw.decode("utf-8"))
        except Exception as error:
            self.send_json({"ok": False, "error": f"bad json: {error}"}, 400)
            return

        if not isinstance(payload, dict) or not isinstance(payload.get("data"), dict):
            self.send_json({"ok": False, "error": "payload.data is required"}, 400)
            return

        try:
            result = save_backup(payload)
            result["ok"] = True
            self.send_json(result)
        except Exception as error:
            self.send_json({"ok": False, "error": str(error)}, 500)

    def log_message(self, fmt, *args):
        # 自動バックアップとライブリロードのログでターミナルが埋まるのを防ぐ
        try:
            message = fmt % args
        except Exception:
            message = ""
        if "__shift_dev_version" in message or "__shift_backup" in message:
            return
        super().log_message(fmt, *args)

    def send_head(self):
        path = self.translate_path(self.path)
        if os.path.isdir(path):
            for index in ("index.html", "index.htm"):
                index_path = os.path.join(path, index)
                if os.path.exists(index_path):
                    path = index_path
                    break
            else:
                return super().send_head()

        if not path.endswith(".html"):
            return super().send_head()

        try:
            with open(path, "rb") as source:
                content = source.read()
        except OSError:
            self.send_error(404, "File not found")
            return None

        marker = b"</body>"
        if marker in content and b"__shift_dev_version" not in content:
            content = content.replace(marker, LIVE_RELOAD_SCRIPT.encode("utf-8") + marker, 1)

        self.send_response(200)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(content)))
        self.end_headers()
        from io import BytesIO
        return BytesIO(content)


def main():
    os.chdir(ROOT)
    BACKUP_DIR.mkdir(exist_ok=True)
    server = ThreadingHTTPServer((HOST, PORT), DevRequestHandler)
    print(f"Serving {ROOT}")
    print(f"  →  http://{HOST}:{PORT}/top.html")
    print(f"  バックアップ保存先: {BACKUP_DIR}（最新{BACKUP_KEEP}世代を保持）")
    print(f"  ※ localhost:{PORT} で開いても {HOST}:{PORT} に転送します")
    server.serve_forever()


if __name__ == "__main__":
    main()
