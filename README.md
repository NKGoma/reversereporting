# Reverse Reporting – Prototyp

**Every recurring story has elements that have to be in it every time: a price, a comparison, a reason, a reaction.**
Reverse Reporting reads past coverage, finds those constants and turns them into a research blueprint. An agent works through what it can find on its own. The journalist only gets the parts that need judgment, access or original reporting.

```
Archiv → Blueprint → Recherche → Abgleich → Story → (Blueprint fürs nächste Jahr)
```

**Runs entirely on your own device.** The rule engine runs in the browser; the AI is **Gemma 3 (27B) via Ollama** on the same machine. The app has no internet connection: a Content Security Policy only lets it load its own files and talk to Ollama on `localhost`. Articles never leave the computer.

## Installation on the Mac (5 steps)
Tested for Apple Silicon (M-series) with 32 GB or more; 64 GB is comfortable.

1. **Install Ollama:** download from [ollama.com/download](https://ollama.com/download), move it to Applications and start it once.
2. **Get the app:** on GitHub, "Code" → "Download ZIP" and unpack it (or `git clone`). No npm, no build step: every library and font is in the repo.
3. **Double-click `start.command`.** macOS may block it the first time ("unidentified developer" / "cannot be verified"). Then either:
   - System Settings → Datenschutz & Sicherheit (Privacy & Security) → scroll down → "Dennoch öffnen" (Open Anyway), then double-click again; or
   - **always works:** open Terminal, type `cd ` (with a space), drag the folder into the window, press Enter, then run `bash start.sh`.

   Tip: `git clone` instead of the ZIP avoids the block entirely.
4. The script:
   - checks Ollama and starts it if needed;
   - offers to **download `gemma3:27b` once (≈ 17 GB)**;
   - installs **`uv`** once if it's missing (the Python environment for the archive analysis, ≈ 30 MB), loads the Python packages on first start, then starts the **local analysis service**, reachable only from this computer (`127.0.0.1:8080`);
   - opens **http://localhost:8080**.

   Recommended once: `ollama pull embeddinggemma` (≈ 600 MB). It makes the story groups more accurate.
5. Top right in the app: **"Gemma bereit"** (Gemma ready). On the start screen, choose "Gemma (lokal)" under "Analyse mit" (analyse with).

To stop: close the Terminal window or run `stop.command`; that also unloads Gemma from memory.

Manually, without the script:
```bash
ollama pull gemma3:27b
ollama serve                       # if the Ollama app isn't running
python3 -m http.server 8080 --bind 127.0.0.1
# open http://localhost:8080
```

### Quick check (2 minutes)
1. The header shows "Lokal" and "Gemma bereit". Click it, then **"Gemma testen"** (test Gemma): you should see "JSON ok" and the speed in tokens/s. The first test includes loading the model (about 10–30 s).
2. "Demo: Oktoberfest-Archiv" → "15 Story-Typen vertiefen". Gemma works through the story types (about 20–60 s each); the table gets "Gemma" badges, and the drawer shows core aspects with verbatim quotes.
3. Run the same thing again: the answers now come from the local cache instantly.

### Troubleshooting
| Symptom | Fix |
|---|---|
| "Ollama aus" | Start the Ollama app or run `ollama serve`. Then "Erneut prüfen" (check again) in the app. |
| "Gemma fehlt" | `ollama pull gemma3:27b`. A different model (e.g. `gemma3:12b` for less memory) can be chosen in the settings. |
| "Ollama lehnt diese Seite ab" | Open the app via `start.command` / `http://localhost:8080`, not by double-clicking `index.html`. Ollama only accepts requests from localhost pages. |
| Slow or memory pressure | In the settings, set the context window to 16,384, or close other large apps. 64 GB is plenty for 32,768. |
| Port 8080 taken | `RR_PORT=8090 ./start.sh` |

## The five steps
| Step | What happens |
|---|---|
| **1 · Archiv** (archive) | Upload 2–5 articles (`.txt`, `.md`, `.html`, `.docx`, `.pdf` with a text layer, or paste text; separate several articles with `---`). The tool detects the story type, shows the recurring elements, and highlights the evidence for each one in the text. A chart shows the archive values over the years. |
| **2 · Blueprint** | A checklist in three lanes: 🟢 **Agent** (does it alone) · 🟡 **Freigabe** (approval: agent prepares the email or call, the journalist approves it) · 🔴 **Journalist:in** (journalist only). Every item can be edited or moved to another lane. |
| **3 · Recherche** (research) | Cockpit with progress, sources, open approvals and estimated time saved. The agent fills its items in live, **always with a source link**. Approving an email or a recorded call happens inside the page. |
| **4 · Abgleich** (cross-check) | Automatic checks: unusual jumps compared with the archive trend, ranges that contradict the individual values, replies that differ from earlier figures, and items not yet checked. |
| **5 · Story** | A draft article built from the results. Open gaps are marked as `[OFFEN: …]` and link straight to the task. The blueprint is saved for next year (and can be exported as JSON). |

## Two engines (hybrid)
- **Rule engine (always on):** fast and deterministic. It recognises six story types (folk-festival beer prices, festival opening, budgets, elections, season openings, annual statistics); any other topic gets a general engine that builds the checklist from recurring metrics, institutions, roles and story patterns. In the Themenarchiv it sorts hundreds of articles in well under a second.
- **Gemma (local, optional):** `gemma3:27b` via Ollama.
  - **Single story:** Gemma reads the articles and builds the blueprint (lanes, rationale, contact, email draft, call script, questions). Long articles are shortened to fit the context window (shown in the UI).
  - **Themenarchiv:** after the rule analysis, Gemma reads up to six examples per story type and returns a proper name, a description, the **core aspects with a verbatim quote**, typical sources, and what only the reporter can do. Before that it sorts one-off articles into known story types by their headline.
  - **Checked, not trusted:** every quote Gemma gives is searched for in the original text. Quotes that aren't there are dropped, and the UI says how many.
  - Answers are cached locally (IndexedDB), so the same analysis is instant the second time. It runs with a progress display (tokens/s) and can be cancelled at any time. If Ollama isn't running, the rule engine takes over.
- **Agent:** works without internet. It uses the archive, the bundled city data and your own tables. Values for the new year without a source are simulated (marked "Demo") or carried over as suggestions to confirm. Emails and calls are **always simulated**.

## Archiv-Analyse: which stories come back, and when
Start screen → **"Ganzes Archiv analysieren"** (analyse a whole archive) → drag a ZIP or files onto it (HTML pages, text, or a CMS export as CSV/JSON). When the app is started via `start.command`/`start.sh`, the **local analysis service** (`server/`, Python) does the work. Every step produces a table you can check and correct:

| # | Step | What happens |
|---|---|---|
| 1 | **Import** | Structured page metadata (JSON-LD) supplies the date, headline and lead. For BR24 the text comes **only from the article body**: no teasers of other articles, no consent or newsletter boxes. Other websites go through `trafilatura`. Overview pages are skipped. Duplicates count only within 14 days; the same text a year later is the recurring story. Republished articles ("erstmals am … erschienen") keep their original date. The file date is never used. |
| 2 | **Topic** | Detected from tags that appear in many articles *and* in headlines. Region tags such as "Oberbayern" drop out. Only clear cases are removed; Gemma decides the borderline cases. |
| 3 | **Timeline & event days** | One cycle per year. The event days come, in this order, from: your correction → the date range named in the texts ("vom 19. September bis 4. Oktober") → the peak of coverage → estimated like the other years. An article belongs to the next event, unless it appears up to 45 days after one (follow-up). The view shows one lane per year with every article as a point. |
| 4 | **Story cards** *(Gemma)* | Gemma reads each article's headline, lead and opening once and records only: on topic yes/no, and the core of the story in a few words. That takes about 5 s per article (≈ 20–25 min for 280). It runs in the background, finished cards are saved, and after an interruption it continues where it stopped. `start.sh` keeps the Mac awake while it runs. Figures with quotes and sources come later in the blueprint, and only for recurring stories. |
| 5 | **Grouping** | Text similarity (headline ×3, lead ×2, body), plus meaning similarity with `embeddinggemma`, plus the core from the story card. Hierarchical clustering. |
| 6 | **Recurring or not** | **Recurring** = in at least 2 years, each with one article within ±45 days of an article from another year. Many articles in a single year (a major incident) are **not** recurring. Gemma checks every group, names it and removes outliers. You can rename groups and set "recurring/one-off". |

Next: the **blueprint per recurring story** (M2), built from the elements that appear every year, with evidence per year.

**Command line** (for development and checking, each step on its own):
```bash
cd server
uv run python -m rr --db ../data/rr.sqlite run ~/Desktop/archiv.zip   # everything, with Gemma if Ollama is running
uv run python -m rr --db ../data/rr.sqlite groups                     # show the result
uv run python -m rr --db ../data/rr.sqlite eval                       # measure against tests/expected_groups.json
uv run python -m rr --db ../data/rr.sqlite tune                       # find the best threshold
uv run python -m unittest discover -s tests -v                        # tests (made-up pages)
```
**Measured, not guessed:** `tests/expected_groups.json` contains the ground truth for the BR24 Oktoberfest archive (35 story groups, 162 assigned articles, 21 off-topic). It holds only article IDs (hashes of the URLs) and generic names, no content.

With the rule engine alone (no model), the result is pairwise precision 0.89, recall 0.67, and **31 of 35 groups correctly recurring or one-off**. Gemma's story cards and the embeddings are meant to improve this further, but that has not been measured yet. To measure it on the Mac: `run`, then `eval`.

Without the service (GitHub Pages, double-clicking `index.html`), the older in-browser Themenarchiv stays available, including the demo archives.

## Fact base (real data)
The agent uses **real data tables** as its source wherever they answer a question. These results carry a source badge and link instead of "Demo".

- **Bundled:** City of Munich, open data, *Oktoberfest 1985–2025* (`assets/data/oktoberfest-muenchen-1985-2025.csv`): duration, visitors (total and per day), average Maß price, beer consumption, chicken price, chicken consumption.
  Source: [Landeshauptstadt München – Open-Data-Portal](https://opendata.muenchen.de/dataset/oktoberfest), license [Datenlizenz Deutschland – Namensnennung – Version 2.0](https://www.govdata.de/dl-de/by-2-0).
- **What it enables:** the official year-on-year change and price series since 1985, last year's totals, chicken price, and records. There is also a **fact check**: numbers in the uploaded archive articles are compared with the official figures (visitors, prices, duration). Matches are confirmed, deviations flagged.
- **Your own tables** (e.g. from the BR data team): start screen → "Datenquellen" → "Tabelle hinzufügen (CSV)". A `jahr` (or `year`) column is required; every numeric column becomes a series the agent can use.
- **BR articles** are added by upload (files, ZIP, or a CMS export as CSV/JSON).

## Demo
"Demo starten" on the start screen loads three **fictional** sample articles (Wiesn beer prices 2023–2025) and runs the whole flow.

## Running it
- **On your device with Gemma:** see "Installation on the Mac" above (`start.command`).
- Without the analysis service: open `index.html` directly, or run `python3 -m http.server`. The rule engine and the in-browser Themenarchiv work offline.
- **GitHub Pages** works too (rule engine only; Gemma needs the app on `localhost`).

## Structure
```
index.html
assets/css/br.css            Design system (BR-style, light/dark, mobile)
assets/js/blueprints.js      Story types: keywords, elements, checklist templates, contacts
assets/js/analyze.js         Offline engine: sentences, evidence, metrics, general engine
assets/js/agent-sim.js       Simulated agent (offline)
assets/js/llm.js             Local AI: Gemma via Ollama (status, streaming, JSON schema, quote check, cache)
assets/js/store.js           IndexedDB: uploaded archives and the Gemma cache
assets/js/corpus.js          Themenarchiv: events, story types, timing, aspects, plan
assets/js/reconcile.js       Cross-check
assets/js/story.js           Story draft
assets/js/ingest.js          File import (Word/PDF/ZIP via the bundled JSZip and pdf.js)
assets/js/samples.js         Fictional demo articles
assets/js/demo-data.js       Simulated current Wiesn prices
assets/js/ui.js, app.js      UI helpers, state, navigation, drawer
assets/js/views/*.js         One file per screen (analyse.js: archive analysis via the service; llm-settings.js: "Lokale KI")
server/rr/                   Local analysis service: ingest, relevance, timeline, cards (Gemma), group, api, cli
server/tests/                Tests (made-up pages) and the ground truth for the BR24 Oktoberfest archive
assets/vendor/               JSZip 3.10.1 (MIT), pdf.js 3.11.174 (Apache-2.0), with licences
assets/fonts/                Archivo, Source Sans 3, JetBrains Mono (SIL OFL 1.1), with licences
start.command / start.sh     Start on the Mac / in a terminal; stop.command stops it
```
New story types go in `blueprints.js` (keywords + features with `match` and a checklist `item`).
