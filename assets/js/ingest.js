/*
 * Artikel einlesen: .txt, .md, .html, .docx, .pdf oder eingefügter Text.
 * Mehrere Artikel in einem Text lassen sich mit einer Zeile "---" trennen.
 * Word- und PDF-Bibliotheken werden erst geladen, wenn sie gebraucht werden.
 */
(function () {
  const RR = (window.RR = window.RR || {});

  const LIBS = {
    jszip: "https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js",
    pdf: "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js",
    pdfWorker: "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js",
  };
  const loaded = {};
  function loadScript(src) {
    if (!loaded[src]) {
      loaded[src] = new Promise((resolve, reject) => {
        const s = Object.assign(document.createElement("script"), { src, async: true });
        s.onload = resolve;
        s.onerror = () => reject(new Error("Bibliothek konnte nicht geladen werden (offline?)"));
        document.head.appendChild(s);
      });
    }
    return loaded[src];
  }

  function htmlToText(html) {
    const doc = new DOMParser().parseFromString(html, "text/html");
    doc.querySelectorAll("script, style, nav, footer, header, noscript, aside, form").forEach((n) => n.remove());
    const title = (doc.querySelector("h1")?.textContent || doc.title || "").trim();
    const root = doc.querySelector("article") || doc.body;
    const blocks = [...root.querySelectorAll("h1, h2, h3, p, li")].map((n) => n.textContent.trim()).filter(Boolean);
    const text = blocks.length ? blocks.join("\n") : (root.textContent || "");
    return { title, text: text.replace(/\n{3,}/g, "\n\n").trim() };
  }

  async function docxToText(buf) {
    await loadScript(LIBS.jszip);
    const zip = await window.JSZip.loadAsync(buf);
    const xml = await zip.file("word/document.xml").async("string");
    const doc = new DOMParser().parseFromString(xml, "application/xml");
    const W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
    return [...doc.getElementsByTagNameNS(W, "p")]
      .map((p) => [...p.getElementsByTagNameNS(W, "t")].map((t) => t.textContent).join(""))
      .filter((l) => l.trim())
      .join("\n");
  }

  async function pdfToText(buf) {
    await loadScript(LIBS.pdf);
    const lib = window.pdfjsLib;
    lib.GlobalWorkerOptions.workerSrc = LIBS.pdfWorker;
    const pdf = await lib.getDocument({ data: new Uint8Array(buf) }).promise;
    const lines = [];
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const tc = await page.getTextContent();
      let line = "", lastY = null;
      for (const it of tc.items) {
        const y = it.transform ? it.transform[5] : null;
        if (lastY !== null && y !== null && Math.abs(y - lastY) > 4) { lines.push(line); line = ""; }
        line += it.str + (it.hasEOL ? "\n" : "");
        lastY = y;
      }
      lines.push(line);
    }
    // Zeilenumbrüche innerhalb von Absätzen glätten
    return lines.join("\n").replace(/-\n(?=[a-zäöüß])/g, "").replace(/([^.!?:\n])\n(?=[a-zäöüß])/g, "$1 ").trim();
  }

  function guessTitle(text, fallback) {
    const line = text.split("\n").map((l) => l.trim()).find((l) => l.length > 3);
    if (!line) return fallback;
    return line.length > 100 ? line.slice(0, 97) + "…" : line;
  }

  function guessYear(text) {
    const counts = {};
    (text.match(/\b(19[89]\d|20[0-4]\d)\b/g) || []).forEach((y) => (counts[y] = (counts[y] || 0) + 1));
    const best = Object.entries(counts).sort((a, b) => b[1] - a[1] || b[0] - a[0])[0];
    return best ? Number(best[0]) : null;
  }

  function makeArticle(text, name, titleHint, extra) {
    const clean = text.replace(/\r/g, "").replace(/[ \t]+/g, " ").trim();
    return {
      id: "a" + Math.random().toString(36).slice(2, 8),
      name: name || "Eingefügter Text",
      title: titleHint || guessTitle(clean, name || "Artikel"),
      year: guessYear(clean),
      words: clean.split(/\s+/).filter(Boolean).length,
      text: clean,
      ...extra,
    };
  }

  // Eingefügter Text: mehrere Artikel mit "---" trennen
  function fromPaste(text) {
    return text
      .split(/^\s*-{3,}\s*$/m)
      .map((t) => t.trim())
      .filter((t) => t.length >= 40)
      .map((t, i, arr) => makeArticle(t, arr.length > 1 ? `Eingefügt (${i + 1})` : "Eingefügter Text"));
  }

  async function readFile(file) {
    const name = file.name;
    const lower = name.toLowerCase();
    if (lower.endsWith(".docx")) return [makeArticle(await docxToText(await file.arrayBuffer()), name)];
    if (lower.endsWith(".pdf")) return [makeArticle(await pdfToText(await file.arrayBuffer()), name)];
    if (lower.endsWith(".doc")) throw new Error("Altes .doc-Format – bitte als .docx oder .pdf speichern");
    const text = await file.text();
    if (/\.html?$/.test(lower) || /^\s*<(!doctype|html)/i.test(text)) {
      const r = htmlToText(text);
      return [makeArticle(r.text, name, r.title)];
    }
    // .txt/.md können ebenfalls mehrere Artikel mit "---" enthalten
    const parts = fromPaste(text);
    return parts.length > 1 ? parts.map((p, i) => ({ ...p, name: `${name} (${i + 1})` })) : [makeArticle(text, name)];
  }

  RR.ingest = { readFile, makeArticle, fromPaste };
})();
