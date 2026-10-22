"""Thema erkennen und Artikel aussortieren, die nur nebenbei damit zu tun haben.

Thema = Schlagworte, die in vielen Artikeln vergeben sind UND oft in Überschrift/Vorspann stehen
(Regions-Schlagworte wie "Oberbayern" fallen so heraus). Ohne Schlagworte: häufigste Titelwörter.
Aussortierte Artikel bleiben in der Datenbank (Status off_topic) und werden angezeigt.
"""
from __future__ import annotations

import collections
import re

STOP = set("""der die das und oder ein eine einer eines dem den des im in am an auf aus bei mit nach von vor zu zum zur für über
unter wie was wer ist sind war wird werden hat haben nicht noch auch nur so es sie er wir ihr man sich als bis
mehr neue neuer neues jetzt heute alle beim vom ab""".split())


def _words(s: str) -> list[str]:
    return re.findall(r"[a-zäöüß][a-zäöüß-]{2,}", s.lower())


def detect_topic(arts: list[dict]) -> list[str]:
    n = max(1, len(arts))
    tags = collections.Counter(t for a in arts for t in {t.strip() for t in a["tags"]})
    head = [(a["title"] + " " + a["lead"]).lower() for a in arts]
    terms = []
    for t, c in tags.most_common(30):
        share_head = sum(1 for h in head if t.lower() in h) / n
        if c / n >= 0.4 and share_head >= 0.3:
            terms.append(t)
    if not terms:  # keine Schlagworte: Wörter, die in vielen Überschriften stehen
        df = collections.Counter(w for h in head for w in set(_words(h)) if w not in STOP)
        terms = [w for w, c in df.most_common(5) if c / n >= 0.3] or [w for w, _ in df.most_common(1)]
    return terms


def score(a: dict, terms: list[str]) -> float:
    rx = re.compile("|".join(re.escape(t.lower()) for t in terms))
    title, lead, body = a["title"].lower(), a["lead"].lower(), a["body"].lower()
    s = 0.0
    s += 2.0 if rx.search(title) else 0.0
    s += 1.0 if rx.search(lead) else 0.0
    s += min(3, len(rx.findall(body))) * 0.5
    s += 0.5 if any(t.lower() in (x.lower() for x in a["tags"]) for t in terms) else 0.0
    return s


def apply(store, terms: list[str] | None = None, threshold: float = 0.5) -> dict:
    """Sortiert nur eindeutige Fälle aus (Thema gar nicht erwähnt). Grenzfälle entscheidet
    Gemma in der Story-Karte (Feld topic: zentral / nebenbei / nicht), siehe cards.py."""
    for a in store.articles(status="off_topic"):
        store.set_status(a["id"], "ok")
    arts = store.articles()
    terms = terms or detect_topic(arts)
    off = []
    for a in arts:
        sc = score(a, terms)
        if sc < threshold:
            store.set_status(a["id"], "off_topic", f"Thema kaum erwähnt (Wert {sc:.1f})")
            off.append({"id": a["id"], "date": a["date"], "title": a["title"], "score": sc})
    unsure = [{"id": a["id"], "title": a["title"], "score": score(a, terms)} for a in arts
              if threshold <= score(a, terms) < 3.0]
    store.put("topic", {"terms": terms, "threshold": threshold, "unsure": [u["id"] for u in unsure]})
    return {"terms": terms, "off_topic": off, "unsure": len(unsure), "kept": len(arts) - len(off)}
