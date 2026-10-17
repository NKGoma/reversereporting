"""Lokaler Dienst: liefert die App aus (gleicher Ursprung) und die Archiv-Analyse unter /api.

Start:  uv run --project server uvicorn rr.api:app --app-dir server --host 127.0.0.1 --port 8080
Nur an 127.0.0.1 gebunden – von außen nicht erreichbar.
"""
from __future__ import annotations

import hashlib
import threading
import time
import traceback
from pathlib import Path

from fastapi import FastAPI, HTTPException, Request, UploadFile
from fastapi.responses import HTMLResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from . import group, ingest, llm, pipeline, timeline
from .store import DEFAULT_DB, Store

ROOT = Path(__file__).resolve().parents[2]
UPLOADS = ROOT / "data" / "uploads"
store = Store(DEFAULT_DB)
app = FastAPI(title="Reverse Reporting", docs_url=None, redoc_url=None)


# ---------- Hintergrund-Aufträge (ein Auftrag zur Zeit) ----------
class Job:
    def __init__(self):
        self.lock = threading.Lock()
        self.state = {"running": False, "kind": "", "stage": "", "i": 0, "n": 0, "text": "", "log": [],
                      "error": "", "started": 0, "finished": 0}
        self._cancel = False

    def start(self, kind: str, fn) -> bool:
        with self.lock:
            if self.state["running"]:
                return False
            self._cancel = False
            self.state = {"running": True, "kind": kind, "stage": "", "i": 0, "n": 0, "text": "", "log": [],
                          "error": "", "started": time.time(), "finished": 0}
        threading.Thread(target=self._run, args=(fn,), daemon=True).start()
        return True

    def _run(self, fn):
        try:
            fn(self)
        except Exception as e:  # Fehler sichtbar machen statt still abzubrechen
            self.state["error"] = str(e)
            traceback.print_exc()
        finally:
            self.state["running"] = False
            self.state["finished"] = time.time()

    def log(self, stage: str, msg: str):
        self.state["log"].append({"stage": stage, "msg": msg})

    def progress(self, stage: str, i: int, n: int, text: str = ""):
        self.state.update(stage=stage, i=i, n=n, text=text)

    def cancel(self):
        self._cancel = True

    def cancelled(self) -> bool:
        return self._cancel


job = Job()


# ---------- API ----------
@app.get("/api/status")
def status():
    return {"ollama": llm.status(), "corpus": ingest.report(store) if store.articles(status=None) else None,
            "job": job.state, "topic": store.get("topic"), "has_groups": bool(store.get("groups"))}


@app.post("/api/import")
async def import_files(request: Request):
    form = await request.form()
    files: list[UploadFile] = [f for f in form.getlist("files") if hasattr(f, "filename")]
    if not files:
        raise HTTPException(400, "Keine Dateien")
    folder = UPLOADS / time.strftime("%Y%m%d-%H%M%S")
    folder.mkdir(parents=True, exist_ok=True)
    paths = []
    for f in files:
        name = Path(f.filename).name or "datei"
        p = folder / name
        p.write_bytes(await f.read())
        paths.append(str(p))
    use_llm = form.get("llm", "0") == "1"

    def work(j: Job):
        pipeline.run_all(store, paths, use_llm=use_llm, log=j.log, progress=j.progress, cancel=j.cancelled)
    if not job.start("import", work):
        raise HTTPException(409, "Es läuft schon ein Auftrag")
    return {"ok": True, "files": len(paths)}


@app.post("/api/run/{what}")
def run(what: str):
    if what not in ("gemma", "rules"):
        raise HTTPException(404)

    def work(j: Job):
        pipeline.run_all(store, None, use_llm=what == "gemma", log=j.log, progress=j.progress, cancel=j.cancelled)
    if not job.start(what, work):
        raise HTTPException(409, "Es läuft schon ein Auftrag")
    return {"ok": True}


@app.get("/api/job")
def job_state():
    return job.state


@app.post("/api/job/cancel")
def job_cancel():
    job.cancel()
    return {"ok": True}


def _article_view(a: dict, placement: dict) -> dict:
    c = store.cache_get("card:" + a["id"]) or {}
    p = placement.get(a["id"], {})
    return {"id": a["id"], "date": a["date"], "title": a["title"], "lead": a["lead"][:300], "kind": a["kind"],
            "url": a["url"], "words": a["words"], "status": a["status"], "reason": a["status_reason"],
            "cycle": p.get("cycle"), "rel": p.get("rel"), "phase": p.get("phase"),
            "angle": c.get("angle"), "topic": c.get("topic"), "summary": c.get("summary"),
            "facts": c.get("facts", []), "sources": c.get("sources", [])}


@app.get("/api/articles")
def articles():
    placement = store.get("placement", {})
    return {"articles": [_article_view(a, placement) for a in store.articles(status=None)],
            "skipped": store.skipped()}


@app.get("/api/timeline")
def get_timeline():
    return {"cycles": store.get("cycles", []), "placement": store.get("placement", {}),
            "overrides": store.get("cycle_overrides", {})}


@app.put("/api/cycles")
async def put_cycles(request: Request):
    body = await request.json()  # {"2025": {"start": "...", "end": "..."}} – leer = Automatik
    ov = store.get("cycle_overrides", {})
    for k, v in body.items():
        if v and v.get("start") and v.get("end"):
            ov[str(k)] = {"start": v["start"], "end": v["end"]}
        else:
            ov.pop(str(k), None)
    store.put("cycle_overrides", ov)
    timeline.build(store)
    params = store.get("group_params", {})
    group.build(store, threshold=params.get("threshold", 0.11))
    _apply_group_overrides()
    return {"cycles": store.get("cycles", [])}


def _sig(members: list[str]) -> str:
    return hashlib.sha1("|".join(sorted(members)).encode()).hexdigest()[:12]


def _apply_group_overrides():
    ov = store.get("group_overrides", {})
    groups = store.get("groups", [])
    for g in groups:
        o = ov.get(_sig(g["members"]))
        if o:
            g.update({k: v for k, v in o.items() if k in ("label", "recurring")})
            g["edited"] = True
    store.put("groups", groups)


@app.get("/api/groups")
def get_groups():
    placement = store.get("placement", {})
    byid = {a["id"]: a for a in store.articles(status=None)}
    out = []
    for g in store.get("groups", []):
        out.append({**g, "sig": _sig(g["members"]),
                    "articles": [_article_view(byid[m], placement) for m in g["members"] if m in byid]})
    return {"groups": out, "params": store.get("group_params", {})}


@app.put("/api/groups/{sig}")
async def put_group(sig: str, request: Request):
    body = await request.json()
    ov = store.get("group_overrides", {})
    ov[sig] = {**ov.get(sig, {}), **{k: v for k, v in body.items() if k in ("label", "recurring")}}
    store.put("group_overrides", ov)
    _apply_group_overrides()
    return {"ok": True}


@app.post("/api/reset")
def reset():
    if job.state["running"]:
        raise HTTPException(409, "Es läuft noch ein Auftrag")
    store.reset_corpus()
    return {"ok": True}


@app.exception_handler(llm.OllamaError)
def _ollama_error(_, exc):
    return JSONResponse({"detail": str(exc)}, status_code=503)


# ---------- App ausliefern (gleicher Ursprung, CSP 'self' reicht) ----------
@app.get("/")
def index():
    # Markierung für die App: hier läuft der Analyse-Dienst
    html = (ROOT / "index.html").read_text(encoding="utf-8")
    return HTMLResponse(html.replace("<head>", '<head>\n  <meta name="rr-service" content="1">', 1),
                        headers={"Cache-Control": "no-store"})


app.mount("/assets", StaticFiles(directory=ROOT / "assets"), name="assets")
