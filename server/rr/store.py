"""SQLite-Speicher: Artikel, Import-Bericht, Zwischenergebnisse und Cache.

Alles bleibt lokal in einer Datei (Standard: ../data/rr.sqlite).
"""
from __future__ import annotations

import json
import os
import sqlite3
import threading
from pathlib import Path

DEFAULT_DB = Path(os.environ.get("RR_DB") or Path(__file__).resolve().parents[2] / "data" / "rr.sqlite")

SCHEMA = """
CREATE TABLE IF NOT EXISTS articles (
  id TEXT PRIMARY KEY,
  url TEXT,
  kind TEXT,              -- article | video | text
  title TEXT,
  lead TEXT,
  body TEXT,
  date TEXT,              -- YYYY-MM-DD (Veröffentlichung)
  datetime TEXT,
  date_source TEXT,       -- jsonld | meta | htmldate | text | none
  tags TEXT,              -- JSON-Liste
  section TEXT,
  source_file TEXT,
  words INTEGER,
  status TEXT,            -- ok | duplicate | off_topic
  status_reason TEXT,
  dup_of TEXT
);
CREATE TABLE IF NOT EXISTS skipped (
  source_file TEXT,
  reason TEXT
);
CREATE TABLE IF NOT EXISTS kv (
  key TEXT PRIMARY KEY,
  value TEXT
);
CREATE TABLE IF NOT EXISTS cache (
  key TEXT PRIMARY KEY,
  value TEXT
);
"""


class Store:
    def __init__(self, path: str | Path = DEFAULT_DB):
        self.path = Path(path)
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self._local = threading.local()
        self.db.executescript(SCHEMA)

    @property
    def db(self) -> sqlite3.Connection:
        """Eine Verbindung pro Thread (Hintergrund-Auftrag und Web-Anfragen laufen parallel)."""
        con = getattr(self._local, "con", None)
        if con is None:
            con = sqlite3.connect(self.path, timeout=30)
            con.row_factory = sqlite3.Row
            con.execute("PRAGMA journal_mode=WAL")
            con.execute("PRAGMA synchronous=NORMAL")
            self._local.con = con
        return con

    # ---------- Artikel ----------
    def reset_corpus(self) -> None:
        with self.db:
            self.db.execute("DELETE FROM articles")
            self.db.execute("DELETE FROM skipped")
            self.db.execute("DELETE FROM kv")

    def add_article(self, a: dict) -> None:
        cols = ["id", "url", "kind", "title", "lead", "body", "date", "datetime", "date_source",
                "tags", "section", "source_file", "words", "status", "status_reason", "dup_of"]
        row = {**{c: None for c in cols}, **a}
        row["tags"] = json.dumps(row.get("tags") or [], ensure_ascii=False)
        with self.db:
            self.db.execute(
                f"INSERT OR REPLACE INTO articles ({','.join(cols)}) VALUES ({','.join('?' * len(cols))})",
                [row[c] for c in cols],
            )

    def add_skipped(self, source_file: str, reason: str) -> None:
        with self.db:
            self.db.execute("INSERT INTO skipped VALUES (?, ?)", (source_file, reason))

    def articles(self, status: str | None = "ok") -> list[dict]:
        q = "SELECT * FROM articles" + (" WHERE status = ?" if status else "") + " ORDER BY date, id"
        rows = self.db.execute(q, (status,) if status else ()).fetchall()
        out = []
        for r in rows:
            d = dict(r)
            d["tags"] = json.loads(d["tags"] or "[]")
            out.append(d)
        return out

    def set_status(self, aid: str, status: str, reason: str = "", dup_of: str | None = None) -> None:
        with self.db:
            self.db.execute("UPDATE articles SET status = ?, status_reason = ?, dup_of = ? WHERE id = ?",
                            (status, reason, dup_of, aid))

    def skipped(self) -> list[dict]:
        return [dict(r) for r in self.db.execute("SELECT * FROM skipped").fetchall()]

    # ---------- Schlüssel/Wert (Zyklen, Einstellungen, Ergebnisse) ----------
    def put(self, key: str, value) -> None:
        with self.db:
            self.db.execute("INSERT OR REPLACE INTO kv VALUES (?, ?)", (key, json.dumps(value, ensure_ascii=False)))

    def get(self, key: str, default=None):
        r = self.db.execute("SELECT value FROM kv WHERE key = ?", (key,)).fetchone()
        return json.loads(r["value"]) if r else default

    # ---------- Cache (LLM-Antworten, Embeddings) ----------
    def cache_get(self, key: str):
        r = self.db.execute("SELECT value FROM cache WHERE key = ?", (key,)).fetchone()
        return json.loads(r["value"]) if r else None

    def cache_put(self, key: str, value) -> None:
        with self.db:
            self.db.execute("INSERT OR REPLACE INTO cache VALUES (?, ?)", (key, json.dumps(value, ensure_ascii=False)))
