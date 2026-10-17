"""Story-Karten: Gemma liest jeden Artikel einmal und hält fest, worum es geht.

Die Karte ist allgemein gehalten (kein Oktoberfest-Wissen im Code):
  topic    – geht es um das Thema (zentral), nur am Rand (nebenbei) oder gar nicht (nicht)?
  angle    – der wiederkehrende Kern der Geschichte in 3–6 Wörtern, ohne Jahreszahl und Namen
  summary  – ein Satz
  facts    – Zahlen/Werte mit wörtlichem Beleg (wird im Text geprüft)
  sources  – genannte Quellen und Ansprechpartner (Institution/Rolle)
"""
from __future__ import annotations

from . import llm

SCHEMA = {
    "type": "object",
    "required": ["topic", "angle", "summary", "facts", "sources"],
    "properties": {
        "topic": {"type": "string", "enum": ["zentral", "nebenbei", "nicht"]},
        "angle": {"type": "string"},
        "summary": {"type": "string"},
        "facts": {"type": "array", "items": {"type": "object", "required": ["label", "value", "quote"],
                                             "properties": {"label": {"type": "string"}, "value": {"type": "string"},
                                                            "quote": {"type": "string"}}}},
        "sources": {"type": "array", "items": {"type": "object", "required": ["name", "role"],
                                               "properties": {"name": {"type": "string"}, "role": {"type": "string"}}}},
    },
}


def system_prompt(topic_terms: list[str]) -> str:
    t = " / ".join(topic_terms) or "das Thema des Archivs"
    return f"""Du hilfst einer Nachrichtenredaktion, ein Archiv zu einem wiederkehrenden Thema ({t}) zu ordnen.
Lies den Artikel und fülle die Karte aus. Antworte nur mit JSON.
- topic: "zentral", wenn der Artikel hauptsächlich von {t} handelt; "nebenbei", wenn {t} nur am Rand vorkommt;
  "nicht", wenn der Artikel eigentlich ein anderes Thema hat.
- angle: Welche Art von Geschichte ist das? 3–6 Wörter, so allgemein, dass dieselbe Geschichte in einem anderen Jahr
  denselben angle bekäme. Keine Jahreszahlen, keine Personennamen. Beispiele: "Bierpreis-Ankündigung",
  "Wetterprognose zum Start", "Halbzeitbilanz mit Besucherzahlen", "Warnung vor Betrug bei Reservierungen".
- summary: ein Satz, worum es geht.
- facts: bis zu 6 konkrete Angaben (Preise, Zahlen, Termine, Orte) mit label, value und einem kurzen Zitat,
  das WÖRTLICH aus dem Artikel kopiert ist.
- sources: bis zu 6 Quellen, die im Artikel zu Wort kommen oder zitiert werden: name (Institution oder Funktion,
  z. B. "Polizei München", "Wiesnchef"), role (z. B. "Pressestelle", "Veranstalter", "Experte")."""


def article_text(a: dict, limit: int = 3000) -> str:
    body = a["body"] or ""
    if len(body) > limit:
        cut = body[:limit]
        body = cut[: max(cut.rfind(". "), limit // 2) + 1] + " […]"
    return f"Datum: {a['date']}\nÜberschrift: {a['title']}\nVorspann: {a['lead']}\n\n{body}"


def make_card(store, model: str, a: dict, topic_terms: list[str]) -> dict:
    data = llm.chat_json(store, model, system_prompt(topic_terms), article_text(a), SCHEMA, num_predict=900)
    full = "\n".join([a["title"], a["lead"], a["body"]])
    facts, dropped = [], 0
    for f in data.get("facts") or []:
        q = llm.verify_quote(full, f.get("quote", ""))
        if q:
            facts.append({"label": f.get("label", ""), "value": f.get("value", ""), "quote": q})
        else:
            dropped += 1
    card = {
        "topic": data.get("topic") if data.get("topic") in ("zentral", "nebenbei", "nicht") else "zentral",
        "angle": (data.get("angle") or "").strip()[:80],
        "summary": (data.get("summary") or "").strip()[:300],
        "facts": facts[:6],
        "sources": [s for s in (data.get("sources") or []) if s.get("name")][:6],
        "dropped_quotes": dropped,
        "model": model,
    }
    store.cache_put("card:" + a["id"], card)
    return card


def run(store, progress=None, cancel=None, limit: int | None = None) -> dict:
    st = llm.status()
    if not st["ok"]:
        raise llm.OllamaError(st["error"])
    terms = store.get("topic", {}).get("terms", [])
    arts = store.articles()
    todo = [a for a in arts if store.cache_get("card:" + a["id"]) is None]
    if limit:
        todo = todo[:limit]
    done = 0
    for a in todo:
        if cancel and cancel():
            break
        make_card(store, st["model"], a, terms)
        done += 1
        if progress:
            progress(done, len(todo), a["title"])
    # Embeddings (wenn ein Embedding-Modell installiert ist): Kern + Überschrift + Vorspann
    emb_new = 0
    if st["embed_model"] and not (cancel and cancel()):
        texts, ids = [], []
        for a in arts:
            c = store.cache_get("card:" + a["id"]) or {}
            texts.append(f"{c.get('angle', '')}. {a['title']}. {a['lead']}")
            ids.append(a["id"])
        emb_new = llm.embed(store, st["embed_model"], texts, ids)
    return {"cards_new": done, "cards_total": sum(1 for a in arts if store.cache_get("card:" + a["id"])),
            "articles": len(arts), "embeddings_new": emb_new, "embed_model": st["embed_model"], "model": st["model"]}
