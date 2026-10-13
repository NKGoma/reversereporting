/* Schritt 4 · Abgleich: Abweichungen, Lücken, Bestätigungen. */
(function () {
  const RR = window.RR;
  const { esc, icon } = RR.ui;
  const S = () => RR.app.state;

  const LEVEL = {
    warn: { label: "Abweichungen", icon: "alert", text: "Bitte prüfen, bevor etwas veröffentlicht wird." },
    gap: { label: "Lücken", icon: "gap", text: "Fehlt noch – bei dir oder in Arbeit." },
    ok: { label: "Bestätigt", icon: "check", text: "Plausibel oder mit dem Archiv abgeglichen." },
  };

  RR.views.reconcile = function () {
    const s = S();
    const flags = RR.reconcile(s);
    const by = (l) => flags.filter((f) => f.level === l);
    return `
    <section class="screen">
      <header class="screen-head">
        <div class="screen-title">
          <p class="eyebrow">Schritt 4 · Abgleich</p>
          <h1>Was passt, was fehlt, was auffällt</h1>
          <p class="lead">Die Ergebnisse werden gegen das Archiv und gegeneinander geprüft – zum Beispiel ungewöhnliche Sprünge, widersprüchliche Spannen oder Antworten, die von früheren Angaben abweichen.</p>
        </div>
        <div class="tally">${Object.entries(LEVEL).map(([k, l]) => `<div class="tally-item lvl-${k}">${icon(l.icon)}<strong>${by(k).length}</strong><span>${l.label}</span></div>`).join("")}</div>
      </header>
      ${factTable(RR.factCheck(s))}
      <div class="flag-cols">${Object.entries(LEVEL).map(([k, l]) => `
        <section class="flag-col lvl-${k}">
          <h2>${icon(l.icon)} ${l.label}</h2>
          <p class="muted small">${l.text}</p>
          ${by(k).length ? `<ul class="flags">${by(k).map((f) => `
            <li class="flag">
              <div><strong>${esc(f.title)}</strong><p>${esc(f.text)}</p></div>
              <button class="btn btn-ghost btn-sm" data-act="flag-open" data-id="${f.item}" type="button">Öffnen</button>
            </li>`).join("")}</ul>` : `<p class="empty-note">Nichts.</p>`}
        </section>`).join("")}
      </div>
      <div class="actions">
        <button class="btn btn-ghost" data-act="go" data-to="research" type="button">Zurück zur Recherche</button>
        <button class="btn btn-primary btn-lg" data-act="go" data-to="story" type="button">Story-Entwurf ${icon("arrow")}</button>
      </div>
    </section>`;
  };

  function factTable(rows) {
    const an = S().analysis;
    if (!(an.datasets || []).length) return "";
    const warn = rows.filter((r) => r.level === "warn"), ok = rows.filter((r) => r.level === "ok");
    const tr = (r) => `<tr class="fc-${r.level}"><td class="num">${r.year}</td><td>${esc(r.topic)}</td><td>„${esc(r.claim)}“<small>${esc(r.article)}</small></td><td class="num">${esc(r.official)}</td><td><span class="fc-note">${icon(r.level === "ok" ? "check" : "alert")}${esc(r.note)}</span></td></tr>`;
    return `<section class="card factcheck">
      <div class="section-head"><div><p class="eyebrow">Faktencheck</p><h2>Archiv gegen amtliche Daten</h2></div>
        <span class="fc-tally"><span class="lvl-warn">${warn.length} abweichend</span><span class="lvl-ok">${ok.length} bestätigt</span></span></div>
      <p class="muted small">Zahlen aus deinen Artikeln, verglichen mit den Jahreswerten der Stadt München (Open Data, dl-by-de/2.0).</p>
      ${rows.length ? `<div class="table-wrap"><table class="data">
        <thead><tr><th class="num">Jahr</th><th>Thema</th><th>Artikel sagt</th><th class="num">Amtlich</th><th>Ergebnis</th></tr></thead>
        <tbody>${warn.map(tr).join("")}${ok.slice(0, warn.length ? 4 : 6).map(tr).join("")}</tbody></table></div>
        ${ok.length > (warn.length ? 4 : 6) ? `<details class="fc-more"><summary>Alle ${ok.length} Bestätigungen zeigen</summary><div class="table-wrap"><table class="data"><tbody>${ok.map(tr).join("")}</tbody></table></div></details>` : ""}`
      : `<p class="empty-note">Keine prüfbaren Zahlen für Jahre, zu denen es amtliche Daten gibt.</p>`}
    </section>`;
  }

  RR.act["flag-open"] = (el) => {
    RR.app.go("research");
    RR.openDrawer({ kind: "item", id: el.dataset.id });
  };
})();
