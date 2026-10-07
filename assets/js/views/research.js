/* Schritt 3 · Recherche-Cockpit: drei Spuren, Kennzahlen, Detail-Drawer, Agent-Lauf, Freigaben. */
(function () {
  const RR = window.RR;
  const { esc, icon, CAT } = RR.ui;
  const A = () => RR.app;
  const S = () => RR.app.state;
  const res = (id) => RR.app.res(id);
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const find = (id) => S().checklist.find((i) => i.id === id);

  /* ---------- Status einer Karte ---------- */
  function status(item) {
    const r = res(item.id);
    if (item.category === "agent") {
      if (r.status === "running") return { key: "run", label: "sucht …", preview: r.log[r.log.length - 1] || "startet" };
      if (r.status === "done" && r.result.carried) return { key: "wait", label: "Vorschlag aus Archiv – bestätigen", preview: r.result.summary };
      if (r.status === "done") return { key: "done", label: "gefunden – prüfen", preview: r.result.summary };
      if (r.status === "handoff") return r.done ? { key: "done", label: "von dir erledigt", preview: r.note || "erledigt" } : { key: "human", label: "an dich übergeben", preview: "Agent hat nichts Verlässliches gefunden" };
      return { key: "idle", label: "wartet", preview: item.source ? `Quelle: ${item.source.label}` : "" };
    }
    if (item.category === "approve") {
      const c = RR.agent.contactFor(item, S().analysis);
      if (r.reply || r.transcript) return { key: "done", label: "Antwort da – prüfen", preview: (r.reply || r.transcript).split("\n").find((l) => l.length > 40 && !/^\[/.test(l)) || "Antwort liegt vor" };
      if (r.emailState === "sending" || r.emailState === "sent" || r.callState === "calling") return { key: "run", label: r.callState === "calling" ? "Anruf läuft …" : "gesendet – wartet", preview: c.org };
      return { key: "wait", label: "Entwurf bereit – Freigabe", preview: [item.channels.includes("email") && "E-Mail", item.channels.includes("call") && "Anruf"].filter(Boolean).join(" + ") + " an " + c.org };
    }
    return r.done ? { key: "done", label: "erledigt", preview: r.note || "erledigt" } : { key: "human", label: "deine Aufgabe", preview: item.hint || item.questions[0] || "" };
  }

  function badge(item) {
    const r = res(item.id);
    if (r.result && r.result.ai) return `<span class="badge badge-ai">${icon("spark")}KI</span>`;
    if (r.result && r.result.demo) return `<span class="badge badge-demo">Demo</span>`;
    return "";
  }

  function cardHtml(item) {
    const st = status(item);
    return `<button type="button" class="rc-card st-${st.key}" data-card="${item.id}" data-act="open-item" data-id="${item.id}">
      <span class="rc-top"><span class="dot"></span><span class="rc-status">${esc(st.label)}</span>${badge(item)}</span>
      <span class="rc-title">${esc(item.title)}</span>
      ${st.preview ? `<span class="rc-preview">${esc(st.preview)}</span>` : ""}
    </button>`;
  }

  function kpiHtml() {
    const k = A().stats();
    const pct = k.total ? Math.round((k.done / k.total) * 100) : 0;
    const h = Math.floor(k.minutes / 60), m = k.minutes % 60;
    const run = S().running;
    const anyOpen = S().checklist.some((i) => i.category === "agent" && res(i.id).status === "open");
    return `<div class="kpis" id="kpis">
      <div class="kpi kpi-main"><span class="kpi-label">Fortschritt</span><span class="kpi-val">${k.done}<small>/${k.total}</small></span><span class="meter"><span style="width:${pct}%"></span></span></div>
      <div class="kpi"><span class="kpi-label">${icon("link")} Quellen</span><span class="kpi-val">${k.sources}</span></div>
      <div class="kpi"><span class="kpi-label">${icon("send")} Freigaben offen</span><span class="kpi-val">${k.approvals}</span></div>
      <div class="kpi"><span class="kpi-label">${icon("user")} Für dich</span><span class="kpi-val">${k.mine}</span></div>
      <div class="kpi"><span class="kpi-label">${icon("clock")} Zeit gespart</span><span class="kpi-val">≈ ${h ? h + " h " : ""}${m} min</span></div>
      <button class="btn ${run ? "btn-ghost" : "btn-primary"} kpi-run" data-act="run-agent" type="button" ${run ? "disabled" : ""}>${run ? `<span class="spinner"></span> Agent arbeitet …` : anyOpen ? `${icon("play")} Agent starten` : `${icon("refresh")} Erneut ausführen`}</button>
    </div>`;
  }

  RR.views.research = function () {
    const s = S();
    const an = s.analysis;
    const by = (k) => s.checklist.filter((i) => i.category === k);
    const ai = an.engine === "ai" && RR.ai.hasKey();
    return `
    <section class="screen">
      <header class="screen-head">
        <div class="screen-title">
          <p class="eyebrow">Schritt 3 · Recherche</p>
          <h1>${esc(an.type.event || an.type.short)} ${an.targetYear}: Recherche läuft</h1>
          <p class="lead">${ai ? "Claude sucht im Netz nach aktuellen Werten und belegt jede Angabe mit Quelle." : "Offline-Simulation: Archivwerte sind echt, aktuelle Werte sind Demo-Daten."} Klick auf eine Karte öffnet die Details.</p>
        </div>
      </header>
      ${kpiHtml()}
      <div class="lanes cockpit">${Object.entries(CAT).map(([k, c]) => `
        <div class="lane lane-${k}">
          <div class="lane-head"><span class="lane-ic">${icon(c.icon)}</span><div><h2>${c.label}</h2><p>${c.desc}</p></div><span class="count">${by(k).length}</span></div>
          <div class="lane-body">${by(k).map(cardHtml).join("") || `<p class="empty-note">Keine Punkte</p>`}</div>
        </div>`).join("")}
      </div>
      <div class="actions">
        <button class="btn btn-ghost" data-act="go" data-to="blueprint" type="button">Checkliste bearbeiten</button>
        <button class="btn btn-primary btn-lg" data-act="go" data-to="reconcile" type="button">Zum Abgleich ${icon("arrow")}</button>
      </div>
    </section>`;
  };

  // Karte, Kennzahlen, Phasenleiste und ggf. Drawer aktualisieren
  function refresh(id) {
    const item = find(id);
    const el = document.querySelector(`[data-card="${id}"]`);
    if (item && el && el.classList.contains("rc-card")) el.outerHTML = cardHtml(item);
    const k = document.getElementById("kpis");
    if (k) k.outerHTML = kpiHtml();
    A().renderRail();
    RR.refreshItem(id);
    A().save();
  }

  /* ---------- Ergebnisdarstellung ---------- */
  function src(s) {
    if (!s) return "";
    return s.url ? `<a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.label)}${icon("link", "ic-xs")}</a>` : `<span class="muted">${esc(s.label)}</span>`;
  }
  function resultHtml(item, R) {
    const an = S().analysis;
    if (!R) return "";
    if (R.kind === "tents") {
      return `<div class="table-wrap"><table class="data">
        <thead><tr><th>Zelt</th><th class="num">${an.targetYear} <span class="badge badge-demo">Demo</span></th><th class="num">${an.targetYear - 1}</th><th class="num">Δ</th><th>Quelle</th><th class="c">Geprüft</th></tr></thead>
        <tbody>${R.rows.map((row, idx) => `<tr class="${row.verified ? "is-verified" : ""}">
          <td>${esc(row.tent)}</td>
          <td class="num"><strong>${RR.fmt.eur(row.curr)}</strong></td>
          <td class="num">${RR.fmt.eur(row.prev)}<small>${esc(row.prevFrom)}</small></td>
          <td class="num ${row.delta > 5 ? "is-hot" : ""}">${RR.fmt.fmtPct(row.delta)}</td>
          <td>${src(row.source)}</td>
          <td class="c"><input type="checkbox" data-act="verify-row" data-id="${item.id}" data-idx="${idx}" ${row.verified ? "checked" : ""} aria-label="${esc(row.tent)} geprüft"></td>
        </tr>`).join("")}</tbody></table></div>`;
    }
    if (R.kind === "series") {
      return `<ul class="facts">${R.series.map((p) => `<li><span class="f-l">${p.year}</span><span class="f-v">${p.min === p.max ? RR.fmt.eur(p.max) : RR.fmt.eur(p.min) + " – " + RR.fmt.eur(p.max)}${p.demo ? ' <span class="badge badge-demo">Demo</span>' : ""}</span><span class="f-s">${src(p.source)}</span></li>`).join("")}</ul>`;
    }
    return `<ul class="facts">${R.facts.map((f) => `<li><span class="f-l">${esc(f.label)}</span><span class="f-v">${esc(f.value)}${f.demo ? ' <span class="badge badge-demo">Demo</span>' : ""}</span><span class="f-s">${src(f.source)}</span></li>`).join("")}</ul>`;
  }

  function noteBlock(item, r, label) {
    return `<label class="label" for="note-${item.id}">${label}</label>
      <textarea id="note-${item.id}" rows="4" data-act="note" data-id="${item.id}" placeholder="Ergebnis, Zitat oder Notiz – mit Quelle">${esc(r.note || "")}</textarea>
      <label class="check"><input type="checkbox" data-act="human-done" data-id="${item.id}" ${r.done ? "checked" : ""}> erledigt</label>`;
  }

  function confirmBox(id, channel, text) {
    return `<div class="confirm" role="group" aria-label="Freigabe bestätigen"><p>${esc(text)}</p>
      <div class="confirm-btns"><button class="btn btn-approve" data-act="confirm-yes" data-channel="${channel}" data-id="${id}" type="button">${icon("check")} Ja, freigeben</button>
      <button class="btn btn-ghost" data-act="confirm-no" data-id="${id}" type="button">Abbrechen</button></div></div>`;
  }

  RR.drawerItem = function (id) {
    const item = find(id);
    if (!item) return "";
    const r = res(id);
    const st = status(item);
    const c = CAT[item.category];
    const an = S().analysis;
    let body = "";
    if (item.why) body += `<p class="why">${esc(item.why)}</p>`;

    if (item.category === "agent") {
      if (r.log.length) body += `<p class="eyebrow">Protokoll des Agenten</p><ol class="log">${r.log.map((l) => `<li>${esc(l)}</li>`).join("")}</ol>`;
      else body += `<p class="muted">Der Agent hat diesen Punkt noch nicht bearbeitet.</p>`;
      if (r.result) body += `<p class="eyebrow">Ergebnis${r.result.ai ? " (Claude, Websuche)" : r.result.demo ? " (simuliert)" : " (aus dem Archiv)"}</p>${resultHtml(item, r.result)}`;
      if (r.status === "handoff") body += `<div class="handoff"><p>${icon("alert")} ${esc(r.handoff)}</p>${noteBlock(item, r, "Dein Ergebnis")}</div>`;
      if (r.status === "done" || r.status === "handoff") body += `<button class="btn btn-ghost btn-sm" data-act="rerun" data-id="${id}" type="button">${icon("refresh")} Erneut versuchen</button>`;
    }

    if (item.category === "approve") {
      const ct = RR.agent.contactFor(item, an);
      body += `<div class="contact">${icon("user")}<div><strong>${esc(ct.org)}</strong><span class="muted small">${esc(ct.email)} · ${esc(ct.phone)}</span></div>${an.engine === "ai" ? "" : '<span class="badge badge-demo">Demo-Kontakt</span>'}</div>`;
      if (item.channels.includes("email") && item.email) {
        const locked = !!r.emailState;
        body += `<section class="channel"><h3>${icon("mail")} E-Mail-Entwurf</h3>
          <label class="label" for="em-to-${id}">An</label><input id="em-to-${id}" data-act="email-field" data-field="to" data-id="${id}" value="${esc(item.email.to)}" ${locked ? "disabled" : ""}>
          <label class="label" for="em-su-${id}">Betreff</label><input id="em-su-${id}" data-act="email-field" data-field="subject" data-id="${id}" value="${esc(item.email.subject)}" ${locked ? "disabled" : ""}>
          <label class="label" for="em-bo-${id}">Text</label><textarea id="em-bo-${id}" rows="8" data-act="email-field" data-field="body" data-id="${id}" ${locked ? "disabled" : ""}>${esc(item.email.body)}</textarea>
          ${r.emailState === "sending" ? `<p class="state st-run"><span class="spinner"></span> wird gesendet … (Simulation)</p>`
            : r.emailState === "sent" ? `<p class="state st-run"><span class="spinner"></span> gesendet (simuliert) – wartet auf Antwort</p>`
            : r.emailState === "replied" ? `<p class="state st-done">${icon("check")} Antwort eingegangen (simuliert)</p><pre class="reply">${esc(r.reply)}</pre>`
            : r.confirm === "email" ? confirmBox(id, "email", `E-Mail an ${item.email.to} freigeben? In diesem Prototyp wird nichts versendet.`)
            : `<button class="btn btn-approve" data-act="approve" data-channel="email" data-id="${id}" type="button">${icon("send")} E-Mail freigeben &amp; senden</button>`}
        </section>`;
      }
      if (item.channels.includes("call") && item.call) {
        body += `<section class="channel"><h3>${icon("phone")} Anruf mit Aufzeichnung</h3>
          <p class="small"><strong>${esc(ct.org)}</strong> · ${esc(item.call.phone)}</p>
          <label class="label" for="call-${id}">Gesprächsleitfaden</label><textarea id="call-${id}" rows="5" data-act="call-field" data-id="${id}" ${r.callState ? "disabled" : ""}>${esc(item.call.script)}</textarea>
          ${r.callState === "calling" ? `<p class="state st-run"><span class="rec"></span> Anruf läuft, wird aufgezeichnet … (Simulation)</p>`
            : r.callState === "recorded" ? `<p class="state st-done">${icon("check")} Anruf aufgezeichnet (simuliert)</p><pre class="reply">${esc(r.transcript)}</pre>`
            : r.confirm === "call" ? confirmBox(id, "call", `Anruf bei ${ct.org} freigeben und aufzeichnen? In diesem Prototyp wird nicht telefoniert.`)
            : `<button class="btn btn-approve" data-act="approve" data-channel="call" data-id="${id}" type="button">${icon("phone")} Anruf freigeben &amp; aufzeichnen</button>`}
        </section>`;
      }
    }

    if (item.category === "human") {
      if (item.hint) body += `<p>${esc(item.hint)}</p>`;
      if (item.questions.length) body += `<p class="eyebrow">Vorgeschlagene Fragen</p><ul class="questions">${item.questions.map((q) => `<li>${esc(q)}</li>`).join("")}</ul>`;
      body += noteBlock(item, r, "Dein Ergebnis");
    }

    return `<div class="drawer-head lane-${item.category}">
        <div><p class="eyebrow">${icon(c.icon)} ${c.label} · <span class="st-${st.key}-text">${esc(st.label)}</span></p><h2>${esc(item.title)}</h2></div>
        <button class="icon-btn drawer-close" data-act="close-drawer" type="button" aria-label="Schließen">${icon("x")}</button>
      </div>
      <div class="drawer-body">${body}</div>`;
  };

  /* ---------- Agent-Lauf ---------- */
  async function runOne(item) {
    const s = S();
    const an = s.analysis;
    const r = res(item.id);
    Object.assign(r, { status: "running", log: [], result: null, handoff: null, done: false });
    refresh(item.id);
    const useAI = an.engine === "ai" && RR.ai.hasKey() && item.action === "ai_research";
    if (useAI) {
      r.log.push("Starte Websuche mit Claude …");
      refresh(item.id);
      try {
        const out = await RR.ai.research(item, an, (line) => { r.log.push(line); refresh(item.id); });
        if (out.handoff) Object.assign(r, { status: "handoff", handoff: out.handoff });
        else { r.log.push(`Gefunden: ${out.result.summary}`); Object.assign(r, { status: "done", result: out.result }); }
      } catch (err) {
        r.log.push("Fehler: " + err.message);
        Object.assign(r, { status: "handoff", handoff: "Die Websuche ist fehlgeschlagen: " + err.message });
      }
      refresh(item.id);
      return;
    }
    const out = RR.agent.run(item.action === "ai_research" ? { ...item, action: "lookup" } : item, an);
    const step = Math.max(90, Math.min(260, 2400 / out.log.length));
    for (const line of out.log) {
      await sleep(step);
      r.log.push(line);
      refresh(item.id);
    }
    await sleep(200);
    if (out.handoff) Object.assign(r, { status: "handoff", handoff: out.handoff });
    else Object.assign(r, { status: "done", result: out.result });
    refresh(item.id);
  }

  RR.runAgent = async function (rerunAll) {
    const s = S();
    if (s.running) return;
    const items = s.checklist.filter((i) => i.category === "agent" && (rerunAll || res(i.id).status === "open"));
    if (!items.length) return;
    s.running = true;
    refresh(null);
    // KI-Modus: bis zu drei Punkte parallel; offline nacheinander (fürs Auge)
    if (s.analysis.engine === "ai" && RR.ai.hasKey()) {
      const queue = items.slice();
      await Promise.all([0, 1, 2].map(async () => { while (queue.length) await runOne(queue.shift()); }));
    } else {
      for (const it of items) await runOne(it);
    }
    s.running = false;
    refresh(null);
  };

  async function approve(id, channel) {
    const item = find(id);
    const r = res(id);
    if (channel === "email") {
      r.emailState = "sending"; refresh(id);
      await sleep(900);
      r.emailState = "sent"; refresh(id);
      await sleep(2200);
      r.emailState = "replied"; r.reply = RR.agent.reply(item); refresh(id);
    } else {
      r.callState = "calling"; refresh(id);
      await sleep(2600);
      r.callState = "recorded"; r.transcript = RR.agent.transcript(item); refresh(id);
    }
  }

  Object.assign(RR.act, {
    "open-item": (el) => RR.openDrawer({ kind: "item", id: el.dataset.id }),
    "run-agent": () => {
      const s = S();
      const anyOpen = s.checklist.some((i) => i.category === "agent" && res(i.id).status === "open");
      RR.runAgent(!anyOpen);
    },
    rerun: (el) => { if (!S().running) runOne(find(el.dataset.id)); },
    approve: (el) => { res(el.dataset.id).confirm = el.dataset.channel; refresh(el.dataset.id); },
    "confirm-yes": (el) => { res(el.dataset.id).confirm = null; approve(el.dataset.id, el.dataset.channel); },
    "confirm-no": (el) => { res(el.dataset.id).confirm = null; refresh(el.dataset.id); },
  });

  RR.onChange["verify-row"] = (el) => {
    const row = res(el.dataset.id).result.rows[Number(el.dataset.idx)];
    row.verified = el.checked;
    el.closest("tr").classList.toggle("is-verified", el.checked);
    A().save();
    A().renderRail();
  };
  RR.onChange["human-done"] = (el) => { res(el.dataset.id).done = el.checked; refresh(el.dataset.id); };
  RR.onInput.note = (el) => { res(el.dataset.id).note = el.value; A().save(); };
  RR.onInput["email-field"] = (el) => { find(el.dataset.id).email[el.dataset.field] = el.value; A().save(); };
  RR.onInput["call-field"] = (el) => { find(el.dataset.id).call.script = el.value; A().save(); };
})();
