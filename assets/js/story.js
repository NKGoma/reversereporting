/*
 * Story-Entwurf: baut aus den Rechercheergebnissen ein Artikelgerüst.
 * Fehlende Punkte erscheinen als markierte Lücken [OFFEN: …].
 * Ein Absatz ist eine Liste von Segmenten: { t: "Text" } oder { gap: itemId, label }.
 */
(function () {
  const RR = (window.RR = window.RR || {});
  const F = () => RR.fmt;

  // erster inhaltlicher Satz einer E-Mail-Antwort (ohne Anrede/Gruß)
  function replyCore(text) {
    if (!text) return "";
    const body = text.split("\n").map((l) => l.trim()).filter((l) => l && !/^(sehr geehrte|hallo|guten tag|mit freundlichen|freundliche|beste|viele grüße|pressestelle)/i.test(l) && !/,$/.test(l));
    const s = body.join(" ").match(/[^.!?]+[.!?]/);
    return s ? s[0].trim() : body[0] || "";
  }
  // Antwort des Gegenübers aus einem Transkript
  function transcriptQuote(text) {
    if (!text) return "";
    const lines = text.split("\n").filter((l) => !/agent:/i.test(l)).map((l) => l.replace(/^\[[\d:]+\]\s*[^:]+:\s*/, "").trim());
    return lines.filter((l) => l.length > 25).sort((a, b) => b.length - a.length)[0] || "";
  }

  function build(state) {
    const an = state.analysis;
    const Y = an.targetYear;
    const items = state.checklist;
    const res = (i) => state.results[i.id] || {};
    const byPat = (pid) => items.find((i) => i.patternId === pid);
    const byAction = (a) => items.find((i) => i.action === a);
    const gap = (i, label) => ({ gap: i ? i.id : null, label: label || (i ? i.title : "fehlt") });
    const used = new Set();
    const paras = [];
    let headline, lead;

    const answerOf = (i) => {
      if (!i) return null;
      const r = res(i);
      if (i.category === "agent" && r.status === "done" && r.result) return { kind: "agent", r };
      if (r.reply) return { kind: "text", text: replyCore(r.reply), org: RR.agent.contactFor(i, an).org.split(" – ")[0] };
      if (r.transcript) return { kind: "quote", text: transcriptQuote(r.transcript) };
      if (r.done && r.note) return { kind: "note", text: r.note.trim() };
      return null;
    };

    if (an.type.id === "volksfest-bierpreis") {
      const ev = an.type.event || "Volksfest";
      const tents = byAction("tent_prices"), yoy = byAction("yoy"), hist = byAction("history");
      [tents, yoy, hist, byAction("price_range")].forEach((i) => i && used.add(i.id));
      const T = answerOf(tents);
      if (T) {
        const rows = T.r.result.rows;
        const cs = rows.map((x) => x.curr);
        const min = rows.find((x) => x.curr === Math.min(...cs)), max = rows.find((x) => x.curr === Math.max(...cs));
        headline = [{ t: `${ev} ${Y}: Die Maß kostet bis zu ${F().eur(max.curr)}` }];
        const Yo = answerOf(yoy);
        const d = Yo ? Yo.r.result.metrics.deltaPct : null;
        lead = [{ t: `Die Bierpreise steigen erneut: Beim ${ev} ${Y} kostet die Maß zwischen ${F().eur(min.curr)} und ${F().eur(max.curr)}.` },
          Yo ? { t: ` Im Schnitt sind das ${Math.abs(d).toFixed(1).replace(".", ",")} Prozent ${d >= 0 ? "mehr" : "weniger"} als ${Y - 1}.` } : gap(yoy, "Veränderung zum Vorjahr")];
        paras.push([{ t: `Am teuersten ist es im Zelt „${max.tent}“ (${F().eur(max.curr)}), am günstigsten im Zelt „${min.tent}“ (${F().eur(min.curr)}).` }]);
      } else {
        headline = [{ t: `${ev} ${Y}: ` }, gap(tents, "Maßpreis")];
        lead = [gap(tents, "Preise aller Zelte")];
      }
      const H = answerOf(hist);
      if (H && H.r.result.series.length > 1) {
        const first = H.r.result.series[0];
        paras.push([{ t: `Zum Vergleich: ${first.year} kostete die Maß höchstens ${F().eur(first.max)}.` }]);
      }
    } else {
      const firstAgent = items.find((i) => i.category === "agent" && answerOf(i));
      headline = [{ t: `${an.type.short} ${Y}: ` }, firstAgent ? { t: res(firstAgent).result.summary } : gap(items.find((i) => i.category === "agent"), "Kernzahl")];
      if (firstAgent) used.add(firstAgent.id);
      lead = firstAgent ? [{ t: `${firstAgent.title.replace(new RegExp(`\\s*\\(?${Y}\\)?$`), "")}: ${res(firstAgent).result.summary}.` }] : [{ t: "" }];
    }

    // übrige Punkte der Reihe nach: Antwort einsetzen oder Lücke markieren
    for (const i of items) {
      if (used.has(i.id)) continue;
      const a = answerOf(i);
      if (!a) { paras.push([gap(i)]); continue; }
      if (a.kind === "agent") paras.push([{ t: `${i.title.replace(new RegExp(`\\s*\\(?${Y}\\)?$`), "")}: ${a.r.result.summary}.` }]);
      else if (a.kind === "quote") paras.push([{ t: `„${a.text.replace(/[„“"]/g, "")}“ (O-Ton aus Telefonat, vor Veröffentlichung autorisieren)` }]);
      else if (a.kind === "note") paras.push([{ t: a.text }]);
      else paras.push([{ t: `Laut ${a.org}: ${a.text}` }]);
    }
    const gaps = [headline, lead, ...paras].flat().filter((s) => s.gap !== undefined).length;
    const demo = Object.values(state.results).some((r) => r.result && r.result.demo);
    return { headline, lead, paras, gaps, demo };
  }

  function toText(story) {
    const seg = (s) => (s.gap !== undefined ? `[OFFEN: ${s.label}]` : s.t);
    const line = (p) => p.map(seg).join("").trim();
    return [line(story.headline), "", line(story.lead), "", ...story.paras.map(line).filter(Boolean).flatMap((p) => [p, ""])].join("\n").trim();
  }

  RR.story = { build, toText };
})();
