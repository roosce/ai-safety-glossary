# AI Safety Jargon Glossary — hover-tooltip widget

A tiny, embeddable widget that adds plain-English hover definitions of AI safety
terms ("RSP", "SAE", "scalable oversight", "mesa-optimiser"…) to any web page —
so newcomers don't bounce on jargon.

**Status:** 🚧 in progress · **Owner:** Cecilia · **Started:** 2026-06-04

This is project #1 from `../project-briefs.md` (see that file for the full
problem statement, validation, distribution, and success-metric plan).

---

## Why this exists

AI safety writing is dense with acronyms and insider terms. Newcomers hit a wall,
and writers either over-explain or lose readers. [aisafety.info](https://aisafety.info/)
has standalone explainers, but there's no *drop-in* way to add definitions to
content you already have — without making the reader leave the page. This fills
that gap: one snippet, definitions appear on hover, reader stays in flow.

## How it will work (plain version)

1. A site owner adds **a small snippet** (one `<script>` tag) to their page.
2. The widget reads the term list in [`terms.json`](./terms.json), finds those
   terms in the page text, and gives each one a subtle underline.
3. When a reader hovers (or taps on mobile), a small tooltip shows the
   definition. The reader never leaves the page.

The **value lives in the definitions** (this folder's content), not the code —
the code is deliberately small and dependency-free.

## Repo structure

| File | What it is |
|------|------------|
| `terms.json` | The term list + plain-English definitions (the heart of the product) |
| `README.md` | This file — what it is and the build plan |
| `EMBED.md` | How to add the glossary to your own site (copy-paste instructions) |
| `glossary.js` | The embeddable widget (vanilla JS, no dependencies; injects its own base styles) |
| _styling_ | Base styles are injected by `glossary.js`; override via the `.glossary-term` and `.glossary-tip` classes in your own CSS |
| `demo/index.html` | A live demo page showing the widget working on a real AI-safety post |
| `demo/standalone.html` | A single self-contained file (widget + terms inlined) that runs by **double-click**, no server — generated, for sharing a quick preview |
| `demo/build-standalone.js` | Regenerates `demo/standalone.html` from `glossary.js` + `terms.json` + `demo/index.html` (`node demo/build-standalone.js`) |
| `endpoint/` | Optional Cloudflare Worker that turns feedback submissions into reviewed GitHub issues (verifies Turnstile) — see [`endpoint/README.md`](./endpoint/README.md) |

## Try the demo

From the `glossary/` folder, serve the files and open the demo:

```sh
python3 -m http.server   # then visit http://localhost:8000/demo/
```

(It must be served over `http://`, not opened as a `file://` URL — the widget
loads `terms.json` via `fetch`, which browsers block for local files.)

**No server? Use the standalone.** `demo/standalone.html` bundles the widget and
the term list into one file you can just **double-click** (it sidesteps the
`fetch` limitation by embedding the data). Feedback runs in demo mode there —
submissions are logged to the browser console, not sent. Regenerate it after
changing the widget or terms with:

```sh
node demo/build-standalone.js
```

## Embedding it on your site

See **[`EMBED.md`](./EMBED.md)** for full instructions. The short version
(self-hosted): drop `glossary.js` and `terms.json` on your site and add one tag —

```html
<script src="/glossary/glossary.js" data-terms="/glossary/terms.json" defer></script>
```

## Build plan (small PRs, one thing each)

- [x] **Scaffold** — README + initial term list
- [x] **Core widget** — `glossary.js` (find terms, show tooltips), accessible + mobile-friendly
- [x] **Demo page** — the widget running on a real AI-safety post
- [x] **Source citations** — a "Source:" link under each definition
- [x] **Embed instructions** — copy-paste setup for site owners ([`EMBED.md`](./EMBED.md))
- [x] **Suggest-a-term / flag-a-definition (V1)** — opt-in in-page form (`data-feedback-url`); POSTs to an embedder-owned bucket, human-reviewed, no auto-publish
- [x] **Feedback endpoint** — Cloudflare Worker ([`endpoint/`](./endpoint/)) that verifies Turnstile (`data-turnstile-key`) and opens a labelled GitHub issue per submission _(this PR)_
- [ ] **Usage stats page** — deferred until the tool has real adoption to measure (needs privacy-safe instrumentation first)
- [ ] **Grow the term list** toward ~40, researcher-reviewed for accuracy
- [ ] **Distribution** — publish to a public repo/CDN, then pitch to aisafety.info / BlueDot (the "≥3 sites" goal)

## Decisions & open questions

- **Form factor (v1):** an **embeddable script** for site owners, per the brief.
  A **bookmarklet/extension** wrapper (works on any page, reader-side, no site
  owner needed) is a low-cost future add that lowers adoption friction — noted,
  not blocking v1.
- **Accuracy:** definitions are drafted for clarity and should be **sanity-checked
  by an AI safety researcher** before wide distribution.
- **Privacy:** any usage analytics will be privacy-safe (domain + counts only,
  no personal data) — this community cares.

## Maintenance

Low. Terms change a few times a year; the opt-in "suggest a term" / "flag a
definition" path (see `EMBED.md`) keeps it fed and surfaces what to fix.
Success metric (pre-committed): **embedded on ≥3 community sites within 3 months.**
