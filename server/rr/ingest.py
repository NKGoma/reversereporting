"""Import: ZIP-Dateien, Ordner oder einzelne Dateien → saubere Artikel.

Reihenfolge der Extraktion für HTML:
  1. JSON-LD (NewsArticle, VideoObject, …): Datum, Titel, Vorspann, Schlagworte, URL
  2. Seitenregel BR24: Text nur aus den RichText-Blöcken in section#articlebody
     (keine Teaser anderer Artikel, keine Einwilligungs- und Newsletter-Kästen)
  3. allgemeiner Fallback für andere Seiten: trafilatura (Text + Datum)
Übersichtsseiten (nur CollectionPage/ItemList) werden übersprungen.
Das Dateidatum wird nie benutzt – es ist meist das Speicherdatum.
"""
from __future__ import annotations

import csv
import hashlib
import html as htmllib
import io
import json
import re
import zipfile
from pathlib import Path

from lxml import html as LH

ARTICLE_TYPES = {"NewsArticle", "Article", "ReportageNewsArticle", "AnalysisNewsArticle", "BlogPosting",
                 "LiveBlogPosting", "OpinionNewsArticle", "BackgroundNewsArticle"}
VIDEO_TYPES = {"VideoObject", "AudioObject"}
LISTING_TYPES = {"CollectionPage", "ItemList", "SearchResultsPage"}

BOILERPLATE = re.compile(
    r"(Ich möchte eingebundene Inhalte|Das ist die Europäische Perspektive|Hier ist Bayern.{0,5}: Der BR24 Newsletter|"
    r"BR24[- ]Newsletter informiert|Infos und News von BR24|via WhatsApp|Wir verwenden Karten von|"
    r"Über dieses Thema berichtet|^Bildrechte:|Mehr Informationen und Einstellungen|"
    r"YouTube[- ]Kanal|BR24 in der ARD Mediathek|^Dieser Artikel ist erstmals am)", re.I)
# "Dieser Artikel ist erstmals am 12. Juni 2025 auf BR24 erschienen" – Originaldatum bei Wiederveröffentlichung
FIRST_PUB = re.compile(r"erstmals am (\d{1,2})\.\s*(" + "|".join(
    ["Januar", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"])
    + r")\s+(\d{4})", re.I)

MONTHS = {m: i + 1 for i, m in enumerate(
    ["januar", "februar", "märz", "april", "mai", "juni", "juli", "august", "september", "oktober", "november", "dezember"])}


def _clean(s: str | None) -> str:
    if not s:
        return ""
    s = htmllib.unescape(s)
    return re.sub(r"[ \t ]+", " ", s).strip()


def _ld_objects(doc) -> list[dict]:
    out = []
    for node in doc.xpath("//script[contains(@type,'ld+json')]"):
        try:
            data = json.loads(node.text_content())
        except Exception:
            continue
        stack = data if isinstance(data, list) else [data]
        while stack:
            x = stack.pop(0)
            if isinstance(x, dict):
                if "@graph" in x and isinstance(x["@graph"], list):
                    stack.extend(x["@graph"])
                out.append(x)
            elif isinstance(x, list):
                stack.extend(x)
    return out


def _types(o: dict) -> set[str]:
    t = o.get("@type")
    return set(t) if isinstance(t, list) else {t} if t else set()


def _meta(doc, prop: str) -> str:
    v = doc.xpath(f"//meta[@property='{prop}' or @name='{prop}']/@content")
    return _clean(v[0]) if v else ""


def _br24_body(doc) -> str | None:
    """None = Seite hat keinen BR24-Artikelkörper (dann allgemeiner Fallback); '' = vorhanden, aber leer."""
    sec = doc.xpath("//section[@id='articlebody']")
    if not sec:
        return None
    parts = []
    for block in sec[0].xpath(".//div[contains(@class,'RichText')]"):
        for el in block.xpath(".//p|.//h2|.//h3|.//li"):
            # verschachtelte li/p nicht doppelt nehmen
            if el.tag == "p" and el.getparent() is not None and el.getparent().tag == "li":
                continue
            t = _clean(el.text_content())
            if t and not BOILERPLATE.search(t):
                parts.append(("## " + t) if el.tag in ("h2", "h3") else t)
    return _tidy(parts)


def _tidy(parts: list[str]) -> str:
    """Boilerplate-Zeilen raus; Überschriften am Ende (Werbe-Links ohne Text) weg."""
    parts = [p for p in parts if p and not BOILERPLATE.search(p)]
    while parts and parts[-1].startswith("## "):
        parts.pop()
    return "\n".join(parts)


def _generic_body(raw: str) -> tuple[str, str]:
    """Fallback für fremde Seiten: Text und Datum per trafilatura."""
    import trafilatura
    text = trafilatura.extract(raw, include_comments=False, include_tables=False, favor_precision=True) or ""
    text = _tidy([l.strip() for l in text.split("\n")])
    date = ""
    try:
        meta = trafilatura.extract_metadata(raw)
        date = (meta.date or "") if meta else ""
    except Exception:
        pass
    return text, date


def _iso(d: str) -> str:
    m = re.match(r"(\d{4})-(\d{2})-(\d{2})", d or "")
    return m.group(0) if m else ""


def _date_from_text(text: str) -> str:
    """'Stand: 21.09.2024' oder '21. September 2024' am Textanfang."""
    head = text[:600]
    m = re.search(r"Stand:\s*(\d{1,2})\.(\d{1,2})\.(\d{4})", head) or re.search(r"\b(\d{1,2})\.(\d{1,2})\.(\d{4})\b", head)
    if m:
        return f"{m.group(3)}-{int(m.group(2)):02d}-{int(m.group(1)):02d}"
    m = re.search(r"\b(\d{1,2})\.\s*(" + "|".join(MONTHS) + r")\s+(\d{4})", head, re.I)
    if m:
        return f"{m.group(3)}-{MONTHS[m.group(2).lower()]:02d}-{int(m.group(1)):02d}"
    return ""


def parse_html(raw: bytes | str, source_file: str) -> tuple[dict | None, str]:
    """Gibt (Artikel, '') oder (None, Grund) zurück."""
    text = raw.decode("utf-8", "replace") if isinstance(raw, bytes) else raw
    try:
        doc = LH.fromstring(text)
    except Exception:
        return None, "HTML nicht lesbar"
    objs = _ld_objects(doc)
    main = next((o for o in objs if _types(o) & ARTICLE_TYPES), None)
    video = next((o for o in objs if _types(o) & VIDEO_TYPES), None)
    is_listing = any(_types(o) & LISTING_TYPES for o in objs)
    og_type = _meta(doc, "og:type")

    url = _meta(doc, "og:url") or (main or video or {}).get("url") or ""
    tags = [_clean(t) for t in doc.xpath("//meta[@property='article:tag']/@content") if _clean(t)]
    kw = (main or {}).get("keywords")
    if isinstance(kw, str):
        tags += [k.strip() for k in kw.split(",") if k.strip()]
    elif isinstance(kw, list):
        tags += [str(k).strip() for k in kw if str(k).strip()]
    tags = list(dict.fromkeys(tags))

    if main:
        title = _clean(main.get("headline") or _meta(doc, "og:title"))
        lead = _clean(main.get("description") or _meta(doc, "description"))
        body = _br24_body(doc)
        if body is None:  # andere Seite: allgemeine Extraktion
            body, _ = _generic_body(text)
        dt = main.get("datePublished") or _meta(doc, "article:published_time")
        # Videobeitrag: Seite mit Video und kaum eigenem Text (nur Vorspann/Bildunterschrift)
        kind = "video" if video and len(body.split()) < 120 else "article"
        date_source = "jsonld" if main.get("datePublished") else "meta"
        section = _clean(main.get("articleSection") if isinstance(main.get("articleSection"), str) else "")
    elif video and og_type == "article":  # Video ohne Artikel-Metadaten
        title = _clean(_meta(doc, "og:title") or video.get("name"))
        lead = _clean(video.get("description") or _meta(doc, "description"))
        body = ""
        dt = video.get("uploadDate") or _meta(doc, "article:published_time")
        kind, date_source, section = "video", "jsonld", ""
    elif is_listing or og_type == "website":
        return None, "Übersichtsseite (keine Einzelmeldung)"
    else:
        body, dt = _generic_body(text)
        title = _clean(_meta(doc, "og:title") or (doc.xpath("//title/text()") or [""])[0])
        lead = _clean(_meta(doc, "description"))
        kind, date_source, section = "article", "htmldate" if dt else "none", ""
        if len(body) < 200:
            return None, "kein Artikeltext gefunden"

    date = _iso(dt or "")
    m = FIRST_PUB.search(doc.text_content()) if kind != "text" else None
    if m:  # wiederveröffentlicht: das Originaldatum zählt für die Zeitachse
        orig = f"{m.group(3)}-{MONTHS[m.group(2).lower()]:02d}-{int(m.group(1)):02d}"
        if orig != date:
            date, date_source = orig, "erstmals erschienen"
    if not date:
        date = _date_from_text(body)
        date_source = "text" if date else "none"
    title = re.sub(r"\s*[|｜]\s*BR24\s*$", "", title)
    full = "\n".join(x for x in [lead, body] if x)
    return {
        "url": url,
        "kind": kind,
        "title": title,
        "lead": lead,
        "body": body,
        "date": date,
        "datetime": dt or "",
        "date_source": date_source,
        "tags": tags,
        "section": section,
        "source_file": source_file,
        "words": len(full.split()),
    }, ""


def parse_text(raw: bytes, source_file: str) -> tuple[dict | None, str]:
    try:
        text = raw.decode("utf-8")
    except UnicodeDecodeError:
        text = raw.decode("cp1252", "replace")
    text = text.replace("\r\n", "\n").replace("\r", "\n").strip()
    if len(text) < 200:
        return None, "kaum Text"
    lines = [l.strip() for l in text.split("\n") if l.strip()]
    title, body = lines[0], "\n".join(lines[1:])
    date = _date_from_text(text)
    return {"url": "", "kind": "text", "title": title, "lead": "", "body": body, "date": date, "datetime": "",
            "date_source": "text" if date else "none", "tags": [], "section": "", "source_file": source_file,
            "words": len(text.split())}, ""


def parse_table(raw: bytes, source_file: str) -> list[dict]:
    """CSV/JSON-Export mit Spalten wie datum/date, titel/title, text/body, url."""
    text = raw.decode("utf-8-sig", "replace")
    if source_file.lower().endswith(".json"):
        data = json.loads(text)
        rows = data if isinstance(data, list) else data.get("articles") or data.get("items") or []
    else:
        dialect = csv.Sniffer().sniff(text[:4000], delimiters=",;\t")
        rows = list(csv.DictReader(io.StringIO(text), dialect=dialect))
    pick = lambda r, *ks: next((str(r[k]) for k in r if k and k.strip().lower() in ks and r[k]), "")
    out = []
    for i, r in enumerate(rows):
        body = pick(r, "text", "body", "inhalt", "artikel", "content")
        if len(body) < 100:
            continue
        date = _iso(pick(r, "datum", "date", "published", "veröffentlicht")) or _date_from_text(pick(r, "datum", "date"))
        out.append({"url": pick(r, "url", "link"), "kind": "article", "title": pick(r, "titel", "title", "headline", "überschrift"),
                    "lead": pick(r, "vorspann", "lead", "teaser", "description"), "body": body, "date": date, "datetime": "",
                    "date_source": "table" if date else "none", "tags": [t.strip() for t in pick(r, "tags", "schlagworte").split(",") if t.strip()],
                    "section": pick(r, "ressort", "section"), "source_file": f"{source_file}#{i + 1}", "words": len(body.split())})
    return out


def _entries(paths: list[str]):
    """(Name, Bytes) für alle Dateien in ZIPs/Ordnern/Einzeldateien."""
    for p in paths:
        p = Path(p)
        if p.is_dir():
            for f in sorted(p.rglob("*")):
                if f.is_file():
                    yield from _entries([str(f)])
        elif p.suffix.lower() == ".zip":
            with zipfile.ZipFile(p) as zf:
                for info in zf.infolist():
                    base = info.filename.split("/")[-1]
                    if info.is_dir() or "__MACOSX" in info.filename or base.startswith("."):
                        continue
                    yield base, zf.read(info)
        else:
            yield p.name, p.read_bytes()


def _id(a: dict) -> str:
    key = a["url"] or (a["title"] + "|" + a["date"] + "|" + a["body"][:200])
    return hashlib.sha1(key.encode()).hexdigest()[:12]


def _shingles(s: str, k: int = 5) -> set[int]:
    w = re.findall(r"\w+", s.lower())
    return {hash(" ".join(w[i:i + k])) for i in range(max(1, len(w) - k + 1))}


def _near(d1: str, d2: str, days: int = 14) -> bool:
    if not d1 or not d2:
        return True
    from datetime import date
    return abs((date.fromisoformat(d1) - date.fromisoformat(d2)).days) <= days


def import_files(store, paths: list[str], reset: bool = True, progress=None) -> dict:
    """Liest alles ein, entfernt Dubletten, schreibt in die Datenbank. Gibt einen Bericht zurück."""
    if reset:
        store.reset_corpus()
    items, skipped = [], []
    entries = list(_entries(paths))
    for i, (name, raw) in enumerate(entries):
        low = name.lower()
        try:
            if low.endswith((".html", ".htm")):
                a, why = parse_html(raw, name)
                res = [a] if a else []
            elif low.endswith((".txt", ".md")):
                a, why = parse_text(raw, name)
                res = [a] if a else []
            elif low.endswith((".csv", ".json", ".tsv")):
                res, why = parse_table(raw, name), "keine Artikel in der Tabelle"
            else:
                res, why = [], "Dateityp nicht unterstützt"
        except Exception as e:  # einzelne kaputte Datei bricht nicht alles ab
            res, why = [], f"Fehler: {e}"
        if not res:
            skipped.append((name, why))
        items.extend(res)
        if progress:
            progress(i + 1, len(entries))

    # Dubletten: gleiche URL, sonst nahezu gleicher Text (Videos laufen oft unter mehreren URLs)
    by_url, kept = {}, []
    used = set()
    for a in sorted(items, key=lambda x: (x["date"] or "9999", -len(x["body"] or x["lead"]))):
        a["id"] = _id(a)
        while a["id"] in used:  # gleiche URL zweimal gespeichert: eigene ID für die Dublette
            a["id"] = hashlib.sha1((a["id"] + a["source_file"]).encode()).hexdigest()[:12]
        used.add(a["id"])
        if a["url"] and a["url"] in by_url:
            a["status"], a["status_reason"], a["dup_of"] = "duplicate", "gleiche URL", by_url[a["url"]]["id"]
        else:
            if a["url"]:
                by_url[a["url"]] = a
            sig = _shingles(a["title"] + " " + (a["body"] or a["lead"]))
            # nur zeitnah gleiche Texte sind Dubletten – im nächsten Jahr ist es die wiederkehrende Geschichte
            twin = next((k for k in kept if _near(a["date"], k[0]["date"])
                         and len(sig & k[1]) / max(1, len(sig | k[1])) > 0.8), None)
            if twin:
                a["status"], a["status_reason"], a["dup_of"] = "duplicate", "fast gleicher Text", twin[0]["id"]
            else:
                a["status"], a["status_reason"] = "ok", ""
                kept.append((a, sig))
        store.add_article(a)
    for name, why in skipped:
        store.add_skipped(name, why)
    return report(store)


def report(store) -> dict:
    allrows = store.articles(status=None)
    ok = [a for a in allrows if a["status"] == "ok"]
    years: dict[str, int] = {}
    for a in ok:
        y = (a["date"] or "ohne Datum")[:4] if a["date"] else "ohne Datum"
        years[y] = years.get(y, 0) + 1
    reasons: dict[str, int] = {}
    for s in store.skipped():
        reasons[s["reason"]] = reasons.get(s["reason"], 0) + 1
    return {
        "files": len(allrows) + len(store.skipped()),
        "ok": len(ok),
        "articles": sum(1 for a in ok if a["kind"] != "video"),
        "videos": sum(1 for a in ok if a["kind"] == "video"),
        "duplicates": sum(1 for a in allrows if a["status"] == "duplicate"),
        "off_topic": sum(1 for a in allrows if a["status"] == "off_topic"),
        "skipped": reasons,
        "undated": sum(1 for a in ok if not a["date"]),
        "years": dict(sorted(years.items())),
        "date_sources": {k: sum(1 for a in ok if a["date_source"] == k) for k in {a["date_source"] for a in ok}},
    }
