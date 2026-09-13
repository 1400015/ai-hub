# O que está de facto no código

O merge do Qwen Coder (PR #1) descreveu 21 melhorias. Várias existiam só no texto. Esta nota reflecte o `main` **depois** da limpeza de 2026-09-11 e do lançamento da versão 1.2.0.

## Novidades na Versão 1.3.0

- **Suporte Oficial a ChatGPT e Claude**: Adaptadores DOM e seletores heurísticos em `sites.js` para `chatgpt.com`, `chat.openai.com` e `claude.ai`. Chamadas diretas de API suportando o formato padrão OpenAI e Anthropic (`/v1/messages`).
- **Injeção de Memória Inteligente**: Motor de pontuação de relevância semântica (`scoreRelevance`) em `inject.js` e `sidepanel.js` que analisa o prompt do utilizador e ordena as memórias ativas por afinidade temática.
- **Auto-Harvesting (`🧠 Aprender`)**: Novo botão no Dock flutuante que resume a conversa atual e grava automaticamente uma nova memória em `chrome.storage.local` e no hub local.
- **Segurança e Manifest V3**: Adicionada política explícita de `content_security_policy` no `manifest.json` e proteção estrita contra DoS (`MAX_CONTENT_SIZE`) no servidor.
- **Testes Unitários Expandidos**: Suite de testes com 23 casos de teste cobrindo novos fornecedores e rejeição de payloads acima do limite.

## Novidades na Versão 1.2.0

- **Arquitetura 100% Autónoma (Zero-Install)**: Novo gerador binário nativo `lib/exporter.js` em puro JavaScript capaz de criar ficheiros OpenXML Word (`.docx`), Excel (`.xlsx`), PDF 1.4 canónico e arquivos ZIP sem exigir Python nem módulos adicionais.
- **Chamadas de IA sem CORS**: Service Worker com `host_permissions` para invocar APIs de DeepSeek, DashScope/Qwen, GLM e Mistral diretamente.
- **Botões de Acesso Direto a Ficheiros**:
  - `📁 Ver Ficheiros Criados` no popup.
  - `Abrir Downloads do Chrome` no sidepanel.
  - `📁 Ficheiros` na barra flutuante sobreposta nos chats.
- **Segurança Criptográfica**: Cifragem de chaves de API com AES-GCM 256 bits derivada de senha mestra por PBKDF2 (100.000 voltas) na interface web local.
- **Isolamento Canónico Anti-Path Traversal**: Rota `/downloads/` validada com `target.resolve().relative_to(EXPORTS.resolve())` e `safe_filename`.
- **Streaming SSE**: Suporte a Server-Sent Events em `/api/chat` e descodificador progressivo de tokens na UI.
- **Documentação e Manuais**: Adicionado `PROGRAMMING_MANUAL.md` completo e anotação comentada bloco a bloco de todo o código do projeto.
- **Pacotes de Distribuição**: Scripts automatizados em `scripts/` para gerar o pacote de instalação em novos computadores e o projeto completo.
- **Suite de Testes**: 22 testes automatizados no `pytest` cobrindo segurança, integridade e empacotamento.

Versão da extensão: **1.3.0**.
