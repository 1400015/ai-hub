// ============================================================================
// AI Hub Content Script - Injector & Interação com a Página
// Injeta a barra de ferramentas (Dock), atalhos de exportação e suporte a memórias.
// ============================================================================
(() => {
  // --------------------------------------------------------------------------
  // BLOCO 1: Proteção contra Dupla Injeção e Identificação do Site Atual
  // O QUE É SUPOSTO ACONTECER:
  // - Impede que o script seja injetado e executado múltiplas vezes no mesmo separador.
  // - Determina qual é o chat ativo (Qwen, DeepSeek, GLM, Mistral) através de sites.js.
  // - Se o domínio atual não for um chat suportado, interrompe a execução de imediato.
  // --------------------------------------------------------------------------
  if (window.__aihubInjected) return;
  window.__aihubInjected = true;

  const site = typeof aihubCurrentSite === "function" ? aihubCurrentSite() : null;
  if (!site) return;

  // --------------------------------------------------------------------------
  // BLOCO 2: Dicionário de Mapeamento de Linguagens para Extensões de Ficheiro
  // O QUE É SUPOSTO ACONTECER:
  // - Mapeia os identificadores de sintaxe de blocos markdown (ex: ```python)
  //   para a respetiva extensão física de ficheiro (.py, .js, .html, etc.).
  // --------------------------------------------------------------------------
  const LANG_EXT = {
    python: "py", py: "py", java: "java", javascript: "js", js: "js",
    typescript: "ts", ts: "ts", html: "html", css: "css", json: "json",
    csv: "csv", sql: "sql", markdown: "md", md: "md", xml: "xml",
    yaml: "yaml", yml: "yml", bash: "sh", sh: "sh", shell: "sh",
    rust: "rs", go: "go", c: "c", cpp: "cpp", kotlin: "kt",
    swift: "swift", ruby: "rb", php: "php", r: "r", text: "txt",
  };

  // --------------------------------------------------------------------------
  // BLOCO 3: Deteção de Visibilidade e Localização de Elementos no DOM
  // O QUE É SUPOSTO ACONTECER:
  // - visible(el): Confirma se o elemento tem dimensões reais e não está oculto por CSS.
  // - findFirst(selectors): Percorre a lista de seletores do site e devolve o último nó visível.
  // - findComposer(): Encontra a caixa de texto onde o utilizador escreve mensagens.
  // --------------------------------------------------------------------------
  function visible(el) {
    if (!el) return false;
    const r = el.getBoundingClientRect();
    const st = getComputedStyle(el);
    return r.width > 40 && r.height > 16 && st.visibility !== "hidden" && st.display !== "none";
  }

  function findFirst(selectors) {
    for (const sel of selectors) {
      const nodes = [...document.querySelectorAll(sel)].filter(visible);
      if (nodes.length) return nodes[nodes.length - 1];
    }
    return null;
  }

  function findComposer() {
    return findFirst(site.composers) || findFirst(["textarea", '[contenteditable="true"]']);
  }

  // --------------------------------------------------------------------------
  // BLOCO 4: Injeção de Texto em Inputs Controlados (React / Vue / Next.js)
  // O QUE É SUPOSTO ACONTECER:
  // - Contorna os wrappers virtuais de frameworks SPA invocando o setter nativo
  //   no protótipo HTMLTextAreaElement ou HTMLInputElement.
  // - Dispara eventos "input" e "change" com bubbles=true para que o React atualize
  //   o seu estado interno e o texto não desapareça ao submeter o formulário.
  // - Fornece suporte de fallback a campos contenteditable (usados em chats modernos).
  // --------------------------------------------------------------------------
  function setComposerText(el, text, mode) {
    if (!el) return false;
    el.focus();
    const current =
      el instanceof HTMLTextAreaElement || el instanceof HTMLInputElement
        ? el.value
        : el.innerText || el.textContent || "";
    const next = mode === "replace" ? text : current ? current + "\n\n" + text : text;

    if (el instanceof HTMLTextAreaElement || el instanceof HTMLInputElement) {
      const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      const desc = Object.getOwnPropertyDescriptor(proto, "value");
      if (desc && desc.set) desc.set.call(el, next);
      else el.value = next;
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
      el.style.height = "auto";
      el.style.height = Math.min(el.scrollHeight, 320) + "px";
      return true;
    }

    try {
      el.textContent = next;
      el.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: next }));
      el.dispatchEvent(new Event("input", { bubbles: true }));
      return true;
    } catch (_) {}

    try {
      const selection = window.getSelection();
      const range = document.createRange();
      range.selectNodeContents(el);
      selection.removeAllRanges();
      selection.addRange(range);
      if (document.execCommand) document.execCommand("insertText", false, next);
    } catch (_) {}
    return true;
  }

  // --------------------------------------------------------------------------
  // BLOCO 5: Gestão e Carregamento de Memórias Persistentes
  // O QUE É SUPOSTO ACONTECER:
  // - memoryBlock: Formata as memórias ativas num bloco de prompt estruturado.
  // - loadMemories: Lê assincronamente as memórias gravadas em chrome.storage.local.
  // --------------------------------------------------------------------------
  function memoryBlock(memories) {
    const act = (memories || []).filter((m) => m.active);
    if (!act.length) return "";
    return (
      "[MEMORIA PERSISTENTE]\n" +
      act.map((m) => "### " + m.title + "\n" + m.body).join("\n\n") +
      "\n[FIM DA MEMORIA]\n\n"
    );
  }

  function loadMemories() {
    return new Promise((resolve) => {
      chrome.storage.local.get({ memories: [] }, (data) => resolve(data.memories || []));
    });
  }

  // --------------------------------------------------------------------------
  // BLOCO 6: Utilitários de Extração de Código e Timestamp
  // O QUE É SUPOSTO ACONTECER:
  // - parseFences: Deteta blocos delimitados por ```linguagem ... ``` no texto da IA.
  // - stamp: Gera nomes de ficheiro únicos com carimbo temporal ISO legível.
  // --------------------------------------------------------------------------
  function parseFences(text) {
    const re = /```([A-Za-z0-9_+-]*)\s*\n([\s\S]*?)```/g;
    const out = [];
    let m;
    while ((m = re.exec(text))) {
      out.push({ lang: (m[1] || "text").toLowerCase(), content: m[2].replace(/\s+$/, "") });
    }
    return out;
  }

  function stamp(name, ext) {
    const t = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
    return name + "-" + t + "." + ext;
  }

  // --------------------------------------------------------------------------
  // BLOCO 7: Mensagens IPC com o Background Service Worker
  // O QUE É SUPOSTO ACONTECER:
  // - sendMsg: Envia uma mensagem via chrome.runtime.sendMessage encapsulada numa Promise.
  // - downloadText: Solicita ao service worker para descarregar texto puro via API downloads.
  // --------------------------------------------------------------------------
  function sendMsg(payload) {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage(payload, (res) => resolve(res || { ok: false, error: chrome.runtime.lastError?.message }));
    });
  }

  function downloadText(filename, content, mime) {
    return sendMsg({ type: "download", filename, content, mime: mime || "text/plain" });
  }

  // --------------------------------------------------------------------------
  // BLOCO 8: Exportação Nativa no Cliente (Zero-Install)
  // O QUE É SUPOSTO ACONTECER:
  // - Utiliza window.AIHubExporter para gerar DOCX, XLSX, PDF ou ZIP localmente.
  // - Se o formato for texto plano (md, js, py, html), descarrega diretamente.
  // - Garante que a exportação funciona mesmo sem o servidor Python estar a correr.
  // --------------------------------------------------------------------------
  async function exportFileNative(format, content, title) {
    const baseTitle = title || site.name + " Resposta";
    const ext = (LANG_EXT[format] || format || "txt").replace(/^\./, "");
    const filename = stamp(site.id + "-" + ext, ext);

    if (window.AIHubExporter) {
      if (format === "docx") {
        const blob = window.AIHubExporter.generateDocx(baseTitle, content);
        window.AIHubExporter.triggerDownload(blob, filename);
        return { ok: true, clientSide: true };
      }
      if (format === "xlsx" || format === "xls") {
        const blob = window.AIHubExporter.generateXlsx(baseTitle, content);
        window.AIHubExporter.triggerDownload(blob, filename);
        return { ok: true, clientSide: true };
      }
      if (format === "pdf") {
        const blob = window.AIHubExporter.generatePdf(baseTitle, content);
        window.AIHubExporter.triggerDownload(blob, filename);
        return { ok: true, clientSide: true };
      }
      if (format === "zip") {
        const blob = window.AIHubExporter.generateZip(content);
        window.AIHubExporter.triggerDownload(blob, filename);
        return { ok: true, clientSide: true };
      }
    }

    // Fallback para formatos textuais simples
    await downloadText(filename, content);
    return { ok: true, clientSide: true };
  }

  // --------------------------------------------------------------------------
  // BLOCO 9: Recolha de Texto Recente da Resposta da IA (Harvest)
  // O QUE É SUPOSTO ACONTECER:
  // - Inspeciona o DOM procurando as mensagens do assistente ou blocos de código.
  // - Concatena o texto das mensagens mais recentes para preparar a exportação.
  // --------------------------------------------------------------------------
  function harvestAssistantText() {
    const blocks = [...document.querySelectorAll("pre, .markdown, .md-code, [class*='markdown']")];
    const texts = blocks.map((b) => b.innerText || "").filter((t) => t.trim().length > 20);
    if (texts.length) return texts.slice(-6).join("\n\n");
    const articles = [...document.querySelectorAll("[class*='message'], [class*='assistant'], article")];
    return articles.map((a) => a.innerText || "").filter((t) => t.length > 40).slice(-3).join("\n\n");
  }

  // --------------------------------------------------------------------------
  // BLOCO 10: Exportação Híbrida (Tenta Nativo, Faz Fallback ao Hub)
  // O QUE É SUPOSTO ACONTECER:
  // - Chamado quando o utilizador clica em "guardar" num bloco de código específico.
  // - Se o gerador nativo estiver ativo, descarrega diretamente pelo browser.
  // - Caso contrário, tenta guardar via servidor local Python.
  // --------------------------------------------------------------------------
  async function exportViaHub(format, content, title) {
    const ext = (LANG_EXT[format] || format || "txt").replace(/^\./, "");
    if (window.AIHubExporter) {
      try {
        return await exportFileNative(format, content, title);
      } catch (_) {}
    }
    const res = await sendMsg({ type: "hub-export", format, content, title });
    if (res && res.ok) return res;
    await downloadText(stamp(title || site.id, ext), content);
    return { ok: true, fallback: true };
  }

  // --------------------------------------------------------------------------
  // BLOCO 11: Exportação Coletiva da Conversa (Harvest Export)
  // O QUE É SUPOSTO ACONTECER:
  // - Se kind === "scan": Extrai todos os blocos de código da conversa e,
  //   se houver múltiplos, empacota-os num único ficheiro ZIP descarregável.
  // - Se kind === "docx"|"pdf"|"xlsx"|"html"|"md": Gera o documento correspondente.
  // --------------------------------------------------------------------------
  async function exportHarvest(kind) {
    const raw = harvestAssistantText();
    if (!raw.trim()) {
      toast("Nao encontrei texto recente para exportar.");
      return;
    }
    try {
      if (kind === "scan") {
        const fences = parseFences(raw);
        if (!fences.length) {
          await exportFileNative("md", raw, site.name + " Resposta");
          toast("Sem blocos de codigo — descarregado Markdown.");
          return;
        }
        if (fences.length > 1 && window.AIHubExporter) {
          const files = fences.map((f, i) => ({
            name: site.id + "-" + (f.lang || "code") + "-" + (i + 1) + "." + (LANG_EXT[f.lang] || "txt"),
            content: f.content,
          }));
          const zipBlob = window.AIHubExporter.generateZip(files);
          window.AIHubExporter.triggerDownload(zipBlob, stamp(site.id + "-codigo", "zip"));
          toast("Pacote ZIP gerado com " + fences.length + " ficheiros!");
          return;
        }
        for (let i = 0; i < fences.length; i++) {
          const f = fences[i];
          const ext = LANG_EXT[f.lang] || "txt";
          await exportFileNative(ext, f.content, site.id + "-" + f.lang + "-" + (i + 1));
        }
        toast(fences.length + " ficheiro(s) descarregados!");
        return;
      }
      if (kind === "html") {
        const html = "<!doctype html><meta charset=\"utf-8\"><title>" + site.name + "</title><pre>" + escapeHtml(raw) + "</pre>";
        await exportFileNative("html", html, site.name + " Chat");
      } else {
        await exportFileNative(kind, raw, site.name + " Chat");
      }
      toast("Ficheiro " + kind.toUpperCase() + " descarregado com sucesso!");
    } catch (err) {
      toast(err.message || "Falha ao exportar");
    }
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

  // --------------------------------------------------------------------------
  // BLOCO 12: Notificações Flutuantes Visuais (Toast)
  // O QUE É SUPOSTO ACONTECER:
  // - Cria dinamicamente um elemento de notificação no canto da página.
  // - Apresenta mensagens de sucesso ou aviso ao utilizador que desaparecem após 2.4s.
  // --------------------------------------------------------------------------
  function toast(msg) {
    let el = document.getElementById("aihub-toast");
    if (!el) {
      el = document.createElement("div");
      el.id = "aihub-toast";
      document.body.appendChild(el);
    }
    el.textContent = msg;
    el.classList.add("show");
    setTimeout(() => el.classList.remove("show"), 2400);
  }

  // --------------------------------------------------------------------------
  // BLOCO 13: Anotação Automática de Blocos de Código (<pre><code>)
  // O QUE É SUPOSTO ACONTECER:
  // - Localiza blocos de código renderizados na página.
  // - Injeta um botão "guardar" no canto superior direito de cada bloco de código.
  // - Ao clicar, descarrega diretamente o ficheiro com a extensão correta (.js, .py, etc.).
  // --------------------------------------------------------------------------
  function markCodeBlocks() {
    document.querySelectorAll("pre").forEach((pre) => {
      if (pre.dataset.aihubBtn) return;
      if (!visible(pre) || (pre.innerText || "").length < 8) return;
      pre.dataset.aihubBtn = "1";
      const btn = document.createElement("button");
      btn.className = "aihub-dl";
      btn.type = "button";
      btn.textContent = "guardar";
      btn.addEventListener("click", async (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        const code = pre.querySelector("code");
        const cls = (code && code.className) || "";
        const lang = (cls.match(/language-([a-z0-9+_-]+)/i) || [])[1] || "txt";
        const ext = LANG_EXT[lang.toLowerCase()] || "txt";
        try {
          const res = await exportViaHub(ext, (code || pre).innerText, site.id + "-" + lang);
          toast(res.fallback ? "Hub offline — download no browser (" + ext + ")" : "Guardado no hub: " + ext);
        } catch (err) {
          toast(err.message || "Falha ao guardar");
        }
      });
      pre.style.position = pre.style.position || "relative";
      pre.appendChild(btn);
    });
  }

  // --------------------------------------------------------------------------
  // BLOCO 14: Injeção de Memória na Caixa de Texto Ativa
  // O QUE É SUPOSTO ACONTECER:
  // - Carrega as memórias ativas e coloca-as no início da caixa de texto do chat.
  // --------------------------------------------------------------------------
  async function injectMemory(mode, extra) {
    const memories = await loadMemories();
    const block = memoryBlock(memories);
    const composer = findComposer();
    if (!composer) {
      toast("Nao encontrei a caixa de texto. A UI pode ter mudado.");
      return;
    }
    const user = extra || "";
    const text = (block + user).trim();
    if (!text) {
      toast("Nao ha memorias activas nem texto.");
      return;
    }
    setComposerText(composer, text, mode);
    toast(mode === "replace" ? "Memoria colocada no campo." : "Memoria acrescentada.");
  }

  // --------------------------------------------------------------------------
  // BLOCO 15: Construção do Dock Flutuante nos Chats Web
  // O QUE É SUPOSTO ACONTECER:
  // - Injeta um widget flutuante no documento com botões rápidos:
  //     * Inserir memória / Substituir campo
  //     * Exportações: Código -> ZIP, Chat -> MD / DOCX / PDF / XLSX / HTML
  //     * Painel lateral e botão direto "📁 Ficheiros"
  // - Consulta o estado de saúde do hub local e atualiza o indicador de status.
  // --------------------------------------------------------------------------
  function buildDock() {
    if (document.getElementById("aihub-dock")) return;
    const dock = document.createElement("div");
    dock.id = "aihub-dock";
    dock.innerHTML = '<div class="aihub-head"><strong>AI Hub \u00b7 ' + site.name + '</strong><button type="button" id="aihub-min">–</button></div><div class="aihub-body"><p class="aihub-hint" id="aihub-hub-status">A procurar hub local…</p><div class="aihub-row"><button type="button" data-act="prepend">Inserir memoria</button><button type="button" data-act="replace">Substituir campo</button></div><div class="aihub-row"><button type="button" data-act="scan">Codigo → ficheiros</button><button type="button" data-act="md">Chat → MD</button></div><div class="aihub-row"><button type="button" data-act="docx">Chat → DOCX</button><button type="button" data-act="pdf">Chat → PDF</button></div><div class="aihub-row"><button type="button" data-act="xlsx">Chat → XLSX</button><button type="button" data-act="html">Chat → HTML</button></div><div class="aihub-row"><button type="button" data-act="panel">Painel</button><button type="button" data-act="files">📁 Ficheiros</button></div></div>';
    document.documentElement.appendChild(dock);
    dock.querySelector("#aihub-min").addEventListener("click", () => dock.classList.toggle("min"));
    dock.addEventListener("click", async (ev) => {
      const act = ev.target.closest("[data-act]")?.dataset.act;
      if (!act) return;
      if (act === "prepend") await injectMemory("append");
      if (act === "replace") await injectMemory("replace");
      if (act === "scan") await exportHarvest("scan");
      if (act === "md") await exportHarvest("md");
      if (act === "html") await exportHarvest("html");
      if (act === "docx") await exportHarvest("docx");
      if (act === "pdf") await exportHarvest("pdf");
      if (act === "xlsx") await exportHarvest("xlsx");
      if (act === "panel") chrome.runtime.sendMessage({ type: "open-sidepanel" });
      if (act === "files") {
        await chrome.storage.local.set({ targetView: "files" });
        chrome.runtime.sendMessage({ type: "open-sidepanel" });
      }
    });
    sendMsg({ type: "hub-health" }).then((res) => {
      const el = document.getElementById("aihub-hub-status");
      if (!el) return;
      el.textContent = res.ok
        ? "AI Hub Autónomo (Hub local conectado)."
        : "AI Hub Autónomo — DOCX/PDF/XLSX/ZIP gerados diretamente no browser!";
    });
  }

  // --------------------------------------------------------------------------
  // BLOCO 16: Receptor de Mensagens Enviadas pelo Popup ou Painel Lateral
  // O QUE É SUPOSTO ACONTECER:
  // - Escuta ordens externas como "inject" (inserir memória), "export" e "ping".
  // --------------------------------------------------------------------------
  chrome.runtime.onMessage.addListener((msg, _s, sendResponse) => {
    if (msg?.type === "inject") {
      injectMemory(msg.mode || "append", msg.text || "").then(() => {
        if (msg.submit && site.send) {
          setTimeout(() => {
            const btn = findFirst(site.send);
            if (btn) btn.click();
          }, 350);
        }
        sendResponse({ ok: true });
      });
      return true;
    }
    if (msg?.type === "export") {
      exportHarvest(msg.kind || "scan")
        .then(() => sendResponse({ ok: true }))
        .catch((err) => sendResponse({ ok: false, error: err.message }));
      return true;
    }
    if (msg?.type === "ping") {
      sendResponse({ ok: true, site: site.id });
      return true;
    }
  });

  // --------------------------------------------------------------------------
  // BLOCO 17: Inicialização e Monitorização Contínua de Mutações (Debounced)
  // O QUE É SUPOSTO ACONTECER:
  // - Monta a interface flutuante (dock) no chat.
  // - Anota os blocos de código já presentes.
  // - Configura um MutationObserver com debounce de 300ms para monitorizar novas
  //   mensagens recebidas via streaming de IA sem sobrecarregar a thread do browser.
  // --------------------------------------------------------------------------
  buildDock();
  markCodeBlocks();
  let debounceTimer = null;
  const mo = new MutationObserver(() => {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => markCodeBlocks(), 300);
  });
  mo.observe(document.documentElement, { childList: true, subtree: true });
})();
