/* Schritt 2 · Blueprint: Checkliste in drei Spuren prüfen und bearbeiten. */
(function () {
  const RR = window.RR;
  const { esc, icon, CAT, toast } = RR.ui;
  const A = () => RR.app;
  const S = () => RR.app.state;

  function card(i) {
    return `<div class="bp-card" data-card="${i.id}">
      <input class="bp-title" value="${esc(i.title)}" data-act="bp-title" data-id="${i.id}" aria-label="Titel des Punkts">
      <p class="bp-why">${esc(i.why || (i.custom ? "Eigener Punkt" : ""))}${i.hits ? ` <span class="muted">· belegt in ${i.hits}/${i.total} Artikeln</span>` : ""}</p>
      <div class="bp-foot">
        <div class="seg seg-sm" role="radiogroup" aria-label="Spur">${Object.entries(CAT).map(([k, c]) => `<button type="button" role="radio" aria-checked="${k === i.category}" class="${k === i.category ? "is-on lane-" + k : ""}" data-act="bp-move" data-id="${i.id}" data-to="${k}" title="${c.label}">${icon(c.icon)}<span>${c.short}</span></button>`).join("")}</div>
        <button type="button" class="icon-btn" data-act="bp-del" data-id="${i.id}" aria-label="Punkt löschen">${icon("trash")}</button>
      </div>
    </div>`;
  }

  RR.views.blueprint = function () {
    const s = S();
    const an = s.analysis;
    const by = (k) => s.checklist.filter((i) => i.category === k);
    return `
    <section class="screen">
      <header class="screen-head">
        <div class="screen-title">
          <p class="eyebrow">Schritt 2 · Blueprint</p>
          <h1>Checkliste für ${esc(an.type.event || an.type.short)} ${an.targetYear}</h1>
          <p class="lead">Aus dem Archiv abgeleitet. Prüfe, wer was übernimmt – der Agent arbeitet nur ab, was du hier freigibst.</p>
        </div>
        <div class="split-bar" aria-label="Aufteilung">
          ${Object.entries(CAT).map(([k, c]) => `<span class="split lane-${k}" style="flex:${Math.max(by(k).length, 0.3)}">${icon(c.icon)}<strong>${by(k).length}</strong> ${c.short}</span>`).join("")}
        </div>
      </header>
      <div class="lanes">${Object.entries(CAT).map(([k, c]) => `
        <div class="lane lane-${k}">
          <div class="lane-head"><span class="lane-ic">${icon(c.icon)}</span><div><h2>${c.label}</h2><p>${c.desc}</p></div><span class="count">${by(k).length}</span></div>
          <div class="lane-body">${by(k).map(card).join("") || `<p class="empty-note">Keine Punkte</p>`}</div>
          <form class="lane-add" data-cat="${k}">
            <input type="text" id="add-${k}" placeholder="Punkt hinzufügen …" aria-label="Neuen Punkt für ${c.label} hinzufügen">
            <button class="icon-btn" type="submit" aria-label="Hinzufügen">+</button>
          </form>
        </div>`).join("")}
      </div>
      <div class="actions">
        <button class="btn btn-ghost" data-act="go" data-to="archive" type="button" ${s.articles.length ? "" : "disabled"}>Zurück</button>
        <button class="btn btn-primary btn-lg" data-act="to-research" type="button">${icon("play")} Agent starten</button>
      </div>
    </section>`;
  };

  RR.after.blueprint = function () {
    document.querySelectorAll(".lane-add").forEach((f) =>
      f.addEventListener("submit", (e) => {
        e.preventDefault();
        const inp = f.querySelector("input");
        const title = inp.value.trim();
        if (!title) return;
        const item = { id: "i" + Math.random().toString(36).slice(2, 8), title, category: f.dataset.cat, action: null, contact: null, contactOrg: "", channels: [], email: null, call: null, questions: [], hint: "", why: "", custom: true };
        A().ensureShape(item);
        S().checklist.push(item);
        A().save();
        A().render();
        const again = document.getElementById("add-" + f.dataset.cat);
        again && again.focus();
      })
    );
  };

  const find = (id) => S().checklist.find((i) => i.id === id);
  Object.assign(RR.act, {
    "bp-move": (el) => {
      const it = find(el.dataset.id);
      if (!it || it.category === el.dataset.to) return;
      it.category = el.dataset.to;
      A().ensureShape(it);
      delete S().results[it.id];
      A().save();
      A().render();
    },
    "bp-del": (el) => {
      const s = S();
      s.checklist = s.checklist.filter((i) => i.id !== el.dataset.id);
      delete s.results[el.dataset.id];
      A().save();
      A().render();
    },
    "to-research": () => {
      if (!S().checklist.length) return toast("Die Checkliste ist leer.", "warn");
      A().go("research");
      RR.runAgent();
    },
  });
  RR.onInput["bp-title"] = (el) => { const it = find(el.dataset.id); if (it) { it.title = el.value; A().save(); } };
})();
