const DEFAULT_HUB = "http://127.0.0.1:8765";

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
