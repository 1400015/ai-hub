#!/usr/bin/env python3
"""Hub local: UI, memorias, proxy OpenAI-compativel e exportacao."""
from __future__ import annotations

import json
import os
import re
import urllib.error
import urllib.request
from datetime import datetime
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parent
WEB = ROOT / "web"
EXPORTS = ROOT / "exports"
DATA = ROOT / "data"
MEMORIES_FILE = DATA / "memories.json"
CONVERSATIONS_FILE = DATA / "conversations.json"
EXPORTS.mkdir(exist_ok=True)
DATA.mkdir(exist_ok=True)

MAX_CONTENT_SIZE = 5 * 1024 * 1024

PROVIDERS = {
    "qwen": {"name": "Qwen", "base": "https://dashscope-intl.aliyuncs.com/compatible-mode/v1", "base_cn": "https://dashscope.aliyuncs.com/compatible-mode/v1", "model": "qwen-plus", "chat": "https://chat.qwen.ai"},
    "deepseek": {"name": "DeepSeek", "base": "https://api.deepseek.com/v1", "model": "deepseek-chat", "chat": "https://chat.deepseek.com"},
    "glm": {"name": "GLM / Z.ai", "base": "https://api.z.ai/api/paas/v4", "base_cn": "https://open.bigmodel.cn/api/paas/v4", "model": "glm-4.5-flash", "chat": "https://chat.z.ai"},
    "mistral": {"name": "Mistral", "base": "https://api.mistral.ai/v1", "model": "mistral-small-latest", "chat": "https://chat.mistral.ai"},
}
SAFE_NAME = re.compile(r"[^A-Za-z0-9._-]+")
PATH_TRAVERSAL = re.compile(r"\.\.[\\/]|^[\\/]")


def safe_filename(name: str, default: str = "export") -> str:
    name = SAFE_NAME.sub("_", (name or default).strip() or default)[:80]
    return name or default


def json_bytes(obj: Any, code: int = 200):
    return code, json.dumps(obj, ensure_ascii=False, indent=2).encode("utf-8"), "application/json; charset=utf-8"


def load_memories():
    if not MEMORIES_FILE.exists():
        return []
    try:
        data = json.loads(MEMORIES_FILE.read_text(encoding="utf-8"))
        return data if isinstance(data, list) else []
    except Exception:
        return []


def save_memories(items):
    MEMORIES_FILE.write_text(json.dumps(items, ensure_ascii=False, indent=2), encoding="utf-8")


def load_conversations():
    if not CONVERSATIONS_FILE.exists():
        return []
    try:
        data = json.loads(CONVERSATIONS_FILE.read_text(encoding="utf-8"))
        return data if isinstance(data, list) else []
    except Exception:
        return []


def save_conversations(items):
    CONVERSATIONS_FILE.write_text(json.dumps(items, ensure_ascii=False, indent=2), encoding="utf-8")


def export_text(path: Path, content: str, title: str = ""):
    path.write_text(content, encoding="utf-8")


def export_docx(path: Path, content: str, title: str):
    from docx import Document
    from docx.shared import Pt
    doc = Document()
    doc.add_heading(title or "Exportacao", level=1)
    for block in content.split("\n\n"):
        p = doc.add_paragraph(block)
        for run in p.runs:
            run.font.size = Pt(11)
    doc.save(str(path))


def export_xlsx(path: Path, content: str, title: str):
    from openpyxl import Workbook
    wb = Workbook()
    ws = wb.active
    ws.title = (title or "Dados")[:31]
    lines = content.splitlines() or [content]
    if any("\t" in ln or ";" in ln or "," in ln for ln in lines[:5]):
        for r, line in enumerate(lines, 1):
            cols = line.split("\t") if "\t" in line else (line.split(";") if ";" in line else [c.strip() for c in line.split(",")])
            for c, val in enumerate(cols, 1):
                ws.cell(r, c, val)
    else:
        ws.cell(1, 1, title or "Conteudo")
        for r, line in enumerate(lines, 2):
            ws.cell(r, 1, line)
    wb.save(str(path))


def export_pdf(path: Path, content: str, title: str):
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from reportlab.lib.units import mm
    from reportlab.platypus import SimpleDocTemplate, Paragraph, Preformatted, Spacer
    from xml.sax.saxutils import escape
    doc = SimpleDocTemplate(str(path), pagesize=A4, leftMargin=18 * mm, rightMargin=18 * mm, topMargin=16 * mm, bottomMargin=16 * mm, title=title or "Exportacao")
    styles = getSampleStyleSheet()
    body = ParagraphStyle("BodyPT", parent=styles["Normal"], fontName="Times-Roman", fontSize=11, leading=15)
    code = ParagraphStyle("CodePT", parent=styles["Code"], fontName="Courier", fontSize=8.5, leading=11)
    story = [Paragraph(escape(title or "Exportacao"), styles["Heading1"]), Spacer(1, 8)]
    looks = content.count("\n") > 3 and ("def " in content or "class " in content or "```" in content)
    if looks:
        story.append(Preformatted(content[:60000], code))
    else:
        for para in content.split("\n\n"):
            story.append(Paragraph(escape(para).replace("\n", "<br/>"), body))
            story.append(Spacer(1, 6))
    doc.build(story)


def export_zip(path: Path, files: list, title: str):
    import zipfile
    with zipfile.ZipFile(str(path), "w", zipfile.ZIP_DEFLATED) as zf:
        for f in files:
            filename = safe_filename(str(f.get("filename") or "file.txt"), "file.txt")
            content = f.get("content", "")
            zf.writestr(filename, content if isinstance(content, str) else str(content))


EXPORT_HANDLERS = {
    "md": (".md", export_text), "markdown": (".md", export_text), "txt": (".txt", export_text),
    "py": (".py", export_text), "python": (".py", export_text), "java": (".java", export_text),
    "js": (".js", export_text), "ts": (".ts", export_text), "html": (".html", export_text),
    "css": (".css", export_text), "json": (".json", export_text), "csv": (".csv", export_text),
    "sql": (".sql", export_text), "xml": (".xml", export_text), "yaml": (".yaml", export_text),
    "yml": (".yml", export_text), "sh": (".sh", export_text), "rs": (".rs", export_text),
    "go": (".go", export_text), "c": (".c", export_text), "cpp": (".cpp", export_text),
    "kt": (".kt", export_text), "swift": (".swift", export_text), "rb": (".rb", export_text),
    "php": (".php", export_text), "r": (".r", export_text),
    "docx": (".docx", export_docx), "xlsx": (".xlsx", export_xlsx), "xls": (".xlsx", export_xlsx), "pdf": (".pdf", export_pdf),
}


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(WEB), **kwargs)

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        origin = self.headers.get("Origin", "")
        if origin in ("http://127.0.0.1:8765", "http://localhost:8765"):
            self.send_header("Access-Control-Allow-Origin", origin)
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        super().end_headers()

    def do_OPTIONS(self):
        self.send_response(204)
        self.end_headers()

    def _read_json(self):
        length = int(self.headers.get("Content-Length") or 0)
        raw = self.rfile.read(length) if length else b"{}"
        try:
            return json.loads(raw.decode("utf-8") or "{}")
        except json.JSONDecodeError:
            return {}

    def _send(self, code, body, ctype, extra=None):
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        if extra:
            for k, v in extra.items():
                self.send_header(k, v)
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        path = self.path.split("?", 1)[0]
        if path == "/api/health":
            return self._send(*json_bytes({"ok": True, "providers": list(PROVIDERS)}))
        if path == "/api/memories":
            return self._send(*json_bytes({"memories": load_memories()}))
        if path == "/api/conversations":
            return self._send(*json_bytes({"conversations": load_conversations()}))
        if path == "/api/exports":
            files = sorted(EXPORTS.glob("*"), key=lambda p: p.stat().st_mtime, reverse=True)
            listing = [{"name": f.name, "size": f.stat().st_size, "mtime": datetime.fromtimestamp(f.stat().st_mtime).isoformat(timespec="seconds"), "url": f"/downloads/{f.name}"} for f in files if f.is_file()]
            return self._send(*json_bytes({"files": listing}))
        if path.startswith("/downloads/"):
            target = EXPORTS / Path(path).name
            if PATH_TRAVERSAL.search(path) or ".." in path:
                return self._send(403, b"acesso negado", "text/plain")
            if not target.exists() or not target.is_file():
                return self._send(404, b"not found", "text/plain")
            return self._send(200, target.read_bytes(), "application/octet-stream", {"Content-Disposition": f'attachment; filename="{target.name}"'})
        return super().do_GET()

    def do_POST(self):
        path = self.path.split("?", 1)[0]
        payload = self._read_json()
        try:
            if path == "/api/memories":
                items = payload.get("memories")
                if not isinstance(items, list):
                    return self._send(*json_bytes({"error": "memories deve ser uma lista"}, 400))
                save_memories(items)
                return self._send(*json_bytes({"ok": True, "count": len(items)}))
            if path == "/api/conversations":
                items = payload.get("conversations")
                if not isinstance(items, list):
                    return self._send(*json_bytes({"error": "conversations deve ser uma lista"}, 400))
                save_conversations(items)
                return self._send(*json_bytes({"ok": True, "count": len(items)}))
            if path == "/api/export":
                return self._handle_export(payload)
            if path == "/api/chat":
                return self._handle_chat(payload)
            return self._send(*json_bytes({"error": "rota desconhecida"}, 404))
        except Exception as exc:
            return self._send(*json_bytes({"error": str(exc)}, 500))

    def _handle_export(self, payload):
        fmt = str(payload.get("format") or "md").lower().lstrip(".")
        content = payload.get("content") or ""
        title = payload.get("title") or "export"
        if len(str(content)) > MAX_CONTENT_SIZE:
            return self._send(*json_bytes({"error": f"conteudo muito grande (max {MAX_CONTENT_SIZE} bytes)"}, 400))
        if fmt == "zip":
            files = payload.get("files", [])
            if not isinstance(files, list) or not files:
                return self._send(*json_bytes({"error": "files deve ser uma lista nao vazia"}, 400))
            filename = f"{safe_filename(title)}-{datetime.now().strftime('%Y%m%d-%H%M%S')}.zip"
            dest = EXPORTS / filename
            export_zip(dest, files, title)
            return self._send(*json_bytes({"ok": True, "filename": filename, "path": str(dest), "url": f"/downloads/{filename}", "size": dest.stat().st_size}))
        if not str(content).strip():
            return self._send(*json_bytes({"error": "conteudo vazio"}, 400))
        if fmt not in EXPORT_HANDLERS:
            return self._send(*json_bytes({"error": f"formato nao suportado: {fmt}", "supported": sorted(EXPORT_HANDLERS)}, 400))
        ext, writer = EXPORT_HANDLERS[fmt]
        filename = f"{safe_filename(title)}-{datetime.now().strftime('%Y%m%d-%H%M%S')}{ext}"
        dest = EXPORTS / filename
        writer(dest, content, title)
        return self._send(*json_bytes({"ok": True, "filename": filename, "path": str(dest), "url": f"/downloads/{filename}", "size": dest.stat().st_size}))

    def _handle_chat(self, payload):
        provider = str(payload.get("provider") or "").lower()
        if provider not in PROVIDERS:
            return self._send(*json_bytes({"error": "fornecedor invalido"}, 400))
        api_key = (payload.get("api_key") or "").strip()
        if not api_key:
            return self._send(*json_bytes({"error": "API key em falta"}, 400))
        messages = payload.get("messages") or []
        model = payload.get("model") or PROVIDERS[provider]["model"]
        meta = PROVIDERS[provider]
        base = meta.get("base_cn") if payload.get("use_cn") and meta.get("base_cn") else meta["base"]
        url = base.rstrip("/") + "/chat/completions"
        temperature = float(payload.get("temperature") or 0.7)
        body_req = json.dumps({"model": model, "messages": messages, "stream": False, "temperature": temperature}).encode("utf-8")
        req = urllib.request.Request(url, data=body_req, method="POST", headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"})
        try:
            with urllib.request.urlopen(req, timeout=120) as resp:
                data = json.loads(resp.read().decode("utf-8"))
            text = data.get("choices", [{}])[0].get("message", {}).get("content") or ""
            return self._send(*json_bytes({"ok": True, "text": text, "raw": data}))
        except urllib.error.HTTPError as err:
            detail = err.read().decode("utf-8", errors="replace")[:2000]
            return self._send(*json_bytes({"error": f"HTTP {err.code}", "detail": detail}, 502))
        except Exception as exc:
            return self._send(*json_bytes({"error": str(exc)}, 502))

    def log_message(self, fmt, *args):
        print(f"[{datetime.now().strftime('%H:%M:%S')}] {fmt % args}")


def main():
    port = int(os.environ.get("PORT", "8765"))
    server = ThreadingHTTPServer(("127.0.0.1", port), Handler)
    server.daemon_threads = True
    print(f"AI Hub local → http://127.0.0.1:{port}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nA encerrar.")
        server.server_close()


if __name__ == "__main__":
    main()
