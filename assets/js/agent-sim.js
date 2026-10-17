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

  /* ---------- Faktenbasis (amtliche / eigene Tabellen) ---------- */
  const F = () => RR.facts;
  const dsFor = (an) => (an.datasets || []).map((id) => F() && F().get(id)).filter(Boolean);
  const cityOf = (an) => dsFor(an).find((d) => d.builtin) || null;
  // Wert + Vorjahreswert einer Spalte als Faktenzeilen mit Quelle
  function officialRows(ds, col, year) {
    const cur = year != null ? { year, value: F().value(ds, col, year) } : F().latest(ds, col);
    if (!cur || cur.value == null) return [];
    const prev = F().before(ds, col, cur.year);
    const out = [{ label: `${ds.columns[col].label} ${cur.year}`, value: F().fmt(ds, col, cur.value), source: F().source(ds, cur.year), official: true }];
    if (prev) out.push({ label: `Veränderung zu ${prev.year}`, value: `${fmtPct(pct(prev.value, cur.value))} (${prev.year}: ${F().fmt(ds, col, prev.value)})`, source: F().source(ds, prev.year), official: true });
    return out;
  }

  const patternOf = (item, analysis) => analysis.patterns.find((p) => p.id === item.patternId) || { values: [], unit: "" };

  /* ---------- Zeltpreise ---------- */
  // Demo-Preise passend zum Preisniveau skalieren: amtlicher Ø des Vorjahres,
  // sonst jüngster Archivwert (+3,5 % pro fehlendem Jahr)
  function demoScale(an) {
    const tents = RR.DEMO.tents;
    const avgPrev = tents.reduce((s, t) => s + t.prev, 0) / tents.length;
    const maxPrev = Math.max(...tents.map((t) => t.prev));
    const city = cityOf(an);
    const T = an.targetYear;
    const grow = (n) => Math.pow(1.035, Math.max(0, n));
    if (city && F().value(city, "bier_preis", T - 1) != null) return F().value(city, "bier_preis", T - 1) / avgPrev;
    const last = an.timeline && an.timeline.points.length ? an.timeline.points[an.timeline.points.length - 1] : null;
    if (last) return (last.max / maxPrev) * grow(T - 1 - last.year);
    if (city) { const l = F().latest(city, "bier_preis"); return (l.value / avgPrev) * grow(T - 1 - l.year); }
    return 1;
  }

  function tentRows(analysis) {
    const T = analysis.targetYear;
    if (analysis.wiesn) {
      const f = demoScale(analysis);
      const r05 = (x) => Math.round(x * f * 20) / 20;
      return RR.DEMO.tents.map((t) => {
        const art = (analysis.tentPrices || []).filter((p) => p.tent === t.name && p.year === T - 1).pop();
        const prev = art ? art.value : r05(t.prev);
        const curr = Math.max(r05(t.curr), prev);
        return { tent: t.name, curr, prev, prevFrom: art ? `Artikel ${art.year}` : "Demo-Wert", delta: pct(prev, curr),
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

  // Kernangaben aus Archivsätzen: Uhrzeiten, Daten, Beträge, Personen mit Rolle, Orte
  const MONTH = "Januar|Februar|März|April|Mai|Juni|Juli|August|September|Oktober|November|Dezember";
  function keyFacts(texts) {
    const out = [];
    const add = (x) => { x = x.replace(/\s+/g, " ").trim(); if (x && !out.some((o) => o.toLowerCase() === x.toLowerCase())) out.push(x); };
    for (const t of texts) {
      (t.match(/\b\d{1,2}(?::\d{2})?\s?Uhr\b/g) || []).forEach(add);
      (t.match(new RegExp(`\\b\\d{1,2}\\.\\s?(?:${MONTH})\\b`, "g")) || []).forEach(add);
      (t.match(/\b(?:Ober)?[Bb]ürgermeister(?:in)?\s+[A-ZÄÖÜ][a-zäöüß]+\s+[A-ZÄÖÜ][\wäöüß-]+|\bMinisterpräsident(?:in)?\s+[A-ZÄÖÜ][a-zäöüß]+\s+[A-ZÄÖÜ][\wäöüß-]+/g) || []).forEach(add);
      (t.match(/\b(?:Haupteingang|Bavaria|Theresienwiese|[A-ZÄÖÜ][\wäöüß]+-(?:Festzelt|Zelt))\b/g) || []).forEach(add);
      RR.text.numbers(t).filter((n) => n.money || n.noun).forEach((n) => add(n.raw));
      if (/wolkenlos|sonnig|regen|gewitter|warm|kalt/i.test(t)) add((t.match(/wolkenlos|sonnig|regnerisch|regen|gewitter|warm|kalt/i) || [""])[0].toLowerCase());
    }
    return out.slice(0, 5);
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
      const city = cityOf(an);
      if (city) {
        // amtlicher Durchschnitt der letzten beiden Jahre + Schätzung fürs Zieljahr
        const lat = F().latest(city, "bier_preis"), prv = F().before(city, "bier_preis", lat.year);
        const real = pct(prv.value, lat.value);
        return {
          log: [`Lade amtliche Durchschnittspreise (${city.short}) …`, `${prv.year}: ${eur(prv.value)} → ${lat.year}: ${eur(lat.value)}`, `${lat.year < an.targetYear ? `Für ${an.targetYear} noch keine amtlichen Zahlen – Schätzung aus Zeltpreisen.` : "Aktuelles Jahr amtlich verfügbar."}`],
          result: { kind: "facts", official: true, demo: lat.year < an.targetYear, sources: 3, summary: `amtlich ${prv.year}→${lat.year}: ${fmtPct(real)}`, metrics: { prev: prv.value, curr: lat.value, deltaPct: real, prevYear: prv.year, currYear: lat.year },
            facts: [
              { label: `Ø Maßpreis ${prv.year}`, value: eur(prv.value), source: F().source(city, prv.year), official: true },
              { label: `Ø Maßpreis ${lat.year}`, value: eur(lat.value), source: F().source(city, lat.year), official: true },
              { label: `Veränderung ${prv.year}→${lat.year}`, value: fmtPct(real), source: { label: "berechnet aus Stadtdaten" }, official: true },
              ...(lat.year < an.targetYear ? [{ label: `Schätzung ${an.targetYear}`, value: `${fmtPct(d)} (Ø der Zeltpreise)`, source: { label: "Zeltpreise, siehe oben" }, demo: true }] : []),
            ] },
        };
      }
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
      const city = cityOf(an);
      if (city) {
        const s = F().series(city, "bier_preis");
        const first = s[0], last = s[s.length - 1];
        const archMax = {};
        an.timeline.points.forEach((t) => (archMax[t.year] = t.max));
        // jedes fünfte Jahr plus die letzten Jahre
        const pick = s.filter((p) => (p.year - first.year) % 5 === 0 || p.year >= last.year - 3);
        return {
          log: [`Lade ${s.length} amtliche Jahreswerte (${first.year}–${last.year}) …`, "Gleiche mit den Preisen aus den Archivartikeln ab …"],
          result: { kind: "facts", official: true, sources: s.length, summary: `${first.year}: ${eur(first.value)} → ${last.year}: ${eur(last.value)} (Ø, amtlich)`,
            facts: [
              ...pick.map((p) => ({ label: String(p.year), value: `Ø ${eur(p.value)}${archMax[p.year] ? ` · Artikel: bis ${eur(archMax[p.year])}` : ""}`, source: F().source(city, p.year), official: true })),
              { label: `${first.year}→${last.year}`, value: fmtPct(pct(first.value, last.value)), source: { label: "berechnet aus Stadtdaten" }, official: true },
            ] },
        };
      }
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
      // passende Spalte in einer Datentabelle? Dann echte Werte statt Demo
      for (const ds of dsFor(an)) {
        const col = F().columnFor(ds, item.title);
        if (!col) continue;
        const hasTarget = F().value(ds, col, an.targetYear) != null;
        const rows = officialRows(ds, col, hasTarget ? an.targetYear : null);
        if (!rows.length) continue;
        const lat = hasTarget ? { year: an.targetYear, value: F().value(ds, col, an.targetYear) } : F().latest(ds, col);
        return {
          log: [`Durchsuche Faktenbasis: ${ds.title} …`, `Spalte „${ds.columns[col].label}“ gefunden.`, hasTarget ? `Wert für ${an.targetYear} vorhanden.` : `Für ${an.targetYear} noch nicht veröffentlicht – letzter Wert ${lat.year}.`],
          result: { kind: "facts", official: true, badge: ds.custom ? ds.title : ds.short, carried: !hasTarget, sources: rows.length,
            summary: hasTarget ? `${F().fmt(ds, col, lat.value)} (${lat.year})` : `Letzter amtlicher Wert ${lat.year}: ${F().fmt(ds, col, lat.value)}`,
            facts: hasTarget ? rows : [...rows, { label: `Prüfen für ${an.targetYear}`, value: "Noch nicht veröffentlicht – bei der Quelle nachfragen.", source: src }] },
        };
      }
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

    /* ---------- Aktionen auf Basis der Stadtdaten (echt, keine Demo) ---------- */
    city_price(item, an) {
      const c = cityOf(an);
      if (!c) return handoff(["Keine Datentabelle verknüpft."], "Ohne Stadtdaten kein Durchschnittspreis.");
      const rows = officialRows(c, "bier_preis", null);
      const lat = F().latest(c, "bier_preis");
      const ten = F().series(c, "bier_preis").find((p) => p.year === lat.year - 10);
      return {
        log: [`Lade ${c.title} (${c.short}) …`, `Ø Maßpreis ${lat.year}: ${eur(lat.value)}`],
        result: { kind: "facts", official: true, sources: rows.length, summary: `Ø ${eur(lat.value)} (${lat.year}, amtlich)`, metrics: { avg: lat.value, year: lat.year },
          facts: [...rows, ...(ten ? [{ label: `Vor zehn Jahren (${ten.year})`, value: `${eur(ten.value)} · seitdem ${fmtPct(pct(ten.value, lat.value))}`, source: F().source(c, ten.year), official: true }] : [])] },
      };
    },

    city_balance(item, an) {
      const c = cityOf(an);
      if (!c) return handoff(["Keine Datentabelle verknüpft."], "Keine amtliche Bilanz verfügbar.");
      const y = F().latest(c, "besucher_gesamt").year;
      const cols = ["besucher_gesamt", "besucher_tag", "bier_konsum", "hendl_konsum", "dauer"];
      const facts = cols.flatMap((col) => {
        const v = F().value(c, col, y), pv = F().before(c, col, y);
        return v == null ? [] : [{ label: c.columns[col].label, value: `${F().fmt(c, col, v)}${pv ? ` (${fmtPct(pct(pv.value, v))} zu ${pv.year})` : ""}`, source: F().source(c, y), official: true }];
      });
      return {
        log: [`Lade amtliche Bilanz ${y} (${c.short}) …`, `${facts.length} Kennzahlen gefunden.`],
        result: { kind: "facts", official: true, sources: facts.length, summary: `${F().fmt(c, "besucher_gesamt", F().value(c, "besucher_gesamt", y))} Besucher, ${F().fmt(c, "bier_konsum", F().value(c, "bier_konsum", y))} Bier (${y})`, facts },
      };
    },

    city_hendl(item, an) {
      const c = cityOf(an);
      if (!c) return handoff(["Keine Datentabelle verknüpft."], "Kein Hendlpreis verfügbar.");
      const h = F().latest(c, "hendl_preis"), b = F().value(c, "bier_preis", h.year);
      const ten = F().series(c, "hendl_preis").find((p) => p.year === h.year - 10);
      return {
        log: [`Lade Hendlpreise (${c.short}) …`, `Ø Hendl ${h.year}: ${eur(h.value)}`],
        result: { kind: "facts", official: true, sources: 3, summary: `Ø Hendl ${eur(h.value)} (${h.year})`,
          facts: [
            ...officialRows(c, "hendl_preis", null),
            ...(ten ? [{ label: `Vor zehn Jahren (${ten.year})`, value: `${eur(ten.value)} · seitdem ${fmtPct(pct(ten.value, h.value))}`, source: F().source(c, ten.year), official: true }] : []),
            ...(b ? [{ label: "Verhältnis", value: `Ein Hendl kostet so viel wie ${(h.value / b).toLocaleString("de-DE", { maximumFractionDigits: 2 })} Maß`, source: { label: "berechnet aus Stadtdaten" }, official: true }] : []),
          ] },
      };
    },

    city_records(item, an) {
      const c = cityOf(an);
      if (!c) return handoff(["Keine Datentabelle verknüpft."], "Keine Daten für Rekorde.");
      const ext = (col, fn) => F().series(c, col).reduce((a, p) => (!a || fn(p.value, a.value) ? p : a), null);
      const vMax = ext("besucher_gesamt", (x, y) => x > y), vMin = ext("besucher_gesamt", (x, y) => x < y);
      const kMax = ext("bier_konsum", (x, y) => x > y);
      const ps = F().series(c, "bier_preis");
      const jumps = ps.slice(1).map((p, i) => ({ year: p.year, from: ps[i].year, d: pct(ps[i].value, p.value) })).sort((a, b) => b.d - a.d);
      const first = ps[0], last = ps[ps.length - 1];
      return {
        log: [`Werte ${c.rows.length} Jahrgänge aus (${first.year}–${last.year}) …`, `Besucherrekord: ${F().fmt(c, "besucher_gesamt", vMax.value)} (${vMax.year})`],
        result: { kind: "facts", official: true, sources: c.rows.length, summary: `Besucherrekord ${F().fmt(c, "besucher_gesamt", vMax.value)} (${vMax.year})`,
          facts: [
            { label: "Meiste Besucher", value: `${F().fmt(c, "besucher_gesamt", vMax.value)} (${vMax.year})`, source: F().source(c, vMax.year), official: true },
            { label: "Wenigste Besucher", value: `${F().fmt(c, "besucher_gesamt", vMin.value)} (${vMin.year})`, source: F().source(c, vMin.year), official: true },
            { label: "Meister Bierkonsum", value: `${F().fmt(c, "bier_konsum", kMax.value)} (${kMax.year})`, source: F().source(c, kMax.year), official: true },
            { label: "Größter Preissprung", value: `${fmtPct(jumps[0].d)} (${jumps[0].from}→${jumps[0].year})`, source: { label: "berechnet aus Stadtdaten" }, official: true },
            { label: `Maßpreis ${first.year}→${last.year}`, value: `${eur(first.value)} → ${eur(last.value)} (${fmtPct(pct(first.value, last.value))})`, source: F().source(c), official: true },
          ] },
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
      const city = an && cityOf(an);
      const col = city && F().columnFor(city, item.title);
      const extra = col ? officialRows(city, col, null) : [];
      if (!ev.length && extra.length) {
        return {
          log: [`Suche in ${src} …`, `Amtliche Vergleichswerte gefunden (${city.short}).`],
          result: { kind: "facts", carried: true, official: true, sources: extra.length, summary: `Letzter amtlicher Wert: ${extra[0].value}`, facts: extra },
        };
      }
      if (ev.length) {
        // jüngste Ausgabe im Archiv als Vorschlag übernehmen – muss bestätigt werden
        const latest = Math.max(...ev.map((e) => e.ay));
        const inYear = ev.filter((e) => e.ay === latest);
        const body = inYear.filter((e) => e.start > 0); // Überschrift nur, wenn sonst nichts da ist
        const last = (body.length ? body : inYear).slice().sort((a, b) => /\d/.test(b.text) - /\d/.test(a.text)); // konkrete Angaben zuerst
        const cut = (t, n) => (t.length > n ? t.slice(0, n - 1) + "…" : t);
        return {
          log: [`Suche in ${src} …`, `Für ${an.targetYear} noch nichts veröffentlicht (Offline-Modus).`, `Übernehme Angaben aus ${latest} als Vorschlag.`],
          result: { kind: "facts", carried: true, official: extra.length > 0, sources: 1 + extra.length,
            summary: ((k) => `Vorschlag aus ${latest}: ${k.length ? k.join(" · ") : cut(last[0].text, 90)}`)(keyFacts(last.map((e) => e.text))),
            facts: [
              ...last.slice(0, 3).map((e) => ({ label: `Archiv ${latest}`, value: `„${cut(e.text, 220)}“`, source: { label: "Archiv: " + e.title } })),
              ...extra,
              { label: `Prüfen für ${an.targetYear}`, value: "Gilt das wieder? Bitte bestätigen oder korrigieren.", source: item.source || { label: "offizielle Quelle" } },
            ] },
        };
      }
      return handoff([`Suche in ${src} …`, "Kein maschinenlesbarer Wert gefunden."], `Der Agent konnte das nicht automatisch finden (gesucht: ${src}). Bitte selbst recherchieren oder als Datentabelle hinterlegen.`);
    },
  };

  function run(item, analysis) {
    const fn = ACTIONS[item.action] || ACTIONS.lookup;
    return fn(item, analysis);
  }

  RR.agent = { run, contactFor, reply, transcript, tentRows };
})();
