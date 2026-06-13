/*
 * Glossary feedback endpoint — Cloudflare Worker.
 *
 * Receives the JSON POST the glossary widget sends (data-feedback-url), verifies
 * a Cloudflare Turnstile token, and opens a GitHub issue for a human to review.
 * Nothing is auto-published — each submission is a signal, not an edit. See the
 * payload contract in ../EMBED.md and deploy steps in ./README.md.
 *
 * Configuration (set with `wrangler secret put` / vars in wrangler.toml):
 *   GITHUB_TOKEN      (secret)  fine-grained PAT, Issues: Read and write on the repo
 *   GITHUB_REPO       (var)     "owner/repo" to file issues in, e.g. "roosce/cecilia-os"
 *   TURNSTILE_SECRET  (secret)  Turnstile secret key. If set, a valid token is required.
 *   ALLOWED_ORIGINS   (var)     comma-separated origins allowed via CORS, or "*" (default "*")
 *   ISSUE_LABELS      (var)     extra comma-separated labels to add (optional)
 *   RATE_LIMIT        (KV)      optional KV namespace binding for per-IP throttling
 */
"use strict";

// Caps to keep issues tidy and bound stored text (input is untrusted).
var LIMITS = { term: 200, note: 4000, pageUrl: 2000, definition: 4000, reason: 80 };
var REASONS = ["Inaccurate", "Confusing / unclear", "Broken or wrong source link", "Other"];
var RATE_MAX = 20;            // submissions per IP per window (when RATE_LIMIT KV is bound)
var RATE_WINDOW = 3600;       // seconds
// Strip control chars but keep tab, newline, and carriage return.
var CONTROL_CHARS = new RegExp("[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]", "g");

export default {
  async fetch(request, env) {
    var origin = request.headers.get("Origin") || "";
    var cors = corsHeaders(origin, env);

    // Enforce the allow-list (when one is set): reject disallowed origins outright
    // rather than just omitting CORS headers. Turnstile is still the primary gate.
    if (!isAllowedOrigin(origin, env)) return json({ error: "origin_not_allowed" }, 403, cors);

    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
    if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405, cors);

    // Parse body.
    var body;
    try {
      body = await request.json();
    } catch (e) {
      return json({ error: "bad_json" }, 400, cors);
    }
    if (!body || typeof body !== "object") return json({ error: "bad_payload" }, 400, cors);

    // Validate / normalize (treat everything as untrusted).
    var clean = validate(body);
    if (!clean) return json({ error: "bad_payload" }, 400, cors);

    // Turnstile.
    if (env.TURNSTILE_SECRET) {
      var ip = request.headers.get("CF-Connecting-IP") || "";
      var ok = await verifyTurnstile(env.TURNSTILE_SECRET, body.turnstileToken, ip);
      if (!ok) return json({ error: "verification_failed" }, 403, cors);
    }

    // Optional per-IP rate limit (only if a KV namespace is bound).
    if (env.RATE_LIMIT) {
      var rlIp = request.headers.get("CF-Connecting-IP") || "anon";
      var key = "rl:" + rlIp;
      var count = parseInt((await env.RATE_LIMIT.get(key)) || "0", 10) || 0;
      if (count >= RATE_MAX) return json({ error: "rate_limited" }, 429, cors);
      // Best-effort; resets the TTL window on each write (sliding-ish).
      await env.RATE_LIMIT.put(key, String(count + 1), { expirationTtl: RATE_WINDOW });
    }

    if (!env.GITHUB_TOKEN || !env.GITHUB_REPO) {
      return json({ error: "server_misconfigured" }, 500, cors);
    }

    var issue = buildIssue(clean, env);
    var created = await createIssue(env, issue);
    if (!created) return json({ error: "upstream_failed" }, 502, cors);

    return json({ ok: true }, 200, cors);
  }
};

// ---- helpers --------------------------------------------------------------

function parseOrigins(env) {
  return (env.ALLOWED_ORIGINS || "*").split(",").map(function (s) { return s.trim(); }).filter(Boolean);
}

// True if the request's Origin may use this endpoint. "*" allows everything;
// otherwise the Origin must be explicitly listed (a missing Origin is rejected).
function isAllowedOrigin(origin, env) {
  var allow = (env.ALLOWED_ORIGINS || "*").trim();
  if (allow === "*") return true;
  if (!origin) return false;
  return parseOrigins(env).indexOf(origin) !== -1;
}

function corsHeaders(origin, env) {
  var allow = (env.ALLOWED_ORIGINS || "*").trim();
  var allowed = "*";
  if (allow !== "*") {
    var list = parseOrigins(env);
    // Reflect the Origin only when it's allowed; never echo an unlisted one.
    allowed = list.indexOf(origin) !== -1 ? origin : (list[0] || "*");
  }
  var h = {
    "Access-Control-Allow-Origin": allowed,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400"
  };
  if (allowed !== "*") h["Vary"] = "Origin";
  return h;
}

function json(obj, status, cors) {
  var headers = { "Content-Type": "application/json" };
  for (var k in cors) headers[k] = cors[k];
  return new Response(JSON.stringify(obj), { status: status, headers: headers });
}

// Trim, drop control chars, and cap length.
function clip(v, max) {
  if (typeof v !== "string") return "";
  return v.replace(CONTROL_CHARS, "").trim().slice(0, max);
}

// Same as clip, but collapse any newlines/tabs to a single space. Use for fields
// that land *inline* in the issue markdown (term, pageUrl, termsVersion) so a
// crafted value can't break out into new markdown lines. (note/definition are
// fenced in a code block instead, so they keep their line breaks.)
function clipInline(v, max) {
  return clip(v, max).replace(/[\r\n\t]+/g, " ").replace(/\s{2,}/g, " ").trim();
}

function validate(b) {
  var type = b.type === "flag" ? "flag" : (b.type === "suggest" ? "suggest" : null);
  if (!type) return null;

  var term = clipInline(b.term, LIMITS.term);
  var note = clip(b.note, LIMITS.note);
  var pageUrl = clipInline(b.pageUrl, LIMITS.pageUrl);
  // Only keep a well-formed http(s) page URL; otherwise drop it.
  if (pageUrl) {
    try {
      var u = new URL(pageUrl);
      pageUrl = (u.protocol === "http:" || u.protocol === "https:") ? u.href : "";
    } catch (e) {
      pageUrl = "";
    }
  }

  var out = {
    type: type,
    term: term,
    note: note,
    pageUrl: pageUrl,
    termsVersion: clipInline(b.termsVersion, 40)
  };

  if (type === "suggest") {
    if (!term) return null;                 // a suggestion needs a term
  } else {
    out.definition = clip(b.definition, LIMITS.definition);
    var reason = clip(b.reason, LIMITS.reason);
    out.reason = REASONS.indexOf(reason) !== -1 ? reason : "Other";
  }
  return out;
}

async function verifyTurnstile(secret, token, ip) {
  if (!token || typeof token !== "string") return false;
  var form = new FormData();
  form.append("secret", secret);
  form.append("response", token);
  if (ip) form.append("remoteip", ip);
  try {
    var r = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      body: form
    });
    var data = await r.json();
    return !!(data && data.success);
  } catch (e) {
    return false;
  }
}

// Fence user text in a code block so it can't inject markdown into the issue.
function fence(s) {
  if (!s) return "_(none)_";
  var safe = String(s).replace(/```/g, "ʼʼʼ");
  return "```\n" + safe + "\n```";
}

// Keep titles single-line and short.
function titleText(s, fallback) {
  var t = String(s || "").replace(/\s+/g, " ").trim().slice(0, 100);
  return t || fallback;
}

function buildIssue(c, env) {
  var labels = ["glossary-feedback", c.type === "flag" ? "glossary-flag" : "glossary-suggestion"];
  var extra = (env.ISSUE_LABELS || "").split(",").map(function (s) { return s.trim(); }).filter(Boolean);
  labels = labels.concat(extra);

  var title, lines = [];
  if (c.type === "flag") {
    title = "[glossary] flag: " + titleText(c.term, "(unspecified term)") + " — " + c.reason;
    lines.push("**Type:** flag a definition");
    lines.push("**Term:** " + (c.term || "_(unspecified)_"));
    lines.push("**Reason:** " + c.reason);
    lines.push("");
    lines.push("**Definition reported:**");
    lines.push(fence(c.definition));
  } else {
    title = "[glossary] suggest: " + titleText(c.term, "(new term)");
    lines.push("**Type:** suggest a term");
    lines.push("**Term:** " + c.term);
  }
  lines.push("");
  lines.push("**Note from reader:**");
  lines.push(fence(c.note));
  lines.push("");
  lines.push("**Page:** " + (c.pageUrl ? c.pageUrl : "_(not provided)_"));
  lines.push("**Terms version:** " + (c.termsVersion || "_(unknown)_"));
  lines.push("");
  lines.push("<sub>Filed automatically by the glossary feedback widget. Review before acting — not auto-published.</sub>");

  return { title: title.slice(0, 256), body: lines.join("\n"), labels: labels };
}

async function createIssue(env, issue) {
  try {
    var r = await fetch("https://api.github.com/repos/" + env.GITHUB_REPO + "/issues", {
      method: "POST",
      headers: {
        "Authorization": "Bearer " + env.GITHUB_TOKEN,
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "glossary-feedback-worker",
        "Content-Type": "application/json"
      },
      body: JSON.stringify(issue)
    });
    return r.status === 201;
  } catch (e) {
    return false;
  }
}
