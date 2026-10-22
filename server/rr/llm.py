"""Ollama-Anbindung (nur localhost): strukturierte Antworten von Gemma und Embeddings.

Alle Antworten werden in der Datenbank zwischengespeichert (Schlüssel: Modell + Anfrage),
damit ein abgebrochener Lauf ohne Doppelarbeit weitergehen kann.
"""
from __future__ import annotations

import hashlib
import json
import os
import re
import urllib.error
import urllib.request

HOST = os.environ.get("RR_OLLAMA", "http://127.0.0.1:11434").rstrip("/")
PREFERRED = os.environ.get("RR_MODEL", "gemma3:27b")
EMBED_PREFERRED = ["embeddinggemma", "nomic-embed-text", "bge-m3", "mxbai-embed-large", "snowflake-arctic-embed"]


class OllamaError(RuntimeError):
    pass


def _req(path: str, body: dict | None = None, timeout: int = 900) -> dict:
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(HOST + path, data=data, method="POST" if data else "GET",
                                 headers={"Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return json.loads(r.read().decode())
    except urllib.error.HTTPError as e:
        try:
            msg = json.loads(e.read().decode()).get("error", str(e))
        except Exception:
            msg = str(e)
        raise OllamaError(msg) from None
    except (urllib.error.URLError, TimeoutError, ConnectionError) as e:
        raise OllamaError(f"Ollama nicht erreichbar ({HOST}): {e}") from None


def status() -> dict:
    try:
        names = [m["name"] for m in _req("/api/tags", timeout=5).get("models", [])]
    except OllamaError as e:
        return {"ok": False, "error": str(e), "model": None, "embed_model": None, "models": []}
    model = next((n for n in names if n in (PREFERRED, PREFERRED + ":latest")), None) \
        or next((n for n in names if n.startswith(PREFERRED)), None) \
        or next((n for n in names if n.startswith("gemma3")), None)
    emb = next((n for p in EMBED_PREFERRED for n in names if n.split(":")[0] == p), None)
    return {"ok": model is not None, "model": model, "embed_model": emb, "models": names,
            "error": None if model else f"Modell fehlt – ollama pull {PREFERRED}"}


def _key(*parts) -> str:
    return hashlib.sha1(json.dumps(parts, ensure_ascii=False, sort_keys=True).encode()).hexdigest()


def chat_json(store, model: str, system: str, user: str, schema: dict, num_predict: int = 1200,
              num_ctx: int = 8192) -> dict:
    key = "chat:" + _key(model, system, user, schema)
    hit = store.cache_get(key)
    if hit is not None:
        return hit
    body = {"model": model, "stream": False, "format": schema, "keep_alive": "30m",
            "messages": [{"role": "system", "content": system}, {"role": "user", "content": user}],
            "options": {"temperature": 0.1, "num_ctx": num_ctx, "num_predict": num_predict}}
    out = _req("/api/chat", body)
    text = (out.get("message") or {}).get("content", "")
    try:
        data = json.loads(text)
    except json.JSONDecodeError:
        m = re.search(r"\{.*\}", text, re.S)
        if not m:
            raise OllamaError("Gemma hat kein gültiges JSON geliefert")
        data = json.loads(m.group(0))
    store.cache_put(key, data)
    return data


def embed(store, model: str, texts: list[str], ids: list[str]) -> int:
    """Embeddings in Stapeln holen; schon vorhandene werden übersprungen. Gibt die Zahl neuer zurück."""
    def h(t: str) -> str:
        return _key(model, t)[:16]
    todo = [(i, t) for i, t in zip(ids, texts) if (store.cache_get("emb:" + i) or {}).get("h") != h(t)]
    for k in range(0, len(todo), 16):
        batch = todo[k:k + 16]
        out = _req("/api/embed", {"model": model, "input": [t for _, t in batch], "keep_alive": "30m"})
        for (aid, t), vec in zip(batch, out.get("embeddings", [])):
            store.cache_put("emb:" + aid, {"h": h(t), "v": vec})
    return len(todo)


# ---------- Zitate prüfen: nur was wirklich im Text steht ----------
def _norm(s: str) -> str:
    return re.sub(r"\s+", " ", re.sub(r"[„“”\"«»‚‘’']", '"', s)).strip().lower()


def verify_quote(text: str, quote: str) -> str | None:
    """Gibt den passenden Satz aus dem Text zurück oder None, wenn das Zitat dort nicht steht."""
    if not quote or len(quote) < 8:
        return None
    nt, nq = _norm(text), _norm(quote)
    sents = re.split(r"(?<=[.!?])\s+", text)
    if nq in nt or (len(nq) > 40 and nq[:40] in nt):
        probe = nq[:40]
        return next((s.strip() for s in sents if probe in _norm(s) or nq in _norm(s)), quote)
    qw = set(re.findall(r"[a-zäöüß0-9]{4,}", nq))
    if len(qw) < 3:
        return None
    best, score = None, 0.0
    for s in sents:
        sw = set(re.findall(r"[a-zäöüß0-9]{4,}", s.lower()))
        sc = len(qw & sw) / len(qw)
        if sc > score:
            best, score = s.strip(), sc
    return best if score >= 0.75 else None
