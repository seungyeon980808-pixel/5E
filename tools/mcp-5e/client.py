# -*- coding: utf-8 -*-
r"""mcp-5e 서버를 파이썬에서 직접 부르는 stdio 클라이언트 (개발·회귀 검증용).

왜 필요한가: MCP 서버를 고치면 Claude Code 를 재시작해야 반영된다. 그 전에
"고친 코드가 실제로 도는지"를 확인할 방법이 없었다. 이 클라이언트는 서버를
직접 띄워 JSON-RPC 로 말을 걸므로, 재시작 없이 새 코드를 그대로 시험한다.

주의: 서버는 켜질 때 같은 포트 대역의 다른 mcp-5e 를 밀어낸다(evictOthers).
따라서 이걸 쓰는 동안에는 Claude Code 쪽 5E MCP 연결이 끊긴다 — 의도된 동작이다.

    from client import Mcp5E
    with Mcp5E() as m:
        print(m.call("app_status"))
        m.call("set_page", {"page": "10번", "create": True})
"""
import json
import pathlib
import subprocess
import sys
import time

SERVER = pathlib.Path(__file__).resolve().parent / "server.js"


class Mcp5E:
    def __init__(self, node="node", timeout=30):
        self.timeout = timeout
        self._id = 0
        self.proc = subprocess.Popen(
            [node, str(SERVER)],
            stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
            text=True, encoding="utf-8", bufsize=1)
        self._rpc("initialize", {
            "protocolVersion": "2024-11-05", "capabilities": {},
            "clientInfo": {"name": "python-client", "version": "1"}})

    # ── 저수준 ──
    def _rpc(self, method, params=None):
        self._id += 1
        msg = {"jsonrpc": "2.0", "id": self._id, "method": method}
        if params is not None:
            msg["params"] = params
        self.proc.stdin.write(json.dumps(msg, ensure_ascii=False) + "\n")
        self.proc.stdin.flush()
        deadline = time.time() + self.timeout
        while time.time() < deadline:
            line = self.proc.stdout.readline()
            if not line:
                raise RuntimeError("서버가 응답 없이 종료했습니다:\n"
                                   + (self.proc.stderr.read() or ""))
            try:
                res = json.loads(line)
            except json.JSONDecodeError:
                continue                      # 서버가 찍은 로그 줄
            if res.get("id") == self._id:
                if "error" in res:
                    raise RuntimeError(res["error"].get("message", res["error"]))
                return res.get("result")
        raise TimeoutError(f"{method} 응답 시간 초과")

    # ── 도구 호출 ──
    def call(self, name, args=None):
        """툴 하나 호출. 텍스트 결과는 문자열로, 그 외에는 content 배열 그대로."""
        r = self._rpc("tools/call", {"name": name, "arguments": args or {}})
        content = r.get("content", [])
        if r.get("isError"):
            raise RuntimeError("".join(c.get("text", "") for c in content))
        if len(content) == 1 and content[0].get("type") == "text":
            return content[0]["text"]
        return content

    def tools(self):
        return [t["name"] for t in self._rpc("tools/list")["tools"]]

    def wait_for_app(self, timeout=25, require=None):
        """앱(브라우저)이 통로에 붙을 때까지 기다린다. 서버를 새로 띄우면
        브라우저가 재연결하는 데 몇 초 걸린다(2초→최대 15초 백오프).

        require: 붙은 창의 주소에 반드시 들어 있어야 할 문자열(예 "localhost:8611").
          5E 를 여러 개 열어 두면 어느 창이 통로를 잡을지 경쟁이라, 배포본 창에
          그림을 그려 넣는 사고가 난다(서버도 app_status 에서 이걸 경고한다).
          지정하면 그 창이 붙을 때까지만 기다린다 — 다른 창이 잡고 있으면
          그 창을 새로고침해 다시 붙게 해야 한다.
        """
        deadline = time.time() + timeout
        s = ""
        while time.time() < deadline:
            s = self.call("app_status")
            if s.startswith("✅") and (require is None or require in s):
                return s
            time.sleep(1.5)
        raise TimeoutError(
            ("5E 앱이 통로에 붙지 않았습니다" if not s.startswith("✅")
             else "의도한 창(%s)이 아닌 창이 통로를 잡고 있습니다" % require)
            + ":\n" + s)

    def close(self):
        try:
            self.proc.stdin.close()
        except Exception:
            pass
        try:
            self.proc.wait(timeout=5)
        except Exception:
            self.proc.kill()

    def __enter__(self):
        return self

    def __exit__(self, *a):
        self.close()


if __name__ == "__main__":
    with Mcp5E() as m:
        print("툴:", ", ".join(m.tools()))
        print(m.wait_for_app() if "--wait" in sys.argv else m.call("app_status"))
