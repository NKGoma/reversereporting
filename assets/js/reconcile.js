/*
 * Abgleich: prüft die Rechercheergebnisse gegen das Archiv und untereinander.
 * Liefert eine Liste von Hinweisen: ok · warn (Abweichung) · gap (Lücke).
 */
(function () {
  const RR = (window.RR = window.RR || {});
  const F = () => RR.fmt;

  // typische jährliche Veränderung laut Archiv (Betrag, in %)
  function archiveTrend(an) {
    const pts = an.timeline.points.filter((p) => isFinite(p.max));
    if (pts.length < 2) return null;
    const ch = pts.slice(1).map((p, i) => Math.abs(F().pct(pts[i].max, p.max) / Math.max(1, p.year - pts[i].year)));
    return ch.reduce((s, x) => s + x, 0) / ch.length;
  }

  function firstNumberCompare(text, evidence) {
    const got = RR.text.numbers(text).filter((n) => n.value >= 10);
    if (!got.length) return null;
    for (const e of evidence) {
      for (const a of RR.text.numbers(e.text)) {
        const b = got.find((g) => (a.noun && g.noun && a.noun.slice(0, 5) === g.noun.slice(0, 5)) || (a.unit && a.unit === g.unit && a.money === g.money));
        if (b) return { archive: a, reply: b, year: e.year, diff: F().pct(a.value, b.value) };
      }
    }
    return null;
  }

  function reconcile(state) {
    const an = state.analysis;
    const out = [];
    const trend = archiveTrend(an);
    const res = (id) => state.results[id] || {};

    for (const item of state.checklist) {
      const r = res(item.id);
      const R = r.result;
      const pat = an.patterns.find((p) => p.id === item.patternId);

      if (item.category === "agent") {
        if (r.status === "handoff" && !r.done) out.push({ level: "gap", item: item.id, title: item.title, text: "Agent hat nichts gefunden – liegt bei dir." });
        if (!R) continue;
        if (R.kind === "tents") {
          const limit = Math.max(4, (trend || 3) * 1.6);
          const odd = R.rows.filter((row) => row.delta != null && row.delta > limit);
          odd.forEach((row) => out.push({ level: "warn", item: item.id, title: `Auffälliger Anstieg: ${row.tent}`, text: `${F().fmtPct(row.delta)} gegenüber dem Vorjahr – im Archiv sind ~${(trend || 3).toFixed(1).replace(".", ",")} % pro Jahr üblich. Bitte beim Zelt nachfragen.` }));
          const open = R.rows.filter((row) => !row.verified).length;
          if (open) out.push({ level: "warn", item: item.id, title: `${open} von ${R.rows.length} Zeltpreisen noch nicht gegengeprüft`, text: "Quelle öffnen und Haken bei „geprüft“ setzen." });
          else out.push({ level: "ok", item: item.id, title: "Alle Zeltpreise gegengeprüft", text: "Jede Zeile hat eine Quelle und ist abgehakt." });
          const range = state.checklist.find((i) => i.action === "price_range" && res(i.id).result);
          if (range) {
            const m = res(range.id).result.metrics;
            const cs = R.rows.map((x) => x.curr);
            const ok = Math.abs(m.min - Math.min(...cs)) < 0.01 && Math.abs(m.max - Math.max(...cs)) < 0.01;
            out.push(ok
              ? { level: "ok", item: range.id, title: "Preisspanne passt zu den Einzelpreisen", text: `${F().eur(m.min)} – ${F().eur(m.max)}` }
              : { level: "warn", item: range.id, title: "Preisspanne widerspricht den Einzelpreisen", text: "Spanne neu berechnen lassen." });
          }
        }
        if (R.metrics && R.metrics.deltaPct != null && item.action === "metric_lookup") {
          const d = Math.abs(R.metrics.deltaPct);
          const t = trend || 5;
          if (d > Math.max(8, t * 2)) out.push({ level: "warn", item: item.id, title: `Abweichung vom Archivtrend: ${item.title}`, text: `${F().fmtPct(R.metrics.deltaPct)} – deutlich mehr als im Archiv üblich. Wert prüfen.` });
          else out.push({ level: "ok", item: item.id, title: `Plausibel: ${item.title}`, text: `${F().fmtPct(R.metrics.deltaPct)} liegt im Rahmen des Archivtrends.` });
        }
        if (R.carried && !r.confirmed) out.push({ level: "warn", item: item.id, title: `Aus dem Vorjahr übernommen: ${item.title}`, text: "Der Agent hat keinen aktuellen Wert, nur die Angabe aus dem Archiv. Für dieses Jahr bestätigen." });
      }

      if (item.category === "approve") {
        const answer = [r.reply, r.transcript].filter(Boolean).join("\n");
        if (!answer) { out.push({ level: "gap", item: item.id, title: item.title, text: "Wartet auf deine Freigabe bzw. auf eine Antwort." }); continue; }
        const cmp = pat ? firstNumberCompare(answer, pat.evidence) : null;
        if (cmp) {
          const same = Math.abs(cmp.diff) < 15;
          out.push({ level: same ? "ok" : "warn", item: item.id,
            title: same ? `Antwort deckt sich mit Archiv: ${item.title}` : `Antwort weicht vom Archiv ab: ${item.title}`,
            text: `Archiv ${cmp.year || ""}: ${cmp.archive.raw} · Antwort: ${cmp.reply.raw}${same ? "" : " – nachfragen"}` });
        } else {
          out.push({ level: "ok", item: item.id, title: `Antwort liegt vor: ${item.title}`, text: "Inhalt bitte lesen und übernehmen." });
        }
      }

      if (item.category === "human" && !r.done) out.push({ level: "gap", item: item.id, title: item.title, text: "Deine Aufgabe – noch offen." });
    }
    const order = { warn: 0, gap: 1, ok: 2 };
    return out.sort((a, b) => order[a.level] - order[b.level]);
  }

  /* ---------- Faktencheck: Archivartikel gegen amtliche Daten ---------- */
  const WORDS = { zwei: 2, drei: 3, vier: 4, fünf: 5, sechs: 6, sieben: 7, acht: 8, neun: 9, zehn: 10 };
  const BEER = /maß|bier|liter/i;
  const NOT_BEER = /wasser|spezi|limo|hendl|alkoholfrei|fahrticket|eintritt/i;

  function factCheck(state) {
    const an = state.analysis;
    if (!an || !RR.facts) return [];
    const city = (an.datasets || []).map((id) => RR.facts.get(id)).find((d) => d && d.builtin);
    if (!city || !state.articles.length) return [];
    const out = [];
    const tol = (a, b, p) => Math.abs(a - b) / b <= p;
    for (const a of state.articles) {
      for (const s of RR.text.sentences(a.text)) {
        const t = s.text;
        const forecast = /erwart|rechnet mit|prognos|soll(en)?\b/i.test(t);
        // Besucherzahlen in Millionen (auch "sechs Millionen")
        const vis = [];
        for (const n of RR.text.numbers(t)) if (n.unit === "Mio." && /besucher|gäste/i.test(n.noun + " " + t)) vis.push({ value: n.value, raw: n.raw, index: n.index });
        for (const m of t.matchAll(/\b(zwei|drei|vier|fünf|sechs|sieben|acht|neun|zehn) millionen/gi)) if (/besucher|gäste/i.test(t)) vis.push({ value: WORDS[m[1].toLowerCase()], raw: m[0], index: m.index, words: true });
        for (const v of vis) {
          const y = RR.text.yearAt(t, v.index, a.year);
          const off = RR.facts.value(city, "besucher_gesamt", y);
          if (off == null) continue;
          const pre = t.slice(Math.max(0, v.index - 18), v.index).toLowerCase();
          const atLeast = /mehr als|über|gut/.test(pre), atMost = /weniger als|knapp|unter/.test(pre);
          const ok = atLeast ? off >= v.value : atMost ? off <= v.value * 1.02 : tol(v.value, off, 0.06);
          out.push({ level: ok ? "ok" : "warn", year: y, topic: "Besucher", article: a.title, claim: `${atLeast ? "mehr als " : atMost ? "knapp " : ""}${v.raw}${forecast ? " (Prognose)" : ""}`,
            official: RR.facts.fmt(city, "besucher_gesamt", off), note: ok ? (forecast ? "Prognose hat sich bestätigt" : "deckt sich") : (forecast ? "Prognose lag daneben" : "weicht ab"), source: RR.facts.source(city, y) });
        }
        // Maßpreise: genannter Preis gegen amtlichen Durchschnitt
        if (BEER.test(t) && !NOT_BEER.test(t)) {
          for (const n of RR.text.numbers(t)) {
            if (!n.money || n.value < 3 || n.value > 30) continue;
            const y = RR.text.yearAt(t, n.index, a.year);
            const off = RR.facts.value(city, "bier_preis", y);
            if (off == null) continue;
            const pre = t.slice(Math.max(0, n.index - 30), n.index).toLowerCase();
            const isMax = /bis zu|höchst|teuerst/.test(pre) || /\bund\s*$/.test(pre); // "zwischen 14,50 und 15,80"
            const isMin = /ab |günstigst|zwischen/.test(pre);
            const isAvg = /schnitt|durchschnitt/.test(pre + t.toLowerCase());
            let ok, note;
            if (isAvg) { ok = tol(n.value, off, 0.03); note = ok ? "Durchschnitt deckt sich" : "Durchschnitt weicht ab"; }
            else if (isMax) { ok = off <= n.value; note = ok ? "plausibel: Ø liegt unter dem Höchstpreis" : "unplausibel: Ø liegt über dem genannten Höchstpreis"; }
            else if (isMin) { ok = off >= n.value; note = ok ? "plausibel: Ø liegt über dem Mindestpreis" : "unplausibel: Ø liegt unter dem Mindestpreis"; }
            else { ok = tol(n.value, off, 0.08); note = ok ? "plausibel: nahe am Ø (Einzelpreis)" : "weicht stark vom Ø ab – prüfen"; }
            out.push({ level: ok ? "ok" : "warn", year: y, topic: "Maßpreis", article: a.title, claim: `${isMax ? "bis zu " : ""}${n.raw}`, official: `Ø ${RR.facts.fmt(city, "bier_preis", off)}`, note, source: RR.facts.source(city, y) });
          }
        }
        // Dauer in Tagen
        const d = t.match(/(\d{2}) tage/i);
        if (d && /wiesn|oktoberfest|fest/i.test(t)) {
          const off = RR.facts.value(city, "dauer", a.year);
          if (off != null) out.push({ level: Number(d[1]) === off ? "ok" : "warn", year: a.year, topic: "Dauer", article: a.title, claim: d[0], official: `${off} Tage`, note: Number(d[1]) === off ? "deckt sich" : "weicht ab", source: RR.facts.source(city, a.year) });
        }
      }
    }
    // doppelte Aussagen zusammenfassen
    const seen = new Set();
    return out.filter((f) => { const k = f.year + f.topic + f.claim; if (seen.has(k)) return false; seen.add(k); return true; })
      .sort((x, y) => (x.level === y.level ? x.year - y.year : x.level === "warn" ? -1 : 1));
  }

  RR.reconcile = reconcile;
  RR.factCheck = factCheck;
})();
