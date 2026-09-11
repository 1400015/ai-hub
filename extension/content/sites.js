/* Adaptadores por site. Selectores são heurísticos — as UIs mudam. */
const AIHUB_SITES = [
  {
    id: "qwen",
    name: "Qwen",
    test: (h) => h.includes("chat.qwen.ai") || h.includes("chat.qwenlm.ai"),
    url: "https://chat.qwen.ai",
    composers: ["#chat-input", "textarea#chat-input", "textarea[placeholder]", "textarea", '[contenteditable="true"]'],
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
    send: ["button[type='submit']", "button[aria-label*='Send' i]", "button[class*='send']"],
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
];

function aihubCurrentSite() {
  const host = location.hostname;
  return AIHUB_SITES.find((s) => s.test(host)) || null;
}
