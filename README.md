# AI Hub

Ferramentas locais para trabalhar com **ChatGPT**, **Claude**, **Gemini**, **Qwen**, **DeepSeek**, **GLM / Z.ai** e **Mistral**:

1. `local/` — servidor Python (`http://127.0.0.1:8765`) com persistência de memórias, proxy de API (com suporte a SSE streaming, OpenAI e Anthropic) e exportações Office/PDF.
2. `extension/` — extensão Chrome/Edge/Brave 100% autónoma (Manifest V3) com:
   - **Injeção Inteligente de Memória:** Ordena o contexto automaticamente por relevância semântica em função da pergunta.
   - **Auto-Harvesting (🧠 Aprender):** Analisa e memoriza pontos essenciais da conversa diretamente no chat.
   - **Geração Nativa (Zero-Install):** Exporta DOCX, XLSX, PDF, ZIP e código diretamente pelo navegador sem dependências.
   - **Suporte Multimodelos:** Integração nos chats e chamadas diretas às APIs sem bloqueios de CORS.

## Arranque rápido

```bash
cd local
python3 server.py
```

Abre http://127.0.0.1:8765

Instala a extensão em `chrome://extensions/` → Modo de programador → Carregar sem compactação → pasta `extension/`.

No chat oficial, o dock mostra se o hub está ligado. **Chat → DOCX / PDF / XLSX** e o botão **guardar** nos blocos de código passam pelo service worker até `POST /api/export`. Os ficheiros ficam em `local/exports/` e o browser também os pode descarregar.

Sem o servidor a correr, a extensão gera DOCX, XLSX, PDF e ZIP nativamente no browser. O servidor é opcional e serve para persistir ficheiros em disco.

## Requisitos

- Python 3.10+
- `python-docx`, `openpyxl`, `reportlab` (para Office/PDF)

```bash
pip install python-docx openpyxl reportlab
```

## Documentação e Manuais

- 📖 [MANUAL.md](MANUAL.md) — Manual do utilizador e guia de instalação passo a passo.
- 🛠️ [PROGRAMMING_MANUAL.md](PROGRAMMING_MANUAL.md) — Manual de programação e arquitetura com explicação linha a linha do código, segurança e decisões técnicas.

## Privacidade e Segurança

- Memórias da extensão: `chrome.storage.local`
- Memórias do hub: `local/data/memories.json`
- Chaves API no painel web: Criptografia AES-GCM 256 bits com PBKDF2 (100.000 iterações) via Web Crypto API.
- Modo Autónomo: Exportações (DOCX, XLSX, PDF, ZIP) e chamadas de IA funcionam diretamente no browser sem enviar dados para servidores externos de telemetria.

