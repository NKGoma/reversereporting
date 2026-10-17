"""Alle Stufen nacheinander. Ohne Ollama läuft alles außer Story-Karten und Gruppenprüfung."""
from __future__ import annotations

from . import cards, group, ingest, llm, relevance, timeline


def run_all(store, paths: list[str] | None = None, use_llm: bool = True, log=None, progress=None, cancel=None) -> dict:
    log = log or (lambda stage, msg: None)
    out = {}
    if paths:
        r = ingest.import_files(store, paths, progress=(lambda i, n: progress("import", i, n, "")) if progress else None)
        out["import"] = r
        log("import", f"{r['ok']} Artikel, {sum(r['skipped'].values())} übersprungen, {r['duplicates']} Dubletten")
    r = relevance.apply(store)
    out["topic"] = r
    log("topic", f"Thema: {', '.join(r['terms'])} · {len(r['off_topic'])} aussortiert")
    r = timeline.build(store)
    out["timeline"] = r
    log("timeline", " · ".join(f"{c['cycle']}: {c['start']}–{c['end']}" for c in r["cycles"] if c["covered"]))
    st = llm.status() if use_llm else {"ok": False, "error": "ohne KI"}
    if st["ok"]:
        r = cards.run(store, progress=(lambda i, n, t: progress("cards", i, n, t)) if progress else None, cancel=cancel)
        out["cards"] = r
        log("cards", f"{r['cards_total']}/{r['articles']} Story-Karten, Embeddings: {r['embed_model'] or 'kein Modell'}")
    else:
        log("cards", f"übersprungen ({st['error']})")
    if cancel and cancel():
        return out
    params = store.get("group_params", {})
    r = group.build(store, threshold=params.get("threshold", 0.11))
    out["group"] = r
    log("group", f"{r['groups']} Gruppen, davon {r['recurring']} wiederkehrend")
    if st["ok"] and not (cancel and cancel()):
        r = group.refine(store, progress=(lambda i, n, t: progress("refine", i, n, t)) if progress else None, cancel=cancel)
        out["refine"] = r
        log("refine", f"{r['checked']} Gruppen geprüft, {r['outliers']} Ausreißer, {r['rejected']} verworfen")
    return out
