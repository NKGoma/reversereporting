/*
 * Demo-Archive für die Archiv-Analyse. Alle Texte sind FIKTIV (keine BR-Texte,
 * keine echten Zitate). Zahlen zu Besuchern und Bierkonsum entsprechen den
 * amtlichen Werten der Stadt München, damit der Faktencheck sichtbar wird.
 * Jeder Artikel trägt eine "Stand:"-Zeile – wie ein Export aus dem CMS.
 */
(function () {
  const RR = (window.RR = window.RR || {});
  const C = () => RR.corpus;
  const pad = (n) => String(n).padStart(2, "0");
  const stand = (iso, h) => `Stand: ${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(0, 4)}, ${pad(h)}:${["05", "30", "45", "15"][h % 4]} Uhr`;

  /* ---------- Oktoberfest 2023–2025 ---------- */
  const W = {
    2023: { max: "14,90", min: "13,70", plus: "rund acht", visitors: "7,2 Millionen", beer: "74.418 Hektoliter", hendl: "396.141", found: "4.000", hit: "„Zehn Maß“", weather: "sommerlich warm mit bis zu 28 Grad", patients: "7.500", police: "1.200" },
    2024: { max: "15,30", min: "13,90", plus: "rund drei", visitors: "6,8 Millionen", beer: "69.564 Hektoliter", hendl: "368.308", found: "3.800", hit: null, weather: "regnerisch und kühl", patients: "7.200", police: "1.100" },
    2025: { max: "15,80", min: "14,50", plus: "rund drei", visitors: "6,5 Millionen", beer: "67.127 Hektoliter", hendl: "351.461", found: "3.600", hit: "„Komm, wir tanzen“", weather: "wechselhaft, am zweiten Wochenende Gewitter", patients: "6.900", police: "1.050" },
  };

  // [Typ, Tag relativ zum Wiesn-Start (oder "end+n"), Stunde, Titel, Text]
  const OKTO = [
    ["plakat", -142, 10, (y) => `Das ist das Wiesn-Plakat ${y}`, (y) => `Die Stadt München hat das offizielle Plakat für das Oktoberfest ${y} vorgestellt. Das Motiv stammt aus einem Wettbewerb, an dem sich mehrere hundert Gestalterinnen und Gestalter beteiligt hatten. Auch der Wiesn-Sammlerkrug trägt das Motiv. Der Wirtschaftsreferent lobte den Entwurf als „frisch und typisch münchnerisch“.`],
    ["zelte", -108, 15, (y) => `Stadtrat vergibt die Wiesn-Zelte für ${y}`, (y) => `Der Wirtschaftsausschuss des Stadtrats hat die Zulassungen für das Oktoberfest ${y} beschlossen. Alle großen Festzelte bleiben in der Hand der bisherigen Wirtsfamilien. Bei den kleinen Zelten gibt es eine neue Wirtin. Insgesamt hatten sich mehr Betriebe beworben, als Plätze zur Verfügung stehen.`],
    ["reserv", -86, 9, (y) => `Tischreservierungen: Ansturm auf die Wiesn-Plätze ${y}`, (y) => `Wer ${y} einen Tisch im Festzelt reservieren will, braucht Geduld. Die Reservierungsportale der großen Zelte waren innerhalb weniger Stunden ausgebucht, vor allem für die Abende und Wochenenden. Die Wirte raten, auf Mittagsreservierungen unter der Woche auszuweichen. Ein Teil der Plätze bleibt ohne Reservierung frei.`],
    ["bierpreise", -46, 11, (y) => `Wiesn ${y}: So teuer ist die Maß`, (y) => `Die Bierpreise für das Oktoberfest ${y} stehen fest: Die Maß kostet bis zu ${W[y].max} Euro. Am günstigsten ist sie mit ${W[y].min} Euro im Festzelt Tradition. Im Vergleich zum Vorjahr ist das ein Plus von ${W[y].plus} Prozent. Die Wirte begründen die Preise mit gestiegenen Kosten für Personal und Energie. Der Bund der Steuerzahler übt Kritik.`],
    ["aufbau", -38, 14, (y) => `Aufbau auf der Theresienwiese: Die Wiesn ${y} entsteht`, (y) => `Rund zehn Wochen vor dem Anstich hat auf der Theresienwiese der Aufbau begonnen. Kräne heben die ersten Gerüste der großen Festhallen in die Höhe, Lastwagen bringen Bauteile. Bis zur Eröffnung arbeiten täglich mehrere hundert Menschen auf dem Gelände. Für Radfahrer und Fußgänger gibt es Sperrungen.`],
    ["sicherheit", -6, 12, (y) => `Sicherheitskonzept für die Wiesn ${y} vorgestellt`, (y) => `Polizei und Stadt haben das Sicherheitskonzept für das Oktoberfest ${y} vorgestellt. Große Taschen und Rucksäcke bleiben verboten, an den Eingängen gibt es Kontrollen. Die Videoüberwachung wird ausgebaut. Täglich sind rund 600 Polizistinnen und Polizisten im Einsatz.`],
    ["auftakt", 0, 13, (y) => `O'zapft is: Die Wiesn ${y} ist eröffnet`, (y) => `Mit zwei Schlägen hat der Oberbürgermeister im Schottenhamel-Festzelt das erste Fass angezapft. Um 12 Uhr war es so weit, die erste Maß ging traditionell an den Ministerpräsidenten. Schon am Morgen hatten Tausende vor den Eingängen gewartet, um 9 Uhr begann der Run auf die Zelte. „Wir stehen seit vier Uhr hier“, sagt eine Besucherin aus Augsburg.`],
    ["festzug", 1, 15, (y) => `Trachten- und Schützenzug ${y}: Tausende in Tracht durch München`, (y) => `Rund 9.000 Mitwirkende sind beim Trachten- und Schützenzug durch die Münchner Innenstadt gezogen. Trachtengruppen, Blaskapellen und Kutschen aus mehreren Ländern waren dabei. Zehntausende säumten die Straßen. Der Zug führte vom Maximilianeum bis zur Theresienwiese.`],
    ["wetter", 3, 8, (y) => `Wiesn-Wetter: So wird das erste Wochenende`, (y) => `Das Wetter auf dem Oktoberfest ${y} zeigt sich ${W[y].weather}. Der Deutsche Wetterdienst rechnet in den kommenden Tagen mit wechselnden Bedingungen. Wer in die Biergärten will, sollte eine Jacke einpacken. Bei Gewitter können die Außenbereiche geschlossen werden.`],
    ["wiesnhit", 5, 17, (y) => `Das ist der Wiesn-Hit ${y}`, (y) => (W[y].hit ? `In den Festzelten hat sich ein Lied als Wiesn-Hit durchgesetzt: ${W[y].hit}. Die Bands spielen den Song mehrmals am Abend, die Gäste singen auf den Bänken mit. Auch in den Playlists ist der Titel nach oben gestiegen.` : null)],
    ["halbzeit", 8, 10, (y) => `Halbzeitbilanz: So lief die erste Wiesn-Woche`, (y) => `Zur Halbzeit des Oktoberfests ${y} zieht die Festleitung eine positive Zwischenbilanz. Bislang sei die Wiesn friedlich verlaufen, die Besucherzahlen lägen im Rahmen. Die Polizei meldet weniger Einsätze als im Vorjahr. Am mittleren Wochenende wird mit großem Andrang gerechnet.`],
    ["fundbuero", 12, 11, (y) => `Wiesn-Fundbüro: Was die Gäste ${y} alles verlieren`, (y) => `Im Fundbüro auf der Wiesn stapeln sich die Fundsachen: Geldbeutel, Handys, Schlüssel und Ausweise wurden abgegeben, insgesamt rund ${W[y].found} Gegenstände. Kurios: eine Zahnprothese und ein Hochzeitskleid. Wer etwas verloren hat, kann online nachsehen.`],
    ["polizei", "end+1", 9, (y) => `Polizeibilanz zur Wiesn ${y}`, (y) => `Die Polizei hat ihre Bilanz zum Oktoberfest ${y} vorgestellt: Es gab rund ${W[y].police} Festnahmen, vor allem wegen Körperverletzung und Diebstahl. Mehrfach wurden Gäste mit einem Maßkrug verletzt. Insgesamt sei die Wiesn aber friedlich gewesen.`],
    ["rettung", "end+1", 12, (y) => `Sanitätsdienst: Mehr als ${W[y].patients} Patienten behandelt`, (y) => `Der Sanitätsdienst auf der Wiesn hat bei diesem Oktoberfest mehr als ${W[y].patients} Patientinnen und Patienten behandelt. Häufigster Grund war eine Alkoholvergiftung, dazu kamen Schnittwunden und Stürze. Die Rettungskräfte sprechen von einer arbeitsreichen Wiesn.`],
    ["bilanz", "end+1", 16, (y) => `Wiesn-Bilanz ${y}: ${W[y].visitors} Besucher`, (y) => `Das Oktoberfest ${y} ist zu Ende. Nach Angaben der Stadt kamen ${W[y].visitors} Besucher auf die Theresienwiese. Ausgeschenkt wurden ${W[y].beer} Bier, verzehrt wurden ${W[y].hendl} Hendl. Der Wiesnchef zeigt sich zufrieden: „Es war eine friedliche und schöne Wiesn.“`],
  ];

  function oktoberfest() {
    const out = [];
    for (const y of [2023, 2024, 2025]) {
      const w = C().wiesnDates(y);
      OKTO.forEach(([type, off, h, title, body], i) => {
        const text = body(y);
        if (!text) return;
        const jitter = ((y * 7 + i * 3) % 5) - 2; // ± 2 Tage, damit es nach echtem Archiv aussieht
        const day = typeof off === "string" ? C().addDays(w.end, Number(off.split("+")[1])) : C().addDays(w.start, off === 0 || off === 1 ? off : off + jitter);
        out.push({ name: `${day}_${type}.txt`, text: `${title(y)}\n${text}\n${stand(day, h)}` });
      });
    }
    return out;
  }

  /* ---------- Landtagswahl 2018 und 2023 ---------- */
  const ELECT = { 2018: "2018-10-14", 2023: "2023-10-08" };
  const L = [
    ["kandidaten", -62, (d) => `Landtagswahl: Diese Kandidierenden treten im Stimmkreis an`, (d) => `Zur Landtagswahl am ${C().deDate(d)} treten im Stimmkreis München-Mitte acht Kandidatinnen und Kandidaten an. Die Parteien haben ihre Listen aufgestellt, die Spitzenkandidaten stehen fest. Wir stellen alle Bewerberinnen und Bewerber im Porträt vor.`],
    ["wahlhilfe", -24, (d) => `Wahl-O-Mat zur Landtagswahl ist online`, (d) => `Ab heute ist der Wahl-O-Mat zur Landtagswahl freigeschaltet. Nutzerinnen und Nutzer können ihre Positionen mit den Wahlprogrammen der Parteien vergleichen. Auch das TV-Duell der Spitzenkandidaten steht an.`],
    ["briefwahl", -16, (d) => `Briefwahl zur Landtagswahl: So funktioniert es`, (d) => `Wer am Wahltag nicht ins Wahllokal gehen kann, kann per Briefwahl abstimmen. Die Wahlbenachrichtigung ist inzwischen verschickt, die Unterlagen lassen sich online beantragen. Der Stimmzettel muss spätestens am Wahltag um 18 Uhr bei der Gemeinde sein.`],
    ["umfragen", -9, (d) => `Neue Umfrage vor der Landtagswahl`, (d) => `Gut eine Woche vor der Wahl zeigt eine neue Umfrage nur geringe Veränderungen. Das Institut hat mehr als 1.000 Wahlberechtigte befragt. Viele sind noch unentschlossen.`],
    ["wahlabend", 0, (d) => `Landtagswahl: Erste Hochrechnung um 18 Uhr`, (d) => `Um 18 Uhr haben die Wahllokale geschlossen, die erste Prognose liegt vor. Auf den Wahlpartys der Parteien herrscht teils Jubel, teils Enttäuschung. Die Hochrechnungen werden im Laufe des Abends genauer.`],
    ["beteiligung", 1, (d) => `Wahlbeteiligung bei der Landtagswahl gestiegen`, (d) => `Die Wahlbeteiligung bei der Landtagswahl ist im Vergleich zur letzten Wahl gestiegen. Besonders in den Städten gingen mehr Menschen wählen. Der Anteil der Briefwählerinnen und Briefwähler war so hoch wie nie.`],
    ["ergebnis", 1, (d) => `Das Ergebnis in Ihrem Stimmkreis`, (d) => `Das vorläufige Endergebnis der Landtagswahl liegt vor. In fast allen Stimmkreisen wurde das Direktmandat verteidigt. Die Sitzverteilung im neuen Landtag steht damit fest.`],
    ["koalition", 22, (d) => `Koalitionsvertrag unterzeichnet: Die neue Staatsregierung steht`, (d) => `Gut drei Wochen nach der Landtagswahl haben die Parteien ihren Koalitionsvertrag unterzeichnet. Nach den Sondierungen ging die Regierungsbildung schnell. Das neue Kabinett soll in den nächsten Tagen vereidigt werden.`],
  ];
  function wahl() {
    const out = [];
    Object.values(ELECT).forEach((d) => L.forEach(([type, off, title, body], i) => {
      const day = C().addDays(d, off);
      out.push({ name: `${day}_${type}.txt`, text: `${title(d)}\n${body(d)}\n${stand(day, 9 + (i % 9))}` });
    }));
    return out;
  }

  RR.CORPUS_SAMPLES = {
    oktoberfest: { label: "Oktoberfest 2023–2025", make: oktoberfest },
    wahl: { label: "Landtagswahl 2018 und 2023", make: wahl },
  };
})();
