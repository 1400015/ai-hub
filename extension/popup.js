document.getElementById("panel").onclick = async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab?.windowId != null) await chrome.sidePanel.open({ windowId: tab.windowId });
  window.close();
};

document.getElementById("inject").onclick = async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) return;
  try {
    await chrome.tabs.sendMessage(tab.id, { type: "inject", mode: "append" });
  } catch {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ["content/sites.js", "content/inject.js"],
    });
    await chrome.tabs.sendMessage(tab.id, { type: "inject", mode: "append" });
  }
};

document.getElementById("export").onclick = async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) return;
  try {
    await chrome.tabs.sendMessage(tab.id, { type: "export", kind: "scan" });
  } catch {
    /* ignore */
  }
};
