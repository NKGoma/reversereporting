"""Story-Karten: Gemma liest jeden Artikel einmal, kurz und schnell.

Für das Gruppieren reicht eine knappe Karte (kein Oktoberfest-Wissen im Code):
  topic  – geht es um das Thema (zentral), nur am Rand (nebenbei) oder gar nicht (nicht)?
  angle  – der wiederkehrende Kern der Geschichte in 3–6 Wörtern, ohne Jahreszahl und Namen
Gemma liest dafür nur Überschrift, Vorspann und Textanfang und schreibt nur wenige Wörter:
etwa 4–5 Sekunden pro Artikel statt 20. Zahlen mit Belegen und Quellen holt erst der Blueprint
(nächster Schritt) – und nur für die Artikel wiederkehrender Geschichten.
"""
from __future__ import annotations

from . import llm

SCHEMA = {
    "type": "object",
    "required": ["topic", "angle"],
    "properties": {
        "topic": {"type": "string", "enum": ["zentral", "nebenbei", "nicht"]},
        "angle": {"type": "string"},
    },
}


def system_prompt(topic_terms: list[str]) -> str:
    t = " / ".join(topic_terms) or "das Thema des Archivs"
    return f"""Du ordnest ein Nachrichtenarchiv zum wiederkehrenden Thema {t}. Antworte nur mit JSON.
topic: "zentral" (Artikel handelt hauptsächlich von {t}), "nebenbei" ({t} nur am Rand) oder "nicht" (anderes Thema).
angle: Art der Geschichte in 3–6 Wörtern, so allgemein, dass dieselbe Geschichte in einem anderen Jahr denselben
angle bekäme. Keine Jahreszahlen, keine Namen. Beispiele: "Bierpreis-Ankündigung", "Wetterprognose zum Start",
"Halbzeitbilanz mit Besucherzahlen", "Warnung vor Betrug bei Reservierungen"."""


def article_text(a: dict, limit: int = 1200) -> str:
    body = a["body"] or ""
    if len(body) > limit:
        cut = body[:limit]
        body = cut[: max(cut.rfind(". "), limit // 2) + 1] + " […]"
    return f"Überschrift: {a['title']}\nVorspann: {a['lead']}\n\n{body}"


def make_card(store, model: str, a: dict, topic_terms: list[str]) -> dict:
    data = llm.chat_json(store, model, system_prompt(topic_terms), article_text(a), SCHEMA,
                         num_predict=60, num_ctx=2048)
    card = {
        "topic": data.get("topic") if data.get("topic") in ("zentral", "nebenbei", "nicht") else "zentral",
        "angle": (data.get("angle") or "").strip()[:80],
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
