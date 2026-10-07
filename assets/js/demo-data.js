/*
 * Demo-Daten für den Offline-Prototyp.
 * ALLE Preise, Kontakte, Antworten und Transkripte sind SIMULIERT.
 * Sie dienen nur dazu, den Workflow zu zeigen – nicht als Fakten.
 */
(function () {
  const RR = (window.RR = window.RR || {});

  const CITY_SOURCE = {
    label: "Bierpreisliste der Stadt München (oktoberfest.de)",
    url: "https://www.oktoberfest.de",
  };

  RR.DEMO = {
    citySource: CITY_SOURCE,

    // Festzelte: Aliase dienen der Erkennung in den hochgeladenen Artikeln.
    // prev/curr = simulierte Maßpreise Vorjahr / aktuelles Jahr.
    tents: [
      { id: "hacker", name: "Hacker-Festzelt", aliases: ["hacker-festzelt", "hackerzelt", "hacker-zelt"], url: "https://www.hacker-festzelt.de", prev: 15.5, curr: 16.1 },
      { id: "schottenhamel", name: "Schottenhamel", aliases: ["schottenhamel"], url: "https://www.schottenhamel.de", prev: 15.5, curr: 15.95 },
      { id: "hofbraeu", name: "Hofbräu-Festzelt", aliases: ["hofbräu-festzelt", "hofbräuzelt", "hofbräu-zelt", "hofbräu"], url: null, prev: 15.6, curr: 16.2 },
      { id: "augustiner", name: "Augustiner-Festhalle", aliases: ["augustiner-festhalle", "augustiner"], url: null, prev: 15.2, curr: 15.8 },
      { id: "paulaner", name: "Paulaner Festzelt", aliases: ["paulaner festzelt", "paulaner-festzelt", "winzerer fähndl", "paulaner"], url: null, prev: 15.4, curr: 15.9 },
      { id: "loewenbraeu", name: "Löwenbräu-Festzelt", aliases: ["löwenbräu-festzelt", "löwenbräuzelt", "löwenbräu"], url: null, prev: 15.6, curr: 16.15 },
      { id: "schuetzen", name: "Schützen-Festzelt", aliases: ["schützen-festzelt", "schützenfestzelt", "schützenzelt"], url: null, prev: 15.35, curr: 15.9 },
      { id: "armbrust", name: "Armbrustschützenzelt", aliases: ["armbrustschützenzelt", "armbrustschützen"], url: "https://www.armbrustschuetzenzelt.de", prev: 15.45, curr: 15.95 },
      { id: "kaefer", name: "Käfer Wiesn-Schänke", aliases: ["käfer wiesn-schänke", "käfer"], url: null, prev: 15.8, curr: 16.4 },
      { id: "ochsen", name: "Ochsenbraterei", aliases: ["ochsenbraterei"], url: "https://www.ochsenbraterei.de", prev: 15.5, curr: 16.0 },
      { id: "vroni", name: "Fischer-Vroni", aliases: ["fischer-vroni", "fischer vroni"], url: "https://www.fischer-vroni.de", prev: 15.5, curr: 16.05 },
      { id: "marstall", name: "Marstall", aliases: ["marstall"], url: null, prev: 15.6, curr: 16.1 },
      { id: "tradition", name: "Festzelt Tradition (Oide Wiesn)", aliases: ["festzelt tradition", "oide wiesn"], url: "https://www.festzelt-tradition.de", prev: 14.6, curr: 14.9 },
    ],

    // Simulierte Preise für alkoholfreie Getränke (1 Liter)
    softDrinks: [
      { tent: "Hacker-Festzelt", water: 10.9, spezi: 12.2 },
      { tent: "Schottenhamel", water: 10.5, spezi: 11.9 },
      { tent: "Augustiner-Festhalle", water: 10.6, spezi: 12.0 },
      { tent: "Festzelt Tradition (Oide Wiesn)", water: 9.9, spezi: 11.4 },
    ],

    // Kontakte – bewusst Platzhalter (.invalid / 000), keine echten Daten
    contacts: {
      polizei: { org: "Polizeipräsidium München – Pressestelle", email: "pressestelle@polizei-muenchen.beispiel.invalid", phone: "+49 89 000000-0 (Demo)" },
      wirte: { org: "Sprecher:in der Wiesnwirte", email: "presse@wiesnwirte.beispiel.invalid", phone: "+49 89 000000-1 (Demo)" },
      stadt: { org: "Stadt München – Veranstaltungsbüro Oktoberfest", email: "presse.oktoberfest@muenchen.beispiel.invalid", phone: "+49 89 000000-2 (Demo)" },
      festwirt: { org: "Festwirt:in (z. B. Schottenhamel)", email: "info@festzelt.beispiel.invalid", phone: "+49 89 000000-3 (Demo)" },
      rettung: { org: "Rettungsdienst / Sanitätsdienst Wiesn – Presse", email: "presse@sanitaeter.beispiel.invalid", phone: "+49 89 000000-4 (Demo)" },
      generic: { org: "Pressestelle (bitte ergänzen)", email: "presse@beispiel.invalid", phone: "+49 000 000000 (Demo)" },
    },

    replies: {
      polizei:
        "Sehr geehrte Damen und Herren,\n\nzur diesjährigen Wiesn sind täglich rund 600 Beamtinnen und Beamte im Einsatz, an Spitzentagen bis zu 750. Das Sicherheitskonzept umfasst Taschenkontrollen an allen Eingängen sowie ein Rucksackverbot.\n\nMit freundlichen Grüßen\nPressestelle (SIMULIERTE ANTWORT)",
      wirte:
        "Hallo,\n\ndie Erhöhung begründen die Wirte mit gestiegenen Personal- und Energiekosten sowie höheren Einkaufspreisen der Brauereien. Ein Zitat kann gerne telefonisch abgestimmt werden.\n\nBeste Grüße (SIMULIERTE ANTWORT)",
      stadt:
        "Guten Tag,\n\ndie Stadt rechnet in diesem Jahr mit rund 6,5 Millionen Besucherinnen und Besuchern. Die offizielle Bierpreisliste ist auf oktoberfest.de veröffentlicht.\n\nFreundliche Grüße (SIMULIERTE ANTWORT)",
      rettung:
        "Hallo,\n\nim Vorjahr wurden rund 7.000 Patientinnen und Patienten versorgt. Die Bilanz für dieses Jahr folgt nach Wiesn-Ende.\n\nViele Grüße (SIMULIERTE ANTWORT)",
      generic:
        "Guten Tag,\n\nvielen Dank für Ihre Anfrage. Die gewünschten Zahlen senden wir Ihnen bis morgen zu.\n\nFreundliche Grüße (SIMULIERTE ANTWORT)",
    },

    transcripts: {
      polizei:
        "[00:00] Agent: Guten Tag, hier ist der Recherche-Assistent im Auftrag der BR-Redaktion. Das Gespräch wird mit Ihrer Zustimmung aufgezeichnet.\n[00:06] Pressestelle: Ja, einverstanden.\n[00:09] Agent: Wie viele Einsatzkräfte sind zur Wiesn im Dienst?\n[00:14] Pressestelle: Täglich etwa 600, an Spitzentagen bis 750.\n[00:20] Agent: Gibt es Änderungen am Sicherheitskonzept gegenüber dem Vorjahr?\n[00:25] Pressestelle: Das Messerverbot gilt weiterhin, neu sind zusätzliche Videokameras am Haupteingang.\n[00:33] Agent: Vielen Dank. (SIMULIERTES TRANSKRIPT)",
      wirte:
        "[00:00] Agent: Guten Tag, Recherche-Assistent im Auftrag der BR-Redaktion, das Gespräch wird mit Ihrer Zustimmung aufgezeichnet.\n[00:05] Wirt: Passt.\n[00:07] Agent: Warum steigt der Maßpreis in diesem Jahr?\n[00:11] Wirt: Personal, Energie, die Brauerei – alles ist teurer geworden. Wir geben nur einen Teil weiter.\n[00:19] Agent: Danke, die Redaktion meldet sich für ein autorisiertes Zitat. (SIMULIERTES TRANSKRIPT)",
      generic:
        "[00:00] Agent: Guten Tag, Recherche-Assistent im Auftrag der BR-Redaktion, das Gespräch wird mit Ihrer Zustimmung aufgezeichnet.\n[00:06] Gegenüber: Ja, bitte.\n[00:08] Agent: Wir bitten um aktuelle Zahlen und eine kurze Einordnung.\n[00:13] Gegenüber: Wir schicken Ihnen das schriftlich bis morgen. (SIMULIERTES TRANSKRIPT)",
    },
  };
})();
