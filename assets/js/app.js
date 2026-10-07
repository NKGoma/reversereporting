/*
 * App-Kern: Zustand, Navigation (Phasenleiste), Drawer, Ereignis-Verteilung, Bibliothek.
 * Die einzelnen Bildschirme liegen in assets/js/views/*.js und registrieren sich in
 * RR.views (HTML), RR.after (nach dem Rendern), RR.act (Klicks), RR.onInput / RR.onChange.
 */
(function () {
  const RR = window.RR;
  const { esc, icon } = RR.ui;
  const STORE = "rr-state-v2";
  const LIB = "rr-library-v1";

  RR.views = RR.views || {};
  RR.after = RR.after || {};
  RR.act = RR.act || {};
  RR.onInput = RR.onInput || {};
  RR.onChange = RR.onChange || {};

  /* ---------- Zustand ---------- */
  const fresh = () => ({ screen: "home", articles: [], analysis: null, include: {}, checklist: [], results: {}, ui: { article: 0, focus: null }, engine: "offline" });
  function load() {
    try {
      const s = JSON.parse(localStorage.getItem(STORE));
      return s && s.screen ? s : null;
    } catch (e) { return null; }
  }
  let state = load() || fresh();
  state.running = false;
  state.drawer = null;
  // unterbrochene Simulationen nach dem Neuladen zurücksetzen
  Object.values(state.results || {}).forEach((r) => {
    if (r.status === "running") r.status = "open";
    if (r.emailState === "sending" || r.emailState === "sent") r.emailState = null;
    if (r.callState === "calling") r.callState = null;
    r.confirm = null;
  });

  function save() {
    try {
      const { running, drawer, ...rest } = state;
      localStorage.setItem(STORE, JSON.stringify(rest));
    } catch (e) { /* Speicher voll oder gesperrt – App läuft trotzdem */ }
  }

  RR.app = {
    get state() { return state; },
    set state(s) { state = s; },
    save,
    fresh,
    res(id) { return (state.results[id] = state.results[id] || { status: "open", log: [] }); },
  };

  /* ---------- Checkliste ---------- */
  function fill(str) {
    const an = state.analysis;
    const y = an ? an.targetYear : new Date().getFullYear();
    const ev = an ? an.type.event || an.type.short : "";
    return String(str || "").replace(/\{YEAR\}/g, y).replace(/\{PREV\}/g, y - 1).replace(/\{EVENT\}/g, ev);
  }

  function itemFrom(tpl, extra) {
    const c = RR.agent.contactFor(tpl, state.analysis);
    return {
      id: "i" + Math.random().toString(36).slice(2, 8),
      title: fill(tpl.title),
      category: tpl.category,
      action: tpl.action || null,
      metric: !!tpl.metric,
      source: tpl.source || null,
      contact: tpl.contact || null,
      contactOrg: tpl.contactOrg || "",
      channels: tpl.channels ? tpl.channels.slice() : [],
      email: tpl.email ? { to: c.email, subject: fill(tpl.email.subject), body: fill(tpl.email.body) } : null,
      call: tpl.call ? { phone: c.phone, script: fill(tpl.call.script) } : null,
      questions: (tpl.questions || []).slice(),
      hint: tpl.hint || "",
      why: tpl.why || "",
      ...extra,
    };
  }

  // fehlende Teile ergänzen, wenn ein Punkt die Spur wechselt
  function ensureShape(item) {
    if (item.category === "agent" && !item.action) item.action = state.analysis && state.analysis.engine === "ai" ? "ai_research" : "lookup";
    if (item.category === "approve") {
      const c = RR.agent.contactFor(item, state.analysis);
      if (!item.channels.length) item.channels = ["email", "call"];
      if (!item.email) item.email = { to: c.email, subject: `Presseanfrage BR: ${item.title}`, body: `Sehr geehrte Damen und Herren,\n\nfür unsere Berichterstattung bitten wir um Informationen zu folgendem Punkt:\n${item.title}\n\nMit freundlichen Grüßen\nBR-Redaktion` };
      if (!item.call) item.call = { phone: c.phone, script: `Vorstellen, Aufzeichnung ankündigen und Zustimmung einholen.\nFrage: ${item.title}` };
    }
    if (item.category === "human" && !item.questions.length && !item.hint) item.hint = "Eigene Recherche nötig.";
  }

  function buildChecklist() {
    const an = state.analysis;
    state.checklist = an.patterns
      .filter((p) => state.include[p.id])
      .map((p) => itemFrom(p.item, { patternId: p.id, hits: p.hits, total: an.per.length }));
    state.results = {};
  }

  function isDone(item) {
    const r = state.results[item.id] || {};
    if (item.category === "agent") return r.status === "done" || (r.status === "handoff" && !!r.done);
    if (item.category === "approve") return !!(r.reply || r.transcript);
    return !!r.done;
  }

  function stats() {
    const L = state.checklist;
    const res = (i) => state.results[i.id] || {};
    const done = L.filter(isDone).length;
    const sources = L.reduce((s, i) => s + ((res(i).result && res(i).result.sources) || 0), 0);
    const approvals = L.filter((i) => i.category === "approve" && !isDone(i)).length;
    const mine = L.filter((i) => (i.category === "human" || (i.category === "agent" && res(i).status === "handoff")) && !isDone(i)).length;
    // grobe Schätzung der gesparten Recherchezeit (Minuten)
    let minutes = 0;
    L.forEach((i) => {
      const r = res(i);
      if (i.category === "agent" && r.status === "done") minutes += r.result && r.result.kind === "tents" ? 60 : 20;
      if (i.category === "approve" && (r.reply || r.transcript)) minutes += 15;
      else if (i.category === "approve") minutes += 5; // Entwurf liegt bereit
    });
    return { total: L.length, done, sources, approvals, mine, minutes };
  }

  Object.assign(RR.app, { fill, itemFrom, ensureShape, buildChecklist, isDone, stats });

  /* ---------- Bibliothek gespeicherter Blueprints ---------- */
  const library = {
    all() { try { return JSON.parse(localStorage.getItem(LIB)) || []; } catch (e) { return []; } },
    put(list) { try { localStorage.setItem(LIB, JSON.stringify(list)); return true; } catch (e) { return false; } },
    snapshot() {
      const an = state.analysis;
      return {
        id: "b" + Date.now().toString(36),
        name: `${an.type.label}${an.type.event && !an.type.label.includes(an.type.event) ? " · " + an.type.event : ""}`,
        savedAt: new Date().toISOString(),
        lastYear: an.targetYear,
        engine: an.engine,
        items: state.checklist.map(({ id, ...rest }) => rest),
        analysis: an,
      };
    },
  };
  RR.app.library = library;

  /* ---------- Navigation ---------- */
  const SCREENS = [
    { id: "archive", label: "Archiv", icon: "archive" },
    { id: "blueprint", label: "Blueprint", icon: "list" },
    { id: "research", label: "Recherche", icon: "search" },
    { id: "reconcile", label: "Abgleich", icon: "scale" },
    { id: "story", label: "Story", icon: "pen" },
  ];

  function reachable(id) {
    if (id === "home") return true;
    if (id === "archive") return !!state.analysis && state.articles.length > 0;
    return state.checklist.length > 0;
  }

  function railStatus(id) {
    const s = stats();
    if (id === "archive") return state.analysis ? `${state.articles.length || state.analysis.per.length} Artikel` : "";
    if (id === "blueprint") return state.checklist.length ? `${state.checklist.length} Punkte` : "";
    if (id === "research") return state.checklist.length ? `${s.done}/${s.total} erledigt` : "";
    if (id === "reconcile") {
      if (!state.checklist.length) return "";
      const f = RR.reconcile(state);
      const w = f.filter((x) => x.level === "warn").length;
      return w ? `${w} Hinweise` : "ok";
    }
    if (id === "story") {
      if (!state.checklist.length) return "";
      const g = RR.story.build(state).gaps;
      return g ? `${g} Lücken` : "fertig";
    }
    return "";
  }

  function renderRail() {
    const idx = SCREENS.findIndex((x) => x.id === state.screen);
    document.getElementById("rail").innerHTML = `<ol class="rail-list">${SCREENS.map((sc, i) => {
      const can = reachable(sc.id);
      const cls = [sc.id === state.screen ? "is-active" : "", i < idx && can ? "is-past" : "", can ? "" : "is-locked"].join(" ");
      const st = can ? railStatus(sc.id) : "";
      return `<li><button type="button" class="rail-step ${cls}" data-act="go" data-to="${sc.id}" ${can ? "" : "disabled"} ${sc.id === state.screen ? 'aria-current="step"' : ""}>
        <span class="rail-no">${i + 1}</span><span class="rail-text"><span class="rail-label">${sc.label}</span>${st ? `<span class="rail-sub">${esc(st)}</span>` : ""}</span></button></li>`;
    }).join("")}</ol>`;
    document.getElementById("rail").hidden = state.screen === "home" && !state.analysis;
  }

  function renderPill() {
    const on = RR.ai.hasKey();
    const el = document.getElementById("ai-pill");
    el.classList.toggle("is-on", on);
    el.innerHTML = `${icon("spark")}<span>${on ? "KI-Modus aktiv" : "KI-Modus aus"}</span>`;
  }

  function render() {
    renderRail();
    renderPill();
    const main = document.getElementById("main");
    main.innerHTML = (RR.views[state.screen] || RR.views.home)();
    main.dataset.screen = state.screen;
    if (RR.after[state.screen]) RR.after[state.screen]();
    if (state.drawer) renderDrawer();
  }

  function go(screen) {
    if (!reachable(screen)) return;
    state.screen = screen;
    save();
    render();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  /* ---------- Drawer (Detailansicht rechts) ---------- */
  function renderDrawer() {
    const d = document.getElementById("drawer");
    const scrim = document.getElementById("scrim");
    if (!state.drawer) { d.hidden = true; scrim.hidden = true; d.innerHTML = ""; document.body.classList.remove("has-drawer"); return; }
    const html = state.drawer.kind === "item" ? RR.drawerItem(state.drawer.id)
      : state.drawer.kind === "settings" ? RR.drawerSettings()
      : state.drawer.kind === "export" ? drawerExport(state.drawer) : "";
    if (!html) { closeDrawer(); return; }
    d.innerHTML = html;
    d.hidden = false;
    scrim.hidden = false;
    document.body.classList.add("has-drawer");
  }
  function openDrawer(spec) {
    const wasOpen = !!state.drawer;
    state.drawer = spec;
    renderDrawer();
    if (!wasOpen) { const f = document.querySelector("#drawer .drawer-close"); f && f.focus({ preventScroll: true }); }
  }
  function closeDrawer() {
    state.drawer = null;
    renderDrawer();
  }
  // nur den Drawer neu zeichnen, wenn er gerade diesen Punkt zeigt
  function refreshItem(id) {
    if (state.drawer && state.drawer.kind === "item" && state.drawer.id === id) {
      const body = document.querySelector("#drawer .drawer-body");
      const top = body ? body.scrollTop : 0;
      renderDrawer();
      const nb = document.querySelector("#drawer .drawer-body");
      if (nb) nb.scrollTop = top;
    }
  }
  function drawerExport(spec) {
    return `<div class="drawer-head"><div><p class="eyebrow">Export</p><h2>${esc(spec.name)}</h2></div>
      <button class="icon-btn drawer-close" data-act="close-drawer" type="button" aria-label="Schließen">${icon("x")}</button></div>
      <div class="drawer-body"><p class="muted small">Falls der Download nicht startet (z. B. in einer eingebetteten Vorschau): Text kopieren.</p>
      <textarea id="export-text" class="mono" rows="18" readonly>${esc(spec.content)}</textarea>
      <button class="btn btn-primary" data-act="copy-export" type="button">${icon("copy")} Kopieren</button></div>`;
  }
  Object.assign(RR, { openDrawer, closeDrawer, refreshItem });
  RR.app.render = render;
  RR.app.renderRail = renderRail;
  RR.app.go = go;

  /* ---------- Gemeinsame Aktionen ---------- */
  Object.assign(RR.act, {
    go: (el) => go(el.dataset.to),
    home: () => go("home"),
    "close-drawer": () => closeDrawer(),
    "open-settings": () => openDrawer({ kind: "settings" }),
    "copy-export": () => { const ta = document.getElementById("export-text"); RR.ui.copyText(ta.value, ta); },
    reset: (el) => {
      if (!el.dataset.armed) {
        el.dataset.armed = "1";
        el.querySelector("span").textContent = "Wirklich alles löschen?";
        setTimeout(() => { if (el.isConnected) { delete el.dataset.armed; el.querySelector("span").textContent = "Neu starten"; } }, 4000);
        return;
      }
      state = fresh();
      state.running = false;
      state.drawer = null;
      save();
      delete el.dataset.armed;
      el.querySelector("span").textContent = "Neu starten";
      render();
      renderDrawer();
    },
  });

  /* ---------- Ereignisse verteilen ---------- */
  document.addEventListener("click", (e) => {
    const el = e.target.closest("[data-act]");
    if (!el || el.disabled) return;
    const fn = RR.act[el.dataset.act];
    if (fn) { if (el.tagName === "A" && !el.getAttribute("href")) e.preventDefault(); fn(el, e); }
  });
  document.addEventListener("input", (e) => { const fn = RR.onInput[e.target.dataset.act]; if (fn) fn(e.target, e); });
  document.addEventListener("change", (e) => { const fn = RR.onChange[e.target.dataset.act]; if (fn) fn(e.target, e); });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && state.drawer) closeDrawer();
    if ((e.key === "Enter" || e.key === " ") && e.target.matches("[data-act][role='button']")) { e.preventDefault(); e.target.click(); }
  });

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", render);
  else setTimeout(render, 0);
})();
