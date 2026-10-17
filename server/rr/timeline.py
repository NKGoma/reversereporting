"""Zeitachse: Zyklen (Jahre), Ereignistage pro Zyklus und Lage jedes Artikels relativ zum Ereignis.

Ereignistage pro Jahr, in dieser Reihenfolge:
  1. manuell gesetzt (vom Nutzer korrigiert)
  2. Zeitraum, der in den Texten genannt wird ("vom 19. September bis 4. Oktober") – häufigste Nennung
  3. dichtester Zeitraum der Veröffentlichungen (Höhepunkt der Berichterstattung)
Nichts davon ist themenspezifisch.
"""
from __future__ import annotations

import collections
import datetime as dt
import re

MONTHS = ["januar", "februar", "märz", "april", "mai", "juni", "juli", "august", "september", "oktober", "november", "dezember"]
M = "|".join(MONTHS)
RANGE = re.compile(
    rf"(\d{{1,2}})\.\s*(?:({M})\s*)?(\d{{4}})?\s*(?:bis(?:\s+zum)?|–|-)\s*(\d{{1,2}})\.\s*({M})\s*(\d{{4}})?", re.I)


AFTER = 45  # Tage nach Ereignisende, die noch als Nachbericht zählen


def _d(s: str) -> dt.date:
    return dt.date.fromisoformat(s)


def text_ranges(arts: list[dict]) -> dict[int, collections.Counter]:
    """Pro Jahr: Zähler der im Text genannten Zeiträume (start, ende)."""
    out: dict[int, collections.Counter] = collections.defaultdict(collections.Counter)
    for a in arts:
        if not a["date"]:
            continue
        pub = _d(a["date"])
        for m in RANGE.finditer(a["body"] + " " + a["lead"]):
            d1, m1, y1, d2, m2, y2 = m.groups()
            mon2 = MONTHS.index(m2.lower()) + 1
            mon1 = MONTHS.index(m1.lower()) + 1 if m1 else mon2
            year = int(y2 or y1 or pub.year)
            try:
                start = dt.date(int(y1 or year), mon1, int(d1))
                end = dt.date(year, mon2, int(d2))
            except ValueError:
                continue
            if start.year != end.year and not y1:
                start = start.replace(year=end.year - 1)
            length = (end - start).days + 1
            if 1 <= length <= 60 and abs((start - pub).days) <= 300:
                out[start.year][(start.isoformat(), end.isoformat())] += 1
    return out


def density_window(dates: list[dt.date]) -> tuple[dt.date, dt.date] | None:
    """Höhepunkt der Berichterstattung: Tage mit mindestens 35 % der Spitzendichte (7-Tage-Mittel)."""
    if len(dates) < 3:
        return None
    c = collections.Counter(dates)
    lo, hi = min(dates), max(dates)
    days = [lo + dt.timedelta(i) for i in range((hi - lo).days + 1)]
    smooth = {d: sum(c.get(d + dt.timedelta(k), 0) for k in range(-3, 4)) / 7 for d in days}
    peak = max(days, key=lambda d: smooth[d])
    thr = smooth[peak] * 0.35
    s = e = peak
    while s - dt.timedelta(1) in smooth and smooth[s - dt.timedelta(1)] >= thr:
        s -= dt.timedelta(1)
    while e + dt.timedelta(1) in smooth and smooth[e + dt.timedelta(1)] >= thr:
        e += dt.timedelta(1)
    return s, e


def build(store, overrides: dict | None = None) -> dict:
    arts = [a for a in store.articles() if a["date"]]
    overrides = overrides if overrides is not None else store.get("cycle_overrides", {})
    by_year = collections.defaultdict(list)
    for a in arts:
        by_year[_d(a["date"]).year].append(a)
    top = max((len(v) for v in by_year.values()), default=0)
    ranges = text_ranges(arts)

    cycles = []
    for y in sorted(by_year):
        n = len(by_year[y])
        covered = n >= max(5, 0.25 * top)
        start = end = None
        source = ""
        mentions = 0
        if str(y) in overrides:
            start, end = overrides[str(y)]["start"], overrides[str(y)]["end"]
            source = "manuell"
        elif ranges.get(y):
            (start, end), mentions = ranges[y].most_common(1)[0]
            source = "im Text genannt"
        elif covered:
            w = density_window([_d(a["date"]) for a in by_year[y]])
            if w:
                start, end = w[0].isoformat(), w[1].isoformat()
                source = "Höhepunkt der Berichterstattung"
        cycles.append({"cycle": str(y), "start": start, "end": end, "source": source, "mentions": mentions,
                       "n": n, "covered": covered})

    # Jahre ohne eigene Angabe: Lage im Kalender wie in den anderen Jahren (jährliches Ereignis)
    known = [c for c in cycles if c["start"] and c["source"] != "Höhepunkt der Berichterstattung"] or \
            [c for c in cycles if c["start"]]
    if known:
        doy = sorted(_d(c["start"]).timetuple().tm_yday for c in known)[len(known) // 2]
        dur = sorted((_d(c["end"]) - _d(c["start"])).days for c in known)[len(known) // 2]
        for c in cycles:
            if not c["start"]:
                st = dt.date(int(c["cycle"]), 1, 1) + dt.timedelta(doy - 1)
                c["start"], c["end"] = st.isoformat(), (st + dt.timedelta(dur)).isoformat()
                c["source"] = "geschätzt (wie in den anderen Jahren)"

    anchors = sorted((c for c in cycles if c["start"]), key=lambda c: c["start"])
    placement = {}
    for a in arts:
        pub = _d(a["date"])
        # Ein Artikel gehört zum nächsten Ereignis – außer er erscheint kurz danach (Nachberichte)
        best = next((c for c in anchors if _d(c["start"]) - dt.timedelta(330) <= pub <= _d(c["end"]) + dt.timedelta(AFTER)), None)
        if not best:
            placement[a["id"]] = {"cycle": str(pub.year), "rel": None, "phase": ""}
            continue
        rel = (pub - _d(best["start"])).days
        length = (_d(best["end"]) - _d(best["start"])).days + 1
        phase = "vorher" if rel < 0 else "während" if rel < length else "danach"
        placement[a["id"]] = {"cycle": best["cycle"], "rel": rel, "phase": phase}
    for c in cycles:
        c["n"] = sum(1 for p in placement.values() if p["cycle"] == c["cycle"])
    store.put("cycles", cycles)
    store.put("placement", placement)
    return {"cycles": cycles, "placed": sum(1 for p in placement.values() if p["rel"] is not None), "total": len(arts)}
