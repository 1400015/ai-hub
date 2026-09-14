// ============================================================================
// AI Hub Native Client-Side Exporter
// Produz ficheiros DOCX, XLSX, PDF e ZIP válidos em puro JavaScript sem dependências.
// ============================================================================
(() => {
  // --------------------------------------------------------------------------
  // BLOCO 1: Conversores Utilitários de Codificação e Escape XML
  // O QUE É SUPOSTO ACONTECER:
  // - Converter strings JavaScript normais para buffers binários UTF-8 (Uint8Array)
  //   necessários para empacotamento em bytes.
  // - Escapar caracteres restritos (&, <, >, ", ') para que o analisador XML
  //   do Microsoft Office não falhe com erros de sintaxe ao abrir DOCX ou XLSX.
  // --------------------------------------------------------------------------
  function strToUtf8(str) {
    return new TextEncoder().encode(str);
  }

  function utf8ToStr(buf) {
    return new TextDecoder("utf-8").decode(buf);
  }

  function xmlEscape(str) {
    return String(str || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&apos;");
  }

  // --------------------------------------------------------------------------
  // BLOCO 2: Cálculo de Checksum CRC-32 (Especificação PKZIP / ISO 3309)
  // O QUE É SUPOSTO ACONTECER:
  // - Gera previamente uma tabela estática de 256 inteiros de 32 bits usando o
  //   polinómio padrão 0xEDB88320.
  // - A função crc32(buf) calcula a soma de verificação do ficheiro em O(N),
  //   garantindo que os leitores de ZIP (Windows Explorer, WinRAR, Unzip)
  //   validem que o conteúdo não está corrompido ao ser descompactado.
  // --------------------------------------------------------------------------
  const crcTable = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crcTable[i] = c;
  }

  function crc32(buf) {
    let crc = -1;
    for (let i = 0; i < buf.length; i++) {
      crc = (crc >>> 8) ^ crcTable[(crc ^ buf[i]) & 0xff];
    }
    return (crc ^ -1) >>> 0;
  }

  // --------------------------------------------------------------------------
  // BLOCO 3: Construtor Binário de Arquivos ZIP (Método 0: Store / Sem compressão)
  // O QUE É SUPOSTO ACONTECER:
  // - Recebe um array de ficheiros [{name, data}].
  // - Para cada ficheiro, monta o "Local File Header" (30 bytes + nome + dados)
  //   e o "Central Directory Header" (46 bytes + nome).
  // - Constrói o registo terminal "End of Central Directory" (22 bytes) com
  //   os offsets e tamanhos exatos.
  // - Junta tudo num Uint8Array final.
  // - RESULTADO: Gera um ficheiro .zip 100% em conformidade com as normas PKWARE,
  //   que serve de base para os formatos OpenXML (.docx e .xlsx).
  // --------------------------------------------------------------------------
  function createZip(files) {
    const localHeaders = [];
    const centralHeaders = [];
    let offset = 0;

    // Converte a data e hora atual para o formato de 16 bits exigido pelo MS-DOS FAT
    const now = new Date();
    const dosTime =
      ((now.getHours() & 0x1f) << 11) |
      ((now.getMinutes() & 0x3f) << 5) |
      ((now.getSeconds() >> 1) & 0x1f);
    const dosDate =
      (((now.getFullYear() - 1980) & 0x7f) << 9) |
      (((now.getMonth() + 1) & 0xf) << 5) |
      (now.getDate() & 0x1f);

    files.forEach((f) => {
      const nameBuf = strToUtf8(f.name);
      const dataBuf =
        f.data instanceof Uint8Array ? f.data : strToUtf8(String(f.data || ""));
      const crc = crc32(dataBuf);
      const size = dataBuf.length;

      // 1. Cabeçalho de ficheiro local (30 bytes de metadados fixos + nome + dados)
      const lh = new Uint8Array(30 + nameBuf.length + size);
      const lv = new DataView(lh.buffer);
      lv.setUint32(0, 0x04034b50, true); // Assinatura PK0304
      lv.setUint16(4, 20, true);         // Versão mínima necessária (2.0)
      lv.setUint16(6, 0x0800, true);     // Flag de uso: bit 11 ativo = nomes em UTF-8
      lv.setUint16(8, 0, true);          // Compressão = 0 (Store)
      lv.setUint16(10, dosTime, true);   // Hora de modificação DOS
      lv.setUint16(12, dosDate, true);   // Data de modificação DOS
      lv.setUint32(14, crc, true);       // Checksum CRC-32
      lv.setUint32(18, size, true);      // Tamanho comprimido
      lv.setUint32(22, size, true);      // Tamanho descomprimido
      lv.setUint16(26, nameBuf.length, true); // Comprimento do nome do ficheiro
      lv.setUint16(28, 0, true);         // Campos extra (nenhum necessário)
      lh.set(nameBuf, 30);
      lh.set(dataBuf, 30 + nameBuf.length);

      // 2. Cabeçalho no Diretório Central (46 bytes fixos + nome)
      const ch = new Uint8Array(46 + nameBuf.length);
      const cv = new DataView(ch.buffer);
      cv.setUint32(0, 0x02014b50, true); // Assinatura PK0102
      cv.setUint16(4, 20, true);         // Versão criada por
      cv.setUint16(6, 20, true);         // Versão necessária para extrair
      cv.setUint16(8, 0x0800, true);     // Flag UTF-8
      cv.setUint16(10, 0, true);         // Compressão = 0
      cv.setUint16(12, dosTime, true);
      cv.setUint16(14, dosDate, true);
      cv.setUint32(16, crc, true);
      cv.setUint32(20, size, true);
      cv.setUint32(24, size, true);
      cv.setUint16(28, nameBuf.length, true);
      cv.setUint16(30, 0, true);
      cv.setUint16(32, 0, true);
      cv.setUint16(34, 0, true);
      cv.setUint16(36, 0, true);
      cv.setUint32(38, 0x81a40000, true); // Atributos externos de ficheiro regular POSIX (-rw-r--r--)
      cv.setUint32(42, offset, true);     // Offset onde começa o Local Header correspondente
      ch.set(nameBuf, 46);

      localHeaders.push(lh);
      centralHeaders.push(ch);
      offset += lh.length;
    });

    const cdOffset = offset;
    let cdSize = 0;
    centralHeaders.forEach((ch) => (cdSize += ch.length));

    // 3. Registo Final de Fim do Diretório Central (EOCD - 22 bytes)
    const eocd = new Uint8Array(22);
    const ev = new DataView(eocd.buffer);
    ev.setUint32(0, 0x06054b50, true);     // Assinatura PK0506
    ev.setUint16(4, 0, true);              // Número do disco
    ev.setUint16(6, 0, true);              // Disco onde começa o Diretório Central
    ev.setUint16(8, files.length, true);   // Entradas neste disco
    ev.setUint16(10, files.length, true);  // Total de ficheiros no arquivo
    ev.setUint32(12, cdSize, true);        // Tamanho do Diretório Central
    ev.setUint32(16, cdOffset, true);      // Posição de início do Diretório Central
    ev.setUint16(20, 0, true);             // Comprimento do comentário (nenhum)

    // Junta todas as secções sequencialmente na memória contínua
    const totalSize = cdOffset + cdSize + 22;
    const out = new Uint8Array(totalSize);
    let p = 0;
    localHeaders.forEach((lh) => {
      out.set(lh, p);
      p += lh.length;
    });
    centralHeaders.forEach((ch) => {
      out.set(ch, p);
      p += ch.length;
    });
    out.set(eocd, p);
    return out;
  }

  // --------------------------------------------------------------------------
  // BLOCO 4: Gerador OpenXML DOCX (Microsoft Word)
  // O QUE É SUPOSTO ACONTECER:
  // - Recebe o título e o corpo de texto de uma resposta de IA.
  // - Divide o texto por quebras de linha duplas para gerar parágrafos (<w:p>).
  // - Aplica tipografia com estilo: título em azul escuro (18pt) e corpo (12pt).
  // - Adiciona os ficheiros obrigatórios da especificação Office OpenXML:
  //     * [Content_Types].xml (MIME type das partes)
  //     * _rels/.rels (Relação de pacote com o documento principal)
  //     * word/document.xml (Conteúdo de texto formatado)
  // - Empacota tudo num ZIP e retorna um Blob com tipo MIME oficial do Word.
  // --------------------------------------------------------------------------
  function generateDocx(title, text) {
    const safeTitle = xmlEscape(title || "Documento");
    const paras = String(text || "")
      .replace(/\r\n/g, "\n")
      .split(/\n{2,}/);

    let docXml =
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
      '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">\n' +
      "  <w:body>\n" +
      "    <w:p>\n" +
      '      <w:pPr><w:jc w:val="left"/><w:spacing w:after="240"/></w:pPr>\n' +
      '      <w:r><w:rPr><w:b/><w:sz w:val="36"/><w:color w:val="1F497D"/></w:rPr><w:t>' +
      safeTitle +
      "</w:t></w:r>\n" +
      "    </w:p>\n";

    paras.forEach((p) => {
      const cleanP = xmlEscape(p.trim());
      if (cleanP) {
        docXml +=
          "    <w:p>\n" +
          '      <w:pPr><w:spacing w:after="160"/></w:pPr>\n' +
          '      <w:r><w:rPr><w:sz w:val="24"/></w:rPr><w:t xml:space="preserve">' +
          cleanP +
          "</w:t></w:r>\n" +
          "    </w:p>\n";
      }
    });

    docXml +=
      '    <w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/></w:sectPr>\n' +
      "  </w:body>\n" +
      "</w:document>";

    const contentTypes =
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
      '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">\n' +
      '  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>\n' +
      '  <Default Extension="xml" ContentType="application/xml"/>\n' +
      '  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>\n' +
      "</Types>";

    const rels =
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">\n' +
      '  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>\n' +
      "</Relationships>";

    const zip = createZip([
      { name: "[Content_Types].xml", data: contentTypes },
      { name: "_rels/.rels", data: rels },
      { name: "word/document.xml", data: docXml },
    ]);

    return new Blob([zip], {
      type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    });
  }

  // --------------------------------------------------------------------------
  // BLOCO 5: Gerador OpenXML XLSX (Microsoft Excel)
  // O QUE É SUPOSTO ACONTECER:
  // - Analisa o texto exportado, detetando automaticamente delimitadores de tabela
  //   (tabulações, ponto e vírgula ou vírgulas).
  // - Mapeia as colunas em letras (A, B, C...) e as linhas em índices numéricos (1, 2, 3...).
  // - Cria células com a tag de string inline `<c r="A1" t="inlineStr"><is><t>...</t></is></c>`.
  // - Constrói o livro e folhas XML (workbook.xml, sheet1.xml e respetivos rels).
  // - Empacota num arquivo ZIP com tipo MIME oficial de folha de cálculo Excel.
  // --------------------------------------------------------------------------
  function generateXlsx(title, text) {
    const rows = String(text || "")
      .replace(/\r\n/g, "\n")
      .split("\n");
    let sheetXml =
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
      '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">\n' +
      "  <sheetData>\n";

    rows.forEach((r, rIdx) => {
      const line = r.trim();
      if (!line) return;
      // Deteção heurística: se tiver tabs prioriza tabs, depois ponto-e-vírgula, depois vírgula
      let cells = line.includes("\t")
        ? line.split("\t")
        : line.includes(";")
        ? line.split(";")
        : line.split(",");

      sheetXml += '    <row r="' + (rIdx + 1) + '">\n';
      cells.forEach((c, cIdx) => {
        const colLetter = String.fromCharCode(65 + (cIdx % 26));
        const cellRef = colLetter + (rIdx + 1);
        sheetXml +=
          '      <c r="' +
          cellRef +
          '" t="inlineStr"><is><t>' +
          xmlEscape(c.trim()) +
          "</t></is></c>\n";
      });
      sheetXml += "    </row>\n";
    });

    sheetXml += "  </sheetData>\n</worksheet>";

    const contentTypes =
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
      '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">\n' +
      '  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>\n' +
      '  <Default Extension="xml" ContentType="application/xml"/>\n' +
      '  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>\n' +
      '  <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>\n' +
      "</Types>";

    const rootRels =
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">\n' +
      '  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>\n' +
      "</Relationships>";

    const wbRels =
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">\n' +
      '  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>\n' +
      "</Relationships>";

    const wbXml =
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
      '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">\n' +
      '  <sheets><sheet name="Dados" sheetId="1" r:id="rId1"/></sheets>\n' +
      "</workbook>";

    const zip = createZip([
      { name: "[Content_Types].xml", data: contentTypes },
      { name: "_rels/.rels", data: rootRels },
      { name: "xl/_rels/workbook.xml.rels", data: wbRels },
      { name: "xl/workbook.xml", data: wbXml },
      { name: "xl/worksheets/sheet1.xml", data: sheetXml },
    ]);

    return new Blob([zip], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
  }

  // --------------------------------------------------------------------------
  // BLOCO 6: Gerador Nativo de PDF 1.4 Canónico
  // O QUE É SUPOSTO ACONTECER:
  // - Calcula a geometria da folha A4 (595.28 x 841.89 pontos).
  // - Realiza a divisão automática de parágrafos e linhas longas (word-wrap).
  // - Distribui o texto por várias páginas conforme o limite de altura.
  // - Monta a árvore de objetos do PDF (/Catalog, /Outlines, /Pages, /Font, /Page, /Contents).
  // - Constrói o fluxo de operadores PostScript do texto (BT, Tf, Td, Tj, ET).
  // - Calcula os offsets em bytes da tabela "xref" e escreve o rodapé %%EOF.
  // - RESULTADO: Produz um documento PDF 1.4 profissional e compatível com qualquer leitor.
  // --------------------------------------------------------------------------
  function generatePdf(title, text) {
    const pageWidth = 595.28; // Largura da página A4 em pontos tipográficos
    const pageHeight = 841.89; // Altura da página A4 em pontos tipográficos
    const margin = 50;
    const lineHeight = 16;
    const linesPerPage = Math.floor((pageHeight - margin * 2 - 40) / lineHeight);

    // Escapa parênteses e barras invertidas dentro de literais de texto do PDF
    function pdfEscape(s) {
      return String(s || "")
        .replace(/\\/g, "\\\\")
        .replace(/\(/g, "\\(")
        .replace(/\)/g, "\\)");
    }

    // Quebra inteligente de texto em linhas com tamanho máximo definido
    function wrapText(txt, maxCharsPerLine = 78) {
      const outLines = [];
      const paras = txt.replace(/\r\n/g, "\n").split("\n");
      paras.forEach((p) => {
        if (!p.trim()) {
          outLines.push("");
          return;
        }
        const words = p.split(/\s+/);
        let curr = "";
        words.forEach((w) => {
          if ((curr + " " + w).trim().length <= maxCharsPerLine) {
            curr = (curr + " " + w).trim();
          } else {
            if (curr) outLines.push(curr);
            curr = w;
          }
        });
        if (curr) outLines.push(curr);
      });
      return outLines;
    }

    const allLines = wrapText(text || "");
    const pages = [];
    for (let i = 0; i < allLines.length; i += linesPerPage) {
      pages.push(allLines.slice(i, i + linesPerPage));
    }
    if (!pages.length) pages.push(["(Documento vazio)"]);

    const objects = [];
    function addObject(content) {
      objects.push(content);
      return objects.length;
    }

    // Estrutura hierárquica base do documento PDF
    const catalogObj = addObject(""); // 1: Catálogo raiz
    const outlinesObj = addObject("<< /Type /Outlines /Count 0 >>"); // 2: Sumário
    const pagesObj = addObject(""); // 3: Objeto pai das páginas
    const fontF1 = addObject(
      "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>"
    ); // 4: Fonte Helvetica normal
    const fontF2 = addObject(
      "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>"
    ); // 5: Fonte Helvetica-Bold

    const pageRefs = [];
    pages.forEach((pageLines, pageIdx) => {
      let stream = "BT\n";
      if (pageIdx === 0) {
        // Título estilizado na primeira página
        stream +=
          "/F2 18 Tf\n" +
          margin +
          " " +
          (pageHeight - margin - 20) +
          " Td\n(" +
          pdfEscape(title || "Exportacao AI Hub") +
          ") Tj\n";
        stream +=
          "/F1 10 Tf\n0 -22 Td\n(Gerado autonomamente pelo AI Hub Extension - " +
          pdfEscape(new Date().toLocaleString()) +
          ") Tj\n";
        stream += "/F1 11 Tf\n0 -28 Td\n";
      } else {
        // Cabeçalho de continuação nas páginas seguintes
        stream +=
          "/F1 11 Tf\n" +
          margin +
          " " +
          (pageHeight - margin - 20) +
          " Td\n";
      }

      // Adiciona cada linha de texto com avanço descendente de coordenadas
      pageLines.forEach((l) => {
        stream += "(" + pdfEscape(l) + ") Tj\n0 -" + lineHeight + " Td\n";
      });
      stream += "ET\n";

      const streamBytes = strToUtf8(stream);
      const contentId = addObject(
        "<< /Length " +
          streamBytes.length +
          " >>\nstream\n" +
          stream +
          "endstream"
      );

      const pageId = addObject(
        "<< /Type /Page /Parent 3 0 R /MediaBox [0 0 " +
          pageWidth.toFixed(2) +
          " " +
          pageHeight.toFixed(2) +
          "] /Resources << /Font << /F1 4 0 R /F2 5 0 R >> >> /Contents " +
          contentId +
          " 0 R >>"
      );
      pageRefs.push(pageId + " 0 R");
    });

    // Vincula a lista de páginas e o catálogo
    objects[0] = "<< /Type /Catalog /Pages 3 0 R /Outlines 2 0 R >>";
    objects[2] =
      "<< /Type /Pages /Kids [" +
      pageRefs.join(" ") +
      "] /Count " +
      pageRefs.length +
      " >>";

    // Serialização do PDF e cálculo estrito dos offsets da tabela xref
    let pdfStr = "%PDF-1.4\n%\xe2\xe3\xcf\xd3\n";
    const offsets = [];

    objects.forEach((objContent, idx) => {
      offsets.push(pdfStr.length);
      pdfStr += idx + 1 + " 0 obj\n" + objContent + "\nendobj\n";
    });

    const startXref = pdfStr.length;
    pdfStr += "xref\n0 " + (objects.length + 1) + "\n";
    pdfStr += "0000000000 65535 f \n";
    offsets.forEach((off) => {
      pdfStr += String(off).padStart(10, "0") + " 00000 n \n";
    });

    pdfStr +=
      "trailer\n<< /Size " +
      (objects.length + 1) +
      " /Root 1 0 R >>\nstartxref\n" +
      startXref +
      "\n%%EOF";

    return new Blob([strToUtf8(pdfStr)], { type: "application/pdf" });
  }

  // --------------------------------------------------------------------------
  // BLOCO 7: Gerador de Arquivos ZIP de Múltiplos Ficheiros de Código
  // O QUE É SUPOSTO ACONTECER:
  // - Recebe um conjunto de blocos de código extraídos do chat.
  // - Empacota todos os ficheiros (HTML, CSS, JS, Python, etc.) num único .zip.
  // --------------------------------------------------------------------------
  function generateZip(files) {
    const norm = (files || []).map((f) => ({
      name: f.filename || f.name || "ficheiro.txt",
      data: f.content != null ? f.content : f.data || "",
    }));
    const zip = createZip(norm);
    return new Blob([zip], { type: "application/zip" });
  }

  // --------------------------------------------------------------------------
  // BLOCO 8: Disparador de Transferência Nativa no Browser (Trigger Download)
  // O QUE É SUPOSTO ACONTECER:
  // - Cria um Object URL temporário apontando para o Blob na memória.
  // - Injeta dinamicamente uma tag <a> invisível com o atributo 'download'.
  // - Clica programaticamente no elemento para descarregar o ficheiro no Chrome.
  // - Limpa o DOM e liberta a memória do Blob após 1 segundo via revokeObjectURL.
  // --------------------------------------------------------------------------
  function triggerDownload(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 1000);
  }

  // --------------------------------------------------------------------------
  // BLOCO 9: Registo Global da API para o Ecossistema da Extensão
  // O QUE É SUPOSTO ACONTECER:
  // - Expõe o objeto AIHubExporter no escopo global (window), tornando todas as
  //   funções de geração acessíveis aos content scripts, popup e sidepanel.
  // --------------------------------------------------------------------------
  window.AIHubExporter = {
    generateDocx,
    generateXlsx,
    generatePdf,
    generateZip,
    triggerDownload,
    createZip,
  };
})();
