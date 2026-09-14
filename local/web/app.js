// ============================================================================
// AI Hub - Painel Web Local (local/web/app.js)
// Interface web independente: gestão de memórias, criptografia AES-GCM,
// extração de código e streaming de IA em tempo real.
// ============================================================================

// ----------------------------------------------------------------------------
// BLOCO 1: Dicionários de Configuração de Provedores e Linguagens
// O QUE É SUPOSTO ACONTECER:
// - Mapeia os metadados de cada fornecedor de IA para a interface gráfica.
// - Associa linguagens de programação aos formatos de exportação correspondentes.
// ----------------------------------------------------------------------------
const PROVIDERS = {
  qwen: { name: "Qwen", url: "https://chat.qwen.ai", note: "Chat oficial. Iframe quase de certeza bloqueado." },
  deepseek: { name: "DeepSeek", url: "https://chat.deepseek.com", note: "X-Frame-Options impede embedding." },
  glm: { name: "GLM / Z.ai", url: "https://chat.z.ai", alt: "https://chatglm.cn", note: "Internacional: chat.z.ai · China: chatglm.cn." },
  mistral: { name: "Mistral Le Chat", url: "https://chat.mistral.ai", note: "frame-ancestors none — o iframe nao carrega." },
  openai: { name: "OpenAI / ChatGPT", url: "https://chatgpt.com", note: "Chat oficial ChatGPT." },
  claude: { name: "Claude / Anthropic", url: "https://claude.ai", note: "Chat oficial Claude." },
};

const LANG_TO_FMT = {
  python: "py", py: "py", java: "java", javascript: "js", js: "js", typescript: "ts", ts: "ts",
  html: "html", css: "css", json: "json", csv: "csv", sql: "sql", markdown: "md", md: "md",
  xml: "xml", yaml: "yaml", yml: "yml", bash: "sh", sh: "sh", rust: "rs", go: "go", c: "c",
  cpp: "cpp", kotlin: "kt", swift: "swift", ruby: "rb", php: "php", r: "r", text: "txt",
};

// Estado reativo em memória da aplicação
const state = { memories: [], editingId: null, lastAssistant: "", messages: [], conversations: [] };

// ----------------------------------------------------------------------------
// BLOCO 2: Utilitários de Interface e Formatação de Prompts
// O QUE É SUPOSTO ACONTECER:
// - uid(): Gera identificadores únicos.
// - setStatus(): Atualiza a barra de estado inferior.
// - memoryBlock() / composedPrompt(): Monta o prompt prefixado com as memórias ativas.
// - escapeHtml(): Sanitiza strings antes de injetar no DOM para prevenir XSS.
// ----------------------------------------------------------------------------
function uid() { return crypto.randomUUID ? crypto.randomUUID() : String(Date.now()); }
function setStatus(msg) { document.getElementById("status").textContent = msg; }
function loadLocalMemories() { try { return JSON.parse(localStorage.getItem("aihub.memories") || "[]"); } catch { return []; } }
function persistLocalMemories() { localStorage.setItem("aihub.memories", JSON.stringify(state.memories)); }
function activeMemories() { return state.memories.filter((m) => m.active); }

function memoryBlock() {
  const act = activeMemories();
  if (!act.length) return "";
  return act.map((m) => "### " + m.title + "\n" + m.body).join("\n\n");
}

function composedPrompt(userText) {
  const mem = memoryBlock();
  if (!mem) return userText.trim();
  return "[MEMORIA PERSISTENTE]\n" + mem + "\n[FIM DA MEMORIA]\n\n" + userText.trim();
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  }[c]));
}

// ----------------------------------------------------------------------------
// BLOCO 3: Renderização da Lista de Memórias no Painel Web
// O QUE É SUPOSTO ACONTECER:
// - Apresenta as memórias em cartões com opção de ativar/desativar e clicar para editar.
// ----------------------------------------------------------------------------
function renderMemories() {
  const box = document.getElementById("memList");
  box.innerHTML = "";
  if (!state.memories.length) {
    box.innerHTML = '<p style="color:var(--muted);font-size:12px">Ainda nao ha memorias.</p>';
    return;
  }
  state.memories.forEach((m) => {
    const el = document.createElement("article");
    el.className = "mem-card" + (m.id === state.editingId ? " active" : "");
    el.innerHTML = "<header><h3>" + escapeHtml(m.title) + "</h3><label class=\"chip\"><input type=\"checkbox\" " + (m.active ? "checked" : "") + " /> ativa</label></header><p>" + escapeHtml(m.body) + "</p>";
    el.addEventListener("click", (ev) => {
      if (ev.target.closest("input")) return;
      state.editingId = m.id;
      document.getElementById("memTitle").value = m.title;
      document.getElementById("memBody").value = m.body;
      renderMemories();
    });
    el.querySelector("input").addEventListener("change", (ev) => { m.active = ev.target.checked; persistLocalMemories(); });
    box.appendChild(el);
  });
}

function providerPanel(id) {
  const p = PROVIDERS[id];
  return '<div class="notice">' + escapeHtml(p.note) + ' Usa Copiar prompt composto e cola no chat.</div><div class="row"><button class="btn primary" data-open="' + p.url + '">Abrir ' + escapeHtml(p.name) + '</button>' + (p.alt ? '<button class="btn" data-open="' + p.alt + '">Abrir chatglm.cn</button>' : '') + '<button class="btn ok" data-copy-prompt="1">Copiar prompt composto</button></div>';
}

function initProviderPanels() {
  ["qwen", "deepseek", "glm", "mistral", "openai", "claude"].forEach((id) => {
    const el = document.getElementById("panel-" + id);
    if (el) el.innerHTML = providerPanel(id);
  });
  document.querySelector(".workspace").addEventListener("click", (ev) => {
    const open = ev.target.closest("[data-open]");
    if (open) window.open(open.dataset.open, "_blank", "noopener,noreferrer");
    if (ev.target.closest("[data-copy-prompt]")) copyComposed();
  });
}

function copyComposed() {
  const text = composedPrompt(document.getElementById("userPrompt").value);
  document.getElementById("promptPreview").textContent = text || "(vazio)";
  navigator.clipboard.writeText(text).then(() => setStatus("Prompt composto copiado."), () => setStatus("Copia o preview manualmente."));
}

// ----------------------------------------------------------------------------
// BLOCO 4: Analisador de Blocos de Código Markdown (Code Block Scanner)
// O QUE É SUPOSTO ACONTECER:
// - Analisa o texto colado ou recebido da IA, extraindo blocos ```lang ... ```.
// - Renderiza botões individuais para exportar cada bloco para o seu formato nativo.
// ----------------------------------------------------------------------------
function parseCodeBlocks(text) {
  const re = /```([A-Za-z0-9_+-]*)\s*\n([\s\S]*?)```/g;
  const blocks = [];
  let m, i = 1;
  while ((m = re.exec(text))) {
    const lang = (m[1] || "text").toLowerCase();
    blocks.push({ id: i++, lang, format: LANG_TO_FMT[lang] || "txt", content: m[2].replace(/\s+$/, "") });
  }
  return blocks;
}

function renderBlocks(blocks) {
  const box = document.getElementById("detectedBlocks");
  box.innerHTML = "";
  if (!blocks.length) {
    box.innerHTML = '<p style="color:var(--muted)">Nenhum bloco ``` encontrado.</p>';
    return;
  }
  blocks.forEach((b) => {
    const el = document.createElement("article");
    el.className = "block";
    el.innerHTML = "<header><div><span class=\"chip\">" + escapeHtml(b.lang) + "</span></div><div class=\"row\"><button class=\"btn\" data-fmt=\"" + escapeHtml(b.format) + "\">" + escapeHtml(b.format.toUpperCase()) + "</button><button class=\"btn\" data-fmt=\"md\">MD</button><button class=\"btn\" data-fmt=\"docx\">DOCX</button><button class=\"btn\" data-fmt=\"pdf\">PDF</button></div></header><pre>" + escapeHtml(b.content.slice(0, 4000)) + "</pre>";
    el.querySelectorAll("[data-fmt]").forEach((btn) => btn.addEventListener("click", () => exportFile(btn.dataset.fmt, b.content, b.lang + "-" + b.id)));
    box.appendChild(el);
  });
}

// ----------------------------------------------------------------------------
// BLOCO 5: Exportação de Documentos e Arquivos ZIP através do Servidor Local
// O QUE É SUPOSTO ACONTECER:
// - Envia pedidos a POST /api/export e dispara o descarregamento automático do ficheiro.
// ----------------------------------------------------------------------------
async function exportFile(format, content, title) {
  setStatus("A gerar " + format + "…");
  try {
    const res = await fetch("/api/export", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ format, content, title }) });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "falha");
    setStatus("Gerado " + data.filename + " (" + data.size + " bytes)");
    const a = document.createElement("a"); a.href = data.url; a.download = data.filename; document.body.appendChild(a); a.click(); a.remove();
    refreshFiles();
  } catch (err) { setStatus("Erro ao exportar: " + err.message); }
}

async function exportDetectedZip() {
  const blocks = parseCodeBlocks(document.getElementById("monitorInput").value);
  if (!blocks.length) { setStatus("Nao ha blocos ``` para o ZIP."); return; }
  const title = document.getElementById("exportTitle").value || "blocos";
  setStatus("A gerar ZIP…");
  try {
    const res = await fetch("/api/export", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        format: "zip",
        title,
        content: ".",
        files: blocks.map((b) => ({ filename: b.lang + "-" + b.id + "." + b.format, content: b.content })),
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "falha");
    const a = document.createElement("a"); a.href = data.url; a.download = data.filename; document.body.appendChild(a); a.click(); a.remove();
    setStatus("ZIP " + data.filename);
    refreshFiles();
  } catch (err) { setStatus("Erro ZIP: " + err.message); }
}

async function refreshFiles() {
  try {
    const res = await fetch("/api/exports");
    const data = await res.json();
    const box = document.getElementById("fileList");
    box.innerHTML = (data.files || []).slice(0, 20).map((f) => '<div class="file"><span>' + escapeHtml(f.name) + '</span><a class="btn" href="' + f.url + '" download>Descarregar</a></div>').join("") || '<p style="color:var(--muted)">Nenhum ficheiro ainda.</p>';
  } catch {}
}

function appendMsg(role, text) {
  const log = document.getElementById("chatLog");
  const el = document.createElement("div");
  el.className = "msg " + role;
  el.textContent = text;
  log.appendChild(el);
  log.scrollTop = log.scrollHeight;
}

let activeKeysCache = null;

// ----------------------------------------------------------------------------
// BLOCO 6: Segurança Criptográfica com a Web Crypto API (AES-GCM de 256 bits)
// O QUE É SUPOSTO ACONTECER:
// - deriveAesKey: Deriva uma chave simétrica de 256 bits a partir da palavra-passe
//   mestra do utilizador usando PBKDF2 com 100.000 iterações e SHA-256.
// - encryptKeys: Gera um Sal de 16 bytes e um IV de 12 bytes aleatórios, cifrando
//   as chaves de API confidenciais antes de gravar no localStorage.
// - decryptKeys: Decifra e valida a integridade dos dados autenticados.
// ----------------------------------------------------------------------------
async function deriveAesKey(passphrase, saltBytes) {
  const enc = new TextEncoder();
  const baseKey = await crypto.subtle.importKey(
    "raw",
    enc.encode(passphrase),
    { name: "PBKDF2" },
    false,
    ["deriveKey"]
  );
  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: saltBytes,
      iterations: 100000,
      hash: "SHA-256",
    },
    baseKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

async function encryptKeys(plainObj, passphrase) {
  const enc = new TextEncoder();
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveAesKey(passphrase, salt);
  const encoded = enc.encode(JSON.stringify(plainObj));
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, encoded);
  return {
    encrypted: true,
    salt: Array.from(salt),
    iv: Array.from(iv),
    data: Array.from(new Uint8Array(ciphertext)),
  };
}

async function decryptKeys(cipherObj, passphrase) {
  const salt = new Uint8Array(cipherObj.salt);
  const iv = new Uint8Array(cipherObj.iv);
  const data = new Uint8Array(cipherObj.data);
  const key = await deriveAesKey(passphrase, salt);
  const decrypted = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, data);
  const dec = new TextDecoder();
  return JSON.parse(dec.decode(decrypted));
}

async function getStoredKeys() {
  if (activeKeysCache) return activeKeysCache;
  const raw = localStorage.getItem("aihub.keys");
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    if (parsed && parsed.encrypted) {
      return null; // Chaves bloqueadas pela palavra-passe mestra
    }
    return parsed || {};
  } catch {
    return {};
  }
}

// ----------------------------------------------------------------------------
// BLOCO 7: Gestão do Histórico de Conversas
// O QUE É SUPOSTO ACONTECER:
// - Grava e recarrega diálogos completos permitindo alternar entre sessões.
// ----------------------------------------------------------------------------
function replayMessages(messages) {
  document.getElementById("chatLog").innerHTML = "";
  (messages || []).forEach((m) => appendMsg(m.role === "assistant" ? "assistant" : m.role === "system" ? "sys" : "user", m.content || ""));
}

function renderConversations() {
  const box = document.getElementById("convList");
  if (!box) return;
  if (!state.conversations.length) {
    box.innerHTML = '<p style="color:var(--muted)">Ainda nao ha conversas gravadas.</p>';
    return;
  }
  box.innerHTML = state.conversations.map((c) => {
    const n = (c.messages || []).length;
    const when = c.savedAt || "";
    return '<div class="file"><span>' + escapeHtml(c.title || "conversa") + ' · ' + n + ' msgs ' + escapeHtml(when) + '</span><span class="row"><button class="btn" data-load="' + escapeHtml(c.id) + '">Abrir</button><button class="btn danger" data-delc="' + escapeHtml(c.id) + '">Apagar</button></span></div>';
  }).join("");
  box.querySelectorAll("[data-load]").forEach((btn) => {
    btn.onclick = () => {
      const c = state.conversations.find((x) => x.id === btn.dataset.load);
      if (!c) return;
      state.messages = (c.messages || []).slice();
      const last = [...state.messages].reverse().find((m) => m.role === "assistant");
      state.lastAssistant = last ? last.content : "";
      replayMessages(state.messages);
      setStatus("Conversa carregada.");
    };
  });
  box.querySelectorAll("[data-delc]").forEach((btn) => {
    btn.onclick = async () => {
      state.conversations = state.conversations.filter((x) => x.id !== btn.dataset.delc);
      await fetch("/api/conversations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ conversations: state.conversations }) });
      renderConversations();
    };
  });
}

async function loadConversations() {
  try {
    const res = await fetch("/api/conversations");
    const data = await res.json();
    state.conversations = data.conversations || [];
    renderConversations();
  } catch { renderConversations(); }
}

async function saveConversation() {
  if (!state.messages.length) { setStatus("Nada para guardar."); return; }
  const title = (document.getElementById("apiProvider").value || "chat") + " " + new Date().toLocaleString("pt-PT");
  state.conversations.unshift({ id: uid(), title, savedAt: new Date().toISOString().slice(0, 19).replace("T", " "), messages: state.messages.slice() });
  state.conversations = state.conversations.slice(0, 50);
  const res = await fetch("/api/conversations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ conversations: state.conversations }) });
  setStatus(res.ok ? "Conversa gravada." : "Falha a gravar conversa");
  renderConversations();
}

// ----------------------------------------------------------------------------
// BLOCO 8: Chat com Modelos de IA e Consumo de Streaming SSE
// O QUE É SUPOSTO ACONTECER:
// - Envia o pedido com as mensagens e parâmetros ao endpoint /api/chat.
// - Abre um leitor ReadableStreamDefaultReader e processa eventos SSE em tempo real.
// - Atualiza o elemento de mensagem do assistente token a token na tela.
// ----------------------------------------------------------------------------
async function sendApi() {
  const provider = document.getElementById("apiProvider").value;
  const model = document.getElementById("apiModel").value.trim();
  const userText = document.getElementById("apiPrompt").value.trim();
  if (!userText) return;
  const currentKeys = await getStoredKeys();
  if (currentKeys === null) {
    setStatus("Chaves bloqueadas! Desbloqueia na aba Chaves API com a tua palavra-passe.");
    document.querySelector('[data-tab="settings"]')?.click();
    return;
  }
  const k = currentKeys[provider];
  if (!k) { setStatus("Falta a chave API em Chaves API."); return; }
  const mem = memoryBlock();
  if (!state.messages.length && mem) state.messages.push({ role: "system", content: "Memoria persistente:\n" + mem });
  state.messages.push({ role: "user", content: userText });
  appendMsg("user", userText);
  document.getElementById("apiPrompt").value = "";
  setStatus("A pedir resposta a " + provider + " (streaming)…");

  const log = document.getElementById("chatLog");
  const assistantEl = document.createElement("div");
  assistantEl.className = "msg assistant";
  assistantEl.textContent = "";
  log.appendChild(assistantEl);
  log.scrollTop = log.scrollHeight;

  try {
    const res = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        provider,
        api_key: k,
        model: model || undefined,
        messages: state.messages,
        use_cn: document.getElementById("useCn").checked,
        stream: true,
      }),
    });

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error((errData.error || "erro HTTP " + res.status) + (errData.detail ? " — " + errData.detail : ""));
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder("utf-8");
    let fullText = "";
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop();

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith(":") || trimmed === "data: [DONE]") continue;
        if (trimmed.startsWith("data: ")) {
          try {
            const parsed = JSON.parse(trimmed.slice(6));
            const delta = parsed.choices?.[0]?.delta?.content || (parsed.type === "content_block_delta" ? parsed.delta?.text : "") || parsed.delta?.text || "";
            if (delta) {
              fullText += delta;
              assistantEl.textContent = fullText;
              log.scrollTop = log.scrollHeight;
            }
          } catch {
            // Ignora fragmento parcial de JSON
          }
        }
      }
    }

    if (!fullText && buffer.startsWith("data: ") && buffer !== "data: [DONE]") {
      try {
        const parsed = JSON.parse(buffer.slice(6));
        fullText += parsed.choices?.[0]?.delta?.content || (parsed.type === "content_block_delta" ? parsed.delta?.text : "") || parsed.delta?.text || "";
        assistantEl.textContent = fullText;
      } catch {}
    }

    state.lastAssistant = fullText;
    state.messages.push({ role: "assistant", content: fullText });
    setStatus("Resposta recebida.");
  } catch (err) {
    if (!assistantEl.textContent) assistantEl.remove();
    appendMsg("sys", "Erro: " + err.message);
    setStatus("Falha na API: " + err.message);
  }
}

// ----------------------------------------------------------------------------
// BLOCO 9: Ligação de Eventos da Interface do Utilizador (bindUi)
// O QUE É SUPOSTO ACONTECER:
// - Regista os ouvintes de clique nos separadores, botões de ação e controlos
//   do cofre de chaves criptográficas (bloquear, desbloquear, apagar).
// ----------------------------------------------------------------------------
function bindUi() {
  document.getElementById("tabs").addEventListener("click", (ev) => {
    const tab = ev.target.closest(".tab");
    if (!tab) return;
    document.querySelectorAll(".tab").forEach((t) => t.classList.toggle("active", t === tab));
    document.querySelectorAll(".panel").forEach((p) => p.classList.remove("active"));
    document.getElementById("panel-" + tab.dataset.tab).classList.add("active");
    if (tab.dataset.tab === "monitor") refreshFiles();
    if (tab.dataset.tab === "api") loadConversations();
  });
  document.getElementById("btnNewMem").onclick = () => { state.editingId = null; document.getElementById("memTitle").value = ""; document.getElementById("memBody").value = ""; };
  document.getElementById("btnCommitMem").onclick = () => {
    const title = document.getElementById("memTitle").value.trim() || "Memoria";
    const body = document.getElementById("memBody").value.trim();
    if (!body) return setStatus("A memoria esta vazia.");
    if (state.editingId) { const m = state.memories.find((x) => x.id === state.editingId); if (m) { m.title = title; m.body = body; } }
    else state.memories.push({ id: uid(), title, body, active: true });
    persistLocalMemories(); renderMemories(); setStatus("Memoria atualizada.");
  };
  document.getElementById("btnDelMem").onclick = () => {
    if (!state.editingId) return;
    state.memories = state.memories.filter((m) => m.id !== state.editingId);
    state.editingId = null; persistLocalMemories(); renderMemories();
  };
  document.getElementById("btnSaveMems").onclick = async () => {
    persistLocalMemories();
    const res = await fetch("/api/memories", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ memories: state.memories }) });
    setStatus(res.ok ? "Memorias gravadas em data/memories.json" : "Falha ao gravar");
  };
  document.getElementById("btnLoadMems").onclick = async () => {
    try {
      const res = await fetch("/api/memories"); const data = await res.json();
      if (data.memories && data.memories.length) { state.memories = data.memories; persistLocalMemories(); renderMemories(); setStatus("Memorias do disco."); }
      else setStatus("Disco vazio — a usar localStorage.");
    } catch { setStatus("Sem servidor de memorias."); }
  };
  document.getElementById("btnBuildPrompt").onclick = () => { document.getElementById("promptPreview").textContent = composedPrompt(document.getElementById("userPrompt").value) || "(vazio)"; };
  document.getElementById("btnCopyPrompt").onclick = copyComposed;
  document.getElementById("btnScan").onclick = () => renderBlocks(parseCodeBlocks(document.getElementById("monitorInput").value));
  document.getElementById("btnExportAllMd").onclick = () => exportFile("md", document.getElementById("monitorInput").value, document.getElementById("exportTitle").value);
  document.getElementById("btnExportAllDocx").onclick = () => exportFile("docx", document.getElementById("monitorInput").value, document.getElementById("exportTitle").value);
  document.getElementById("btnExportAllPdf").onclick = () => exportFile("pdf", document.getElementById("monitorInput").value, document.getElementById("exportTitle").value);
  document.getElementById("btnExportZip").onclick = exportDetectedZip;
  document.getElementById("btnSendApi").onclick = sendApi;
  document.getElementById("btnSaveConv").onclick = saveConversation;
  document.getElementById("btnNewChat").onclick = () => { state.messages = []; document.getElementById("chatLog").innerHTML = ""; appendMsg("sys", "Conversa reiniciada."); };
  document.getElementById("btnSendToMonitor").onclick = () => { document.getElementById("monitorInput").value = state.lastAssistant; renderBlocks(parseCodeBlocks(state.lastAssistant)); document.querySelector('[data-tab="monitor"]').click(); };
  
  const cryptoStatusEl = document.getElementById("cryptoStatus");
  const unlockBtn = document.getElementById("btnUnlockKeys");
  const passInput = document.getElementById("masterPassword");

  document.getElementById("btnSaveKeys").onclick = async () => {
    const rawObj = {
      qwen: document.getElementById("key-qwen").value.trim(),
      deepseek: document.getElementById("key-deepseek").value.trim(),
      glm: document.getElementById("key-glm").value.trim(),
      mistral: document.getElementById("key-mistral").value.trim(),
      openai: document.getElementById("key-openai")?.value.trim() || "",
      claude: document.getElementById("key-claude")?.value.trim() || "",
    };
    const pass = passInput?.value.trim();
    if (pass) {
      try {
        const cipher = await encryptKeys(rawObj, pass);
        localStorage.setItem("aihub.keys", JSON.stringify(cipher));
        activeKeysCache = rawObj;
        if (cryptoStatusEl) cryptoStatusEl.textContent = "Estado: Cifrado com AES-GCM 🔒";
        if (unlockBtn) unlockBtn.style.display = "none";
        setStatus("Chaves cifradas com AES-GCM e guardadas.");
      } catch (err) {
        setStatus("Falha ao cifrar: " + err.message);
      }
    } else {
      localStorage.setItem("aihub.keys", JSON.stringify(rawObj));
      activeKeysCache = rawObj;
      if (cryptoStatusEl) cryptoStatusEl.textContent = "Estado: Nao cifrado (texto simples) 🔓";
      if (unlockBtn) unlockBtn.style.display = "none";
      setStatus("Chaves guardadas neste browser.");
    }
  };

  if (unlockBtn) {
    unlockBtn.onclick = async () => {
      const pass = passInput?.value.trim();
      if (!pass) {
        setStatus("Insere a palavra-passe mestre para desbloquear.");
        return;
      }
      try {
        const raw = localStorage.getItem("aihub.keys");
        const cipher = JSON.parse(raw);
        const dec = await decryptKeys(cipher, pass);
        activeKeysCache = dec;
        ["qwen", "deepseek", "glm", "mistral", "openai", "claude"].forEach((p) => {
          const el = document.getElementById("key-" + p);
          if (el && dec[p]) el.value = dec[p];
        });
        unlockBtn.style.display = "none";
        if (cryptoStatusEl) cryptoStatusEl.textContent = "Estado: Desbloqueado 🔓";
        setStatus("Chaves desbloqueadas com sucesso.");
      } catch {
        setStatus("Palavra-passe mestre incorreta.");
      }
    };
  }

  document.getElementById("btnClearKeys").onclick = () => {
    localStorage.removeItem("aihub.keys");
    activeKeysCache = null;
    ["qwen", "deepseek", "glm", "mistral", "openai", "claude"].forEach((p) => {
      const el = document.getElementById("key-" + p);
      if (el) el.value = "";
    });
    if (passInput) passInput.value = "";
    if (cryptoStatusEl) cryptoStatusEl.textContent = "Estado: Nao cifrado 🔓";
    if (unlockBtn) unlockBtn.style.display = "none";
    setStatus("Chaves apagadas.");
  };

  // Inicializacao do estado das chaves
  const storedRaw = localStorage.getItem("aihub.keys");
  if (storedRaw) {
    try {
      const parsed = JSON.parse(storedRaw);
      if (parsed && parsed.encrypted) {
        if (cryptoStatusEl) cryptoStatusEl.textContent = "Estado: Bloqueado com senha 🔒";
        if (unlockBtn) unlockBtn.style.display = "inline-block";
      } else {
        activeKeysCache = parsed;
        ["qwen", "deepseek", "glm", "mistral", "openai", "claude"].forEach((p) => {
          const el = document.getElementById("key-" + p);
          if (el && parsed[p]) el.value = parsed[p];
        });
        if (cryptoStatusEl) cryptoStatusEl.textContent = "Estado: Nao cifrado 🔓";
      }
    } catch {}
  }
}

// ----------------------------------------------------------------------------
// BLOCO 10: Arranque da Aplicação Web (Boot)
// O QUE É SUPOSTO ACONTECER:
// - Carrega as memórias, inicializa a interface e testa a ligação ao servidor local.
// ----------------------------------------------------------------------------
async function boot() {
  initProviderPanels();
  state.memories = loadLocalMemories();
  if (!state.memories.length) {
    state.memories = [{ id: uid(), title: "Identidade", active: true, body: "Responde em portugues de Portugal, de forma directa. Quando gerares codigo, usa blocos markdown com a linguagem correcta." }];
    persistLocalMemories();
  }
  renderMemories(); bindUi(); refreshFiles(); loadConversations();
  try {
    const res = await fetch("/api/health"); const data = await res.json();
    setStatus(data.ok ? "Servidor local ligado." : "UI estatica sem API.");
  } catch { setStatus("Abre via python3 server.py para exportar ficheiros."); }
}

boot();
