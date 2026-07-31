"""브라우저에서 만든 PNG(base64)를 파일로 받아 주는 아주 작은 수신기.

왜 필요한가: 5E 화면을 PNG로 구워 compare-exam-figure.py 에 넣으려면 파일이 있어야 한다.
base64를 대화로 옮기면 토큰도 많이 먹고 붙여넣기가 깨질 수 있다. 그래서 브라우저가
직접 POST 하게 한다.

쓰는 법:
  python png_receiver.py <저장폴더> [포트]
브라우저에서:
  fetch('http://127.0.0.1:8590/save?name=x.png', {method:'POST', body: base64문자열})
"""
import base64
import os
import sys
from http.server import BaseHTTPRequestHandler, HTTPServer
from urllib.parse import urlparse, parse_qs

OUT_DIR = sys.argv[1] if len(sys.argv) > 1 else "."
PORT = int(sys.argv[2]) if len(sys.argv) > 2 else 8590


class Handler(BaseHTTPRequestHandler):
    def _cors(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "*")
        self.send_header("Access-Control-Allow-Methods", "POST, OPTIONS")

    def do_OPTIONS(self):
        self.send_response(204)
        self._cors()
        self.end_headers()

    def do_POST(self):
        q = parse_qs(urlparse(self.path).query)
        name = (q.get("name") or ["out.png"])[0]
        name = os.path.basename(name)  # 경로 탈출 방지
        n = int(self.headers.get("Content-Length", 0))
        raw = self.rfile.read(n).decode("ascii", "ignore").strip()
        if "," in raw[:64] and raw.startswith("data:"):
            raw = raw.split(",", 1)[1]
        path = os.path.join(OUT_DIR, name)
        with open(path, "wb") as f:
            f.write(base64.b64decode(raw))
        self.send_response(200)
        self._cors()
        self.end_headers()
        self.wfile.write(f"saved {path} ({os.path.getsize(path)} bytes)".encode())

    def log_message(self, *a):
        pass


if __name__ == "__main__":
    os.makedirs(OUT_DIR, exist_ok=True)
    print(f"listening on 127.0.0.1:{PORT} -> {OUT_DIR}", flush=True)
    HTTPServer(("127.0.0.1", PORT), Handler).serve_forever()
