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
| `data-occurrences` | `first` | `first` annotates only the first mention of each term; `all` annotates every mention |
| `data-watch` | `true` | Watches for content added after load (single-page apps, infinite scroll) and annotates it too. Set `data-watch="false"` to turn off; any other value (or omitting it) leaves it on |
| `data-feedback-url` | _(off)_ | Opt-in. When set, each tooltip gains **Flag** and **Suggest a term** links that open a small in-page form; submissions are POSTed as JSON to this URL. Use the literal value `demo` to try the flow with no backend (nothing is sent — the payload is logged to the console). See [Collecting feedback](#collecting-feedback-suggest-a-term--flag-a-definition) |
| `data-turnstile-key` | _(off)_ | Opt-in. A Cloudflare Turnstile **site** key. When set alongside `data-feedback-url`, the feedback form shows a Turnstile challenge and sends its token as `turnstileToken` for your endpoint to verify. Ignored in `demo` mode. See [Spam protection](#a-few-deliberate-choices) |

## Collecting feedback (suggest a term / flag a definition)

Readers are your best source of "what term is missing?" and "this definition is
off." The widget can collect both, without you leaving the page — **opt-in**, so
nothing changes for existing embeds until you switch it on.

Set `data-feedback-url` to an endpoint that accepts a JSON `POST`:

```html
<script src="/glossary/glossary.js" data-terms="/glossary/terms.json"
        data-feedback-url="https://your-endpoint.example/glossary-feedback" defer></script>
```

With it set:

- **Every tooltip** gains two small footer links — **Flag** (report a problem
  with the definition you're looking at) and **Suggest a term** (a missing one).
- You can also place your own entry point anywhere on the page — give any
  element the `data-glossary-suggest` attribute and the widget wires it to open
  the suggest form (handy for words that aren't underlined yet):

  ```html
  <a href="#" data-glossary-suggest>Suggest a term</a>
  ```

- The reader fills a two-line form and sees a thank-you — they never leave the
  page.

**Trying it with no backend:** set `data-feedback-url="demo"`. The full UI runs,
but submissions aren't sent — each payload is logged to the browser console. The
[demo page](./demo/index.html) uses this mode.

### What gets POSTed

A single JSON object. Suggestions:

```json
{
  "type": "suggest",
  "term": "mesa-optimizer",
  "note": "saw this in a post and had no idea what it meant",
  "pageUrl": "https://example.com/article",
  "source": "glossary-widget",
  "termsVersion": "0.4.0",
  "ts": "2026-06-07T12:00:00.000Z"
}
```

Flags also include the `definition` being reported and a `reason`
(`Inaccurate` / `Confusing / unclear` / `Broken or wrong source link` / `Other`).
If `data-turnstile-key` is set, a `turnstileToken` field is included too.

Any bucket that accepts a JSON `POST` works — a serverless function (Cloudflare
Workers, Vercel), a form backend (Formspree), or your own API. The endpoint must
allow cross-origin requests from the sites you embed on (CORS).

### A ready-made endpoint

This repo ships one: [`endpoint/`](./endpoint/) is a Cloudflare Worker that
verifies Turnstile, validates the (untrusted) input, and opens a labelled
**GitHub issue** per submission for review. See
[`endpoint/README.md`](./endpoint/README.md) to deploy it and wire up the two
keys. You don't have to use it — any JSON endpoint will do.

### A few deliberate choices

- **Nothing is auto-published.** Submissions are *signals for a human to
  review*, not direct edits to `terms.json`. For a glossary whose whole value is
  trustworthy, sourced definitions, that review step is the point — an open form
  that wrote straight to the live term list would be a magnet for spam and subtly
  wrong entries, shown on every site that embeds the widget.
- **Spam protection lives at your endpoint.** The widget adds only a honeypot
  field and a light per-browser rate limit — cheap deterrents. For anything
  public, add a real check at the endpoint (e.g. Cloudflare Turnstile, server-side
  rate limiting), and treat submission text as untrusted input. Set
  `data-turnstile-key` to turn on the widget side of Turnstile; the bundled
  [`endpoint/`](./endpoint/) Worker does the verification, input validation, and
  optional per-IP throttling for you.
- **Privacy unchanged when off.** With `data-feedback-url` unset (the default),
  there's no feedback UI and no extra network requests at all.

## Customising the look

The widget injects neutral base styles and exposes two classes you can override
in your own CSS:

```css
.glossary-term { /* the underlined term in your text */ }
.glossary-tip  { /* the tooltip bubble */ }
```

If you turn on feedback, these are overridable too: `.glossary-tip-actions` (the
footer link row), `.glossary-fb-overlay` (the modal backdrop), `.glossary-fb`
(the dialog card), and `.glossary-fb-submit` / `.glossary-fb-cancel` (its buttons).

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
- **Dynamic pages:** by default the widget watches for content added after the
  page loads (single-page apps, infinite scroll, live updates) and annotates it
  too. Turn this off with `data-watch="false"` if you only have static content.

## Known limits

A few cases the widget intentionally doesn't handle (yet) — worth knowing before
you embed:

- **Terms split across markup don't match.** A term has to sit within a single
  run of text. If it's broken up by inline tags — e.g. `AI <em>safety</em>` —
  it won't be detected. Plain text in a paragraph is fine.
- **Already-styled elements are skipped.** The widget never annotates text inside
  links (including links that sit inside a heading), buttons, `code`, `pre`, or
  form fields, so it won't touch your navigation or code samples. Plain heading
  text is still annotated.
- **Scope your `data-root` on app-like pages.** On a complex site, point
  `data-root` at your article/content container (e.g. `#article`) rather than the
  whole `body`. This keeps annotation off menus and widgets, and keeps the
  content-watcher focused. When a framework fully re-renders a container, the
  watcher re-scans it (one more annotation pass); already-annotated terms are
  skipped, so you won't see duplicates — scoping just keeps that work minimal.
- **First-mention mode is page-wide.** With the default `data-occurrences="first"`,
  the *first* time a term appears anywhere it's annotated; later mentions — even in
  content loaded afterwards — are left alone. Use `data-occurrences="all"` to
  annotate every mention.

## Even simpler (later): a one-line CDN embed

The lowest-friction option — a single `<script>` pointing at a CDN, with nothing
to download — needs the widget hosted in a **public** repository (this project
currently lives in a private one). Once it's published publicly, a service like
jsDelivr gives roughly:

```html
<!-- example shape once published to a public repo -->
<script src="https://cdn.jsdelivr.net/gh/<user>/<repo>/glossary.js"
        data-terms="https://cdn.jsdelivr.net/gh/<user>/<repo>/terms.json" defer></script>
```

Until then, use the self-hosted quick start above.
