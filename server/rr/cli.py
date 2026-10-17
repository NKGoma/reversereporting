"""Kommandozeile zum Entwickeln und Prüfen jeder Stufe einzeln.

  python -m rr --db PFAD import DATEI.zip [...]   Stufe 1: einlesen
  python -m rr --db PFAD topic                    Stufe 2: Thema, eindeutig fremde Artikel
  python -m rr --db PFAD timeline                 Stufe 3: Zyklen und Ereignistage
  python -m rr --db PFAD cards [--limit N]        Stufe 4: Story-Karten + Embeddings (Gemma/Ollama)
  python -m rr --db PFAD group [--threshold T]    Stufe 5: Gruppen, wiederkehrend oder einmalig
  python -m rr --db PFAD refine                   Stufe 6: Gemma prüft und benennt die Gruppen
  python -m rr --db PFAD run DATEI.zip [...]      alles nacheinander
  python -m rr --db PFAD groups                   Ergebnis anzeigen
  python -m rr --db PFAD eval | tune              gegen tests/expected_groups.json messen
"""
from __future__ import annotations

import argparse
import json
import sys

from .store import DEFAULT_DB, Store


def _print(obj) -> None:
    print(json.dumps(obj, ensure_ascii=False, indent=2))


def print_groups(store) -> None:
    groups = store.get("groups", [])
    byid = {a["id"]: a for a in store.articles()}
    rec = [g for g in groups if g["recurring"]]
    print(f"\n{len(rec)} wiederkehrende Geschichten, {sum(1 for g in groups if not g['recurring'] and g['n'] > 1)} "
          f"einmalige Themen mit mehreren Artikeln, {sum(1 for g in groups if g['n'] == 1)} Einzelstücke\n")
    for g in rec:
        rel = g["median_rel"]
        when = "–" if rel is None else f"Tag {rel:+d}"
        print(f"  {g['label'][:40]:40} {g['n']:3} Artikel  {','.join(g['matched_cycles']):20} typisch {when}")
        for m in g["members"][:3]:
            a = byid.get(m)
            if a:
                print(f"      {a['date']}  {a['title'][:80]}")
    print("\nNicht regelmäßig (mehrere Artikel, nur ein Jahr oder zu verschiedenen Zeitpunkten):")
    for g in groups:
        if not g["recurring"] and g["n"] > 1:
            print(f"  {g['label'][:40]:40} {g['n']:3} Artikel  {','.join(g['cycles'])}")


def main(argv: list[str] | None = None) -> None:
    ap = argparse.ArgumentParser(prog="rr")
    ap.add_argument("--db", default=str(DEFAULT_DB))
    sub = ap.add_subparsers(dest="cmd", required=True)
    p = sub.add_parser("import", help="ZIP/Ordner/Dateien einlesen")
    p.add_argument("paths", nargs="+")
    sub.add_parser("report", help="Import-Bericht")
    p = sub.add_parser("topic", help="Thema erkennen, eindeutig fremde Artikel aussortieren")
    p.add_argument("--terms", nargs="*")
    sub.add_parser("timeline", help="Zyklen und Ereignistage bestimmen")
    p = sub.add_parser("cards", help="Story-Karten und Embeddings mit Gemma")
    p.add_argument("--limit", type=int)
    p = sub.add_parser("group", help="Gruppen bilden")
    p.add_argument("--threshold", type=float, default=0.11)
    sub.add_parser("refine", help="Gemma prüft und benennt die Gruppen")
    p = sub.add_parser("run", help="alle Stufen")
    p.add_argument("paths", nargs="*")
    p.add_argument("--no-llm", action="store_true")
    sub.add_parser("groups", help="Gruppen anzeigen")
    sub.add_parser("eval", help="gegen die Grundwahrheit messen")
    sub.add_parser("tune", help="beste Schwelle gegen die Grundwahrheit suchen")
    p = sub.add_parser("list", help="Artikel auflisten")
    p.add_argument("--status", default="ok")
    args = ap.parse_args(argv)
    store = Store(args.db)

    if args.cmd == "import":
        from .ingest import import_files
        _print(import_files(store, args.paths, progress=lambda i, n: print(f"\r{i}/{n}", end="", file=sys.stderr)))
    elif args.cmd == "report":
        from .ingest import report
        _print(report(store))
    elif args.cmd == "topic":
        from . import relevance
        r = relevance.apply(store, args.terms or None)
        print("Thema:", ", ".join(r["terms"]), f"| behalten: {r['kept']} | unsicher (entscheidet Gemma): {r['unsure']}")
        for o in r["off_topic"]:
            print(f"  aussortiert: {o['date']}  {o['title'][:90]}")
    elif args.cmd == "timeline":
        from . import timeline
        r = timeline.build(store)
        print(f"{r['placed']} von {r['total']} Artikeln relativ zum Ereignis eingeordnet")
        for c in r["cycles"]:
            print(f"  {c['cycle']}  {c['n']:4} Artikel  {'gut abgedeckt' if c['covered'] else 'dünn       '}  "
                  f"Ereignis: {c['start'] or '–'} bis {c['end'] or '–'}  ({c['source'] or 'unbekannt'}"
                  f"{', ' + str(c['mentions']) + 'x' if c['mentions'] else ''})")
    elif args.cmd == "cards":
        from . import cards
        _print(cards.run(store, progress=lambda i, n, t: print(f"\r{i}/{n} {t[:60]:60}", end="", file=sys.stderr),
                         limit=args.limit))
    elif args.cmd == "group":
        from . import group
        _print(group.build(store, threshold=args.threshold))
    elif args.cmd == "refine":
        from . import group
        _print(group.refine(store, progress=lambda i, n, t: print(f"\r{i}/{n} {t[:60]:60}", end="", file=sys.stderr)))
    elif args.cmd == "run":
        from .pipeline import run_all
        run_all(store, args.paths, use_llm=not args.no_llm,
                log=lambda stage, msg: print(f"[{stage}] {msg}", file=sys.stderr))
        print_groups(store)
    elif args.cmd == "groups":
        print_groups(store)
    elif args.cmd == "eval":
        from .evaluate import evaluate
        r = evaluate(store)
        for g in r.pop("per_group"):
            if g["coverage"] < 0.7 or not g["recurring_ok"]:
                print(f"  ✗ {g['group']:26} erwartet {'wiederkehrend' if g['expected_recurring'] else 'einmalig':13} "
                      f"gefunden in {g['found_in']} ({g['coverage']:.0%}, verteilt auf {g['split_into']})")
        _print(r)
    elif args.cmd == "tune":
        from . import group
        from .evaluate import evaluate
        best = None
        for t in [0.07, 0.08, 0.09, 0.1, 0.11, 0.12, 0.13, 0.15, 0.17, 0.2]:
            group.build(store, threshold=t)
            r = evaluate(store)
            ok = int(r["recurring_correct"].split("/")[0])
            print(f"Schwelle {t:.2f}: F1 {r['f1']:.3f}  wiederkehrend richtig {r['recurring_correct']}")
            if best is None or (r["f1"] + ok / 35) > best[0]:
                best = (r["f1"] + ok / 35, t)
        group.build(store, threshold=best[1])
        print(f"→ beste Schwelle {best[1]:.2f} (gespeichert)")
    elif args.cmd == "list":
        for a in store.articles(status=None if args.status == "all" else args.status):
            print(f"{a['date'] or '----------'}  {a['kind'][:5]:5}  {a['status'][:9]:9}  {a['title'][:90]}")
