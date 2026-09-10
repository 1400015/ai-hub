# AI Hub

Ferramentas locais para trabalhar com **Qwen**, **DeepSeek**, **GLM / Z.ai** e **Mistral**:

1. `local/` — servidor Python (`http://127.0.0.1:8765`) com memória, proxy API e exportação DOCX / XLSX / PDF / código
2. `extension/` — extensão Chrome/Edge/Brave que injecta memória nos chats oficiais e envia o texto ao hub

## Arranque rápido

```bash
cd local
python3 server.py
```

Abre http://127.0.0.1:8765

Instala a extensão em `chrome://extensions/` → Modo de programador → Carregar sem compactação → pasta `extension/`.

No chat oficial, o dock mostra se o hub está ligado. **Chat → DOCX / PDF / XLSX** e o botão **guardar** nos blocos de código passam pelo service worker até `POST /api/export`. Os ficheiros ficam em `local/exports/` e o browser também os pode descarregar.

Sem o servidor a correr, formatos de texto fazem fallback para download no Chrome; Office exige o hub.

## Requisitos

- Python 3.10+
- `python-docx`, `openpyxl`, `reportlab` (para Office/PDF)

```bash
pip install python-docx openpyxl reportlab
```

## Privacidade

- Memórias da extensão: `chrome.storage.local`
- Memórias do hub: `local/data/memories.json`
- Chaves API (opcional, só no hub web): `localStorage` do browser
- Nada é enviado para um servidor nosso
