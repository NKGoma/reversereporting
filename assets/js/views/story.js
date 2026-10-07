/* Schritt 5 · Story-Entwurf und Blueprint für das nächste Jahr speichern. */
(function () {
  const RR = window.RR;
  const { esc, icon, toast } = RR.ui;
  const A = () => RR.app;
  const S = () => RR.app.state;

  const seg = (x) => (x.gap !== undefined ? `<button type="button" class="gap-chip" data-act="gap-open" data-id="${x.gap || ""}">${icon("gap")}OFFEN: ${esc(x.label)}</button>` : esc(x.t));

  RR.views.story = function () {
    const s = S();
    const st = RR.story.build(s);
    const an = s.analysis;
    const k = A().stats();
    const saved = A().library.all().some((b) => b.name.startsWith(an.type.label) && b.lastYear === an.targetYear);
    return `
    <section class="screen">
      <header class="screen-head">
        <div class="screen-title">
          <p class="eyebrow">Schritt 5 · Story</p>
          <h1>Rohfassung mit markierten Lücken</h1>
          <p class="lead">Aus den Rechercheergebnissen zusammengesetzt. Jede Lücke führt direkt zum offenen Punkt.</p>
        </div>
      </header>
      <div class="story-grid">
        <article class="card draft">
          ${st.demo ? `<p class="sample-note">${icon("alert")} Enthält simulierte Demo-Werte – vor Verwendung gegen die Quellen prüfen.</p>` : ""}
          <h2 class="draft-head">${st.headline.map(seg).join("")}</h2>
          <p class="draft-lead">${st.lead.map(seg).join("")}</p>
          ${st.paras.map((p) => `<p>${p.map(seg).join("")}</p>`).join("")}
          <div class="draft-actions">
            <button class="btn btn-secondary" data-act="copy-story" type="button">${icon("copy")} Text kopieren</button>
            <button class="btn btn-ghost" data-act="export-md" type="button">${icon("doc")} Recherche-Dossier exportieren</button>
          </div>
        </article>
        <aside class="side">
          <div class="card side-card">
            <p class="eyebrow">Stand</p>
            <dl class="mini-stats">
              <div><dt>Punkte erledigt</dt><dd>${k.done}/${k.total}</dd></div>
              <div><dt>Lücken im Text</dt><dd>${st.gaps}</dd></div>
              <div><dt>Quellen</dt><dd>${k.sources}</dd></div>
            </dl>
          </div>
          <div class="card side-card next-card">
            <p class="eyebrow">Nächstes Jahr</p>
            <h3>Blueprint speichern</h3>
            <p class="small">Die bearbeitete Checkliste – mit Spuren, Kontakten, Quellen und Entwürfen – wird zur Vorlage. ${esc(an.type.event || an.type.short)} ${an.targetYear + 1} startet dann mit einem Klick.</p>
            <button class="btn btn-primary" data-act="save-blueprint" type="button" ${saved ? "disabled" : ""}>${icon("save")} ${saved ? "Gespeichert" : "Blueprint speichern"}</button>
            <button class="btn btn-ghost btn-sm" data-act="export-blueprint" type="button">Als Datei teilen</button>
          </div>
        </aside>
      </div>
      <div class="actions">
        <button class="btn btn-ghost" data-act="go" data-to="reconcile" type="button">Zurück zum Abgleich</button>
        <button class="btn btn-ghost" data-act="home" type="button">Zur Startseite</button>
      </div>
    </section>`;
  };

  function dossier() {
    const s = S();
    const an = s.analysis;
    const L = [`# Recherche: ${an.type.label} ${an.targetYear}`, "", `_Erstellt mit Reverse Reporting (Prototyp, ${an.engine === "ai" ? "KI-Modus" : "Offline-Engine"}). Demo-Werte sind simuliert und müssen geprüft werden._`, "", "## Story-Entwurf", "", RR.story.toText(RR.story.build(s)), ""];
    for (const [k, c] of Object.entries(RR.ui.CAT)) {
      const items = s.checklist.filter((i) => i.category === k);
      if (!items.length) continue;
      L.push(`## ${c.label}`, "");
      for (const i of items) {
        const r = s.results[i.id] || {};
        L.push(`### ${A().isDone(i) ? "[x]" : "[ ]"} ${i.title}`, "");
        const R = r.result;
        if (R && R.kind === "tents") {
          L.push(`| Zelt | ${an.targetYear} | ${an.targetYear - 1} | Δ | Quelle | geprüft |`, "|---|---|---|---|---|---|");
          R.rows.forEach((row) => L.push(`| ${row.tent} | ${RR.fmt.eur(row.curr)} | ${RR.fmt.eur(row.prev)} | ${RR.fmt.fmtPct(row.delta)} | ${row.source.url || row.source.label} | ${row.verified ? "ja" : "nein"} |`));
          L.push("");
        }
        if (R && R.facts) R.facts.forEach((f) => L.push(`- **${f.label}:** ${f.value} (Quelle: ${(f.source && (f.source.url || f.source.label)) || "–"})${f.demo ? " [Demo]" : ""}`));
        if (R && R.series) R.series.forEach((p) => L.push(`- **${p.year}:** ${RR.fmt.eur(p.min)} – ${RR.fmt.eur(p.max)} (Quelle: ${p.source.url || p.source.label})`));
        if (r.handoff) L.push(`> ${r.handoff}`);
        if (r.reply) L.push("", "**Antwort (E-Mail, simuliert):**", "```", r.reply, "```");
        if (r.transcript) L.push("", "**Transkript (Anruf, simuliert):**", "```", r.transcript, "```");
        if (i.questions && i.questions.length) i.questions.forEach((q) => L.push(`- Frage: ${q}`));
        if (r.note) L.push(`**Notiz:** ${r.note}`);
        L.push("");
      }
    }
    return L.join("\n");
  }

  Object.assign(RR.act, {
    "gap-open": (el) => {
      if (!el.dataset.id) return;
      A().go("research");
      RR.openDrawer({ kind: "item", id: el.dataset.id });
    },
    "copy-story": () => RR.ui.copyText(RR.story.toText(RR.story.build(S()))),
    "export-md": () => RR.ui.offerFile(`recherche-${S().analysis.targetYear}.md`, dossier(), "text/markdown"),
    "save-blueprint": () => {
      const b = A().library.snapshot();
      const ok = A().library.put([b, ...A().library.all()]);
      toast(ok ? "Blueprint gespeichert – zu finden auf der Startseite." : "Speichern nicht möglich (Browser-Speicher gesperrt). Nutze „Als Datei teilen“.", ok ? "" : "warn");
      A().render();
    },
    "export-blueprint": () => {
      const b = A().library.snapshot();
      RR.ui.offerFile(`blueprint-${b.name.replace(/[^a-z0-9äöüß]+/gi, "-").toLowerCase()}.json`, JSON.stringify(b, null, 2), "application/json");
    },
  });
})();
