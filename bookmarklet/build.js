/*
 * Build the self-contained AI Safety Glossary bookmarklet.
 *
 * Combines glossary-core.js + terms.json into a single javascript: URL with the
 * definitions baked in (no fetch, no hosting), then writes install.html: a page
 * with a draggable "install" button, instructions, and a test article so you can
 * click it immediately and feel what the reader experiences.
 *
 *   node build.js
 */
const fs = require("fs");
const path = require("path");

const dir = __dirname;
const core = fs.readFileSync(path.join(dir, "glossary-core.js"), "utf8");
// Read the repo's canonical term list (single source of truth) — never a fork.
const termsRaw = fs.readFileSync(path.join(dir, "..", "terms.json"), "utf8");
const terms = JSON.parse(termsRaw); // validate + minify (drops whitespace)

// Fail fast with a clear message if terms.json drifts from the expected shape,
// rather than producing a broken bookmarklet that errors later in the browser.
if (!terms || typeof terms !== "object" || typeof terms.meta !== "object" || !Array.isArray(terms.terms)) {
  throw new Error("Invalid terms.json: expected { meta: {...}, terms: [...] }");
}
terms.terms.forEach(function (entry, i) {
  if (!entry || typeof entry.term !== "string" || typeof entry.definition !== "string") {
    throw new Error("Invalid terms.json entry at index " + i + ": needs string 'term' and 'definition'");
  }
});

// Light minify: strip block comments and collapse leading indentation. Kept
// deliberately conservative so we never break the code — this is a prototype.
const coreMin = core
  .replace(/\/\*[\s\S]*?\*\//g, "")     // block comments
  .replace(/^\s*\/\/.*$/gm, "")          // whole-line // comments
  .replace(/^[ \t]+/gm, "")              // leading indentation
  .replace(/\n{2,}/g, "\n")              // blank lines
  .trim();

const payload =
  "window.__GLOSSARY_TERMS=" + JSON.stringify(terms) + ";" + coreMin;

// Wrap so clicking the bookmarklet never navigates the page (void 0).
const bookmarklet = "javascript:" + encodeURIComponent("(function(){" + payload + "})();void 0;");

fs.writeFileSync(path.join(dir, "bookmarklet.txt"), bookmarklet);

const sizeKB = (Buffer.byteLength(bookmarklet, "utf8") / 1024).toFixed(1);
const termCount = terms.terms.length;

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>AI Safety Glossary — install (prototype)</title>
<style>
  body{font:16px/1.6 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:#1f2430;
    max-width:720px;margin:0 auto;padding:40px 24px 80px}
  h1{font-size:26px;margin:0 0 4px}
  .sub{color:#667;margin:0 0 28px}
  .install{display:inline-block;background:#1f2430;color:#fff;text-decoration:none;
    padding:12px 20px;border-radius:10px;font-weight:600;box-shadow:0 4px 14px rgba(0,0,0,.18)}
  .panel{background:#f5f6f8;border:1px solid #e4e6ea;border-radius:12px;padding:20px 24px;margin:24px 0}
  ol{padding-left:20px} li{margin:6px 0}
  .article{border-top:2px solid #e4e6ea;margin-top:40px;padding-top:24px}
  .note{font-size:14px;color:#778}
  code{background:#eceef1;padding:1px 5px;border-radius:4px;font-size:14px}
</style>
</head>
<body>
  <h1>AI Safety Glossary</h1>
  <p class="sub">Prototype bookmarklet · ${termCount} terms baked in · ${sizeKB} KB</p>

  <div class="panel">
    <p><strong>Install (once):</strong> drag this button up to your bookmarks bar.</p>
    <p style="margin:16px 0"><a class="install" href="${bookmarklet.replace(/"/g, "&quot;")}">📘 AI Safety Glossary</a></p>
    <p class="note">If your bookmarks bar is hidden: ⌘⇧B (Chrome) shows it. You can also
      right-click the bar → “Add page”, name it, and paste the contents of <code>bookmarklet.txt</code> as the URL.</p>
  </div>

  <div class="panel">
    <p><strong>Use it</strong> on any article:</p>
    <ol>
      <li>Open the article (e.g. one of the BlueDot course readings).</li>
      <li>Click the <strong>AI Safety Glossary</strong> bookmark.</li>
      <li>Known terms get a dotted underline — hover (or tap) to read the definition and its source.</li>
    </ol>
    <p class="note">It only runs when you click it, only on that page. Nothing is installed in the
      background, no permissions, no tracking.</p>
  </div>

  <div class="article">
    <h2>Try it right here</h2>
    <p class="note">Click the bookmark now to annotate the paragraph below.</p>
    <p>Modern <strong>AI safety</strong> work treats <strong>AI alignment</strong> as the central problem:
      getting a <strong>frontier model</strong> to pursue intended goals rather than a proxy it learned during
      training. Labs lean on <strong>RLHF</strong> to shape behaviour, run <strong>red-teaming</strong> and
      <strong>evals</strong> to surface failures like a <strong>jailbreak</strong>, and worry about
      <strong>mesa-optimisation</strong>, <strong>deceptive alignment</strong>, and the security of their
      <strong>model weights</strong>. Governance discussions reference an <strong>RSP</strong>,
      <strong>scalable oversight</strong>, and the <strong>existential risk</strong> from advanced AI.</p>
  </div>
</body>
</html>
`;

fs.writeFileSync(path.join(dir, "install.html"), html);

// Emit the widget's term + tooltip CSS as a standalone stylesheet so the
// onboarding page can <link> the exact styles the widget injects — single
// source of truth is glossary-core.js's BASE_CSS, extracted here.
//
// BASE_CSS is a plain concatenation of string literals; we recover its value by
// parsing those literals (not by executing the source) to keep the build free
// of eval/dynamic code execution.
const cssExpr = core.match(/var BASE_CSS\s*=([\s\S]*?)\n\s*function /);
if (!cssExpr) throw new Error("could not locate BASE_CSS in glossary-core.js");
const cssSrc = cssExpr[1].replace(/^[ \t]*\/\/.*$/gm, ""); // drop // line comments
const cssChunks = cssSrc.match(/"(?:\\.|[^"\\])*"/g) || [];
const cssRemainder = cssSrc.replace(/"(?:\\.|[^"\\])*"/g, "");
if (!cssChunks.length || /[^+\s;]/.test(cssRemainder)) {
  throw new Error("BASE_CSS must be a plain string-literal concatenation to emit widget-styles.css");
}
const widgetCss = cssChunks.map(function (lit) { return JSON.parse(lit); }).join("");
fs.writeFileSync(path.join(dir, "widget-styles.css"),
  "/* Generated by build.js from glossary-core.js BASE_CSS — do not edit. */\n" + widgetCss + "\n");

console.log(`Built bookmarklet (${sizeKB} KB, ${termCount} terms).`);
console.log("  - install.html      (open this in a browser)");
console.log("  - bookmarklet.txt   (raw javascript: URL)");
console.log("  - widget-styles.css (canonical term + tooltip CSS)");
