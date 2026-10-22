/*
 * Artikel einlesen: .txt, .md, .html, .docx, .pdf oder eingefügter Text.
 * Mehrere Artikel in einem Text lassen sich mit einer Zeile "---" trennen.
 * Word- und PDF-Bibliotheken werden erst geladen, wenn sie gebraucht werden.
 */
(function () {
  const RR = (window.RR = window.RR || {});

  const LIBS = {
    jszip: "assets/vendor/jszip/jszip.min.js",
    pdf: "assets/vendor/pdfjs/pdf.min.js",
    pdfWorker: "assets/vendor/pdfjs/pdf.worker.min.js",
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
    // Veröffentlichungsdatum aus Metadaten, bevor Skripte (JSON-LD) entfernt werden
    const metaDate =
      doc.querySelector('meta[property="article:published_time"], meta[name="date"], meta[name="pubdate"], meta[itemprop="datePublished"]')?.getAttribute("content") ||
      (html.match(/"datePublished"\s*:\s*"([^"]+)"/) || [])[1] ||
      doc.querySelector("time[datetime]")?.getAttribute("datetime") || "";
    doc.querySelectorAll("script, style, nav, footer, header, noscript, aside, form").forEach((n) => n.remove());
    const title = (doc.querySelector("h1")?.textContent || doc.title || "").trim();
    const root = doc.querySelector("article") || doc.body;
    const blocks = [...root.querySelectorAll("h1, h2, h3, p, li")].map((n) => n.textContent.trim()).filter(Boolean);
    const text = blocks.length ? blocks.join("\n") : (root.textContent || "");
    return { title, text: text.replace(/\n{3,}/g, "\n\n").trim(), date: parseDate(metaDate) };
  }

  /* ---------- Veröffentlichungsdatum ---------- */
  const MONTHS = { januar: 1, jänner: 1, februar: 2, märz: 3, april: 4, mai: 5, juni: 6, juli: 7, august: 8, september: 9, oktober: 10, november: 11, dezember: 12 };
  const iso = (y, m, d) => {
    y = Number(y); m = Number(m); d = Number(d);
    if (y < 100) y += 2000;
    if (!(y >= 1950 && y <= 2100 && m >= 1 && m <= 12 && d >= 1 && d <= 31)) return null;
    return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  };
  // einzelner Datumswert (ISO, 20.09.2025, 20. September 2025)
  function parseDate(v) {
    if (!v) return null;
    v = String(v).trim();
    let m = v.match(/(\d{4})-(\d{2})-(\d{2})/);
    if (m) return iso(m[1], m[2], m[3]);
    m = v.match(/(\d{1,2})\.\s?(\d{1,2})\.\s?(\d{2,4})/);
    if (m) return iso(m[3], m[2], m[1]);
    m = v.match(/(\d{1,2})\.\s?([A-Za-zäÄ]+)\s+(\d{4})/);
    if (m && MONTHS[m[2].toLowerCase()]) return iso(m[3], MONTHS[m[2].toLowerCase()], m[1]);
    if (/^\d{10,13}$/.test(v)) { const d = new Date(Number(v) * (v.length === 10 ? 1000 : 1)); return iso(d.getFullYear(), d.getMonth() + 1, d.getDate()); }
    return null;
  }
  // im Text: "Stand: 20.09.2025", "Veröffentlicht am …", "Sendung vom …", sonst erstes Datum oben im Text; zuletzt der Dateiname
  function detectDate(text, name) {
    const marked = text.match(/\b(?:stand\s*:|veröffentlicht(?:\s+am)?\s*:?|aktualisiert(?:\s+am)?\s*:?|erstellt(?:\s+am)?\s*:|sendung vom|datum\s*:)\s*(?:am\s*)?([^\n]{6,40})/i);
    const fromMarked = marked && parseDate(marked[1]);
    if (fromMarked) return { date: fromMarked, how: "im Text (" + marked[0].split(/[:\s]/)[0] + ")" };
    const head = text.split("\n").slice(0, 4).join(" ");
    const fromHead = parseDate((head.match(/\b\d{1,2}\.\s?\d{1,2}\.\s?\d{4}\b|\b\d{4}-\d{2}-\d{2}\b|\b\d{1,2}\.\s?(?:Januar|Februar|März|April|Mai|Juni|Juli|August|September|Oktober|November|Dezember)\s+\d{4}\b/) || [])[0]);
    if (fromHead) return { date: fromHead, how: "Textanfang" };
    const fn = name && (name.match(/(\d{4})[-_.]?(\d{2})[-_.]?(\d{2})/) || name.match(/(\d{2})\.(\d{2})\.(\d{4})/));
    if (fn) { const d = fn[1].length === 4 ? iso(fn[1], fn[2], fn[3]) : iso(fn[3], fn[2], fn[1]); if (d) return { date: d, how: "Dateiname" }; }
    return { date: null, how: "" };
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
    const pdf = await lib.getDocument({ data: new Uint8Array(buf), isEvalSupported: false }).promise;
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

  /* ---------- Zeichensatz erkennen ---------- */
  // UTF-8 zuerst; sonst Mac Roman oder Windows-1252 (alte Exporte), je nachdem
  // welche Variante plausiblere deutsche Zeichen ergibt.
  function decodeText(buf) {
    const bytes = new Uint8Array(buf);
    try {
      return new TextDecoder("utf-8", { fatal: true }).decode(bytes).replace(/^\uFEFF/, "");
    } catch (e) { /* kein gültiges UTF-8 */ }
    const score = (t) => (t.match(/[äöüÄÖÜß„“–]/g) || []).length * 2 - (t.match(/[ŠšŸŒœÐ§¶ƒ\u0080-\u009F\uFFFD]/g) || []).length * 3;
    const cands = ["macintosh", "windows-1252"].map((enc) => {
      try { return new TextDecoder(enc).decode(bytes); } catch (e) { return ""; }
    });
    return score(cands[0]) > score(cands[1]) ? cands[0] : cands[1];
  }

  /* ---------- Text säubern ---------- */
  // Bekannte Abbinder und Teaser von BR24 & Co., die nicht zum Artikel gehören
  const BOILER = [
    /^das ist die europäische perspektive bei br24\.?$/i,
    /^\*?\s*"?hier ist bayern"?:? der br24 newsletter/i,
    /hier geht's zur anmeldung!?$/i,
    /^(mehr|auch interessant|lesen sie auch|weitere artikel)\b.*$/i,
  ];
  function stripBoilerplate(text) {
    let lines = text.split("\n").map((l) => l.trim());
    lines = lines.filter((l) => l && !BOILER.some((re) => re.test(l)));
    // kurze Teaser-Zeilen (Link-Überschriften) am Ende entfernen
    const isTeaser = (l) => l.split(/\s+/).length < 14 && !/[.!?“"]$/.test(l);
    while (lines.length > 2 && isTeaser(lines[lines.length - 1])) lines.pop();
    return lines.join("\n");
  }

  // zusammengeklebte Sätze ("Bier.Die") wieder trennen
  const unglue = (t) => t.replace(/([a-zäöüß0-9][.!?])([A-ZÄÖÜ][a-zäöüß])/g, "$1 $2");

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

  function makeArticle(text, name, titleHint, extra = {}) {
    const raw = text.replace(/\r\n?/g, "\n");
    // Datum vor dem Säubern suchen (die "Stand:"-Zeile kann im Abbinder stehen)
    const found = extra.date ? { date: extra.date, how: extra.dateHow || "Tabelle" } : detectDate(raw, name);
    const clean = stripBoilerplate(unglue(raw.replace(/[ \t]+/g, " "))).trim();
    return {
      id: "a" + Math.random().toString(36).slice(2, 8),
      name: name || "Eingefügter Text",
      title: titleHint || guessTitle(clean, name || "Artikel"),
      year: found.date ? Number(found.date.slice(0, 4)) : guessYear(clean),
      date: found.date,
      dateHow: found.how,
      words: clean.split(/\s+/).filter(Boolean).length,
      text: clean,
      ...extra,
    };
  }

  // Eingefügter Text: mehrere Artikel mit "---" trennen
  function fromPaste(text) {
    return text
      .replace(/\r\n?/g, "\n")
      .split(/^\s*-{3,}\s*$/m)
      .map((t) => t.trim())
      .filter((t) => t.length >= 40)
      .map((t, i, arr) => makeArticle(t, arr.length > 1 ? `Eingefügt (${i + 1})` : "Eingefügter Text"));
  }

  /* ---------- Tabellen-Export (CSV/JSON mit Textspalte) ---------- */
  // CSV nach RFC 4180: Anführungszeichen, Zeilenumbrüche in Feldern
  function parseCsvRows(text) {
    const first = text.split("\n")[0];
    const sep = (first.match(/;/g) || []).length > (first.match(/,/g) || []).length ? ";" : first.includes("\t") ? "\t" : ",";
    const rows = [];
    let row = [], cell = "", q = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (q) {
        if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; }
        else if (c === '"') q = false;
        else cell += c;
      } else if (c === '"') q = true;
      else if (c === sep) { row.push(cell); cell = ""; }
      else if (c === "\n") { row.push(cell); rows.push(row); row = []; cell = ""; }
      else if (c !== "\r") cell += c;
    }
    if (cell || row.length) { row.push(cell); rows.push(row); }
    return rows.filter((r) => r.some((x) => x.trim()));
  }

  const COL = {
    date: /^(datum|date|published|publishdate|pubdate|publication.?date|veröffentlicht|erstellt|created|stand)/i,
    title: /^(titel|title|headline|überschrift|ueberschrift|schlagzeile)/i,
    teaser: /^(teaser|lead|vorspann|description|beschreibung|kurztext)/i,
    text: /^(text|body|inhalt|content|artikel|fulltext|volltext|artikeltext)/i,
    url: /^(url|link|permalink)/i,
  };
  function recordsToArticles(records, name) {
    if (!records.length) return [];
    const keys = Object.keys(records[0]);
    const pick = (re) => keys.find((k) => re.test(k.trim()));
    const kd = pick(COL.date), kt = pick(COL.title), kx = pick(COL.text), kl = pick(COL.teaser), ku = pick(COL.url);
    if (!kx && !kl) throw new Error("Die Tabelle hat keine Textspalte (z. B. „text“ oder „inhalt“).");
    return records.map((r, i) => {
      const body = [kt && r[kt], kl && r[kl], kx && r[kx]].filter(Boolean).join("\n");
      const d = kd && parseDate(r[kd]);
      return body.trim().length >= 40 ? makeArticle(body, `${name} · Zeile ${i + 1}`, kt ? String(r[kt]).trim() : null, { date: d, dateHow: d ? "Tabelle" : "", url: ku ? r[ku] : "" }) : null;
    }).filter(Boolean);
  }
  function tableToArticles(text, name) {
    if (/\.json$/i.test(name) || /^\s*[[{]/.test(text)) {
      const j = JSON.parse(text);
      const list = Array.isArray(j) ? j : j.articles || j.items || j.data || j.results || [];
      return recordsToArticles(list, name);
    }
    const rows = parseCsvRows(text);
    const head = rows[0].map((h) => h.trim());
    return recordsToArticles(rows.slice(1).map((r) => Object.fromEntries(head.map((h, i) => [h, r[i] || ""]))), name);
  }

  /* ---------- ZIP-Archiv ---------- */
  async function zipToArticles(buf, onProgress) {
    await loadScript(LIBS.jszip);
    const zip = await window.JSZip.loadAsync(buf);
    const entries = Object.values(zip.files).filter((f) => !f.dir && !/(^|\/)(__MACOSX|\.)/.test(f.name) && /\.(txt|md|html?|docx|pdf|csv|json)$/i.test(f.name));
    const out = [];
    for (let i = 0; i < entries.length; i++) {
      const f = entries[i];
      try { out.push(...(await readBuffer(f.name.split("/").pop(), await f.async("arraybuffer")))); } catch (e) { /* einzelne Datei überspringen */ }
      if (onProgress) onProgress(i + 1, entries.length);
    }
    return out;
  }

  async function readFile(file, onProgress) {
    return readBuffer(file.name, await file.arrayBuffer(), onProgress);
  }

  async function readBuffer(name, buf, onProgress) {
    const lower = name.toLowerCase();
    if (lower.endsWith(".zip")) return zipToArticles(buf, onProgress);
    if (lower.endsWith(".docx")) return [makeArticle(await docxToText(buf), name)];
    if (lower.endsWith(".pdf")) return [makeArticle(await pdfToText(buf), name)];
    if (lower.endsWith(".doc")) throw new Error("Altes .doc-Format – bitte als .docx oder .pdf speichern");
    const text = decodeText(buf);
    if (/\.(csv|json|tsv)$/.test(lower)) return tableToArticles(text, name);
    if (/\.html?$/.test(lower) || /^\s*<(!doctype|html)/i.test(text)) {
      const r = htmlToText(text);
      return [makeArticle(r.text, name, r.title, r.date ? { date: r.date, dateHow: "HTML-Metadaten" } : {})];
    }
    // .txt/.md können ebenfalls mehrere Artikel mit "---" enthalten
    const parts = fromPaste(text);
    return parts.length > 1 ? parts.map((p, i) => ({ ...p, name: `${name} (${i + 1})` })) : [makeArticle(text, name)];
  }

  RR.ingest = { readFile, readBuffer, makeArticle, fromPaste, decodeText, stripBoilerplate, detectDate, parseDate, tableToArticles };
})();
