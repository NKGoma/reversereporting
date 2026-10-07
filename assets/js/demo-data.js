/*
 * Demo-Daten für den Offline-Modus.
 * Preise der aktuellen Saison sind SIMULIERT und als "Demo" gekennzeichnet.
 * Im KI-Modus werden sie durch echte Websuche ersetzt.
 */
(function () {
  const RR = (window.RR = window.RR || {});

  RR.DEMO = {
    citySource: { label: "oktoberfest.de · Preisliste", url: "https://www.oktoberfest.de" },

    // Wiesn-Festzelte. Aliase dienen der Erkennung im Text; prev/curr = simulierte Maßpreise.
    tents: [
      { name: "Hacker-Festzelt", aliases: ["hacker-festzelt", "hackerzelt", "hacker-zelt"], url: "https://www.hacker-festzelt.de", prev: 15.5, curr: 16.1 },
      { name: "Schottenhamel", aliases: ["schottenhamel"], url: "https://www.schottenhamel.de", prev: 15.5, curr: 15.95 },
      { name: "Hofbräu-Festzelt", aliases: ["hofbräu-festzelt", "hofbräuzelt", "hofbräu-zelt"], url: null, prev: 15.6, curr: 16.2 },
      { name: "Augustiner-Festhalle", aliases: ["augustiner-festhalle", "augustiner"], url: null, prev: 15.2, curr: 15.8 },
      { name: "Paulaner Festzelt", aliases: ["paulaner festzelt", "paulaner-festzelt", "winzerer fähndl"], url: null, prev: 15.4, curr: 15.9 },
      { name: "Löwenbräu-Festzelt", aliases: ["löwenbräu-festzelt", "löwenbräuzelt"], url: null, prev: 15.6, curr: 16.15 },
      { name: "Schützen-Festzelt", aliases: ["schützen-festzelt", "schützenfestzelt", "schützenzelt"], url: null, prev: 15.35, curr: 15.9 },
      { name: "Armbrustschützenzelt", aliases: ["armbrustschützenzelt"], url: "https://www.armbrustschuetzenzelt.de", prev: 15.45, curr: 15.95 },
      { name: "Käfer Wiesn-Schänke", aliases: ["käfer wiesn-schänke", "käfer"], url: null, prev: 15.8, curr: 16.4 },
      { name: "Ochsenbraterei", aliases: ["ochsenbraterei"], url: "https://www.ochsenbraterei.de", prev: 15.5, curr: 16.0 },
      { name: "Fischer-Vroni", aliases: ["fischer-vroni", "fischer vroni"], url: "https://www.fischer-vroni.de", prev: 15.5, curr: 16.05 },
      { name: "Marstall", aliases: ["marstall"], url: null, prev: 15.6, curr: 16.9 },
      { name: "Festzelt Tradition", aliases: ["festzelt tradition", "oide wiesn"], url: "https://www.festzelt-tradition.de", prev: 14.6, curr: 14.9 },
    ],

    softDrinks: [
      { tent: "Hacker-Festzelt", water: 10.9, spezi: 12.2 },
      { tent: "Schottenhamel", water: 10.5, spezi: 11.9 },
      { tent: "Augustiner-Festhalle", water: 10.6, spezi: 12.0 },
      { tent: "Festzelt Tradition", water: 9.9, spezi: 11.4 },
    ],
  };
})();
