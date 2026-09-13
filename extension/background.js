// ============================================================================
// AI Hub - Background Service Worker (Manifest V3)
// Gere comunicações IPC, descarregamentos, proxy local e chamadas diretas de IA.
// ============================================================================

const DEFAULT_HUB = "http://127.0.0.1:8765";

// ----------------------------------------------------------------------------
// BLOCO 1: Cliente HTTP Resiliente com Backoff Exponencial
// O QUE É SUPOSTO ACONTECER:
// - Executa requisições de rede com até 3 tentativas em caso de erro temporário.
// - Aplica uma pausa crescente (500ms, 1000ms...) para não sobrecarregar o servidor.
// - Não repete erros definitivos de cliente (4xx), retornando a resposta de imediato.
// ----------------------------------------------------------------------------
async function fetchWithRetry(url, options, maxRetries = 3) {
  let lastError;
  for (let i = 0; i < maxRetries; i++) {
    try {
      const res = await fetch(url, options);
      if (res.status >= 400 && res.status < 500) return res;
      if (!res.ok && i < maxRetries - 1) {
        await new Promise((r) => setTimeout(r, 500 * Math.pow(2, i)));
        continue;
      }
      return res;
    } catch (err) {
      lastError = err;
      if (i < maxRetries - 1) await new Promise((r) => setTimeout(r, 500 * Math.pow(2, i)));
    }
  }
  throw lastError;
}

// ----------------------------------------------------------------------------
// BLOCO 2: Inicialização do Painel Lateral
// O QUE É SUPOSTO ACONTECER:
// - Configura o comportamento do sidePanel para não abrir automaticamente no clique
//   do ícone da extensão, permitindo que o popup padrão (popup.html) seja exibido.
// ----------------------------------------------------------------------------
chrome.runtime.onInstalled.addListener(() => {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: false }).catch(() => {});
});

// ----------------------------------------------------------------------------
// BLOCO 3: Utilitários de Ligação ao Servidor Local Python (Hub)
// O QUE É SUPOSTO ACONTECER:
// - hubUrl(): Lê o endereço configurado pelo utilizador (padrão: 127.0.0.1:8765).
// - hubFetch(): Envia pedidos JSON ao servidor local e processa respostas ou erros.
// ----------------------------------------------------------------------------
function hubUrl() {
  return new Promise((resolve) => {
    chrome.storage.local.get({ hubUrl: DEFAULT_HUB }, (d) => resolve((d.hubUrl || DEFAULT_HUB).replace(/\/$/, "")));
  });
}

async function hubFetch(path, options) {
  const base = await hubUrl();
  const res = await fetchWithRetry(base + path, options);
  const text = await res.text();
  let data = null;
  try {
    data = JSON.parse(text);
  } catch {
    data = { raw: text };
  }
  if (!res.ok) {
    const err = new Error(data.error || data.detail || res.statusText || "hub error");
    err.data = data;
    throw err;
  }
  return data;
}

// ----------------------------------------------------------------------------
// BLOCO 4: Fusão Inteligente de Memórias (Merge Local + Remoto)
// O QUE É SUPOSTO ACONTECER:
// - Combina as memórias existentes no browser e as do disco sem duplicar identificadores.
// - As memórias locais mais recentes sobrepõem-se às remotas com o mesmo ID.
// ----------------------------------------------------------------------------
function mergeMemories(localList, remoteList) {
  const map = new Map();
  (remoteList || []).forEach((m) => {
    if (m && m.id) map.set(String(m.id), m);
  });
  (localList || []).forEach((m) => {
    if (m && m.id) map.set(String(m.id), m);
  });
  return [...map.values()];
}

// ----------------------------------------------------------------------------
// BLOCO 5: Despachante Central de Mensagens IPC (chrome.runtime.onMessage)
// O QUE É SUPOSTO ACONTECER:
// - Interceta e responde a todas as comunicações vindas de scripts injetados,
//   do popup ou do painel lateral.
// - Regra MV3: Cada ramo assíncrono retorna 'true' para manter o canal aberto.
// ----------------------------------------------------------------------------
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  // Ignora mensagens de outras extensões por segurança
  if (sender.id !== chrome.runtime.id) return;

  // Sub-bloco 5.1: Descarregamento de texto via chrome.downloads API
  if (msg?.type === "download") {
    const rawName = String(msg.filename || "export.txt").replace(/^.*[\\\/]/, "").replace(/\.\./g, "");
    const safeName = rawName || "export.txt";
    const url = "data:" + (msg.mime || "text/plain") + ";charset=utf-8," + encodeURIComponent(msg.content || "");
    chrome.downloads.download(
      { url, filename: safeName, saveAs: Boolean(msg.saveAs) },
      (id) => sendResponse({ ok: !chrome.runtime.lastError, id, error: chrome.runtime.lastError?.message })
    );
    return true;
  }

  // Sub-bloco 5.2: Abertura programática do painel lateral
  if (msg?.type === "open-sidepanel") {
    const windowId = sender.tab?.windowId;
    if (windowId != null) {
      chrome.sidePanel.open({ windowId }).then(
        () => sendResponse({ ok: true }),
        (err) => sendResponse({ ok: false, error: String(err) })
      );
      return true;
    }
    sendResponse({ ok: false, error: "windowId não encontrado" });
    return true;
  }

  // Sub-bloco 5.3: Leitura de memórias locais
  if (msg?.type === "get-memories") {
    chrome.storage.local.get({ memories: [] }, (data) => sendResponse(data));
    return true;
  }

  // Sub-bloco 5.4: Sincronização bidirecional de memórias com o servidor Python
  if (msg?.type === "sync-memories") {
    chrome.storage.local.get({ memories: [] }, async (localData) => {
      try {
        const remote = await hubFetch("/api/memories");
        const merged = mergeMemories(localData.memories || [], remote.memories || []);
        await hubFetch("/api/memories", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ memories: merged }),
        });
        await chrome.storage.local.set({ memories: merged });
        sendResponse({ ok: true, count: merged.length });
      } catch (err) {
        sendResponse({ ok: false, error: err.message });
      }
    });
    return true;
  }

  // Sub-bloco 5.5: Teste de conectividade (Health Check) com o hub local
  if (msg?.type === "hub-health") {
    hubFetch("/api/health")
      .then((data) => sendResponse({ ok: true, data }))
      .catch((err) => sendResponse({ ok: false, error: err.message }));
    return true;
  }

  // Sub-bloco 5.6: Exportação de documento para o disco através do hub
  if (msg?.type === "hub-export") {
    hubFetch("/api/export", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        format: msg.format,
        content: msg.content,
        title: msg.title || "export",
      }),
    })
      .then((data) => sendResponse({ ok: true, data }))
      .catch((err) => sendResponse({ ok: false, error: err.message }));
    return true;
  }

  // Sub-bloco 5.7: Listagem de ficheiros exportados disponíveis no servidor local
  if (msg?.type === "hub-exports") {
    hubFetch("/api/exports")
      .then((data) => sendResponse({ ok: true, data }))
      .catch((err) => sendResponse({ ok: false, error: err.message }));
    return true;
  }

  // Sub-bloco 5.8: Chamada direta de IA via Service Worker (Sem CORS / Modo Autónomo)
  // O QUE É SUPOSTO ACONTECER:
  // - O background script usa as suas permissões de host para chamar diretamente
  //   as APIs oficiais da DeepSeek, DashScope, GLM, Mistral, OpenAI ou Claude.
  // - Devolve a resposta em texto ao remetente sem necessidade de proxy local.
  if (msg?.type === "direct-chat") {
    const { provider, apiKey, model, messages, temperature } = msg;
    const PROVIDERS = {
      qwen: { base: "https://dashscope-intl.aliyuncs.com/compatible-mode/v1", model: "qwen-plus" },
      deepseek: { base: "https://api.deepseek.com/v1", model: "deepseek-chat" },
      glm: { base: "https://api.z.ai/api/paas/v4", model: "glm-4.5-flash" },
      mistral: { base: "https://api.mistral.ai/v1", model: "mistral-small-latest" },
      openai: { base: "https://api.openai.com/v1", model: "gpt-4o-mini" },
      chatgpt: { base: "https://api.openai.com/v1", model: "gpt-4o-mini" },
      claude: { base: "https://api.anthropic.com/v1", model: "claude-3-5-sonnet-20241022", isAnthropic: true },
    };
    const pInfo = PROVIDERS[provider];
    if (!pInfo) {
      sendResponse({ ok: false, error: "Fornecedor desconhecido: " + provider });
      return true;
    }

    if (pInfo.isAnthropic) {
      const url = "https://api.anthropic.com/v1/messages";
      fetch(url, {
        method: "POST",
        headers: {
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
          "content-type": "application/json",
          "dangerously-allow-browser": "true",
        },
        body: JSON.stringify({
          model: model || pInfo.model,
          max_tokens: 4096,
          messages: (messages || []).filter((m) => m.role === "user" || m.role === "assistant"),
          temperature: temperature || 0.7,
        }),
      })
        .then(async (res) => {
          const data = await res.json();
          if (!res.ok) throw new Error(data.error?.message || "HTTP " + res.status);
          const text = data.content?.[0]?.text || "";
          sendResponse({ ok: true, text, raw: data });
        })
        .catch((err) => {
          sendResponse({ ok: false, error: err.message });
        });
      return true;
    }

    const url = pInfo.base.replace(/\/$/, "") + "/chat/completions";
    fetch(url, {
      method: "POST",
      headers: {
        Authorization: "Bearer " + apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: model || pInfo.model,
        messages: messages || [],
        temperature: temperature || 0.7,
      }),
    })
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error?.message || "HTTP " + res.status);
        const text = data.choices?.[0]?.message?.content || "";
        sendResponse({ ok: true, text, raw: data });
      })
      .catch((err) => {
        sendResponse({ ok: false, error: err.message });
      });
    return true;
  }
});
