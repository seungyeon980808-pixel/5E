# -*- coding: utf-8 -*-
"""정적 파일 서버 — 여러 갈래로 동시에 받는다.

`python -m http.server` 는 **한 번에 한 요청만** 처리한다. 그래서 그림이 수십 장 들어간
페이지를 열면 브라우저의 동시 요청을 못 받아내고 상당수가 깨진다(실측: 34장 중 34장,
4,326장 중 4,130장 실패). 이 파일은 그것만 고친 것이다.

    python tools/serve.py [포트] [폴더]
    python tools/serve.py 8700
"""

import functools
import io
import json
import pathlib
import sys
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", line_buffering=True)

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8700
ROOT = pathlib.Path(sys.argv[2]).resolve() if len(sys.argv) > 2 \
    else pathlib.Path(__file__).resolve().parent.parent


class H(SimpleHTTPRequestHandler):
    def log_message(self, *a):
        pass

    def end_headers(self):
        # 검증할 때 옛 파일이 나오면 헛수고를 한다
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def do_GET(self):
        if self.path.split("?", 1)[0] == "/__5e_health":
            payload = json.dumps({"ok": True, "server": "5e-static", "root": str(ROOT)})
            body = payload.encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        super().do_GET()


def main():
    handler = functools.partial(H, directory=str(ROOT))
    srv = ThreadingHTTPServer(("127.0.0.1", PORT), handler)
    print(f"폴더  {ROOT}")
    print(f"주소  http://127.0.0.1:{PORT}/")
    print("끄려면 Ctrl+C")
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        print("\n종료")
    return 0


if __name__ == "__main__":
    sys.exit(main())
