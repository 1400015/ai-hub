const DEFAULT_HUB = "http://127.0.0.1:8765";

// Retry mechanism com backoff exponencial (robustez)
async function fetchWithRetry(url, options, maxRetries = 3) {
  let lastError;
  for (let i = 0; i < maxRetries; i++) {
    try {
      const res = await fetch(url, options);
      return res;
    } catch (err) {
      lastError = err;
      if (i < maxRetries - 1) {
        const delay = 500 * Math.pow(2, i); // 500ms, 1s, 2s
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  throw lastError;
}

chrome.runtime.onInstalled.addListener(() => {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: false }).catch(() => {});
});

function hubUrl() {
  return new Promise((resolve) => {
    chrome.storage.local.get({ hubUrl: DEFAULT_HUB }, (d) => resolve((d.hubUrl || DEFAULT_HUB).replace(/\/$/, "")));
  });
}

async function hubFetch(path, options) {
  const base = await hubUrl();
  // Usa retry mechanism para falhas temporarias
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

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.type === "download") {
    const url = "data:" + msg.mime + ";charset=utf-8," + encodeURIComponent(msg.content);
    chrome.downloads.download(
      { url, filename: msg.filename, saveAs: Boolean(msg.saveAs) },
      (id) => sendResponse({ ok: !chrome.runtime.lastError, id, error: chrome.runtime.lastError?.message })
    );
    return true;
  }

  if (msg?.type === "open-sidepanel") {
    const windowId = sender.tab?.windowId;
    if (windowId != null) {
      chrome.sidePanel.open({ windowId }).then(
        () => sendResponse({ ok: true }),
        (err) => sendResponse({ ok: false, error: String(err) })
      );
      return true;
    }
  }

  if (msg?.type === "get-memories") {
    chrome.storage.local.get({ memories: [] }, (data) => sendResponse(data));
    return true;
  }

  if (msg?.type === "sync-memories") {
    // Sincronizacao entre extensao e hub web
    chrome.storage.local.get({ memories: [] }, async (localData) => {
      try {
        const base = await hubUrl();
        // Envia memorias locais para o hub
        await fetchWithRetry(base + "/api/memories", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ memories: localData.memories })
        });
        sendResponse({ ok: true, count: localData.memories.length });
      } catch (err) {
        sendResponse({ ok: false, error: err.message });
      }
    });
    return true;
  }

  if (msg?.type === "hub-health") {
    hubFetch("/api/health")
      .then((data) => sendResponse({ ok: true, data }))
      .catch((err) => sendResponse({ ok: false, error: err.message }));
    return true;
  }

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
});
