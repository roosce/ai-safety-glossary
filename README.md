# AI Safety Jargon Glossary

Plain-English, hover-to-read definitions of AI-safety terms — drop into **any web
page with one line**, so newcomers don't bounce on jargon like "RLHF", "RSP",
"mesa-optimizer", or "scalable oversight".

**[▶ Live demo](https://roosce.github.io/ai-safety-glossary/demo/)**  ·  no dependencies  ·  no build step  ·  no tracking

---

## What it does

- Finds known AI-safety terms in your page and underlines the **first mention** of each.
- On hover (or tap), shows a plain-English **definition plus a link to an authoritative source**.
- **Accessible:** keyboard-focusable, screen-reader labels, `Esc` to dismiss; mobile-friendly.
- One small vanilla-JS file — no frameworks, no build, no analytics.

## Quick start

**Option A — CDN (one line).** Add this just before `</body>`:

```html
<script src="https://cdn.jsdelivr.net/gh/roosce/ai-safety-glossary/glossary.js"
        data-terms="https://cdn.jsdelivr.net/gh/roosce/ai-safety-glossary/terms.json" defer></script>
```

**Option B — self-host.** Download `glossary.js` + `terms.json`, host them on your
site, and point the tag at them. Full guide: **[EMBED.md](./EMBED.md)**.

> Tip: scope it to one container with `data-root="#article"` so menus and headers
> aren't annotated.

## Customise

Override the look in your own CSS:

```css
.glossary-term { /* the underlined term in your text */ }
.glossary-tip  { /* the tooltip bubble */ }
```

Bring your own definitions by pointing `data-terms` at your own `terms.json`.
Schema and all options are documented in **[EMBED.md](./EMBED.md)**.

## About the definitions

The definitions are concise, plain-English summaries written for newcomers. Each
cites an **authoritative source** for the concept (the original paper or a
well-respected explainer) as further reading. They aim to be accurate but
accessible — corrections and an expert sanity-check are very welcome.

## Contributing

Spotted a wrong or unclear definition, or want to add a term? Open an issue or a
pull request. Suggestions for terms that trip up newcomers are especially welcome.

## License

[MIT](./LICENSE) — use it, embed it, adapt it.

---

_Built by Cecilia Roos as a small, genuinely-useful tool for the AI-safety community._
