# Embedding the AI Safety Jargon Glossary

Add plain-English hover definitions of AI-safety terms to any web page. The
widget is one small file, with no dependencies and no build step.

## Quick start (self-hosted)

1. **Download two files** from this folder:
   - `glossary.js` (the widget)
   - `terms.json` (the definitions)
2. **Put them somewhere on your site** — e.g. `/glossary/glossary.js` and
   `/glossary/terms.json`.
3. **Add one line** to your page, just before the closing `</body>` tag:

   ```html
   <script src="/glossary/glossary.js" data-terms="/glossary/terms.json" defer></script>
   ```

That's it. The widget finds known terms in your page, underlines the **first
mention** of each, and shows the definition (and its source) on hover or tap.

> ⚠️ The page must be served over `http(s)`, not opened as a `file://` file —
> the widget loads `terms.json` with `fetch`, which browsers block for local files.

## Options

Set these as attributes on the `<script>` tag:

| Attribute | Default | What it does |
|-----------|---------|--------------|
| `data-terms` | `terms.json` | URL of the term list to load |
| `data-root` | `body` | CSS selector to limit annotation to one container (e.g. `#article`), so menus and headers aren't touched |

## Customising the look

The widget injects neutral base styles and exposes two classes you can override
in your own CSS:

```css
.glossary-term { /* the underlined term in your text */ }
.glossary-tip  { /* the tooltip bubble */ }
```

## Using your own definitions

`terms.json` is a plain list — copy it and edit, or point `data-terms` at your
own file. Each entry looks like:

```json
{
  "term": "RLHF",
  "aliases": ["reinforcement learning from human feedback"],
  "definition": "Reinforcement learning from human feedback (RLHF): a training method where…",
  "source": { "name": "Christiano et al. (2017)", "url": "https://arxiv.org/abs/1706.03741" }
}
```

- `aliases` — other spellings/forms that should also match (optional).
- `source` — shown as a "Source:" link in the tooltip (optional; `http(s)` only).

## Good to know

- **Privacy:** v1 includes no analytics or telemetry — the widget tracks nothing.
  The browser only requests the files you host (e.g. `glossary.js`, `terms.json`).
- **Accessibility:** terms are keyboard-focusable; the definition is announced
  via an `aria-label`; `Esc` dismisses the tooltip.
- **Safe by design:** definitions render as text (never HTML), and source links
  are restricted to `http(s)`.

## Even simpler: a one-line CDN embed (no download)

Because this repo is public, you can skip hosting the files yourself and point
straight at a CDN like jsDelivr:

```html
<script src="https://cdn.jsdelivr.net/gh/roosce/ai-safety-glossary/glossary.js"
        data-terms="https://cdn.jsdelivr.net/gh/roosce/ai-safety-glossary/terms.json" defer></script>
```

To pin a specific version (recommended for production so updates don't surprise
you), add a tag or commit, e.g. `…/gh/roosce/ai-safety-glossary@v0.2.1/glossary.js`.
