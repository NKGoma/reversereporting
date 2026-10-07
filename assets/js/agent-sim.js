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

    // Ausgabe zählen: "190. Oktoberfest" (2025) → 2027 = 192.
    edition(item, an) {
      const p = patternOf(item, an);
      const seen = [];
      for (const e of p.evidence || []) {
        const m = e.text.match(/\b(\d{2,3})\.\s*(oktoberfest|wiesn|volksfest|auflage|ausgabe)/i) || e.text.match(/\bdie (\d{2,3})\./i);
        if (m && e.ay) seen.push({ year: e.ay, n: Number(m[1]), title: e.title, word: m[2] || "Ausgabe" });
      }
      if (!seen.length) return handoff(["Suche Zählung im Archiv …", "Keine Zählung gefunden."], "Im Archiv steht nicht, die wievielte Ausgabe es ist.");
      const uniqY = {};
      seen.forEach((x) => (uniqY[x.year] = x));
      const list = Object.values(uniqY).sort((a, b) => a.year - b.year);
      const last = list[list.length - 1];
      const next = last.n + (an.targetYear - last.year);
      const consistent = list.every((x) => x.n - x.year === last.n - last.year);
      const word = /wiesn/i.test(last.word) ? "Wiesn" : an.type.event || "Ausgabe";
      return {
        log: list.map((x) => `Archiv ${x.year}: ${x.n}. ${word}`).concat([`Berechne ${an.targetYear}: ${next}. ${word}`]),
        result: { kind: "facts", sources: list.length, summary: `${next}. ${word} (${an.targetYear})`, metrics: { edition: next },
          facts: [
            ...list.map((x) => ({ label: String(x.year), value: `${x.n}. ${word}`, source: { label: "Archiv: " + x.title } })),
            { label: String(an.targetYear), value: `${next}. ${word}`, source: { label: consistent ? "berechnet – Zählung im Archiv ist lückenlos" : "berechnet – Achtung: Zählung im Archiv springt, bitte prüfen" } },
          ] },
      };
    },

    // Was war im Vorjahr? Belegsätze aus dem Archiv, nach Jahr sortiert (echte Daten)
    archive_recap(item, an) {
      const p = patternOf(item, an);
      const ev = (p.evidence || []).slice().sort((a, b) => (a.ay || 0) - (b.ay || 0));
      if (!ev.length) return handoff(["Durchsuche Archiv …", "Keine Vergleichsstellen gefunden."], "Im Archiv gibt es keine Vergleichsstellen.");
      const cut = (t) => (t.length > 220 ? t.slice(0, 217) + "…" : t);
      return {
        log: [`Durchsuche ${an.per.length} Archivartikel …`, `${ev.length} Vergleichsstellen gefunden.`],
        result: { kind: "facts", sources: ev.length, summary: ((n) => `${ev.length} Stellen aus ${n === 1 ? "einem Jahr" : n + " Jahren"}`)(new Set(ev.map((e) => e.ay)).size),
          facts: ev.slice(0, 6).map((e) => ({ label: String(e.ay || "?"), value: `„${cut(e.text)}“`, source: { label: "Archiv: " + e.title } })) },
      };
    },

    lookup(item, an) {
      const src = item.source ? item.source.label : "offizielle Quellen";
      const p = an ? patternOf(item, an) : { evidence: [] };
      const ev = (p.evidence || []).filter((e) => e.ay);
      if (ev.length) {
        // jüngste Ausgabe im Archiv als Vorschlag übernehmen – muss bestätigt werden
        const latest = Math.max(...ev.map((e) => e.ay));
        const inYear = ev.filter((e) => e.ay === latest);
        const body = inYear.filter((e) => e.start > 0); // Überschrift nur, wenn sonst nichts da ist
        const last = (body.length ? body : inYear).slice().sort((a, b) => /\d/.test(b.text) - /\d/.test(a.text)); // konkrete Angaben zuerst
        const cut = (t, n) => (t.length > n ? t.slice(0, n - 1) + "…" : t);
        return {
          log: [`Suche in ${src} …`, `Für ${an.targetYear} noch nichts veröffentlicht (Offline-Modus).`, `Übernehme Angaben aus ${latest} als Vorschlag.`],
          result: { kind: "facts", carried: true, sources: 1, summary: `Vorschlag aus ${latest}: ${cut(last[0].text, 90)}`,
            facts: [
              ...last.slice(0, 3).map((e) => ({ label: `Archiv ${latest}`, value: `„${cut(e.text, 220)}“`, source: { label: "Archiv: " + e.title } })),
              { label: `Prüfen für ${an.targetYear}`, value: "Gilt das wieder? Bitte bestätigen oder korrigieren.", source: item.source || { label: "offizielle Quelle" } },
            ] },
        };
      }
      return handoff([`Suche in ${src} …`, "Kein maschinenlesbarer Wert gefunden."], `Der Agent konnte das nicht automatisch finden (gesucht: ${src}). Im KI-Modus versucht er es per Websuche.`);
    },
  };

  function run(item, analysis) {
    const fn = ACTIONS[item.action] || ACTIONS.lookup;
    return fn(item, analysis);
  }

  RR.agent = { run, contactFor, reply, transcript, tentRows };
})();
