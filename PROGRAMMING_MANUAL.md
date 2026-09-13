# Manual de Programação e Arquitetura de Software — AI Hub

> **Guia Pedagógico de Desenvolvimento e Referência Técnica**  
> Este manual explica em profundidade a estrutura, o porquê de cada decisão técnica e o funcionamento linha a linha dos principais módulos de código do ecossistema **AI Hub**.

---

## 📑 Índice Geral

1. [Visão Global e Arquitetura do Sistema](#1-visão-global-e-arquitetura-do-sistema)
2. [Estrutura do Repositório e Responsabilidade dos Ficheiros](#2-estrutura-do-repositório-e-responsabilidade-dos-ficheiros)
3. [A Extensão Chrome (Manifest V3)](#3-a-extensão-chrome-manifest-v3)
   - 3.1. [O Manifesto: `manifest.json`](#31-o-manifesto-manifestjson)
   - 3.2. [Contornar Bloqueios de Iframe: `rules.json`](#32-contornar-bloqueios-de-iframe-rulesjson)
   - 3.3. [Geração Nativa de Documentos: `lib/exporter.js`](#33-geração-nativa-de-documentos-libexporterjs)
   - 3.4. [Injeção e Manipulação de DOM: `content/inject.js` e `content/sites.js`](#34-injeção-e-manipulação-de-dom-contentinjectjs-e-contentsitesjs)
   - 3.5. [Service Worker Assíncrono e Chamadas de IA: `background.js`](#35-service-worker-assíncrono-e-chamadas-de-ia-backgroundjs)
   - 3.6. [Interface do Utilizador: `popup.js` e `sidepanel.js`](#36-interface-do-utilizador-popupjs-e-sidepaneljs)
4. [O Servidor Local Python (`local/server.py`)](#4-o-servidor-local-python-localserverpy)
   - 4.1. [Segurança e Prevenção de Path Traversal](#41-segurança-e-prevenção-de-path-traversal)
   - 4.2. [Streaming de Respostas de IA via Server-Sent Events (SSE)](#42-streaming-de-respostas-de-ia-via-server-sent-events-sse)
5. [A Interface Web Local e Criptografia (`local/web/app.js`)](#5-a-interface-web-local-e-criptografia-localwebappjs)
   - 5.1. [Encriptação AES-GCM de 256 bits com PBKDF2](#51-encriptação-aes-gcm-de-256-bits-com-pbkdf2)
   - 5.2. [Consumo Progressivo de Streams no Browser](#52-consumo-progressivo-de-streams-no-browser)
6. [Automação de Build, Testes e Qualidade](#6-automação-de-build-testes-e-qualidade)
   - 6.1. [Suite de Testes com Pytest (`tests/test_server.py`)](#61-suite-de-testes-com-pytest-teststest_serverpy)
   - 6.2. [Empacotamento Limpo para Distribuição (`scripts/package_extension.py`)](#62-empacotamento-limpo-para-distribuição-scriptspackage_extensionpy)

---

## 1. Visão Global e Arquitetura do Sistema

O **AI Hub** resolve dois grandes desafios no trabalho com múltiplos Modelos de Linguagem (Qwen, DeepSeek, GLM, Mistral):
1. **Fragmentação de Contexto**: Cada chat oficial é uma ilha; o utilizador perde contexto e memória entre plataformas.
2. **Exportação e Autonomia**: Os chats oficiais não oferecem exportação nativa direta para formatos corporativos (DOCX, XLSX, PDF) nem agrupamento de código em pacotes ZIP.

### Arquitetura em Duas Camadas Híbridas:

```text
               +-------------------------------------------------------------+
               |                       GOOGLE CHROME                         |
               |                                                             |
               |   [Separadores Web: chat.deepseek.com, chat.qwen.ai, etc.]  |
               |        ^                                                    |
               |        | Injeção de DOM (Overlay, Deteção de Inputs, Botoes)|
               |        v                                                    |
               |   [Content Script: inject.js + sites.js]                    |
               |        ^               ^                                    |
               |        |               | Gera DOCX/PDF/XLSX/ZIP (Sem Python)|
               |        |               +---> [lib/exporter.js]              |
               |        v                                                    |
               |   [Service Worker: background.js] <--> [sidepanel / popup]  |
               |        |                                                    |
               |        +-------------------+ (Sem CORS via host_perms)      |
               |                            |                                |
               +----------------------------|--------------------------------+
                                            |
                      (Opcional: HTTP / SSE)| (APIs de IA Diretas)
                                            v
               +----------------------------+       +------------------------+
               |  Servidor Local (Python)   |       | Fornecedores Externos  |
               |  http://127.0.0.1:8765     |       | (DeepSeek, DashScope,  |
               |  - Persistência em disco   |       |  GLM, Mistral APIs)    |
               |  - Web UI com AES-GCM      |       +------------------------+
               +----------------------------+
```

* **Modo Autónomo (Zero-Install)**: A extensão realiza 100% da exportação documental (DOCX, XLSX, PDF, ZIP) e chamadas de API de IA no próprio browser. Não obriga a ter Python nem módulos externos instalados.
* **Modo Híbrido**: Se o servidor `server.py` estiver em execução, a extensão sincroniza memórias locais com o disco rígido e disponibiliza um painel web centralizado.

---

## 2. Estrutura do Repositório e Responsabilidade dos Ficheiros

```text
ai-hub/
├── extension/                       # CÓDIGO DA EXTENSÃO CHROME (MANIFEST V3)
│   ├── manifest.json                # Metadados, permissões, scripts e endpoints
│   ├── background.js                # Service worker: comunicações e chamadas de rede
│   ├── rules.json                   # Regras de rede para permitir iframes
│   ├── popup.html / popup.js        # Menu rápido de ação na barra do navegador
│   ├── sidepanel.html / sidepanel.js# Painel lateral: memórias, ficheiros e chats
│   ├── sidepanel.css                # Estilos do painel lateral (Dark Theme)
│   ├── lib/
│   │   └── exporter.js              # Gerador binário nativo DOCX/XLSX/PDF/ZIP (Pure JS)
│   ├── content/
│   │   ├── sites.js                 # Dicionário de seletores DOM por plataforma
│   │   ├── inject.js                # Injetor no DOM do chat (Dock, botões, atalhos)
│   │   └── overlay.css              # Estilos do dock flutuante e botões de código
│   └── icons/                       # Ícones PNG obrigatórios (16, 32, 48, 128 px)
│
├── local/                           # SERVIDOR COMPLEMENTAR E WEB UI LOCAL
│   ├── server.py                    # Servidor HTTP/SSE Python sem dependências pesadas
│   ├── data/                        # Persistência JSON de memórias e histórico
│   ├── exports/                     # Pasta de ficheiros exportados em disco
│   └── web/                         # Painel web executado em http://127.0.0.1:8765
│       ├── index.html / styles.css  # Interface de gestão e chat direto
│       └── app.js                   # Lógica web, Web Crypto (AES-GCM) e SSE parser
│
├── scripts/
│   ├── package_extension.py         # Empacotador e validador do arquivo ZIP para release
│   └── bump_version.py              # Utilitário semver para versionamento
│
├── tests/
│   └── test_server.py               # Suite de 22 testes unitários e de integridade
│
├── dist/                            # Arquivos ZIP finais prontos para redistribuição
└── .github/workflows/               # Pipelines de Integração Contínua (CI/CD)
```

---

## 3. A Extensão Chrome (Manifest V3)

### 3.1. O Manifesto: `manifest.json`

O `manifest.json` é o contrato entre a extensão e o motor Chromium.

```json
{
  "manifest_version": 3,
  "name": "AI Hub Memória",
  "version": "1.2.0",
  "minimum_chrome_version": "114",
  "permissions": [
    "storage",
    "sidePanel",
    "scripting",
    "activeTab",
    "tabs",
    "downloads",
    "declarativeNetRequestWithHostAccess"
  ],
  "host_permissions": [
    "https://chat.deepseek.com/*",
    "https://api.deepseek.com/*",
    ...
  ]
}
```

#### **Porquê cada linha existe:**
1. **`"manifest_version": 3`**: Obrigatório no ecossistema moderno. Substituiu os background pages persistentes (do V2) por Service Workers efêmeros que poupam memória RAM.
2. **`"minimum_chrome_version": "114"`**: A API nativa `chrome.sidePanel` só foi lançada na versão 114 do Chrome. Sem esta diretiva, navegadores antigos instalariam a extensão e falhariam silenciosamente.
3. **Divisão entre `permissions` e `host_permissions`**: No MV3, o Chrome exige a separação clara entre permissões de APIs internas do navegador (`storage`, `tabs`, `sidePanel`) e permissões de acesso a servidores web externos (`host_permissions`).
4. **`"declarativeNetRequestWithHostAccess"`**: Permite que a extensão altere cabeçalhos HTTP de sites específicos sem ter de intercetar todos os pacotes de rede do utilizador.

---

### 3.2. Contornar Bloqueios de Iframe: `rules.json`

Muitos sites de IA proíbem ser exibidos dentro de `<iframe>` (como no painel lateral) através do cabeçalho `X-Frame-Options: DENY` ou `Content-Security-Policy: frame-ancestors 'self'`.

O `rules.json` resolve este problema de forma declarativa e segura:

```json
[
  {
    "id": 1,
    "priority": 1,
    "action": {
      "type": "modifyHeaders",
      "responseHeaders": [
        { "header": "x-frame-options", "operation": "remove" },
        { "header": "content-security-policy", "operation": "remove" }
      ]
    },
    "condition": {
      "urlFilter": "||chat.deepseek.com",
      "resourceTypes": ["sub_frame"]
    }
  }
]
```

#### **Porquê este design:**
* Em vez de remover cabeçalhos de segurança de todos os sites que o utilizador visita, a condição restringe-se estritamente ao tipo `"sub_frame"` e aos domínios autorizados. A navegação principal na janela normal do browser permanece totalmente segura e intocada.

---

### 3.3. Geração Nativa de Documentos: `lib/exporter.js`

Este ficheiro elimina a dependência do Python (`python-docx`, `openpyxl`, `reportlab`), gerando binários conformes diretamente na memória do browser.

#### A. O Algoritmo de Empacotamento ZIP em Pure JavaScript
Ficheiros `.docx` e `.xlsx` são na realidade ficheiros `.zip` contendo pastas com esquemas XML. Para os criar sem nenhuma biblioteca externa, implementou-se um empacotador binário baseado na especificação **PKWARE**:

```javascript
// Cálculo de CRC-32 via tabela estática pré-calculada
const crcTable = new Uint32Array(256);
for (let i = 0; i < 256; i++) {
  let c = i;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  crcTable[i] = c;
}

function crc32(buf) {
  let crc = -1;
  for (let i = 0; i < buf.length; i++) {
    crc = (crc >>> 8) ^ crcTable[(crc ^ buf[i]) & 0xff];
  }
  return (crc ^ -1) >>> 0;
}
```

* **Porquê a tabela estática?** O cálculo bit a bit de CRC-32 é caro computacionalmente. A tabela de 256 valores reduz a complexidade para uma simples operação de lookup em array por cada byte (`O(N)`).

Para cada ficheiro inserido no ZIP, são escritos três blocos binários:
1. **Local File Header (Assinatura `0x04034b50`)**: Armazena tamanho, data DOS e nome do ficheiro.
2. **Central Directory Header (Assinatura `0x02014b50`)**: O índice geral posicionado no final do ficheiro.
3. **End of Central Directory Record (Assinatura `0x06054b50`)**: Aponta para o offset do índice e total de ficheiros.

```javascript
// Método de compressão 0 (Store - Sem compressão adicional)
lv.setUint16(8, 0, true); // Permite gerar DOCX/XLSX instantaneamente
```
* **Porquê Method 0 (Store)?** O Microsoft Office, Google Docs e LibreOffice suportam perfeitamente contentores OpenXML sem compressão interna. Ao usar o método 0, evitam-se 500 linhas de algoritmo DEFLATE/Huffman, obtendo velocidade máxima de geração.

#### B. Construção de DOCX (Word OpenXML)
Um documento Word mínimo e válido requer:
* `[Content_Types].xml`: Declara que tipo MIME cada ficheiro dentro do ZIP possui.
* `_rels/.rels`: Ligações raiz do documento.
* `word/document.xml`: O texto propriamente dito.

```javascript
// Escapar caracteres XML para evitar quebra de parsing no Word
function xmlEscape(str) {
  return String(str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
```

#### C. Construção de PDF 1.4 Canónico
O gerador de PDF cria um fluxo binário puro com tabela de índices cruzados (`xref`):

```javascript
// Operadores gráficos de texto no PDF
stream += "/F2 18 Tf\n"; // Seleciona Fonte Helvetica-Bold, tamanho 18pt
stream += margin + " " + y + " Td\n"; // Move o cursor para as coordenadas (X, Y)
stream += "(" + pdfEscape(title) + ") Tj\n"; // Desenha o texto
```
* **Porquê o cálculo manual de linhas e tabela xref?** O formato PDF exige que a tabela final `xref` contenha os offsets em bytes exatos (formatados a 10 dígitos com zeros à esquerda) de cada objeto `obj`. Se um único byte estiver desfasado, o Acrobat Reader ou o Chrome PDF Viewer rejeitam o ficheiro como corrompido.

---

### 3.4. Injeção e Manipulação de DOM: `content/inject.js` e `content/sites.js`

Os chats modernos (como ChatGPT, DeepSeek, Qwen) são aplicações SPA complexas construídas em **React**, **Vue** ou **Next.js**.

#### O Desafio dos Inputs Controlados do React:
Se tentarmos fazer `textarea.value = "novo texto"`, o React não toma conhecimento da alteração porque monitoriza o estado interno do componente virtual. Quando o utilizador clica em enviar, o texto desaparece!

#### A Solução no `inject.js`:
```javascript
function setComposerText(el, text, mode) {
  el.focus();
  const current = el.value || "";
  const next = mode === "replace" ? text : current + "\n\n" + text;

  // Invoca o setter nativo do protótipo HTMLInputElement / HTMLTextAreaElement
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  const desc = Object.getOwnPropertyDescriptor(proto, "value");
  if (desc && desc.set) {
    desc.set.call(el, next);
  } else {
    el.value = next;
  }

  // Dispara eventos simulando digitação humana real
  el.dispatchEvent(new Event("input", { bubbles: true }));
  el.dispatchEvent(new Event("change", { bubbles: true }));
}
```
* **Porquê esta técnica?** Ao invocar diretamente o descritor de propriedade nativo (`Object.getOwnPropertyDescriptor`), contornamos o wrapper sintético do React e forçamos o dispatcher de eventos a atualizar o estado interno do framework.

#### Extração Debounced de Código via `MutationObserver`:
```javascript
let debounceTimer = null;
const mo = new MutationObserver(() => {
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => markCodeBlocks(), 300);
});
mo.observe(document.documentElement, { childList: true, subtree: true });
```
* **Porquê o Debounce de 300ms?** Enquanto a IA está a responder em streaming, o DOM emite dezenas de mutações por segundo. Processar blocos de código a cada micro-mutação causaria congelamentos de interface (*jank*). O temporizador de debounce aguarda 300ms de calma antes de aplicar os botões de download aos blocos `<pre><code>`.

---

### 3.5. Service Worker Assíncrono e Chamadas de IA: `background.js`

No Manifest V3, o ficheiro de background não é uma página persistente. Ele "adormece" após ~30 segundos de inatividade para poupar energia e memória.

```javascript
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.type === "direct-chat") {
    handleDirectChat(msg.payload)
      .then((res) => sendResponse(res))
      .catch((err) => sendResponse({ ok: false, error: err.message }));
    return true; // CRÍTICO: Mantém o canal aberto para resposta assíncrona!
  }
});
```

#### **Regra de Ouro do MV3: `return true;`**
Se uma função dentro de `onMessage` realiza uma operação assíncrona (`async`/`await`, `fetch`), é **obrigatório** retornar `true` de forma síncrona. Sem isto, o canal de comunicação do Chrome fecha-se de imediato e o remetente recebe `undefined`.

---

### 3.6. Interface do Utilizador: `popup.js` e `sidepanel.js`

Para alternar perfeitamente entre o menu rápido e o painel lateral sem recarregar páginas:

```javascript
// popup.js: Solicita a abertura do painel lateral já focado na aba 'files'
document.getElementById("viewFiles").onclick = async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab?.windowId != null) {
    await chrome.storage.local.set({ targetView: "files" });
    await chrome.sidePanel.open({ windowId: tab.windowId });
  }
  window.close();
};
```

* **Porquê passar o estado via `chrome.storage.local`?** A API `chrome.sidePanel.open` apenas recebe o `windowId`. Para instruir o painel sobre qual separador abrir, gravamos a chave temporária `targetView` que o script `sidepanel.js` consome e apaga ao inicializar.

---

## 4. O Servidor Local Python (`local/server.py`)

O servidor local foi desenhado para ser ultra-leve, utilizando a biblioteca nativa `http.server` de Python, sem exigir a instalação de dependências pesadas.

### 4.1. Segurança e Prevenção de Path Traversal

Servidores locais que servem ficheiros através de parâmetros de URL estão vulneráveis a ataques onde utilizadores maliciosos ou scripts injetados tentam aceder a ficheiros confidenciais do sistema (ex: `../../Windows/System32/drivers/etc/hosts`).

```python
def safe_filename(name: str) -> str:
    """Sanitiza o nome para evitar Directory Traversal e caracteres ilegais."""
    clean = re.sub(r'[/\\?%*:|"<>\x00-\x1f]', "_", unquote(name))
    clean = re.sub(r"\.\.+", "_", clean).strip(" ._")
    return clean[:120] or "export"
```

No manipulador de downloads de `server.py`:
```python
# 1. Decodificar caracteres URL (%2e%2e%2f)
raw_name = unquote(self.path[len("/downloads/"):])
clean_name = safe_filename(raw_name)

# 2. Resolução canónica do caminho
target = (EXPORTS / clean_name).resolve()

# 3. Verificação matemática de pertença ao diretório sandbox
try:
    target.relative_to(EXPORTS.resolve())
except ValueError:
    self.send_error(403, "Acesso proibido: Caminho fora da diretoria permitida")
    return
```
* **Porquê `target.relative_to()`?** Comparações de texto simples com `.startswith()` podem ser contornadas por atalhos e links simbólicos (*symlinks*). O método `.resolve()` converte o caminho para a sua forma canónica absoluta no sistema de ficheiros; se o caminho resultante não estiver dentro da pasta de exportações, a função `relative_to` lança um `ValueError`, bloqueando o ataque matematicamente.

---

### 4.2. Streaming de Respostas de IA via Server-Sent Events (SSE)

Para permitir que a UI receba a resposta da IA palavra a palavra em tempo real, implementou-se o protocolo **SSE** nativo em HTTP 1.1:

```python
self.send_response(200)
self.send_header("Content-Type", "text/event-stream; charset=utf-8")
self.send_header("Cache-Control", "no-cache")
self.send_header("Connection", "keep-alive")
self.end_headers()

# Iteração sobre a resposta externa do fornecedor
for chunk in upstream_response.iter_lines():
    if chunk:
        self.wfile.write(chunk + b"\n\n")
        self.wfile.flush() # CRÍTICO: Esvazia o buffer de socket imediatamente
```
* **Porquê `self.wfile.flush()`?** Por padrão, os sockets de rede acumulam pacotes até atingirem o tamanho do buffer de transmissão (normalmente 4 KB a 8 KB). Sem o `flush()`, o utilizador esperaria vários segundos e veria todo o texto aparecer em blocos gigantes, destruindo a experiência de streaming em tempo real.

---

## 5. A Interface Web Local e Criptografia (`local/web/app.js`)

### 5.1. Encriptação AES-GCM de 256 bits com PBKDF2

Guardar chaves de API confidenciais (DeepSeek, DashScope, Mistral) em texto simples no `localStorage` do browser é uma vulnerabilidade grave, pois qualquer script ou extensão invasora poderia lê-las.

O AI Hub protege as chaves usando a **Web Crypto API** nativa dos browsers:

```javascript
// 1. Derivação da Chave Criptográfica a partir da Senha Mestra
async function deriveKey(password, salt) {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    enc.encode(password),
    "PBKDF2",
    false,
    ["deriveKey"]
  );

  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: salt,
      iterations: 100000, // 100.000 voltas contra ataques de força bruta
      hash: "SHA-256",
    },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}
```

```javascript
// 2. Cifragem com Vetor de Inicialização (IV) Único
async function encryptSecret(plainText, masterPassword) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12)); // IV recomendado para AES-GCM
  const key = await deriveKey(masterPassword, salt);

  const cipherBuffer = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: iv },
    key,
    new TextEncoder().encode(plainText)
  );

  // Retorna pacote auto-suficiente serializado em Base64
  return JSON.stringify({
    salt: bufToBase64(salt),
    iv: bufToBase64(iv),
    data: bufToBase64(cipherBuffer)
  });
}
```

#### **Porquê esta arquitetura de segurança:**
1. **PBKDF2 com 100.000 iterações**: Torna computacionalmente proibitivo tentar quebrar a palavra-passe do utilizador através de tabelas de arco-íris (*rainbow tables*) ou GPUs.
2. **AES-GCM (Galois/Counter Mode)**: Não é apenas um algoritmo de encriptação; é uma cifra com **autenticação integrada** (*Authenticated Encryption*). Se um único bit do ficheiro for manipulado, o algoritmo recusa-se a decifrar, prevenindo ataques de alteração de conteúdo.

---

### 5.2. Consumo Progressivo de Streams no Browser

No `app.js`, o cliente consome o fluxo de dados em tempo real utilizando as Streams modernas do JavaScript:

```javascript
const response = await fetch("/api/chat", { ... });
const reader = response.body.getReader();
const decoder = new TextDecoder("utf-8");

while (true) {
  const { done, value } = await reader.read();
  if (done) break;

  const chunk = decoder.decode(value, { stream: true });
  // Processamento linha a linha dos eventos "data: ..."
  parseSSEChunk(chunk);
}
```

---

## 6. Automação de Build, Testes e Qualidade

### 6.1. Suite de Testes com Pytest (`tests/test_server.py`)

A integridade do projeto é garantida por 22 testes automatizados divididos em camadas:

1. **Sanitização de Nomes e Entradas**: Validação de caracteres nulos, símbolos de escape e limites de tamanho.
2. **Isolamento Canónico de Pastas**: Testes de penetração simulando tentativas de evasão da pasta `exports/`.
3. **Integridade de Ficheiros do Manifesto**: Varre o `manifest.json` e verifica se todos os ficheiros declarados existem fisicamente no disco e possuem tamanho superior a 0 bytes.
4. **Validação de Empacotamento**: Constrói o arquivo ZIP em tempo de execução numa diretoria temporária (`tmp_path`) e valida que a descompactação não deixa ficheiros corrompidos.

Para correr todos os testes:
```bash
python -m pytest tests/test_server.py -v
```

---

### 6.2. Empacotamento Limpo para Distribuição (`scripts/package_extension.py`)

O Chrome Web Store e a instalação corporativa rejeitam arquivos `.zip` que contenham:
* Ficheiros ou pastas iniciados por `.` (ex: `.git`, `.gitignore`, `.DS_Store`).
* Pastas internas do Chrome iniciadas por `_` (como `_metadata/`, criada quando se testa extensões em modo unpacked).
* Ficheiros de teste ou de compilação em Python.

O script `package_extension.py` implementa um filtro com árvore canónica:

```python
EXCLUDE_PATTERNS = {
    "_metadata",
    "__pycache__",
    ".git",
    "generate_icons.py",
    "README.md",
}

def should_include(rel_path: Path) -> bool:
    for p in rel_path.parts:
        if p in EXCLUDE_PATTERNS or p.startswith("."):
            return False
        if p.endswith(".py"):
            return False
    return True
```

O resultado é um pacote ultra-leve (~21 KB) com garantia de que o ficheiro `manifest.json` se encontra na raiz exata do arquivo comprimido, pronto a ser instalado ou submetido à Google.

---

## 🏁 Conclusão e Resumo de Princípios de Engenharia

O projeto **AI Hub** demonstra a aplicação prática de padrões de engenharia modernos:
1. **Resiliência e Desacoplamento**: A extensão não depende de conectividade local para as suas funções nucleares (geração de documentos e chat).
2. **Defesa em Profundidade**: Múltiplas barreiras de segurança (sanitização de inputs, isolamento canónico no backend, criptografia com AES-GCM no frontend e CSP restritiva no manifesto).
3. **Zero-Dependencies no Core**: Documentos gerados com tipos binários padronizados (`Uint8Array`, DataView, XML e streams PDF) garantem que a extensão continuará a funcionar durante anos sem quebras por dependências depreciadas.
