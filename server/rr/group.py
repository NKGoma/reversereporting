"""Ähnliche Artikel zu Story-Gruppen bündeln und wiederkehrende von einmaligen trennen.

Ähnlichkeit = Textähnlichkeit (TF-IDF: Überschrift dreifach, Vorspann doppelt, Textanfang einfach)
            + optional Bedeutungsähnlichkeit (Embeddings aus Ollama) und der "Kern" aus Gemmas Story-Karte.
Bündelung: hierarchisch (average linkage) bis zu einer Ähnlichkeitsschwelle.
Wiederkehrend = in mindestens zwei Zyklen, zu einem ähnlichen Zeitpunkt.
"""
from __future__ import annotations

import collections
import math
import re

import numpy as np

STOP = set("""aber alle allem allen aller alles als also am an ander andere anderen auch auf aus bei beim bin bis bisher bist
da dabei dadurch dafür dagegen damit dann dar darauf darum das dass dein deine dem den denn der des deshalb dessen die dies diese
diesem diesen dieser dieses doch dort du durch ein eine einem einen einer eines einige er es etwa euch euer eure für gab gibt
habe haben hat hatte hatten hier hin hinter ich ihm ihn ihnen ihr ihre im immer in ins ist ja jahr jahre jahren jede jedem jeden
jeder jedes jetzt kann kein keine können könnte machen man manche mehr mein mit muss müssen nach nicht nichts noch nun nur ob oder
ohne schon sehr sei seid sein seine seit sich sie sind so sogar soll sollen sowie über um und uns unser unter viel viele vom von
vor wann war waren warum was weil weiter welche wenn wer werden wie wieder will wir wird wo wurde wurden zu zum zur zwar zwei
zwischen heute gestern morgen laut sagt sagte rund etwa beim bereits erst ersten erste neue neuen neuer neues dieses diesem
viele wenige ganz gut groß große großen""".split())


def _stem(w: str) -> str:
    for suf in ("ungen", "ung", "en", "er", "es", "e", "n", "s"):
        if len(w) > len(suf) + 4 and w.endswith(suf):
            return w[: -len(suf)]
    return w


def tokens(text: str) -> list[str]:
    out = []
    for w in re.findall(r"[a-zäöüß][a-zäöüß-]+", text.lower()):
        parts = [p for p in w.split("-") if p]
        cands = ([w.replace("-", "")] + parts) if len(parts) > 1 else parts
        for p in cands:
            if len(p) >= 3 and p not in STOP and not p.isdigit():
                out.append(_stem(p))
    return out


def doc_text(a: dict, card: dict | None = None) -> list[str]:
    head = tokens(a["title"]) * 3 + tokens(a["lead"]) * 2 + tokens(a["body"][:1500])
    if card and card.get("angle"):
        head += tokens(card["angle"]) * 4
    return head


def tfidf_matrix(docs: list[list[str]], drop: set[str] = frozenset()) -> np.ndarray:
    n = len(docs)
    df = collections.Counter(t for d in docs for t in set(d))
    vocab = {t: i for i, t in enumerate(t for t, c in df.items() if 2 <= c <= 0.5 * n and t not in drop)}
    X = np.zeros((n, len(vocab)), dtype=np.float32)
    for i, d in enumerate(docs):
        for t, c in collections.Counter(d).items():
            j = vocab.get(t)
            if j is not None:
                X[i, j] = (1 + math.log(c)) * math.log(n / df[t])
    norms = np.linalg.norm(X, axis=1, keepdims=True)
    return X / np.maximum(norms, 1e-9)


def agglomerate(S: np.ndarray, threshold: float) -> list[list[int]]:
    """Average-Linkage-Clustering auf einer Ähnlichkeitsmatrix.
    Lance-Williams-Update: sim(a∪b, k) = (|a|·sim(a,k) + |b|·sim(b,k)) / (|a|+|b|) – exakt und schnell."""
    n = len(S)
    M = S.astype(np.float64).copy()
    np.fill_diagonal(M, -np.inf)
    size = np.ones(n)
    alive = np.ones(n, dtype=bool)
    members = {i: [i] for i in range(n)}
    while alive.sum() > 1:
        idx = np.flatnonzero(alive)
        sub = M[np.ix_(idx, idx)]
        k = int(np.argmax(sub))
        i, j = idx[k // len(idx)], idx[k % len(idx)]
        if sub.flat[k] < threshold:
            break
        a, b = (i, j) if i < j else (j, i)
        row = (size[a] * M[a] + size[b] * M[b]) / (size[a] + size[b])
        M[a, :], M[:, a] = row, row
        M[a, a] = -np.inf
        M[b, :], M[:, b] = -np.inf, -np.inf
        alive[b] = False
        size[a] += size[b]
        members[a] += members.pop(b)
    return [members[i] for i in np.flatnonzero(alive)]


TIME_WINDOW = 45  # Tage: so nah müssen zwei Ausgaben relativ zum Ereignis liegen


def build(store, threshold: float = 0.11, min_cycles: int = 2, emb_weight: float = 0.5) -> dict:
    arts = store.articles()
    placement = store.get("placement", {})
    cycles = {c["cycle"]: c for c in store.get("cycles", [])}
    topic = set(_stem(t.lower()) for t in store.get("topic", {}).get("terms", []))
    cards = {a["id"]: store.cache_get("card:" + a["id"]) for a in arts}
    # Artikel, die Gemma als "nicht zum Thema" erkannt hat, gehen nicht in die Gruppen
    arts = [a for a in arts if not (cards.get(a["id"]) or {}).get("topic") == "nicht"]
    docs = [doc_text(a, cards.get(a["id"])) for a in arts]
    S = tfidf_matrix(docs, drop=topic) @ tfidf_matrix(docs, drop=topic).T
    embs = [(store.cache_get("emb:" + a["id"]) or {}).get("v") for a in arts]
    if all(e is not None for e in embs) and embs:
        E = np.array(embs, dtype=np.float32)
        E /= np.maximum(np.linalg.norm(E, axis=1, keepdims=True), 1e-9)
        # Alle Artikel teilen das Thema – diese gemeinsame Richtung abziehen, sonst ist alles "ähnlich"
        E -= E.mean(axis=0, keepdims=True)
        E /= np.maximum(np.linalg.norm(E, axis=1, keepdims=True), 1e-9)
        Se = E @ E.T
        # auf dieselbe Streuung wie die Textähnlichkeit bringen, damit eine Schwelle für beide gilt
        off = ~np.eye(len(S), dtype=bool)
        Se = (Se - Se[off].mean()) / max(1e-6, Se[off].std()) * S[off].std() + S[off].mean()
        S = (1 - emb_weight) * S + emb_weight * Se
    np.fill_diagonal(S, 1.0)
    groups = []
    for members in agglomerate(S, threshold):
        ms = [arts[i] for i in members]
        # vorläufiger Name: Überschrift des typischsten Artikels (ähnlichster zu allen anderen)
        medoid = ms[int(np.argmax(S[np.ix_(members, members)].sum(axis=1)))] if len(ms) > 1 else ms[0]
        g = {"members": [a["id"] for a in ms], "label": short_title(medoid["title"])}
        g.update(stats(g["members"], placement, cycles, min_cycles))
        groups.append(g)
    groups.sort(key=lambda g: (not g["recurring"], -len(g["cycles"]), -g["n"]))
    for i, g in enumerate(groups):
        g["id"] = f"g{i + 1}"
    store.put("groups", groups)
    store.put("group_params", {"threshold": threshold, "min_cycles": min_cycles,
                               "embeddings": bool(embs and all(e is not None for e in embs))})
    return {"groups": len(groups), "recurring": sum(g["recurring"] for g in groups),
            "singletons": sum(1 for g in groups if g["n"] == 1)}


def stats(members: list[str], placement: dict, cycles: dict, min_cycles: int = 2) -> dict:
    """Zyklen, Zeitpunkt und Wiederkehr einer Gruppe aus der Lage ihrer Artikel."""
    pl = [placement.get(m, {}) for m in members]
    cyc = sorted({p.get("cycle") for p in pl if p.get("cycle")})
    rels = sorted(p["rel"] for p in pl if p.get("rel") is not None)
    per_cycle = collections.defaultdict(list)
    for p in pl:
        if p.get("rel") is not None:
            per_cycle[p["cycle"]].append(p["rel"])
    med = {c: sorted(v)[len(v) // 2] for c, v in per_cycle.items()}
    # Zyklen, in denen ein Artikel zeitlich zu einem Artikel aus einem anderen Zyklus passt
    matched = {c for c, rs in per_cycle.items()
               if any(abs(r - r2) <= TIME_WINDOW for c2, rs2 in per_cycle.items() if c2 != c for r in rs for r2 in rs2)}
    return {
        "n": len(members),
        "cycles": cyc,
        "covered_cycles": [c for c in cyc if cycles.get(c, {}).get("covered")],
        "median_rel": rels[len(rels) // 2] if rels else None,
        "q1": rels[len(rels) // 4] if rels else None,
        "q3": rels[(3 * len(rels)) // 4] if rels else None,
        "per_cycle_rel": med,
        "matched_cycles": sorted(matched),
        "recurring": len(matched) >= min_cycles,
    }


def short_title(t: str, n: int = 70) -> str:
    """Überschrift ohne Jahres-/Rubrik-Vorspann ('Oktoberfest 2025: …'), gekürzt."""
    t = re.sub(r"^(SA|BR24live|BR24Live|Jetzt live|Live)\s*:\s*", "", t.strip())
    m = re.match(r"^[^:]{0,30}\b(19|20)\d\d\s*[:–-]\s*(.+)$", t)
    if m:
        t = m.group(2)
    return t if len(t) <= n else t[: n - 1].rsplit(" ", 1)[0] + " …"


# ---------- Gemma prüft und benennt die Gruppen ----------
REFINE_SCHEMA = {
    "type": "object",
    "required": ["name", "same_story", "outliers", "description"],
    "properties": {
        "name": {"type": "string"},
        "description": {"type": "string"},
        "same_story": {"type": "boolean"},
        "outliers": {"type": "array", "items": {"type": "integer"}},
    },
}
REFINE_SYSTEM = """Du prüfst Gruppen von Nachrichtenartikeln aus einem Archiv zu einem wiederkehrenden Ereignis.
Eine Gruppe soll EINE Art von Geschichte sein, die (oft jedes Jahr) wieder erscheint, z. B. "Bierpreis-Ankündigung"
oder "Halbzeitbilanz". Antworte nur mit JSON.
- name: redaktioneller Name der Geschichte, 2–4 Wörter, ohne Jahreszahl.
- description: ein Satz, was diese Geschichte jedes Mal enthält.
- same_story: true, wenn die Artikel (abgesehen von Ausreißern) wirklich dieselbe Art von Geschichte sind;
  false, wenn sie nur zufällig ähnliche Wörter haben.
- outliers: Nummern der Artikel, die nicht dazugehören (leer, wenn alle passen)."""


def refine(store, progress=None, cancel=None) -> dict:
    """Mehrteilige Gruppen von Gemma prüfen lassen: Name, Beschreibung, Ausreißer, echte Geschichte ja/nein."""
    from . import llm
    st = llm.status()
    if not st["ok"]:
        raise llm.OllamaError(st["error"])
    groups = store.get("groups", [])
    byid = {a["id"]: a for a in store.articles()}
    placement = store.get("placement", {})
    cycles = {c["cycle"]: c for c in store.get("cycles", [])}
    min_cycles = store.get("group_params", {}).get("min_cycles", 2)
    todo = [g for g in groups if g["n"] >= 2 and not g.get("checked")]
    singles = []
    for k, g in enumerate(todo):
        if cancel and cancel():
            break
        ms = [byid[m] for m in g["members"] if m in byid]
        lines = []
        for i, a in enumerate(ms[:12]):
            c = store.cache_get("card:" + a["id"]) or {}
            lines.append(f"{i + 1}. [{a['date']}] {a['title']}" + (f" – {c['angle']}" if c.get("angle") else ""))
        out = llm.chat_json(store, st["model"], REFINE_SYSTEM, "Artikel der Gruppe:\n" + "\n".join(lines),
                            REFINE_SCHEMA, num_predict=300)
        drop = {ms[i - 1]["id"] for i in out.get("outliers") or [] if 1 <= i <= min(12, len(ms))}
        if len(drop) < len(ms):
            g["members"] = [m for m in g["members"] if m not in drop]
            singles += list(drop)
        g["label"] = (out.get("name") or g["label"]).strip()
        g["description"] = (out.get("description") or "").strip()
        g["checked"] = True
        g.update(stats(g["members"], placement, cycles, min_cycles))
        if not out.get("same_story", True):
            g["recurring"], g["rejected"] = False, "Gemma: keine gemeinsame Geschichte"
        if progress:
            progress(k + 1, len(todo), g["label"])
    for m in singles:  # Ausreißer werden eigene Einträge
        g = {"members": [m], "label": short_title(byid[m]["title"]), "checked": True}
        g.update(stats([m], placement, cycles, min_cycles))
        groups.append(g)
    groups.sort(key=lambda g: (not g["recurring"], -len(g["cycles"]), -g["n"]))
    for i, g in enumerate(groups):
        g["id"] = f"g{i + 1}"
    store.put("groups", groups)
    return {"checked": sum(1 for g in groups if g.get("checked")), "recurring": sum(g["recurring"] for g in groups),
            "outliers": len(singles), "rejected": sum(1 for g in groups if g.get("rejected"))}
