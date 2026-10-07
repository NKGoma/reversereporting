# Reverse Reporting – Prototyp

Every recurring story has elements that have to be in it every time: a price, a comparison, a reason, a reaction.
This tool reads past articles on a recurring story, works out those recurring elements, and turns them into a reusable research checklist (a "blueprint"). It then sorts each item by who does the work:

| Category | Example (Wiesn beer prices) | What happens |
|---|---|---|
| 🟢 **Agent does it alone** | Maß price in every festival tent | The agent fills in values **with a source link**, and the journalist ticks off "geprüft" (checked) |
| 🟡 **Agent prepares, journalist approves** | Police statement on the number of officers on duty | Email draft and call script; sending or a recorded call only after approval |
| 🔴 **Journalist only** | Quote from the mayor | Clear task with suggested questions |

## Workflow
1. **Artikel hochladen** – 2–5 articles as `.txt`, `.md` or `.html`, or paste the text
2. **Muster erkennen** – story type, recurring elements (matrix), numbers from the archive, extracted facts
3. **Checkliste** – edit, delete or add items, and change their category
4. **Recherche-Board** – the agent works through the list; approvals; to-dos; export as Markdown or JSON

## Important: offline prototype
- Runs entirely in the browser: no backend, no external services, no AI API.
- **Pattern recognition is real** (keywords, regex for prices, years, percentages, quotes, tents and institutions).
- **Agent results, contacts, replies and transcripts are simulated** (`assets/js/demo-data.js`) and marked with the "Demo" badge. **No** emails are sent and **no** calls are made.
- Previous-year prices are taken from the uploaded articles where possible.
- The session is saved in the browser's `localStorage`. "Neu starten" clears it.

## Running it
- Locally: open `index.html` directly, or run `python3 -m http.server` and go to http://localhost:8000
- **GitHub Pages:** Settings → Pages → Source "Deploy from a branch" → choose a branch (e.g. `main`) with folder `/ (root)`. No build step needed.

## Structure
```
index.html
assets/css/br.css         BR-inspired design (light/dark, mobile)
assets/js/demo-data.js    simulated data (tents, prices, contacts, replies)
assets/js/blueprints.js   story types: Wiesn beer price + generic fallback
assets/js/ingest.js       reading files and text
assets/js/analyze.js      pattern recognition
assets/js/agent-sim.js    simulated agent
assets/js/app.js          UI and state
```
New story types are added in `blueprints.js` (keywords plus features with a test and a checklist item).
