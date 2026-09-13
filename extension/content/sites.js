// ============================================================================
// AI Hub - Adaptadores e Seletores DOM por Plataforma de IA
// Define a configuração de injeção heurística para cada chat suportado.
// ============================================================================

// ----------------------------------------------------------------------------
// BLOCO 1: Registo de Plataformas e Mapeamento de Seletores de Interface
// O QUE É SUPOSTO ACONTECER:
// - Cada entrada define o identificador do serviço, o teste de hostname,
//   a URL oficial e uma lista ordenada por prioridade dos seletores CSS
//   da caixa de mensagem ("composers") e do botão de envio ("send").
// - Como as interfaces das IAs atualizam frequentemente, os arrays contêm
//   seletores de fallback para que a extensão continue a funcionar mesmo que
//   uma classe CSS mude de nome.
// ----------------------------------------------------------------------------
const AIHUB_SITES = [
  {
    id: "qwen",
    name: "Qwen",
    test: (h) => h.includes("chat.qwen.ai") || h.includes("chat.qwenlm.ai"),
    url: "https://chat.qwen.ai",
    composers: [
      "#chat-input",
      "textarea#chat-input",
      "textarea[placeholder]",
      "textarea",
      '[contenteditable="true"]',
    ],
    send: [
      "button#send-button",
      "button[aria-label*='Send' i]",
      "button[aria-label*='Enviar' i]",
      "button[class*='send']",
    ],
  },
  {
    id: "deepseek",
    name: "DeepSeek",
    test: (h) => h.includes("chat.deepseek.com"),
    url: "https://chat.deepseek.com",
    composers: [
      'textarea[placeholder*="DeepSeek" i]',
      'textarea[placeholder*="mensagem" i]',
      'textarea[placeholder*="Message" i]',
      "textarea",
      '[contenteditable="true"]',
    ],
    send: [
      'div[role="button"][aria-disabled="false"]',
      "button[aria-label*='Send' i]",
      "button[class*='send']",
      'button[type="submit"]',
    ],
  },
  {
    id: "glm",
    name: "GLM",
    test: (h) => h.includes("chat.z.ai") || h.includes("chatglm.cn"),
    url: "https://chat.z.ai",
    composers: [
      "textarea",
      '[contenteditable="true"][role="textbox"]',
      '[contenteditable="true"]',
    ],
    send: [
      "button[type='submit']",
      "button[aria-label*='Send' i]",
      "button[class*='send']",
    ],
  },
  {
    id: "mistral",
    name: "Mistral",
    test: (h) => h.includes("chat.mistral.ai"),
    url: "https://chat.mistral.ai",
    composers: [
      "textarea",
      '[contenteditable="true"][role="textbox"]',
      '[contenteditable="true"]',
    ],
    send: ["button[aria-label*='Send' i]", "button[type='submit']"],
  },
  {
    id: "chatgpt",
    name: "ChatGPT",
    test: (h) => h.includes("chatgpt.com") || h.includes("chat.openai.com"),
    url: "https://chatgpt.com",
    composers: [
      "#prompt-textarea",
      "textarea#prompt-textarea",
      "div#prompt-textarea",
      'div[contenteditable="true"]#prompt-textarea',
      'textarea[placeholder*="Message" i]',
      'textarea[placeholder*="mensagem" i]',
      "textarea",
      '[contenteditable="true"]',
    ],
    send: [
      'button[data-testid="send-button"]',
      "button[aria-label*='Send' i]",
      "button[aria-label*='Enviar' i]",
      "button[class*='send']",
    ],
  },
  {
    id: "claude",
    name: "Claude",
    test: (h) => h.includes("claude.ai"),
    url: "https://claude.ai",
    composers: [
      'div.ProseMirror[contenteditable="true"]',
      'div[contenteditable="true"]',
      '[contenteditable="true"]',
      "textarea",
    ],
    send: [
      "button[aria-label*='Send Message' i]",
      "button[aria-label*='Send' i]",
      "button[aria-label*='Enviar' i]",
      'button[type="submit"]',
    ],
  },
];

// ----------------------------------------------------------------------------
// BLOCO 2: Deteção Ativa do Site em Execução
// O QUE É SUPOSTO ACONTECER:
// - Avalia a propriedade location.hostname do separador do browser.
// - Executa a função de teste de cada site registado e retorna a configuração
//   do adaptador correspondente (ou null se estiver num site não suportado).
// ----------------------------------------------------------------------------
function aihubCurrentSite() {
  const host = location.hostname;
  return AIHUB_SITES.find((s) => s.test(host)) || null;
}
