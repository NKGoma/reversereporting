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
4. The script checks Ollama, starts it if needed, offers to **download `gemma3:27b` once (≈ 17 GB)**, starts a web server that only this computer can reach (`127.0.0.1:8080`) and opens **http://localhost:8080**.
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

## Themenarchiv: analyse a whole archive
Start screen → **"Ganzes Archiv analysieren"**. Upload every article about a recurring event, not just one story type. Upload as many files, a **ZIP**, or a **table export** (CSV/JSON with columns such as `datum`, `titel`, `text`). The tool answers three questions:

1. **Which stories are written every time?** Articles are matched to known story types: for the Oktoberfest, e.g. poster, tent allocation, beer prices, build-up, security, run & tapping, parade, weather, Wiesn hit, mid-festival review, lost and found, medical service, police review, closing review; for elections, e.g. candidates, polls, voting advice, postal voting, election night, results, turnout, coalition. Articles that fit no known type are grouped by text similarity, so **new recurring stories are discovered** too.
2. **When?** Each article's publication date is read from metadata, a "Stand: …" line, the text or the file name. It's placed relative to the event: the Wiesn start is computed (verified against the city's festival durations 1985–2025), and election day is detected in the text and can be edited. The **story calendar** shows the typical day and spread per type.
3. **What is always in them?** The existing pattern recognition runs per story type. Aspects present in most articles become the core aspects, plus typical terms.

Uploaded archives are stored **locally in the browser (IndexedDB)**, so they survive a reload or restart. "Archiv von diesem Gerät löschen" removes texts and results. Duplicates and near-empty files are skipped, and PDFs without a text layer are reported ("gescannt – Text fehlt").

From that the tool builds a **plan for the next edition** in real dates (exportable as `.ics`). For each story type, "Blueprint" opens the usual single-story flow with exactly those articles.

Demo: "Demo: Oktoberfest-Archiv" (44 fictional articles, 2023–2025) and "Demo: Landtagswahlen" (2018 and 2023).

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
- Without Gemma: open `index.html` directly, or run `python3 -m http.server`. The rule engine works offline.
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
assets/js/views/*.js         One file per screen (llm-settings.js: the "Lokale KI" drawer)
assets/vendor/               JSZip 3.10.1 (MIT), pdf.js 3.11.174 (Apache-2.0), with licences
assets/fonts/                Archivo, Source Sans 3, JetBrains Mono (SIL OFL 1.1), with licences
start.command / start.sh     Start on the Mac / in a terminal; stop.command stops it
```
New story types go in `blueprints.js` (keywords + features with `match` and a checklist `item`).
