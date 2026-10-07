/* Einlesen von Artikeln: Dateien (.txt/.md/.html) oder eingefügter Text. */
(function () {
  const RR = (window.RR = window.RR || {});

  function htmlToText(html) {
    const doc = new DOMParser().parseFromString(html, "text/html");
    doc.querySelectorAll("script, style, nav, footer, header, noscript").forEach((n) => n.remove());
    const title = doc.querySelector("h1")?.textContent || doc.title || "";
    const body = (doc.body?.innerText || doc.body?.textContent || "").replace(/\n{3,}/g, "\n\n");
    return { title: title.trim(), text: body.trim() };
  }

  function guessTitle(text, fallback) {
    const line = text.split("\n").map((l) => l.trim()).find((l) => l.length > 3);
    if (!line) return fallback;
    return line.length > 90 ? line.slice(0, 87) + "…" : line;
  }

  function guessYear(text) {
    const counts = {};
    (text.match(/\b(19[89]\d|20[0-4]\d)\b/g) || []).forEach((y) => (counts[y] = (counts[y] || 0) + 1));
    // häufigstes Jahr; bei Gleichstand das jüngste
    const best = Object.entries(counts).sort((a, b) => b[1] - a[1] || b[0] - a[0])[0];
    return best ? Number(best[0]) : null;
  }

  function makeArticle(text, name, titleHint) {
    const clean = text.replace(/\r/g, "").trim();
    return {
      id: "a" + Math.random().toString(36).slice(2, 8),
      name: name || "Eingefügter Text",
      title: titleHint || guessTitle(clean, name || "Artikel"),
      year: guessYear(clean),
      words: clean.split(/\s+/).filter(Boolean).length,
      text: clean,
    };
  }

  function readFile(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(reader.error);
      reader.onload = () => {
        let text = String(reader.result || "");
        let title = "";
        if (/\.html?$/i.test(file.name) || /^\s*<(!doctype|html)/i.test(text)) {
          const r = htmlToText(text);
          text = r.text;
          title = r.title;
        }
        resolve(makeArticle(text, file.name, title));
      };
      reader.readAsText(file, "utf-8");
    });
  }

  RR.ingest = { readFile, makeArticle };
})();
