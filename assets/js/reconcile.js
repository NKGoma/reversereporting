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
        if (R.carried) out.push({ level: "warn", item: item.id, title: `Aus dem Vorjahr übernommen: ${item.title}`, text: "Der Agent hat keinen aktuellen Wert, nur die Angabe aus dem Archiv. Für dieses Jahr bestätigen." });
        if (R.ai && R.confidence === "low") out.push({ level: "warn", item: item.id, title: `Unsichere Quelle: ${item.title}`, text: "Claude hat den Wert nur mit geringer Sicherheit gefunden." });
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

  RR.reconcile = reconcile;
})();
