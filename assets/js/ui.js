/* UI-Helfer: Escaping, Icons, Toast, Kategorien. */
(function () {
  const RR = (window.RR = window.RR || {});

  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  // Strich-Icons, 24er-Raster, Farbe über currentColor
  const P = {
    bot: '<rect x="4" y="8" width="16" height="11" rx="3"/><path d="M12 4v4M8.5 13h.01M15.5 13h.01M9 16.5h6"/>',
    send: '<path d="M4 12 20 4l-5 16-3.5-6.5L4 12Z"/><path d="m11.5 13.5 3-3"/>',
    user: '<circle cx="12" cy="8" r="3.5"/><path d="M5 20c1-3.5 3.8-5.5 7-5.5s6 2 7 5.5"/>',
    check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
    alert: '<path d="M12 4 2.8 19.5h18.4L12 4Z"/><path d="M12 10v4.5M12 17.2h.01"/>',
    gap: '<circle cx="12" cy="12" r="8" stroke-dasharray="3 3"/><path d="M12 8.5v4M12 15.5h.01"/>',
    clock: '<circle cx="12" cy="12" r="8"/><path d="M12 7.5V12l3 2"/>',
    link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
    search: '<circle cx="11" cy="11" r="6"/><path d="m20 20-4.5-4.5"/>',
    mail: '<rect x="3.5" y="5.5" width="17" height="13" rx="2"/><path d="m4 7 8 6 8-6"/>',
    phone: '<path d="M6.5 4h3l1.5 4-2 1.5a10 10 0 0 0 5.5 5.5l1.5-2 4 1.5v3a2 2 0 0 1-2 2A15 15 0 0 1 4.5 6a2 2 0 0 1 2-2Z"/>',
    upload: '<path d="M12 15V4M7.5 8.5 12 4l4.5 4.5"/><path d="M4.5 15v3.5a1.5 1.5 0 0 0 1.5 1.5h12a1.5 1.5 0 0 0 1.5-1.5V15"/>',
    doc: '<path d="M7 3.5h7l4 4V20a.5.5 0 0 1-.5.5h-10.5a.5.5 0 0 1-.5-.5V4a.5.5 0 0 1 .5-.5Z"/><path d="M14 3.5V8h4M9 12h6M9 15.5h6"/>',
    spark: '<path d="M12 3.5 13.8 10l6.7 2-6.7 2L12 20.5 10.2 14l-6.7-2 6.7-2L12 3.5Z"/>',
    x: '<path d="M6 6l12 12M18 6 6 18"/>',
    arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
    copy: '<rect x="8.5" y="8.5" width="11" height="11" rx="2"/><path d="M15.5 8.5V6a1.5 1.5 0 0 0-1.5-1.5H6A1.5 1.5 0 0 0 4.5 6v8A1.5 1.5 0 0 0 6 15.5h2.5"/>',
    save: '<path d="M5 4.5h11l3.5 3.5v11a1 1 0 0 1-1 1h-13a1 1 0 0 1-1-1v-13.5a1 1 0 0 1 .5-1Z"/><path d="M8 4.5v5h7v-5M8 20v-6h8v6"/>',
    play: '<path d="M8 5.5v13l10.5-6.5L8 5.5Z"/>',
    refresh: '<path d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3"/><path d="M19.5 4.5v4h-4"/>',
    archive: '<rect x="3.5" y="4.5" width="17" height="4" rx="1"/><path d="M5 8.5V19a.5.5 0 0 0 .5.5h13a.5.5 0 0 0 .5-.5V8.5M10 12.5h4"/>',
    list: '<path d="M9 6.5h11M9 12h11M9 17.5h11"/><path d="M4.5 6.5h.01M4.5 12h.01M4.5 17.5h.01"/>',
    scale: '<path d="M12 4v16M7 20h10M5 8h14"/><path d="m5 8-2.5 6a2.8 2.8 0 0 0 5 0L5 8ZM19 8l-2.5 6a2.8 2.8 0 0 0 5 0L19 8Z"/>',
    pen: '<path d="M15.5 5.5 18.5 8.5 9 18l-4 1 1-4 9.5-9.5Z"/>',
    key: '<circle cx="8" cy="14" r="3.5"/><path d="m10.5 11.5 8-8M15.5 6.5l2 2M13.5 8.5l1.5 1.5"/>',
    trash: '<path d="M5 7h14M10 7V5h4v2M7 7l1 12.5h8L17 7"/>',
  };
  const icon = (name, cls = "") => `<svg class="ic ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${P[name] || ""}</svg>`;

  const CAT = {
    agent: { label: "Agent erledigt selbst", short: "Agent", icon: "bot", desc: "Öffentliche Quellen, Archiv, Berechnungen" },
    approve: { label: "Agent bereitet vor", short: "Freigabe", icon: "send", desc: "E-Mail oder Anruf – du gibst frei" },
    human: { label: "Nur Journalist:in", short: "Du", icon: "user", desc: "Eigenes Reporting, Urteil, O-Töne" },
  };

  function toast(msg, kind = "") {
    const host = document.getElementById("toasts");
    const t = Object.assign(document.createElement("div"), { className: "toast " + kind, textContent: msg, role: "status" });
    host.appendChild(t);
    setTimeout(() => t.classList.add("out"), 3200);
    setTimeout(() => t.remove(), 3700);
  }

  // Kopieren mit Fallback (Markieren), falls die Zwischenablage verweigert wird
  function copyText(text, fallbackEl) {
    const fallback = () => {
      if (fallbackEl) { fallbackEl.focus(); fallbackEl.select && fallbackEl.select(); }
      toast("Text markiert – mit Strg/Cmd+C kopieren.");
    };
    try { navigator.clipboard.writeText(text).then(() => toast("Kopiert."), fallback); } catch (e) { fallback(); }
  }

  // Download versuchen; in eingebetteten Vorschauen zusätzlich als kopierbarer Text
  function offerFile(name, content, type) {
    try {
      const url = URL.createObjectURL(new Blob([content], { type: type + ";charset=utf-8" }));
      const a = Object.assign(document.createElement("a"), { href: url, download: name });
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1500);
    } catch (e) { /* ignorieren */ }
    RR.openDrawer({ kind: "export", name, content });
  }

  RR.ui = { esc, icon, CAT, toast, copyText, offerFile };
})();
