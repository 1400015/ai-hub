const PROVIDERS = {
  qwen: { name: "Qwen", url: "https://chat.qwen.ai", note: "Chat oficial. Iframe quase de certeza bloqueado." },
  deepseek: { name: "DeepSeek", url: "https://chat.deepseek.com", note: "X-Frame-Options impede embedding." },
  glm: { name: "GLM / Z.ai", url: "https://chat.z.ai", alt: "https://chatglm.cn", note: "Internacional: chat.z.ai · China: chatglm.cn." },
  mistral: { name: "Mistral Le Chat", url: "https://chat.mistral.ai", note: "frame-ancestors none — o iframe nao carrega." },
};
const LANG_TO_FMT = {
  python: "py", py: "py", java: "java", javascript: "js", js: "js", typescript: "ts", ts: "ts",
  html: "html", css: "css", json: "json", csv: "csv", sql: "sql", markdown: "md", md: "md",
  xml: "xml", yaml: "yaml", yml: "yml", bash: "sh", sh: "sh", rust: "rs", go: "go", c: "c",
  cpp: "cpp", kotlin: "kt", swift: "swift", ruby: "rb", php: "php", r: "r", text: "txt",
};
const state = { memories: [], editingId: null, lastAssistant: "", messages: [] };

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
  return String(s).replaceAll("&", "&").replaceAll("<", "<").replaceAll(">", ">").replaceAll('"', """);
}

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
    el.innerHTML = "<header><h3>" + escapeHtml(m.title) + "</h3><label class=\"chip\"><input type=\"checkbox\" " + (m.active ? "checked" : "") + " data-id=\"" + m.id + "\" /> ativa</label></header><p>" + escapeHtml(m.body) + "</p>";
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
  ["qwen", "deepseek", "glm", "mistral"].forEach((id) => { document.getElementById("panel-" + id).innerHTML = providerPanel(id); });
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
function keys() { try { return JSON.parse(localStorage.getItem("aihub.keys") || "{}"); } catch { return {}; } }

async function sendApi() {
  const provider = document.getElementById("apiProvider").value;
  const model = document.getElementById("apiModel").value.trim();
  const userText = document.getElementById("apiPrompt").value.trim();
  if (!userText) return;
  const k = keys()[provider];
  if (!k) { setStatus("Falta a chave API em Chaves API."); return; }
  const mem = memoryBlock();
  if (!state.messages.length && mem) state.messages.push({ role: "system", content: "Memoria persistente:\n" + mem });
  state.messages.push({ role: "user", content: userText });
  appendMsg("user", userText);
  document.getElementById("apiPrompt").value = "";
  setStatus("A pedir resposta a " + provider + "…");
  try {
    const res = await fetch("/api/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ provider, api_key: k, model: model || undefined, messages: state.messages, use_cn: document.getElementById("useCn").checked }) });
    const data = await res.json();
    if (!res.ok) throw new Error((data.error || "erro") + (data.detail ? " — " + data.detail : ""));
    state.lastAssistant = data.text || "";
    state.messages.push({ role: "assistant", content: state.lastAssistant });
    appendMsg("assistant", state.lastAssistant);
    setStatus("Resposta recebida.");
  } catch (err) { appendMsg("sys", "Erro: " + err.message); setStatus("Falha na API: " + err.message); }
}

function bindUi() {
  document.getElementById("tabs").addEventListener("click", (ev) => {
    const tab = ev.target.closest(".tab");
    if (!tab) return;
    document.querySelectorAll(".tab").forEach((t) => t.classList.toggle("active", t === tab));
    document.querySelectorAll(".panel").forEach((p) => p.classList.remove("active"));
    document.getElementById("panel-" + tab.dataset.tab).classList.add("active");
    if (tab.dataset.tab === "monitor") refreshFiles();
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
  document.getElementById("btnSendApi").onclick = sendApi;
  document.getElementById("btnNewChat").onclick = () => { state.messages = []; document.getElementById("chatLog").innerHTML = ""; appendMsg("sys", "Conversa reiniciada."); };
  document.getElementById("btnSendToMonitor").onclick = () => { document.getElementById("monitorInput").value = state.lastAssistant; renderBlocks(parseCodeBlocks(state.lastAssistant)); document.querySelector('[data-tab="monitor"]').click(); };
  document.getElementById("btnSaveKeys").onclick = () => {
    localStorage.setItem("aihub.keys", JSON.stringify({ qwen: document.getElementById("key-qwen").value.trim(), deepseek: document.getElementById("key-deepseek").value.trim(), glm: document.getElementById("key-glm").value.trim(), mistral: document.getElementById("key-mistral").value.trim() }));
    setStatus("Chaves guardadas neste browser.");
  };
  document.getElementById("btnClearKeys").onclick = () => { localStorage.removeItem("aihub.keys"); ["qwen","deepseek","glm","mistral"].forEach((p) => document.getElementById("key-" + p).value = ""); setStatus("Chaves apagadas."); };
  const stored = keys();
  ["qwen","deepseek","glm","mistral"].forEach((p) => { if (stored[p]) document.getElementById("key-" + p).value = stored[p]; });
}

async function boot() {
  initProviderPanels();
  state.memories = loadLocalMemories();
  if (!state.memories.length) {
    state.memories = [{ id: uid(), title: "Identidade", active: true, body: "Responde em portugues de Portugal, de forma directa. Quando gerares codigo, usa blocos markdown com a linguagem correcta." }];
    persistLocalMemories();
  }
  renderMemories(); bindUi(); refreshFiles();
  try {
    const res = await fetch("/api/health"); const data = await res.json();
    setStatus(data.ok ? "Servidor local ligado." : "UI estatica sem API.");
  } catch { setStatus("Abre via python3 server.py para exportar ficheiros."); }
}
boot();
