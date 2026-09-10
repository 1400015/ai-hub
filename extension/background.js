const DEFAULT_HUB = "http://127.0.0.1:8765";

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
  const res = await fetch(base + path, options);
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
