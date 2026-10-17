/*
 * Story-Typen für die Archiv-Analyse: Welche Geschichten erscheinen zu einem
 * wiederkehrenden Ereignis? Jeder Typ hat Schlüsselwörter (Titel zählen mehr)
 * und optional einen Blueprint aus blueprints.js für die Einzelrecherche.
 * Was hier nicht passt, findet corpus.js als "entdeckte" Typen per Textähnlichkeit.
 */
(function () {
  const RR = (window.RR = window.RR || {});

  RR.EVENTS = {
    oktoberfest: {
      id: "oktoberfest",
      label: "Oktoberfest",
      detect: /oktoberfest|wiesn/i,
      anchorLabel: "Wiesn-Start",
      phases: (rel, dur) => (rel < -2 ? "Vorlauf" : rel <= 1 ? "Eröffnung" : rel < (dur || 16) - 1 ? "Während der Wiesn" : "Bilanz"),
      types: [
        { id: "plakat", label: "Wiesn-Plakat & Krug", kw: [[/plakat/i, 4], [/motiv/i, 2], [/wiesn-?krug|sammlerkrug/i, 3], [/gestalt|entwurf|wettbewerb/i, 1]] },
        { id: "zelte", label: "Wirte & Zeltvergabe", kw: [[/zeltvergabe|zulassung/i, 4], [/neue[rn]? wirt|wirtsfamilie|bewerb/i, 3], [/stadtrat|wirtschaftsausschuss/i, 2], [/festzelt.*vergeben|vergabe/i, 2]] },
        { id: "bierpreise", label: "Bierpreise", bp: "volksfest-bierpreis", kw: [[/bierpreis|maßpreis/i, 5], [/maß kostet|kostet die maß|preis für die maß/i, 4], [/teurer|preiserhöhung|euro/i, 1]] },
        { id: "aufbau", label: "Aufbau der Wiesn", kw: [[/aufbau|aufgebaut|bauarbeiten/i, 4], [/festhallen entstehen|kräne|gerüst/i, 3], [/wochen vor|noch \d+ (?:tage|wochen)/i, 1]] },
        { id: "sicherheit", label: "Sicherheitskonzept", kw: [[/sicherheitskonzept/i, 5], [/taschen|rucksack|kontrollen|videoüberwach|kameras/i, 2], [/polizei/i, 1], [/messer|verbot/i, 1]] },
        { id: "auftakt", label: "Run & Anstich", bp: "festauftakt", kw: [[/anstich|angezapft|anzapf|o'zapft|ozapft/i, 4], [/\brun\b|einlass/i, 3], [/schläge|erste maß|bierfass/i, 2]] },
        { id: "festzug", label: "Trachten- & Schützenzug", kw: [[/trachten- und schützenzug|trachtenzug|schützenzug|festzug/i, 5], [/einzug der wiesnwirte|wiesnwirte ziehen/i, 4], [/trachtengruppen|blaskapellen|kutschen/i, 2]] },
        { id: "wetter", label: "Wiesn-Wetter", kw: [[/wetter/i, 3], [/regen|gewitter|unwetter|sonne|sonnig|hitze|grad\b|temperatur/i, 2], [/wetterdienst|dwd|meteorolog/i, 2]] },
        { id: "rettung", label: "Sanitätsdienst & Notfälle", kw: [[/sanitäter|sanitätsdienst|aicher|rotes kreuz|\bbrk\b/i, 4], [/alkoholvergiftung|patienten|behandelt|notfälle/i, 3], [/rettungs/i, 2]] },
        { id: "polizei", label: "Polizei & Kriminalität", kw: [[/polizeibilanz|festnahmen|festgenommen/i, 4], [/diebstahl|körperverletzung|maßkrug|schlägerei|taschendieb/i, 3], [/polizei/i, 1]] },
        { id: "fundbuero", label: "Fundbüro", kw: [[/fundbüro|fundsachen/i, 6], [/verloren|gefunden|abgegeben/i, 2], [/geldbeutel|handys?|schlüssel|ausweis/i, 1]] },
        { id: "wiesnhit", label: "Wiesn-Hit & Musik", kw: [[/wiesn-?hit/i, 6], [/song|lied|hit\b|gesungen|musik|band|playlist/i, 2]] },
        { id: "halbzeit", label: "Halbzeitbilanz", kw: [[/halbzeit|zwischenbilanz/i, 6], [/erste[nr]? (?:wiesn)?woche|bisher|bislang/i, 2]] },
        { id: "bilanz", label: "Abschlussbilanz", kw: [[/abschlussbilanz|wiesn-bilanz|bilanz der wiesn|schlussbilanz/i, 6], [/zu ende|ist vorbei|letzte[nr]? (?:wiesn)?tag|endet/i, 3], [/besucherzahl|millionen besucher|ausgeschenkt|hektoliter/i, 2], [/bilanz/i, 2]] },
      ],
    },

    wahl: {
      id: "wahl",
      label: "Wahl",
      detect: /landtagswahl|bundestagswahl|kommunalwahl|europawahl|bezirkstagswahl|wahlkampf|wahlbeteiligung/i,
      anchorLabel: "Wahltag",
      phases: (rel) => (rel < -1 ? "Wahlkampf" : rel <= 0 ? "Wahltag" : rel <= 7 ? "Nach der Wahl" : "Regierungsbildung"),
      types: [
        { id: "kandidaten", label: "Kandidierende & Listen", kw: [[/spitzenkandidat|kandidat(?:in|en|innen)?|kandidier|treten .* an|tritt an|listenplatz|bewerber/i, 4], [/porträt|stellt sich|nominiert/i, 2]] },
        { id: "umfragen", label: "Umfragen", kw: [[/umfrage|bayerntrend|sonntagsfrage|deutschlandtrend/i, 5], [/demoskop|institut|forsa|infratest|befragt/i, 3]] },
        { id: "wahlhilfe", label: "Wahlhilfe & Debatten", kw: [[/wahl-o-mat|wahlomat|wahlhilfe/i, 5], [/tv-duell|duell|debatte|wahlarena|wahlprogramm|faktencheck/i, 3]] },
        { id: "briefwahl", label: "Briefwahl & Ablauf", kw: [[/briefwahl/i, 5], [/wahlbenachrichtigung|wahllokal|stimmzettel|wahlunterlagen|wahlhelfer/i, 3], [/so funktioniert|was sie wissen müssen/i, 2]] },
        { id: "wahlabend", label: "Wahlabend & Hochrechnungen", kw: [[/hochrechnung|prognose|18 uhr|wahlabend|wahlparty/i, 5], [/jubel|enttäuschung|erste ergebnisse/i, 2]] },
        { id: "ergebnis", label: "Ergebnisse & Stimmkreise", kw: [[/endergebnis|amtliche[sn]? (?:end)?ergebnis|sitzverteilung/i, 5], [/stimmkreis|direktmandat|wahlkreis|gewonnen|verloren/i, 3], [/prozentpunkte|stimmenanteil/i, 2]] },
        { id: "beteiligung", label: "Wahlbeteiligung", kw: [[/wahlbeteiligung/i, 5], [/nichtwähler|beteiligung/i, 2]] },
        { id: "koalition", label: "Koalition & Regierungsbildung", bp: "wahl", kw: [[/koalition|sondierung|regierungsbildung|koalitionsvertrag/i, 5], [/kabinett|vereidigt|ministerpräsident(?:in)? gewählt|minister(?:in)?\b/i, 3]] },
      ],
    },
  };
})();
