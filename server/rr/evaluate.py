"""Messen statt raten: Gruppen gegen eine Grundwahrheit (tests/expected_groups.json) prüfen."""
from __future__ import annotations

import itertools
import json
from pathlib import Path

EXPECTED = Path(__file__).resolve().parents[1] / "tests" / "expected_groups.json"


def evaluate(store, expected_path: str | Path = EXPECTED) -> dict:
    exp = json.loads(Path(expected_path).read_text())
    groups = store.get("groups", [])
    pred = {aid: g["id"] for g in groups for aid in g["members"]}
    grec = {g["id"]: g["recurring"] for g in groups}
    truth = {aid: k for k, g in exp["groups"].items() for aid in g["ids"]}
    labelled = [a for a in truth if a in pred]

    # paarweise: gleiche erwartete Gruppe ⇔ gleiche gefundene Gruppe?
    tp = fp = fn = 0
    for a, b in itertools.combinations(labelled, 2):
        same_t, same_p = truth[a] == truth[b], pred[a] == pred[b]
        tp += same_t and same_p
        fp += same_p and not same_t
        fn += same_t and not same_p
    prec = tp / max(1, tp + fp)
    rec = tp / max(1, tp + fn)

    # pro erwarteter Gruppe: in welcher gefundenen Gruppe liegt die Mehrheit, stimmt "wiederkehrend"?
    per_group, rec_ok = [], 0
    for k, g in exp["groups"].items():
        ids = [i for i in g["ids"] if i in pred]
        if not ids:
            continue
        counts = {}
        for i in ids:
            counts[pred[i]] = counts.get(pred[i], 0) + 1
        best, n = max(counts.items(), key=lambda kv: kv[1])
        ok = grec.get(best) == g["recurring"]
        rec_ok += ok
        per_group.append({"group": k, "expected_recurring": g["recurring"], "found_in": best,
                          "coverage": round(n / len(ids), 2), "split_into": len(counts), "recurring_ok": ok})

    off = [i for i in exp.get("off_topic", [])]
    off_status = {a["id"]: a["status"] for a in store.articles(status=None)}
    off_removed = sum(1 for i in off if off_status.get(i) == "off_topic" or
                      (store.cache_get("card:" + i) or {}).get("topic") == "nicht")
    off_alone = sum(1 for i in off if i in pred and not grec.get(pred[i])
                    and (store.cache_get("card:" + i) or {}).get("topic") != "nicht")
    return {
        "pairwise_precision": round(prec, 3),
        "pairwise_recall": round(rec, 3),
        "f1": round(2 * prec * rec / max(1e-9, prec + rec), 3),
        "recurring_correct": f"{rec_ok}/{len(per_group)}",
        "off_topic_removed_or_not_recurring": f"{off_removed + off_alone}/{len(off)}",
        "per_group": per_group,
    }
