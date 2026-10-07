/* Schritt 1 · Archiv: erkannter Story-Typ, Reader mit Belegstellen, Bausteine, Zeitreihe. */
(function () {
  const RR = window.RR;
  const { esc, icon, toast } = RR.ui;
  const A = () => RR.app;
  const S = () => RR.app.state;
  const PCOLORS = 8;

  function readerHtml(article, patterns, focus, include) {
    const text = article.text;
    const active = patterns
      .map((p, i) => ({ p, i }))
      .filter(({ p }) => (focus ? p.id === focus : include[p.id]));
    // Belegstellen dieses Artikels, nach Position gruppiert
    const spans = {};
    for (const { p, i } of active) {
      for (const e of p.evidence) {
        if (e.articleId !== article.id) continue;
        const k = e.start + ":" + e.end;
        (spans[k] = spans[k] || { start: e.start, end: e.end, pats: [] }).pats.push({ i, label: p.label });
      }
    }
    const list = Object.values(spans).sort((a, b) => a.start - b.start);
    let html = "", pos = 0, first = true;
    for (const sp of list) {
      if (sp.start < pos) continue; // überlappende Stellen überspringen
      html += esc(text.slice(pos, sp.start));
      const c = sp.pats[0].i % PCOLORS;
      html += `<mark class="ev" style="--c:var(--p${c});--cb:var(--p${c}-bg)" title="${esc(sp.pats.map((x) => x.label).join(" · "))}"${first ? ' id="first-mark"' : ""}>${esc(text.slice(sp.start, sp.end))}<span class="ev-tags">${sp.pats.map((x) => `<span class="ev-tag" style="--c:var(--p${x.i % PCOLORS})">${x.i + 1}</span>`).join("")}</span></mark>`;
      pos = sp.end;
      first = false;
    }
    html += esc(text.slice(pos));
    const lines = html.split("\n").filter((l) => l.trim());
    return lines.map((l, i) => (i === 0 ? `<h3 class="reader-title">${l}</h3>` : `<p>${l}</p>`)).join("");
  }

  function chartHtml(tl) {
    const pts = tl.points.filter((p) => isFinite(p.max));
    if (pts.length < 2) return "";
    const W = 640, H = 230, L = 52, R = 18, T = 26, B = 36;
    const y0 = Math.min(...pts.map((p) => p.min)), y1 = Math.max(...pts.map((p) => p.max));
    const pad = (y1 - y0) * 0.15 || y1 * 0.1 || 1;
    const lo = Math.max(0, y0 - pad), hi = y1 + pad;
    const x0 = pts[0].year, x1 = pts[pts.length - 1].year;
    const X = (y) => L + ((y - x0) / Math.max(1, x1 - x0)) * (W - L - R);
    const Y = (v) => T + (1 - (v - lo) / (hi - lo)) * (H - T - B);
    const fmt = (v) => (tl.unit === "€" ? RR.fmt.eur(v) : RR.fmt.withUnit(v, tl.unit));
    const raw = (hi - lo) / 3;
    const mag = 10 ** Math.floor(Math.log10(raw));
    const stepv = [1, 2, 2.5, 5, 10].map((k) => k * mag).find((k) => k >= raw);
    const ticks = [];
    for (let v = Math.ceil(lo / stepv) * stepv; v <= hi; v += stepv) ticks.push(v);
    const line = pts.map((p, i) => `${i ? "L" : "M"}${X(p.year).toFixed(1)},${Y(p.max).toFixed(1)}`).join(" ");
    return `<figure class="card chart">
      <figcaption><h2>${esc(tl.label)} im Archiv</h2><p class="muted small">Werte, die in den Artikeln einem Jahr zugeordnet wurden (Spanne = günstigster bis höchster Wert).</p></figcaption>
      <div class="chart-wrap"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(tl.label)} nach Jahren">
        ${ticks.map((t) => `<line class="grid" x1="${L}" x2="${W - R}" y1="${Y(t)}" y2="${Y(t)}"/><text class="tick" x="${L - 8}" y="${Y(t) + 4}" text-anchor="end">${esc(fmt(t))}</text>`).join("")}
        <path class="trend" d="${line}"/>
        ${pts.map((p, i) => `
          ${p.min !== p.max ? `<line class="range" x1="${X(p.year)}" x2="${X(p.year)}" y1="${Y(p.min)}" y2="${Y(p.max)}"/>` : ""}
          <circle class="dot ${i === pts.length - 1 ? "is-last" : ""}" cx="${X(p.year)}" cy="${Y(p.max)}" r="${i === pts.length - 1 ? 5.5 : 4}"/>
          <text class="val" x="${X(p.year)}" y="${Y(p.max) - 11}" text-anchor="middle">${esc(fmt(p.max))}</text>
          <text class="tick" x="${X(p.year)}" y="${H - 12}" text-anchor="middle">${p.year}</text>`).join("")}
      </svg></div>
    </figure>`;
  }

  RR.views.archive = function () {
    const s = S();
    const an = s.analysis;
    const t = an.type;
    const arts = s.articles;
    const ai = an.engine === "ai";
    const art = arts[Math.min(s.ui.article || 0, arts.length - 1)];
    const focus = s.ui.focus;
    const recurring = an.patterns.filter((p) => p.recurring).length;
    const fp = focus && an.patterns.find((p) => p.id === focus);
    const opts = [...RR.BLUEPRINTS.map((b) => [b.id, b.label]), ["generic", "Allgemein (aus Mustern bauen)"]];

    return `
    <section class="screen">
      <header class="screen-head">
        <div class="screen-title">
          <p class="eyebrow">Schritt 1 · Archiv</p>
          <h1>Was jede Ausgabe enthält</h1>
          <p class="lead">${recurring} von ${an.patterns.length} Bausteinen kommen in mindestens ${an.threshold} der ${arts.length} Artikel vor. Markiert im Text: die Belegstellen.</p>
        </div>
        <div class="type-card">
          <div class="type-top">
            <span class="badge ${ai ? "badge-ai" : "badge-off"}">${icon(ai ? "spark" : "bot")}${ai ? "Claude" : "Offline-Engine"}</span>
            <span class="muted small">Zieljahr <strong>${an.targetYear}</strong></span>
          </div>
          <p class="eyebrow">Story-Typ</p>
          <h2 class="type-name">${esc(t.label)}</h2>
          ${t.event && !t.label.includes(t.event) ? `<p class="type-event">${esc(t.event)}</p>` : ""}
          <p class="muted small">${esc(t.description || "")}</p>
          ${ai ? "" : `<label class="type-switch"><span class="small muted">Falsch erkannt?</span>
            <select data-act="force-type" aria-label="Story-Typ ändern">${opts.map(([id, l]) => `<option value="${id}" ${id === t.id ? "selected" : ""}>${esc(l)}</option>`).join("")}</select></label>`}
        </div>
      </header>

      <div class="archive-grid">
        <article class="card reader">
          <div class="tabs" role="tablist">${arts.map((a, i) => `<button type="button" role="tab" aria-selected="${a === art}" class="tab ${a === art ? "is-on" : ""}" data-act="tab" data-i="${i}">A${i + 1}<small>${a.year || "?"}</small></button>`).join("")}</div>
          ${art.sample ? `<p class="sample-note">${icon("doc")} Fiktiver Beispieltext</p>` : ""}
          <div class="reader-text">${readerHtml(art, an.patterns, focus, s.include)}</div>
        </article>

        <aside class="card patterns">
          <div class="section-head"><h2>Bausteine</h2>${focus ? `<button class="btn btn-ghost btn-sm" data-act="focus" data-id="" type="button">Alle zeigen</button>` : ""}</div>
          <ol class="pat-list">${an.patterns.map((p, i) => `
            <li class="pat ${p.recurring ? "is-rec" : ""} ${focus === p.id ? "is-focus" : ""}">
              <button type="button" class="pat-main" data-act="focus" data-id="${esc(p.id)}" aria-pressed="${focus === p.id}">
                <span class="pat-no" style="--c:var(--p${i % PCOLORS})">${i + 1}</span>
                <span class="pat-label">${esc(p.label)}</span>
                <span class="pat-hits" aria-label="${p.hits} von ${arts.length} Artikeln">${arts.map((a) => `<i class="${p.evidence.some((e) => e.articleId === a.id) ? "on" : ""}"></i>`).join("")}</span>
              </button>
              <label class="pat-inc"><input type="checkbox" data-act="include" data-id="${esc(p.id)}" ${s.include[p.id] ? "checked" : ""}><span>Checkliste</span></label>
            </li>`).join("")}</ol>
          ${fp ? `<div class="evidence"><p class="eyebrow">Belegstellen · ${esc(fp.label)}</p>
            ${fp.evidence.length ? `<ul>${fp.evidence.slice(0, 6).map((e) => {
              const ai2 = arts.findIndex((a) => a.id === e.articleId);
              return `<li><button type="button" class="ev-quote" data-act="tab" data-i="${ai2}"><span class="pill">A${ai2 + 1}</span> „${esc(e.text.length > 160 ? e.text.slice(0, 157) + "…" : e.text)}“</button></li>`;
            }).join("")}</ul>` : `<p class="muted small">Keine Belegstelle gefunden.</p>`}</div>` : `<p class="muted small hint-line">Tipp: Baustein anklicken, um nur seine Belegstellen zu sehen.</p>`}
        </aside>
      </div>

      ${chartHtml(an.timeline)}

      <div class="actions">
        <button class="btn btn-ghost" data-act="home" type="button">Zurück</button>
        <button class="btn btn-primary btn-lg" data-act="to-blueprint" type="button">Blueprint erstellen ${icon("arrow")}</button>
      </div>
    </section>`;
  };

  RR.after.archive = function () {
    if (S().ui.scrollMark) {
      const m = document.getElementById("first-mark");
      if (m) m.scrollIntoView({ block: "center", behavior: "smooth" });
      S().ui.scrollMark = false;
    }
  };

  Object.assign(RR.act, {
    tab: (el) => { S().ui.article = Number(el.dataset.i); S().ui.scrollMark = el.classList.contains("ev-quote"); A().save(); A().render(); },
    focus: (el) => {
      const s = S();
      s.ui.focus = el.dataset.id && s.ui.focus !== el.dataset.id ? el.dataset.id : null;
      // zum ersten Artikel mit Beleg springen
      if (s.ui.focus) {
        const p = s.analysis.patterns.find((x) => x.id === s.ui.focus);
        const cur = s.articles[s.ui.article];
        if (p.evidence.length && !p.evidence.some((e) => cur && e.articleId === cur.id)) s.ui.article = s.articles.findIndex((a) => a.id === p.evidence[0].articleId);
        s.ui.scrollMark = true;
      }
      A().save();
      A().render();
    },
    "to-blueprint": () => {
      const s = S();
      if (!Object.values(s.include).some(Boolean)) return toast("Bitte mindestens einen Baustein für die Checkliste auswählen.", "warn");
      A().buildChecklist();
      A().go("blueprint");
    },
  });

  RR.onChange.include = (el) => { S().include[el.dataset.id] = el.checked; A().save(); };
  RR.onChange["force-type"] = (el) => RR.app.runAnalysis(el.value);
})();
