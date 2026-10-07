/*
 * Simulierter Agent (Offline-Modus). Nichts verlässt den Browser.
 * Jede Aktion liefert Log-Zeilen für die Animation und entweder ein Ergebnis
 * oder eine Übergabe an die Journalistin / den Journalisten ("handoff").
 * Archivwerte stammen echt aus den Artikeln; aktuelle Werte sind simuliert (demo: true).
 */
(function () {
  const RR = (window.RR = window.RR || {});

  /* ---------- Formatierung ---------- */
  const de = (v, d = 2) => (v == null || isNaN(v) ? "–" : v.toLocaleString("de-DE", { minimumFractionDigits: 0, maximumFractionDigits: d }));
  const eur = (v) => (v == null || isNaN(v) ? "–" : v.toFixed(2).replace(".", ",") + " €");
  const pct = (a, b) => (a && b ? ((b - a) / a) * 100 : null);
  const fmtPct = (p) => (p == null || isNaN(p) ? "–" : (p >= 0 ? "+" : "−") + Math.abs(p).toFixed(1).replace(".", ",") + " %");
  const withUnit = (v, unit) => {
    if (!unit) return de(v);
    if (unit === "€") return eur(v);
    if (unit.startsWith("%")) return de(v, 1) + " %";
    return de(v) + " " + unit;
  };
  RR.fmt = { de, eur, pct, fmtPct, withUnit };

  // deterministische Pseudo-Zufallszahl 0..1 (damit die Demo stabil bleibt)
  function hash(s) {
    let h = 2166136261;
    for (const c of String(s)) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
    return ((h >>> 0) % 1000) / 1000;
  }

  /* ---------- Kontakte ---------- */
  function contactFor(item, analysis) {
    const bp = analysis && RR.getBlueprint(analysis.type.id);
    const c = bp && bp.contacts && bp.contacts[item.contact];
    if (c) return c;
    if (item.contactOrg) return { org: item.contactOrg, email: "presse@beispiel.invalid", phone: "+49 000 000000" };
    return RR.GENERIC_CONTACT;
  }
  const reply = (item) => RR.SIM_TEXT.reply[item.contact] || RR.SIM_TEXT.reply.generic;
  const transcript = (item) => RR.SIM_TEXT.transcript[item.contact] || RR.SIM_TEXT.transcript.generic;

  const patternOf = (item, analysis) => analysis.patterns.find((p) => p.id === item.patternId) || { values: [], unit: "" };

  /* ---------- Zeltpreise ---------- */
  function tentRows(analysis) {
    const T = analysis.targetYear;
    if (analysis.wiesn) {
      return RR.DEMO.tents.map((t) => {
        const art = (analysis.tentPrices || []).filter((p) => p.tent === t.name && p.year === T - 1).pop();
        const prev = art ? art.value : t.prev;
        return { tent: t.name, curr: t.curr, prev, prevFrom: art ? `Artikel ${art.year}` : "Demo-Wert", delta: pct(prev, t.curr),
          source: t.url ? { label: t.url.replace(/^https?:\/\/(www\.)?/, ""), url: t.url } : RR.DEMO.citySource, verified: false };
      });
    }
    // anderes Volksfest: Zelte aus den Artikeln, jüngster Archivpreis als Basis
    const latest = {};
    (analysis.tentPrices || []).forEach((p) => { if (!latest[p.tent] || p.year >= latest[p.tent].year) latest[p.tent] = p; });
    return Object.values(latest).map((p) => {
      const curr = Math.round(p.value * (1.02 + 0.03 * hash(p.tent)) * 10) / 10;
      return { tent: p.tent, curr, prev: p.value, prevFrom: `Artikel ${p.year || "?"}`, delta: pct(p.value, curr), source: { label: "Website des Festwirts" }, verified: false };
    });
  }

  const handoff = (log, text) => ({ log: [...log, "→ Übergabe an Journalist:in"], handoff: text });

  const ACTIONS = {
    tent_prices(item, an) {
      const rows = tentRows(an);
      if (!rows.length) return handoff(["Suche Zeltnamen im Archiv …", "Keine Zelte mit Preisen gefunden."], "Im Archiv stehen keine Zelte mit Preisen. Bitte die Preisliste des Veranstalters als Quelle hinterlegen.");
      const log = [];
      rows.forEach((r) => log.push(`Öffne ${r.source.label} … „Maß“ bei ${r.tent}: ${eur(r.curr)}`));
      if (an.wiesn) log.push(`Abgleich mit ${RR.DEMO.citySource.label}: ${rows.length} Zelte, keine Abweichung.`);
      const cs = rows.map((r) => r.curr);
      return { log, result: { kind: "tents", rows, demo: true, sources: rows.length, summary: `${rows.length} Zelte · ${eur(Math.min(...cs))} – ${eur(Math.max(...cs))}` } };
    },

    price_range(item, an) {
      const rows = tentRows(an).sort((a, b) => a.curr - b.curr);
      if (!rows.length) return handoff(["Keine Zeltpreise verfügbar."], "Ohne Zeltpreise lässt sich keine Spanne bilden.");
      const min = rows[0], max = rows[rows.length - 1];
      return {
        log: ["Sortiere Zeltpreise …", `Minimum: ${min.tent}`, `Maximum: ${max.tent}`],
        result: { kind: "facts", demo: true, sources: 2, summary: `${eur(min.curr)} – ${eur(max.curr)}`, metrics: { min: min.curr, max: max.curr },
          facts: [
            { label: "Günstigstes Zelt", value: `${min.tent}: ${eur(min.curr)}`, source: min.source, demo: true },
            { label: "Teuerstes Zelt", value: `${max.tent}: ${eur(max.curr)}`, source: max.source, demo: true },
          ] },
      };
    },

    yoy(item, an) {
      const rows = tentRows(an);
      if (!rows.length) return handoff(["Keine Zeltpreise verfügbar."], "Ohne Preise kein Vorjahresvergleich.");
      const avg = (k) => rows.reduce((s, r) => s + r[k], 0) / rows.length;
      const a = avg("prev"), b = avg("curr"), d = pct(a, b);
      const fromArt = rows.filter((r) => r.prevFrom.startsWith("Artikel")).length;
      return {
        log: ["Lade Vorjahrespreise …", `${fromArt} von ${rows.length} Vorjahreswerten stammen aus den Archivartikeln.`, "Berechne Durchschnitt und Veränderung …"],
        result: { kind: "facts", demo: true, sources: 1, summary: `Ø ${fmtPct(d)}`, metrics: { prev: a, curr: b, deltaPct: d },
          facts: [
            { label: `Ø Maßpreis ${an.targetYear - 1}`, value: eur(a), source: { label: fromArt ? "Archiv + Demo-Werte" : "Demo-Werte" } },
            { label: `Ø Maßpreis ${an.targetYear}`, value: eur(b), source: an.wiesn ? RR.DEMO.citySource : { label: "Zeltpreise (siehe oben)" }, demo: true },
            { label: "Veränderung", value: fmtPct(d), source: { label: "berechnet" } },
          ] },
      };
    },

    history(item, an) {
      const pts = an.timeline.points.map((t) => ({ year: t.year, min: t.min, max: t.max, source: { label: "Archiv: " + t.sources.join(", ") } }));
      const curr = tentRows(an).map((r) => r.curr);
      if (curr.length && !pts.some((p) => p.year === an.targetYear)) pts.push({ year: an.targetYear, min: Math.min(...curr), max: Math.max(...curr), source: { label: "aktuelle Recherche" }, demo: true });
      if (pts.length < 2) return handoff(["Zu wenige Jahreswerte im Archiv."], "Für eine Preisreihe braucht es ältere Artikel oder eine historische Quelle.");
      return {
        log: [`Lese ${an.timeline.points.length} Jahreswerte aus den Archivartikeln …`, `Ergänze ${an.targetYear} aus der aktuellen Recherche …`],
        result: { kind: "series", series: pts, sources: pts.length, summary: `${pts[0].year}: ${eur(pts[0].max)} → ${pts[pts.length - 1].year}: ${eur(pts[pts.length - 1].max)}` },
      };
    },

    soft_drinks(item, an) {
      if (!an.wiesn) return handoff(["Keine Getränkekarten hinterlegt."], "Getränkepreise bitte bei den Festwirten erfragen.");
      return {
        log: RR.DEMO.softDrinks.map((s) => `Getränkekarte ${s.tent} geprüft`),
        result: { kind: "facts", demo: true, sources: RR.DEMO.softDrinks.length, summary: `Wasser bis ${eur(Math.max(...RR.DEMO.softDrinks.map((s) => s.water)))}`,
          facts: RR.DEMO.softDrinks.map((s) => ({ label: s.tent, value: `Wasser ${eur(s.water)} · Spezi ${eur(s.spezi)}`, source: RR.DEMO.citySource, demo: true })) },
      };
    },

    metric_lookup(item, an) {
      const p = patternOf(item, an);
      const src = item.source || { label: "Offizielle Quelle" };
      if (!p.values.length) return handoff([`Suche „${item.title}“ in ${src.label} …`, "Kein Vergleichswert im Archiv, keine Quelle hinterlegt."], `Der Agent hat keine verlässliche Quelle gefunden. Gesucht wurde in: ${src.label}.`);
      const latest = p.values.filter((v) => v.year).sort((a, b) => a.year - b.year || a.value - b.value).pop() || p.values[p.values.length - 1];
      const drift = 0.01 + hash(item.title + latest.value) * 0.06;
      const dec = latest.money || String(latest.value).includes(".") ? 2 : 0;
      const curr = Math.round(latest.value * (1 + drift) * 10 ** dec) / 10 ** dec;
      const d = pct(latest.value, curr);
      return {
        log: [`Öffne ${src.label} …`, `Archivwert ${latest.year || ""}: ${latest.raw}`, `Aktueller Wert gefunden: ${withUnit(curr, p.unit)}`],
        result: { kind: "facts", demo: true, sources: 1, summary: `${withUnit(curr, p.unit)} (${fmtPct(d)})`, metrics: { prev: latest.value, curr, deltaPct: d, unit: p.unit },
          facts: [
            { label: `Archiv ${latest.year || ""}`, value: latest.raw, source: { label: "Archiv: " + latest.title } },
            { label: `Aktuell ${an.targetYear}`, value: withUnit(curr, p.unit), source: src, demo: true },
            { label: "Veränderung", value: fmtPct(d), source: { label: "berechnet" } },
          ] },
      };
    },

    archive_compare(item, an) {
      const p = patternOf(item, an);
      const byYear = {};
      p.values.forEach((v) => { if (v.year && (!byYear[v.year] || v.value > byYear[v.year].value)) byYear[v.year] = v; });
      const ys = Object.values(byYear).sort((a, b) => a.year - b.year);
      if (ys.length < 2) return handoff(["Vergleiche Archivwerte …", "Zu wenige Jahreswerte für einen Vergleich."], "Im Archiv gibt es zu wenige vergleichbare Jahreswerte. Bitte den Vorjahreswert ergänzen.");
      const facts = ys.map((v, i) => ({ label: String(v.year), value: v.raw + (i ? `  (${fmtPct(pct(ys[i - 1].value, v.value))})` : ""), source: { label: "Archiv: " + v.title } }));
      const avg = ys.slice(1).reduce((s, v, i) => s + pct(ys[i].value, v.value), 0) / (ys.length - 1);
      return {
        log: [`Vergleiche ${ys.length} Jahreswerte aus dem Archiv …`, `Durchschnittliche Veränderung: ${fmtPct(avg)} pro Jahr`],
        result: { kind: "facts", sources: ys.length, summary: `Trend ${fmtPct(avg)} / Jahr`, metrics: { trendPct: avg }, facts },
      };
    },

    lookup(item) {
      const src = item.source ? item.source.label : "offizielle Quellen";
      return handoff([`Suche in ${src} …`, "Kein maschinenlesbarer Wert gefunden."], `Der Agent konnte das nicht automatisch finden (gesucht: ${src}). Im KI-Modus versucht er es per Websuche.`);
    },
  };

  function run(item, analysis) {
    const fn = ACTIONS[item.action] || ACTIONS.lookup;
    return fn(item, analysis);
  }

  RR.agent = { run, contactFor, reply, transcript, tentRows };
})();
