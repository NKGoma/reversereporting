/*
 * Simulierter Agent. Nichts verlässt den Browser.
 * Jede Aktion liefert Log-Zeilen (für die Animation) und ein Ergebnis.
 */
(function () {
  const RR = (window.RR = window.RR || {});
  const D = () => RR.DEMO;

  const eur = (v) => (v == null || isNaN(v) ? "–" : v.toFixed(2).replace(".", ",") + " €");
  const pct = (a, b) => (a && b ? ((b - a) / a) * 100 : null);
  const fmtPct = (p) => (p == null ? "–" : (p >= 0 ? "+" : "") + p.toFixed(1).replace(".", ",") + " %");

  function sourceFor(tent) {
    return tent.url ? { label: tent.url.replace(/^https?:\/\/(www\.)?/, ""), url: tent.url } : D().citySource;
  }

  // Vorjahrespreis: zuerst aus den hochgeladenen Artikeln, sonst Demo-Wert
  function prevPrice(tent, analysis) {
    const fromArticle = (analysis.tentPrices || []).filter((p) => p.tent === tent.name && p.year === analysis.targetYear - 1).pop();
    if (fromArticle) return { value: fromArticle.value, from: "Artikel: " + fromArticle.article, demo: false };
    return { value: tent.prev, from: "Demo-Wert", demo: true };
  }

  function tentRows(analysis) {
    return D().tents.map((t) => {
      const prev = prevPrice(t, analysis);
      return { tent: t.name, curr: t.curr, prev: prev.value, prevFrom: prev.from, delta: pct(prev.value, t.curr), source: sourceFor(t), verified: false };
    });
  }

  const ACTIONS = {
    tent_prices(analysis) {
      const rows = tentRows(analysis);
      const log = [];
      rows.forEach((r) => {
        log.push(`Öffne ${r.source.label} …`);
        log.push(`„Maß“ gefunden bei ${r.tent}: ${eur(r.curr)}`);
      });
      log.push(`Abgleich mit ${D().citySource.label}: ${rows.length} Zelte, keine Abweichung.`);
      return { log, result: { kind: "tent_table", rows } };
    },

    price_range(analysis) {
      const rows = tentRows(analysis).sort((a, b) => a.curr - b.curr);
      const min = rows[0], max = rows[rows.length - 1];
      return {
        log: ["Sortiere Zeltpreise …", `Minimum: ${min.tent}`, `Maximum: ${max.tent}`],
        result: {
          kind: "facts",
          facts: [
            { label: "Günstigstes Zelt", value: `${min.tent} – ${eur(min.curr)}`, source: min.source },
            { label: "Teuerstes Zelt", value: `${max.tent} – ${eur(max.curr)}`, source: max.source },
            { label: "Spanne", value: `${eur(min.curr)} bis ${eur(max.curr)}`, source: D().citySource },
          ],
        },
      };
    },

    yoy(analysis) {
      const rows = tentRows(analysis);
      const avg = (k) => rows.reduce((s, r) => s + r[k], 0) / rows.length;
      const a = avg("prev"), b = avg("curr");
      const fromArticles = rows.filter((r) => !r.prevFrom.startsWith("Demo")).length;
      return {
        log: ["Lade Vorjahrespreise …", `${fromArticles} von ${rows.length} Vorjahreswerten aus den hochgeladenen Artikeln übernommen.`, "Berechne Durchschnitt und Veränderung …"],
        result: {
          kind: "facts",
          facts: [
            { label: `Ø Maßpreis ${analysis.targetYear - 1}`, value: eur(a), source: { label: fromArticles ? "Artikel + Demo-Werte" : "Demo-Werte" } },
            { label: `Ø Maßpreis ${analysis.targetYear}`, value: eur(b), source: D().citySource },
            { label: "Veränderung", value: fmtPct(pct(a, b)), source: { label: "berechnet" } },
          ],
        },
      };
    },

    history(analysis) {
      const series = analysis.timeline.map((t) => ({ year: t.year, min: t.min, max: t.max, source: { label: "Archiv: " + t.sources.join(", ") } }));
      const curr = D().tents.map((t) => t.curr);
      if (!series.some((s) => s.year === analysis.targetYear)) {
        series.push({ year: analysis.targetYear, min: Math.min(...curr), max: Math.max(...curr), source: D().citySource, demo: true });
      }
      return {
        log: [`Lese ${analysis.timeline.length} Jahreswerte aus den Archivartikeln …`, `Ergänze ${analysis.targetYear} aus aktueller Recherche …`],
        result: { kind: "series", series },
      };
    },

    soft_drinks() {
      return {
        log: D().softDrinks.map((s) => `Getränkekarte ${s.tent} geprüft`),
        result: {
          kind: "facts",
          facts: D().softDrinks.map((s) => ({ label: s.tent, value: `Wasser ${eur(s.water)} · Spezi ${eur(s.spezi)}`, source: D().citySource })),
        },
      };
    },

    archive_numbers(analysis) {
      const facts = [];
      for (const p of analysis.per) {
        for (const dp of p.facts.datedPrices.slice(0, 4)) {
          facts.push({ label: `${dp.year || "?"}`, value: `${eur(dp.value)} – „${dp.sentence.slice(0, 110)}${dp.sentence.length > 110 ? "…" : ""}“`, source: { label: "Archiv: " + p.title } });
        }
        p.facts.percents.slice(0, 2).forEach((x) => facts.push({ label: `${p.year || "?"}`, value: x, source: { label: "Archiv: " + p.title } }));
      }
      return {
        log: ["Durchsuche Archivartikel nach Kennzahlen …", `${facts.length} Werte mit Fundstelle gesammelt.`],
        result: { kind: "facts", facts, archive: true },
      };
    },

    archive_years(analysis) {
      const facts = analysis.per.map((p) => ({ label: String(p.year || "?"), value: `Erwähnte Jahre: ${p.facts.years.join(", ") || "–"}`, source: { label: "Archiv: " + p.title } }));
      return { log: ["Sammle Jahresangaben …"], result: { kind: "facts", facts, archive: true } };
    },

    // Kein bekannter Quellen-Pfad -> Agent gibt an Journalist:in ab
    lookup() {
      return {
        log: ["Suche offizielle Quelle …", "Keine verlässliche Quelle hinterlegt.", "→ Übergabe an Journalist:in"],
        handoff: "Der Agent konnte keine verlässliche, offizielle Quelle finden. Bitte Quelle festlegen – beim nächsten Durchlauf merkt sich der Blueprint sie.",
      };
    },
  };

  function run(item, analysis) {
    const fn = ACTIONS[item.action] || ACTIONS.lookup;
    return fn(analysis);
  }

  function contact(item) {
    return D().contacts[item.contact] || D().contacts.generic;
  }
  function reply(item) {
    return D().replies[item.contact] || D().replies.generic;
  }
  function transcript(item) {
    return D().transcripts[item.contact] || D().transcripts.generic;
  }

  RR.agent = { run, contact, reply, transcript, eur, fmtPct };
})();
