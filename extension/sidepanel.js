// ============================================================================
// AI Hub - Painel Lateral (sidepanel.js)
// Gere a interface multitarefa do painel lateral: Memórias, Chats, Envio,
// Ficheiros criados e Definições de ligação ao hub local.
// ============================================================================

// ----------------------------------------------------------------------------
// BLOCO 1: Alvos Oficiais Suportados para Envio Rápido
// O QUE É SUPOSTO ACONTECER:
// - Mapeia os sites oficiais para onde a extensão pode enviar prompts com
//   memórias injetadas com um simples clique.
// ----------------------------------------------------------------------------
const TARGETS = [
  { id: "qwen", name: "Qwen", url: "https://chat.qwen.ai/" },
  { id: "deepseek", name: "DeepSeek", url: "https://chat.deepseek.com/" },
  { id: "glm", name: "GLM / Z.ai", url: "https://chat.z.ai/" },
  { id: "glm-cn", name: "Zhipu", url: "https://chatglm.cn/" },
  { id: "mistral", name: "Mistral", url: "https://chat.mistral.ai/" },
];

// ----------------------------------------------------------------------------
// BLOCO 2: Utilitários de ID, Armazenamento Local e Sanitização HTML
// O QUE É SUPOSTO ACONTECER:
// - uid(): Gera identificadores únicos universais (UUIDv4) para novas memórias.
// - getMemories() / setMemories(): Interface assíncrona com chrome.storage.local.
// - compose(user): Prefixa o texto do utilizador com o bloco das memórias ativas.
// - escapeHtml(s): Previne ataques XSS ao renderizar títulos e corpos no DOM.
// - formatBytes(bytes): Converte tamanhos de ficheiro em unidades legíveis (KB, MB).
// ----------------------------------------------------------------------------
function uid() {
  return crypto.randomUUID ? crypto.randomUUID() : String(Date.now());
}

function getMemories() {
  return new Promise((resolve) => {
    chrome.storage.local.get({ memories: [] }, (d) => resolve(d.memories || []));
  });
}

function setMemories(memories) {
  return new Promise((resolve) => chrome.storage.local.set({ memories }, resolve));
}

function compose(user) {
  return getMemories().then((mems) => {
    const act = mems.filter((m) => m.active);
    if (!act.length) return user.trim();
    return (
      "[MEMORIA PERSISTENTE]\n" +
      act.map((m) => "### " + m.title + "\n" + m.body).join("\n\n") +
      "\n[FIM DA MEMORIA]\n\n" +
      user.trim()
    );
  });
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

function setHubStatus(text) {
  const el = document.getElementById("hubStatus");
  if (el) el.textContent = text;
}

function syncWithHub() {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ type: "sync-memories" }, (res) => resolve(res || { ok: false, error: chrome.runtime.lastError?.message }));
  });
}

function formatBytes(bytes) {
  if (!bytes || bytes <= 0) return "0 B";
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / (1024 * 1024)).toFixed(1) + " MB";
}

// ----------------------------------------------------------------------------
// BLOCO 3: Renderização da Lista de Memórias no Painel
// O QUE É SUPOSTO ACONTECER:
// - Constrói cartões interativos para cada memória registada.
// - Permite ativar/desativar memórias via checkbox sem recarregar a interface.
// - Permite editar título e corpo ou apagar memórias existentes.
// ----------------------------------------------------------------------------
async function renderList() {
  const list = document.getElementById("list");
  const memories = await getMemories();
  list.innerHTML = "";
  if (!memories.length) {
    list.innerHTML = '<p class="note">Ainda nao ha memorias.</p>';
    return;
  }
  memories.forEach((m) => {
    const el = document.createElement("article");
    el.className = "card";
    el.innerHTML =
      "<h3>" +
      escapeHtml(m.title) +
      "</h3><p>" +
      escapeHtml(m.body) +
      "</p><div class=\"row\"><label class=\"chk\"><input type=\"checkbox\" " +
      (m.active ? "checked" : "") +
      " /> activa</label><button data-edit>Editar</button><button class=\"danger\" data-del>Apagar</button></div>";
    el.querySelector("input").onchange = async (ev) => {
      m.active = ev.target.checked;
      const all = await getMemories();
      await setMemories(all.map((x) => (x.id === m.id ? m : x)));
    };
    el.querySelector("[data-edit]").onclick = () => {
      document.getElementById("title").value = m.title;
      document.getElementById("body").value = m.body;
      document.getElementById("save").dataset.id = m.id;
    };
    el.querySelector("[data-del]").onclick = async () => {
      const all = await getMemories();
      await setMemories(all.filter((x) => x.id !== m.id));
      renderList();
    };
    list.appendChild(el);
  });
}

function getHubUrl() {
  return new Promise((resolve) => {
    chrome.storage.local.get({ hubUrl: "http://127.0.0.1:8765" }, (d) => {
      resolve((d.hubUrl || "http://127.0.0.1:8765").replace(/\/$/, ""));
    });
  });
}

// ----------------------------------------------------------------------------
// BLOCO 4: Renderização da Lista de Ficheiros Exportados (Aba Ficheiros)
// O QUE É SUPOSTO ACONTECER:
// - Pede ao servidor local a lista de ficheiros gerados em local/exports/.
// - Renderiza cartões com o nome, tamanho e data de cada ficheiro.
// - Botão "Descarregar" seguro: valida que a URL começa por "/downloads/" e
//   usa esquema http:/https:, evitando qualquer injeção maliciosa.
// ----------------------------------------------------------------------------
async function renderExportsList() {
  const container = document.getElementById("filesList");
  if (!container) return;
  container.innerHTML = '<p class="note">A carregar ficheiros…</p>';
  chrome.runtime.sendMessage({ type: "hub-exports" }, async (res) => {
    if (!res?.ok || !res.data?.files?.length) {
      container.innerHTML = '<p class="note">' + (res?.error || "Nenhum ficheiro exportado ainda.") + '</p>';
      return;
    }
    const hub = await getHubUrl();
    container.innerHTML = "";
    res.data.files.forEach((f) => {
      const card = document.createElement("article");
      card.className = "card";
      card.innerHTML =
        "<h3>" + escapeHtml(f.name) + "</h3>" +
        "<p>" + formatBytes(f.size) + " · " + escapeHtml(f.mtime || "") + "</p>" +
        "<div class=\"row\">" +
        "<button data-dl class=\"primary\" type=\"button\">Descarregar</button>" +
        "</div>";
      card.querySelector("[data-dl]").onclick = () => {
        if (!f.url || !f.url.startsWith("/downloads/")) return;
        try {
          const u = new URL(hub + f.url);
          if (u.protocol === "http:" || u.protocol === "https:") {
            chrome.tabs.create({ url: u.href });
          }
        } catch {}
      };
      container.appendChild(card);
    });
  });
}

// ----------------------------------------------------------------------------
// BLOCO 5: Navegação por Separadores (Tabs) e Acesso Direto com 1 Clique
// O QUE É SUPOSTO ACONTECER:
// - Comuta entre as vistas: Memórias, Chats, Enviar, Ficheiros e Hub.
// - Lê a chave temporária "targetView" para focar automaticamente a aba
//   pedida a partir do popup ou da barra flutuante dos chats.
// - Botão "openDownloads": Abre diretamente chrome://downloads no navegador.
// ----------------------------------------------------------------------------
document.querySelector(".tabs").addEventListener("click", (ev) => {
  const tab = ev.target.closest(".tab");
  if (!tab) return;
  const viewId = tab.dataset.view;
  const targetView = document.getElementById("view-" + viewId);
  if (!targetView) return;
  document.querySelectorAll(".tab").forEach((t) => t.classList.toggle("on", t === tab));
  document.querySelectorAll(".view").forEach((v) => v.classList.remove("on"));
  targetView.classList.add("on");
  if (viewId === "files") renderExportsList();
});

const refreshFilesBtn = document.getElementById("refreshFiles");
if (refreshFilesBtn) refreshFilesBtn.onclick = renderExportsList;

const openDownloadsBtn = document.getElementById("openDownloads");
if (openDownloadsBtn) {
  openDownloadsBtn.onclick = () => {
    chrome.tabs.create({ url: "chrome://downloads" });
  };
}

chrome.storage.local.get({ targetView: null }, (d) => {
  if (d.targetView) {
    const tabBtn = document.querySelector(`.tab[data-view="${d.targetView}"]`);
    if (tabBtn) tabBtn.click();
    chrome.storage.local.remove("targetView");
  }
});

// ----------------------------------------------------------------------------
// BLOCO 6: Gestão do Formulário de Memórias (Guardar e Limpar)
// O QUE É SUPOSTO ACONTECER:
// - Grava uma nova memória ou atualiza uma existente se estiver em modo de edição.
// - Limpa os campos do formulário após guardar.
// ----------------------------------------------------------------------------
document.getElementById("save").onclick = async () => {
  const title = document.getElementById("title").value.trim() || "Memoria";
  const body = document.getElementById("body").value.trim();
  if (!body) return;
  const id = document.getElementById("save").dataset.id;
  const all = await getMemories();
  if (id) {
    const found = all.find((m) => m.id === id);
    if (found) {
      found.title = title;
      found.body = body;
    }
  } else {
    all.push({ id: uid(), title, body, active: true });
  }
  await setMemories(all);
  document.getElementById("save").dataset.id = "";
  document.getElementById("title").value = "";
  document.getElementById("body").value = "";
  renderList();
};

document.getElementById("clear").onclick = () => {
  document.getElementById("save").dataset.id = "";
  document.getElementById("title").value = "";
  document.getElementById("body").value = "";
};

async function onSyncClick() {
  setHubStatus("A sincronizar…");
  const res = await syncWithHub();
  if (res.ok) {
    setHubStatus("Sincronizado: " + (res.count || 0) + " memorias.");
    renderList();
  } else {
    setHubStatus("Sync falhou: " + (res.error || "hub offline"));
  }
}

document.getElementById("syncMem").onclick = onSyncClick;
document.getElementById("syncHub").onclick = onSyncClick;

// ----------------------------------------------------------------------------
// BLOCO 7: Interação com os Chats Oficiais (Iframes e Novas Janelas)
// O QUE É SUPOSTO ACONTECER:
// - Abre o site oficial de IA em nova janela ou carrega dentro de um iframe
//   embutido no próprio painel lateral (desbloqueado via rules.json).
// ----------------------------------------------------------------------------
document.querySelector(".chats").addEventListener("click", (ev) => {
  const card = ev.target.closest("article");
  if (!card) return;
  if (ev.target.matches("[data-open]")) chrome.tabs.create({ url: card.dataset.src });
  if (ev.target.matches("[data-frame]")) {
    const iframe = card.querySelector("iframe");
    iframe.hidden = false;
    iframe.src = card.dataset.src;
  }
});

// ----------------------------------------------------------------------------
// BLOCO 8: Envio de Mensagem com Memórias para Separadores Alvo
// O QUE É SUPOSTO ACONTECER:
// - Constrói o texto prefixado com as memórias ativas.
// - Procura um separador aberto com a IA escolhida ou cria um novo separador.
// - Envia o texto via mensagem IPC ao content script com opção de envio automático.
// - Copia também o texto para a área de transferência como contingência rápida.
// ----------------------------------------------------------------------------
const targets = document.getElementById("targets");
TARGETS.forEach((t) => {
  const b = document.createElement("button");
  b.textContent = t.name;
  b.onclick = async () => {
    const text = await compose(document.getElementById("prompt").value);
    const autoSubmit = Boolean(document.getElementById("autosend")?.checked);
    const tabs = await chrome.tabs.query({});
    const hit = tabs.find((tab) => tab.url && tab.url.startsWith(t.url.replace(/\/$/, "")));
    const send = async (tabId) => {
      try {
        await chrome.tabs.sendMessage(tabId, {
          type: "inject",
          mode: "replace",
          text: text,
          submit: autoSubmit,
        });
      } catch {
        await chrome.scripting.executeScript({
          target: { tabId },
          files: ["lib/exporter.js", "content/sites.js", "content/inject.js"],
        });
        await chrome.tabs.sendMessage(tabId, {
          type: "inject",
          mode: "replace",
          text: text,
          submit: autoSubmit,
        });
      }
    };
    if (hit) {
      await chrome.tabs.update(hit.id, { active: true });
      await send(hit.id);
    } else {
      const created = await chrome.tabs.create({ url: t.url });
      const listener = (id, info) => {
        if (id === created.id && info.status === "complete") {
          chrome.tabs.onUpdated.removeListener(listener);
          setTimeout(() => send(created.id), 1200);
        }
      };
      chrome.tabs.onUpdated.addListener(listener);
    }
    navigator.clipboard.writeText(text).catch(() => {});
  };
  targets.appendChild(b);
});

// ----------------------------------------------------------------------------
// BLOCO 9: Definições de Ligação ao Servidor Local e Memória Inicial (Seed)
// O QUE É SUPOSTO ACONTECER:
// - Permite alterar e guardar a URL do servidor local Python.
// - Inicializa a extensão pela primeira vez com uma memória pré-configurada
//   de identidade ("Responde em português de Portugal...").
// ----------------------------------------------------------------------------
const hubUrlInput = document.getElementById("hubUrl");
chrome.storage.local.get({ hubUrl: "http://127.0.0.1:8765" }, (d) => {
  if (hubUrlInput) hubUrlInput.value = d.hubUrl || "http://127.0.0.1:8765";
});
document.getElementById("saveHub").onclick = () => {
  const url = (document.getElementById("hubUrl").value || "").replace(/\/$/, "") || "http://127.0.0.1:8765";
  chrome.storage.local.set({ hubUrl: url }, () => setHubStatus("URL gravado: " + url));
};
document.getElementById("pingHub").onclick = () => {
  chrome.runtime.sendMessage({ type: "hub-health" }, (res) => {
    setHubStatus(res?.ok ? "Hub OK" : "Falhou: " + (res?.error || "servidor parado"));
  });
};

if (!localStorage.getItem("aihub.seeded")) {
  getMemories().then(async (m) => {
    if (!m.length) {
      await setMemories([
        {
          id: uid(),
          title: "Identidade",
          active: true,
          body: "Responde em portugues de Portugal, de forma directa. Quando gerares codigo, usa blocos markdown com a linguagem correcta.",
        },
      ]);
    }
    localStorage.setItem("aihub.seeded", "1");
    renderList();
  });
} else {
  renderList();
}
