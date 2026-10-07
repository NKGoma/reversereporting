/* Start: Demo-Fall, eigene Artikel hochladen, gespeicherte Blueprints. */
(function () {
  const RR = window.RR;
  const { esc, icon, toast } = RR.ui;
  const A = () => RR.app;
  const S = () => RR.app.state;

  const FLOW = [
    ["archive", "Archiv lesen", "Muster in alten Artikeln"],
    ["list", "Blueprint", "Checkliste für die nächste Ausgabe"],
    ["bot", "Agent recherchiert", "Quellen, Werte, Entwürfe"],
    ["scale", "Abgleich", "Abweichungen und Lücken"],
    ["pen", "Story-Entwurf", "mit markierten Lücken"],
  ];

  RR.views.home = function () {
    const s = S();
    const lib = A().library.all();
    const n = s.articles.length;
    const ai = s.engine === "ai";
    return `
    <section class="home">
      <div class="hero">
        <p class="eyebrow">Reverse Reporting · Prototyp</p>
        <h1>Das Archiv weiß, was jedes Jahr wieder recherchiert werden muss.</h1>
        <p class="lead">Lade frühere Artikel einer wiederkehrenden Geschichte hoch. Das Tool erkennt die festen Bausteine und baut daraus eine Checkliste. Ein Agent erledigt, was er selbst finden kann – dir bleibt, was Journalismus braucht.</p>
        <ol class="flow">${FLOW.map(([ic, t, d], i) => `<li><span class="flow-ic">${icon(ic)}</span><span><strong>${i + 1}. ${t}</strong><small>${d}</small></span></li>`).join("")}</ol>
      </div>

      <div class="start-grid">
        <article class="start-card start-demo">
          <p class="eyebrow">In 60 Sekunden</p>
          <h2>Demo: Wiesn-Bierpreise</h2>
          <p>Drei fiktive Beispielartikel aus 2023 bis 2025 – der ganze Ablauf mit einem Klick, ohne Upload.</p>
          <ul class="sample-list">${RR.SAMPLES.articles.map((a) => `<li>${icon("doc")}<span>${esc(a.text.split("\n")[0])}</span></li>`).join("")}</ul>
          <button class="btn btn-primary btn-lg" data-act="demo" type="button">${icon("play")} Demo starten</button>
        </article>

        <article class="start-card start-upload">
          <p class="eyebrow">Eigene Artikel</p>
          <h2>Archiv hochladen</h2>
          <label class="dropzone" id="dropzone">
            <input type="file" id="file-input" accept=".txt,.md,.html,.htm,.docx,.pdf,text/plain,text/html,text/markdown,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document" multiple hidden>
            ${icon("upload", "dz-ic")}
            <strong>Dateien hierher ziehen oder klicken</strong>
            <span class="muted small">.txt · .md · .html · .docx · .pdf – am besten 2 bis 5 Ausgaben derselben Geschichte</span>
          </label>
          <details class="paste-box" ${n ? "" : ""}>
            <summary>Text einfügen</summary>
            <label for="paste-text" class="label">Artikeltext (mehrere Artikel mit einer Zeile <code>---</code> trennen)</label>
            <textarea id="paste-text" rows="6" placeholder="Überschrift in die erste Zeile, darunter der Text …"></textarea>
            <button class="btn btn-secondary" data-act="add-paste" type="button">Text hinzufügen</button>
          </details>
          ${n ? `<ul class="article-chips">${s.articles.map((a, i) => `
            <li class="chip-article">
              <span class="chip-no">A${i + 1}</span>
              <span class="chip-main"><strong>${esc(a.title)}</strong><small>${a.year || "Jahr ?"} · ${a.words} Wörter${a.sample ? " · Beispieltext" : ""}</small></span>
              <button class="icon-btn" data-act="remove-article" data-id="${a.id}" type="button" aria-label="Artikel entfernen">${icon("x")}</button>
            </li>`).join("")}</ul>` : ""}
          <div class="engine-row">
            <span class="label">Analyse mit</span>
            <div class="seg" role="radiogroup" aria-label="Analyse-Engine">
              <button type="button" role="radio" aria-checked="${!ai}" class="${!ai ? "is-on" : ""}" data-act="set-engine" data-engine="offline">Offline-Engine</button>
              <button type="button" role="radio" aria-checked="${ai}" class="${ai ? "is-on" : ""}" data-act="set-engine" data-engine="ai">${icon("spark")} Claude</button>
            </div>
          </div>
          <div class="start-actions">
            <span class="muted small">${n === 1 ? "Ein Artikel reicht zum Testen – Muster werden ab zwei Ausgaben verlässlich." : n ? `${n} Artikel bereit.` : "Noch keine Artikel."}</span>
            <button class="btn btn-primary" data-act="analyze" type="button" ${n ? "" : "disabled"}>Muster erkennen ${icon("arrow")}</button>
          </div>
        </article>
      </div>

      <section class="library">
        <div class="section-head">
          <h2>Gespeicherte Blueprints</h2>
          <label class="btn btn-ghost btn-sm">${icon("upload")} Importieren<input type="file" accept=".json,application/json" data-act="lib-import" hidden></label>
        </div>
        ${lib.length ? `<div class="lib-grid">${lib.map((b) => `
          <article class="lib-card">
            <p class="eyebrow">${b.engine === "ai" ? "KI-Blueprint" : "Blueprint"} · gespeichert ${new Date(b.savedAt).toLocaleDateString("de-DE")}</p>
            <h3>${esc(b.name)}</h3>
            <p class="muted small">${b.items.length} Punkte · zuletzt für ${b.lastYear}</p>
            <div class="lib-actions">
              <button class="btn btn-primary btn-sm" data-act="lib-start" data-id="${b.id}" type="button">${icon("play")} Ausgabe ${b.lastYear + 1} recherchieren</button>
              <button class="btn btn-ghost btn-sm" data-act="lib-export" data-id="${b.id}" type="button">Export</button>
              <button class="btn btn-ghost btn-sm" data-act="lib-delete" data-id="${b.id}" type="button">${icon("trash")}<span>Löschen</span></button>
            </div>
          </article>`).join("")}</div>`
        : `<p class="muted empty-note">Noch keine. Am Ende einer Recherche speicherst du den Blueprint – nächstes Jahr startet die Recherche dann mit einem Klick.</p>`}
      </section>
    </section>`;
  };

  RR.after.home = function () {
    const dz = document.getElementById("dropzone");
    if (!dz) return;
    document.getElementById("file-input").addEventListener("change", (e) => { addFiles([...e.target.files]); e.target.value = ""; });
    ["dragenter", "dragover"].forEach((t) => dz.addEventListener(t, (e) => { e.preventDefault(); dz.classList.add("is-over"); }));
    ["dragleave", "drop"].forEach((t) => dz.addEventListener(t, (e) => { e.preventDefault(); dz.classList.remove("is-over"); }));
    dz.addEventListener("drop", (e) => addFiles([...e.dataTransfer.files]));
  };

  async function addFiles(files) {
    const s = S();
    for (const f of files) {
      try {
        const arts = await RR.ingest.readFile(f);
        const ok = arts.filter((a) => a.text.length >= 40);
        if (!ok.length) toast(`„${f.name}“ enthält kaum Text.`, "warn");
        s.articles.push(...ok);
      } catch (err) {
        toast(`„${f.name}“: ${err.message || "konnte nicht gelesen werden"}`, "warn");
      }
    }
    resetWork();
    A().save();
    A().render();
  }

  function resetWork() {
    const s = S();
    s.analysis = null;
    s.checklist = [];
    s.results = {};
    s.include = {};
  }

  // Analyse starten (offline oder mit Claude)
  async function runAnalysis(force) {
    const s = S();
    const useAI = s.engine === "ai" && RR.ai.hasKey() && !force;
    const main = document.getElementById("main");
    if (useAI) {
      main.innerHTML = `<section class="loading"><div class="pulse">${icon("spark")}</div><h2>Claude liest ${s.articles.length} Artikel …</h2><p class="muted">Muster erkennen, Belegstellen suchen, Checkliste entwerfen. Das dauert etwa 20 bis 60 Sekunden.</p></section>`;
      try {
        s.analysis = await RR.ai.analyze(s.articles);
      } catch (err) {
        toast(`KI-Modus: ${err.message} – Offline-Engine übernimmt.`, "warn");
        s.analysis = RR.analyze(s.articles);
      }
    } else {
      s.analysis = RR.analyze(s.articles, force ? { force } : {});
    }
    s.include = {};
    s.analysis.patterns.forEach((p) => (s.include[p.id] = p.recurring || !!p.suggested));
    s.checklist = [];
    s.results = {};
    s.ui = { article: 0, focus: null };
    s.screen = "archive";
    A().save();
    A().render();
    window.scrollTo({ top: 0 });
  }
  RR.app.runAnalysis = runAnalysis;

  Object.assign(RR.act, {
    demo: () => {
      const s = S();
      s.articles = RR.SAMPLES.articles.map((a) => RR.ingest.makeArticle(a.text, a.name, null, { sample: true }));
      s.engine = "offline";
      runAnalysis();
    },
    analyze: () => runAnalysis(),
    "add-paste": () => {
      const ta = document.getElementById("paste-text");
      const arts = RR.ingest.fromPaste(ta.value);
      if (!arts.length) return toast("Bitte mindestens einen Absatz Text einfügen.", "warn");
      S().articles.push(...arts);
      resetWork();
      A().save();
      A().render();
      toast(arts.length > 1 ? `${arts.length} Artikel hinzugefügt.` : "Artikel hinzugefügt.");
    },
    "remove-article": (el) => {
      const s = S();
      s.articles = s.articles.filter((a) => a.id !== el.dataset.id);
      resetWork();
      A().save();
      A().render();
    },
    "set-engine": (el) => {
      const s = S();
      if (el.dataset.engine === "ai" && !RR.ai.hasKey()) { RR.openDrawer({ kind: "settings", thenEngine: true }); return; }
      s.engine = el.dataset.engine;
      A().save();
      A().render();
    },
    "lib-start": (el) => {
      const b = A().library.all().find((x) => x.id === el.dataset.id);
      if (!b) return;
      const s = A().fresh();
      s.analysis = { ...b.analysis, targetYear: b.lastYear + 1 };
      s.articles = [];
      A().state = s;
      s.checklist = b.items.map((it) => ({ ...it, id: "i" + Math.random().toString(36).slice(2, 8), title: it.title.replace(String(b.lastYear), String(b.lastYear + 1)).replace(String(b.lastYear - 1), String(b.lastYear)) }));
      s.screen = "research";
      A().save();
      A().render();
      toast(`Blueprint geladen – Recherche ${b.lastYear + 1}.`);
    },
    "lib-export": (el) => {
      const b = A().library.all().find((x) => x.id === el.dataset.id);
      if (b) RR.ui.offerFile(`blueprint-${b.name.replace(/[^a-z0-9äöüß]+/gi, "-").toLowerCase()}.json`, JSON.stringify(b, null, 2), "application/json");
    },
    "lib-delete": (el) => {
      if (!el.dataset.armed) {
        el.dataset.armed = "1";
        el.querySelector("span").textContent = "Wirklich?";
        setTimeout(() => { if (el.isConnected) { delete el.dataset.armed; el.querySelector("span").textContent = "Löschen"; } }, 4000);
        return;
      }
      A().library.put(A().library.all().filter((x) => x.id !== el.dataset.id));
      A().render();
    },
  });

  RR.onChange["lib-import"] = async (el) => {
    const f = el.files[0];
    if (!f) return;
    try {
      const b = JSON.parse(await f.text());
      if (!b.items || !b.analysis) throw new Error("kein Blueprint");
      b.id = "b" + Date.now().toString(36);
      A().library.put([b, ...A().library.all()]);
      toast("Blueprint importiert.");
      A().render();
    } catch (err) {
      toast("Datei ist kein gültiger Blueprint.", "warn");
    }
  };
})();
