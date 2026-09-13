// ============================================================================
// AI Hub - Popup Menu Script (popup.js)
// Controla os botões do menu rápido suspenso na barra de ferramentas do Chrome.
// ============================================================================

// ----------------------------------------------------------------------------
// BLOCO 1: Abertura do Painel Lateral (Side Panel)
// O QUE É SUPOSTO ACONTECER:
// - Obtém a janela ativa atual e abre o painel lateral nativo do Chrome.
// - Fecha imediatamente a janela popup flutuante para libertar espaço visual.
// ----------------------------------------------------------------------------
document.getElementById("panel").onclick = async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab?.windowId != null) await chrome.sidePanel.open({ windowId: tab.windowId });
  window.close();
};

// ----------------------------------------------------------------------------
// BLOCO 2: Atalho Direto para a Visualização de Ficheiros Criados
// O QUE É SUPOSTO ACONTECER:
// - Grava no chrome.storage.local o parâmetro targetView = 'files'.
// - Abre o painel lateral; o script sidepanel.js lê este parâmetro ao iniciar
//   e comuta automaticamente para a aba "Ficheiros".
// ----------------------------------------------------------------------------
document.getElementById("viewFiles").onclick = async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab?.windowId != null) {
    await chrome.storage.local.set({ targetView: "files" });
    await chrome.sidePanel.open({ windowId: tab.windowId });
  }
  window.close();
};

// ----------------------------------------------------------------------------
// BLOCO 3: Injeção de Memória no Separador Atual com Auto-Recuperação
// O QUE É SUPOSTO ACONTECER:
// - Envia uma mensagem IPC ao separador ativo para injetar as memórias salvas.
// - Fallback: Se o content script ainda não tiver sido carregado na página
//   (ex: após recarregar a extensão), injeta dinamicamente o exporter e scripts
//   via chrome.scripting.executeScript e repete o pedido com sucesso.
// ----------------------------------------------------------------------------
document.getElementById("inject").onclick = async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) return;
  try {
    await chrome.tabs.sendMessage(tab.id, { type: "inject", mode: "append" });
  } catch {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ["lib/exporter.js", "content/sites.js", "content/inject.js"],
    });
    await chrome.tabs.sendMessage(tab.id, { type: "inject", mode: "append" });
  }
};

// ----------------------------------------------------------------------------
// BLOCO 4: Exportação de Código do Separador Atual com Auto-Recuperação
// O QUE É SUPOSTO ACONTECER:
// - Solicita ao content script a extração e descarregamento de blocos de código.
// - Aplica a mesma auto-injeção de contingência caso a página precise dos scripts.
// ----------------------------------------------------------------------------
document.getElementById("export").onclick = async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) return;
  try {
    await chrome.tabs.sendMessage(tab.id, { type: "export", kind: "scan" });
  } catch {
    try {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ["lib/exporter.js", "content/sites.js", "content/inject.js"],
      });
      await chrome.tabs.sendMessage(tab.id, { type: "export", kind: "scan" });
    } catch {
      /* Ignora se a página não for um chat compatível */
    }
  }
};
