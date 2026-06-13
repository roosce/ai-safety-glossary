# Glossary feedback endpoint (Cloudflare Worker)

Turns the widget's feedback submissions into **GitHub issues** for review. It
verifies a Cloudflare Turnstile token, validates and length-caps the (untrusted)
input, and opens a labelled issue. Nothing is auto-published — each issue is a
signal for a human, exactly as designed in [`../EMBED.md`](../EMBED.md).

```text
widget (data-feedback-url) ──POST JSON──▶ Worker ──▶ verify Turnstile
                                                  └──▶ open GitHub issue
```

## What you need

- A **Cloudflare** account (the Workers free tier is plenty).
- [`wrangler`](https://developers.cloudflare.com/workers/wrangler/) installed and
  logged in (`npx wrangler login`).
- A **GitHub fine-grained PAT** scoped to the target repo with
  **Issues: Read and write** (and nothing else).
- A **Cloudflare Turnstile** widget — gives you a **site key** (public, goes in
  the embed) and a **secret key** (goes in the Worker).

## Deploy

From this folder:

```bash
# 1. Point at your repo (edit GITHUB_REPO in wrangler.toml if not roosce/cecilia-os)

# 2. Set the secrets (you'll be prompted to paste each value)
npx wrangler secret put GITHUB_TOKEN
npx wrangler secret put TURNSTILE_SECRET

# 3. (optional) per-IP rate limiting — create a KV namespace, then uncomment the
#    [[kv_namespaces]] block in wrangler.toml and paste the printed id
npx wrangler kv namespace create RATE_LIMIT

# 4. Ship it
npx wrangler deploy
```

`wrangler deploy` prints the Worker URL, e.g.
`https://glossary-feedback.<your-subdomain>.workers.dev`.

## Wire up the widget

Point `data-feedback-url` at the Worker and add your Turnstile **site** key:

```html
<script src="/glossary/glossary.js"
        data-terms="/glossary/terms.json"
        data-feedback-url="https://glossary-feedback.<your-subdomain>.workers.dev"
        data-turnstile-key="0x4AAAAAAA..." defer></script>
```

The form now shows a Turnstile challenge and sends its token as `turnstileToken`;
the Worker rejects anything that doesn't verify. Leaving `data-turnstile-key` off
falls back to the widget's honeypot + client throttle only (the Worker still
verifies if `TURNSTILE_SECRET` is set, so keep them consistent).

## Configuration

| Name | Kind | Default | Purpose |
|------|------|---------|---------|
| `GITHUB_TOKEN` | secret | — | Fine-grained PAT, Issues: Read and write |
| `TURNSTILE_SECRET` | secret | — | Turnstile secret key. If set, a valid token is **required** |
| `GITHUB_REPO` | var | `roosce/cecilia-os` | `owner/repo` issues are filed in |
| `ALLOWED_ORIGINS` | var | `*` | CORS allow-list; prefer an explicit comma-separated list in prod |
| `ISSUE_LABELS` | var | _(none)_ | Extra comma-separated labels added to every issue |
| `RATE_LIMIT` | KV | _(unbound)_ | Optional per-IP throttle (20 / hour); skipped if not bound |

Every issue is labelled `glossary-feedback` plus `glossary-suggestion` or
`glossary-flag`, so you can filter the review queue. Consider creating those
labels in the repo first (otherwise GitHub creates them on first use).

## What lands in an issue

**Suggest** → title `[glossary] suggest: <term>`; body has the term, the reader's
note, the page URL, and the terms version.

**Flag** → title `[glossary] flag: <term> — <reason>`; body adds the reported
definition. Reader-supplied text is fenced in code blocks so it can't inject
markdown, non-`http(s)` page URLs are dropped, and all fields are length-capped.

## Notes

- **Free-tier friendly.** One small Worker, no build step, no framework.
- **Stateless by default.** Rate limiting is opt-in via KV; Turnstile is the
  primary abuse gate.
- **Least privilege.** The PAT only needs issue write on one repo. Rotate it with
  `wrangler secret put GITHUB_TOKEN` if it ever leaks.
- **Local check.** `node --check worker.js` validates syntax; `wrangler dev` runs
  it locally against your secrets.
