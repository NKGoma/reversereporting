/*
 * Lokale KI: Gemma über Ollama auf diesem Gerät (http://localhost:11434).
 * - Nichts verlässt den Rechner; die Content-Security-Policy erlaubt nur localhost.
 * - Strukturierte Ausgaben per JSON-Schema (Ollama "format"), Streaming für Fortschritt.
 * - Zitate von Gemma werden im Originaltext gesucht; was dort nicht steht, wird verworfen.
 * - Antworten landen im lokalen Cache (IndexedDB): dieselbe Anfrage ist beim zweiten Mal sofort da.
 * Ohne laufendes Ollama arbeitet die Regel-Engine allein.
 */
(function () {
  const RR = (window.RR = window.RR || {});

  const CFG_KEY = "rr-llm-v1";
  const PREFERRED = "gemma3:27b";
  const DEF = { host: "http://127.0.0.1:11434", model: "", ctx: 32768, temp: 0.2 };
  const LOCAL_HOST = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;

  let cfg = { ...DEF };
  try { cfg = { ...DEF, ...JSON.parse(localStorage.getItem(CFG_KEY) || "{}") }; } catch (e) { /* Standard */ }
  if (!LOCAL_HOST.test(cfg.host)) cfg.host = DEF.host;

  // status: unknown | checking | ok | down | nomodel
  const state = { status: "unknown", models: [], model: "", error: "" };
  const listeners = new Set();
  const emit = () => listeners.forEach((fn) => { try { fn(state); } catch (e) { /* ignorieren */ } });
  const active = new Set(); // laufende Anfragen (zum Abbrechen)
  let warm = false; // erste Antwort dieser Sitzung da? Vorher lädt Ollama meist noch das Modell

  function setConfig(next) {
    const host = String(next.host || cfg.host).trim().replace(/\/+$/, "");
    if (!LOCAL_HOST.test(host)) throw new Error("Nur lokale Adressen sind erlaubt (http://localhost:… oder http://127.0.0.1:…).");
    cfg = { ...cfg, ...next, host, ctx: Math.max(4096, Math.min(131072, Number(next.ctx || cfg.ctx) || DEF.ctx)), temp: Math.max(0, Math.min(1, Number(next.temp ?? cfg.temp))) };
    try { localStorage.setItem(CFG_KEY, JSON.stringify(cfg)); } catch (e) { /* ignorieren */ }
  }

  function pickModel(names) {
    if (cfg.model && names.includes(cfg.model)) return cfg.model;
    return names.find((n) => n === PREFERRED || n === PREFERRED + ":latest")
      || names.find((n) => n.startsWith(PREFERRED))
      || names.find((n) => /^gemma3/.test(n))
      || "";
  }

  async function check() {
    state.status = "checking";
    emit();
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 3000);
    try {
      const r = await fetch(cfg.host + "/api/tags", { signal: ctl.signal });
      if (r.status === 403) throw new Error("Ollama lehnt diese Seite ab (Herkunft). Bitte die App über start.command öffnen (http://localhost:8080).");
      if (!r.ok) throw new Error("HTTP " + r.status);
      const j = await r.json();
      state.models = (j.models || []).map((m) => ({ name: m.name, size: m.size, params: (m.details && m.details.parameter_size) || "" }));
      state.model = pickModel(state.models.map((m) => m.name));
      state.status = state.model ? "ok" : "nomodel";
      state.error = "";
    } catch (e) {
      state.status = "down";
      state.models = [];
      state.model = "";
      state.error = e && e.name === "AbortError" ? "Zeitüberschreitung" : (e && e.message) || String(e);
    } finally {
      clearTimeout(timer);
    }
    emit();
    return state;
  }

  const ready = () => state.status === "ok";
  const statusText = () => ({
    ok: `Gemma bereit (${state.model})`,
    checking: "Prüfe Ollama …",
    down: "Ollama läuft nicht",
    nomodel: "Modell fehlt",
    unknown: "Lokale KI",
  }[state.status]);

  /* ---------- Hilfen ---------- */
  // schneller Text-Hash für Cache-Schlüssel (zwei FNV-1a-Durchläufe)
  function hash(str) {
    let a = 2166136261, b = 5381;
    for (let i = 0; i < str.length; i++) {
      const c = str.charCodeAt(i);
      a = Math.imul(a ^ c, 16777619);
      b = Math.imul(b ^ c, 33) + i;
    }
    return (a >>> 0).toString(16).padStart(8, "0") + (b >>> 0).toString(16).padStart(8, "0") + str.length.toString(16);
  }

  function parseJson(text) {
    try { return JSON.parse(text); } catch (e) { /* weiter */ }
    const m = text.match(/\{[\s\S]*\}/);
    if (m) { try { return JSON.parse(m[0]); } catch (e) { /* weiter */ } }
    return null;
  }

  const abortError = () => Object.assign(new Error("Abgebrochen."), { name: "AbortError" });

  /* ---------- Anfrage an Ollama (/api/chat, gestreamt) ---------- */
  async function chat({ system, user, schema, onProgress, numPredict = 4096, useCache = true }) {
    if (!ready()) await check();
    if (!ready()) throw new Error(state.status === "nomodel" ? `Modell fehlt – im Terminal: ollama pull ${PREFERRED}` : "Ollama läuft nicht – im Terminal: ollama serve");
    const body = {
      model: state.model,
      messages: [{ role: "system", content: system }, { role: "user", content: user }],
      format: schema,
      stream: true,
      keep_alive: "30m",
      options: { num_ctx: cfg.ctx, temperature: cfg.temp, num_predict: numPredict },
    };
    const key = "chat:" + hash(JSON.stringify([body.model, body.messages, body.format, body.options]));
    if (useCache) {
      const hit = await RR.store.get("cache", key);
      if (hit) { if (onProgress) onProgress({ phase: "done", cached: true, tokens: 0 }); return hit; }
    }

    const ctl = new AbortController();
    active.add(ctl);
    const t0 = performance.now();
    let text = "", tokens = 0, final = null, tFirst = null;
    const report = (phase) => {
      if (!onProgress) return;
      const secs = tFirst ? (performance.now() - tFirst) / 1000 : 0;
      onProgress({ phase, tokens, tps: secs > 0.5 ? tokens / secs : 0, elapsed: (performance.now() - t0) / 1000, text, loading: !warm });
    };
    // bis zum ersten Token kommt nichts aus dem Stream (Modell laden, Text lesen): Sekunden trotzdem weiterzählen
    const tick = onProgress ? setInterval(() => { if (!tFirst) report("prompt"); }, 1000) : null;
    try {
      if (onProgress) report("prompt");
      // ohne Content-Type-Header: einfache Anfrage ohne CORS-Vorabprüfung; Ollama liest den Body trotzdem als JSON
      const r = await fetch(cfg.host + "/api/chat", { method: "POST", body: JSON.stringify(body), signal: ctl.signal });
      if (!r.ok) {
        let msg = "HTTP " + r.status;
        try { const j = await r.json(); if (j.error) msg = j.error; } catch (e) { /* ignorieren */ }
        if (r.status === 403) msg += " – Ollama lehnt diese Herkunft ab. Bitte die App über start.command (http://localhost:8080) öffnen.";
        throw new Error(msg);
      }
      const reader = r.body.getReader();
      const dec = new TextDecoder();
      let buf = "", lastReport = 0;
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        let nl;
        while ((nl = buf.indexOf("\n")) >= 0) {
          const line = buf.slice(0, nl).trim();
          buf = buf.slice(nl + 1);
          if (!line) continue;
          const j = JSON.parse(line);
          if (j.error) throw new Error(j.error);
          if (j.message && j.message.content) {
            if (!tFirst) tFirst = performance.now();
            text += j.message.content;
            tokens++;
          }
          if (j.done) final = j;
        }
        if (performance.now() - lastReport > 150) { lastReport = performance.now(); report("gen"); }
      }
    } catch (e) {
      if (ctl.signal.aborted) throw abortError();
      if (e instanceof TypeError) throw new Error("Keine Verbindung zu Ollama (" + cfg.host + ").");
      throw e;
    } finally {
      active.delete(ctl);
      if (tick) clearInterval(tick);
    }
    warm = true;
    if (final && final.eval_count) tokens = final.eval_count;
    report("done");

    let out = parseJson(text);
    if (!out && final && final.done_reason === "length" && numPredict < 16000) {
      // abgeschnitten: einmal mit mehr Platz wiederholen
      return chat({ system, user, schema, onProgress, numPredict: numPredict * 2, useCache });
    }
    if (!out) throw new Error("Gemma hat kein gültiges JSON geliefert.");
    const meta = { model: state.model, tokens, seconds: Math.round((performance.now() - t0) / 100) / 10, promptTokens: final ? final.prompt_eval_count || 0 : 0, tps: final && final.eval_duration ? Math.round((final.eval_count / (final.eval_duration / 1e9)) * 10) / 10 : 0 };
    const result = { data: out, meta };
    if (useCache) await RR.store.put("cache", key, result);
    return result;
  }

  function cancel() {
    active.forEach((c) => c.abort());
    active.clear();
  }
  const busy = () => active.size > 0;

  /* ---------- Zitate prüfen: nur, was wirklich im Text steht ---------- */
  const words = (s) => (s.toLowerCase().match(/[a-zäöüß0-9]{4,}/g) || []);
  const norm = (s) => s.replace(/[„“”"«»‚‘’']/g, '"').replace(/\s+/g, " ").trim();
  function locate(article, quote) {
    if (!quote || !article) return null;
    const t = article.text;
    const sents = RR.text.sentences(t);
    const at = (i) => sents.find((x) => x.start <= i && x.end > i) || null;
    let i = t.indexOf(quote);
    if (i < 0 && quote.length > 40) i = t.indexOf(quote.slice(0, 40));
    if (i >= 0) return at(i) || { start: i, end: i + quote.length, text: quote };
    // gleiche Wörter in anderer Typografie (Anführungszeichen, Leerzeichen)
    const nq = norm(quote);
    const hit = sents.find((s) => norm(s.text).includes(nq) || (nq.length > 40 && norm(s.text).includes(nq.slice(0, 40))));
    if (hit) return hit;
    // sonst: ein Satz, der fast alle Wörter des Zitats enthält (Gemma kürzt manchmal)
    const qw = new Set(words(quote));
    if (qw.size < 3) return null;
    let best = null, score = 0;
    for (const s of sents) {
      const w = new Set(words(s.text));
      const n = [...qw].filter((x) => w.has(x)).length;
      if (n > score) { score = n; best = s; }
    }
    return score >= 3 && score / qw.size >= 0.75 ? best : null;
  }

  // Zitat zuerst im genannten Artikel suchen, dann in allen anderen
  // (lokale Modelle verzählen sich bei der Artikelnummer gern um eins)
  function locateAny(list, n, quote) {
    const first = list[(n || 1) - 1];
    const order = first ? [first, ...list.filter((a) => a !== first)] : list;
    for (const a of order) { const s = locate(a, quote); if (s) return { a, s }; }
    return null;
  }

  // amtliche Zahlen als bekannte Fakten (letzte fünf Jahrgänge)
  function factsText(an) {
    const list = (an.datasets || []).map((id) => RR.facts && RR.facts.get(id)).filter(Boolean);
    return list.map((d) => {
      const rows = d.rows.slice(-5).map((r) => `${r.jahr}: ` + Object.keys(d.columns).filter((c) => r[c] != null).map((c) => `${d.columns[c].label} ${RR.facts.fmt(d, c, r[c])}`).join(", "));
      return `<amtliche_daten quelle="${d.publisher} – ${d.title}">\n${rows.join("\n")}\n</amtliche_daten>`;
    }).join("\n");
  }

  // Artikel kürzen, damit alles ins Kontextfenster passt (≈ 3 Zeichen pro Token, Reserve für die Antwort)
  function fit(articles, reserveTokens) {
    const budget = Math.max(6000, (cfg.ctx - reserveTokens) * 3);
    const per = Math.floor(budget / Math.max(1, articles.length));
    let cut = 0;
    const texts = articles.map((a) => {
      if (a.text.length <= per) return a.text;
      cut++;
      const s = a.text.slice(0, per);
      const end = Math.max(s.lastIndexOf(". "), s.lastIndexOf(".\n"));
      return (end > per * 0.6 ? s.slice(0, end + 1) : s) + " […]";
    });
    return { texts, cut };
  }

  /* ---------- 1. Blueprint aus Artikeln ---------- */
  const BLUEPRINT_SCHEMA = {
    type: "object",
    required: ["story_type", "event", "description", "target_year", "items"],
    properties: {
      story_type: { type: "string" },
      event: { type: "string" },
      description: { type: "string" },
      target_year: { type: "integer" },
      items: {
        type: "array",
        items: {
          type: "object",
          required: ["title", "category", "rationale", "evidence", "source_hint", "contact", "email_subject", "email_body", "call_script", "questions"],
          properties: {
            title: { type: "string" },
            category: { type: "string", enum: ["agent", "approve", "human"] },
            rationale: { type: "string" },
            evidence: { type: "array", items: { type: "object", required: ["article", "quote"], properties: { article: { type: "integer" }, quote: { type: "string" } } } },
            source_hint: { type: "string" },
            contact: { type: "string" },
            email_subject: { type: "string" },
            email_body: { type: "string" },
            call_script: { type: "string" },
            questions: { type: "array", items: { type: "string" } },
          },
        },
      },
    },
  };

  const BLUEPRINT_SYSTEM = `Du arbeitest als Recherche-Planer:in in der Redaktion des Bayerischen Rundfunks.
Du bekommst frühere Artikel zu einer wiederkehrenden Geschichte. Finde heraus, welche Bausteine jede Ausgabe dieser Geschichte enthält, und leite daraus eine Recherche-Checkliste für die nächste Ausgabe ab.

Für jeden Punkt:
- title: kurze, konkrete Aufgabe (z. B. "Maßpreis in allen Festzelten 2026").
- category:
  "agent" = ein Agent kann es selbst erledigen: aus dem Archiv, aus mitgelieferten Datentabellen oder aus öffentlichen Listen und Statistiken.
  "approve" = braucht eine Anfrage an eine Pressestelle oder Institution; der Agent bereitet E-Mail und Anrufleitfaden vor, die Journalistin gibt frei.
  "human" = braucht eigenes Reporting, Urteil oder persönliche Kontakte (politische Zitate, Stimmen vor Ort, Einordnung).
- rationale: ein Satz, warum der Punkt dazugehört.
- evidence: 1–3 kurze Zitate (höchstens 200 Zeichen), WÖRTLICH aus den Artikeln kopiert; article = Nummer des Artikels. Keine Zitate erfinden oder umformulieren.
- source_hint: wo der Wert zu finden ist (agent) bzw. wen man fragt.
- contact: Institution oder Rolle für approve/human, sonst leer.
- email_subject, email_body: für approve eine sachliche Presseanfrage auf Deutsch, sonst leer.
- call_script: für approve ein kurzer Gesprächsleitfaden (Aufzeichnung ankündigen und Zustimmung einholen), sonst leer.
- questions: für human 1–3 Fragen, sonst leer.
Erstelle 6–12 Punkte. target_year ist das Jahr der nächsten Ausgabe. Antworte auf Deutsch und nur mit JSON.`;

  async function analyze(articles, onProgress) {
    const offline = RR.analyze(articles);
    const facts = factsText(offline);
    const { texts, cut } = fit(articles, 7000 + facts.length / 3);
    const content = (facts ? facts + "\n\n" : "") + articles.map((a, i) => `<artikel nummer="${i + 1}" jahr="${a.year || "?"}" titel="${(a.title || "").replace(/"/g, "'")}">\n${texts[i]}\n</artikel>`).join("\n\n");
    const { data: bp, meta } = await chat({
      system: BLUEPRINT_SYSTEM,
      user: `Hier sind ${articles.length} frühere Artikel:\n\n${content}\n\nDie nächste Ausgabe ist ${offline.targetYear}.`,
      schema: BLUEPRINT_SCHEMA,
      numPredict: 6000,
      onProgress,
    });
    let dropped = 0;
    const patterns = (bp.items || []).filter((it) => it && it.title).map((it, idx) => {
      const cat = ["agent", "approve", "human"].includes(it.category) ? it.category : "human";
      const evidence = [];
      for (const ev of it.evidence || []) {
        const hit = locateAny(articles, ev.article, ev.quote || "");
        const a = hit && hit.a, s = hit && hit.s;
        if (hit && !evidence.some((e) => e.articleId === a.id && e.start === s.start)) evidence.push({ articleId: a.id, start: s.start, end: s.end, text: s.text, year: RR.text.sentenceYear(s.text, a.year), ay: a.year, title: a.title });
        else if (!hit) dropped++;
      }
      const vals = cat === "agent" ? RR.archiveValues(evidence) : { unit: "", values: [] };
      const item = {
        title: it.title,
        category: cat,
        action: cat === "agent" ? "lookup" : null,
        metric: cat === "agent",
        source: { label: it.source_hint || "Archiv und Datentabellen" },
        contact: "generic",
        contactOrg: it.contact || "",
        channels: cat === "approve" ? ["email", it.call_script ? "call" : null].filter(Boolean) : [],
        email: it.email_body ? { subject: it.email_subject || it.title, body: it.email_body } : null,
        call: it.call_script ? { script: it.call_script } : null,
        questions: (it.questions || []).filter(Boolean),
        hint: cat === "human" ? it.rationale : "",
        why: it.rationale,
      };
      return { id: "ai_" + idx, label: it.title, hits: new Set(evidence.map((e) => e.articleId)).size, recurring: true, evidence, values: vals.values, unit: vals.unit, item };
    });
    if (!patterns.length) throw new Error("Gemma hat keine Checkliste geliefert.");
    return {
      ...offline,
      engine: "ai",
      llm: { ...meta, truncated: cut, dropped },
      type: { id: "ai", label: bp.story_type || offline.type.label, short: bp.event || bp.story_type || offline.type.short, event: bp.event || offline.type.event, score: 1, matched: [], fallback: false, description: bp.description },
      patterns,
      targetYear: offline.targetYear,
      offlineType: offline.type,
    };
  }

  /* ---------- 2. Themenarchiv: Story-Typ vertiefen ---------- */
  const TYPE_SCHEMA = {
    type: "object",
    required: ["label", "description", "aspects", "sources", "reporter"],
    properties: {
      label: { type: "string" },
      description: { type: "string" },
      aspects: { type: "array", items: { type: "object", required: ["label", "article", "quote"], properties: { label: { type: "string" }, article: { type: "integer" }, quote: { type: "string" } } } },
      sources: { type: "array", items: { type: "string" } },
      reporter: { type: "array", items: { type: "string" } },
    },
  };
  const TYPE_SYSTEM = `Du analysierst ein Redaktionsarchiv des Bayerischen Rundfunks. Du bekommst Beispiele EINES Story-Typs, der zu einem wiederkehrenden Ereignis jedes Mal erscheint.
- label: kurzer redaktioneller Name des Story-Typs (2–4 Wörter, Deutsch), z. B. "Tischreservierungen" oder "Wiesn-Plakat".
- description: ein Satz, worum es in diesen Geschichten geht.
- aspects: 3–7 Aspekte, die in (fast) allen Beispielen vorkommen (z. B. "Preis pro Maß", "Vergleich zum Vorjahr", "Stimme der Wirte"). Zu jedem Aspekt ein kurzes Zitat (höchstens 160 Zeichen), WÖRTLICH aus einem Beispiel kopiert; article = Nummer des Beispiels. Nichts erfinden.
- sources: typische Quellen und Ansprechpartner (Institutionen oder Rollen, keine Personennamen).
- reporter: 1–3 Dinge, die nur die Reporterin / der Reporter selbst erledigen kann.
Antworte auf Deutsch und nur mit JSON.`;

  const lead = (text, n) => {
    if (text.length <= n) return text;
    const s = text.slice(0, n);
    const end = s.lastIndexOf(". ");
    return (end > n * 0.5 ? s.slice(0, end + 1) : s) + " […]";
  };

  async function enrichType(type, articles, eventLabel, onProgress) {
    // Stichprobe: bis zu sechs Artikel, möglichst aus verschiedenen Jahren, neueste zuerst
    const byYear = {};
    articles.slice().sort((a, b) => (b.date || "").localeCompare(a.date || "")).forEach((a) => (byYear[a.year] = byYear[a.year] || []).push(a));
    const sample = [];
    const lists = Object.values(byYear);
    for (let i = 0; sample.length < 6 && lists.some((l) => l[i]); i++) lists.forEach((l) => { if (l[i] && sample.length < 6) sample.push(l[i]); });
    const user = `Ereignis: ${eventLabel}\nBisheriger Arbeitstitel: ${type.label}\n\n` + sample.map((a, i) => `<beispiel nummer="${i + 1}" datum="${a.date || a.year || "?"}">\nTitel: ${a.title}\n${lead(a.text, 800)}\n</beispiel>`).join("\n\n");
    const { data, meta } = await chat({ system: TYPE_SYSTEM, user, schema: TYPE_SCHEMA, numPredict: 1500, onProgress });
    let dropped = 0;
    const aspects = (data.aspects || []).filter((x) => x && x.label).map((x) => {
      const hit = locateAny(sample, x.article, x.quote || "");
      const a = hit && hit.a, s = hit && hit.s;
      if (!s) dropped++;
      return { label: x.label, quote: s ? s.text : null, title: s ? a.title : null, date: s ? a.date : null };
    });
    return {
      label: (data.label || "").trim() || type.label,
      description: data.description || "",
      aspects,
      sources: (data.sources || []).filter(Boolean).slice(0, 6),
      reporter: (data.reporter || []).filter(Boolean).slice(0, 3),
      sample: sample.length,
      dropped,
      meta,
    };
  }

  /* ---------- 3. Einzelstücke bekannten Story-Typen zuordnen (nur Titel) ---------- */
  async function classifyTitles(items, types, eventLabel, onProgress) {
    const ids = [...types.map((t) => t.id), "keiner"];
    const schema = { type: "object", required: ["assign"], properties: { assign: { type: "array", items: { type: "object", required: ["n", "type"], properties: { n: { type: "integer" }, type: { type: "string", enum: ids } } } } } };
    const system = `Ordne Überschriften aus einem Nachrichtenarchiv zum Ereignis "${eventLabel}" bekannten Story-Typen zu. Nutze "keiner", wenn kein Typ eindeutig passt. Antworte nur mit JSON.`;
    const out = {};
    for (let i = 0; i < items.length; i += 40) {
      const chunk = items.slice(i, i + 40);
      const user = "Story-Typen:\n" + types.map((t) => `- ${t.id}: ${t.label}`).join("\n") + "\n\nÜberschriften:\n" + chunk.map((x, k) => `${k + 1}. ${x.title}`).join("\n");
      const { data } = await chat({ system, user, schema, numPredict: 1500, onProgress });
      (data.assign || []).forEach((x) => { const it = chunk[(x.n || 0) - 1]; if (it && x.type && x.type !== "keiner" && ids.includes(x.type)) out[it.id] = x.type; });
    }
    return out;
  }

  RR.ai = {
    PREFERRED,
    get MODEL() { return state.model || PREFERRED; },
    get config() { return { ...cfg }; },
    state,
    setConfig, check, ready, hasKey: ready, statusText,
    onStatus: (fn) => listeners.add(fn),
    chat, cancel, busy, locate,
    analyze, enrichType, classifyTitles,
    clearCache: () => RR.store.clear("cache"),
    cacheSize: () => RR.store.count("cache"),
  };
})();
