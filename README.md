# Reverse Reporting – Prototyp

**Every recurring story has elements that have to be in it every time: a price, a comparison, a reason, a reaction.**
Reverse Reporting reads past coverage, finds those constants and turns them into a research blueprint. An agent works through what it can find on its own. The journalist only gets the parts that need judgment, access or original reporting.

```
Archiv → Blueprint → Recherche → Abgleich → Story → (Blueprint fürs nächste Jahr)
```

## The five steps
| Step | What happens |
|---|---|
| **1 · Archiv** (archive) | Upload 2–5 articles (`.txt`, `.md`, `.html`, `.docx`, `.pdf`, or paste text; separate several articles with `---`). The tool detects the story type, shows the recurring elements, and highlights the evidence for each one in the text. A chart shows the archive values over the years. |
| **2 · Blueprint** | A checklist in three lanes: 🟢 **Agent** (does it alone) · 🟡 **Freigabe** (approval: agent prepares the email or call, the journalist approves it) · 🔴 **Journalist:in** (journalist only). Every item can be edited or moved to another lane. |
| **3 · Recherche** (research) | Cockpit with progress, sources, open approvals and estimated time saved. The agent fills its items in live, **always with a source link**. Approving an email or a recorded call happens inside the page. |
| **4 · Abgleich** (cross-check) | Automatic checks: unusual jumps compared with the archive trend, ranges that contradict the individual values, replies that differ from earlier figures, and items not yet checked. |
| **5 · Story** | A draft article built from the results. Open gaps are marked as `[OFFEN: …]` and link straight to the task. The blueprint is saved for next year (and can be exported as JSON). |

## Two engines
- **Offline engine (default):** works with no network and no key. It recognises five story types: folk-festival beer prices (Wiesn, Bergkirchweih, Gäuboden …), budgets, elections, season openings, and annual statistics. Any other topic gets a general engine that builds the checklist from recurring metrics, institutions, roles and story patterns. **Archive values are real; current values are simulated** (marked "Demo").
- **KI-Modus (optional, AI mode):** paste your own Anthropic API key (click "KI-Modus" at the top). Claude (`claude-opus-5-5`) then reads articles on any topic, builds the blueprint with evidence quotes, and searches the web for current values, each with a source URL and a supporting quote. The key stays in the browser and is sent only to `api.anthropic.com`. This only works on GitHub Pages or when opened locally; embedded previews block outside connections.

Emails and phone calls are **always simulated**. Nothing leaves the browser except the optional API requests.

## Themenarchiv: analyse a whole archive
Start screen → **"Ganzes Archiv analysieren"**. Upload every article about a recurring event, not just one story type. Upload as many files, a **ZIP**, or a **table export** (CSV/JSON with columns such as `datum`, `titel`, `text`). The tool answers three questions:

1. **Which stories are written every time?** Articles are matched to known story types: for the Oktoberfest, e.g. poster, tent allocation, beer prices, build-up, security, run & tapping, parade, weather, Wiesn hit, mid-festival review, lost and found, medical service, police review, closing review; for elections, e.g. candidates, polls, voting advice, postal voting, election night, results, turnout, coalition. Articles that fit no known type are grouped by text similarity, so **new recurring stories are discovered** too.
2. **When?** Each article's publication date is read from metadata, a "Stand: …" line, the text or the file name. It's placed relative to the event: the Wiesn start is computed (verified against the city's festival durations 1985–2025), and election day is detected in the text and can be edited. The **story calendar** shows the typical day and spread per type.
3. **What is always in them?** The existing pattern recognition runs per story type. Aspects present in most articles become the core aspects, plus typical terms.

From that the tool builds a **plan for the next edition** in real dates (exportable as `.ics`). For each story type, "Blueprint" opens the usual single-story flow with exactly those articles.

Demo: "Demo: Oktoberfest-Archiv" (44 fictional articles, 2023–2025) and "Demo: Landtagswahlen" (2018 and 2023).

## Fact base (real data)
The agent uses **real data tables** as its source wherever they answer a question. These results carry a source badge and link instead of "Demo".

- **Bundled:** City of Munich, open data, *Oktoberfest 1985–2025* (`assets/data/oktoberfest-muenchen-1985-2025.csv`): duration, visitors (total and per day), average Maß price, beer consumption, chicken price, chicken consumption.
  Source: [Landeshauptstadt München – Open-Data-Portal](https://opendata.muenchen.de/dataset/oktoberfest), license [Datenlizenz Deutschland – Namensnennung – Version 2.0](https://www.govdata.de/dl-de/by-2-0).
  On GitHub Pages the app also tries the city's API for newer years (best effort; if that fails, the bundled copy is used).
- **What it enables:** the official year-on-year change and price series since 1985, last year's totals, chicken price, and records. There is also a **fact check**: numbers in the uploaded archive articles are compared with the official figures (visitors, prices, duration). Matches are confirmed, deviations flagged.
- **Your own tables** (e.g. from the BR data team): start screen → "Datenquellen" → "Tabelle hinzufügen (CSV)". A `jahr` (or `year`) column is required; every numeric column becomes a series the agent can use.
- **Note on BR24:** br.de blocks automated access (including Anthropic's web search), so BR articles are added by upload.

## Demo
"Demo starten" on the start screen loads three **fictional** sample articles (Wiesn beer prices 2023–2025) and runs the whole flow.

## Running it
- Locally: open `index.html` (double-click works) or run `python3 -m http.server`.
- **GitHub Pages:** Settings → Pages → "Deploy from a branch" → branch + `/ (root)`. No build step.

## Structure
```
index.html
assets/css/br.css            Design system (BR-style, light/dark, mobile)
assets/js/blueprints.js      Story types: keywords, elements, checklist templates, contacts
assets/js/analyze.js         Offline engine: sentences, evidence, metrics, general engine
assets/js/agent-sim.js       Simulated agent (offline)
assets/js/ai.js              KI-Modus: Claude via the Anthropic SDK (structured output, web search)
assets/js/reconcile.js       Cross-check
assets/js/story.js           Story draft
assets/js/ingest.js          File import (Word/PDF load JSZip/pdf.js lazily from cdnjs)
assets/js/samples.js         Fictional demo articles
assets/js/demo-data.js       Simulated current Wiesn prices
assets/js/ui.js, app.js      UI helpers, state, navigation, drawer
assets/js/views/*.js         One file per screen
```
New story types go in `blueprints.js` (keywords + features with `match` and a checklist `item`).
