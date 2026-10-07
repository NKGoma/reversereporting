/*
 * Blueprints: bekannte wiederkehrende Story-Typen.
 *
 * Jedes "feature" ist ein Baustein, der satzweise in alten Artikeln gesucht wird
 * (match = RegExp oder Funktion(satz, artikel)). Kommt ein Baustein in mehreren
 * Artikeln vor, wird daraus ein Checklisten-Punkt (item).
 *
 * Kategorien:  agent = Agent erledigt selbst · approve = Agent bereitet vor,
 *              Freigabe nötig · human = nur Journalist:in
 * Platzhalter: {EVENT} {YEAR} {PREV}
 * action:      Name der (simulierten) Agent-Aktion in agent-sim.js
 */
(function () {
  const RR = (window.RR = window.RR || {});

  const PRICE = /\d{1,3}(?:[.,]\d{1,2})?\s?(?:€|euro\b)/i;
  const NUM = /\d/;

  // kleine Helfer, damit die Definitionen lesbar bleiben
  const agent = (title, action, extra = {}) => ({ title, category: "agent", action, ...extra });
  const approve = (title, contact, mail, call, extra = {}) => ({
    title,
    category: "approve",
    contact,
    channels: [mail && "email", call && "call"].filter(Boolean),
    email: mail ? { subject: mail[0], body: mail[1] } : null,
    call: call ? { script: call } : null,
    ...extra,
  });
  const human = (title, questions, hint, extra = {}) => ({ title, category: "human", questions, hint, ...extra });
  const mail = (subject, ask) => [subject, `Sehr geehrte Damen und Herren,\n\nfür unsere Berichterstattung bitten wir um folgende Angaben:\n${ask}\n\nUm eine Antwort bis morgen, 12 Uhr, wird gebeten.\n\nMit freundlichen Grüßen\nBR-Redaktion`];
  const script = (q) => `Vorstellen (Recherche-Assistent im Auftrag der BR-Redaktion), Aufzeichnung ankündigen und Zustimmung einholen.\n${q}`;

  /* ---------------- Volksfest / Bierpreis ---------------- */
  const volksfest = {
    id: "volksfest-bierpreis",
    label: "Volksfest – Bierpreis",
    short: "Bierpreis",
    keywords: [
      ["maß", 3], ["bierpreis", 4], ["festzelt", 2], ["bierzelt", 2], ["wiesn", 2], ["oktoberfest", 2],
      ["volksfest", 2], ["dult", 2], ["gäubodenfest", 2], ["frühlingsfest", 2], ["bergkirchweih", 2],
      ["starkbier", 2], ["festwirt", 2], ["wirte", 1], ["anstich", 1], ["o'zapft", 1],
    ],
    // Name des Festes aus dem Text
    events: [
      ["Oktoberfest", /oktoberfest|wiesn(?!wirt)/i], ["Gäubodenvolksfest", /gäuboden/i], ["Bergkirchweih", /bergkirchweih|berch/i],
      ["Auer Dult", /auer dult/i], ["Frühlingsfest", /frühlingsfest/i], ["Starkbierfest", /starkbier|nockherberg/i],
      ["Herbstfest", /herbstfest/i], ["Dult", /\bdult\b/i], ["Volksfest", /volksfest/i],
    ],
    contacts: {
      wirte: { org: "Sprecher:in der Festwirte", email: "presse@festwirte.beispiel.invalid", phone: "+49 89 000000-1" },
      polizei: { org: "Polizei – Pressestelle", email: "pressestelle@polizei.beispiel.invalid", phone: "+49 89 000000-0" },
      stadt: { org: "Stadt – Veranstaltungsbüro / Festleitung", email: "presse.fest@stadt.beispiel.invalid", phone: "+49 89 000000-2" },
      festwirt: { org: "Festwirt:in eines großen Zelts", email: "info@festzelt.beispiel.invalid", phone: "+49 89 000000-3" },
      rettung: { org: "Sanitätsdienst – Pressestelle", email: "presse@sanitaeter.beispiel.invalid", phone: "+49 89 000000-4" },
    },
    features: [
      { id: "price_tents", label: "Maßpreis pro Zelt", match: (s) => PRICE.test(s) && /zelt|festhalle|schänke|keller|tradition|oide wiesn|brauerei|maß/i.test(s),
        item: agent("Maßpreis in allen Festzelten {YEAR}", "tent_prices", { why: "Jeder Artikel nennt Preise einzelner Zelte." }) },
      { id: "price_range", label: "Preisspanne", match: /günstigst|teuerst|billigst|zwischen\s+\d+[.,]\d+|bis zu \d+[.,]\d+|höchstpreis|spanne/i,
        item: agent("Preisspanne: günstigstes und teuerstes Zelt", "price_range", { why: "Minimum und Maximum gehören immer dazu." }) },
      { id: "yoy", label: "Vergleich zum Vorjahr", match: /vorjahr|im vergleich|gestiegen|steigt|teurer als|erhöh|plus von|anstieg/i,
        item: agent("Veränderung zum Vorjahr in % ({PREV} → {YEAR})", "yoy", { why: "Die Preissteigerung ist der Kern der Geschichte." }) },
      { id: "history", label: "Historische Einordnung", match: /seit \d{4}|vor \w+ jahren|damals|rekord|erstmals|\b(19|20)\d{2}\b.*\b(19|20)\d{2}\b/i,
        item: agent("Historische Preisreihe (Archiv + aktuell)", "history", { why: "Artikel ordnen den Preis über Jahre ein." }) },
      { id: "soft_drinks", label: "Alkoholfreie Getränke", match: /wasser|spezi|limo|alkoholfrei|softdrink/i,
        item: agent("Preise alkoholfreie Getränke (Wasser, Spezi)", "soft_drinks", { why: "Wasser- und Spezi-Preise werden regelmäßig genannt." }) },
      { id: "reason", label: "Begründung der Wirte", match: /begründ|als grund|verweisen auf|wegen|gestiegene[n]? kosten|energie|personal|inflation/i,
        item: approve("Offizielle Begründung der Preiserhöhung", "wirte",
          mail("Presseanfrage BR: Bierpreis {EVENT} {YEAR}", "Womit begründen die Festwirte die diesjährigen Maßpreise im Vergleich zu {PREV}?"),
          script("Frage: Womit begründen die Wirte die Preise {YEAR}?\nNachfrage: Welcher Kostenfaktor wiegt am schwersten?"),
          { why: "Die Begründung kommt jedes Jahr von den Wirten." }) },
      { id: "security", label: "Sicherheit / Polizei", match: /polizei|sicherheit|einsatzkräfte|beamt|taschenkontroll|videoüberwach/i,
        item: approve("Polizei: Einsatzkräfte und Sicherheitskonzept", "polizei",
          mail("Presseanfrage BR: Sicherheit {EVENT} {YEAR}", "1. Wie viele Einsatzkräfte sind täglich im Dienst?\n2. Was ändert sich am Sicherheitskonzept gegenüber {PREV}?"),
          script("1. Anzahl Einsatzkräfte pro Tag und an Spitzentagen?\n2. Änderungen am Sicherheitskonzept?"),
          { why: "Polizeiangaben tauchen in fast jedem Artikel auf." }) },
      { id: "visitors", label: "Besucherzahlen", match: /besucher|millionen gäste|\d+[.,]?\d*\s*millionen/i,
        item: approve("Besucherzahlen und Prognose der Stadt", "stadt",
          mail("Presseanfrage BR: Besucherprognose {EVENT} {YEAR}", "Mit wie vielen Besucherinnen und Besuchern rechnen Sie {YEAR}? Wie lautete die Bilanz {PREV}?"), null,
          { why: "Besucherzahlen werden fast immer genannt." }) },
      { id: "medical", label: "Sanitätsdienst", match: /sanitäts|sanitäter|rettungsdienst|rotes kreuz|patient/i,
        item: approve("Sanitätsdienst: Einsatzbilanz", "rettung",
          mail("Presseanfrage BR: Sanitätsdienst {EVENT} {YEAR}", "Wie viele Patientinnen und Patienten wurden versorgt? Vergleichszahl {PREV}?"), null,
          { why: "Die Bilanz des Sanitätsdienstes gehört dazu." }) },
      { id: "wirt_quote", label: "O-Ton Festwirt:in", match: /festwirt|wiesnwirt|wirtin|\bwirt\b/i,
        item: approve("O-Ton einer Festwirtin oder eines Festwirts", "festwirt", null,
          script("Frage: Wie reagieren Ihre Gäste auf den Preis?\nHinweis: Das Zitat muss vor Veröffentlichung autorisiert werden."),
          { why: "Ein Wirt kommt in fast jedem Artikel zu Wort." }) },
      { id: "official_quote", label: "Stimme der Politik", match: (s) => /wiesn-?chef|festleit|wirtschaftsreferent|bürgermeister/i.test(s) || /\bOB\b/.test(s),
        item: human("Zitat Bürgermeister:in oder Festleitung", ["Wie bewerten Sie die Preise in diesem Jahr?", "Muss das Fest bezahlbar bleiben – und wie?"],
          "Politische Einordnung braucht ein persönliches Gespräch.", { why: "Politische Stimmen sind regelmäßig vertreten." }) },
      { id: "reaction", label: "Reaktionen / Kritik", match: /besucherin|ein besucher|gäste (?:ärger|schimpf|reagier)|ärgern|kritik|steuerzahler|zu teuer|happig/i,
        item: human("Stimmen von Besucher:innen (Umfrage vor Ort)", ["Was sagen Sie zum Maßpreis?", "Trinken Sie deshalb weniger?"],
          "Original-Reporting vor Ort – das kann kein Agent ersetzen.", { why: "Reaktionen geben der Geschichte ein Gesicht." }) },
    ],
  };

  /* ---------------- Haushalt ---------------- */
  const haushalt = {
    id: "haushalt",
    label: "Haushalt / Etat",
    short: "Haushalt",
    keywords: [["haushalt", 4], ["etat", 3], ["kämmerer", 3], ["kämmerin", 3], ["gewerbesteuer", 3], ["schulden", 2], ["verschuldung", 2],
      ["investitionen", 2], ["ausgaben", 2], ["einnahmen", 2], ["defizit", 2], ["stadtrat", 1], ["kreistag", 1], ["milliarden", 1], ["sparkurs", 2]],
    events: [["Stadthaushalt", /stadt/i], ["Kreishaushalt", /landkreis|kreistag/i], ["Staatshaushalt", /freistaat|landtag|staatsregierung/i]],
    contacts: {
      kaemmerei: { org: "Kämmerei – Pressestelle", email: "presse.kaemmerei@stadt.beispiel.invalid", phone: "+49 89 000000-10" },
      fraktion: { org: "Oppositionsfraktion – Pressestelle", email: "presse@fraktion.beispiel.invalid", phone: "+49 89 000000-11" },
    },
    features: [
      { id: "volume", label: "Gesamtvolumen", valueFilter: (n) => n.money && /Mrd|Mio/.test(n.unit), match: /(milliarden|mrd\.?|millionen|mio\.?)\s*(euro|€)/i,
        item: agent("Gesamtvolumen des Haushalts {YEAR}", "metric_lookup", { metric: true, source: { label: "Haushaltsplan / Ratsinformationssystem" }, why: "Jeder Artikel nennt das Gesamtvolumen." }) },
      { id: "yoy", label: "Vergleich zum Vorjahr", match: /vorjahr|im vergleich|mehr als|weniger als|steig|sink|plus|minus/i,
        item: agent("Veränderung gegenüber {PREV}", "archive_compare", { metric: true, why: "Der Vergleich zum Vorjahr ist Standard." }) },
      { id: "debt", label: "Schulden", match: /schulden|verschuld|kredit|neuverschuldung/i,
        item: agent("Schuldenstand und Neuverschuldung", "metric_lookup", { metric: true, source: { label: "Haushaltsplan, Kapitel Schulden" }, why: "Schulden werden jedes Jahr thematisiert." }) },
      { id: "invest", label: "Investitionen", match: /investition|bauprojekt|sanierung|schulbau/i,
        item: agent("Investitionen und größte Projekte", "metric_lookup", { metric: true, source: { label: "Investitionsprogramm" }, why: "Investitionen sind fester Bestandteil." }) },
      { id: "revenue", label: "Einnahmen / Gewerbesteuer", match: /gewerbesteuer|einnahmen|steuereinnahmen/i,
        item: agent("Einnahmen, v. a. Gewerbesteuer", "metric_lookup", { metric: true, source: { label: "Haushaltsplan, Einnahmenseite" }, why: "Die Einnahmenseite wird immer erklärt." }) },
      { id: "savings", label: "Sparmaßnahmen", match: /spar|kürz|streich|konsolidier/i,
        item: approve("Geplante Kürzungen und Sparmaßnahmen", "kaemmerei", mail("Presseanfrage BR: Haushalt {YEAR}", "Welche Kürzungen oder Sparmaßnahmen sind für {YEAR} geplant?"), null, { why: "Sparpläne tauchen regelmäßig auf." }) },
      { id: "reason", label: "Begründung", match: /begründ|wegen|aufgrund|grund|ursache/i,
        item: approve("Begründung der Kämmerei", "kaemmerei", mail("Presseanfrage BR: Haushalt {YEAR} – Hintergründe", "Wie begründen Sie die Entwicklung gegenüber {PREV}?"), script("Frage: Was sind die Haupttreiber der Entwicklung?"), { why: "Die Ursache wird jedes Mal erklärt." }) },
      { id: "vote", label: "Beschluss / Abstimmung", match: /beschlo|beschluss|abstimm|gegenstimme|mehrheit/i,
        item: agent("Abstimmungsergebnis im Rat", "lookup", { source: { label: "Sitzungsprotokoll" }, why: "Das Abstimmungsergebnis wird genannt." }) },
      { id: "official_quote", label: "Zitat Kämmerei / Spitze", match: /kämmer|bürgermeister|landrat|finanzminister/i,
        item: approve("O-Ton Kämmerer:in", "kaemmerei", null, script("Frage: Wie bewerten Sie die Haushaltslage?"), { why: "Die Kämmerei kommt immer zu Wort." }) },
      { id: "opposition", label: "Kritik / Opposition", match: /kritik|opposition|fraktion|bemängel|warnt/i,
        item: human("Stimme der Opposition", ["Was kritisieren Sie am Haushalt?", "Was würden Sie anders machen?"], "Politische Einordnung – persönlich anfragen.", { why: "Kritik gehört zu jedem Haushaltsbericht." }) },
    ],
  };

  /* ---------------- Wahl ---------------- */
  const wahl = {
    id: "wahl",
    label: "Wahlabend / Wahlergebnis",
    short: "Wahl",
    keywords: [["wahl", 3], ["wahlbeteiligung", 4], ["hochrechnung", 3], ["landtagswahl", 3], ["bundestagswahl", 3], ["kommunalwahl", 3],
      ["europawahl", 3], ["stimmkreis", 3], ["wahlkreis", 3], ["sitze", 2], ["prozentpunkte", 2], ["stimmen", 1], ["csu", 1], ["spd", 1], ["grüne", 1], ["freie wähler", 1], ["afd", 1]],
    events: [["Landtagswahl", /landtagswahl/i], ["Bundestagswahl", /bundestagswahl/i], ["Kommunalwahl", /kommunalwahl|stadtratswahl/i], ["Europawahl", /europawahl/i], ["Wahl", /wahl/i]],
    contacts: {
      wahlamt: { org: "Wahlamt / Wahlleitung", email: "presse@wahlamt.beispiel.invalid", phone: "+49 89 000000-20" },
      partei: { org: "Parteien – Pressestellen", email: "presse@partei.beispiel.invalid", phone: "+49 89 000000-21" },
    },
    features: [
      { id: "turnout", label: "Wahlbeteiligung", valueFilter: (n) => n.unit === "%", match: /wahlbeteiligung/i,
        item: agent("Wahlbeteiligung {YEAR} im Vergleich", "metric_lookup", { metric: true, source: { label: "Landeswahlleitung", url: "https://www.wahlen.bayern.de" }, why: "Die Beteiligung wird immer genannt." }) },
      { id: "results", label: "Ergebnisse der Parteien", match: /(csu|spd|grüne|freie wähler|afd|fdp|linke)[^.]{0,60}\d+[.,]?\d*\s*(prozent|%)/i,
        item: agent("Ergebnisse aller Parteien", "metric_lookup", { metric: true, source: { label: "Landeswahlleitung", url: "https://www.wahlen.bayern.de" }, why: "Die Ergebnisse sind der Kern." }) },
      { id: "change", label: "Gewinne und Verluste", match: /prozentpunkte|zugelegt|verloren|verlust|gewinn|im vergleich/i,
        item: agent("Gewinne und Verluste gegenüber der letzten Wahl", "archive_compare", { metric: true, why: "Veränderungen werden immer eingeordnet." }) },
      { id: "seats", label: "Sitzverteilung", match: /sitze|mandat|sitzverteilung/i,
        item: agent("Sitzverteilung", "lookup", { source: { label: "Landeswahlleitung" }, why: "Die Sitzverteilung folgt aus dem Ergebnis." }) },
      { id: "district", label: "Ergebnisse vor Ort", match: /stimmkreis|wahlkreis|gemeinde|landkreis/i,
        item: approve("Ergebnisse im Stimmkreis / Ort", "wahlamt", mail("Presseanfrage BR: Ergebnisse {EVENT}", "Bitte senden Sie uns die Ergebnisse für unser Sendegebiet inkl. Vergleich zu {PREV}."), null, { why: "Regionale Ergebnisse tauchen wiederholt auf." }) },
      { id: "coalition", label: "Koalition / Regierung", match: /koalition|regierung|bündnis|sondierung/i,
        item: human("Einordnung: Koalitionsoptionen", ["Welche Bündnisse sind realistisch?"], "Analyse durch die Redaktion.", { why: "Machtoptionen werden immer diskutiert." }) },
      { id: "candidate_quote", label: "Stimmen der Kandidierenden", match: /„|"|sagte|erklärte/i,
        item: human("O-Töne der Spitzenkandidierenden", ["Wie bewerten Sie das Ergebnis?"], "Vor Ort auf der Wahlparty einholen.", { why: "Jeder Wahlbericht hat O-Töne." }) },
    ],
  };

  /* ---------------- Saisonstart ---------------- */
  const saison = {
    id: "saisonstart",
    label: "Saisonstart",
    short: "Saisonstart",
    keywords: [["saison", 3], ["saisonstart", 4], ["freibad", 3], ["badesaison", 3], ["skisaison", 3], ["eröffn", 2], ["öffnet", 2],
      ["eintritt", 2], ["öffnungszeiten", 3], ["wassertemperatur", 3], ["schneehöhe", 3], ["bergbahn", 2], ["liftpass", 2], ["tageskarte", 2], ["bademeister", 2]],
    events: [["Freibadsaison", /freibad|badesaison/i], ["Skisaison", /ski|lift|bergbahn/i], ["Biergartensaison", /biergarten/i], ["Saison", /saison/i]],
    contacts: {
      betreiber: { org: "Betreiber – Pressestelle", email: "presse@betreiber.beispiel.invalid", phone: "+49 89 000000-30" },
    },
    features: [
      { id: "date", label: "Startdatum", match: /(öffnet|startet|eröffn|beginnt|saisonstart)[^.]{0,60}(\d{1,2}\.|januar|februar|märz|april|mai|juni|juli|august|september|oktober|november|dezember|wochenende)/i,
        item: agent("Startdatum {YEAR}", "lookup", { source: { label: "Website des Betreibers" }, why: "Der Starttermin ist die Nachricht." }) },
      { id: "prices", label: "Eintrittspreise", valueFilter: (n) => n.money, match: (s) => PRICE.test(s) && /eintritt|ticket|karte|preis|kostet/i.test(s),
        item: agent("Eintrittspreise {YEAR}", "metric_lookup", { metric: true, source: { label: "Preisliste des Betreibers" }, why: "Preise werden jedes Jahr verglichen." }) },
      { id: "yoy", label: "Vergleich zum Vorjahr", match: /vorjahr|im vergleich|teurer|günstiger|gleich geblieben|erhöh/i,
        item: agent("Preisänderung gegenüber {PREV}", "archive_compare", { metric: true, why: "Der Vergleich zum Vorjahr ist Standard." }) },
      { id: "hours", label: "Öffnungszeiten", match: /öffnungszeit|geöffnet|von \d{1,2}(:\d{2})? bis \d{1,2}/i,
        item: agent("Öffnungszeiten", "lookup", { source: { label: "Website des Betreibers" }, why: "Öffnungszeiten werden immer genannt." }) },
      { id: "conditions", label: "Bedingungen (Wetter, Wasser, Schnee)", match: /wassertemperatur|grad|schnee|wetter|pisten/i,
        item: agent("Aktuelle Bedingungen (Wetter / Wasser / Schnee)", "lookup", { source: { label: "Wetterdienst / Betreiber" }, why: "Die Bedingungen gehören zum Saisonstart." }) },
      { id: "staff", label: "Personal", match: /personal|fachkräfte|bademeister|rettungsschwimmer|mitarbeiter/i,
        item: approve("Personallage beim Betreiber", "betreiber", mail("Presseanfrage BR: Saisonstart {YEAR}", "Haben Sie genug Personal für die Saison {YEAR}? Gibt es Einschränkungen?"), script("Frage: Gibt es Personalengpässe?"), { why: "Personalmangel ist ein wiederkehrendes Thema." }) },
      { id: "news", label: "Neuerungen", match: /neu|erstmals|umgebaut|saniert|modernisiert/i,
        item: approve("Neuerungen in dieser Saison", "betreiber", mail("Presseanfrage BR: Neuerungen {YEAR}", "Was ist in der Saison {YEAR} neu?"), null, { why: "Neuerungen werden jedes Jahr vorgestellt." }) },
      { id: "reaction", label: "Stimmen der Gäste", match: /besucher|gäste|badegäste|skifahrer|freuen|stammgast/i,
        item: human("Stimmen der ersten Gäste", ["Was freut Sie an der neuen Saison?"], "Vor Ort am ersten Tag.", { why: "Gäste kommen in jedem Artikel vor." }) },
    ],
  };

  /* ---------------- Jahresbilanz ---------------- */
  const bilanz = {
    id: "jahresbilanz",
    label: "Jahresbilanz / Statistik",
    short: "Bilanz",
    keywords: [["bilanz", 3], ["statistik", 3], ["kriminalstatistik", 4], ["unfallstatistik", 4], ["jahresbilanz", 4], ["fallzahlen", 3],
      ["aufklärungsquote", 4], ["übernachtungen", 3], ["gästezahlen", 3], ["verkehrstote", 3], ["einsätze", 2], ["rückgang", 1], ["anstieg", 1], ["straftaten", 3]],
    events: [["Kriminalstatistik", /kriminal|straftat/i], ["Unfallstatistik", /unfall|verkehrstote/i], ["Tourismusbilanz", /übernachtung|tourismus|gäste/i], ["Jahresbilanz", /bilanz/i]],
    contacts: {
      behoerde: { org: "Behörde – Pressestelle", email: "presse@behoerde.beispiel.invalid", phone: "+49 89 000000-40" },
    },
    features: [
      { id: "headline", label: "Kernzahl", valueFilter: (n) => !!n.noun && n.unit !== "%", match: /\d[\d.,]*\s*(fälle|straftaten|übernachtungen|unfälle|einsätze|verkehrstote|gäste)/i,
        item: agent("Kernzahl {YEAR}", "metric_lookup", { metric: true, source: { label: "Offizielle Statistik der Behörde" }, why: "Die Kernzahl steht in jedem Artikel." }) },
      { id: "yoy", label: "Vergleich zum Vorjahr", match: /vorjahr|im vergleich|rückgang|anstieg|gestiegen|gesunken|plus|minus/i,
        item: agent("Veränderung gegenüber {PREV}", "archive_compare", { metric: true, why: "Der Vergleich ist Standard." }) },
      { id: "rate", label: "Quote / Anteil", valueFilter: (n) => n.unit === "%" && !n.noun, match: /quote|anteil|prozent|%/i,
        item: agent("Quoten und Anteile", "metric_lookup", { metric: true, source: { label: "Offizielle Statistik" }, why: "Quoten werden regelmäßig berichtet." }) },
      { id: "breakdown", label: "Aufschlüsselung", match: /davon|darunter|bereich|delikt|kategorie|besonders/i,
        item: agent("Aufschlüsselung nach Bereichen", "lookup", { source: { label: "Statistik, Detailtabellen" }, why: "Details werden immer aufgeschlüsselt." }) },
      { id: "reason", label: "Erklärung der Entwicklung", match: /begründ|wegen|aufgrund|erklär|ursache|grund/i,
        item: approve("Erklärung der Behörde", "behoerde", mail("Presseanfrage BR: Bilanz {YEAR}", "Wie erklären Sie die Entwicklung gegenüber {PREV}?"), script("Frage: Was sind die Gründe für die Entwicklung?"), { why: "Die Behörde erklärt die Zahlen." }) },
      { id: "measures", label: "Maßnahmen", match: /maßnahme|prävention|geplant|künftig|will|soll/i,
        item: approve("Geplante Maßnahmen", "behoerde", mail("Presseanfrage BR: Maßnahmen {YEAR}", "Welche Maßnahmen sind geplant?"), null, { why: "Maßnahmen werden regelmäßig angekündigt." }) },
      { id: "official_quote", label: "Zitat Behördenspitze", match: /präsident|minister|leiter|chef/i,
        item: human("O-Ton der Behördenspitze", ["Wie bewerten Sie die Zahlen?"], "Bei der Pressekonferenz einholen.", { why: "Die Spitze kommt immer zu Wort." }) },
      { id: "critic", label: "Einordnung / Kritik", match: /kritik|experte|expertin|gewerkschaft|verband|warnt/i,
        item: human("Unabhängige Einordnung", ["Wie belastbar sind die Zahlen?"], "Expert:in oder Verband anfragen.", { why: "Einordnung von außen ist üblich." }) },
    ],
  };

  RR.BLUEPRINTS = [volksfest, haushalt, wahl, saison, bilanz];

  // Allgemeine Antworten / Transkripte für die Simulation
  RR.SIM_TEXT = {
    reply: {
      polizei: "Sehr geehrte Damen und Herren,\n\nTäglich sind rund 600 Beamtinnen und Beamte im Einsatz, an Spitzentagen bis zu 750. Das Sicherheitskonzept umfasst Taschenkontrollen an allen Eingängen.\n\nMit freundlichen Grüßen\nPressestelle",
      wirte: "Hallo,\n\ndie Erhöhung begründen die Wirte mit gestiegenen Personal- und Energiekosten sowie höheren Einkaufspreisen der Brauereien. Ein Zitat stimmen wir gern telefonisch ab.\n\nBeste Grüße",
      stadt: "Guten Tag,\n\nwir rechnen in diesem Jahr mit rund 6,5 Millionen Besucherinnen und Besuchern. Die Bilanz des Vorjahres lag bei 6,7 Millionen.\n\nFreundliche Grüße",
      rettung: "Hallo,\n\nim Vorjahr wurden rund 7.000 Patientinnen und Patienten versorgt. Die aktuelle Bilanz folgt nach Ende des Festes.\n\nViele Grüße",
      generic: "Guten Tag,\n\nvielen Dank für Ihre Anfrage. Die gewünschten Angaben finden Sie unten; weitere Details senden wir bis morgen.\n\nFreundliche Grüße",
    },
    transcript: {
      polizei: "[00:00] Agent: Guten Tag, hier ist der Recherche-Assistent der BR-Redaktion. Darf ich das Gespräch aufzeichnen?\n[00:05] Pressestelle: Ja, einverstanden.\n[00:08] Agent: Wie viele Einsatzkräfte sind im Dienst?\n[00:13] Pressestelle: Täglich etwa 600, an Spitzentagen bis 750.\n[00:20] Agent: Was ändert sich am Sicherheitskonzept?\n[00:25] Pressestelle: Neu sind zusätzliche Kameras am Haupteingang.\n[00:31] Agent: Vielen Dank.",
      wirte: "[00:00] Agent: Guten Tag, Recherche-Assistent der BR-Redaktion. Darf ich aufzeichnen?\n[00:04] Sprecherin: Passt.\n[00:06] Agent: Warum steigt der Preis?\n[00:10] Sprecherin: Personal, Energie, die Brauerei – alles ist teurer. Wir geben nur einen Teil weiter.\n[00:18] Agent: Danke, die Redaktion meldet sich für ein autorisiertes Zitat.",
      festwirt: "[00:00] Agent: Guten Tag, Recherche-Assistent der BR-Redaktion. Darf ich aufzeichnen?\n[00:04] Festwirt: Ja.\n[00:06] Agent: Wie reagieren Ihre Gäste auf den Preis?\n[00:10] Festwirt: Die meisten nehmen's gelassen. Wer einmal im Jahr kommt, will feiern.\n[00:17] Agent: Danke – das Zitat schicken wir Ihnen zur Freigabe.",
      generic: "[00:00] Agent: Guten Tag, Recherche-Assistent der BR-Redaktion. Darf ich das Gespräch aufzeichnen?\n[00:05] Gegenüber: Ja, bitte.\n[00:07] Agent: Wir bitten um aktuelle Zahlen und eine kurze Einordnung.\n[00:12] Gegenüber: Die Zahlen schicken wir Ihnen bis morgen schriftlich.",
    },
  };

  RR.GENERIC_CONTACT = { org: "Pressestelle (bitte ergänzen)", email: "presse@beispiel.invalid", phone: "+49 000 000000" };
})();
