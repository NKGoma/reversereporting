/*
 * Archiv-Analyse: viele Artikel zu einem wiederkehrenden Ereignis.
 * Beantwortet: Welche Geschichten erscheinen jedes Mal? Wann (relativ zum
 * Ereignistag)? Welche Aspekte enthalten sie immer?
 *
 *  1. Ereignis erkennen (Oktoberfest, Wahl, sonst eigenes Ereignis)
 *  2. Ereignistag pro Zyklus: Wiesn-Start berechnet, Wahltag aus dem Text, sonst Häufungspunkt
 *  3. Jeden Artikel einem Story-Typ zuordnen (Bibliothek in storytypes.js)
 *  4. Unbekanntes per Textähnlichkeit (TF-IDF) gruppieren → "entdeckte" Typen
 *  5. Pro Typ: Regelmäßigkeit, Zeitpunkt, Kernaspekte (über RR.analyze)
 */
(function () {
  const RR = (window.RR = window.RR || {});
  const DAY = 86400000;

  /* ---------- Datum ---------- */
  const toUTC = (iso) => Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10));
  const fromUTC = (t) => new Date(t).toISOString().slice(0, 10);
  const addDays = (iso, n) => fromUTC(toUTC(iso) + n * DAY);
  const diffDays = (a, b) => Math.round((toUTC(a) - toUTC(b)) / DAY);
  const deDate = (iso, withYear = true) => {
    const d = new Date(toUTC(iso));
    return d.toLocaleDateString("de-DE", { day: "numeric", month: "long", year: withYear ? "numeric" : undefined, timeZone: "UTC" });
  };
  const deShort = (iso) => new Date(toUTC(iso)).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", timeZone: "UTC" });

  // Wiesn: endet am ersten Oktobersonntag (mindestens am 3. Oktober), beginnt 15 Tage vor diesem Sonntag
  function wiesnDates(year) {
    let d = 1;
    while (new Date(Date.UTC(year, 9, d)).getUTCDay() !== 0) d++;
    const sunday = fromUTC(Date.UTC(year, 9, d));
    const start = addDays(sunday, -15);
    // amtliche Dauer (Stadt München) hat Vorrang, z. B. 2010 Jubiläumstag; sonst Regel (3.-Oktober-Verlängerung seit 2000)
    const city = RR.facts && RR.facts.all().find((x) => x.builtin);
    const dauer = city && RR.facts.value(city, "dauer", year);
    const end = dauer ? addDays(start, dauer - 1) : d < 3 && year >= 2000 ? fromUTC(Date.UTC(year, 9, 3)) : sunday;
    return { start, end, days: diffDays(end, start) + 1 };
  }

  /* ---------- Ereignis & Ereignistage ---------- */
  function detectEvent(articles) {
    const score = (re) => articles.filter((a) => re.test(a.text.slice(0, 1500))).length;
    const ranked = Object.values(RR.EVENTS).map((e) => ({ e, n: score(e.detect) })).sort((a, b) => b.n - a.n);
    return ranked[0] && ranked[0].n >= Math.max(2, articles.length * 0.3) ? ranked[0].e : null;
  }

  const MONTHS = { januar: 1, februar: 2, märz: 3, april: 4, mai: 5, juni: 6, juli: 7, august: 8, september: 9, oktober: 10, november: 11, dezember: 12 };
  // Wahltage aus dem Text ("Landtagswahl am 8. Oktober 2023")
  function electionDates(articles) {
    const counts = {};
    const re = /wahl\w*\s+(?:am|vom)\s+(?:sonntag,?\s+)?(\d{1,2})\.\s*(?:(\d{1,2})\.|([a-zäöü]+))\s*(\d{4})?/gi;
    for (const a of articles) {
      for (const m of a.text.matchAll(re)) {
        const mon = m[2] ? +m[2] : MONTHS[(m[3] || "").toLowerCase()];
        const y = m[4] ? +m[4] : a.year;
        if (!mon || !y) continue;
        const iso = fromUTC(Date.UTC(y, mon - 1, +m[1]));
        counts[iso] = (counts[iso] || 0) + 1;
      }
    }
    const out = [];
    Object.entries(counts).sort((a, b) => b[1] - a[1]).forEach(([iso]) => { if (!out.some((x) => Math.abs(diffDays(x, iso)) < 300)) out.push(iso); });
    return out.sort();
  }

  // Häufungspunkt pro Jahr (für unbekannte Ereignisse): Tag mit den meisten Artikeln im 7-Tage-Fenster
  function peakDates(articles) {
    const byYear = {};
    articles.filter((a) => a.date).forEach((a) => (byYear[a.year] = byYear[a.year] || []).push(a.date));
    return Object.values(byYear).map((ds) => ds.map((d) => ({ d, n: ds.filter((x) => Math.abs(diffDays(x, d)) <= 3).length })).sort((a, b) => b.n - a.n)[0].d).sort();
  }

  /* ---------- Zuordnung zu bekannten Story-Typen ---------- */
  function scoreType(type, a) {
    const title = a.title || a.text.split("\n")[0];
    const lead = a.text.slice(0, 450);
    let s = 0;
    for (const [re, w] of type.kw) {
      if (re.test(title)) s += w * 2;
      if (re.test(lead)) s += w;
      const g = new RegExp(re.source, "gi");
      s += Math.min(2, (a.text.match(g) || []).length) * w * 0.4;
    }
    return s;
  }
  function classify(a, types) {
    const ranked = types.map((t) => ({ t, s: scoreType(t, a) })).sort((x, y) => y.s - x.s);
    const [b, c] = ranked;
    if (!b || b.s < 5) return null;
    if (c && c.s > 0 && b.s < c.s * 1.25 && b.s < 9) return null; // zu knapp → lieber entdecken lassen
    return b.t;
  }

  /* ---------- Textähnlichkeit für unbekannte Typen ---------- */
  const STOP = new Set("aber alle allem allen aller alles also auch auf aus bei beim bereits bis bisher dabei damit dann darauf darum dass dazu dem den denen der deren des deshalb dies diese diesem diesen dieser dieses doch dort durch eine einem einen einer eines einige etwa euro für gegen gibt habe haben hatte hatten heute hier ihre ihren immer jahr jahre jahren jetzt kann keine kommt können laut mehr mehrere mit muss nach neue neuen nicht noch nun nur oder ohne rund schon sehr seit seine seiner sich sie sind soll sollen sowie über unter viele vom von vor war waren weil weiter wenn werden wieder wird wurde wurden zum zur zwei drei vier fünf sagt sagte gibt geht mehr ganz einem einer erste ersten letzte letzten münchen münchner oktoberfest wiesn bayern bayerischen stand uhr wahl".split(" "));
  function tokens(text) {
    return (text.toLowerCase().match(/[a-zäöüß][a-zäöüß-]{3,}/g) || []).filter((w) => !STOP.has(w));
  }
  function tfidf(docs) {
    const df = {};
    docs.forEach((d) => new Set(d.tok).forEach((w) => (df[w] = (df[w] || 0) + 1)));
    const N = docs.length;
    return docs.map((d) => {
      const tf = {};
      d.tok.forEach((w) => (tf[w] = (tf[w] || 0) + 1));
      d.titleTok.forEach((w) => (tf[w] = (tf[w] || 0) + 3));
      const v = {};
      let norm = 0;
      for (const [w, n] of Object.entries(tf)) {
        if (df[w] < 2) continue; // nur Wörter, die in mehreren Artikeln vorkommen
        const x = (1 + Math.log(n)) * Math.log(1 + N / df[w]);
        v[w] = x;
        norm += x * x;
      }
      norm = Math.sqrt(norm) || 1;
      for (const w in v) v[w] /= norm;
      return v;
    });
  }
  const cos = (a, b) => { let s = 0; const [x, y] = Object.keys(a).length < Object.keys(b).length ? [a, b] : [b, a]; for (const w in x) if (y[w]) s += x[w] * y[w]; return s; };
  function centroid(vs) {
    const c = {};
    vs.forEach((v) => { for (const w in v) c[w] = (c[w] || 0) + v[w] / vs.length; });
    let n = 0; for (const w in c) n += c[w] * c[w]; n = Math.sqrt(n) || 1;
    for (const w in c) c[w] /= n;
    return c;
  }
  // agglomerativ über Zentroide, bis keine zwei Gruppen ähnlich genug sind
  function cluster(vecs, threshold = 0.2) {
    let groups = vecs.map((v, i) => ({ idx: [i], c: v }));
    for (;;) {
      let best = null;
      for (let i = 0; i < groups.length; i++)
        for (let j = i + 1; j < groups.length; j++) {
          const s = cos(groups[i].c, groups[j].c);
          if (s > threshold && (!best || s > best.s)) best = { i, j, s };
        }
      if (!best) break;
      const idx = [...groups[best.i].idx, ...groups[best.j].idx];
      const merged = { idx, c: centroid(idx.map((k) => vecs[k])) };
      groups = groups.filter((_, k) => k !== best.i && k !== best.j).concat([merged]);
    }
    return groups;
  }

  /* ---------- Statistik ---------- */
  const quant = (arr, q) => { const s = arr.slice().sort((a, b) => a - b); const p = (s.length - 1) * q; const lo = Math.floor(p); return Math.round(s[lo] + (s[Math.ceil(p)] - s[lo]) * (p - lo)); };

  function aspectsFor(arts, bp) {
    if (arts.length < 2) return [];
    let an;
    try { an = RR.analyze(arts, { force: bp || "generic" }); } catch (e) { return []; }
    return an.patterns
      .filter((p) => p.hits && !p.official)
      .map((p) => ({ label: p.label.replace(/^(Kennzahl|Institution|Stimme): /, ""), share: p.hits / arts.length, hits: p.hits }))
      .filter((p) => p.share >= 0.5)
      .sort((a, b) => b.share - a.share)
      .slice(0, 7);
  }

  /* ---------- Hauptfunktion ---------- */
  function analyzeCorpus(articles, opts = {}) {
    const ev = opts.eventId === "custom" ? null : (opts.eventId && RR.EVENTS[opts.eventId]) || detectEvent(articles);
    const dated = articles.filter((a) => a.date);

    // Zyklen und Ereignistage
    let cycles;
    if (ev && ev.id === "oktoberfest") {
      const years = [...new Set(articles.map((a) => a.year).filter(Boolean))].sort();
      cycles = years.map((y) => { const w = wiesnDates(y); return { key: String(y), label: `Wiesn ${y}`, anchor: (opts.anchors || {})[y] || w.start, days: w.days, year: y }; });
    } else {
      const fixed = Object.values(opts.anchors || {}).filter(Boolean).sort();
      const anchors = fixed.length ? fixed : ev && ev.id === "wahl" ? electionDates(articles) : peakDates(articles);
      cycles = anchors.map((d) => ({ key: d, label: `${ev && ev.id === "wahl" ? "Wahl" : "Termin"} ${deDate(d)}`, anchor: d, year: +d.slice(0, 4) }));
    }
    const cycleOf = (a) => {
      if (ev && ev.id === "oktoberfest") return cycles.find((c) => c.year === a.year) || null;
      if (!a.date) return cycles.find((c) => c.year === a.year) || null;
      const best = cycles.map((c) => ({ c, d: Math.abs(diffDays(a.date, c.anchor)) })).sort((x, y) => x.d - y.d)[0];
      return best && best.d <= 240 ? best.c : null;
    };

    // Artikel einordnen
    const types = ev ? ev.types : [];
    const meta = articles.map((a) => {
      const c = cycleOf(a);
      // von Gemma zugeordnete Einzelstücke (nur bekannte Story-Typen)
      const forced = opts.assign && opts.assign[a.id] && types.find((x) => x.id === opts.assign[a.id]);
      const t = forced || classify(a, types);
      return { a, id: a.id, cycle: c ? c.key : null, rel: c && a.date ? diffDays(a.date, c.anchor) : null, typeId: t ? t.id : null };
    });

    // unbekannte Artikel gruppieren
    const rest = meta.filter((m) => !m.typeId).slice(0, 400);
    const vecs = tfidf(rest.map((m) => ({ tok: tokens(m.a.text), titleTok: tokens(m.a.title || "") })));
    const groups = cluster(vecs);
    const casing = {};
    rest.forEach((m) => (m.a.text.match(/[A-Za-zÄÖÜäöüß-]{4,}/g) || []).forEach((w) => { const k = w.toLowerCase(); if (!casing[k] || /^[A-ZÄÖÜ]/.test(w)) casing[k] = w; }));
    const discovered = [];
    const singles = [];
    groups.forEach((g) => {
      const ms = g.idx.map((i) => rest[i]);
      const cyc = new Set(ms.map((m) => m.cycle).filter(Boolean));
      if (ms.length >= 2 && cyc.size >= 2) {
        const top = Object.entries(g.c).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([w]) => casing[w] || w);
        const id = "d" + discovered.length;
        ms.forEach((m) => (m.typeId = id));
        discovered.push({ id, label: top.join(" · "), discovered: true, kw: [] });
      } else ms.forEach((m) => singles.push(m.id));
    });

    // Phase: Mehrheit der Artikel, gemessen an der Länge ihres eigenen Zyklus
    const cyc = Object.fromEntries(cycles.map((c) => [c.key, c]));
    const phaseOf = (ms) => {
      if (!ev) return "";
      const votes = {};
      ms.filter((m) => m.rel != null).forEach((m) => { const p = ev.phases(m.rel, (cyc[m.cycle] || {}).days); votes[p] = (votes[p] || 0) + 1; });
      return (Object.entries(votes).sort((a, b) => b[1] - a[1])[0] || [""])[0];
    };
    // typische Begriffe eines Typs (häufig im Typ, selten im Rest des Archivs)
    const dfAll = {};
    meta.forEach((m) => new Set(tokens(m.a.text)).forEach((w) => (dfAll[w] = (dfAll[w] || 0) + 1)));
    const typicalTerms = (arts) => {
      const df = {};
      arts.forEach((a) => new Set(tokens(a.text)).forEach((w) => (df[w] = (df[w] || 0) + 1)));
      return Object.entries(df)
        .filter(([, n]) => n >= Math.max(2, arts.length * 0.6))
        .map(([w, n]) => ({ w, s: (n / arts.length) * Math.log(meta.length / dfAll[w]) }))
        .filter((x) => x.s > 0.4)
        .sort((a, b) => b.s - a.s).slice(0, 6)
        .map((x) => casingAll[x.w] || x.w);
    };
    const casingAll = {};
    meta.forEach((m) => (m.a.text.match(/[A-Za-zÄÖÜäöüß-]{4,}/g) || []).forEach((w) => { const k = w.toLowerCase(); if (!casingAll[k] || /^[A-ZÄÖÜ]/.test(w)) casingAll[k] = w; }));

    // Statistik pro Typ
    const allTypes = [...types, ...discovered];
    const nCycles = cycles.length || 1;
    const stats = allTypes.map((t) => {
      const ms = meta.filter((m) => m.typeId === t.id);
      if (!ms.length) return null;
      const cyc = [...new Set(ms.map((m) => m.cycle).filter(Boolean))];
      const rels = ms.map((m) => m.rel).filter((r) => r != null);
      const coverage = cyc.length / nCycles;
      const median = rels.length ? quant(rels, 0.5) : null;
      const arts = ms.map((m) => m.a);
      return {
        id: t.id, label: t.label, bp: t.bp || null, discovered: !!t.discovered,
        n: ms.length, cycles: cyc.sort(), coverage,
        regularity: coverage >= 0.8 ? "regelmäßig" : coverage >= 0.5 ? "meistens" : "gelegentlich",
        median, q1: rels.length ? quant(rels, 0.25) : null, q3: rels.length ? quant(rels, 0.75) : null, min: rels.length ? Math.min(...rels) : null, max: rels.length ? Math.max(...rels) : null,
        phase: phaseOf(ms),
        terms: typicalTerms(arts),
        points: ms.filter((m) => m.rel != null).map((m) => ({ rel: m.rel, cycle: m.cycle, id: m.id })),
        aspects: aspectsFor(arts, t.bp),
        examples: arts.slice().sort((x, y) => (y.date || "").localeCompare(x.date || "")).slice(0, 4).map((a) => ({ id: a.id, title: a.title, date: a.date })),
        articleIds: ms.map((m) => m.id),
        words: quant(arts.map((a) => a.words || 0), 0.5),
      };
    }).filter(Boolean).sort((a, b) => (b.coverage - a.coverage) || ((a.median ?? 999) - (b.median ?? 999)));

    // Aspekte, die fast überall vorkommen, unterscheiden nichts – herausfiltern
    if (stats.length >= 4) {
      const freq = {};
      stats.forEach((t) => t.aspects.forEach((a) => (freq[a.label] = (freq[a.label] || 0) + 1)));
      stats.forEach((t) => (t.aspects = t.aspects.filter((a) => freq[a.label] <= Math.max(2, stats.length * 0.25))));
    }

    // Plan für den nächsten Zyklus
    let next = null;
    if (ev && ev.id === "oktoberfest" && cycles.length) {
      // nächste Wiesn, die noch nicht vorbei ist
      const today = new Date().toISOString().slice(0, 10);
      let y = Math.max(...cycles.map((c) => c.year)) + 1;
      while (wiesnDates(y).end < today) y++;
      next = { label: `Wiesn ${y}`, anchor: wiesnDates(y).start };
    } else if (opts.nextAnchor) next = { label: deDate(opts.nextAnchor), anchor: opts.nextAnchor };
    if (next) {
      next.entries = stats.filter((s) => s.median != null && s.coverage >= 0.5)
        .map((s) => ({ typeId: s.id, label: s.label, center: addDays(next.anchor, s.median), from: addDays(next.anchor, s.q1), to: addDays(next.anchor, s.q3), rel: s.median, regularity: s.regularity }))
        .sort((a, b) => a.rel - b.rel);
    }

    return {
      event: ev ? { id: ev.id, label: ev.label, anchorLabel: ev.anchorLabel } : { id: "custom", label: "Eigenes Ereignis", anchorLabel: "Ereignistag" },
      total: articles.length,
      undated: articles.length - dated.length,
      years: [...new Set(articles.map((a) => a.year).filter(Boolean))].sort(),
      cycles: cycles.map((c) => ({ key: c.key, label: c.label, anchor: c.anchor, n: meta.filter((m) => m.cycle === c.key).length })),
      types: stats,
      singles,
      unassigned: meta.filter((m) => !m.cycle).length,
      next,
      meta: meta.map(({ a, ...m }) => ({ ...m, title: a.title, date: a.date, year: a.year })),
    };
  }

  RR.corpus = { analyzeCorpus, wiesnDates, diffDays, addDays, deDate, deShort, detectEvent, electionDates };
})();
