/*
 * Mustererkennung – läuft komplett im Browser.
 * 1. Story-Typ über gewichtete Schlüsselwörter erkennen
 * 2. Fakten pro Artikel extrahieren (Preise, Jahre, Prozente, Zelte, Institutionen, Zitate)
 * 3. Bausteine (features) suchen, die in mehreren Artikeln vorkommen
 */
(function () {
  const RR = (window.RR = window.RR || {});

  const INSTITUTIONS = [
    ["Polizei", /polizei|einsatzkräfte|beamt(?:e|innen)/i],
    ["Stadt / Wiesnchef:in", /wiesn-?chef|wirtschaftsreferent|stadtrat|stadt münchen|rathaus/i],
    ["Oberbürgermeister:in", /oberbürgermeister|bürgermeister/i],
    ["Wiesnwirte", /wiesnwirt|festwirt|wirtin|\bwirte?\b/i],
    ["Brauereien", /brauerei/i],
    ["Bund der Steuerzahler", /steuerzahler/i],
    ["Sanitätsdienst", /sanitäter|rettungsdienst|rotes kreuz|\bbrk\b/i],
  ];

  const PRICE_RE = /(\d{1,3}(?:[.,]\d{1,2})?)\s?(?:€|euro\b|eur\b)/gi;
  const YEAR_RE = /\b(19[89]\d|20[0-4]\d)\b/g;
  const PCT_RE = /(\d{1,3}(?:[.,]\d{1,2})?)\s?(?:%|prozent\b)/gi;
  const QUOTE_RE = /[„"»]([^„"“”«»]{15,400})[“"«”]/g;
  const SPEAKER_AFTER = /^[,\s]*(?:sagt|sagte|so|erklärt|erklärte|meint|meinte|betont|betonte|findet|kritisiert|kritisierte)\s+((?:[A-ZÄÖÜ][\wäöüß.\-]*\s?){1,4})/;
  const SPEAKER_BEFORE = /((?:[A-ZÄÖÜ][\wäöüß\-]+\s?){1,3})\s*(?:sagt|sagte|erklärt|erklärte|meint|betont)[^„"]{0,20}:\s*$/;

  const num = (s) => parseFloat(String(s).replace(",", "."));
  const uniq = (arr) => [...new Set(arr)];

  function sentences(text) {
    return text.replace(/\n+/g, " ").split(/(?<=[.!?])\s+(?=[A-ZÄÖÜ„"])/);
  }

  function findTents(lower) {
    const found = [];
    for (const t of RR.DEMO.tents) {
      const alias = t.aliases.find((al) => lower.includes(al));
      if (alias) found.push({ tent: t, alias });
    }
    return found;
  }

  function extractFacts(text, articleYear) {
    const lower = text.toLowerCase();
    const prices = [...text.matchAll(PRICE_RE)].map((m) => ({ value: num(m[1]), raw: m[0] }));
    const years = uniq((text.match(YEAR_RE) || []).map(Number)).sort();
    const percents = [...text.matchAll(PCT_RE)].map((m) => m[0]);
    const tents = findTents(lower).map((f) => f.tent.name);
    const institutions = INSTITUTIONS.filter(([, re]) => re.test(text)).map(([n]) => n);

    const quotes = [...text.matchAll(QUOTE_RE)].map((m) => {
      const after = text.slice(m.index + m[0].length, m.index + m[0].length + 120);
      const before = text.slice(Math.max(0, m.index - 80), m.index);
      const sp = after.match(SPEAKER_AFTER) || before.match(SPEAKER_BEFORE);
      return { text: m[1].trim(), speaker: sp ? sp[1].trim() : null, context: before + " " + after };
    });

    // Preise satzweise einem Jahr (und ggf. einem Zelt) zuordnen
    const datedPrices = [];
    for (const s of sentences(text)) {
      const ps = [...s.matchAll(PRICE_RE)];
      if (!ps.length) continue;
      const sYears = (s.match(YEAR_RE) || []).map(Number);
      let year = articleYear;
      if (sYears.length === 1) year = sYears[0];
      else if (/vorjahr|letzte[ns]? jahr|im jahr davor/i.test(s) && articleYear) year = articleYear - 1;
      const sl = s.toLowerCase();
      const tentHits = findTents(sl).map((f) => ({ ...f, pos: sl.indexOf(f.alias) }));
      for (const p of ps) {
        // nächstes Zelt vor dem Preis
        const before = tentHits.filter((t) => t.pos <= p.index).sort((a, b) => b.pos - a.pos)[0];
        datedPrices.push({ value: num(p[1]), year, tent: before ? before.tent.name : null, sentence: s.trim() });
      }
    }

    return { prices, years, percents, tents, institutions, quotes, datedPrices };
  }

  function detectType(articles) {
    const all = articles.map((a) => a.text.toLowerCase()).join("\n");
    let best = null;
    for (const bp of RR.BLUEPRINTS) {
      const total = bp.keywords.reduce((s, [, w]) => s + w, 0);
      const matched = bp.keywords.filter(([k]) => all.includes(k));
      const score = matched.reduce((s, [, w]) => s + w, 0) / total;
      if (!best || score > best.score) best = { blueprint: bp, score, matched: matched.map(([k]) => k) };
    }
    if (!best || best.score < 0.3) {
      return { blueprint: RR.GENERIC_BLUEPRINT, score: best ? best.score : 0, matched: best ? best.matched : [], fallback: true };
    }
    return { ...best, fallback: false };
  }

  function analyze(articles) {
    const type = detectType(articles);
    const bp = type.blueprint;
    const per = articles.map((a) => {
      const facts = extractFacts(a.text, a.year);
      const ctx = { text: a.text, facts };
      const features = {};
      for (const f of bp.features) {
        try { features[f.id] = !!f.test(ctx); } catch (e) { features[f.id] = false; }
      }
      return { id: a.id, title: a.title, year: a.year, facts, features };
    });

    const n = articles.length;
    const threshold = n >= 2 ? 2 : 1;
    const patterns = bp.features.map((f) => {
      const hits = per.filter((p) => p.features[f.id]).length;
      return { id: f.id, label: f.label, hits, recurring: hits >= threshold };
    });

    // Zeitreihe: Preise pro Jahr (bei Wiesn nur plausible Maßpreise)
    const isWiesn = bp.id === "wiesn-bierpreis";
    const plausible = (v) => (isWiesn ? v >= 5 && v <= 30 : true);
    const notBeer = /wasser|spezi|limo|hendl|alkoholfrei|softdrink|brezn/i;
    const byYear = {};
    for (const p of per) {
      for (const dp of p.facts.datedPrices) {
        if (!dp.year || !plausible(dp.value) || (isWiesn && notBeer.test(dp.sentence))) continue;
        const y = (byYear[dp.year] = byYear[dp.year] || { year: dp.year, min: Infinity, max: -Infinity, sources: [] });
        y.min = Math.min(y.min, dp.value);
        y.max = Math.max(y.max, dp.value);
        if (!y.sources.includes(p.title)) y.sources.push(p.title);
      }
    }
    const timeline = Object.values(byYear).sort((a, b) => a.year - b.year);

    // Zeltpreise aus den Artikeln (für Vorjahresvergleich)
    const tentPrices = [];
    for (const p of per) {
      for (const dp of p.facts.datedPrices) {
        if (dp.tent && plausible(dp.value) && !notBeer.test(dp.sentence)) tentPrices.push({ tent: dp.tent, year: dp.year, value: dp.value, article: p.title });
      }
    }

    const latestYear = Math.max(0, ...articles.map((a) => a.year || 0));
    const nowYear = new Date().getFullYear();
    const targetYear = latestYear && latestYear < nowYear ? nowYear : latestYear ? latestYear + 1 : nowYear;

    return {
      type: { id: bp.id, label: bp.label, icon: bp.icon, score: type.score, matched: type.matched, fallback: type.fallback },
      per,
      patterns,
      threshold,
      timeline,
      tentPrices,
      targetYear,
    };
  }

  RR.analyze = analyze;
  RR.getBlueprint = (id) => [...RR.BLUEPRINTS, RR.GENERIC_BLUEPRINT].find((b) => b.id === id);
})();
