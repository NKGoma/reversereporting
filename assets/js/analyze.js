/*
 * Mustererkennung (Offline-Engine) – läuft komplett im Browser.
 *  1. Story-Typ über gewichtete Schlüsselwörter erkennen
 *  2. Texte in Sätze zerlegen (mit Zeichen-Offsets für die Markierung im Reader)
 *  3. Bausteine satzweise suchen → Belegstellen pro Artikel
 *  4. Unbekannte Themen: allgemeine Engine baut Bausteine aus wiederkehrenden
 *     Kennzahlen, Institutionen, Rollen und Erzählmustern
 */
(function () {
  const RR = (window.RR = window.RR || {});

  const YEAR_RE = /\b(19[89]\d|20[0-4]\d)\b/g;
  const PRICE_RE = /(\d{1,3}(?:[.,]\d{1,2})?)\s?(?:€|euro\b)/gi;
  const PCT_RE = /(\d{1,3}(?:[.,]\d{1,2})?)\s?(?:%|prozent\b)/gi;
  const QUOTE_RE = /[„"»]([^„"“”«»]{12,400})[“"«”]/g;
  const SPEAKER_AFTER = /^[,\s]*(?:sagt|sagte|so|erklärt|erklärte|meint|meinte|betont|betonte|findet|kritisiert|kritisierte)\s+((?:[A-ZÄÖÜ][\wäöüß.\-]*\s?){1,4})/;
  const NUM_RE = /(\d{1,3}(?:\.\d{3})+|\d+)(?:,(\d+))?(?:\s*(Milliarden|Mrd\.?|Millionen|Mio\.?|Tausend|Prozentpunkte|Prozent|%|Euro|€))?(?:\s*(Euro|€))?(?:\s+([A-ZÄÖÜ][a-zäöüß]{3,}))?/g;
  const MONTHS = /^(Januar|Februar|März|April|Mai|Juni|Juli|August|September|Oktober|November|Dezember|Uhr|Jahr|Jahre|Jahren|Prozent)$/;

  const INSTITUTIONS = [
    ["Polizei", /polizei|einsatzkräfte|beamt(?:e|innen)/i],
    ["Stadt / Verwaltung", /stadtrat|stadtverwaltung|rathaus|stadt münchen|referat/i],
    ["Bürgermeister:in", /bürgermeister/i],
    ["Wirte / Veranstalter", /wiesnwirt|festwirt|wirtin|\bwirte?\b|veranstalter/i],
    ["Ministerium", /ministeri/i],
    ["Verbände", /verband|bund der steuerzahler|gewerkschaft/i],
    ["Rettungsdienst", /sanitäts|sanitäter|rettungsdienst|rotes kreuz/i],
  ];

  const num = (s) => parseFloat(String(s).replace(/\./g, "").replace(",", "."));
  const uniq = (a) => [...new Set(a)];

  /* ---------- Sätze mit Offsets ---------- */
  function sentences(text) {
    const out = [];
    const lineRe = /[^\n]+/g;
    let lm;
    while ((lm = lineRe.exec(text))) {
      const line = lm[0];
      const sRe = /.+?(?:(?<!(?:^|[^\d.,])\d{1,3})[.!?]+["“]?(?=\s+[A-ZÄÖÜ„"])|$)/g;
      let sm;
      while ((sm = sRe.exec(line))) {
        const raw = sm[0];
        const t = raw.trim();
        if (!t) continue;
        const lead = raw.length - raw.trimStart().length;
        const start = lm.index + sm.index + lead;
        out.push({ text: t, start, end: start + t.length });
      }
    }
    return out;
  }

  // Vergangenheits-Marker ("im Vorjahr waren es …"), aber nicht "im Vergleich zum Vorjahr"
  const PAST = /im vorjahr|vorjahreswert|im jahr davor|letzte[ns]? jahr|waren es|noch bei|lag (?:er|sie|es|der \w+) noch/i;
  const COMPARE = /(vergleich|gegenüber)\s+(zum|dem)\s+vorjahr/i;
  const isPast = (t) => PAST.test(t) && !COMPARE.test(t);

  const AGO_WORDS = { zwei: 2, drei: 3, vier: 4, fünf: 5, sechs: 6, sieben: 7, acht: 8, neun: 9, zehn: 10, zwanzig: 20 };
  function yearsAgo(t, articleYear) {
    const m = t.match(/vor (\d+|zwei|drei|vier|fünf|sechs|sieben|acht|neun|zehn|zwanzig) jahren/i);
    if (!m || !articleYear) return null;
    return articleYear - (AGO_WORDS[m[1].toLowerCase()] || Number(m[1]));
  }

  function sentenceYear(s, articleYear) {
    const ago = yearsAgo(s, articleYear);
    if (ago) return ago;
    const ys = (s.match(YEAR_RE) || []).map(Number);
    if (ys.length === 1) return ys[0];
    if (isPast(s) && articleYear) return articleYear - 1;
    return articleYear;
  }

  // Jahr für eine Stelle im Satz: erst der Teilsatz, dann der ganze Satz
  function yearAt(s, index, articleYear) {
    const parts = s.split(/(?:,|;| – | - )/);
    let pos = 0, clause = s;
    for (const p of parts) { if (index < pos + p.length + 1) { clause = p; break; } pos += p.length + 1; }
    const cy = (clause.match(YEAR_RE) || []).map(Number);
    if (cy.length === 1) return cy[0];
    const ago = yearsAgo(clause, articleYear);
    if (ago) return ago;
    if (isPast(clause) && articleYear) return articleYear - 1;
    const sy = (s.match(YEAR_RE) || []).map(Number);
    if (sy.length === 1 && !COMPARE.test(s)) return sy[0];
    return articleYear;
  }

  /* ---------- Zahlen mit Einheit ---------- */
  function numbers(s) {
    const out = [];
    let m;
    NUM_RE.lastIndex = 0;
    while ((m = NUM_RE.exec(s))) {
      const intPart = m[1], dec = m[2];
      let unit = m[3] || m[4] || "";
      const noun = m[5] && !MONTHS.test(m[5]) ? m[5] : "";
      const isYear = !dec && !unit && /^(19[89]\d|20[0-4]\d)$/.test(intPart);
      const isDate = /^\d{1,2}$/.test(intPart) && s[m.index + intPart.length] === ".";
      if (isYear || isDate || (!unit && !noun)) continue;
      if (!unit && intPart.length <= 2 && !dec && !noun) continue;
      let value = num(intPart + (dec ? "," + dec : ""));
      const u = /milliard|mrd/i.test(unit) ? "Mrd." : /million|mio/i.test(unit) ? "Mio." : /tausend/i.test(unit) ? "Tsd." : /prozentpunkt/i.test(unit) ? "Pp." : /prozent|%/i.test(unit) ? "%" : /euro|€/i.test(unit) ? "€" : "";
      const money = /euro|€/i.test(m[3] || "") || /euro|€/i.test(m[4] || "");
      out.push({ value, unit: u, money, noun, raw: m[0].trim(), index: m.index });
    }
    return out;
  }

  /* ---------- Festzelte ---------- */
  const GENERIC_TENT = /\b([A-ZÄÖÜ][\wäöüß'’]*(?:-[A-ZÄÖÜ]?[\wäöüß]+)*-(?:Festzelt|Zelt|Festhalle|Bierzelt|Schänke|Keller))\b|\b(?:Festzelt|Bierzelt|Festhalle)\s+(?:der\s+)?([A-ZÄÖÜ][\wäöüß'’-]+)|\b([A-ZÄÖÜ][\wäöüß'’]+\s(?:Keller|Festzelt|Festhalle|Bierzelt))\b/g;

  function tentsIn(sentence, wiesn) {
    const found = [];
    const low = sentence.toLowerCase();
    if (wiesn) {
      for (const t of RR.DEMO.tents) {
        const al = t.aliases.find((a) => low.includes(a));
        if (al) found.push({ name: t.name, pos: low.indexOf(al) });
      }
    }
    let m;
    GENERIC_TENT.lastIndex = 0;
    while ((m = GENERIC_TENT.exec(sentence))) {
      const name = (m[1] || m[2] || m[3]).trim();
      if (!found.some((f) => Math.abs(f.pos - m.index) < 4)) found.push({ name, pos: m.index });
    }
    return found;
  }

  /* ---------- Fakten pro Artikel ---------- */
  function extractFacts(a, sents, wiesn) {
    const text = a.text;
    const prices = [...text.matchAll(PRICE_RE)].map((m) => m[0]);
    const years = uniq((text.match(YEAR_RE) || []).map(Number)).sort();
    const percents = [...text.matchAll(PCT_RE)].map((m) => m[0]);
    const institutions = INSTITUTIONS.filter(([, re]) => re.test(text)).map(([n]) => n);
    const quotes = [...text.matchAll(QUOTE_RE)].map((m) => {
      const after = text.slice(m.index + m[0].length, m.index + m[0].length + 120);
      const sp = after.match(SPEAKER_AFTER);
      return { text: m[1].trim(), speaker: sp ? sp[1].trim() : null };
    });
    const tents = new Set();
    const datedPrices = [];
    for (const s of sents) {
      const ts = tentsIn(s.text, wiesn);
      ts.forEach((t) => tents.add(t.name));
      const ps = [...s.text.matchAll(PRICE_RE)];
      if (!ps.length) continue;
      for (const p of ps) {
        const year = yearAt(s.text, p.index, a.year);
        const before = ts.filter((t) => t.pos <= p.index).sort((x, y) => y.pos - x.pos)[0];
        datedPrices.push({ value: num(p[1]), year, tent: before ? before.name : null, sentence: s.text });
      }
    }
    return { prices, years, percents, institutions, quotes, tents: [...tents], datedPrices };
  }

  /* ---------- Story-Typ ---------- */
  function kwRe(k) {
    return new RegExp("(?:^|[^a-zäöüß])" + k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
  }

  // Gewichteter Treffer-Score pro Artikel: Häufigkeit (max. 3) × Gewicht, Treffer im Titel zählen doppelt extra.
  // Der Story-Typ mit dem höchsten Durchschnitt über alle Artikel gewinnt.
  const kwLabel = (k) => (typeof k === "string" ? k : ((k.source.replace(/\\[a-z]/gi, " ").match(/[a-zäöüß']{3,}/i) || ["Muster"])[0]));
  function kwGlobal(k) {
    return typeof k === "string"
      ? new RegExp("(?:^|[^a-zäöüß])" + k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi")
      : new RegExp(k.source, "gi");
  }

  function detectType(articles) {
    const ranked = RR.BLUEPRINTS.map((bp) => {
      const matched = new Set();
      const sums = articles.map((a) => {
        const title = a.text.split("\n")[0] || "";
        let sum = 0;
        for (const [k, w] of bp.keywords) {
          const n = Math.min(3, (a.text.match(kwGlobal(k)) || []).length);
          if (!n) continue;
          matched.add(kwLabel(k));
          sum += w * n + (kwGlobal(k).test(title) ? w * 2 : 0);
        }
        return sum;
      });
      const raw = sums.reduce((x, y) => x + y, 0) / Math.max(1, sums.length);
      return { bp, raw, score: Math.min(1, raw / 15), matched: [...matched] };
    }).sort((a, b) => b.raw - a.raw);
    return ranked;
  }

  function detectEvent(bp, articles) {
    const all = articles.map((a) => a.text).join("\n");
    const hit = (bp.events || []).find(([, re]) => re.test(all));
    return hit ? hit[0] : bp.short;
  }

  /* ---------- Belegstellen & Archivwerte ---------- */
  function collectEvidence(per, test) {
    const ev = [];
    for (const p of per) {
      for (const s of p.sents) {
        let ok = false;
        try { ok = typeof test === "function" ? test(s.text, p) : test.test(s.text); } catch (e) { ok = false; }
        if (ok) ev.push({ articleId: p.id, start: s.start, end: s.end, text: s.text, year: sentenceYear(s.text, p.year), ay: p.year, title: p.title });
      }
    }
    return ev;
  }

  // Zahlenwerte aus den Belegsätzen, auf die häufigste Einheit reduziert
  function archiveValues(evidence, filter) {
    const vals = [];
    for (const e of evidence) {
      for (const n of numbers(e.text)) {
        if (filter && !filter(n)) continue;
        vals.push({ ...n, year: e.ay !== undefined ? yearAt(e.text, n.index, e.ay) : e.year, sentence: e.text, title: e.title });
      }
    }
    if (!vals.length) return { unit: "", values: [] };
    const key = (n) => (n.money ? n.unit + "€" : n.unit) + "|" + (n.noun || "");
    const counts = {};
    vals.forEach((v) => (counts[key(v)] = (counts[key(v)] || 0) + 1));
    const best = Object.entries(counts).sort((a, b) => b[1] - a[1] || (b[0].split("|")[1] ? 1 : 0) - (a[0].split("|")[1] ? 1 : 0))[0][0];
    const values = vals.filter((v) => key(v) === best);
    const v0 = values[0];
    return { unit: unitLabel(v0), values };
  }

  function unitLabel(n) {
    if (!n) return "";
    const base = n.money ? (n.unit && n.unit !== "€" ? n.unit + " €" : "€") : n.unit;
    return [base, n.noun].filter(Boolean).join(" ");
  }

  /* ---------- Allgemeine Engine ---------- */
  const INSTITUTION_RE = /\b(Polizeipräsidium(?: [A-ZÄÖÜ][\wäöüß]+)?|Polizei|Landratsamt(?: [A-ZÄÖÜ][\wäöüß]+)?|Stadtrat|Stadtverwaltung|Kreistag|Landtag|Staatsregierung|Rathaus|[A-ZÄÖÜ][\wäöüß]*(?:ministerium|amt|präsidium|verband|referat|behörde|gericht|kammer|verwaltung|werke|klinikum|universität))\b/g;
  const ROLE_RE = /\b(Oberbürgermeister(?:in)?|Bürgermeister(?:in)?|Landrätin|Landrat|Minister(?:in)?|Ministerpräsident(?:in)?|Präsident(?:in)?|Sprecher(?:in)?|Leiter(?:in)?|Kämmerer|Kämmerin|Direktor(?:in)?|Vorsitzende[rn]?|Geschäftsführer(?:in)?|Experte|Expertin|Chef(?:in)?)\b/g;
  const POLITICAL = /bürgermeister|landr|minister|präsident/i;

  const FRAMES = [
    { id: "f_yoy", label: "Vergleich mit dem Vorjahr", re: /vorjahr|im vergleich|gestiegen|gesunken|rückgang|anstieg|mehr als|weniger als|zugelegt/i,
      item: { title: "Veränderung gegenüber {PREV} berechnen", category: "agent", action: "archive_compare", metric: true, why: "Der Vergleich mit früher ist in jedem Artikel." } },
    { id: "f_reason", label: "Begründung / Ursache", re: /begründ|wegen|aufgrund|ursache|grund dafür|zurückzuführen/i,
      item: { title: "Begründung der Entwicklung einholen", category: "approve", contact: "generic", channels: ["email", "call"],
        email: { subject: "Presseanfrage BR: Hintergründe {YEAR}", body: "Sehr geehrte Damen und Herren,\n\nwie erklären Sie die aktuelle Entwicklung im Vergleich zu {PREV}?\n\nMit freundlichen Grüßen\nBR-Redaktion" },
        call: { script: "Vorstellen, Aufzeichnung ankündigen und Zustimmung einholen.\nFrage: Was sind die Gründe für die Entwicklung?" }, why: "Ursachen werden jedes Mal erklärt." } },
    { id: "f_outlook", label: "Ausblick / Pläne", re: /künftig|geplant|soll |sollen |will |wollen |ab \d{4}|nächste[ns]? jahr/i,
      item: { title: "Pläne und Ausblick erfragen", category: "approve", contact: "generic", channels: ["email"],
        email: { subject: "Presseanfrage BR: Ausblick {YEAR}", body: "Sehr geehrte Damen und Herren,\n\nwelche Pläne gibt es für die kommenden Monate?\n\nMit freundlichen Grüßen\nBR-Redaktion" }, why: "Artikel enden oft mit einem Ausblick." } },
    { id: "f_critic", label: "Kritik", re: /kritik|kritisier|bemängel|warnt|empör|opposition/i,
      item: { title: "Kritische Stimme einholen", category: "human", questions: ["Was kritisieren Sie konkret?"], hint: "Gegenposition persönlich anfragen.", why: "Kritik gehört regelmäßig dazu." } },
    { id: "f_people", label: "Betroffene / Reaktionen", re: /besucher|bürger|anwohner|eltern|gäste|betroffene|kunden|fahrgäste|patient/i,
      item: { title: "Stimmen von Betroffenen", category: "human", questions: ["Was bedeutet das für Sie?"], hint: "Original-Reporting vor Ort.", why: "Betroffene kommen in den Artikeln zu Wort." } },
  ];

  function genericFeatures(per, n, topic) {
    const minHits = n >= 2 ? 2 : 1;
    const feats = [];

    // 1. Kennzahlen: Nomen hinter Zahlen (z. B. "6,5 Millionen Besucher") oder Geldbeträge
    const metricArticles = {};
    for (const p of per) {
      for (const s of p.sents) {
        for (const x of numbers(s.text)) {
          const k = x.noun || (x.money ? "Euro-Beträge" : x.unit === "%" ? "Prozentwerte" : "");
          if (!k) continue;
          (metricArticles[k] = metricArticles[k] || new Set()).add(p.id);
        }
      }
    }
    Object.entries(metricArticles)
      .filter(([, set]) => set.size >= minHits)
      .sort((a, b) => b[1].size - a[1].size)
      .slice(0, 4)
      .forEach(([k]) => {
        const name = k === "Euro-Beträge" ? `Preis ${topic}` : k === "Prozentwerte" ? `Anteil / Quote` : k;
        const test = (s) => numbers(s).some((x) => (x.noun || (x.money ? "Euro-Beträge" : x.unit === "%" ? "Prozentwerte" : "")) === k);
        feats.push({
          id: "m_" + k, label: "Kennzahl: " + name, match: test,
          valueFilter: (x) => (x.noun || (x.money ? "Euro-Beträge" : x.unit === "%" ? "Prozentwerte" : "")) === k,
          item: { title: `Aktueller Wert: ${name} ({YEAR})`, category: "agent", action: "metric_lookup", metric: true, source: { label: "Offizielle Quelle (im KI-Modus per Websuche)" }, why: `„${name}“ wird in mehreren Artikeln beziffert.` },
        });
      });

    // 2. Institutionen → Stellungnahme
    const inst = {};
    for (const p of per) for (const m of p.text.matchAll(INSTITUTION_RE)) (inst[m[1]] = inst[m[1]] || new Set()).add(p.id);
    Object.entries(inst)
      .filter(([, set]) => set.size >= minHits)
      .sort((a, b) => b[1].size - a[1].size)
      .slice(0, 3)
      .forEach(([name]) => {
        const re = new RegExp(name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
        feats.push({
          id: "i_" + name, label: "Institution: " + name, match: re,
          item: { title: `Stellungnahme: ${name}`, category: "approve", contact: "generic", contactOrg: name + " – Pressestelle", channels: ["email", "call"],
            email: { subject: "Presseanfrage BR: aktuelle Angaben {YEAR}", body: `Sehr geehrte Damen und Herren,\n\nfür unsere Berichterstattung bitten wir die Pressestelle (${name}) um aktuelle Angaben für {YEAR} sowie die Vergleichswerte aus {PREV}.\n\nMit freundlichen Grüßen\nBR-Redaktion` },
            call: { script: `Vorstellen, Aufzeichnung ankündigen und Zustimmung einholen.\nBitte um aktuelle Zahlen und eine Einordnung (${name}).` },
            why: `${name} kommt in mehreren Artikeln vor.` },
        });
      });

    // 3. Rollen (wer wird zitiert?)
    const roles = {};
    for (const p of per) for (const m of p.text.matchAll(ROLE_RE)) {
      const r = m[1].replace(/in$/, "").replace(/(Kämmer)in$/, "$1er");
      (roles[r] = roles[r] || new Set()).add(p.id);
    }
    Object.entries(roles)
      .filter(([, set]) => set.size >= minHits)
      .sort((a, b) => b[1].size - a[1].size)
      .slice(0, 2)
      .forEach(([role]) => {
        const re = new RegExp(role.slice(0, Math.max(5, role.length - 2)), "i");
        const pol = POLITICAL.test(role);
        feats.push({
          id: "r_" + role, label: "Stimme: " + role + ":in", match: re,
          item: pol
            ? { title: `Zitat ${role}:in`, category: "human", questions: ["Wie bewerten Sie die Entwicklung?"], hint: "Politische Stimme – persönlich anfragen.", why: `${role}:in wird regelmäßig zitiert.` }
            : { title: `O-Ton ${role}:in`, category: "approve", contact: "generic", contactOrg: role + ":in", channels: ["call"], call: { script: "Vorstellen, Aufzeichnung ankündigen und Zustimmung einholen.\nFrage: Wie bewerten Sie die aktuelle Entwicklung?" }, why: `${role}:in wird regelmäßig zitiert.` },
        });
      });

    // 4. Erzählmuster
    FRAMES.forEach((f) => feats.push({ id: f.id, label: f.label, match: f.re, item: f.item }));
    return feats;
  }

  // Thema für unbekannte Geschichten: häufigstes großgeschriebenes Wort, das in allen Artikeln vorkommt
  const STOP = /^(Der|Die|Das|Den|Dem|Des|Ein|Eine|Einer|Im|In|Am|An|Auf|Mit|Für|Bei|Nach|Vor|Seit|Wie|Was|Wer|Auch|Doch|Und|Oder|Aber|Euro|Prozent|Millionen|Milliarden|Jahr|Jahren|Vorjahr|Stadt|Zeit|Ende|Anfang|Woche|Tag|Tage|Mehr|Rund|Sie|Er|Es|Wir|Ich|Man|Laut|Zudem|Dabei|Damit|Dafür|Diese|Dieser|Dieses|So|Bis|Ab|Um)$/;
  function guessTopic(per) {
    const counts = {};
    for (const p of per) {
      const seen = new Set((p.text.match(/\b[A-ZÄÖÜ][a-zäöüß]{4,}\b/g) || []).filter((w) => !STOP.test(w)));
      seen.forEach((w) => (counts[w] = (counts[w] || 0) + 1));
    }
    const all = per.map((p) => p.text).join(" ");
    const best = Object.entries(counts).sort((a, b) => b[1] - a[1] || all.split(b[0]).length - all.split(a[0]).length)[0];
    return best ? best[0] : "Thema";
  }

  /* ---------- Hauptfunktion ---------- */
  // opts.force: Story-Typ erzwingen (id eines Blueprints oder "generic")
  function analyze(articles, opts = {}) {
    const ranked = detectType(articles);
    let top = ranked[0];
    let bp = top && top.score >= 0.45 ? top.bp : null;
    if (opts.force === "generic") bp = null;
    else if (opts.force) { top = ranked.find((r) => r.bp.id === opts.force) || top; bp = top.bp; }
    const event = bp ? detectEvent(bp, articles) : null;
    const wiesn = event === "Oktoberfest";

    const per = articles.map((a) => {
      const sents = sentences(a.text);
      return { id: a.id, title: a.title, year: a.year, text: a.text, sents, facts: extractFacts(a, sents, wiesn) };
    });

    const n = articles.length;
    const threshold = n >= 2 ? 2 : 1;
    const topic = bp ? null : guessTopic(per);
    const features = bp ? bp.features : genericFeatures(per, n, topic);

    const toPattern = (f) => {
      const evidence = collectEvidence(per, f.match);
      const hits = uniq(evidence.map((e) => e.articleId)).length;
      const item = f.item;
      const vals = item.metric ? archiveValues(evidence, f.valueFilter) : { unit: "", values: [] };
      return { id: f.id, label: f.label, hits, recurring: hits >= threshold, evidence, values: vals.values, unit: vals.unit, item };
    };
    const patterns = features.map(toPattern);
    // Standard-Elemente einer bekannten Vorlage, die nur einmal belegt sind, trotzdem vorschlagen
    if (bp) patterns.forEach((p) => { p.suggested = !p.recurring && p.hits >= 1; });

    // Bekannter Typ: zusätzlich entdeckte Elemente aus den Artikeln, die die Vorlage noch nicht abdeckt
    if (bp) {
      const covered = new Set(patterns.filter((p) => p.recurring).flatMap((p) => p.evidence.map((e) => e.articleId + ":" + e.start)));
      genericFeatures(per, n, event)
        .map(toPattern)
        .filter((p) => p.recurring && p.evidence.length)
        .filter((p) => p.evidence.filter((e) => covered.has(e.articleId + ":" + e.start)).length / p.evidence.length < 0.6)
        .slice(0, 4)
        .forEach((p) => patterns.push({ ...p, id: "x_" + p.id, discovered: true }));
    }

    // Zeitreihe für das Diagramm
    let timeline = { label: "", unit: "", points: [] };
    const tentPrices = [];
    if (bp && bp.id === "volksfest-bierpreis") {
      const notBeer = /wasser|spezi|limo|hendl|alkoholfrei|softdrink|brezn/i;
      const byYear = {};
      for (const p of per) {
        for (const dp of p.facts.datedPrices) {
          if (!dp.year || dp.value < 4 || dp.value > 30 || notBeer.test(dp.sentence)) continue;
          const y = (byYear[dp.year] = byYear[dp.year] || { year: dp.year, min: Infinity, max: -Infinity, sources: [] });
          y.min = Math.min(y.min, dp.value);
          y.max = Math.max(y.max, dp.value);
          if (!y.sources.includes(p.title)) y.sources.push(p.title);
          if (dp.tent) tentPrices.push({ tent: dp.tent, year: dp.year, value: dp.value, article: p.title });
        }
      }
      timeline = { label: "Maßpreis", unit: "€", points: Object.values(byYear).sort((a, b) => a.year - b.year) };
    } else {
      const metric = patterns.find((p) => p.recurring && p.values.length >= 2) || patterns.find((p) => p.values.length >= 2);
      if (metric) {
        const byYear = {};
        metric.values.forEach((v) => {
          if (!v.year) return;
          const y = (byYear[v.year] = byYear[v.year] || { year: v.year, min: Infinity, max: -Infinity, sources: [] });
          y.min = Math.min(y.min, v.value);
          y.max = Math.max(y.max, v.value);
          if (!y.sources.includes(v.title)) y.sources.push(v.title);
        });
        timeline = { label: metric.label.replace(/^Kennzahl: /, ""), unit: metric.unit, points: Object.values(byYear).sort((a, b) => a.year - b.year) };
      }
    }

    const latestYear = Math.max(0, ...articles.map((a) => a.year || 0));
    const nowYear = new Date().getFullYear();
    const targetYear = latestYear && latestYear < nowYear ? nowYear : latestYear ? latestYear + 1 : nowYear;

    const type = bp
      ? { id: bp.id, label: bp.label, short: bp.short, event, score: top.score, matched: top.matched, fallback: false,
          description: `Bekannter Story-Typ. Erkannt an: ${top.matched.slice(0, 6).join(", ")}.` }
      : { id: "generic", label: `Wiederkehrend: ${topic}`, short: topic, event: topic, score: top ? top.score : 0, matched: [], fallback: true,
          description: "Kein bekannter Story-Typ – der Blueprint wurde aus wiederkehrenden Kennzahlen, Institutionen, Stimmen und Erzählmustern gebaut." };

    return {
      engine: "offline",
      type,
      alternatives: ranked.slice(0, 3).map((r) => ({ id: r.bp.id, label: r.bp.label, score: r.score, raw: r.raw })),
      per: per.map(({ text, sents, ...rest }) => rest),
      patterns,
      threshold,
      timeline,
      tentPrices,
      targetYear,
      wiesn,
    };
  }

  RR.analyze = analyze;
  RR.text = { sentences, numbers, unitLabel };
  RR.archiveValues = archiveValues;
  RR.getBlueprint = (id) => RR.BLUEPRINTS.find((b) => b.id === id) || null;
})();
