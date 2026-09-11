# Manual — AI Hub Memória

Extensão + servidor local para Qwen, DeepSeek, GLM/Z.ai e Mistral.
Repo: https://github.com/1400015/ai-hub

Não está na Chrome Web Store. Instala-se em **modo de programador** (pasta descompactada). O processo é o mesmo nos três browsers Chromium; só muda o endereço das extensões.

---

## 0. Preparar o projecto

```bash
git clone https://github.com/1400015/ai-hub.git
cd ai-hub
```

Ícones (obrigatório na primeira vez; o GitHub não tem os PNG):

```bash
pip install pillow
python3 extension/icons/generate_icons.py
```

Devem aparecer `extension/icons/icon16.png`, `icon32.png`, `icon48.png` e `icon128.png`.

Servidor local (DOCX / PDF / XLSX e a página http://127.0.0.1:8765):

```bash
pip install -r requirements.txt
cd local
python3 server.py
```

Deixa este terminal aberto. Porta alternativa: `PORT=9000 python3 server.py`.

---

## 1. Instalar a extensão

A pasta a escolher é sempre **`extension/`** (a que contém o `manifest.json`). Não escolhas a raiz do repo.

### Google Chrome

1. Abre `chrome://extensions/`
2. Canto superior direito: activa **Modo de programador**
3. **Carregar sem compactação** (*Load unpacked*)
4. Selecciona a pasta `ai-hub/extension`
5. Confirma que **AI Hub Memória** aparece e está ligada
6. Ícone de peça de puzzle da barra → alfinete junto a **AI Hub Memória**

### Microsoft Edge

1. Abre `edge://extensions/`
2. Lado esquerdo, em baixo: activa **Modo de programador**
3. **Carregar sem compactação**
4. Selecciona `ai-hub/extension`
5. Fixa o ícone: peça de puzzle → **Mostrar na barra de ferramentas**

No Edge o painel lateral usa o *side pane* nativo. Se o botão «Painel» do dock não abrir nada, usa o popup da extensão → **Abrir painel lateral**.

### Opera e Opera GX

1. Abre `opera://extensions/`
2. Canto superior direito: **Developer mode** / **Modo de programador**
3. **Load unpacked** / **Carregar descompactada**
4. Selecciona `ai-hub/extension`

Diferenças no Opera:

- A primeira vez pede para permitir extensões em modo programador.
- O `sidePanel` do Chrome pode não existir ou ser limitado. Usa o **popup** (icone na barra) e o **dock** no canto do chat. O resto (memória, exportação) funciona igual.
- Opera GX: o mesmo `opera://extensions/`.

### Brave (opcional)

Igual ao Chrome: `brave://extensions/` → Modo de programador → Carregar sem compactação → `extension/`.

### O que o browser vai pedir

| Permissão | Para quê |
|---|---|
| Sites dos quatro chats | Injectar memória e ler blocos de código |
| `127.0.0.1` / `localhost` | Falar com o hub Python |
| Armazenamento | Guardar memórias no browser |
| Transferências | Fallback se o hub estiver desligado |
| Painel lateral | Biblioteca de memórias |

---

## 2. Actualizar depois de um git pull

Não voltas a «instalar». Em `chrome://extensions/` (ou equivalente) clica em **Actualizar** no cartão da extensão. Se mudares o `manifest.json`, o browser pede para recarregar.

---

## 3. Operação no dia-a-dia

### Arranque

1. `python3 local/server.py`
2. Browser com a extensão ligada
3. Login no chat oficial
4. No canto **inferior direito** aparece o dock **AI Hub**

Se o dock não aparecer: recarrega a página do chat. A extensão só corre nos URLs dos quatro modelos.

### Memórias

Painel (dock → Painel, ou popup → Abrir painel lateral):

1. Separador **Memórias**
2. Título + texto
3. **Guardar**
4. Marca **activa** as que devem ir para o prompt

Ficam em `chrome.storage.local` e são as **mesmas** nos quatro chats.

### Injectar no chat oficial

- **Inserir memória** — acrescenta `[MEMÓRIA PERSISTENTE]` à caixa
- **Substituir campo** — põe só a memória

### Exportar

Cada `<pre>` ganha um botão **guardar**.

| Botão | Efeito |
|---|---|
| **guardar** no bloco | Envia esse código a `local/exports/` |
| **Código → ficheiros** | Percorre os blocos ``` da resposta |
| **Chat → MD / HTML** | Texto, mesmo sem hub |
| **Chat → DOCX / PDF / XLSX** | Exige `server.py` a correr |

### Hub web

http://127.0.0.1:8765 — compositor, monitor (colas a resposta) e chat via API.

Memórias da extensão e do hub web são listas **separadas**.

---

## 4. Problemas frequentes

| Sintoma | Correcção |
|---|---|
| Dock não aparece | Recarrega o chat oficial |
| Não encontrei a caixa de texto | UI do site mudou; edita `extension/content/sites.js` e recarrega a extensão |
| DOCX/PDF falha | Arranca `server.py` e instala `python-docx openpyxl reportlab` |
| Painel vazio no Opera | Usa o popup + dock |
|Ícone partido | `python3 extension/icons/generate_icons.py` |
| Extensão corrompida | Escolheste a pasta errada — tem de ser `extension/` com `manifest.json` |
| Iframe em branco | Normal. Usa Nova janela |

## 5. Desinstalar

Na página de extensões → Remover. Os ficheiros em `local/exports/` ficam no disco.
