# PP Tracker AI — public demo

A single-file, offline-capable web app for tracking clinical-biometrics project status in plain
English. **Live demo → https://00timmer.github.io/pp-tracker-demo/**

Everything is one `index.html` — no build step, no backend, no CDN. Open it locally or use the link.

## What it does

| Tab | |
|---|---|
| **Master Tracker** | All studies in one grid — status, % complete, next milestone, blockers. |
| **Chat** | Type an update or a question in plain English. *"DEMO-103 is 90%"*, *"what's overdue?"*, *"delete DEMO-405"* — updates apply immediately and deletions are undoable. |
| **📥 Data** | **Import**: drop any spreadsheet or text file — a standard timeline is parsed directly, anything else is handed to the AI, which works out which columns are the task, dates and % complete. **Edit**: spreadsheet-style editing of projects and timelines. |
| **Plan** | Three lenses on the schedule — 📊 Gantt, 📋 Digest (windowed buckets), 🗺 Overview (an executive roadmap you can export as PNG for slides). |
| **🎯 Review** | Scores every project against a six-point rubric — record quality, staleness, progress vs. elapsed time, substance, blockers, duplication — and ranks them worst-first. |
| **Activity Log** | Every change, with the raw text that caused it. |

Your data is saved in the browser (IndexedDB) and can be exported as a `.json` snapshot or `.xlsx`.

## Bring your own AI key

The demo ships **without an API key**. Pick a provider in the header, paste your own key, press
**Connect** — it is held in memory for that session only and is never saved or transmitted anywhere
but the provider.

- **Google Gemini** — free tier available at [aistudio.google.com](https://aistudio.google.com/apikey)
- **Anthropic Claude** (`claude-opus-5`) — [console.anthropic.com](https://console.anthropic.com)

Both are called directly from the browser; there is no proxy and no server, so no key ever reaches
a third party.

Without a key the app still works for everything that isn't AI: the tracker, editing, import of
standard-format files, the Plan lenses and export.

## Demo data

The 22 studies, people and sponsors are **invented**. No real study, client or personal data is
included.

## Licence / use

Provided as-is for demonstration. Fork it and point it at your own data.
