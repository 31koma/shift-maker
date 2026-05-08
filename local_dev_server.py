#!/usr/bin/env python3
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
import json
import os
from pathlib import Path
from urllib.parse import urlparse


ROOT = Path(__file__).resolve().parent
WATCH_EXTENSIONS = {".html", ".css", ".js"}
HOST = "127.0.0.1"
PORT = 3000

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
        if ".git" in path.parts:
            continue
        try:
            latest = max(latest, path.stat().st_mtime_ns)
        except OSError:
            continue
    return str(latest)


class DevRequestHandler(SimpleHTTPRequestHandler):
    server_version = "ShiftTsukuruKunDev/1.0"

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def end_headers(self):
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()

    def do_GET(self):
        route = urlparse(self.path).path
        if route == "/__shift_dev_ping":
            self.send_response(200)
            self.send_header("Content-Type", "text/plain; charset=utf-8")
            self.end_headers()
            self.wfile.write(b"ok")
            return

        if route == "/__shift_dev_version":
            payload = json.dumps({"version": get_version()}).encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.end_headers()
            self.wfile.write(payload)
            return

        return super().do_GET()

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
    server = ThreadingHTTPServer((HOST, PORT), DevRequestHandler)
    print(f"Serving {ROOT} at http://localhost:{PORT}/top.html")
    server.serve_forever()


if __name__ == "__main__":
    main()
