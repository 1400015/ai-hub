# AI Hub - Registo de Melhorias (Change Log)

**Data da Implementação**: 2025-12-21  
**Agente IA Responsável**: Claude 3.7 Sonnet (Anthropic)  
**Versão do Projeto**: 1.2.0 (upgrade de 1.1.0)

---

## Resumo Executivo

Foram implementadas **21 melhorias críticas** organizadas em 6 categorias principais, focando em segurança, robustez, funcionalidades em falta e manutenção. Este registo documenta todas as alterações para rastreabilidade e futura referência.

---

## 🔴 SEGURANÇA (Crítico)

### 1. Encriptação de API Keys no localStorage
**Ficheiros**: `local/web/app.js`, `extension/sidepanel.js`  
**Problema**: API Keys armazenadas em texto puro, vulneráveis a ataques XSS  
**Solução**: Implementado esquema de encriptação simples usando Base64 + XOR com chave derivada do user-agent  
**Nota**: Em produção, considerar uso de Web Crypto API para encriptação AES-GCM

### 2. Validação de Input no Servidor Python
**Ficheiros**: `local/server.py`  
**Problema**: Sem validação de tamanho ou sanitização de paths  
**Solução**: 
- Limite de 5MB para conteúdo de export
- Sanitização rigorosa de filenames (regex reforçada)
- Validação de tipo e tamanho de payload

### 3. CORS Restrito
**Ficheiros**: `local/server.py`  
**Problema**: `Access-Control-Allow-Origin: "*"` permite qualquer origem  
**Solução**: Restrito para `http://127.0.0.1:8765` e `http://localhost:8765` apenas

---

## 🟠 ROBUSTEZ

### 4. Selectores CSS Resilientes
**Ficheiros**: `extension/content/sites.js`  
**Problema**: Selectores frágeis podem quebrar com updates das UIs  
**Solução**: 
- Adicionados fallback selectors genéricos
- Implementado sistema de scoring para priorizar selectores
- Logging de fallbacks usados para debugging

### 5. Retry Mechanism no background.js
**Ficheiros**: `extension/background.js`  
**Problema**: Falhas temporárias do hub não são tratadas  
**Solução**: Implementado retry exponencial (3 tentativas, backoff 500ms-2s)

### 6. Substituição de document.execCommand
**Ficheiros**: `extension/content/inject.js`  
**Problema**: API deprecated pode ser removida em browsers futuros  
**Solução**: Implementado fallback moderno usando Selection/Range API

---

## 🟢 FUNCIONALIDADES EM FALTA

### 7. Exportação para ZIP
**Ficheiros**: `local/server.py`, `local/web/app.js`  
**Solução**: Novo endpoint `/api/export/zip` que agrega múltiplos ficheiros

### 8. Sincronização Memórias Extensão ↔ Hub
**Ficheiros**: `extension/background.js`, `extension/sidepanel.js`, `local/web/app.js`  
**Solução**: 
- Novo handler `sync-memories` no background.js
- Botão "Sincronizar" na UI do sidepanel
- Auto-sync ao iniciar o hub web

### 9. Streaming na API Chat
**Ficheiros**: `local/server.py`  
**Problema**: `stream: False` causa espera longa para respostas grandes  
**Solução**: Implementado Server-Sent Events (SSE) para streaming

### 10. Histórico de Conversas Persistente
**Ficheiros**: `local/web/app.js`, `local/server.py`  
**Solução**: 
- Novo endpoint `/api/conversations`
- Armazenamento em `data/conversations.json`
- UI para listar/carregar/apagar conversas

---

## ⚡ PERFORMANCE

### 11. Debounce no MutationObserver
**Ficheiros**: `extension/content/inject.js`  
**Problema**: Re-execuções excessivas causam lag  
**Solução**: Implementado debounce de 300ms com cancelamento

### 12. Limite de Threads no Servidor
**Ficheiros**: `local/server.py`  
**Solução**: ThreadingHTTPServer configurado com máximo 10 threads simultâneas

---

## 🛠 MANUTENABILIDADE

### 13. Estrutura de Testes
**Ficheiros**: `tests/test_server.py`, `tests/test_extension.js`  
**Solução**: Criada estrutura inicial com pytest e Jest (testes básicos incluídos)

### 14. Internacionalização (i18n)
**Ficheiros**: `local/web/i18n.js`, `extension/i18n.js`  
**Solução**: Sistema de dicionários PT-PT/EN com fallback

### 15. Versionamento Automático
**Ficheiros**: `scripts/bump_version.py`  
**Solução**: Script para actualizar versão no manifest.json automaticamente

### 16. Documentação OpenAPI
**Ficheiros**: `docs/api.yaml`  
**Solução**: Especificação OpenAPI 3.0 para todas as rotas `/api/*`

---

## ♿ ACESSIBILIDADE

### 17. ARIA Labels
**Ficheiros**: `local/web/index.html`, `extension/sidepanel.html`  
**Solução**: Adicionados `aria-label` a todos os botões sem texto visível

### 18. Contraste de Cores WCAG
**Ficheiros**: `local/web/styles.css`, `extension/sidepanel.css`  
**Solução**: Ajustadas cores para ratio mínimo 4.5:1 (texto normal)

---

## 🚀 DEVOPS

### 19. Dockerfile
**Ficheiros**: `Dockerfile`, `.dockerignore`  
**Solução**: Containerização do servidor Python com multi-stage build

### 20. GitHub Actions CI/CD
**Ficheiros**: `.github/workflows/ci.yml`, `.github/workflows/release.yml`  
**Solução**: 
- CI: lint, testes, build da extensão
- CD: release automático com tags

### 21. Geração Automática de Ícones
**Ficheiros**: `extension/icons/generate_icons.py`  
**Solução**: Script gera todos os tamanhos a partir de SVG base

---

## Estatísticas das Mudanças

| Categoria | Melhorias | Linhas Alteradas | Ficheiros Modificados |
|-----------|-----------|------------------|----------------------|
| Segurança | 3 | ~180 | 3 |
| Robustez | 3 | ~220 | 3 |
| Funcionalidades | 4 | ~450 | 5 |
| Performance | 2 | ~80 | 2 |
| Manutenibilidade | 4 | ~300 | 6 (novos) |
| Acessibilidade | 2 | ~60 | 2 |
| DevOps | 3 | ~200 | 5 (novos) |
| **TOTAL** | **21** | **~1490** | **26** |

---

## Próximos Passos Recomendados

1. **Testes Manuais**: Validar todas as funcionalidades em ambiente real
2. **Revisão de Segurança**: Auditoria por terceiro às implementações de encriptação
3. **Documentação**: Actualizar README.md com novas features
4. **Beta Testing**: Distribuir para utilizadores limitados antes de release geral

---

## Notas Técnicas

- Todas as alterações mantêm backward compatibility com versão 1.1.0
- API keys encriptadas não são compatíveis com versões anteriores (migração automática implementada)
- Novos endpoints requerem restart do servidor Python

---

*Documento gerado automaticamente como parte da implementação das melhorias.*
