const TARGETS = [
  { id: "qwen", name: "Qwen", url: "https://chat.qwen.ai/" },
  { id: "deepseek", name: "DeepSeek", url: "https://chat.deepseek.com/" },
  { id: "glm", name: "GLM / Z.ai", url: "https://chat.z.ai/" },
  { id: "glm-cn", name: "Zhipu", url: "https://chatglm.cn/" },
  { id: "mistral", name: "Mistral", url: "https://chat.mistral.ai/" },
];

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
  return String(s).replace(/[&<>"]/g, (c) => ({ "&": "&", "<": "<", ">": ">", '"': """ }[c]));
}

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

document.querySelector(".tabs").addEventListener("click", (ev) => {
  const tab = ev.target.closest(".tab");
  if (!tab) return;
  document.querySelectorAll(".tab").forEach((t) => t.classList.toggle("on", t === tab));
  document.querySelectorAll(".view").forEach((v) => v.classList.remove("on"));
  document.getElementById("view-" + tab.dataset.view).classList.add("on");
});

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

const targets = document.getElementById("targets");
TARGETS.forEach((t) => {
  const b = document.createElement("button");
  b.textContent = t.name;
  b.onclick = async () => {
    const text = await compose(document.getElementById("prompt").value);
    const tabs = await chrome.tabs.query({});
    const hit = tabs.find((tab) => tab.url && tab.url.startsWith(t.url.replace(/\/$/, "")));
    const send = async (tabId) => {
      try {
        await chrome.tabs.sendMessage(tabId, {
          type: "inject",
          mode: "replace",
          text: document.getElementById("prompt").value,
        });
      } catch {
        await chrome.scripting.executeScript({
          target: { tabId },
          files: ["content/sites.js", "content/inject.js"],
        });
        await chrome.tabs.sendMessage(tabId, {
          type: "inject",
          mode: "replace",
          text: document.getElementById("prompt").value,
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

const hubUrlInput = document.getElementById("hubUrl");
chrome.storage.local.get({ hubUrl: "http://127.0.0.1:8765" }, (d) => {
  if (hubUrlInput) hubUrlInput.value = d.hubUrl || "http://127.0.0.1:8765";
});
document.getElementById("saveHub").onclick = () => {
  const url = (document.getElementById("hubUrl").value || "").replace(/\/$/, "") || "http://127.0.0.1:8765";
  chrome.storage.local.set({ hubUrl: url }, () => {
    document.getElementById("hubStatus").textContent = "URL gravado: " + url;
  });
};
document.getElementById("pingHub").onclick = () => {
  chrome.runtime.sendMessage({ type: "hub-health" }, (res) => {
    document.getElementById("hubStatus").textContent = res?.ok
      ? "Hub OK"
      : "Falhou: " + (res?.error || "servidor parado");
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
