/*
 * Faktenbasis: amtliche Datentabellen, die der Agent als echte Quelle nutzt.
 *
 * Mitgeliefert: Landeshauptstadt München, Open Data – "Oktoberfest 1985–2025"
 * (Datenlizenz Deutschland – Namensnennung 2.0). Die Originaldatei liegt unter
 * assets/data/oktoberfest-muenchen-1985-2025.csv; hier als Text eingebettet,
 * damit das Tool auch per Doppelklick (file://) funktioniert.
 *
 * Weitere Tabellen (z. B. vom BR-Datenteam) lassen sich als CSV hinzufügen:
 * eine Spalte "jahr"/"year", alle Zahlenspalten werden zu Zeitreihen.
 */
(function () {
  const RR = (window.RR = window.RR || {});
  const STORE = "rr-datasets-v1";

  const CITY_CSV = `jahr,dauer,besucher_gesamt,besucher_tag,bier_preis,bier_konsum,hendl_preis,hendl_konsum
1985,16,7.1,444,3.20,54541,4.77,629520
1986,16,6.7,419,3.30,53807,3.92,698137
1987,16,6.5,406,3.37,51842,3.98,732859
1988,16,5.7,356,3.45,50951,4.19,720139
1989,16,6.2,388,3.60,51241,4.22,775674
1990,16,6.7,419,3.77,54300,4.47,750947
1991,16,6.4,400,4.21,54686,4.81,807710
1992,16,5.9,369,4.42,48888,5.11,725612
1993,16,6.5,406,4.71,51933,5.25,733517
1994,16,6.6,413,4.89,52108,5.39,663135
1995,16,6.7,419,5.15,50162,5.54,628890
1996,16,6.9,431,5.24,52622,5.45,595580
1997,16,6.4,400,5.45,55891,5.38,699562
1998,16,6.5,406,5.60,54782,5.34,603746
1999,16,6.5,406,5.80,60054,5.38,609661
2000,18,6.9,383,6.35,64591,7.85,681242
2001,16,5.5,344,6.47,48698,8.12,351705
2002,16,5.9,369,6.75,57614,8.10,459259
2003,16,6.3,394,6.75,62294,8.14,487487
2004,16,5.9,369,7.02,61163,8.28,481649
2005,17,6.1,359,7.15,61772,8.35,479610
2006,18,6.5,361,7.42,68617,8.50,494135
2007,16,6.2,388,7.85,69406,8.87,521872
2008,16,6.0,375,8.25,64922,9.06,459356
2009,16,5.7,356,8.53,66436,9.18,488137
2010,17,6.4,376,8.79,71000,9.60,505901
2011,17,6.9,406,9.09,79225,9.83,522821
2012,16,6.4,400,9.41,74025,10.07,508958
2013,16,6.4,400,9.78,77031,11.10,482361
2014,16,6.3,394,9.98,76808,10.49,509420
2015,16,5.9,369,10.27,75134,10.75,503510
2016,17,5.6,329,10.57,66231,11.00,366876
2017,18,6.2,344,10.87,77836,11.41,466747
2018,16,6.3,394,11.30,78705,11.67,436492
2019,16,6.3,394,11.71,78502,12.15,434998
2022,17,5.7,335,13.45,71340,13.96,313636
2023,18,7.2,400,14.33,74418,15.89,396141
2024,16,6.8,425,14.9,69564,18.08,368308
2025,16,6.5,406,15.33,67127,18.53,351461`;

  const CITY = {
    id: "muc-oktoberfest",
    title: "Oktoberfest 1985–2025",
    publisher: "Landeshauptstadt München – Open Data",
    short: "Stadt München",
    license: "dl-by-de/2.0",
    licenseUrl: "https://www.govdata.de/dl-de/by-2-0",
    url: "https://opendata.muenchen.de/dataset/oktoberfest/resource/e0f664cf-6dd9-4743-bd2b-81a8b18bd1d2",
    api: "https://opendata.muenchen.de/api/3/action/datastore_search?resource_id=e0f664cf-6dd9-4743-bd2b-81a8b18bd1d2&limit=500",
    asOf: "Stand Juli 2026",
    live: false,
    builtin: true,
    events: /oktoberfest|wiesn/i,
    columns: {
      dauer: { label: "Dauer", unit: "Tage", match: /dauer|festtag|tage lang/i },
      besucher_gesamt: { label: "Besucher gesamt", unit: "Mio.", match: /besucher(?!.*tag)|besucherzahl|gäste/i },
      besucher_tag: { label: "Besucher pro Tag", unit: "Tsd.", match: /pro tag|täglich/i },
      bier_preis: { label: "Ø Maßpreis", unit: "€", match: /maß|bier.?preis/i },
      bier_konsum: { label: "Bierkonsum", unit: "hl", match: /bierkonsum|ausgeschenkt|hektoliter|bier getrunken/i },
      hendl_preis: { label: "Ø Hendlpreis", unit: "€", match: /hendl.?preis|preis.*hendl/i },
      hendl_konsum: { label: "Hendl verzehrt", unit: "Stück", match: /hendl(?!.?preis)|brathendl/i },
    },
    rows: [],
  };

  /* ---------- CSV ---------- */
  function parseCsv(text) {
    const lines = text.replace(/\r\n?/g, "\n").split("\n").map((l) => l.trim()).filter(Boolean);
    if (lines.length < 2) throw new Error("Die Tabelle ist leer.");
    const sep = (lines[0].match(/;/g) || []).length > (lines[0].match(/,/g) || []).length ? ";" : ",";
    const head = lines[0].split(sep).map((h) => h.replace(/^"|"$/g, "").trim());
    const yi = head.findIndex((h) => /^(jahr|year|jahrgang)$/i.test(h));
    if (yi < 0) throw new Error("Es fehlt eine Spalte „jahr“ (oder „year“).");
    const num = (v) => {
      v = String(v || "").replace(/^"|"$/g, "").trim();
      if (!v) return null;
      if (sep === ";") v = v.replace(/\./g, "").replace(",", ".");
      const n = Number(v);
      return isFinite(n) ? n : null;
    };
    const rows = lines.slice(1).map((l) => {
      const cells = l.split(sep);
      const r = { jahr: num(cells[yi]) };
      head.forEach((h, i) => { if (i !== yi) r[h] = num(cells[i]); });
      return r;
    }).filter((r) => r.jahr);
    const numeric = head.filter((h, i) => i !== yi && rows.some((r) => r[h] !== null));
    return { head: numeric, rows: rows.sort((a, b) => a.jahr - b.jahr) };
  }

  CITY.rows = parseCsv(CITY_CSV).rows;

  // hochgeladene Tabellen: Spaltennamen werden zu Bezeichnungen und Suchmustern
  function fromUpload(title, text) {
    const t = parseCsv(text);
    const columns = {};
    t.head.forEach((h) => {
      const words = h.toLowerCase().split(/[_\s-]+/).filter((w) => w.length >= 4);
      const dec = t.rows.some((r) => r[h] != null && !Number.isInteger(r[h]));
      columns[h] = { label: h.replace(/_/g, " "), unit: "", dec, match: words.length ? new RegExp(words.join("|"), "i") : /^$/ };
    });
    return { id: "u" + Date.now().toString(36), title, publisher: "Eigene Tabelle", short: title, license: "", url: "", asOf: "hochgeladen", custom: true, events: null, columns, rows: t.rows, csv: text };
  }

  function loadCustom() {
    try {
      return (JSON.parse(localStorage.getItem(STORE)) || []).map((d) => {
        try { return { ...fromUpload(d.title, d.csv), id: d.id }; } catch (e) { return null; }
      }).filter(Boolean);
    } catch (e) { return []; }
  }
  function saveCustom(list) {
    try { localStorage.setItem(STORE, JSON.stringify(list.map((d) => ({ id: d.id, title: d.title, csv: d.csv })))); return true; } catch (e) { return false; }
  }

  let custom = loadCustom();

  /* ---------- Abfragen ---------- */
  const all = () => [CITY, ...custom];
  const get = (id) => all().find((d) => d.id === id) || null;
  // passende Tabellen für eine Geschichte: amtliche nach Fest, eigene immer
  const forEvent = (event, text) => all().filter((d) => !d.events || d.events.test(event || "") || (text && d.events.test(text)));
  const row = (ds, year) => ds.rows.find((r) => r.jahr === year) || null;
  const value = (ds, col, year) => { const r = row(ds, year); return r ? r[col] : null; };
  const series = (ds, col) => ds.rows.filter((r) => r[col] != null).map((r) => ({ year: r.jahr, value: r[col] }));
  const latest = (ds, col) => { const s = series(ds, col); return s[s.length - 1] || null; };
  // Vorgängerjahr mit Daten (überspringt Ausfälle wie 2020/21)
  const before = (ds, col, year) => series(ds, col).filter((p) => p.year < year).pop() || null;

  function fmt(ds, col, v) {
    if (v == null) return "–";
    const u = (ds.columns[col] || {}).unit;
    const de = (x, d) => x.toLocaleString("de-DE", { minimumFractionDigits: d, maximumFractionDigits: d });
    if (u === "€") return de(v, 2) + " €";
    if (u === "Mio.") return de(v, 1) + " Mio.";
    if (u === "Tsd.") return de(v, 0) + " Tsd.";
    if (u === "hl") return de(v, 0) + " hl";
    if (u === "Stück") return de(v, 0) + " Stück";
    if (u === "Tage") return de(v, 0) + " Tage";
    return de(v, (ds.columns[col] || {}).dec || !Number.isInteger(v) ? 2 : 0);
  }
  const source = (ds, year) => ({
    label: ds.custom ? `${ds.title}${year ? ", " + year : ""}` : `${ds.short}, Open Data (${ds.license})${year ? ", " + year : ""}`,
    url: ds.url || null,
  });
  // Spalte, die zu einem Checklisten-Titel passt
  const columnFor = (ds, title) => Object.keys(ds.columns).find((c) => ds.columns[c].match.test(title)) || null;

  /* ---------- Live-Aktualisierung (wenn das Portal erreichbar ist) ---------- */
  async function refresh() {
    if (!window.fetch || location.protocol === "file:") return false;
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 4000);
    try {
      const r = await fetch(CITY.api, { signal: ctl.signal });
      if (!r.ok) return false;
      const j = await r.json();
      const recs = (j.result && j.result.records) || [];
      const maxYear = Math.max(...CITY.rows.map((x) => x.jahr));
      const fresh = recs.map((x) => {
        const o = { jahr: Number(x.jahr) };
        Object.keys(CITY.columns).forEach((c) => { const n = Number(String(x[c]).replace(",", ".")); o[c] = isFinite(n) && x[c] !== "" && x[c] != null ? n : null; });
        return o;
      }).filter((o) => o.jahr > maxYear);
      CITY.live = true;
      CITY.asOf = "live geprüft " + new Date().toLocaleDateString("de-DE");
      if (fresh.length) {
        CITY.rows = CITY.rows.concat(fresh).sort((a, b) => a.jahr - b.jahr);
        CITY.title = `Oktoberfest 1985–${CITY.rows[CITY.rows.length - 1].jahr}`;
      }
      return true;
    } catch (e) {
      return false; // blockiert oder offline: mitgelieferter Stand bleibt
    } finally {
      clearTimeout(timer);
    }
  }

  RR.facts = {
    all, get, forEvent, row, value, series, latest, before, fmt, source, columnFor, parseCsv, refresh,
    addUpload(title, text) {
      const ds = fromUpload(title, text);
      custom = [...custom, ds];
      return { ds, saved: saveCustom(custom) };
    },
    remove(id) { custom = custom.filter((d) => d.id !== id); saveCustom(custom); },
  };
})();
