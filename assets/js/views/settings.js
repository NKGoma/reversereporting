/* KI-Modus: API-Key verwalten. */
(function () {
  const RR = window.RR;
  const { esc, icon, toast } = RR.ui;
  const A = () => RR.app;
  const S = () => RR.app.state;

  RR.drawerSettings = function () {
    const on = RR.ai.hasKey();
    return `<div class="drawer-head">
        <div><p class="eyebrow">${icon("spark")} Optional</p><h2>KI-Modus mit Claude</h2></div>
        <button class="icon-btn drawer-close" data-act="close-drawer" type="button" aria-label="Schließen">${icon("x")}</button>
      </div>
      <div class="drawer-body">
        <p>Ohne KI arbeitet das Tool mit einer Offline-Engine: Muster werden per Regeln erkannt, aktuelle Werte sind simuliert.</p>
        <p>Mit einem eigenen Anthropic-API-Key übernimmt <strong>Claude</strong> (${esc(RR.ai.MODEL)}):</p>
        <ul class="ticks">
          <li>${icon("check")} liest Artikel zu jedem Thema und baut den Blueprint</li>
          <li>${icon("check")} sucht aktuelle Werte per Websuche – mit Quellen-Link und Beleg</li>
          <li>${icon("check")} formuliert E-Mail-Anfragen und Gesprächsleitfäden</li>
        </ul>
        <form id="key-form" class="key-form">
          <label class="label" for="api-key">Anthropic-API-Key</label>
          <input id="api-key" type="password" autocomplete="off" spellcheck="false" placeholder="${on ? "•••••••• gespeichert" : "sk-ant-…"}">
          <label class="check"><input type="checkbox" id="api-remember" ${RR.ai.remembered() ? "checked" : ""}> In diesem Browser merken</label>
          <div class="key-actions">
            <button class="btn btn-primary" type="submit">${icon("key")} Key verwenden</button>
            ${on ? `<button class="btn btn-ghost" type="button" data-act="key-clear">Key entfernen</button>` : ""}
          </div>
        </form>
        <div class="note-box">
          <p><strong>Datenschutz:</strong> Der Key bleibt in deinem Browser und wird nur an api.anthropic.com geschickt. Ohne „merken“ ist er nach dem Schließen des Tabs weg.</p>
          <p><strong>Kosten:</strong> Eine Analyse mit Websuche kostet je nach Artikellänge etwa 0,10 bis 0,60 US-Dollar.</p>
          <p><strong>Wo es funktioniert:</strong> in der GitHub-Pages-Version oder lokal geöffnet. In eingebetteten Vorschauen sind externe Verbindungen blockiert.</p>
          <p><strong>E-Mails und Anrufe</strong> bleiben auch im KI-Modus simuliert.</p>
        </div>
      </div>`;
  };

  document.addEventListener("submit", (e) => {
    if (e.target.id !== "key-form") return;
    e.preventDefault();
    const k = document.getElementById("api-key").value.trim();
    const remember = document.getElementById("api-remember").checked;
    if (!k) return toast("Bitte einen API-Key eingeben.", "warn");
    if (!/^sk-ant-/.test(k)) toast("Der Key sieht ungewöhnlich aus – er beginnt normalerweise mit „sk-ant-“.", "warn");
    RR.ai.setKey(k, remember);
    const s = S();
    if (s.drawer && s.drawer.thenEngine) s.engine = "ai";
    A().save();
    RR.closeDrawer();
    A().render();
    toast("KI-Modus aktiv.");
  });

  RR.act["key-clear"] = () => {
    RR.ai.setKey("", false);
    S().engine = "offline";
    A().save();
    RR.closeDrawer();
    A().render();
    toast("Key entfernt – Offline-Engine aktiv.");
  };
})();
