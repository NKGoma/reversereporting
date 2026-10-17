"""Tests mit erfundenen, BR24-ähnlichen Seiten (keine echten Archivinhalte).

  cd server && uv run python -m unittest discover -s tests -v
"""
import io
import json
import sys
import tempfile
import unittest
import zipfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from rr import group, ingest, relevance, timeline  # noqa: E402
from rr.store import Store  # noqa: E402


def page(url, date, title, lead, paras, extra_body="", ld_type="NewsArticle"):
    ld = {"@context": "https://schema.org", "@type": ld_type, "datePublished": date + "T10:00:00+02:00",
          "headline": title, "description": lead, "keywords": "Sommerfest, Musterstadt"}
    rich = "".join(f"<p>{p}</p>" for p in paras)
    return f"""<html><head><title>{title} | BR24</title>
<meta property=og:url content="{url}"><meta property=og:type content=article>
<meta property=article:tag content=Sommerfest><meta property=article:tag content=Oberland>
<script type="application/ld+json">{json.dumps(ld)}</script></head><body>
<main><header><p>{lead}</p></header>
<section id=articlebody><section><div class="RichText-module__x body3">{rich}
<p>Ich möchte eingebundene Inhalte von X sehen. Hierbei werden personenbezogene Daten übermittelt.</p></div></section>
{extra_body}</section>
<section class="ArticleList-module__y"><p>Teaser: Ganz anderer Artikel über Photovoltaik und Netzbetreiber.</p></section>
</main></body></html>"""


LISTING = """<html><head><meta property=og:type content=website>
<script type="application/ld+json">{"@type":"CollectionPage","name":"Übersicht"}</script></head>
<body><p>Viele Teaser</p></body></html>"""


def build_zip(path: Path):
    P = []
    # zwei Jahrgänge eines erfundenen Sommerfests (Start: 20.6.2025 und 19.6.2026)
    for y, start, end in [(2025, "20. Juni", "5. Juli"), (2026, "19. Juni", "4. Juli")]:
        P += [
            (f"preis{y}.html", page(f"https://x/preis-{y}", f"{y}-05-02", f"Sommerfest {y}: Bierpreis steigt auf 12 Euro",
                                    "Die Stadt hat den neuen Bierpreis für das Sommerfest bekannt gegeben.",
                                    [f"Das Sommerfest findet vom {start} bis {end} statt.",
                                     "Der Bierpreis steigt im Durchschnitt um drei Prozent, teilte die Stadt mit.",
                                     "Die Wirte begründen den Bierpreis mit höheren Kosten für Personal."])),
            (f"anstich{y}.html", page(f"https://x/anstich-{y}", f"{y}-06-{20 if y == 2025 else 19}",
                                      "Anstich: Der Bürgermeister eröffnet das Sommerfest mit zwei Schlägen",
                                      "Mit zwei Schlägen hat der Bürgermeister das erste Fass angezapft.",
                                      ["Der Anstich im Festzelt gelang mit zwei Schlägen, das erste Fass ist angezapft.",
                                       "Tausende Besucher warteten vor dem Festzelt auf den Anstich."])),
            (f"bilanz{y}.html", page(f"https://x/bilanz-{y}", f"{y}-07-0{5 if y == 2025 else 4}",
                                     "Bilanz: So viele Besucher kamen zum Sommerfest",
                                     "Das Sommerfest ist zu Ende, die Veranstalter ziehen Bilanz mit Besucherzahlen.",
                                     ["Die Veranstalter zählten rund eine Million Besucher beim Sommerfest.",
                                      "Die Polizei meldete weniger Einsätze als im Vorjahr, die Bilanz fällt gut aus."])),
        ]
    # Einmaliges Großereignis 2025 (mehrere Artikel)
    for i in range(3):
        P.append((f"gewitter{i}.html", page(f"https://x/gewitter-{i}", f"2025-06-2{4 + i}",
                                            f"Unwetter: Sturm beschädigt Festzelt auf dem Sommerfest ({i})",
                                            "Ein schweres Unwetter hat das Festzelt beschädigt, Sturm und Hagel.",
                                            ["Der Sturm riss Teile des Festzelt-Dachs ab, Hagel und Unwetter.",
                                             "Feuerwehr und Polizei sperrten das Gelände nach dem Unwetter."])))
    # Wiederveröffentlicht: Metadaten 2026, Original 2025
    P.append(("tipp.html", page("https://x/tipp", "2026-06-01", "Tipps für das Sommerfest", "Was man wissen muss.",
                                ["Hier sind Tipps rund um das Sommerfest für Besucher.",
                                 "Dieser Artikel ist erstmals am 2. Juni 2025 auf BR24 erschienen."])))
    P.append(("uebersicht.html", LISTING))
    P.append(("preis2025-kopie.html", P[0][1]))  # gleiche URL = Dublette
    with zipfile.ZipFile(path, "w") as z:
        for n, h in P:
            z.writestr(n, h)
        z.writestr("__MACOSX/._preis2025.html", b"\x00\x05binary")


class PipelineTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp = tempfile.TemporaryDirectory()
        d = Path(cls.tmp.name)
        build_zip(d / "archiv.zip")
        cls.store = Store(d / "test.sqlite")
        cls.report = ingest.import_files(cls.store, [str(d / "archiv.zip")])
        cls.topic = relevance.apply(cls.store)
        cls.tl = timeline.build(cls.store)
        group.build(cls.store, threshold=0.11)

    @classmethod
    def tearDownClass(cls):
        cls.tmp.cleanup()

    def test_import_counts(self):
        r = self.report
        self.assertEqual(r["skipped"].get("Übersichtsseite (keine Einzelmeldung)"), 1)
        self.assertEqual(r["duplicates"], 1)
        self.assertEqual(r["ok"], 10)

    def test_body_is_clean(self):
        for a in self.store.articles():
            self.assertNotIn("Photovoltaik", a["body"], "Teaser fremder Artikel im Text")
            self.assertNotIn("eingebundene Inhalte", a["body"], "Einwilligungs-Kasten im Text")

    def test_republished_uses_original_date(self):
        tipp = next(a for a in self.store.articles() if a["title"].startswith("Tipps"))
        self.assertEqual(tipp["date"], "2025-06-02")
        self.assertEqual(tipp["date_source"], "erstmals erschienen")

    def test_topic(self):
        self.assertIn("Sommerfest", self.topic["terms"])

    def test_event_days_from_text(self):
        cyc = {c["cycle"]: c for c in self.tl["cycles"]}
        self.assertEqual((cyc["2025"]["start"], cyc["2025"]["end"]), ("2025-06-20", "2025-07-05"))
        self.assertEqual((cyc["2026"]["start"], cyc["2026"]["end"]), ("2026-06-19", "2026-07-04"))
        self.assertEqual(cyc["2025"]["source"], "im Text genannt")

    def test_recurring_vs_one_off(self):
        groups = self.store.get("groups")
        title = {a["id"]: a["title"] for a in self.store.articles()}

        def grp(word):
            return next(g for g in groups if any(word in title[m] for m in g["members"]))
        for w in ("Bierpreis", "Anstich", "Bilanz"):
            g = grp(w)
            self.assertTrue(g["recurring"], f"{w} sollte wiederkehrend sein")
            self.assertEqual(g["matched_cycles"], ["2025", "2026"])
        storm = grp("Unwetter")
        self.assertEqual(storm["n"], 3)
        self.assertFalse(storm["recurring"], "einmaliges Großereignis darf nicht wiederkehrend sein")

    def test_agglomerate_average_linkage(self):
        import numpy as np
        S = np.array([[1, .9, .1, .1], [.9, 1, .1, .1], [.1, .1, 1, .8], [.1, .1, .8, 1]])
        self.assertEqual(sorted(sorted(c) for c in group.agglomerate(S, 0.5)), [[0, 1], [2, 3]])
        self.assertEqual(len(group.agglomerate(S, 0.05)), 1)


class QuoteTest(unittest.TestCase):
    def test_verify_quote(self):
        from rr.llm import verify_quote
        text = "Der Bierpreis steigt auf 12 Euro. Die Wirte begründen das mit Personalkosten."
        self.assertEqual(verify_quote(text, "Der Bierpreis steigt auf 12 Euro."), "Der Bierpreis steigt auf 12 Euro.")
        self.assertIsNotNone(verify_quote(text, "Wirte begründen das mit Personalkosten"))
        self.assertIsNone(verify_quote(text, "Der Bürgermeister kündigte einen Rekord an."))


if __name__ == "__main__":
    unittest.main()
