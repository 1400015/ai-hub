(() => {
  const site = aihubCurrentSite();
  if (!site) return;

  const LANG_EXT = {
    python: "py", py: "py", java: "java", javascript: "js", js: "js",
    typescript: "ts", ts: "ts", html: "html", css: "css", json: "json",
    csv: "csv", sql: "sql", markdown: "md", md: "md", xml: "xml",
    yaml: "yaml", yml: "yml", bash: "sh", sh: "sh", shell: "sh",
    rust: "rs", go: "go", c: "c", cpp: "cpp", kotlin: "kt",
    swift: "swift", ruby: "rb", php: "php", r: "r", text: "txt",
  };

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

    // Substituicao moderna sem execCommand (deprecated) - usa Selection/Range API
    try {
      const selection = window.getSelection();
      const range = document.createRange();
      range.selectNodeContents(el);
      selection.removeAllRanges();
      selection.addRange(range);
      document.execCommand("insertText", false, next);
      return true;
    } catch (_) {}
    
    // Fallback para textContent
    el.textContent = next;
    el.dispatchEvent(new InputEvent("input", { bubbles: true, data: next }));
    return true;
  }

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

  function parseFences(text) {
    const re = /```([A-Za-z0-9_+-]*)\s*\n([\s\S]*?)```/g;
    const out = [];
    let m;
    while ((m = re.exec(text))) {
      out.push({ lang: (m[1] || "text").toLowerCase(), content: m[2].replace(/\s+$/, "") });
    }
    return out;
  }

  function sendMsg(payload) {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage(payload, (res) => resolve(res || { ok: false, error: chrome.runtime.lastError?.message }));
    });
  }

  function downloadText(filename, content, mime) {
    return sendMsg({ type: "download", filename, content, mime: mime || "text/plain" });
  }

  async function exportViaHub(format, content, title) {
    const res = await sendMsg({ type: "hub-export", format, content, title });
    if (res && res.ok) return res;
    const ext = (LANG_EXT[format] || format || "txt").replace(/^\./, "");
    if (["docx", "xlsx", "xls", "pdf"].includes(format)) {
      throw new Error(res?.error || "Hub local offline. Corre python3 server.py");
    }
    await downloadText(stamp(title || site.id, ext), content);
    return { ok: true, fallback: true };
  }

  function stamp(name, ext) {
    const t = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
    return name + "-" + t + "." + ext;
  }

  function harvestAssistantText() {
    const blocks = [...document.querySelectorAll("pre, .markdown, .md-code, [class*='markdown']")];
    const texts = blocks.map((b) => b.innerText || "").filter((t) => t.trim().length > 20);
    if (texts.length) return texts.slice(-6).join("\n\n");
    const articles = [...document.querySelectorAll("[class*='message'], [class*='assistant'], article")];
    return articles.map((a) => a.innerText || "").filter((t) => t.length > 40).slice(-3).join("\n\n");
  }

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
          await exportViaHub("md", raw, site.id + "-resposta");
          toast("Sem blocos code — gravei Markdown no hub/browser.");
          return;
        }
        for (let i = 0; i < fences.length; i++) {
          const f = fences[i];
          const ext = LANG_EXT[f.lang] || "txt";
          await exportViaHub(ext, f.content, site.id + "-" + f.lang + "-" + (i + 1));
        }
        toast(fences.length + " bloco(s) enviados ao hub local.");
        return;
      }
      if (kind === "html") {
        const html = "<!doctype html><meta charset=\"utf-8\"><title>" + site.name + "</title><pre>" + escapeHtml(raw) + "</pre>";
        await exportViaHub("html", html, site.id + "-chat");
      } else {
        await exportViaHub(kind, raw, site.id + "-chat");
      }
      toast("Exportado via hub local (ou download se o hub estiver offline).");
    } catch (err) {
      toast(err.message || "Falha ao exportar");
    }
  }

  function escapeHtml(s) {
    return s.replace(/[&<>]/g, (c) => ({ "&": "&", "<": "<", ">": ">" }[c]));
  }

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

  function buildDock() {
    if (document.getElementById("aihub-dock")) return;
    const dock = document.createElement("div");
    dock.id = "aihub-dock";
    dock.innerHTML = '<div class="aihub-head"><strong>AI Hub \u00b7 ' + site.name + '</strong><button type="button" id="aihub-min">–</button></div><div class="aihub-body"><p class="aihub-hint" id="aihub-hub-status">A procurar hub local…</p><div class="aihub-row"><button type="button" data-act="prepend">Inserir memoria</button><button type="button" data-act="replace">Substituir campo</button></div><div class="aihub-row"><button type="button" data-act="scan">Codigo → ficheiros</button><button type="button" data-act="md">Chat → MD</button></div><div class="aihub-row"><button type="button" data-act="docx">Chat → DOCX</button><button type="button" data-act="pdf">Chat → PDF</button></div><div class="aihub-row"><button type="button" data-act="xlsx">Chat → XLSX</button><button type="button" data-act="html">Chat → HTML</button></div><div class="aihub-row"><button type="button" data-act="panel">Painel</button></div></div>';
    document.documentElement.appendChild(dock);
    dock.querySelector("#aihub-min").addEventListener("click", () => dock.classList.toggle("min"));
    dock.addEventListener("click", async (ev) => {
      const act = ev.target.closest("[data-act]")?.dataset.act;
      if (!act) return;
      if (act === "prepend") await injectMemory("append");
      if (act === "replace") await injectMemory("replace");
      if (act === "scan") exportHarvest("scan");
      if (act === "md") exportHarvest("md");
      if (act === "html") exportHarvest("html");
      if (act === "docx") exportHarvest("docx");
      if (act === "pdf") exportHarvest("pdf");
      if (act === "xlsx") exportHarvest("xlsx");
      if (act === "panel") chrome.runtime.sendMessage({ type: "open-sidepanel" });
    });
    sendMsg({ type: "hub-health" }).then((res) => {
      const el = document.getElementById("aihub-hub-status");
      if (!el) return;
      el.textContent = res.ok
        ? "Hub local ligado — DOCX/PDF/XLSX gravam em exports/."
        : "Hub offline. Corre python3 local/server.py para Office.";
    });
  }

  chrome.runtime.onMessage.addListener((msg, _s, sendResponse) => {
    if (msg?.type === "inject") {
      injectMemory(msg.mode || "append", msg.text || "").then(() => sendResponse({ ok: true }));
      return true;
    }
    if (msg?.type === "export") {
      exportHarvest(msg.kind || "scan");
      sendResponse({ ok: true });
    }
    if (msg?.type === "ping") sendResponse({ ok: true, site: site.id });
  });

  buildDock();
  markCodeBlocks();
  
  // Debounce no MutationObserver (performance) - evita re-execucoes excessivas
  let debounceTimer = null;
  const mo = new MutationObserver(() => {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => markCodeBlocks(), 300);
  });
  mo.observe(document.documentElement, { childList: true, subtree: true });
})();
