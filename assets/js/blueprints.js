/*
 * Blueprints: Wiederkehrende Story-Typen.
 * Jedes "feature" ist ein Baustein, der in alten Artikeln gesucht wird.
 * Taucht es in mehreren Artikeln auf, wird daraus ein Checklisten-Punkt.
 *
 * Kategorien:
 *   agent   – Agent erledigt selbst
 *   approve – Agent bereitet vor, Freigabe durch Journalist:in nötig
 *   human   – nur Journalist:in
 */
(function () {
  const RR = (window.RR = window.RR || {});

  const has = (re) => (a) => re.test(a.text);

  const wiesn = {
    id: "wiesn-bierpreis",
    label: "Wiesn – Bierpreis",
    icon: "🍺",
    keywords: [
      ["wiesn", 3], ["oktoberfest", 3], ["maß", 3], ["bierpreis", 4], ["festzelt", 2],
      ["wiesnwirt", 2], ["theresienwiese", 2], ["bierzelt", 1], ["anstich", 1], ["o'zapft", 1],
    ],
    features: [
      {
        id: "price_tents",
        label: "Maßpreis pro Festzelt",
        test: (a) => a.facts.prices.length > 0 && a.facts.tents.length > 0,
        item: {
          title: "Maßpreis in allen Festzelten {YEAR}",
          category: "agent",
          action: "tent_prices",
          why: "In den Artikeln werden Preise einzelner Zelte genannt.",
        },
      },
      {
        id: "price_range",
        label: "Preisspanne günstigstes / teuerstes Zelt",
        test: (a) => /günstigst|teuerst|billigst|zwischen\s+\d+[.,]\d+\s*(?:€|euro)?\s+und|spanne|bis zu \d+[.,]\d+/i.test(a.text) || a.facts.prices.length >= 2,
        item: {
          title: "Preisspanne: günstigstes und teuerstes Zelt",
          category: "agent",
          action: "price_range",
          why: "Jeder Artikel nennt Minimum und Maximum.",
        },
      },
      {
        id: "yoy",
        label: "Vergleich zum Vorjahr",
        test: (a) => /vorjahr|im vergleich|gestiegen|teurer als|erhöh|letztes jahr|plus von/i.test(a.text) || a.facts.percents.length > 0,
        item: {
          title: "Veränderung zum Vorjahr in % ({PREV} → {YEAR})",
          category: "agent",
          action: "yoy",
          why: "Die Preissteigerung zum Vorjahr ist ein fester Bestandteil.",
        },
      },
      {
        id: "history",
        label: "Historische Einordnung",
        test: (a) => a.facts.years.length >= 3 || /vor zehn jahren|vor \d+ jahren|seit \d{4}|rekord|erstmals|historisch/i.test(a.text),
        item: {
          title: "Historische Preisreihe (Archiv + aktuell)",
          category: "agent",
          action: "history",
          why: "Artikel ordnen den Preis über mehrere Jahre ein.",
        },
      },
      {
        id: "soft_drinks",
        label: "Preise alkoholfreie Getränke",
        test: has(/alkoholfrei|wasser|spezi|limo|softdrink/i),
        item: {
          title: "Preise alkoholfreie Getränke (Wasser, Spezi)",
          category: "agent",
          action: "soft_drinks",
          why: "Wasser-/Spezi-Preise werden regelmäßig mit genannt.",
        },
      },
      {
        id: "reason",
        label: "Begründung der Wirte",
        test: has(/begründ|wegen|aufgrund|gestiegene[n]? kosten|energie|personal|inflation|kosten/i),
        item: {
          title: "Offizielle Begründung der Preiserhöhung",
          category: "approve",
          contact: "wirte",
          channels: ["email", "call"],
          email: {
            subject: "Presseanfrage BR: Begründung Maßpreis Wiesn {YEAR}",
            body: "Sehr geehrte Damen und Herren,\n\nfür unsere Berichterstattung zum Oktoberfest {YEAR} bitten wir um eine kurze Stellungnahme: Womit begründen die Wiesnwirte die diesjährigen Maßpreise im Vergleich zu {PREV}?\n\nUm Antwort bis morgen, 12 Uhr, wird gebeten.\n\nMit freundlichen Grüßen\nBR-Redaktion",
          },
          call: { script: "Vorstellen, Aufzeichnung ankündigen und Zustimmung einholen.\nFrage: Womit begründen die Wirte die Preise {YEAR}?\nNachfrage: Welcher Kostenfaktor wiegt am schwersten?" },
          why: "Die Begründung für die Preise kommt jedes Jahr von den Wirten.",
        },
      },
      {
        id: "security",
        label: "Sicherheit / Polizei",
        test: has(/polizei|sicherheit|einsatzkräfte|ordner|beamt|security|taschenkontroll/i),
        item: {
          title: "Polizei: Zahl der Einsatzkräfte & Sicherheitskonzept",
          category: "approve",
          contact: "polizei",
          channels: ["email", "call"],
          email: {
            subject: "Presseanfrage BR: Sicherheitslage Oktoberfest {YEAR}",
            body: "Sehr geehrte Damen und Herren,\n\nfür unsere Berichterstattung zum Oktoberfest {YEAR} bitten wir um folgende Angaben:\n1. Wie viele Einsatzkräfte sind täglich im Dienst?\n2. Gibt es Änderungen am Sicherheitskonzept gegenüber {PREV}?\n\nVielen Dank und freundliche Grüße\nBR-Redaktion",
          },
          call: { script: "Vorstellen, Aufzeichnung ankündigen und Zustimmung einholen.\n1. Anzahl Einsatzkräfte pro Tag / an Spitzentagen?\n2. Änderungen am Sicherheitskonzept?" },
          why: "Polizeiangaben zur Sicherheit tauchen regelmäßig auf.",
        },
      },
      {
        id: "visitors",
        label: "Besucherzahlen",
        test: has(/besucher|millionen gäste|\d+[.,]?\d*\s*millionen/i),
        item: {
          title: "Besucherzahlen / Prognose der Stadt",
          category: "approve",
          contact: "stadt",
          channels: ["email"],
          email: {
            subject: "Presseanfrage BR: Besucherprognose Oktoberfest {YEAR}",
            body: "Guten Tag,\n\nmit wie vielen Besucherinnen und Besuchern rechnet die Stadt beim Oktoberfest {YEAR}? Wie lautete die Bilanz für {PREV}?\n\nFreundliche Grüße\nBR-Redaktion",
          },
          why: "Besucherzahlen werden fast immer genannt.",
        },
      },
      {
        id: "medical",
        label: "Sanitäts- / Rettungsdienst",
        test: has(/sanitäter|rettungsdienst|rotes kreuz|\bbrk\b|alkoholvergiftung|patient/i),
        item: {
          title: "Sanitätsdienst: Einsatzbilanz",
          category: "approve",
          contact: "rettung",
          channels: ["email"],
          email: {
            subject: "Presseanfrage BR: Einsatzbilanz Sanitätsdienst Wiesn {YEAR}",
            body: "Guten Tag,\n\nkönnen Sie uns die aktuellen Einsatzzahlen des Sanitätsdienstes zur Wiesn {YEAR} sowie die Vergleichszahl für {PREV} nennen?\n\nFreundliche Grüße\nBR-Redaktion",
          },
          why: "Die Bilanz des Sanitätsdienstes gehört zur Wiesn-Berichterstattung.",
        },
      },
      {
        id: "wirt_quote",
        label: "O-Ton Festwirt:in",
        test: (a) => a.facts.quotes.some((q) => /wirt/i.test(q.context)) || /festwirt|wiesnwirt|wirtin|\bwirt\b/i.test(a.text),
        item: {
          title: "O-Ton einer Festwirtin / eines Festwirts",
          category: "approve",
          contact: "festwirt",
          channels: ["call"],
          call: { script: "Vorstellen, Aufzeichnung ankündigen und Zustimmung einholen.\nFrage: Wie reagieren Ihre Gäste auf den Preis?\nHinweis: Das Zitat muss vor Veröffentlichung von der Redaktion autorisiert werden." },
          why: "Ein Wirt kommt in fast jedem Artikel zu Wort.",
        },
      },
      {
        id: "official_quote",
        label: "Stellungnahme Wiesnchef:in / OB",
        test: (a) => /wiesn-?chef|wirtschaftsreferent|bürgermeister/i.test(a.text) || /\bOB\b/.test(a.text),
        item: {
          title: "Zitat Bürgermeister:in / Wiesnchef:in",
          category: "human",
          questions: ["Wie bewerten Sie die Preise in diesem Jahr?", "Muss die Wiesn bezahlbar bleiben – und wie?"],
          hint: "Politische Einordnung – braucht ein persönliches Gespräch und Gegenlesen.",
          why: "Politische Stimmen sind in den Artikeln vertreten.",
        },
      },
      {
        id: "reaction",
        label: "Reaktionen von Besucher:innen / Kritik",
        test: has(/besucherin|besucher sagt|gäste|ärger|kritik|steuerzahler|zu teuer|reaktion|schimpf/i),
        item: {
          title: "Stimmen von Besucher:innen (Straßenumfrage)",
          category: "human",
          questions: ["Was sagen Sie zum Maßpreis?", "Trinken Sie deshalb weniger?"],
          hint: "Original-Reporting vor Ort – kann kein Agent ersetzen.",
          why: "Reaktionen geben der Geschichte ihr Gesicht.",
        },
      },
    ],
  };

  const generic = {
    id: "generic",
    label: "Wiederkehrende Geschichte (allgemein)",
    icon: "🔁",
    keywords: [],
    features: [
      {
        id: "numbers",
        label: "Kennzahlen (Beträge / Prozente)",
        test: (a) => a.facts.prices.length + a.facts.percents.length > 0,
        item: { title: "Kennzahlen aus dem Archiv zusammentragen (Vergleichsbasis)", category: "agent", action: "archive_numbers", why: "Alle Artikel arbeiten mit Zahlen." },
      },
      {
        id: "current_numbers",
        label: "Aktuelle Zahlen",
        test: (a) => a.facts.prices.length + a.facts.percents.length > 0,
        item: { title: "Aktuelle Zahl aus offizieller Quelle {YEAR}", category: "agent", action: "lookup", why: "Jeder Artikel braucht den aktuellen Wert." },
      },
      {
        id: "comparison",
        label: "Vergleich mit Vorjahr / früher",
        test: has(/vorjahr|im vergleich|gestiegen|gesunken|mehr als|weniger als|zuvor/i),
        item: { title: "Veränderung gegenüber dem Vorjahr berechnen", category: "agent", action: "archive_numbers", why: "Der Vergleich ist ein fester Bestandteil." },
      },
      {
        id: "timeline",
        label: "Zeitliche Einordnung",
        test: (a) => a.facts.years.length >= 2,
        item: { title: "Zeitreihe aus dem Archiv", category: "agent", action: "archive_years", why: "Artikel verweisen auf frühere Jahre." },
      },
      {
        id: "institution",
        label: "Offizielle Stellungnahme",
        test: (a) => a.facts.institutions.length > 0,
        item: {
          title: "Offizielle Stellungnahme anfragen",
          category: "approve",
          contact: "generic",
          channels: ["email", "call"],
          email: { subject: "Presseanfrage BR: aktuelle Angaben {YEAR}", body: "Guten Tag,\n\nfür unsere Berichterstattung bitten wir um aktuelle Zahlen für {YEAR} sowie die Vergleichswerte aus {PREV}.\n\nFreundliche Grüße\nBR-Redaktion" },
          call: { script: "Vorstellen, Aufzeichnung ankündigen und Zustimmung einholen.\nBitte um aktuelle Zahlen und eine kurze Einordnung." },
          why: "Institutionen kommen regelmäßig zu Wort.",
        },
      },
      {
        id: "reason",
        label: "Begründung / Ursache",
        test: has(/begründ|wegen|aufgrund|ursache|grund dafür/i),
        item: { title: "Begründung der Entwicklung einholen", category: "approve", contact: "generic", channels: ["email"], email: { subject: "Presseanfrage BR: Hintergründe {YEAR}", body: "Guten Tag,\n\nwomit begründen Sie die aktuelle Entwicklung im Vergleich zu {PREV}?\n\nFreundliche Grüße\nBR-Redaktion" }, why: "Ursachen werden in jedem Artikel erklärt." },
      },
      {
        id: "quote",
        label: "Zitate",
        test: (a) => a.facts.quotes.length > 0,
        item: { title: "Zitat einer zentralen Person", category: "human", questions: ["Wie bewerten Sie die Entwicklung?"], hint: "Persönliches Gespräch nötig.", why: "Alle Artikel enthalten Zitate." },
      },
      {
        id: "reaction",
        label: "Reaktionen / Kritik",
        test: has(/kritik|reaktion|ärger|empör|freu|begrüß|bemängel/i),
        item: { title: "Reaktionen Betroffener einholen", category: "human", questions: ["Was bedeutet das für Sie?"], hint: "Original-Reporting.", why: "Reaktionen tauchen wiederholt auf." },
      },
    ],
  };

  RR.BLUEPRINTS = [wiesn];
  RR.GENERIC_BLUEPRINT = generic;
})();
