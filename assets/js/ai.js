/*
 * KI-Modus (optional): echte Analyse und Websuche mit Claude.
 * - Der API-Key bleibt im Browser (nur im Speicher; "merken" legt ihn in localStorage).
 * - Anfragen gehen direkt vom Browser an api.anthropic.com.
 * - Ohne Key oder bei Fehlern greift die Offline-Engine.
 */
(function () {
  const RR = (window.RR = window.RR || {});

  const SDK_URL = "https://cdn.jsdelivr.net/npm/@anthropic-ai/sdk@0.132.0/+esm";
  const MODEL = "claude-opus-5-5";
  const KEY_STORE = "rr-api-key";

  let apiKey = "";
  try { apiKey = localStorage.getItem(KEY_STORE) || ""; } catch (e) { /* kein Speicher */ }
  let sdk = null;

  function setKey(k, remember) {
    apiKey = (k || "").trim();
    try {
      if (remember && apiKey) localStorage.setItem(KEY_STORE, apiKey);
      else localStorage.removeItem(KEY_STORE);
    } catch (e) { /* ignorieren */ }
  }
  const hasKey = () => !!apiKey;
  const remembered = () => { try { return !!localStorage.getItem(KEY_STORE); } catch (e) { return false; } };

  async function client() {
    if (!sdk) {
      try { sdk = await import(SDK_URL); } catch (e) { throw new Error("Das Claude-SDK konnte nicht geladen werden (offline oder blockiert)."); }
    }
    const Anthropic = sdk.default || sdk.Anthropic;
    return { Anthropic, c: new Anthropic({ apiKey, dangerouslyAllowBrowser: true, maxRetries: 2 }) };
  }

  function explain(err, Anthropic) {
    if (Anthropic) {
      if (err instanceof Anthropic.AuthenticationError) return "Der API-Key ist ungültig.";
      if (err instanceof Anthropic.PermissionDeniedError) return "Dieser API-Key hat keinen Zugriff auf das Modell.";
      if (err instanceof Anthropic.RateLimitError) return "Zu viele Anfragen – bitte kurz warten und erneut versuchen.";
      if (err instanceof Anthropic.APIConnectionError) return "Keine Verbindung zur Claude-API. In der eingebetteten Vorschau sind externe Verbindungen blockiert – nutze die GitHub-Pages-Version.";
      if (err instanceof Anthropic.BadRequestError) return "Anfrage abgelehnt: " + (err.message || "");
    }
    return err && err.message ? err.message : String(err);
  }

  // Text aus der Antwort holen und JSON herauslösen (auch aus ```json-Blöcken)
  function parseJson(resp) {
    if (resp.stop_reason === "refusal") throw new Error("Claude hat die Anfrage abgelehnt.");
    const text = resp.content.filter((b) => b.type === "text").map((b) => b.text).join("\n");
    try { return JSON.parse(text); } catch (e) { /* weiter */ }
    const m = text.match(/\{[\s\S]*\}/);
    if (m) return JSON.parse(m[0]);
    throw new Error("Antwort von Claude war kein gültiges JSON.");
  }

  const base = (extra) => ({
    model: MODEL,
    max_tokens: 16000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    ...extra,
  });

  /* ---------- 1. Blueprint aus Artikeln ---------- */
  const BLUEPRINT_SCHEMA = {
    type: "object",
    additionalProperties: false,
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
          additionalProperties: false,
          required: ["title", "category", "rationale", "evidence", "source_hint", "contact", "email_subject", "email_body", "call_script", "questions"],
          properties: {
            title: { type: "string" },
            category: { type: "string", enum: ["agent", "approve", "human"] },
            rationale: { type: "string" },
            evidence: { type: "array", items: { type: "object", additionalProperties: false, required: ["article", "quote"], properties: { article: { type: "integer" }, quote: { type: "string" } } } },
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
  "agent" = ein Agent kann es selbst in öffentlichen Online-Quellen finden (offizielle Websites, Preislisten, Statistiken) oder aus dem Archiv berechnen.
  "approve" = braucht eine Anfrage an eine Pressestelle oder Institution; der Agent kann E-Mail und Anrufleitfaden vorbereiten, die Journalistin gibt frei.
  "human" = braucht eigenes Reporting, Urteil oder persönliche Kontakte (politische Zitate, Stimmen vor Ort, Einordnung).
- rationale: ein Satz, warum der Punkt dazugehört.
- evidence: 1–3 wörtliche, kurze Zitate (max. 200 Zeichen) aus den Artikeln, die das belegen; article = Nummer des Artikels.
- source_hint: wo der Wert zu finden ist (für agent) bzw. wen man fragt.
- contact: Institution oder Rolle für approve/human, sonst leer.
- email_subject, email_body: für approve eine sachliche Presseanfrage auf Deutsch, sonst leer.
- call_script: für approve ein kurzer Gesprächsleitfaden (Aufzeichnung ankündigen und Zustimmung einholen), sonst leer.
- questions: für human 1–3 Fragen, sonst leer.
Erstelle 6–12 Punkte. target_year ist das Jahr der nächsten Ausgabe. Antworte auf Deutsch.`;

  function locate(article, quote) {
    const t = article.text;
    let i = t.indexOf(quote);
    if (i < 0 && quote.length > 40) i = t.indexOf(quote.slice(0, 40));
    if (i >= 0) {
      // auf ganzen Satz erweitern
      const sents = RR.text.sentences(t);
      const s = sents.find((x) => x.start <= i && x.end > i);
      if (s) return s;
      return { start: i, end: i + quote.length, text: quote };
    }
    // ähnlichster Satz nach Wortüberlappung
    const words = new Set(quote.toLowerCase().match(/[a-zäöüß0-9]{4,}/g) || []);
    let best = null, score = 0;
    for (const s of RR.text.sentences(t)) {
      const w = (s.text.toLowerCase().match(/[a-zäöüß0-9]{4,}/g) || []).filter((x) => words.has(x)).length;
      if (w > score) { score = w; best = s; }
    }
    return score >= 2 ? best : null;
  }

  async function analyze(articles) {
    const offline = RR.analyze(articles);
    const { Anthropic, c } = await client();
    const content = articles.map((a, i) => `<artikel nummer="${i + 1}" jahr="${a.year || "?"}" titel="${a.title.replace(/"/g, "'")}">\n${a.text}\n</artikel>`).join("\n\n");
    let resp;
    try {
      resp = await c.beta.messages.create(base({
        output_config: { effort: "medium", format: { type: "json_schema", schema: BLUEPRINT_SCHEMA } },
        system: BLUEPRINT_SYSTEM,
        messages: [{ role: "user", content: `Hier sind ${articles.length} frühere Artikel:\n\n${content}` }],
      }));
    } catch (err) {
      throw new Error(explain(err, Anthropic));
    }
    const bp = parseJson(resp);

    const patterns = bp.items.map((it, idx) => {
      const evidence = [];
      for (const ev of it.evidence || []) {
        const a = articles[(ev.article || 1) - 1];
        if (!a) continue;
        const s = locate(a, ev.quote || "");
        if (s) evidence.push({ articleId: a.id, start: s.start, end: s.end, text: s.text, year: a.year, title: a.title });
      }
      const vals = it.category === "agent" ? RR.archiveValues(evidence) : { unit: "", values: [] };
      const item = {
        title: it.title,
        category: it.category,
        action: it.category === "agent" ? "ai_research" : null,
        metric: it.category === "agent",
        source: { label: it.source_hint || "Websuche" },
        contact: "generic",
        contactOrg: it.contact || "",
        channels: it.category === "approve" ? ["email", it.call_script ? "call" : null].filter(Boolean) : [],
        email: it.email_body ? { subject: it.email_subject, body: it.email_body } : null,
        call: it.call_script ? { script: it.call_script } : null,
        questions: it.questions || [],
        hint: it.category === "human" ? it.rationale : "",
        why: it.rationale,
      };
      return { id: "ai_" + idx, label: it.title, hits: new Set(evidence.map((e) => e.articleId)).size, recurring: true, evidence, values: vals.values, unit: vals.unit, item };
    });

    return {
      ...offline,
      engine: "ai",
      type: { id: "ai", label: bp.story_type, short: bp.event || bp.story_type, event: bp.event, score: 1, matched: [], fallback: false, description: bp.description },
      patterns,
      targetYear: bp.target_year || offline.targetYear,
      offlineType: offline.type,
    };
  }

  /* ---------- 2. Agent-Punkt per Websuche recherchieren ---------- */
  const RESEARCH_SCHEMA = {
    type: "object",
    additionalProperties: false,
    required: ["found", "value", "details", "confidence", "sources"],
    properties: {
      found: { type: "boolean" },
      value: { type: "string" },
      details: { type: "string" },
      confidence: { type: "string", enum: ["low", "medium", "high"] },
      sources: { type: "array", items: { type: "object", additionalProperties: false, required: ["title", "url", "quote"], properties: { title: { type: "string" }, url: { type: "string" }, quote: { type: "string" } } } },
    },
  };

  const RESEARCH_SYSTEM = `Du bist ein Recherche-Agent der BR-Redaktion. Finde mit der Websuche den aktuellen Wert für die Aufgabe.
Nutze verlässliche, möglichst offizielle Quellen und gib jede Quelle mit URL und einem kurzen wörtlichen Beleg an.
value: das Ergebnis in einem knappen Satz oder einer Zahl mit Einheit. details: Einordnung oder Einschränkungen.
Wenn du keine verlässliche Quelle findest oder die Werte für das Zieljahr noch nicht veröffentlicht sind, setze found=false und erkläre in details, was fehlt. Erfinde nichts.`;

  async function research(item, an, onLog) {
    const { Anthropic, c } = await client();
    const pat = an.patterns.find((p) => p.id === item.patternId);
    const archive = pat && pat.values.length ? pat.values.map((v) => `${v.year || "?"}: ${v.raw}`).join("; ") : "keine";
    const messages = [{ role: "user", content: `Geschichte: ${an.type.label} (${an.type.event || ""}). Zieljahr: ${an.targetYear}.\nAufgabe: ${item.title}\nQuellenhinweis: ${item.source ? item.source.label : "-"}\nArchivwerte aus früheren Artikeln: ${archive}` }];
    const tools = [{ type: "web_search_20260209", name: "web_search", max_uses: 5 }];
    let withFormat = true;
    let resp;
    for (let turn = 0; turn < 5; turn++) {
      try {
        resp = await c.beta.messages.create(base({
          system: RESEARCH_SYSTEM + (withFormat ? "" : "\nAntworte am Ende ausschließlich mit einem JSON-Objekt mit den Feldern found, value, details, confidence, sources[{title,url,quote}]."),
          tools,
          messages,
          output_config: withFormat ? { effort: "medium", format: { type: "json_schema", schema: RESEARCH_SCHEMA } } : { effort: "medium" },
        }));
      } catch (err) {
        // Falls Websuche + strukturierte Ausgabe nicht kombinierbar sind: einmal ohne Format versuchen
        if (withFormat && err instanceof Anthropic.BadRequestError) { withFormat = false; turn--; continue; }
        throw new Error(explain(err, Anthropic));
      }
      for (const b of resp.content) {
        if (b.type === "server_tool_use" && b.name === "web_search" && b.input && b.input.query) onLog(`Websuche: „${b.input.query}“`);
        if (b.type === "web_search_tool_result" && Array.isArray(b.content)) onLog(`${b.content.length} Treffer`);
      }
      if (resp.stop_reason !== "pause_turn") break;
      messages.push({ role: "assistant", content: resp.content });
    }
    const out = parseJson(resp);
    const srcs = (out.sources || []).filter((s) => /^https?:\/\//.test(s.url));
    if (!out.found) return { handoff: `Claude hat keine verlässliche Quelle gefunden. ${out.details || ""}`.trim() };
    return {
      result: {
        kind: "facts",
        ai: true,
        confidence: out.confidence,
        sources: srcs.length,
        summary: out.value,
        facts: [
          { label: "Ergebnis", value: out.value, source: srcs[0] ? { label: srcs[0].title || srcs[0].url, url: srcs[0].url } : { label: "ohne Quelle" } },
          ...(out.details ? [{ label: "Einordnung", value: out.details, source: { label: `Sicherheit: ${{ low: "gering", medium: "mittel", high: "hoch" }[out.confidence] || out.confidence}` } }] : []),
          ...srcs.slice(0, 4).map((s) => ({ label: "Beleg", value: `„${s.quote}“`, source: { label: s.title || s.url, url: s.url } })),
        ],
      },
    };
  }

  RR.ai = { setKey, hasKey, remembered, analyze, research, MODEL };
})();
