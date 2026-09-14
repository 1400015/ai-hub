#!/usr/bin/env python3
"""
AI Hub Local Server (local/server.py)
Servidor complementar HTTP e SSE: persistência de memórias, proxy de IA e exportações.
"""
from __future__ import annotations

import json
import os
import re
import sys
import urllib.error
import urllib.parse
import urllib.request

# ----------------------------------------------------------------------------
# BLOCO 1: Configuração de Codificação da Consola e Diretórios Base
# O QUE É SUPOSTO ACONTECER:
# - Reconfigura stdout/stderr para UTF-8 em terminais Windows (evita erros cp1252).
# - Define e cria automaticamente as pastas de dados (data/) e exportações (exports/).
# ----------------------------------------------------------------------------
if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding="utf-8")
        sys.stderr.reconfigure(encoding="utf-8")
    except Exception:
        pass

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

# Limite máximo de tamanho do corpo da requisição (5 MB) para evitar ataques de DoS
MAX_CONTENT_SIZE = 5 * 1024 * 1024

# ----------------------------------------------------------------------------
# BLOCO 2: Mapeamento de Fornecedores de Modelos de Linguagem
# O QUE É SUPOSTO ACONTECER:
# - Define as URLs base e modelos predefinidos dos fornecedores compatíveis com
#   a especificação OpenAI (DashScope/Qwen, DeepSeek, Z.ai/GLM e Mistral).
# ----------------------------------------------------------------------------
PROVIDERS = {
    "qwen": {
        "name": "Qwen",
        "base": "https://dashscope-intl.aliyuncs.com/compatible-mode/v1",
        "base_cn": "https://dashscope.aliyuncs.com/compatible-mode/v1",
        "model": "qwen-plus",
        "chat": "https://chat.qwen.ai",
    },
    "deepseek": {
        "name": "DeepSeek",
        "base": "https://api.deepseek.com/v1",
        "model": "deepseek-chat",
        "chat": "https://chat.deepseek.com",
    },
    "glm": {
        "name": "GLM / Z.ai",
        "base": "https://api.z.ai/api/paas/v4",
        "base_cn": "https://open.bigmodel.cn/api/paas/v4",
        "model": "glm-4.5-flash",
        "chat": "https://chat.z.ai",
    },
    "mistral": {
        "name": "Mistral",
        "base": "https://api.mistral.ai/v1",
        "model": "mistral-small-latest",
        "chat": "https://chat.mistral.ai",
    },
    "openai": {
        "name": "OpenAI / ChatGPT",
        "base": "https://api.openai.com/v1",
        "model": "gpt-4o-mini",
        "chat": "https://chatgpt.com",
    },
    "claude": {
        "name": "Claude / Anthropic",
        "base": "https://api.anthropic.com/v1",
        "model": "claude-3-5-sonnet-20241022",
        "chat": "https://claude.ai",
    },
}

SAFE_NAME = re.compile(r"[^A-Za-z0-9._-]")
PATH_TRAVERSAL = re.compile(r"\.\.[\\/]|^[\\/]")

# ----------------------------------------------------------------------------
# BLOCO 3: Sanitização Estrita de Nomes de Ficheiro
# O QUE É SUPOSTO ACONTECER:
# - Substitui caracteres especiais por underscores e remove sequências ".."
# - Limita o nome a 80 caracteres para evitar erros no sistema de ficheiros.
# - Previne vulnerabilidades de Directory Traversal e Header Splitting.
# ----------------------------------------------------------------------------
def safe_filename(name: str, default: str = "export") -> str:
    cleaned = SAFE_NAME.sub("_", (name or default).strip() or default)[:80]
    cleaned = cleaned.strip("._")
    return cleaned or default


def json_bytes(obj: Any, code: int = 200):
    return code, json.dumps(obj, ensure_ascii=False, indent=2).encode("utf-8"), "application/json; charset=utf-8"

# ----------------------------------------------------------------------------
# BLOCO 4: Persistência Local de Memórias e Conversas em Disco
# O QUE É SUPOSTO ACONTECER:
# - Grava e lê ficheiros JSON em data/ com tratamento de exceções contra ficheiros vazios ou corrompidos.
# ----------------------------------------------------------------------------
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

# ----------------------------------------------------------------------------
# BLOCO 5: Geradores de Exportação em Formatos Diversos (Office / PDF / Código)
# O QUE É SUPOSTO ACONTECER:
# - export_text: Grava texto simples, markdown ou ficheiros de código fonte.
# - export_docx: Constrói documento Word formatado com python-docx.
# - export_xlsx: Constrói folha de cálculo Excel com tabelas detectadas via openpyxl.
# - export_pdf: Gera PDF tipográfico A4 profissional via reportlab.
# - export_zip: Agrupa múltiplos ficheiros de código num arquivo ZIP compactado.
# ----------------------------------------------------------------------------
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
    from openpyxl.cell.cell import ILLEGAL_CHARACTERS_RE
    wb = Workbook()
    ws = wb.active
    safe_title = re.sub(r"[*?:/\\\[\]]", "_", (title or "Dados").strip())[:31]
    ws.title = safe_title or "Dados"
    lines = content.splitlines() or [content]
    if any("\t" in ln or ";" in ln or "," in ln for ln in lines[:5]):
        for r, line in enumerate(lines, 1):
            cols = line.split("\t") if "\t" in line else (line.split(";") if ";" in line else [c.strip() for c in line.split(",")])
            for c, val in enumerate(cols, 1):
                clean_val = ILLEGAL_CHARACTERS_RE.sub("", str(val))
                ws.cell(r, c, clean_val)
    else:
        ws.cell(1, 1, ILLEGAL_CHARACTERS_RE.sub("", safe_title or "Conteudo"))
        for r, line in enumerate(lines, 2):
            clean_line = ILLEGAL_CHARACTERS_RE.sub("", str(line))
            ws.cell(r, 1, clean_line)
    wb.save(str(path))


def _clean_for_pdf(text: str) -> str:
    cleaned = re.sub(r"[\x00-\x08\x0b\x0c\x0e-\x1f]", "", str(text or ""))
    try:
        cleaned.encode("latin-1")
        return cleaned
    except UnicodeEncodeError:
        return cleaned.encode("ascii", "xmlcharrefreplace").decode("ascii")


def export_pdf(path: Path, content: str, title: str):
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from reportlab.lib.units import mm
    from reportlab.platypus import SimpleDocTemplate, Paragraph, Preformatted, Spacer
    from xml.sax.saxutils import escape
    clean_content = _clean_for_pdf(content)
    clean_title = _clean_for_pdf(title or "Exportacao")
    doc = SimpleDocTemplate(str(path), pagesize=A4, leftMargin=18 * mm, rightMargin=18 * mm, topMargin=16 * mm, bottomMargin=16 * mm, title=clean_title)
    styles = getSampleStyleSheet()
    body = ParagraphStyle("BodyPT", parent=styles["Normal"], fontName="Times-Roman", fontSize=11, leading=15)
    code = ParagraphStyle("CodePT", parent=styles["Code"], fontName="Courier", fontSize=8.5, leading=11)
    story = [Paragraph(escape(clean_title), styles["Heading1"]), Spacer(1, 8)]
    looks = clean_content.count("\n") > 3 and ("def " in clean_content or "class " in clean_content or "```" in clean_content)
    if looks:
        story.append(Preformatted(clean_content[:60000], code))
    else:
        for para in clean_content.split("\n\n"):
            if para.strip():
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

# ----------------------------------------------------------------------------
# BLOCO 6: Manipulador HTTP Principal (Request Handler)
# O QUE É SUPOSTO ACONTECER:
# - Implementa servidor REST e SSE sobre a classe SimpleHTTPRequestHandler.
# - Aplica cabeçalhos CORS permitindo pedidos apenas da extensão Chrome e localhost.
# - Previne ataques de negação de serviço e leitura arbitrária de ficheiros no disco.
# ----------------------------------------------------------------------------
class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(WEB), **kwargs)

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        origin = self.headers.get("Origin", "")
        if origin.startswith("chrome-extension://") or origin in ("http://127.0.0.1:8765", "http://localhost:8765"):
            self.send_header("Access-Control-Allow-Origin", origin)
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        super().end_headers()

    def do_OPTIONS(self):
        """Responde imediatamente a requisições preflight CORS com HTTP 204 No Content."""
        self.send_response(204)
        self.end_headers()

    def _read_json(self):
        """Lê o payload JSON garantindo que não excede o limite máximo permitido."""
        try:
            length = int(self.headers.get("Content-Length") or 0)
        except (ValueError, TypeError):
            return {}
        if length > MAX_CONTENT_SIZE or length < 0:
            return None
        raw = self.rfile.read(length) if length else b"{}"
        try:
            decoded = raw.decode("utf-8")
        except UnicodeDecodeError:
            try:
                decoded = raw.decode("latin-1")
            except Exception:
                decoded = raw.decode("utf-8", errors="replace")
        try:
            return json.loads(decoded or "{}")
        except json.JSONDecodeError:
            return {}

    def _send(self, code, body, ctype, extra=None):
        """Envia resposta HTTP com cabeçalhos de tipo e tamanho de conteúdo."""
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        if extra:
            for k, v in extra.items():
                self.send_header(k, v)
        self.end_headers()
        self.wfile.write(body)

    # ------------------------------------------------------------------------
    # BLOCO 7: Roteamento de Requisições HTTP GET
    # O QUE É SUPOSTO ACONTECER:
    # - /api/health: Retorna estado de funcionamento e lista de provedores suportados.
    # - /api/memories: Retorna a lista de memórias persistidas.
    # - /api/conversations: Retorna o histórico de conversas gravadas.
    # - /api/exports: Lista todos os ficheiros exportados disponíveis em exports/.
    # - /downloads/<ficheiro>: Serve ficheiros gerados com isolamento canónico rigoroso.
    # ------------------------------------------------------------------------
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
            # 1. Decodifica caracteres URL codificados (%2e%2e%2f)
            raw_param = urllib.parse.unquote(path[len("/downloads/"):])
            if ".." in raw_param or "/" in raw_param or "\\" in raw_param:
                return self._send(403, b"acesso negado", "text/plain")
            clean_name = Path(raw_param).name
            if not clean_name:
                return self._send(400, b"bad request", "text/plain")
            target = (EXPORTS / clean_name).resolve()
            # 2. Validação matemática de contenção canónica no diretório EXPORTS
            try:
                target.relative_to(EXPORTS.resolve())
            except ValueError:
                return self._send(403, b"acesso negado", "text/plain")
            if not target.exists() or not target.is_file():
                return self._send(404, b"not found", "text/plain")
            safe_header_name = safe_filename(target.stem) + target.suffix
            return self._send(200, target.read_bytes(), "application/octet-stream", {"Content-Disposition": f'attachment; filename="{safe_header_name}"'})
        return super().do_GET()

    # ------------------------------------------------------------------------
    # BLOCO 8: Roteamento de Requisições HTTP POST
    # O QUE É SUPOSTO ACONTECER:
    # - /api/memories: Atualiza a lista de memórias no disco.
    # - /api/conversations: Grava novas conversas no histórico.
    # - /api/export: Processa pedidos de exportação para ficheiros em disco.
    # - /api/chat: Proxy seguro para chamadas de IA com suporte a streaming SSE.
    # ------------------------------------------------------------------------
    def do_POST(self):
        path = self.path.split("?", 1)[0]
        payload = self._read_json()
        if payload is None:
            return self._send(*json_bytes({"error": f"payload demasiado grande (max {MAX_CONTENT_SIZE} bytes)"}, 413))
        try:
            if path == "/api/memories":
                items = payload.get("memories")
                if not isinstance(items, list):
                    return self._send(*json_bytes({"error": "memories deve ser uma lista"}, 400))
                if len(items) > 500:
                    return self._send(*json_bytes({"error": "maximo de 500 memorias permitido"}, 400))
                valid_items = []
                for m in items:
                    if isinstance(m, dict) and "id" in m and "title" in m:
                        valid_items.append({
                            "id": str(m.get("id"))[:64],
                            "title": str(m.get("title", ""))[:200],
                            "body": str(m.get("body", ""))[:50000],
                            "active": bool(m.get("active", True))
                        })
                save_memories(valid_items)
                return self._send(*json_bytes({"ok": True, "count": len(valid_items)}))
            if path == "/api/conversations":
                items = payload.get("conversations")
                if not isinstance(items, list):
                    return self._send(*json_bytes({"error": "conversations deve ser uma lista"}, 400))
                if len(items) > 100:
                    return self._send(*json_bytes({"error": "maximo de 100 conversas permitido"}, 400))
                valid_convs = []
                for c in items:
                    if isinstance(c, dict) and "id" in c:
                        valid_convs.append({
                            "id": str(c.get("id"))[:64],
                            "title": str(c.get("title", "conversa"))[:200],
                            "savedAt": str(c.get("savedAt", ""))[:30],
                            "messages": c.get("messages", [])[:500] if isinstance(c.get("messages"), list) else []
                        })
                save_conversations(valid_convs)
                return self._send(*json_bytes({"ok": True, "count": len(valid_convs)}))
            if path == "/api/export":
                return self._handle_export(payload)
            if path == "/api/chat":
                return self._handle_chat(payload)
            return self._send(*json_bytes({"error": "rota desconhecida"}, 404))
        except Exception as exc:
            return self._send(*json_bytes({"error": str(exc)}, 500))

    def _handle_export(self, payload):
        """Gera o ficheiro pedido no disco e retorna a sua URL para descarregamento."""
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
        """Encaminha o pedido para a API do fornecedor de IA com suporte a streaming SSE em tempo real."""
        provider = str(payload.get("provider") or "").lower()
        if provider not in PROVIDERS:
            return self._send(*json_bytes({"error": "fornecedor invalido"}, 400))
        api_key = (payload.get("api_key") or "").strip()
        if not api_key:
            return self._send(*json_bytes({"error": "API key em falta"}, 400))
        messages = payload.get("messages") or []
        model = payload.get("model") or PROVIDERS[provider]["model"]
        temperature = float(payload.get("temperature", 0.7))
        meta = PROVIDERS[provider]
        base = meta.get("base_cn") if payload.get("use_cn") and meta.get("base_cn") else meta["base"]
        stream = bool(payload.get("stream", False))

        if provider == "claude":
            url = base.rstrip("/") + "/messages"
            headers = {
                "x-api-key": api_key,
                "anthropic-version": "2023-06-01",
                "Content-Type": "application/json",
            }
            system_msgs = [m.get("content", "") for m in messages if m.get("role") == "system"]
            system_prompt = "\n\n".join(str(c) for c in system_msgs if c)
            body_dict = {
                "model": model,
                "max_tokens": 4096,
                "messages": [m for m in messages if m.get("role") in ("user", "assistant")],
                "stream": stream,
                "temperature": temperature,
            }
            if system_prompt:
                body_dict["system"] = system_prompt
            body_req = json.dumps(body_dict).encode("utf-8")
        else:
            url = base.rstrip("/") + "/chat/completions"
            headers = {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}
            body_req = json.dumps({"model": model, "messages": messages, "stream": stream, "temperature": temperature}).encode("utf-8")

        req = urllib.request.Request(url, data=body_req, method="POST", headers=headers)
        try:
            resp = urllib.request.urlopen(req, timeout=120)
            if stream:
                # Transmite os eventos SSE token a token com descarga forçada de socket (flush)
                self.send_response(200)
                self.send_header("Content-Type", "text/event-stream; charset=utf-8")
                self.send_header("Cache-Control", "no-cache")
                self.send_header("Connection", "keep-alive")
                self.end_headers()
                try:
                    for line in resp:
                        self.wfile.write(line)
                        self.wfile.flush()
                except (BrokenPipeError, ConnectionResetError):
                    pass
                return
            data = json.loads(resp.read().decode("utf-8"))
            if provider == "claude":
                text = (data.get("content") or [{}])[0].get("text", "")
            else:
                text = data.get("choices", [{}])[0].get("message", {}).get("content") or ""
            return self._send(*json_bytes({"ok": True, "text": text, "raw": data}))
        except urllib.error.HTTPError as err:
            detail = err.read().decode("utf-8", errors="replace")[:2000]
            return self._send(*json_bytes({"error": f"HTTP {err.code}", "detail": detail}, 502))
        except Exception as exc:
            return self._send(*json_bytes({"error": str(exc)}, 502))

    def log_message(self, fmt, *args):
        print(f"[{datetime.now().strftime('%H:%M:%S')}] {fmt % args}")

# ----------------------------------------------------------------------------
# BLOCO 9: Ponto de Entrada da Aplicação e Inicialização do Servidor Multithread
# O QUE É SUPOSTO ACONTECER:
# - Lê as variáveis de ambiente HOST e PORT (padrão: 127.0.0.1:8765).
# - Arranca o ThreadingHTTPServer que trata requisições concorrentes em threads separadas.
# - Encerra graciosamente ao receber KeyboardInterrupt (Ctrl+C).
# ----------------------------------------------------------------------------
def main():
    host = os.environ.get("HOST", "127.0.0.1")
    port = int(os.environ.get("PORT", "8765"))
    server = ThreadingHTTPServer((host, port), Handler)
    server.daemon_threads = True
    print(f"AI Hub local -> http://{host}:{port}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nA encerrar.")
        server.server_close()


if __name__ == "__main__":
    main()
