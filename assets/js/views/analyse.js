/*
 * Archiv-Analyse über den lokalen Python-Dienst (server/, gleicher Ursprung unter /api).
 * Drei Schritte, jeder prüfbar: 1 Import · 2 Zeitachse · 3 Geschichten (wiederkehrend / einmalig).
 * Ohne Dienst (z. B. GitHub Pages) bleibt das bisherige Themenarchiv im Browser aktiv.
 */
(function () {
  const RR = window.RR;
  const { esc, icon, toast } = RR.ui;
  const A = () => RR.app;
  const S = () => RR.app.state;

  const svc = (RR.svc = { available: false, status: null, data: null, polling: null });

  async function api(path, opts) {
    const r = await fetch("/api" + path, opts);
    if (!r.ok) {
      let msg = "HTTP " + r.status;
      try { msg = (await r.json()).detail || msg; } catch (e) { /* ignorieren */ }
      throw new Error(msg);
    }
    return r.json();
  }

  svc.check = async function () {
    // Der Dienst setzt beim Ausliefern eine Markierung – ohne sie (GitHub Pages, Doppelklick,
    // einfacher Webserver) gibt es keinen Dienst und keine Anfrage
    if (!document.querySelector('meta[name="rr-service"]')) return false;
    try {
      svc.status = await api("/status");
      svc.available = true;
    } catch (e) {
      svc.available = false;
    }
    return svc.available;
  };

  svc.load = async function () {
    const [articles, tl, groups, status] = await Promise.all([api("/articles"), api("/timeline"), api("/groups"), api("/status")]);
    svc.status = status;
    svc.data = { articles: articles.articles, skipped: articles.skipped, cycles: tl.cycles, placement: tl.placement,
      overrides: tl.overrides, groups: groups.groups, params: groups.params };
    const byGroup = {};
    groups.groups.forEach((g) => g.members.forEach((m) => (byGroup[m] = g)));
    svc.data.byGroup = byGroup;
  };

  svc.upload = async function (files) {
    const fd = new FormData();
    files.forEach((f) => fd.append("files", f, f.name));
    const ok = svc.status && svc.status.ollama && svc.status.ollama.ok;
    fd.append("llm", "0"); // erst die schnelle Regel-Analyse; Gemma startet man danach bewusst
    try {
      await api("/import", { method: "POST", body: fd });
    } catch (err) {
      return toast("Upload: " + err.message, "warn");
    }
    const s = S();
    s.analyse = { tab: "import" };
    s.screen = "analyse";
    A().save();
    svc.data = null;
    A().render();
    startPolling();
    if (ok) toast("Gemma ist bereit – nach der Regel-Analyse kannst du die Geschichten vertiefen lassen.");
  };

  function startPolling() {
    clearInterval(svc.polling);
    svc.polling = setInterval(async () => {
      let j;
      try { j = await api("/job"); } catch (e) { return; }
      svc.status = { ...(svc.status || {}), job: j };
      const el = document.getElementById("an-job");
      if (el) el.outerHTML = jobHtml(j);
      if (!j.running) {
        clearInterval(svc.polling);
        svc.polling = null;
        if (j.error) toast("Analyse: " + j.error, "warn");
        await svc.load();
        if (S().screen === "analyse") A().render();
      }
    }, 900);
  }

  /* ---------- Bausteine ---------- */
  const STAGES = { import: "Dateien lesen", topic: "Thema erkennen", timeline: "Zeitachse", cards: "Story-Karten (Gemma)", group: "Gruppen bilden", refine: "Gruppen prüfen (Gemma)" };
  function jobHtml(j) {
    if (!j || (!j.running && !j.error)) return `<div id="an-job" hidden></div>`;
    if (!j.running && j.error) return `<div id="an-job" class="note-box an-error">${icon("alert")} ${esc(j.error)}</div>`;
    const pct = j.n ? Math.round((j.i / j.n) * 100) : 0;
    const eta = j.stage === "cards" && j.i > 3 ? ((Date.now() / 1000 - j.started) / j.i) * (j.n - j.i) : 0;
    return `<section id="an-job" class="card an-job">
      <div class="section-head"><div><p class="eyebrow">${icon("clock")} Läuft · ${esc(STAGES[j.stage] || "Start")}</p>
        <h2>${j.n ? `${j.i} von ${j.n}` : "Bitte warten …"}</h2></div>
        <button class="btn btn-ghost" data-act="an-cancel" type="button">${icon("x")} Abbrechen</button></div>
      <span class="meter"><span style="width:${pct}%"></span></span>
      <p class="muted small">${esc(j.text || "")}${eta ? ` · noch etwa ${Math.ceil(eta / 60)} min` : ""}</p>
      <ul class="an-log">${(j.log || []).map((l) => `<li>${icon("check")} <strong>${esc(STAGES[l.stage] || l.stage)}:</strong> ${esc(l.msg)}</li>`).join("")}</ul>
    </section>`;
  }

  const fmtDate = (iso) => (iso ? new Date(iso + "T00:00:00Z").toLocaleDateString("de-DE", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }) : "–");
  const relLabel = (d) => (d == null ? "–" : d === 0 ? "Tag 0" : `Tag ${d > 0 ? "+" : "−"}${Math.abs(d)}`);

  /* ---------- 1 · Import ---------- */
  function importTab(d) {
    const st = svc.status.corpus || {};
    const off = d.articles.filter((a) => a.status === "off_topic" || a.topic === "nicht");
    const dup = d.articles.filter((a) => a.status === "duplicate");
    const years = Object.entries(st.years || {});
    const max = Math.max(1, ...years.map(([, n]) => n));
    const skippedBy = {};
    d.skipped.forEach((s) => (skippedBy[s.reason] = (skippedBy[s.reason] || 0) + 1));
    return `
      <div class="an-kpis">
        <div class="kpi"><span class="kpi-label">Dateien</span><span class="kpi-val">${st.files || 0}</span></div>
        <div class="kpi"><span class="kpi-label">${icon("check")} Artikel</span><span class="kpi-val">${st.ok || 0}</span><span class="muted small">${st.articles || 0} Text · ${st.videos || 0} Video</span></div>
        <div class="kpi"><span class="kpi-label">Übersprungen</span><span class="kpi-val">${d.skipped.length}</span><span class="muted small">${Object.entries(skippedBy).map(([k, n]) => `${n} ${esc(k)}`).join(" · ") || "–"}</span></div>
        <div class="kpi"><span class="kpi-label">Dubletten</span><span class="kpi-val">${dup.length}</span></div>
        <div class="kpi"><span class="kpi-label">Anderes Thema</span><span class="kpi-val">${off.length}</span></div>
        <div class="kpi"><span class="kpi-label">Ohne Datum</span><span class="kpi-val">${st.undated || 0}</span></div>
      </div>
      <section class="card">
        <div class="section-head"><div><p class="eyebrow">Thema</p><h2>${esc(((svc.status.topic || {}).terms || []).join(" · ") || "–")}</h2></div></div>
        <p class="muted small">Erkannt aus Schlagworten, die in vielen Artikeln vergeben sind und oft in der Überschrift stehen. Artikel, die das Thema gar nicht erwähnen, werden aussortiert; Grenzfälle entscheidet Gemma.</p>
        <p class="eyebrow">Artikel pro Jahr</p>
        <div class="yearbars">${years.map(([y, n]) => `<div class="yb"><span class="yb-bar" style="height:${Math.max(4, (n / max) * 100)}%"></span><b>${n}</b><small>${esc(y)}</small></div>`).join("")}</div>
      </section>
      <section class="card">
        <details><summary><strong>Aussortiert und übersprungen</strong> <span class="muted small">(${off.length + dup.length + d.skipped.length})</span></summary>
          <div class="table-wrap"><table class="data"><thead><tr><th>Datum</th><th>Titel / Datei</th><th>Grund</th></tr></thead><tbody>
          ${off.map((a) => `<tr><td>${fmtDate(a.date)}</td><td>${esc(a.title)}</td><td>${a.topic === "nicht" ? "Gemma: anderes Thema" : esc(a.reason)}</td></tr>`).join("")}
          ${dup.map((a) => `<tr><td>${fmtDate(a.date)}</td><td>${esc(a.title)}</td><td>Dublette (${esc(a.reason)})</td></tr>`).join("")}
          ${d.skipped.map((s) => `<tr><td>–</td><td class="small">${esc(s.source_file)}</td><td>${esc(s.reason)}</td></tr>`).join("")}
          </tbody></table></div></details>
        <details><summary><strong>Alle Artikel</strong> <span class="muted small">(${d.articles.filter((a) => a.status === "ok").length})</span></summary>
          <div class="table-wrap"><table class="data"><thead><tr><th>Datum</th><th>Titel</th><th>Art</th><th>Wörter</th></tr></thead><tbody>
          ${d.articles.filter((a) => a.status === "ok").map((a) => `<tr><td>${fmtDate(a.date)}</td><td>${a.url ? `<a href="${esc(a.url)}" target="_blank" rel="noopener">${esc(a.title)}</a>` : esc(a.title)}</td><td>${a.kind === "video" ? "Video" : "Text"}</td><td class="num">${a.words}</td></tr>`).join("")}
          </tbody></table></div></details>
      </section>`;
  }

  /* ---------- 2 · Zeitachse ---------- */
  function laneSvg(d) {
    const cycles = d.cycles.filter((c) => c.n > 0);
    const arts = d.articles.filter((a) => a.status === "ok" && a.rel != null && a.topic !== "nicht");
    if (!arts.length) return `<p class="empty-note">Keine datierten Artikel.</p>`;
    const lo = Math.max(-300, Math.min(-30, ...arts.map((a) => a.rel))), hi = Math.min(120, Math.max(30, ...arts.map((a) => a.rel)));
    // vor dem Ereignis gestaucht, Ereigniszeit gedehnt
    const dom = [lo, -30, 0, 20, hi], ran = [0, 0.38, 0.55, 0.85, 1];
    const f = (x) => { x = Math.max(lo, Math.min(hi, x)); for (let i = 1; i < dom.length; i++) if (x <= dom[i]) return ran[i - 1] + ((x - dom[i - 1]) / (dom[i] - dom[i - 1] || 1)) * (ran[i] - ran[i - 1]); return 1; };
    const LW = 92, W = 1000, RW = 12, row = 34, top = 30, H = top + cycles.length * row + 10;
    const X = (x) => LW + f(x) * (W - LW - RW);
    const ticks = [-240, -180, -120, -90, -60, -30, -14, 0, 7, 14, 21, 30, 60, 90].filter((t) => t >= lo && t <= hi);
    const dot = (a) => {
      const g = d.byGroup[a.id];
      const cls = g && g.recurring ? "dot-rec" : g && g.n > 1 ? "dot-once" : "dot-single";
      return `<circle class="lane-dot ${cls}" cx="${X(a.rel).toFixed(1)}" cy="0" r="4.5" data-act="an-dot" data-id="${a.id}"><title>${esc(fmtDate(a.date))}: ${esc(a.title)}${g ? ` – ${esc(g.label)}` : ""}</title></circle>`;
    };
    return `<svg class="lanes-svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="Zeitachse: Artikel pro Jahr relativ zum Ereignis">
      ${ticks.map((t) => `<line class="cal-grid ${t === 0 ? "is-zero" : ""}" x1="${X(t)}" x2="${X(t)}" y1="${top - 6}" y2="${H - 4}"/><text class="cal-tick" x="${X(t)}" y="${top - 12}" text-anchor="middle">${t === 0 ? "Start" : (t > 0 ? "+" : "−") + Math.abs(t)}</text>`).join("")}
      ${cycles.map((c, i) => {
        const y = top + i * row + row / 2;
        const len = c.start && c.end ? (new Date(c.end) - new Date(c.start)) / 864e5 : 0;
        const mine = arts.filter((a) => a.cycle === c.cycle);
        // Punkte am selben Tag leicht versetzen
        const seen = {};
        return `<g class="lane">
          <text class="cal-label" x="6" y="${y + 4}">${esc(c.cycle)}</text>
          <text class="lane-n" x="${LW - 8}" y="${y + 4}" text-anchor="end">${c.n}</text>
          ${c.start ? `<rect class="lane-event" x="${X(0)}" y="${y - row / 2 + 3}" width="${Math.max(2, X(len) - X(0))}" height="${row - 6}" rx="4"/>` : ""}
          <line class="lane-line" x1="${LW}" x2="${W - RW}" y1="${y}" y2="${y}"/>
          ${mine.map((a) => { const k = Math.round(X(a.rel) / 6); const n = (seen[k] = (seen[k] || 0) + 1); return `<g transform="translate(0 ${y + ((n % 3) - 1) * 6})">${dot(a)}</g>`; }).join("")}
        </g>`;
      }).join("")}
    </svg>`;
  }

  function timelineTab(d) {
    return `
      <section class="card">
        <div class="section-head"><div><p class="eyebrow">Zeitachse</p><h2>Jedes Jahr eine Spur, jeder Punkt ein Artikel</h2></div>
          <span class="legend"><span class="lg-dot dot-rec"></span>wiederkehrend <span class="lg-dot dot-once"></span>einmaliges Thema <span class="lg-dot dot-single"></span>Einzelstück</span></div>
        <p class="muted small">Position = Tage relativ zum Ereignisbeginn des jeweiligen Jahres (blau hinterlegt: Ereigniszeitraum). Vor dem Ereignis ist die Achse gestaucht. Punkt anklicken = zur Geschichte.</p>
        <div class="cal-wrap">${laneSvg(d)}</div>
      </section>
      <section class="card">
        <div class="section-head"><div><p class="eyebrow">Ereignistage</p><h2>Wann war das Ereignis in jedem Jahr?</h2></div>
          <button class="btn btn-secondary btn-sm" data-act="an-cycles-save" type="button">${icon("check")} Änderungen übernehmen</button></div>
        <div class="table-wrap"><table class="data"><thead><tr><th>Jahr</th><th class="num">Artikel</th><th>Beginn</th><th>Ende</th><th>Quelle</th></tr></thead><tbody>
          ${d.cycles.map((c) => `<tr class="${c.covered ? "" : "is-thin"}"><td><strong>${esc(c.cycle)}</strong>${c.covered ? "" : ` <small class="muted">dünn</small>`}</td><td class="num">${c.n}</td>
            <td><input type="date" data-cycle="${esc(c.cycle)}" data-k="start" value="${esc(c.start || "")}"></td>
            <td><input type="date" data-cycle="${esc(c.cycle)}" data-k="end" value="${esc(c.end || "")}"></td>
            <td class="small">${esc(c.source || "unbekannt")}${c.mentions ? ` (${c.mentions}× im Text)` : ""}</td></tr>`).join("")}
        </tbody></table></div>
        <p class="muted small">Reihenfolge: von dir gesetzt → im Text genannt („vom 19. September bis 4. Oktober“) → Höhepunkt der Berichterstattung → wie in den anderen Jahren geschätzt. Ein Artikel gehört zum nächsten Ereignis, außer er erscheint bis zu 45 Tage danach (Nachbericht).</p>
      </section>`;
  }

  /* ---------- 3 · Geschichten ---------- */
  function storyCard(g, open) {
    const byCycle = {};
    g.articles.forEach((a) => (byCycle[a.cycle] = byCycle[a.cycle] || []).push(a));
    return `<article class="story-card ${open ? "is-open" : ""}">
      <button class="story-head" data-act="an-group" data-sig="${g.sig}" type="button" aria-expanded="${open}">
        <span class="story-name">${esc(g.label)}${g.checked ? ` <span class="badge badge-ai">${icon("spark", "ic-xs")}Gemma</span>` : ""}${g.edited ? ` <span class="badge">bearbeitet</span>` : ""}</span>
        <span class="story-meta">${g.n} Artikel · ${(g.recurring ? g.matched_cycles : g.cycles).map(esc).join(" · ")} · typisch ${relLabel(g.median_rel)}</span>
      </button>
      ${g.description ? `<p class="small story-desc">${esc(g.description)}</p>` : ""}
      ${open ? `<div class="story-body">
        ${Object.keys(byCycle).sort().map((c) => `<div class="story-cycle"><h4>${esc(c)}</h4><ul>${byCycle[c].sort((a, b) => (a.date || "").localeCompare(b.date || "")).map((a) => `
          <li><span class="muted small">${fmtDate(a.date)} · ${relLabel(a.rel)}</span> ${a.url ? `<a href="${esc(a.url)}" target="_blank" rel="noopener">${esc(a.title)}</a>` : esc(a.title)}${a.angle ? `<small class="muted"> – ${esc(a.angle)}</small>` : ""}</li>`).join("")}</ul></div>`).join("")}
        <div class="story-actions">
          <label class="small">Name <input type="text" value="${esc(g.label)}" data-act="an-rename" data-sig="${g.sig}"></label>
          <button class="btn btn-ghost btn-sm" data-act="an-toggle-rec" data-sig="${g.sig}" data-rec="${g.recurring ? 0 : 1}" type="button">${g.recurring ? "Ist einmalig" : "Ist wiederkehrend"}</button>
          <button class="btn btn-ghost btn-sm" type="button" disabled title="Kommt im nächsten Schritt (M2)">${icon("list")} Blueprint (bald)</button>
        </div></div>` : ""}
    </article>`;
  }

  function storiesTab(d) {
    const st = svc.status || {};
    const ol = st.ollama || {};
    const rec = d.groups.filter((g) => g.recurring);
    const once = d.groups.filter((g) => !g.recurring && g.n > 1);
    const singles = d.groups.filter((g) => g.n === 1);
    const cards = d.articles.filter((a) => a.angle).length;
    const total = d.articles.filter((a) => a.status === "ok").length;
    const open = (S().analyse || {}).open;
    const job = st.job || {};
    return `
      <section class="card gemma-card">
        <div class="section-head"><div><p class="eyebrow">${icon("spark")} Gemma</p>
          <h2>${cards ? `${cards} von ${total} Artikeln gelesen` : "Noch nicht mit Gemma vertieft"}</h2></div>
          ${ol.ok ? `<button class="btn btn-primary" data-act="an-gemma" type="button" ${job.running ? "disabled" : ""}>${icon("spark")} ${cards >= total ? "Gruppen neu prüfen" : cards ? "Weiterlesen" : "Mit Gemma vertiefen"}</button>` : ""}</div>
        <p class="muted small">${ol.ok
          ? `Gemma (${esc(ol.model)}) liest jeden Artikel kurz (Überschrift, Vorspann, Textanfang): Gehört er wirklich zum Thema, und welche Art von Geschichte ist es? ${ol.embed_model ? `Dazu Bedeutungs-Ähnlichkeit mit ${esc(ol.embed_model)}.` : `Tipp: <code>ollama pull embeddinggemma</code> verbessert die Gruppen zusätzlich.`} Dann prüft Gemma jede Gruppe, benennt sie und wirft Ausreißer raus. Etwa 5 s pro Artikel – ${Math.max(0, total - cards)} offen, also rund ${Math.ceil((Math.max(0, total - cards) * 5) / 60)} min. Läuft im Hintergrund; Fertiges bleibt gespeichert, nach einem Abbruch geht es dort weiter. Mac am Strom lassen.`
          : `Ollama ist nicht erreichbar (${esc(ol.error || "")}). Die Gruppen unten stammen aus der reinen Textähnlichkeit.`}</p>
      </section>
      <section class="an-section">
        <div class="section-head"><div><p class="eyebrow">Wiederkehrend · ${rec.length}</p><h2>Geschichten, die in mehreren Jahren zur gleichen Zeit erscheinen</h2></div></div>
        <div class="story-list">${rec.map((g) => storyCard(g, open === g.sig)).join("") || `<p class="empty-note">Keine gefunden.</p>`}</div>
      </section>
      <section class="an-section">
        <div class="section-head"><div><p class="eyebrow">Einmalig · ${once.length}</p><h2>Themen mit mehreren Artikeln, aber nicht regelmäßig</h2></div></div>
        <p class="muted small">Nur in einem Jahr – oder in mehreren Jahren, aber zu ganz unterschiedlichen Zeitpunkten. Viele Artikel in einem Jahr machen noch keine wiederkehrende Geschichte (z. B. ein Großereignis). Diese gehen nicht in den Blueprint.</p>
        <div class="story-list">${once.map((g) => storyCard(g, open === g.sig)).join("")}</div>
      </section>
      <section class="card"><details><summary><strong>Einzelstücke</strong> <span class="muted small">(${singles.length})</span></summary>
        <ul class="examples">${singles.map((g) => { const a = g.articles[0] || {}; return `<li><span class="muted small">${fmtDate(a.date)}</span>${esc(a.title || g.label)}</li>`; }).join("")}</ul></details></section>`;
  }

  /* ---------- Bildschirm ---------- */
  RR.views.analyse = function () {
    const s = S();
    s.analyse = s.analyse || { tab: "import" };
    const d = svc.data;
    const j = svc.status && svc.status.job;
    if (!d) {
      svc.load().then(() => { if (S().screen === "analyse") A().render(); }).catch((e) => toast("Analyse-Dienst: " + e.message, "warn"));
      if (j && j.running && !svc.polling) startPolling();
      return `<section class="screen">${jobHtml(j)}<section class="loading"><div class="pulse">${icon("archive")}</div><h2>Lade Analyse …</h2></section></section>`;
    }
    const tab = s.analyse.tab;
    const rec = d.groups.filter((g) => g.recurring).length;
    const ok = d.articles.filter((a) => a.status === "ok").length;
    const cov = d.cycles.filter((c) => c.covered).map((c) => c.cycle);
    if (j && j.running && !svc.polling) startPolling();
    return `
    <section class="screen analyse">
      <header class="screen-head">
        <div class="screen-title">
          <p class="eyebrow">Archiv-Analyse · ${esc(((svc.status.topic || {}).terms || []).join(" · "))}</p>
          <h1>Was jedes Mal erscheint – und wann</h1>
          <p class="lead">${ok} Artikel · ${d.cycles.length} Jahre (gut abgedeckt: ${esc(cov.join(", ") || "–")}) · <strong>${rec} wiederkehrende Geschichten</strong></p>
        </div>
      </header>
      ${jobHtml(j)}
      <div class="seg an-tabs" role="tablist">
        ${[["import", "1 · Import"], ["zeit", "2 · Zeitachse"], ["geschichten", "3 · Geschichten"]].map(([k, l]) => `<button type="button" role="tab" aria-selected="${tab === k}" class="${tab === k ? "is-on" : ""}" data-act="an-tab" data-tab="${k}">${l}</button>`).join("")}
      </div>
      ${tab === "import" ? importTab(d) : tab === "zeit" ? timelineTab(d) : storiesTab(d)}
      <div class="actions">
        <button class="btn btn-ghost" data-act="home" type="button">Zur Startseite</button>
        <button class="btn btn-ghost" data-act="an-reset" type="button">${icon("trash")}<span>Analyse vom Gerät löschen</span></button>
        ${tab !== "geschichten" ? `<button class="btn btn-primary" data-act="an-tab" data-tab="${tab === "import" ? "zeit" : "geschichten"}" type="button">Weiter ${icon("arrow")}</button>` : ""}
      </div>
    </section>`;
  };

  Object.assign(RR.act, {
    "an-tab": (el) => { S().analyse.tab = el.dataset.tab; A().save(); A().render(); window.scrollTo({ top: 0 }); },
    "an-group": (el) => { const a = S().analyse; a.open = a.open === el.dataset.sig ? null : el.dataset.sig; A().save(); A().render(); },
    "an-dot": (el) => {
      const g = svc.data.byGroup[el.dataset.id];
      if (!g) return;
      Object.assign(S().analyse, { tab: "geschichten", open: g.sig });
      A().render();
      setTimeout(() => { const c = document.querySelector(`[data-sig="${g.sig}"]`); if (c) c.scrollIntoView({ block: "center" }); }, 50);
    },
    "an-cancel": async () => { await api("/job/cancel", { method: "POST" }); toast("Wird nach dem aktuellen Schritt angehalten."); },
    "an-gemma": async () => {
      try { await api("/run/gemma", { method: "POST" }); } catch (e) { return toast(e.message, "warn"); }
      svc.status.job = { running: true, stage: "", i: 0, n: 0, log: [] };
      A().render();
      startPolling();
    },
    "an-cycles-save": async () => {
      const body = {};
      document.querySelectorAll("input[data-cycle]").forEach((i) => { (body[i.dataset.cycle] = body[i.dataset.cycle] || {})[i.dataset.k] = i.value; });
      // nur geänderte Jahre als manuelle Angabe speichern
      const changed = {};
      svc.data.cycles.forEach((c) => { const b = body[c.cycle]; if (b && (b.start !== (c.start || "") || b.end !== (c.end || ""))) changed[c.cycle] = b; });
      if (!Object.keys(changed).length) return toast("Keine Änderung.");
      toast("Zeitachse und Gruppen werden neu berechnet …");
      await api("/cycles", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(changed) });
      await svc.load();
      A().render();
      toast("Ereignistage übernommen, Gruppen neu berechnet.");
    },
    "an-toggle-rec": async (el) => {
      await api("/groups/" + el.dataset.sig, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ recurring: el.dataset.rec === "1" }) });
      await svc.load();
      A().render();
    },
    "an-reset": async (el) => {
      if (!el.dataset.armed) {
        el.dataset.armed = "1";
        el.querySelector("span").textContent = "Wirklich löschen? Nochmal klicken";
        setTimeout(() => { if (el.isConnected) { delete el.dataset.armed; el.querySelector("span").textContent = "Analyse vom Gerät löschen"; } }, 4000);
        return;
      }
      await api("/reset", { method: "POST" });
      svc.data = null;
      S().analyse = null;
      A().go("home");
      toast("Analyse gelöscht.");
    },
  });
  RR.onChange["an-rename"] = async (el) => {
    await api("/groups/" + el.dataset.sig, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ label: el.value.trim() }) });
    await svc.load();
    A().render();
  };
})();
