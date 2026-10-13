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

  // Diagramm: Archivwerte (Punkte, Spanne) und – falls verknüpft – die amtliche Reihe (Linie)
  function chartHtml(tl, off) {
    const pts = tl.points.filter((p) => isFinite(p.max));
    if (pts.length < 2 && !off) return "";
    const offAll = off ? off.series : [];
    const yearsA = pts.map((p) => p.year);
    const lastOff = offAll.length ? offAll[offAll.length - 1].year : 0;
    const x0 = Math.min(...yearsA, lastOff ? lastOff - 15 : Infinity);
    const x1 = Math.max(...yearsA, lastOff || -Infinity);
    const offPts = offAll.filter((p) => p.year >= x0 && p.year <= x1);
    const vals = [...pts.flatMap((p) => [p.min, p.max]), ...offPts.map((p) => p.value)];
    const W = 680, H = 250, L = 56, R = 22, T = 26, B = 40;
    const y0 = Math.min(...vals), y1 = Math.max(...vals);
    const pad = (y1 - y0) * 0.12 || y1 * 0.1 || 1;
    const lo = Math.max(0, y0 - pad), hi = y1 + pad;
    const X = (y) => L + ((y - x0) / Math.max(1, x1 - x0)) * (W - L - R);
    const Y = (v) => T + (1 - (v - lo) / (hi - lo)) * (H - T - B);
    const unit = off ? off.unit : tl.unit;
    const fmt = (v) => (unit === "€" ? RR.fmt.eur(v) : RR.fmt.withUnit(v, unit));
    const raw = (hi - lo) / 3;
    const mag = 10 ** Math.floor(Math.log10(raw));
    const stepv = [1, 2, 2.5, 5, 10].map((k) => k * mag).find((k) => k >= raw);
    const ticks = [];
    for (let v = Math.ceil(lo / stepv) * stepv; v <= hi; v += stepv) ticks.push(v);
    // Jahresbeschriftung: Archivjahre plus jedes fünfte Jahr, ohne Überlappung
    const yl = [...new Set([...yearsA, ...offPts.map((p) => p.year).filter((y) => y % 5 === 0), x1])].sort((a, b) => a - b);
    const xl = [];
    yl.forEach((y) => { if (!xl.length || X(y) - X(xl[xl.length - 1]) > 30) xl.push(y); });
    const path = (arr, k) => arr.map((p, i) => `${i ? "L" : "M"}${X(p.year).toFixed(1)},${Y(p[k]).toFixed(1)}`).join(" ");
    const offLast = offPts[offPts.length - 1];
    return `<figure class="card chart">
      <figcaption><h2>${esc(off ? off.label : tl.label + " im Archiv")}</h2>
        <p class="muted small">${off ? `Linie: amtlicher Durchschnitt (${esc(off.source)}). ` : ""}${gaps(offPts)}${pts.length ? "Punkte: Werte aus den Artikeln (Spanne = günstigster bis höchster Wert)." : ""}</p></figcaption>
      <div class="chart-wrap"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(off ? off.label : tl.label)} nach Jahren">
        ${ticks.map((t) => `<line class="grid" x1="${L}" x2="${W - R}" y1="${Y(t)}" y2="${Y(t)}"/><text class="tick" x="${L - 8}" y="${Y(t) + 4}" text-anchor="end">${esc(fmt(t))}</text>`).join("")}
        ${offPts.length > 1 ? `<path class="official" d="${path(offPts, "value")}"/>${offPts.map((p) => `<circle class="odot" cx="${X(p.year)}" cy="${Y(p.value)}" r="2.6"><title>${p.year}: Ø ${esc(fmt(p.value))}</title></circle>`).join("")}
          <text class="oval" x="${X(offLast.year) + 6}" y="${Y(offLast.value) + 16}" text-anchor="end">Ø ${esc(fmt(offLast.value))}</text>` : ""}
        ${pts.length > 1 ? `<path class="trend" d="${path(pts, "max")}"/>` : ""}
        ${pts.map((p, i) => `
          ${p.min !== p.max ? `<line class="range" x1="${X(p.year)}" x2="${X(p.year)}" y1="${Y(p.min)}" y2="${Y(p.max)}"/>` : ""}
          <circle class="dot ${i === pts.length - 1 ? "is-last" : ""}" cx="${X(p.year)}" cy="${Y(p.max)}" r="${i === pts.length - 1 ? 5.5 : 4}"/>
          <text class="val" x="${X(p.year)}" y="${Y(p.max) - 11}" text-anchor="middle">${esc(fmt(p.max))}</text>`).join("")}
        ${xl.map((y) => `<text class="tick" x="${X(y)}" y="${H - 14}" text-anchor="middle">${y}</text>`).join("")}
      </svg></div>
      ${off ? `<div class="legend"><span class="lg-off"></span>Ø laut ${esc(off.publisher)}${pts.length ? `<span class="lg-arch"></span>Höchstwerte aus den Artikeln` : ""}</div>` : ""}
    </figure>`;
  }

  // Jahre ohne Daten benennen (z. B. 2020/21: Oktoberfest ausgefallen)
  function gaps(pts) {
    const g = [];
    pts.forEach((p, i) => { if (i && p.year - pts[i - 1].year > 1) g.push(pts[i - 1].year + 1 === p.year - 1 ? `${p.year - 1}` : `${pts[i - 1].year + 1}–${p.year - 1}`); });
    return g.length ? `Keine Daten für ${g.join(", ")} (kein Fest). ` : "";
  }

  // Band mit den verknüpften Datentabellen
  function factsBand(an) {
    const list = (an.datasets || []).map((id) => RR.facts && RR.facts.get(id)).filter(Boolean);
    if (!list.length) return "";
    return `<section class="facts-band">
      <span class="fb-ic">${icon("archive")}</span>
      <div><p class="eyebrow">Faktenbasis verknüpft</p>
        ${list.map((d) => `<p class="fb-line"><strong>${esc(d.publisher)}</strong> · ${esc(d.title)} · ${d.rows.length} Jahrgänge${d.license ? ` · Lizenz ${esc(d.license)}` : ""} · ${esc(d.asOf)}${d.url ? ` · <a href="${esc(d.url)}" target="_blank" rel="noopener">Quelle${icon("link", "ic-xs")}</a>` : ""}</p>`).join("")}
        <p class="muted small">Der Agent nutzt diese Zahlen als echte Quelle und prüft damit die Angaben in deinen Artikeln.</p></div>
    </section>`;
  }

  function officialSeries(an) {
    const city = (an.datasets || []).map((id) => RR.facts && RR.facts.get(id)).find((d) => d && d.builtin);
    if (!city) return null;
    const isPrice = an.type.id === "volksfest-bierpreis" || an.timeline.label === "Maßpreis" || an.timeline.points.length < 2;
    if (!isPrice) return null;
    return { label: "Maßpreis: Archiv und amtliche Daten", unit: "€", series: RR.facts.series(city, "bier_preis"), source: RR.facts.source(city).label, publisher: city.short };
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
          ${s.fromCorpus ? `<button type="button" class="back-link" data-act="go" data-to="corpus">← Themenarchiv · ${esc(s.fromCorpus.label)}</button>` : ""}
          <p class="eyebrow">Schritt 1 · Archiv</p>
          <h1>Was jede Ausgabe enthält</h1>
          <p class="lead">${recurring} von ${an.patterns.length} Bausteinen kommen in mindestens ${an.threshold} der ${arts.length} Artikel vor. Markiert im Text: die Belegstellen.</p>
        </div>
        <div class="type-card">
          <div class="type-top">
            <span class="badge ${ai ? "badge-ai" : "badge-off"}">${icon(ai ? "spark" : "bot")}${ai ? "Gemma (lokal)" : "Regel-Engine"}</span>
            <span class="muted small">Zieljahr <strong>${an.targetYear}</strong></span>
          </div>
          <p class="eyebrow">Story-Typ</p>
          <h2 class="type-name">${esc(t.label)}</h2>
          ${t.event && !t.label.includes(t.event) ? `<p class="type-event">${esc(t.event)}</p>` : ""}
          <p class="muted small">${esc(t.description || "")}</p>
          ${ai && an.llm ? `<p class="small llm-meta">${icon("spark", "ic-xs")} ${esc(an.llm.model)}${an.llm.seconds ? ` · ${String(an.llm.seconds).replace(".", ",")} s` : " · aus dem Cache"}${an.llm.dropped ? ` · ${an.llm.dropped} nicht belegbare${an.llm.dropped === 1 ? "s Zitat" : " Zitate"} verworfen` : " · alle Zitate im Text gefunden"}${an.llm.truncated ? ` · ${an.llm.truncated} lange${an.llm.truncated === 1 ? "r Artikel" : " Artikel"} gekürzt` : ""}</p>` : ""}
          ${!ai && an.alternatives && an.alternatives[1] && an.alternatives[1].raw >= an.alternatives[0].raw * 0.5 && an.alternatives[1].id !== t.id
            ? `<p class="small type-alt">Auch möglich: <button type="button" class="link-btn" data-act="force-alt" data-id="${an.alternatives[1].id}">${esc(an.alternatives[1].label)}</button></p>` : ""}
          ${`<label class="type-switch"><span class="small muted">${ai ? "Lieber Regel-Engine?" : "Falsch erkannt?"}</span>
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
          <ol class="pat-list">${an.patterns.map((p, i) => `${p.discovered && !(an.patterns[i - 1] || {}).discovered ? `<li class="pat-group">Weitere wiederkehrende Elemente aus deinen Artikeln</li>` : ""}
            <li class="pat ${p.recurring || p.suggested ? "is-rec" : ""} ${focus === p.id ? "is-focus" : ""}">
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

      ${factsBand(an)}
      ${chartHtml(an.timeline, officialSeries(an))}

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

  RR.act["force-alt"] = (el) => RR.app.runAnalysis(el.dataset.id);
  RR.onChange.include = (el) => { S().include[el.dataset.id] = el.checked; A().save(); };
  RR.onChange["force-type"] = (el) => RR.app.runAnalysis(el.value);
})();
