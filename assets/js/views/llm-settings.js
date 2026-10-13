/* Lokale KI: Status von Ollama, Modellwahl, Einstellungen, Cache. */
(function () {
  const RR = window.RR;
  const { esc, icon, toast } = RR.ui;
  const A = () => RR.app;
  const S = () => RR.app.state;
  const AI = () => RR.ai;

  const gb = (b) => (b ? (b / 1e9).toFixed(1).replace(".", ",") + " GB" : "");
  const cmd = (c) => `<span class="cmd"><code>${esc(c)}</code><button class="icon-btn" type="button" data-act="copy-cmd" data-cmd="${esc(c)}" aria-label="Befehl kopieren">${icon("copy")}</button></span>`;

  function statusBox() {
    const st = AI().state;
    if (st.status === "ok") return `<div class="llm-status is-ok">${icon("check")}<div><strong>Gemma bereit</strong><span>Modell <code>${esc(st.model)}</code> läuft lokal über Ollama.</span></div></div>`;
    if (st.status === "checking") return `<div class="llm-status"><span class="spinner"></span><div><strong>Prüfe Ollama …</strong></div></div>`;
    if (st.status === "nomodel") return `<div class="llm-status is-warn">${icon("alert")}<div><strong>Ollama läuft, aber Gemma fehlt</strong><span>Einmalig im Terminal laden (≈ 17 GB):</span>${cmd("ollama pull " + AI().PREFERRED)}</div></div>`;
    return `<div class="llm-status is-warn">${icon("alert")}<div><strong>Ollama läuft nicht</strong><span>Am einfachsten <code>start.command</code> doppelklicken – oder im Terminal:</span>${cmd("ollama serve")}<span class="muted small">${esc(st.error || "")}</span></div></div>`;
  }

  RR.drawerSettings = function () {
    const st = AI().state;
    const c = AI().config;
    const opts = st.models.map((m) => `<option value="${esc(m.name)}" ${m.name === st.model ? "selected" : ""}>${esc(m.name)}${m.params ? " · " + esc(m.params) : ""}${m.size ? " · " + gb(m.size) : ""}</option>`).join("");
    return `<div class="drawer-head">
        <div><p class="eyebrow">${icon("spark")} Auf diesem Gerät</p><h2>Lokale KI mit Gemma</h2></div>
        <button class="icon-btn drawer-close" data-act="close-drawer" type="button" aria-label="Schließen">${icon("x")}</button>
      </div>
      <div class="drawer-body">
        ${statusBox()}
        <p>Die Regel-Engine arbeitet immer. Mit Gemma (über <strong>Ollama</strong> auf diesem Rechner) kommt dazu:</p>
        <ul class="ticks">
          <li>${icon("check")} Blueprint aus Artikeln zu jedem Thema – mit wörtlichen, geprüften Belegstellen</li>
          <li>${icon("check")} Themenarchiv: Story-Typen benennen, Kernaspekte mit Zitat, typische Quellen</li>
          <li>${icon("check")} E-Mail-Entwürfe und Gesprächsleitfäden für Presseanfragen</li>
        </ul>
        <form id="llm-form" class="key-form">
          <label class="label" for="llm-model">Modell</label>
          <select id="llm-model" ${st.models.length ? "" : "disabled"}>${opts || `<option>${esc(AI().PREFERRED)} (nicht gefunden)</option>`}</select>
          <label class="label" for="llm-host">Ollama-Adresse</label>
          <input id="llm-host" value="${esc(c.host)}" spellcheck="false" autocomplete="off">
          <label class="label" for="llm-ctx">Kontextfenster (Token)</label>
          <select id="llm-ctx">${[8192, 16384, 32768, 65536].map((n) => `<option value="${n}" ${n === c.ctx ? "selected" : ""}>${n.toLocaleString("de-DE")}${n === 32768 ? " (empfohlen)" : n === 65536 ? " (mehr Speicher)" : ""}</option>`).join("")}</select>
          <div class="key-actions">
            <button class="btn btn-primary" type="submit">${icon("check")} Übernehmen</button>
            <button class="btn btn-ghost" type="button" data-act="llm-check">${icon("refresh")} Erneut prüfen</button>
          </div>
        </form>
        <div class="note-box">
          <p><strong>Datenschutz:</strong> Alles läuft auf diesem Gerät. Die App darf technisch nur mit sich selbst und mit Ollama auf <code>localhost</code> sprechen (Content-Security-Policy) – Artikel verlassen den Rechner nicht.</p>
          <p><strong>Tempo</strong> (gemma3:27b, MacBook M-Serie): ein Blueprint etwa 30–90 Sekunden, ein Story-Typ im Themenarchiv etwa 20–60 Sekunden. Beim ersten Aufruf lädt Ollama das Modell in den Speicher.</p>
          <p><strong>Prüfung:</strong> Zitate, die Gemma nennt, werden im Originaltext gesucht. Was dort nicht steht, wird verworfen.</p>
          <p><strong>Cache:</strong> Antworten werden lokal gespeichert, dieselbe Analyse ist beim zweiten Mal sofort da. <span id="cache-n"></span></p>
          <p><button class="btn btn-ghost btn-sm" type="button" data-act="llm-clear-cache">${icon("trash")} Cache leeren</button></p>
        </div>
      </div>`;
  };

  // Header-Badge
  RR.renderLlmPill = function () {
    const el = document.getElementById("ai-pill");
    if (!el) return;
    const st = AI().state;
    el.classList.toggle("is-on", st.status === "ok");
    el.classList.toggle("is-warn", st.status === "down" || st.status === "nomodel");
    const label = st.status === "ok" ? "Gemma bereit" : st.status === "checking" ? "Prüfe Ollama …" : st.status === "nomodel" ? "Gemma fehlt" : st.status === "down" ? "Ollama aus" : "Lokale KI";
    el.innerHTML = `${icon(st.status === "ok" ? "spark" : st.status === "checking" ? "clock" : "alert")}<span>${label}</span>`;
    el.title = AI().statusText();
  };

  AI().onStatus((st) => {
    RR.renderLlmPill();
    const s = S();
    if (!s || !s.drawer || s.drawer.kind !== "settings") return;
    // aus dem Engine-Schalter geöffnet und Gemma ist bereit: direkt umschalten
    if (s.drawer.thenEngine && st.status === "ok") { s.engine = "ai"; A().save(); RR.closeDrawer(); A().render(); toast(`Gemma bereit (${st.model}).`); return; }
    A().renderDrawer();
  });

  // Fortschritt einer laufenden Gemma-Anfrage
  RR.llmProgressHtml = function (p, unit, count) {
    p = p || {};
    if (p.cached) return `<p class="llm-prog">${icon("check")} Aus dem lokalen Cache</p>`;
    if (p.phase === "prompt" || !p.tokens) return `<p class="llm-prog"><span class="spinner"></span> ${p.elapsed > 1 ? `Gemma liest den Text … ${Math.round(p.elapsed)} s` : "Gemma liest den Text …"}</p>`;
    return `<p class="llm-prog"><span class="spinner"></span> ${unit && count ? `${count} ${esc(unit)} · ` : ""}${p.tokens} Token${p.tps ? ` · ${p.tps.toFixed(1).replace(".", ",")} Token/s` : ""} · ${Math.round(p.elapsed || 0)} s</p>`;
  };

  document.addEventListener("submit", (e) => {
    if (e.target.id !== "llm-form") return;
    e.preventDefault();
    const sel = document.getElementById("llm-model");
    try {
      AI().setConfig({
        host: document.getElementById("llm-host").value,
        ctx: Number(document.getElementById("llm-ctx").value),
        model: sel && !sel.disabled ? sel.value : AI().config.model,
      });
    } catch (err) { return toast(err.message, "warn"); }
    AI().check().then((st) => {
      if (st.status === "ok") {
        const s = S();
        if (s.drawer && s.drawer.thenEngine) { s.engine = "ai"; A().save(); RR.closeDrawer(); A().render(); }
        toast(`Gemma bereit (${st.model}).`);
      } else toast(AI().statusText(), "warn");
    });
  });

  Object.assign(RR.act, {
    "llm-check": () => AI().check(),
    "llm-cancel": () => AI().cancel(),
    "llm-clear-cache": async () => { await AI().clearCache(); toast("Cache geleert."); A().renderDrawer(); },
    "copy-cmd": (el) => RR.ui.copyText(el.dataset.cmd),
  });

  RR.after.settingsDrawer = async function () {
    const el = document.getElementById("cache-n");
    if (el) { const n = await AI().cacheSize(); el.textContent = n ? `Derzeit ${n} Antwort${n === 1 ? "" : "en"} im Cache.` : ""; }
  };
})();
