/* App: Zustand, Schritte, Rendering, Events. */
(function () {
  const RR = window.RR;
  const $ = (s, el = document) => el.querySelector(s);
  const STORE_KEY = "rr-state-v1";
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const uid = () => "i" + Math.random().toString(36).slice(2, 8);

  const CAT = {
    agent: { icon: "🟢", label: "Agent erledigt selbst", cls: "cat-agent" },
    approve: { icon: "🟡", label: "Agent bereitet vor – Freigabe nötig", cls: "cat-approve" },
    human: { icon: "🔴", label: "Nur Journalist:in", cls: "cat-human" },
  };

  let state = load() || fresh();

  function fresh() {
    return { step: 1, articles: [], analysis: null, include: {}, checklist: [], results: {} };
  }
  function load() {
    try { return JSON.parse(localStorage.getItem(STORE_KEY)); } catch (e) { return null; }
  }
  function save() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch (e) { /* ignorieren */ }
  }

  /* ---------- Navigation ---------- */
  function reachable(step) {
    if (step === 1) return true;
    if (step === 2) return !!state.analysis;
    return state.checklist.length > 0;
  }
  function go(step) {
    if (!reachable(step)) return;
    state.step = step;
    save();
    render();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function render() {
    document.querySelectorAll(".step").forEach((b) => {
      const s = Number(b.dataset.step);
      b.classList.toggle("active", s === state.step);
      b.classList.toggle("done", s < state.step && reachable(s));
      b.disabled = !reachable(s);
    });
    document.querySelectorAll("[data-panel]").forEach((p) => (p.hidden = Number(p.dataset.panel) !== state.step));
    if (state.step === 1) renderArticles();
    if (state.step === 2) renderAnalysis();
    if (state.step === 3) renderChecklist();
    if (state.step === 4) renderBoard();
  }

  /* ---------- Schritt 1: Artikel ---------- */
  function renderArticles() {
    const list = $("#article-list");
    $("#article-count").textContent = state.articles.length;
    list.innerHTML = state.articles.length
      ? state.articles
          .map(
            (a, i) => `
        <article class="card article-card">
          <div class="article-meta"><span class="pill">A${i + 1}</span>${a.year ? `<span class="pill pill-blue">${a.year}</span>` : ""}<span class="muted">${a.words} Wörter</span></div>
          <h3>${esc(a.title)}</h3>
          <p class="muted small">${esc(a.name)}</p>
          <p class="excerpt">${esc(a.text.slice(0, 180))}${a.text.length > 180 ? "…" : ""}</p>
          <button class="btn btn-ghost btn-small" data-act="remove-article" data-id="${a.id}" type="button">Entfernen</button>
        </article>`
          )
          .join("")
      : `<div class="empty">Noch keine Artikel. Lade Dateien hoch oder füge Text ein.</div>`;
    const n = state.articles.length;
    $("#btn-analyze").disabled = n === 0;
    $("#analyze-hint").textContent = n === 1 ? "Mit einem Artikel lassen sich keine wiederkehrenden Muster erkennen – mindestens 2 empfohlen." : n > 5 ? "Mehr als 5 Artikel – das klappt, dauert aber länger beim Gegenlesen." : "";
  }

  async function addFiles(files) {
    for (const f of files) {
      try {
        const a = await RR.ingest.readFile(f);
        if (a.text.length < 20) { toast(`„${f.name}“ enthält kaum Text.`); continue; }
        state.articles.push(a);
      } catch (e) {
        toast(`„${f.name}“ konnte nicht gelesen werden.`);
      }
    }
    invalidateAnalysis();
    save();
    renderArticles();
  }

  function invalidateAnalysis() {
    state.analysis = null;
    state.checklist = [];
    state.results = {};
    state.include = {};
  }

  /* ---------- Schritt 2: Analyse ---------- */
  function runAnalysis() {
    if (!state.articles.length) return;
    state.analysis = RR.analyze(state.articles);
    state.include = {};
    state.analysis.patterns.forEach((p) => (state.include[p.id] = p.recurring));
    state.checklist = [];
    state.results = {};
    go(2);
  }

  function renderAnalysis() {
    const an = state.analysis;
    if (!an) return;
    const t = an.type;
    const conf = Math.round(t.score * 100);
    const arts = an.per;

    const typeCard = `
      <div class="card type-card">
        <div class="type-icon" aria-hidden="true">${t.icon}</div>
        <div>
          <p class="eyebrow">Erkannter Story-Typ</p>
          <h2>${esc(t.label)}</h2>
          <p class="muted">${t.fallback ? "Kein bekannter Story-Typ eindeutig erkannt – allgemeiner Blueprint aus wiederkehrenden Elementen." : `Übereinstimmung ${conf} % · Schlüsselwörter: ${t.matched.map((k) => `<span class="kw">${esc(k)}</span>`).join(" ")}`}</p>
          <p class="muted small">Zieljahr der Recherche: <strong>${an.targetYear}</strong></p>
        </div>
        <div class="meter" aria-label="Übereinstimmung"><span style="width:${t.fallback ? 0 : conf}%"></span></div>
      </div>`;

    const head = arts.map((a, i) => `<th title="${esc(a.title)}">A${i + 1}${a.year ? `<br><span class="muted small">${a.year}</span>` : ""}</th>`).join("");
    const rows = an.patterns
      .map((p) => {
        const cells = arts.map((a) => `<td class="${a.features[p.id] ? "hit" : "miss"}">${a.features[p.id] ? "✓" : "–"}</td>`).join("");
        return `<tr class="${p.recurring ? "recurring" : ""}">
          <td class="pat-label">${esc(p.label)}</td>${cells}
          <td><span class="pill ${p.recurring ? "pill-blue" : ""}">${p.hits}/${arts.length}</span></td>
          <td><label class="check"><input type="checkbox" data-act="toggle-include" data-id="${p.id}" ${state.include[p.id] ? "checked" : ""}> aufnehmen</label></td>
        </tr>`;
      })
      .join("");
    const matrix = `
      <div class="card">
        <h2 class="card-title">Wiederkehrende Bausteine</h2>
        <p class="muted small">Ein Baustein gilt als Muster, wenn er in mindestens ${an.threshold} Artikeln vorkommt. Muster sind automatisch ausgewählt – du kannst ergänzen oder abwählen.</p>
        <div class="table-wrap"><table class="matrix"><thead><tr><th>Baustein</th>${head}<th>Treffer</th><th>Checkliste</th></tr></thead><tbody>${rows}</tbody></table></div>
      </div>`;

    let timeline = "";
    if (an.timeline.length) {
      const max = Math.max(...an.timeline.map((y) => y.max));
      timeline = `
        <div class="card">
          <h2 class="card-title">Zahlen aus dem Archiv</h2>
          <p class="muted small">Beträge, die in den Artikeln einem Jahr zugeordnet werden konnten (Minimum–Maximum).</p>
          <div class="bars">${an.timeline
            .map((y) => `<div class="bar-col"><span class="bar-val">${y.min === y.max ? RR.agent.eur(y.max) : RR.agent.eur(y.min) + "–" + RR.agent.eur(y.max)}</span><div class="bar" style="height:${Math.max(8, (y.max / max) * 140)}px" title="${esc(y.sources.join(", "))}"></div><span class="bar-year">${y.year}</span></div>`)
            .join("")}</div>
        </div>`;
    }

    const facts = arts
      .map((a, i) => {
        const f = a.facts;
        const list = (label, items) => (items.length ? `<dt>${label}</dt><dd>${items.map((x) => `<span class="chip">${esc(x)}</span>`).join(" ")}</dd>` : "");
        const quotes = f.quotes.slice(0, 4).map((q) => `<li>„${esc(q.text.slice(0, 140))}${q.text.length > 140 ? "…" : ""}“ ${q.speaker ? `<span class="muted">– ${esc(q.speaker)}</span>` : ""}</li>`).join("");
        return `<details class="card facts">
          <summary><span class="pill">A${i + 1}</span> ${esc(a.title)}</summary>
          <dl>
            ${list("Jahre", f.years.map(String))}
            ${list("Beträge", [...new Set(f.prices.map((p) => p.raw))])}
            ${list("Prozente", [...new Set(f.percents)])}
            ${list("Festzelte", f.tents)}
            ${list("Institutionen", f.institutions)}
            ${quotes ? `<dt>Zitate</dt><dd><ul class="quotes">${quotes}</ul></dd>` : ""}
          </dl>
        </details>`;
      })
      .join("");

    $("#analysis").innerHTML = typeCard + matrix + timeline + `<h2 class="section-title">Extrahierte Fakten pro Artikel</h2>` + facts;
  }

  /* ---------- Schritt 3: Checkliste ---------- */
  function fill(str) {
    const y = state.analysis ? state.analysis.targetYear : new Date().getFullYear();
    return String(str || "").replace(/\{YEAR\}/g, y).replace(/\{PREV\}/g, y - 1);
  }

  function itemFromTemplate(tpl, extra) {
    const c = tpl.contact ? RR.agent.contact(tpl) : null;
    return {
      id: uid(),
      title: fill(tpl.title),
      category: tpl.category,
      action: tpl.action || null,
      contact: tpl.contact || null,
      channels: tpl.channels || [],
      email: tpl.email ? { to: c.email, subject: fill(tpl.email.subject), body: fill(tpl.email.body) } : null,
      call: tpl.call ? { phone: c.phone, script: fill(tpl.call.script) } : null,
      questions: tpl.questions || [],
      hint: tpl.hint || "",
      why: tpl.why || "",
      ...extra,
    };
  }

  function buildChecklist() {
    const an = state.analysis;
    const bp = RR.getBlueprint(an.type.id);
    state.checklist = bp.features
      .filter((f) => state.include[f.id])
      .map((f) => {
        const p = an.patterns.find((x) => x.id === f.id);
        return itemFromTemplate(f.item, { featureId: f.id, hits: p.hits, total: an.per.length });
      });
    state.results = {};
    go(3);
  }

  // Beim Kategorie-Wechsel fehlende Bausteine ergänzen
  function ensureShape(item) {
    if (item.category === "agent" && !item.action) item.action = "lookup";
    if (item.category === "approve") {
      if (!item.contact) item.contact = "generic";
      const c = RR.agent.contact(item);
      if (!item.channels.length) item.channels = ["email", "call"];
      if (!item.email) item.email = { to: c.email, subject: `Presseanfrage BR: ${item.title}`, body: `Guten Tag,\n\nfür unsere Berichterstattung bitten wir um Informationen zu folgendem Punkt:\n${item.title}\n\nFreundliche Grüße\nBR-Redaktion` };
      if (!item.call) item.call = { phone: c.phone, script: `Vorstellen, Aufzeichnung ankündigen und Zustimmung einholen.\nFrage: ${item.title}` };
    }
    if (item.category === "human" && !item.questions.length && !item.hint) item.hint = "Eigene Recherche nötig.";
  }

  function renderChecklist() {
    const cols = Object.entries(CAT)
      .map(([key, c]) => {
        const items = state.checklist.filter((i) => i.category === key);
        return `<div class="col ${c.cls}">
          <h2 class="col-title"><span aria-hidden="true">${c.icon}</span> ${c.label} <span class="count">${items.length}</span></h2>
          ${items
            .map(
              (i) => `<div class="card item-card">
              <input class="item-title" value="${esc(i.title)}" data-act="edit-title" data-id="${i.id}" aria-label="Titel">
              ${i.why ? `<p class="muted small">${esc(i.why)}${i.hits ? ` · in ${i.hits}/${i.total} Artikeln` : ""}</p>` : i.custom ? `<p class="muted small">Eigener Punkt</p>` : ""}
              <div class="item-foot">
                <select data-act="edit-cat" data-id="${i.id}" aria-label="Kategorie">
                  ${Object.entries(CAT).map(([k, cc]) => `<option value="${k}" ${k === i.category ? "selected" : ""}>${cc.icon} ${cc.label}</option>`).join("")}
                </select>
                <button class="btn btn-ghost btn-small" data-act="del-item" data-id="${i.id}" type="button" aria-label="Löschen">✕</button>
              </div>
            </div>`
            )
            .join("") || `<div class="empty small">Keine Punkte</div>`}
        </div>`;
      })
      .join("");
    $("#checklist").innerHTML = `<div class="cols">${cols}</div>`;
  }

  /* ---------- Schritt 4: Board ---------- */
  function res(id) {
    return (state.results[id] = state.results[id] || { status: "open", log: [] });
  }

  function isDone(item) {
    const r = res(item.id);
    if (item.category === "agent") return r.status === "done" || (r.status === "handoff" && r.done);
    if (item.category === "approve") return !!(r.reply || r.transcript);
    return !!r.done;
  }

  function progressHtml() {
    const total = state.checklist.length;
    const done = state.checklist.filter(isDone).length;
    const pctv = total ? Math.round((done / total) * 100) : 0;
    const by = (k) => state.checklist.filter((i) => i.category === k);
    const open = (k) => by(k).filter((i) => !isDone(i)).length;
    return `<div class="card progress-card" id="progress">
      <div class="progress-top">
        <div><p class="eyebrow">Fortschritt</p><strong class="big">${done} / ${total}</strong> <span class="muted">Punkte erledigt</span></div>
        <div class="progress-stats">
          <span>🟢 ${open("agent")} offen</span><span>🟡 ${open("approve")} warten auf Freigabe</span><span>🔴 ${open("human")} für dich</span>
        </div>
        <button class="btn btn-primary" data-act="run-agent" type="button" ${state.running ? "disabled" : ""}>${state.running ? "Agent arbeitet …" : by("agent").some((i) => res(i.id).status === "open") ? "▶ Agent starten" : "↻ Erneut ausführen"}</button>
      </div>
      <div class="progress"><span style="width:${pctv}%"></span></div>
    </div>`;
  }

  function sourceHtml(s) {
    if (!s) return "";
    return s.url ? `<a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.label)} ↗</a>` : `<span class="muted">${esc(s.label)}</span>`;
  }

  function resultHtml(item, r) {
    const R = r.result;
    if (!R) return "";
    if (R.kind === "tent_table") {
      return `<div class="table-wrap"><table class="data">
        <thead><tr><th>Festzelt</th><th>${state.analysis.targetYear}</th><th>${state.analysis.targetYear - 1}</th><th>Δ</th><th>Quelle</th><th>Geprüft</th></tr></thead>
        <tbody>${R.rows
          .map(
            (row, idx) => `<tr class="${row.verified ? "verified" : ""}">
            <td>${esc(row.tent)}</td><td class="num"><strong>${RR.agent.eur(row.curr)}</strong> <span class="badge badge-demo">Demo</span></td>
            <td class="num">${RR.agent.eur(row.prev)}<br><span class="muted small">${esc(row.prevFrom)}</span></td>
            <td class="num ${row.delta > 0 ? "up" : ""}">${RR.agent.fmtPct(row.delta)}</td>
            <td>${sourceHtml(row.source)}</td>
            <td><label class="check"><input type="checkbox" data-act="verify-row" data-id="${item.id}" data-idx="${idx}" ${row.verified ? "checked" : ""}> <span class="sr">geprüft</span></label></td>
          </tr>`
          )
          .join("")}</tbody></table></div>`;
    }
    if (R.kind === "facts") {
      return `<ul class="facts-list">${R.facts.map((f) => `<li><span class="f-label">${esc(f.label)}</span><span class="f-val">${esc(f.value)}${R.archive ? "" : ` <span class="badge badge-demo">Demo</span>`}</span><span class="f-src">${sourceHtml(f.source)}</span></li>`).join("") || `<li class="muted">Keine Werte gefunden.</li>`}</ul>`;
    }
    if (R.kind === "series") {
      return `<ul class="facts-list">${R.series.map((s) => `<li><span class="f-label">${s.year}</span><span class="f-val">${s.min === s.max ? RR.agent.eur(s.max) : RR.agent.eur(s.min) + " – " + RR.agent.eur(s.max)}${s.demo ? ` <span class="badge badge-demo">Demo</span>` : ""}</span><span class="f-src">${sourceHtml(s.source)}</span></li>`).join("")}</ul>`;
    }
    return "";
  }

  const STATUS = {
    open: ["offen", ""],
    running: ["läuft …", "st-run"],
    done: ["erledigt – bitte gegenprüfen", "st-done"],
    handoff: ["an dich übergeben", "st-human"],
  };

  function agentCard(item) {
    const r = res(item.id);
    const [label, cls] = r.status === "handoff" && r.done ? ["erledigt", "st-done"] : STATUS[r.status] || STATUS.open;
    return `<div class="card board-card cat-agent" data-card="${item.id}">
      <div class="bc-head"><h3>${esc(item.title)}</h3><span class="status ${cls}">${label}</span></div>
      ${r.log.length ? `<ol class="log">${r.log.map((l) => `<li>${esc(l)}</li>`).join("")}</ol>` : `<p class="muted small">Wartet auf den Agenten.</p>`}
      ${resultHtml(item, r)}
      ${r.status === "handoff" ? `<div class="handoff"><p>⚠ ${esc(r.handoff)}</p>${humanInputs(item, r)}</div>` : ""}
    </div>`;
  }

  function humanInputs(item, r) {
    return `<textarea rows="3" data-act="note" data-id="${item.id}" placeholder="Notiz, Zitat oder Ergebnis mit Quelle …">${esc(r.note || "")}</textarea>
      <label class="check"><input type="checkbox" data-act="human-done" data-id="${item.id}" ${r.done ? "checked" : ""}> erledigt</label>`;
  }

  function approveCard(item) {
    const r = res(item.id);
    const c = RR.agent.contact(item);
    const done = isDone(item);
    const emailBlock = item.channels.includes("email") && item.email
      ? `<div class="channel">
          <h4>✉ E-Mail-Entwurf</h4>
          <label class="label">An</label><input data-act="email-field" data-field="to" data-id="${item.id}" value="${esc(item.email.to)}" ${r.emailState ? "disabled" : ""}>
          <label class="label">Betreff</label><input data-act="email-field" data-field="subject" data-id="${item.id}" value="${esc(item.email.subject)}" ${r.emailState ? "disabled" : ""}>
          <label class="label">Text</label><textarea rows="7" data-act="email-field" data-field="body" data-id="${item.id}" ${r.emailState ? "disabled" : ""}>${esc(item.email.body)}</textarea>
          ${r.emailState === "sending" ? `<p class="status st-run">wird gesendet … (Simulation)</p>`
            : r.emailState === "sent" ? `<p class="status st-run">✓ gesendet (simuliert) – warte auf Antwort …</p>`
            : r.emailState === "replied" ? `<p class="status st-done">✓ Antwort eingegangen (simuliert)</p><pre class="reply">${esc(r.reply)}</pre>`
            : r.confirm === "email" ? confirmBox(item.id, "email", `E-Mail an ${item.email.to} freigeben? (Simulation – es wird nichts versendet.)`)
            : `<button class="btn btn-approve" data-act="approve-email" data-id="${item.id}" type="button">E-Mail freigeben &amp; senden</button>`}
        </div>`
      : "";
    const callBlock = item.channels.includes("call") && item.call
      ? `<div class="channel">
          <h4>☎ Anruf</h4>
          <p class="small"><strong>${esc(c.org)}</strong><br>${esc(item.call.phone)}</p>
          <label class="label">Gesprächsleitfaden</label><textarea rows="5" data-act="call-field" data-id="${item.id}" ${r.callState ? "disabled" : ""}>${esc(item.call.script)}</textarea>
          ${r.callState === "calling" ? `<p class="status st-run">● Anruf läuft, wird aufgezeichnet … (Simulation)</p>`
            : r.callState === "recorded" ? `<p class="status st-done">✓ Anruf aufgezeichnet (simuliert)</p><pre class="reply">${esc(r.transcript)}</pre>`
            : r.confirm === "call" ? confirmBox(item.id, "call", `Anruf bei ${c.org} freigeben und aufzeichnen? (Simulation – es wird kein Anruf getätigt.)`)
            : `<button class="btn btn-approve" data-act="approve-call" data-id="${item.id}" type="button">Anruf freigeben &amp; aufzeichnen</button>`}
        </div>`
      : "";
    return `<div class="card board-card cat-approve" data-card="${item.id}">
      <div class="bc-head"><h3>${esc(item.title)}</h3><span class="status ${done ? "st-done" : "st-wait"}">${done ? "Antwort liegt vor – bitte prüfen" : "wartet auf deine Freigabe"}</span></div>
      <p class="muted small">Kontakt: ${esc(c.org)} <span class="badge badge-demo">Demo-Kontakt</span></p>
      <div class="channels">${emailBlock}${callBlock}</div>
    </div>`;
  }

  function confirmBox(id, channel, text) {
    return `<div class="confirm-box" role="group" aria-label="Freigabe bestätigen">
      <p class="small">${esc(text)}</p>
      <button class="btn btn-approve" data-act="confirm-yes" data-channel="${channel}" data-id="${id}" type="button">Ja, freigeben</button>
      <button class="btn btn-ghost" data-act="confirm-no" data-id="${id}" type="button">Abbrechen</button>
    </div>`;
  }

  function humanCard(item) {
    const r = res(item.id);
    return `<div class="card board-card cat-human" data-card="${item.id}">
      <div class="bc-head"><h3>${esc(item.title)}</h3><span class="status ${r.done ? "st-done" : "st-human"}">${r.done ? "erledigt" : "deine Aufgabe"}</span></div>
      ${item.hint ? `<p class="small">${esc(item.hint)}</p>` : ""}
      ${item.questions.length ? `<p class="label">Vorgeschlagene Fragen</p><ul class="questions">${item.questions.map((q) => `<li>${esc(q)}</li>`).join("")}</ul>` : ""}
      ${humanInputs(item, r)}
    </div>`;
  }

  function cardHtml(item) {
    return item.category === "agent" ? agentCard(item) : item.category === "approve" ? approveCard(item) : humanCard(item);
  }

  function renderBoard() {
    const sec = (k) => {
      const items = state.checklist.filter((i) => i.category === k);
      if (!items.length) return "";
      return `<h2 class="section-title"><span aria-hidden="true">${CAT[k].icon}</span> ${CAT[k].label} <span class="count">${items.length}</span></h2>${items.map(cardHtml).join("")}`;
    };
    $("#board").innerHTML = progressHtml() + sec("agent") + sec("approve") + sec("human");
  }

  function refreshCard(id) {
    const item = state.checklist.find((i) => i.id === id);
    const el = document.querySelector(`[data-card="${id}"]`);
    if (item && el) el.outerHTML = cardHtml(item);
    const p = $("#progress");
    if (p) p.outerHTML = progressHtml();
    save();
  }

  async function runAgent() {
    if (state.running) return;
    state.running = true;
    refreshCard(null);
    for (const item of state.checklist.filter((i) => i.category === "agent")) {
      const r = res(item.id);
      if (r.status === "done") continue;
      const out = RR.agent.run(item, state.analysis);
      Object.assign(r, { status: "running", log: [], result: null, done: false });
      refreshCard(item.id);
      for (const line of out.log) {
        await sleep(220);
        r.log.push(line);
        refreshCard(item.id);
      }
      await sleep(250);
      if (out.handoff) Object.assign(r, { status: "handoff", handoff: out.handoff });
      else Object.assign(r, { status: "done", result: out.result });
      refreshCard(item.id);
    }
    state.running = false;
    refreshCard(null);
  }

  async function approve(id, channel) {
    const item = state.checklist.find((i) => i.id === id);
    const r = res(id);
    if (channel === "email") {
      r.emailState = "sending"; refreshCard(id);
      await sleep(900);
      r.emailState = "sent"; refreshCard(id);
      await sleep(2200);
      r.emailState = "replied"; r.reply = RR.agent.reply(item); refreshCard(id);
    } else {
      r.callState = "calling"; refreshCard(id);
      await sleep(2600);
      r.callState = "recorded"; r.transcript = RR.agent.transcript(item); refreshCard(id);
    }
  }

  /* ---------- Export ---------- */
  function exportMarkdown() {
    const an = state.analysis;
    const L = [`# Recherche: ${an.type.label} ${an.targetYear}`, "", `_Erstellt mit Reverse Reporting (Prototyp) – Demo-Daten sind simuliert und müssen geprüft werden._`, ""];
    for (const [k, c] of Object.entries(CAT)) {
      const items = state.checklist.filter((i) => i.category === k);
      if (!items.length) continue;
      L.push(`## ${c.label}`, "");
      for (const i of items) {
        const r = res(i.id);
        L.push(`### ${isDone(i) ? "[x]" : "[ ]"} ${i.title}`, "");
        const R = r.result;
        if (R?.kind === "tent_table") {
          L.push(`| Festzelt | ${an.targetYear} | ${an.targetYear - 1} | Δ | Quelle | geprüft |`, "|---|---|---|---|---|---|");
          R.rows.forEach((row) => L.push(`| ${row.tent} | ${RR.agent.eur(row.curr)} | ${RR.agent.eur(row.prev)} | ${RR.agent.fmtPct(row.delta)} | ${row.source.url || row.source.label} | ${row.verified ? "ja" : "nein"} |`));
          L.push("");
        }
        if (R?.kind === "facts") R.facts.forEach((f) => L.push(`- **${f.label}:** ${f.value} (Quelle: ${f.source?.url || f.source?.label || "–"})`));
        if (R?.kind === "series") R.series.forEach((s) => L.push(`- **${s.year}:** ${RR.agent.eur(s.min)} – ${RR.agent.eur(s.max)} (Quelle: ${s.source?.url || s.source?.label})`));
        if (r.handoff) L.push(`> ${r.handoff}`);
        if (r.reply) L.push("**Antwort (E-Mail):**", "```", r.reply, "```");
        if (r.transcript) L.push("**Transkript (Anruf):**", "```", r.transcript, "```");
        if (i.category === "human" && i.questions.length) i.questions.forEach((q) => L.push(`- Frage: ${q}`));
        if (r.note) L.push(`**Notiz:** ${r.note}`);
        L.push("");
      }
    }
    download(`recherche-${an.type.id}-${an.targetYear}.md`, L.join("\n"), "text/markdown");
  }

  function exportJson() {
    const { articles, ...rest } = state;
    const data = { ...rest, articles: articles.map(({ text, ...a }) => a) };
    download(`recherche-${state.analysis.type.id}-${state.analysis.targetYear}.json`, JSON.stringify(data, null, 2), "application/json");
  }

  // Download klappt nicht überall (z. B. in eingebetteten Vorschauen) – daher zusätzlich zum Kopieren anzeigen
  function showExport(name, content) {
    let box = $("#export-box");
    if (!box) {
      box = Object.assign(document.createElement("div"), { id: "export-box", className: "card export-box" });
      $("#board").after(box);
    }
    box.innerHTML = `<div class="bc-head"><h3>Export: ${esc(name)}</h3><span>
        <button class="btn btn-secondary btn-small" data-act="copy-export" type="button">Kopieren</button>
        <button class="btn btn-ghost btn-small" data-act="close-export" type="button">Schließen</button></span></div>
      <textarea id="export-text" rows="12" readonly>${esc(content)}</textarea>`;
    box.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  function download(name, content, type) {
    showExport(name, content);
    const url = URL.createObjectURL(new Blob([content], { type: type + ";charset=utf-8" }));
    const a = Object.assign(document.createElement("a"), { href: url, download: name });
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function toast(msg) {
    const t = Object.assign(document.createElement("div"), { className: "toast", textContent: msg });
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 3500);
  }

  /* ---------- Events ---------- */
  const find = (id) => state.checklist.find((i) => i.id === id);

  document.addEventListener("click", (e) => {
    const stepBtn = e.target.closest(".step");
    if (stepBtn) return go(Number(stepBtn.dataset.step));
    const gotoBtn = e.target.closest("[data-goto]");
    if (gotoBtn) return go(Number(gotoBtn.dataset.goto));
    const el = e.target.closest("[data-act]");
    if (!el) return;
    const id = el.dataset.id;
    switch (el.dataset.act) {
      case "add-paste": {
        const ta = $("#paste-text");
        if (ta.value.trim().length < 20) return toast("Bitte einen längeren Text einfügen.");
        state.articles.push(RR.ingest.makeArticle(ta.value));
        ta.value = "";
        invalidateAnalysis(); save(); renderArticles();
        break;
      }
      case "remove-article":
        state.articles = state.articles.filter((a) => a.id !== id);
        invalidateAnalysis(); save(); render();
        break;
      case "analyze": runAnalysis(); break;
      case "build-checklist": buildChecklist(); break;
      case "del-item":
        state.checklist = state.checklist.filter((i) => i.id !== id);
        delete state.results[id];
        save(); renderChecklist();
        break;
      case "to-board":
        if (!state.checklist.length) return toast("Die Checkliste ist leer.");
        go(4);
        if (state.checklist.some((i) => i.category === "agent" && res(i.id).status === "open")) runAgent();
        break;
      case "run-agent":
        state.checklist.filter((i) => i.category === "agent").forEach((i) => (res(i.id).status = "open"));
        runAgent();
        break;
      case "approve-email": res(id).confirm = "email"; refreshCard(id); break;
      case "approve-call": res(id).confirm = "call"; refreshCard(id); break;
      case "export-md": exportMarkdown(); break;
      case "export-json": exportJson(); break;
      case "reset":
        if (el.dataset.armed) { state = fresh(); save(); render(); $("#export-box")?.remove(); }
        else {
          el.dataset.armed = "1";
          el.textContent = "Wirklich zurücksetzen?";
          setTimeout(() => { delete el.dataset.armed; el.textContent = "Neu starten"; }, 4000);
          return;
        }
        delete el.dataset.armed; el.textContent = "Neu starten";
        break;
      case "confirm-yes": res(id).confirm = null; approve(id, el.dataset.channel); break;
      case "confirm-no": res(id).confirm = null; refreshCard(id); break;
      case "copy-export": {
        const ta = $("#export-text");
        const fallback = () => { ta.focus(); ta.select(); toast("Text markiert – mit Strg/Cmd+C kopieren."); };
        try { navigator.clipboard.writeText(ta.value).then(() => toast("Kopiert."), fallback); } catch (err) { fallback(); }
        break;
      }
      case "close-export": $("#export-box")?.remove(); break;
    }
  });

  document.addEventListener("change", (e) => {
    const el = e.target;
    const id = el.dataset.id;
    switch (el.dataset.act) {
      case "toggle-include":
        state.include[id] = el.checked; save();
        break;
      case "edit-cat": {
        const item = find(id);
        item.category = el.value;
        ensureShape(item);
        delete state.results[id];
        save(); renderChecklist();
        break;
      }
      case "verify-row": {
        const row = res(id).result.rows[Number(el.dataset.idx)];
        row.verified = el.checked;
        el.closest("tr").classList.toggle("verified", el.checked);
        save();
        break;
      }
      case "human-done":
        res(id).done = el.checked; refreshCard(id);
        break;
    }
  });

  document.addEventListener("input", (e) => {
    const el = e.target;
    const id = el.dataset.id;
    switch (el.dataset.act) {
      case "edit-title": find(id).title = el.value; save(); break;
      case "note": res(id).note = el.value; save(); break;
      case "email-field": find(id).email[el.dataset.field] = el.value; save(); break;
      case "call-field": find(id).call.script = el.value; save(); break;
    }
  });

  $("#add-item").addEventListener("submit", (e) => {
    e.preventDefault();
    const title = $("#new-title").value.trim();
    if (!title) return;
    const item = { id: uid(), title, category: $("#new-cat").value, action: null, contact: null, channels: [], email: null, call: null, questions: [], hint: "", why: "", custom: true };
    ensureShape(item);
    state.checklist.push(item);
    $("#new-title").value = "";
    save(); renderChecklist();
  });

  const dz = $("#dropzone");
  $("#file-input").addEventListener("change", (e) => { addFiles([...e.target.files]); e.target.value = ""; });
  ["dragenter", "dragover"].forEach((t) => dz.addEventListener(t, (e) => { e.preventDefault(); dz.classList.add("over"); }));
  ["dragleave", "drop"].forEach((t) => dz.addEventListener(t, (e) => { e.preventDefault(); dz.classList.remove("over"); }));
  dz.addEventListener("drop", (e) => addFiles([...e.dataTransfer.files]));

  // Eine unterbrochene Simulation nach dem Neuladen nicht hängen lassen
  state.running = false;
  Object.values(state.results || {}).forEach((r) => {
    if (r.status === "running") r.status = "open";
    if (r.emailState === "sending" || r.emailState === "sent") { r.emailState = null; }
    if (r.callState === "calling") r.callState = null;
    r.confirm = null;
  });
  render();
})();
