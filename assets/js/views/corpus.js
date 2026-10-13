/*
 * Themenarchiv: ganzes Archiv zu einem wiederkehrenden Ereignis analysieren.
 * Welche Geschichten erscheinen regelmäßig, wann, mit welchen Aspekten –
 * und daraus ein Plan für den nächsten Zyklus.
 */
(function () {
  const RR = window.RR;
  const { esc, icon, toast } = RR.ui;
  const A = () => RR.app;
  const S = () => RR.app.state;
  const C = () => RR.corpus;
  // Volltexte im Speicher und lokal in IndexedDB (können hunderte Artikel sein);
  // im localStorage-Zustand liegt nur das Ergebnis
  RR.corpusMem = RR.corpusMem || { articles: [] };

  // Gemma-Ergebnisse hängen an der Artikelmenge eines Typs, nicht an seiner (wechselnden) ID
  const sig = (t) => { let h = 5381; const k = t.articleIds.slice().sort().join("|"); for (let i = 0; i < k.length; i++) h = (Math.imul(h, 33) ^ k.charCodeAt(i)) >>> 0; return h.toString(36) + "." + t.articleIds.length; };
  const gem = (t) => { const c = S().corpus; return (c && c.gemma && t && t.articleIds && c.gemma[sig(t)]) || null; };
  const labelOf = (t) => (gem(t) ? gem(t).label : t.label);
  const typeById = (id) => S().corpus.result.types.find((x) => x.id === id);

  /* ---------- Start-Kachel auf der Startseite ---------- */
  RR.corpusEntryHtml = function () {
    const c = S().corpus;
    return `<section class="corpus-entry">
      <div class="ce-text">
        <p class="eyebrow">Neu · Themenarchiv</p>
        <h2>Ganzes Archiv analysieren: Welche Geschichten erscheinen jedes Jahr – und wann?</h2>
        <p>Lade alle Artikel zu einem wiederkehrenden Ereignis hoch (Oktoberfest, Wahlen …). Das Tool erkennt die Story-Typen, ihren typischen Zeitpunkt und die Aspekte, die immer vorkommen – und macht daraus den Plan fürs nächste Mal.</p>
        <div class="ce-demos">
          <button class="btn btn-primary" data-act="corpus-demo" data-id="oktoberfest" type="button">${icon("play")} Demo: Oktoberfest-Archiv</button>
          <button class="btn btn-secondary" data-act="corpus-demo" data-id="wahl" type="button">${icon("play")} Demo: Landtagswahlen</button>
          ${c ? `<button class="btn btn-ghost" data-act="go" data-to="corpus" type="button">Letzte Analyse öffnen</button>` : ""}
        </div>
      </div>
      <label class="dropzone ce-drop" id="corpus-drop">
        <input type="file" id="corpus-input" multiple hidden accept=".zip,.txt,.md,.html,.htm,.docx,.pdf,.csv,.json">
        ${icon("archive", "dz-ic")}
        <strong>Archiv hierher ziehen</strong>
        <span class="muted small">viele Dateien, ein ZIP oder ein Tabellen-Export (CSV/JSON mit Spalten wie datum, titel, text). Das Datum wird aus „Stand: …“, Metadaten oder dem Dateinamen gelesen.</span>
      </label>
    </section>`;
  };

  RR.bindCorpusEntry = function () {
    const dz = document.getElementById("corpus-drop");
    if (!dz) return;
    document.getElementById("corpus-input").addEventListener("change", (e) => { loadFiles([...e.target.files]); e.target.value = ""; });
    ["dragenter", "dragover"].forEach((t) => dz.addEventListener(t, (e) => { e.preventDefault(); dz.classList.add("is-over"); }));
    ["dragleave", "drop"].forEach((t) => dz.addEventListener(t, (e) => { e.preventDefault(); dz.classList.remove("is-over"); }));
    dz.addEventListener("drop", (e) => loadFiles([...e.dataTransfer.files]));
  };

  async function loadFiles(files) {
    const main = document.getElementById("main");
    main.innerHTML = `<section class="loading"><div class="pulse">${icon("archive")}</div><h2 id="ld-title">Archiv wird gelesen …</h2><p class="muted" id="ld-sub">${files.length} Datei(en)</p></section>`;
    const arts = [];
    let failed = 0;
    for (let i = 0; i < files.length; i++) {
      try {
        const got = await RR.ingest.readFile(files[i], (k, n) => { const el = document.getElementById("ld-sub"); if (el) el.textContent = `${files[i].name}: ${k} von ${n} Dateien`; });
        arts.push(...got);
      } catch (e) { failed++; }
      const el = document.getElementById("ld-sub");
      if (el) el.textContent = `${i + 1} von ${files.length} Datei(en) gelesen · ${arts.length} Artikel`;
    }
    // Dubletten (gleicher Titel + Datum) entfernen
    const seen = new Set();
    const unique = arts.filter((a) => a.text.length >= 40).filter((a) => { const k = (a.title || "").toLowerCase() + "|" + (a.date || a.year); if (seen.has(k)) return false; seen.add(k); return true; });
    if (failed) toast(`${failed} Datei(en) konnten nicht gelesen werden.`, "warn");
    if (unique.length < 3) { toast("Für eine Archiv-Analyse braucht es mindestens drei Artikel.", "warn"); A().render(); return; }
    const dupes = arts.length - unique.length;
    if (dupes > 0) toast(`${dupes} Dublette(n) oder fast leere Dateien übersprungen.`);
    await RR.store.put("corpus", "current", { articles: unique, savedAt: Date.now() });
    run(unique, {});
  }

  function run(articles, opts) {
    const s = S();
    RR.corpusMem.articles = articles;
    const result = C().analyzeCorpus(articles, opts);
    const keep = opts.keep && s.corpus ? s.corpus.gemma : null;
    const classified = !!(opts.keep && s.corpus && s.corpus.classified);
    s.corpus = { classified, result, eventId: opts.eventId || result.event.id, anchors: opts.anchors || {}, nextAnchor: opts.nextAnchor || "", sample: opts.sample || null, assign: opts.assign || {}, gemma: keep || {} };
    s.screen = "corpus";
    RR.closeDrawer && s.drawer && RR.closeDrawer();
    A().save();
    A().render();
    window.scrollTo({ top: 0 });
  }
  async function rerun(changes) {
    const c = S().corpus;
    if (!RR.corpusMem.articles.length) await restoreArticles();
    if (!RR.corpusMem.articles.length) return toast("Die Artikel sind nicht mehr im Speicher – bitte das Archiv erneut hochladen.", "warn");
    run(RR.corpusMem.articles, { eventId: c.eventId, anchors: c.anchors, nextAnchor: c.nextAnchor, sample: c.sample, assign: c.assign, keep: true, ...changes });
  }
  // nach dem Neuladen: Demo-Archive neu erzeugen, hochgeladene aus IndexedDB holen
  async function restoreArticles() {
    const c = S().corpus;
    if (c && c.sample && RR.CORPUS_SAMPLES[c.sample]) { RR.corpusMem.articles = sampleArticles(c.sample); return; }
    const saved = await RR.store.get("corpus", "current");
    if (saved && saved.articles) RR.corpusMem.articles = saved.articles;
  }

  // feste IDs, damit Demo-Artikel nach dem Neuladen wiedergefunden werden
  const sampleArticles = (key) => RR.CORPUS_SAMPLES[key].make().map((x) => RR.ingest.makeArticle(x.text, x.name, null, { sample: true, id: "s_" + key + "_" + x.name }));

  /* ---------- Story-Kalender (SVG) ---------- */
  const CYCLE_COLORS = ["var(--p0)", "var(--p2)", "var(--p1)", "var(--p3)", "var(--p6)", "var(--p5)", "var(--p4)", "var(--p7)"];
  function scaleFor(types) {
    const rels = types.flatMap((t) => t.points.map((p) => p.rel));
    const lo = Math.min(-20, ...rels), hi = Math.max(20, ...rels);
    // stückweise linear: lange Vorlaufzeit gestaucht, Ereigniszeitraum gedehnt
    const dom = [lo - 5, Math.min(-30, lo / 2), -7, 0, Math.max(18, hi * 0.6), hi + 5].sort((a, b) => a - b);
    const ran = [0, 0.2, 0.42, 0.56, 0.9, 1];
    return (d) => {
      if (d <= dom[0]) return 0;
      for (let i = 1; i < dom.length; i++) if (d <= dom[i]) return ran[i - 1] + ((d - dom[i - 1]) / (dom[i] - dom[i - 1] || 1)) * (ran[i] - ran[i - 1]);
      return 1;
    };
  }
  function calendarSvg(r) {
    const types = r.types.filter((t) => t.median != null).slice().sort((a, b) => a.median - b.median);
    if (!types.length) return `<p class="empty-note">Keine datierten Artikel – ohne Datum lässt sich kein Kalender bilden.</p>`;
    const LW = 210, W = 1000, RW = 16, row = 30, top = 34, H = top + types.length * row + 14;
    const f = scaleFor(types);
    const X = (d) => LW + f(d) * (W - LW - RW);
    const ticks = [-180, -120, -90, -60, -30, -14, -7, 0, 7, 14, 21, 30, 45].filter((d) => X(d) > LW + 2 && X(d) < W - RW - 2);
    const cyc = r.cycles.map((c) => c.key);
    const dur = 16;
    return `<svg class="cal" viewBox="0 0 ${W} ${H}" role="img" aria-label="Story-Kalender: typischer Zeitpunkt jedes Story-Typs relativ zum ${esc(r.event.anchorLabel)}">
      <rect class="cal-event" x="${X(0)}" y="${top - 8}" width="${Math.max(2, X(r.event.id === "oktoberfest" ? dur - 1 : 0) - X(0))}" height="${H - top}"/>
      ${ticks.map((d) => `<line class="cal-grid ${d === 0 ? "is-zero" : ""}" x1="${X(d)}" x2="${X(d)}" y1="${top - 8}" y2="${H - 6}"/><text class="cal-tick" x="${X(d)}" y="${top - 14}" text-anchor="middle">${d === 0 ? esc(r.event.anchorLabel) : (d > 0 ? "+" : "−") + Math.abs(d)}</text>`).join("")}
      ${types.map((t, i) => {
        const y = top + i * row + row / 2;
        return `<g class="cal-row" data-act="ctype-open" data-id="${t.id}" role="button" tabindex="0" aria-label="${esc(labelOf(t))}: Tag ${t.median}">
          <rect class="cal-hit" x="0" y="${y - row / 2}" width="${W}" height="${row}"/>
          <circle class="cal-reg reg-${t.regularity}" cx="10" cy="${y}" r="4.5"/>
          <text class="cal-label" x="22" y="${y + 4}">${esc(((l) => (l.length > 26 ? l.slice(0, 25) + "…" : l))(labelOf(t)))}</text>
          ${t.q1 != null ? `<line class="cal-iqr" x1="${X(t.q1)}" x2="${Math.max(X(t.q3), X(t.q1) + 1)}" y1="${y}" y2="${y}"/>` : ""}
          ${t.points.map((p) => `<circle class="cal-pt" cx="${X(p.rel)}" cy="${y}" r="4" style="fill:${CYCLE_COLORS[cyc.indexOf(p.cycle) % CYCLE_COLORS.length]}"><title>${esc(p.cycle)}: Tag ${p.rel}</title></circle>`).join("")}
          <path class="cal-med" d="M${X(t.median)} ${y - 8} l5 8 l-5 8 l-5 -8 z"/>
        </g>`;
      }).join("")}
    </svg>`;
  }

  /* ---------- Bildschirm ---------- */
  const regLabel = (t, r) => `${t.cycles.length}/${r.cycles.length} ${r.event.id === "wahl" ? "Wahlen" : "Jahre"}`;
  const relLabel = (d) => (d == null ? "–" : d === 0 ? "Tag 0" : `Tag ${d > 0 ? "+" : "−"}${Math.abs(d)}`);

  RR.views.corpus = function () {
    const c = S().corpus;
    if (!c) return RR.views.home();
    const r = c.result;
    const reg = r.types.filter((t) => t.regularity === "regelmäßig").length;
    const disc = r.types.filter((t) => t.discovered).length;
    const years = r.years.length ? `${r.years[0]}–${r.years[r.years.length - 1]}` : "";
    const needsAnchors = r.event.id !== "oktoberfest";
    return `
    <section class="screen corpus">
      <header class="screen-head">
        <div class="screen-title">
          <p class="eyebrow">Themenarchiv · ${esc(r.event.label)}</p>
          <h1>Was jedes Mal erscheint – und wann</h1>
          <p class="lead">${r.total} Artikel · ${r.cycles.length} ${r.event.id === "wahl" ? (r.cycles.length === 1 ? "Wahl" : "Wahlen") : r.cycles.length === 1 ? "Jahrgang" : "Jahrgänge"} (${years}) · ${r.types.length} Story-Typen${r.undated ? ` · <strong>${r.undated} ohne Datum</strong>` : ""}${c.sample ? " · fiktives Demo-Archiv" : ""}</p>
        </div>
        <div class="tally">
          <div class="tally-item lvl-ok">${icon("check")}<strong>${reg}</strong><span>regelmäßig</span></div>
          <div class="tally-item lvl-warn">${icon("clock")}<strong>${r.types.length - reg}</strong><span>meistens/selten</span></div>
          <div class="tally-item lvl-ai">${icon("spark")}<strong>${disc}</strong><span>neu entdeckt</span></div>
        </div>
      </header>

      <section class="card anchors">
        <div class="section-head"><h2>${esc(r.event.anchorLabel)} pro ${r.event.id === "wahl" ? "Wahl" : "Jahr"}</h2>
          <label class="small muted">Ereignis
            <select data-act="corpus-event" aria-label="Ereignis">
              ${["oktoberfest", "wahl", "custom"].map((id) => `<option value="${id}" ${c.eventId === id ? "selected" : ""}>${id === "custom" ? "Eigenes Ereignis" : esc(RR.EVENTS[id].label)}</option>`).join("")}
            </select></label></div>
        <div class="anchor-list">${r.cycles.map((cy) => `
          <label class="anchor"><span>${esc(cy.label.replace(/ \d{1,2}\. \w+ \d{4}$/, ""))} <small>${cy.n} Artikel</small></span>
            ${needsAnchors ? `<input type="date" value="${cy.anchor}" data-act="corpus-anchor" data-key="${esc(cy.key)}">` : `<strong>${C().deDate(cy.anchor)}</strong>`}</label>`).join("")}
        </div>
        <p class="muted small">${r.event.id === "oktoberfest" ? "Wiesn-Start berechnet (Samstag 15 Tage vor dem ersten Oktobersonntag; Dauer laut Stadt München)." : r.event.id === "wahl" ? "Wahltage aus den Artikeln erkannt – bei Bedarf korrigieren." : "Ohne bekanntes Ereignis: Tag mit den meisten Artikeln pro Jahr. Bei Bedarf korrigieren."}${r.unassigned ? ` ${r.unassigned} Artikel liegen keinem Termin nahe genug.` : ""}</p>
      </section>

      ${gemmaCard(c)}

      <section class="card">
        <div class="section-head"><div><p class="eyebrow">Story-Kalender</p><h2>Wann welche Geschichte erscheint</h2></div>
          <span class="legend">${r.cycles.map((cy, i) => `<span class="lg-dot" style="background:${CYCLE_COLORS[i % CYCLE_COLORS.length]}"></span>${esc(cy.key.length === 4 ? cy.key : cy.key.slice(0, 4))}`).join("")}<span class="lg-med"></span>Median</span></div>
        <p class="muted small">Jeder Punkt ist ein Artikel, platziert nach Tagen relativ zum ${esc(r.event.anchorLabel)}. Der Balken zeigt die mittlere Hälfte, die Raute den typischen Tag. Die Zeitachse ist vor dem Ereignis gestaucht. Zeile anklicken für Details.</p>
        <div class="cal-wrap">${calendarSvg(r)}</div>
      </section>

      <section class="card">
        <div class="section-head"><div><p class="eyebrow">Story-Typen</p><h2>Regelmäßigkeit, Zeitpunkt, Kernaspekte</h2></div></div>
        <div class="table-wrap"><table class="data ctable">
          <thead><tr><th>Story-Typ</th><th>Erscheint</th><th>Zeitpunkt</th><th>Was immer vorkommt</th><th></th></tr></thead>
          <tbody>${r.types.map((t) => `<tr>
            <td><button type="button" class="link-btn" data-act="ctype-open" data-id="${t.id}">${esc(labelOf(t))}</button>${t.discovered ? ` <span class="badge badge-ai">entdeckt</span>` : ""}${gem(t) ? ` <span class="badge badge-ai" title="von Gemma vertieft">${icon("spark", "ic-xs")}Gemma</span>` : ""}<small>${t.n} Artikel${gem(t) && gem(t).label !== t.label ? ` · Regel-Engine: ${esc(t.label)}` : ""}</small></td>
            <td><span class="reg reg-${t.regularity}">${t.regularity}</span><small>${regLabel(t, r)}</small></td>
            <td class="num">${relLabel(t.median)}<small>${esc(t.phase || "")}</small></td>
            <td>${gem(t) && gem(t).aspects.length ? gem(t).aspects.slice(0, 4).map((a) => `<span class="chip ${a.quote ? "" : "chip-term"}" title="${esc(a.quote || "ohne Beleg im Text")}">${esc(a.label)}${a.quote ? ` ${icon("check", "ic-xs")}` : ""}</span>`).join(" ") : (t.aspects.length ? t.aspects.slice(0, 4).map((a) => `<span class="chip">${esc(a.label)} <b>${Math.round(a.share * 100)} %</b></span>`) : (t.terms || []).slice(0, 4).map((w) => `<span class="chip chip-term">${esc(w)}</span>`)).join(" ")}</td>
            <td><button class="btn btn-ghost btn-sm" data-act="ctype-blueprint" data-id="${t.id}" type="button">Blueprint ${icon("arrow")}</button></td>
          </tr>`).join("")}</tbody></table></div>
        ${r.singles.length ? `<p class="muted small">${r.singles.length} Einzelstücke ohne wiederkehrendes Muster.</p>` : ""}
      </section>

      ${planHtml(c)}

      <div class="actions">
        <button class="btn btn-ghost" data-act="home" type="button">Zur Startseite</button>
        ${c.sample ? "" : `<button class="btn btn-ghost" data-act="corpus-delete" type="button">${icon("trash")}<span>Archiv von diesem Gerät löschen</span></button>`}
      </div>
    </section>`;
  };

  /* ---------- Gemma: Story-Typen vertiefen ---------- */
  const job = { running: false, cur: null, done: 0, total: 0, prog: null, step: "" };
  function gemmaCard(c) {
    const r = c.result;
    const todo = r.types.filter((t) => !gem(t)).length;
    const st = RR.ai.state.status;
    if (job.running) {
      return `<section class="card gemma-card" id="gemma-card">${gemmaJobHtml()}</section>`;
    }
    const done = r.types.length - todo;
    return `<section class="card gemma-card" id="gemma-card">
      <div class="section-head"><div><p class="eyebrow">${icon("spark")} Lokale KI</p><h2>${done && !todo ? "Alle Story-Typen von Gemma vertieft" : "Mit Gemma vertiefen"}</h2></div>
        ${todo ? `<button class="btn btn-primary" data-act="corpus-gemma" type="button" ${st === "down" || st === "nomodel" ? "disabled" : ""}>${icon("spark")} ${done ? `Restliche ${todo} Typen vertiefen` : `${todo} Story-Typen vertiefen`}</button>` : ""}</div>
      <p class="muted small">${st === "down" || st === "nomodel" ? `${esc(RR.ai.statusText())} – <button type="button" class="link-btn" data-act="open-settings">Einrichten</button>. Die Regel-Analyse oben ist vollständig; Gemma ergänzt sie.` :
        `Gemma liest pro Story-Typ bis zu sechs Beispiele (Titel und Anfang) und liefert einen redaktionellen Namen, die Kernaspekte mit wörtlichem Beleg, typische Quellen und was nur die Reporterin / der Reporter erledigen kann.${r.singles.length && !c.classified && (RR.EVENTS[r.event.id] || {}).types ? ` Vorher ordnet Gemma die ${r.singles.length} Einzelstücke anhand der Überschrift bekannten Typen zu.` : ""} Etwa 20–60 Sekunden pro Typ, läuft lokal, Ergebnisse werden zwischengespeichert.`}</p>
    </section>`;
  }
  function gemmaJobHtml() {
    return `<div class="section-head"><div><p class="eyebrow">${icon("spark")} Gemma arbeitet · ${job.done} von ${job.total}</p><h2>${esc(job.step)}</h2></div>
        <button class="btn btn-ghost" data-act="llm-cancel" type="button">${icon("x")} Abbrechen</button></div>
      <span class="meter"><span style="width:${job.total ? Math.round((job.done / job.total) * 100) : 0}%"></span></span>
      <div id="gemma-prog">${RR.llmProgressHtml(job.prog || { phase: "prompt" })}</div>`;
  }
  const paintJob = () => { const el = document.getElementById("gemma-card"); if (el && S().screen === "corpus") el.innerHTML = gemmaJobHtml(); };

  async function runGemma() {
    const c = S().corpus;
    if (job.running || !c) return;
    if (!RR.ai.ready()) await RR.ai.check();
    if (!RR.ai.ready()) { RR.openDrawer({ kind: "settings" }); return; }
    if (!RR.corpusMem.articles.length) await restoreArticles();
    if (!RR.corpusMem.articles.length) return toast("Die Artikel sind nicht mehr im Speicher – bitte das Archiv erneut hochladen.", "warn");
    const byId = new Map(RR.corpusMem.articles.map((a) => [a.id, a]));
    const ev0 = c.result.event;
    const known = (RR.EVENTS[ev0.id] || { types: [] }).types;
    const singles = c.result.singles.map((id) => byId.get(id)).filter(Boolean);
    const classify = singles.length && known.length && !c.classified;
    Object.assign(job, { running: true, done: 0, total: c.result.types.filter((t) => !gem(t)).length + (classify ? 1 : 0), prog: null });
    A().render();
    let failed = 0;
    const onProg = (p) => { job.prog = p; const el = document.getElementById("gemma-prog"); if (el) el.innerHTML = RR.llmProgressHtml(p); };
    try {
      // 1. Einzelstücke zuerst zuordnen – das verändert die Typen, die danach vertieft werden
      if (classify) {
        job.step = `${singles.length} Einzelstücke zuordnen (nur Überschriften)`;
        job.prog = null;
        paintJob();
        const assign = await RR.ai.classifyTitles(singles.map((a) => ({ id: a.id, title: a.title })), known.map((t) => ({ id: t.id, label: t.label })), ev0.label, onProg);
        job.done++;
        const n = Object.keys(assign).length;
        if (n) {
          const cc = S().corpus;
          run(RR.corpusMem.articles, { eventId: cc.eventId, anchors: cc.anchors, nextAnchor: cc.nextAnchor, sample: cc.sample, assign: { ...cc.assign, ...assign }, keep: true });
          toast(`Gemma hat ${n} Einzelstück${n === 1 ? "" : "e"} bekannten Story-Typen zugeordnet.`);
        }
        S().corpus.classified = true;
      }
      // 2. jeden Story-Typ vertiefen (größte zuerst)
      const r = S().corpus.result;
      const todo = r.types.filter((t) => !gem(t)).sort((a, b) => b.n - a.n);
      job.total = job.done + todo.length;
      for (const t of todo) {
        job.step = `Story-Typ „${t.label}“ (${t.n} Artikel)`;
        job.prog = null;
        paintJob();
        try {
          const g = await RR.ai.enrichType(t, t.articleIds.map((id) => byId.get(id)).filter(Boolean), r.event.label, onProg);
          S().corpus.gemma[sig(t)] = g;
          A().save();
        } catch (err) {
          if (err.name === "AbortError") throw err;
          failed++;
        }
        job.done++;
      }
      toast(failed ? `Fertig – ${failed} Story-Typ(en) ohne Ergebnis.` : "Gemma ist fertig.", failed ? "warn" : undefined);
    } catch (err) {
      toast(err.name === "AbortError" ? "Abgebrochen – bisherige Ergebnisse bleiben erhalten." : "Gemma: " + err.message, "warn");
    } finally {
      job.running = false;
      A().save();
      if (S().screen === "corpus") A().render();
    }
  }

  function planHtml(c) {
    const r = c.result;
    if (!r.next) {
      return `<section class="card plan"><p class="eyebrow">Plan für das nächste Mal</p><h2>Wann ist der nächste ${esc(r.event.anchorLabel)}?</h2>
        <label class="anchor"><span>Datum eingeben</span><input type="date" data-act="corpus-next" value="${esc(c.nextAnchor || "")}"></label>
        <p class="muted small">Dann rechnet das Tool den Story-Kalender in echte Termine um.</p></section>`;
    }
    const byMonth = {};
    r.next.entries.forEach((e) => { const m = new Date(e.center + "T00:00:00Z").toLocaleDateString("de-DE", { month: "long", year: "numeric", timeZone: "UTC" }); (byMonth[m] = byMonth[m] || []).push(e); });
    return `<section class="card plan">
      <div class="section-head"><div><p class="eyebrow">Plan für das nächste Mal</p><h2>${esc(r.next.label)} · ${esc(r.event.anchorLabel)} am ${C().deDate(r.next.anchor)}</h2></div>
        <button class="btn btn-secondary btn-sm" data-act="corpus-ics" type="button">${icon("clock")} Als Kalender (.ics)</button></div>
      <p class="muted small">Typischer Tag aus dem Archiv, umgerechnet auf den nächsten Termin. Zeitraum = mittlere Hälfte der bisherigen Termine. Nur Story-Typen, die mindestens in der Hälfte der Jahre erschienen sind.</p>
      <div class="plan-months">${Object.entries(byMonth).map(([m, es]) => `
        <div class="plan-month"><h3>${esc(m)}</h3><ul>${es.map((e) => `
          <li><span class="plan-date">${C().deShort(e.from)}${e.from !== e.to ? `–${C().deShort(e.to)}` : ""}</span>
            <span class="plan-what"><strong>${esc(labelOf(typeById(e.typeId) || e))}</strong><small>${relLabel(e.rel)} · ${esc(e.regularity)}</small></span>
            <button class="btn btn-ghost btn-sm" data-act="ctype-blueprint" data-id="${e.typeId}" type="button">Vorbereiten</button></li>`).join("")}</ul></div>`).join("")}
      </div>
    </section>`;
  }

  /* ---------- Detail-Drawer pro Story-Typ ---------- */
  RR.drawerCorpusType = function (id) {
    const c = S().corpus;
    const r = c && c.result;
    const t = r && r.types.find((x) => x.id === id);
    if (!t) return "";
    const g = gem(t);
    return `<div class="drawer-head"><div><p class="eyebrow">${t.discovered ? "Entdeckter Story-Typ" : "Story-Typ"} · ${esc(t.regularity)}</p><h2>${esc(labelOf(t))}</h2></div>
        <button class="icon-btn drawer-close" data-act="close-drawer" type="button" aria-label="Schließen">${icon("x")}</button></div>
      <div class="drawer-body">
        <ul class="facts">
          <li><span class="f-l">Erscheint</span><span class="f-v">${regLabel(t, r)}: ${t.cycles.map((k) => esc(k)).join(", ")}</span><span class="f-s">${t.n} Artikel</span></li>
          <li><span class="f-l">Typischer Zeitpunkt</span><span class="f-v">${relLabel(t.median)} (${relLabel(t.q1)} bis ${relLabel(t.q3)})</span><span class="f-s">${esc(t.phase || "")}</span></li>
          <li><span class="f-l">Typische Länge</span><span class="f-v">ca. ${t.words} Wörter</span><span class="f-s"></span></li>
          ${r.next ? (() => { const e = r.next.entries.find((x) => x.typeId === t.id); return e ? `<li><span class="f-l">Nächster Termin</span><span class="f-v">${C().deDate(e.from)}${e.from !== e.to ? ` – ${C().deDate(e.to)}` : ""}</span><span class="f-s">${esc(r.next.label)}</span></li>` : ""; })() : ""}
        </ul>
        ${g ? `<div class="gemma-box">
          <p class="eyebrow">${icon("spark")} Gemma · ${g.sample} Beispiele gelesen</p>
          ${g.description ? `<p>${esc(g.description)}</p>` : ""}
          ${g.aspects.length ? `<p class="label">Kernaspekte</p><ul class="g-aspects">${g.aspects.map((a) => `<li><strong>${esc(a.label)}</strong>${a.quote ? `<blockquote>„${esc(a.quote.length > 240 ? a.quote.slice(0, 239) + "…" : a.quote)}“<cite>${esc(a.title || "")}${a.date ? " · " + C().deDate(a.date) : ""}</cite></blockquote>` : `<span class="muted small"> – kein wörtlicher Beleg gefunden</span>`}</li>`).join("")}</ul>` : ""}
          ${g.sources.length ? `<p class="label">Typische Quellen</p><p>${g.sources.map((x) => `<span class="chip">${esc(x)}</span>`).join(" ")}</p>` : ""}
          ${g.reporter.length ? `<p class="label">Nur für die Reporterin / den Reporter</p><ul class="ticks">${g.reporter.map((x) => `<li>${icon("user")} ${esc(x)}</li>`).join("")}</ul>` : ""}
          ${g.dropped ? `<p class="muted small">${g.dropped} Zitat(e) ohne Fundstelle im Text verworfen.</p>` : ""}
        </div>` : ""}
        ${t.aspects.length ? `<p class="eyebrow">${g ? "Regel-Engine: " : ""}Was immer vorkommt</p><ul class="aspects">${t.aspects.map((a) => `<li><span>${esc(a.label)}</span><span class="bar"><span style="width:${Math.round(a.share * 100)}%"></span></span><b>${a.hits}/${t.n}</b></li>`).join("")}</ul>` : ""}
        ${(t.terms || []).length ? `<p class="eyebrow">Typische Begriffe</p><p>${t.terms.map((w) => `<span class="chip chip-term">${esc(w)}</span>`).join(" ")}</p>` : ""}
        <p class="eyebrow">Beispiele</p>
        <ul class="examples">${t.examples.map((e) => `<li><span class="muted small">${e.date ? C().deDate(e.date) : "ohne Datum"}</span>${esc(e.title)}</li>`).join("")}</ul>
        <button class="btn btn-primary" data-act="ctype-blueprint" data-id="${t.id}" type="button">${icon("list")} Blueprint aus diesen ${t.n} Artikeln erstellen</button>
      </div>`;
  };

  /* ---------- Aktionen ---------- */
  Object.assign(RR.act, {
    "corpus-demo": (el) => {
      const arts = sampleArticles(el.dataset.id);
      run(arts, { sample: el.dataset.id, nextAnchor: el.dataset.id === "wahl" ? "2028-10-08" : "" });
    },
    "ctype-open": (el) => RR.openDrawer({ kind: "ctype", id: el.dataset.id }),
    "ctype-blueprint": async (el) => {
      const c = S().corpus;
      const t = c.result.types.find((x) => x.id === el.dataset.id);
      if (!RR.corpusMem.articles.length) await restoreArticles();
      const arts = RR.corpusMem.articles.filter((a) => t.articleIds.includes(a.id));
      if (!arts.length) return toast("Die Artikel sind nicht mehr im Speicher – bitte das Archiv erneut hochladen.", "warn");
      const s = S();
      s.articles = arts.map((a) => ({ ...a }));
      const label = labelOf(t);
      s.fromCorpus = { label };
      if (s.drawer) RR.closeDrawer();
      // Gemma-Modus: Gemma baut den Blueprint; sonst passende Vorlage oder allgemeine Engine
      await A().runAnalysis(s.engine === "ai" && RR.ai.ready() ? undefined : t.bp || "generic");
      const an = S().analysis;
      if (an && an.type.id === "generic") { an.type.label = label; an.type.short = label.split(" · ")[0]; an.type.event = an.type.short; A().save(); A().render(); }
    },
    "corpus-ics": () => {
      const r = S().corpus.result;
      const d = (iso) => iso.replace(/-/g, "");
      const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Reverse Reporting//Themenarchiv//DE"];
      r.next.entries.forEach((e, i) => lines.push("BEGIN:VEVENT", `UID:rr-${d(e.center)}-${i}@reverse-reporting`, `DTSTAMP:${d(new Date().toISOString().slice(0, 10))}T000000Z`,
        `DTSTART;VALUE=DATE:${d(e.from)}`, `DTEND;VALUE=DATE:${d(C().addDays(e.to, 1))}`, `SUMMARY:${r.event.label}: ${labelOf(typeById(e.typeId) || e)}`,
        `DESCRIPTION:Typischer Zeitpunkt laut Archiv: ${relLabel(e.rel)} (${e.regularity}).`, "END:VEVENT"));
      lines.push("END:VCALENDAR");
      RR.ui.offerFile(`story-plan-${r.next.anchor.slice(0, 4)}.ics`, lines.join("\r\n"), "text/calendar");
    },
    "corpus-gemma": () => runGemma(),
    "corpus-delete": (el) => {
      if (!el.dataset.armed) {
        el.dataset.armed = "1";
        el.querySelector("span").textContent = "Wirklich löschen? Nochmal klicken";
        setTimeout(() => { if (el.isConnected) { delete el.dataset.armed; el.querySelector("span").textContent = "Archiv von diesem Gerät löschen"; } }, 4000);
        return;
      }
      RR.corpusMem.articles = [];
      RR.store.del("corpus", "current");
      S().corpus = null;
      A().save();
      A().go("home");
      toast("Archiv gelöscht – Texte und Ergebnisse sind von diesem Gerät entfernt.");
    },
  });
  RR.onChange["corpus-event"] = (el) => rerun({ eventId: el.value, anchors: {} });
  RR.onChange["corpus-anchor"] = (el) => { const c = S().corpus; rerun({ anchors: { ...Object.fromEntries(c.result.cycles.map((x) => [x.key, x.anchor])), [el.dataset.key]: el.value } }); };
  RR.onChange["corpus-next"] = (el) => rerun({ nextAnchor: el.value });
  document.addEventListener("keydown", (e) => { if ((e.key === "Enter" || e.key === " ") && e.target.matches("g.cal-row")) { e.preventDefault(); RR.openDrawer({ kind: "ctype", id: e.target.dataset.id }); } });
})();
