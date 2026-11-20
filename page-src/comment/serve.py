# 소개 페이지 문구 코멘트 탭 — 문구목록.md를 읽어 항목마다 코멘트 칸을 그리고, 적은 것은 comments.json에 저장한다.
import json, pathlib, re, html
from http.server import HTTPServer, BaseHTTPRequestHandler

D = pathlib.Path(__file__).parent
MD = D / '문구목록.md'
CJ = D / 'comments.json'

def items():
    out, sec = [], ''
    for ln in MD.read_text().splitlines():
        if ln.startswith('## '):
            sec = ln[3:].strip(); out.append(('h', sec, '')); continue
        m = re.match(r'^(\d+)\.\s+(.*)$', ln) or re.match(r'^\s+-\s+(S\d+-\d+)\s+(.*)$', ln)
        if m: out.append(('i', m.group(1), m.group(2)))
    return out

PAGE = """<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>문구 코멘트</title><style>
:root{--bg:#f6f6f6;--card:#fff;--ink:#111;--soft:#666;--line:#e3e3e3;--acc:#111}
@media (prefers-color-scheme:dark){:root{--bg:#0e0e0f;--card:#18181a;--ink:#f2f2f2;--soft:#9a9aa0;--line:#2a2a2d;--acc:#f2f2f2}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.6 -apple-system,"Apple SD Gothic Neo",Pretendard,sans-serif}
header{position:sticky;top:0;z-index:5;display:flex;align-items:center;gap:12px;padding:14px 24px;background:var(--bg);border-bottom:1px solid var(--line)}
header h1{font-size:17px;margin:0}header .st{margin-left:auto;font-size:13px;color:var(--soft)}
header label{font-size:13px;color:var(--soft);display:flex;gap:6px;align-items:center}
main{max-width:980px;margin:0 auto;padding:12px 24px 80px}
h2{font-size:13px;letter-spacing:.06em;color:var(--soft);margin:34px 0 10px;font-weight:600}
.it{display:grid;grid-template-columns:62px 1fr 1fr;gap:14px;align-items:start;padding:12px 14px;background:var(--card);border:1px solid var(--line);border-radius:10px;margin-bottom:8px}
.it.has{border-color:var(--acc)}
.n{font:600 12px/1.9 ui-monospace,Menlo,monospace;color:var(--soft)}
.t{white-space:pre-wrap;word-break:keep-all}
textarea{width:100%;min-height:42px;resize:vertical;border:1px solid var(--line);border-radius:8px;padding:8px 10px;background:transparent;color:var(--ink);font:inherit;font-size:14px}
textarea:focus{outline:2px solid var(--acc);outline-offset:-1px}
.hide-done .it:not(.has){display:none}
@media (max-width:720px){.it{grid-template-columns:1fr}.n{line-height:1}}
</style></head><body>
<header><h1>소개 페이지 문구 코멘트</h1><label><input type="checkbox" id="only"> 코멘트 단 것만</label><span class="st" id="st">적으면 저절로 저장됩니다</span></header>
<main id="m">__BODY__</main>
<script>
const st=document.getElementById('st');let tm=null;
function save(){const o={};document.querySelectorAll('textarea').forEach(t=>{if(t.value.trim())o[t.dataset.k]=t.value});
 fetch('/save',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(o)}).then(r=>{st.textContent=r.ok?'저장됨 · '+new Date().toLocaleTimeString('ko-KR'):'저장 실패'}).catch(()=>st.textContent='저장 실패 — 서버가 꺼져 있음')}
document.querySelectorAll('textarea').forEach(t=>t.addEventListener('input',()=>{t.closest('.it').classList.toggle('has',!!t.value.trim());st.textContent='저장하는 중…';clearTimeout(tm);tm=setTimeout(save,600)}));
document.getElementById('only').addEventListener('change',e=>document.getElementById('m').classList.toggle('hide-done',e.target.checked));
</script></body></html>"""

class H(BaseHTTPRequestHandler):
    def log_message(self, *a): pass
    def end_headers(self):
        self.send_header('Access-Control-Allow-Origin', '*'); self.send_header('Access-Control-Allow-Headers', 'Content-Type'); super().end_headers()
    def do_OPTIONS(self):
        self.send_response(204); self.end_headers()
    def j(self, o):
        b = json.dumps(o, ensure_ascii=False).encode(); self.send_response(200); self.send_header('Content-Type', 'application/json; charset=utf-8'); self.send_header('Cache-Control', 'no-store'); self.end_headers(); self.wfile.write(b)
    def do_GET(self):
        if self.path.startswith('/items'): return self.j(items())
        if self.path.startswith('/comments'): return self.j(json.loads(CJ.read_text()) if CJ.exists() else {})
        c = json.loads(CJ.read_text()) if CJ.exists() else {}
        body = []
        for kind, a, b in items():
            if kind == 'h': body.append(f'<h2>{html.escape(a)}</h2>'); continue
            v = c.get(a, '')
            body.append(f'<div class="it{" has" if v.strip() else ""}"><div class="n">{a}</div><div class="t">{html.escape(b).replace(" / ", "<br>")}</div><textarea data-k="{a}" placeholder="코멘트">{html.escape(v)}</textarea></div>')
        out = PAGE.replace('__BODY__', '\n'.join(body)).encode()
        self.send_response(200); self.send_header('Content-Type', 'text/html; charset=utf-8'); self.send_header('Cache-Control', 'no-store'); self.end_headers(); self.wfile.write(out)
    def do_POST(self):
        if self.path != '/save': self.send_response(404); self.end_headers(); return
        n = int(self.headers.get('Content-Length', 0)); data = json.loads(self.rfile.read(n) or b'{}')
        CJ.write_text(json.dumps(data, ensure_ascii=False, indent=1))
        self.send_response(200); self.end_headers()

HTTPServer(('127.0.0.1', 8967), H).serve_forever()
