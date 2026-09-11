# O que está de facto no código

O merge do Qwen Coder (PR #1) descreveu 21 melhorias. Várias existiam só no texto. Esta nota reflecte o `main` **depois** da limpeza de 2026-09-11.

## Mantido do PR

- Limite de 5 MB no export e sanitização de nomes
- Protecção contra `..` em `/downloads/`
- Export ZIP (`format=zip` + lista `files`)
- Endpoints `/api/conversations`
- Debounce 300 ms no MutationObserver do dock
- Retry com backoff no service worker
- Dockerfile, GitHub Actions, `tests/test_server.py`, `docs/api.yaml`
- CORS só para `http://127.0.0.1:8765` e `http://localhost:8765`

## Corrigido / removido

- `download_page.html` e zip em base64 no raiz — lixo do agente
- Selectores `div[role=button]` genéricos nos botões Send
- `stream: true` no proxy de chat (partia o `json.loads`)
- `MAX_THREADS` que não era usado
- Changelog que prometia i18n, XOR nas API keys, SSE, UI de histórico e testes Jest que **não estavam no repo**

## Agora funcional

- Painel → Hub → **Sincronizar memórias**: junta chrome.storage com `data/memories.json` (mesmo `id` ganha a cópia local) e grava nos dois lados

Versão da extensão: **1.1.1**.
