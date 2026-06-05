/*
 * AI Safety Jargon Glossary - embeddable hover-tooltip widget.
 * Vanilla JS, no dependencies, no build step. See README.md.
 *
 * Embed (one tag):
 *   <script src="glossary.js" data-terms="terms.json" defer></script>
 * Options (data-* on the script tag):
 *   data-terms  URL of the term list JSON (default: "terms.json")
 *   data-root   CSS selector to scope to a container (default: "body")
 *
 * Styling: base styles are injected automatically. Override via the
 * .glossary-term and .glossary-tip classes in your own CSS.
 */
(function () {
  "use strict";

  if (window.__aisGlossaryLoaded) return;
  window.__aisGlossaryLoaded = true;

  var script = document.currentScript;
  var TERMS_URL = (script && script.getAttribute("data-terms")) || "terms.json";
  var ROOT_SELECTOR = (script && script.getAttribute("data-root")) || "body";

  // Element types whose text we never annotate.
  var SKIP = { A: 1, BUTTON: 1, CODE: 1, PRE: 1, SCRIPT: 1, STYLE: 1, TEXTAREA: 1, NOSCRIPT: 1, KBD: 1 };

  var BASE_CSS =
    ".glossary-term{border-bottom:1px dotted currentColor;cursor:help}" +
    ".glossary-term:focus{outline:2px solid #4a7dff;outline-offset:2px}" +
    ".glossary-tip{position:fixed;z-index:2147483647;max-width:280px;max-height:calc(100vh - 16px);overflow:auto;padding:8px 10px;" +
    "font:14px/1.45 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:#fff;" +
    "background:#1f2430;border-radius:6px;box-shadow:0 4px 16px rgba(0,0,0,.25)}" +
    ".glossary-tip[hidden]{display:none}" +
    ".glossary-tip a{color:#9ec1ff}" +
    ".glossary-tip .glossary-src{display:block;margin-top:6px;font-size:12px;opacity:.85}";

  /** Inject the widget's base styles into <head> (once per page load). */
  function injectStyles() {
    var style = document.createElement("style");
    style.textContent = BASE_CSS;
    document.head.appendChild(style);
  }

  /**
   * Escape a string so it can be used as a literal inside a RegExp.
   * @param {string} s - Raw term or alias text.
   * @returns {string} The regex-safe version of `s`.
   */
  function escapeRegExp(s) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  /**
   * Return `raw` only if it is a safe http(s) URL, otherwise "". Blocks unsafe
   * schemes (e.g. javascript:) that could come from an untrusted term list.
   * @param {string} raw - Candidate URL from the term data.
   * @returns {string} A safe absolute URL, or "" if not allowed.
   */
  function safeExternalUrl(raw) {
    if (!raw) return "";
    try {
      var u = new URL(String(raw), window.location.href);
      return (u.protocol === "http:" || u.protocol === "https:") ? u.href : "";
    } catch (e) {
      return "";
    }
  }

  /**
   * Build the lookup used for matching: a map from each lowercased term/alias
   * to its {term, definition, source}, plus a single boundary-aware regex
   * matching any of them (longest first, hyphens allowed inside terms).
   * @param {Array<{term:string, aliases?:string[], definition:string, source?:object}>} terms
   * @returns {{map: Object, regex: RegExp}|null} Index, or null if no terms.
   */
  function buildIndex(terms) {
    var map = {};
    var phrases = [];
    terms.forEach(function (entry) {
      if (!entry || !entry.term || !entry.definition) return;
      [entry.term].concat(entry.aliases || []).forEach(function (name) {
        var key = String(name).toLowerCase();
        if (!map[key]) {
          map[key] = { term: entry.term, definition: entry.definition, source: entry.source || null };
          phrases.push(name);
        }
      });
    });
    if (!phrases.length) return null;
    phrases.sort(function (a, b) { return b.length - a.length; }); // longest first
    var pattern = phrases.map(escapeRegExp).join("|");
    // boundary that allows hyphens inside terms (e.g. "mesa-optimizer")
    return { map: map, regex: new RegExp("(^|[^\\w-])(" + pattern + ")(?![\\w-])", "gi") };
  }

  /**
   * Collect the visible text nodes under `root`, skipping blank nodes, excluded
   * element types (links, code, etc.), and the widget's own output.
   * @param {Node} root - Container to walk.
   * @returns {Text[]} Eligible text nodes.
   */
  function collectTextNodes(root) {
    var nodes = [];
    var walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode: function (node) {
        if (!node.nodeValue.trim()) return NodeFilter.FILTER_REJECT;
        for (var p = node.parentNode; p && p !== root.parentNode; p = p.parentNode) {
          if (SKIP[p.nodeName]) return NodeFilter.FILTER_REJECT;
          if (p.classList && p.classList.contains("glossary-term")) return NodeFilter.FILTER_REJECT;
        }
        return NodeFilter.FILTER_ACCEPT;
      }
    });
    var n;
    while ((n = walker.nextNode())) nodes.push(n);
    return nodes;
  }

  /**
   * Create an accessible, focusable span for a matched term. The definition and
   * source are stored as data-* / aria-label (never innerHTML) so term data is inert.
   * @param {string} text - The matched text, preserving original casing.
   * @param {{term:string, definition:string, source:?object}} info - Canonical entry.
   * @returns {HTMLSpanElement}
   */
  function makeTermSpan(text, info) {
    var span = document.createElement("span");
    span.className = "glossary-term";
    span.textContent = text;                       // textContent, never innerHTML
    span.tabIndex = 0;
    var label = info.term + ": " + info.definition;
    if (info.source) {
      span.dataset.sourceName = info.source.name || info.source.url || "";
      span.dataset.sourceUrl = info.source.url || "";
      if (span.dataset.sourceName) label += " (Source: " + span.dataset.sourceName + ")";
    }
    span.setAttribute("aria-label", label);
    span.dataset.definition = info.definition;
    return span;
  }

  /**
   * Walk `root` and wrap the first occurrence of each known term in a tooltip
   * span. Mutates the DOM in place.
   * @param {Node} root - Container to annotate.
   * @param {{map: Object, regex: RegExp}} index - Output of buildIndex().
   * @param {Object} seen - Map of already-annotated keys (page-level dedupe).
   */
  function annotate(root, index, seen) {
    collectTextNodes(root).forEach(function (node) {
      var text = node.nodeValue;
      index.regex.lastIndex = 0;
      var frag = document.createDocumentFragment();
      var last = 0, m;
      while ((m = index.regex.exec(text))) {
        var phrase = m[2];
        var key = phrase.toLowerCase();
        var start = m.index + m[1].length;
        if (seen[key]) continue;                   // first occurrence per term only
        seen[key] = true;
        frag.appendChild(document.createTextNode(text.slice(last, start)));
        frag.appendChild(makeTermSpan(phrase, index.map[key]));
        last = start + phrase.length;
      }
      if (last === 0) return;                       // nothing replaced in this node
      frag.appendChild(document.createTextNode(text.slice(last)));
      node.parentNode.replaceChild(frag, node);
    });
  }

  var tip, hideTimer = null;

  /** Cancel any pending tooltip-hide timer. */
  function cancelHide() { if (hideTimer) { clearTimeout(hideTimer); hideTimer = null; } }

  /** Hide the tooltip shortly, unless cancelled (lets the pointer cross into it). */
  function scheduleHide() { cancelHide(); hideTimer = window.setTimeout(hideTip, 250); }

  /** Hide the shared tooltip immediately. */
  function hideTip() { cancelHide(); if (tip) tip.hidden = true; }

  /** Create the shared tooltip element on first use (kept open while hovered). */
  function ensureTip() {
    if (tip) return;
    tip = document.createElement("div");
    tip.className = "glossary-tip";
    tip.setAttribute("role", "tooltip");
    tip.hidden = true;
    tip.addEventListener("mouseenter", cancelHide);
    tip.addEventListener("mouseleave", scheduleHide);
    tip.addEventListener("focusin", cancelHide);
    tip.addEventListener("focusout", function (e) {
      if (e.relatedTarget && tip.contains(e.relatedTarget)) return;
      scheduleHide();
    });
    document.body.appendChild(tip);
  }

  /**
   * Show the shared tooltip for a term span: its definition plus, if present, a
   * "Source:" link. Uses position:fixed; placed below the term (or flipped
   * above near the viewport bottom) and clamped to the viewport on all sides.
   * @param {HTMLElement} el - The hovered/focused .glossary-term span.
   */
  function showTip(el) {
    ensureTip();
    cancelHide();
    while (tip.firstChild) tip.removeChild(tip.firstChild);
    tip.appendChild(document.createTextNode(el.dataset.definition));
    if (el.dataset.sourceUrl || el.dataset.sourceName) {
      var src = document.createElement("span");
      src.className = "glossary-src";
      src.appendChild(document.createTextNode("Source: "));
      var safeUrl = safeExternalUrl(el.dataset.sourceUrl);
      if (safeUrl) {
        var a = document.createElement("a");
        a.href = safeUrl;
        a.textContent = el.dataset.sourceName || safeUrl;
        a.target = "_blank";
        a.rel = "noopener noreferrer";
        src.appendChild(a);
      } else {
        // Unsafe/invalid URL: show the source name as plain text, no link.
        src.appendChild(document.createTextNode(el.dataset.sourceName || ""));
      }
      tip.appendChild(src);
    }
    tip.hidden = false;
    // position:fixed, so coordinates are viewport-relative (no scroll offsets).
    var r = el.getBoundingClientRect();
    var gap = 6, margin = 8;
    var tipW = tip.offsetWidth, tipH = tip.offsetHeight;
    var vw = document.documentElement.clientWidth, vh = window.innerHeight;
    // Flip above when there isn't room below but there is above...
    var flipUp = (r.bottom + gap + tipH > vh) && (r.top - gap - tipH >= 0);
    var top = flipUp ? (r.top - gap - tipH) : (r.bottom + gap);
    // ...then clamp to the viewport so it's never cut off at any edge.
    top = Math.max(margin, Math.min(top, vh - tipH - margin));
    var left = Math.max(margin, Math.min(r.left, vw - tipW - margin));
    tip.style.top = top + "px";
    tip.style.left = left + "px";
  }

  /**
   * Attach the interaction handlers (hover, keyboard focus, tap-to-toggle,
   * Escape, and scroll-to-hide) via event delegation on `root`.
   * @param {Node} root - Container whose term spans should be interactive.
   */
  function wire(root) {
    var hit = function (e) { return e.target.closest && e.target.closest(".glossary-term"); };
    root.addEventListener("mouseover", function (e) { var el = hit(e); if (el) showTip(el); });
    root.addEventListener("mouseout", function (e) { if (hit(e)) scheduleHide(); });
    root.addEventListener("focusin", function (e) { var el = hit(e); if (el) showTip(el); });
    root.addEventListener("focusout", function (e) {
      if (e.relatedTarget && tip && tip.contains(e.relatedTarget)) return;
      scheduleHide();
    });
    root.addEventListener("click", function (e) {        // tap-to-toggle on mobile
      var el = hit(e);
      if (el) { (tip && !tip.hidden) ? hideTip() : showTip(el); }
    });
    document.addEventListener("keydown", function (e) { if (e.key === "Escape") hideTip(); });
    window.addEventListener("scroll", hideTip, { passive: true });
  }

  /** Fetch the term list, annotate the page, and wire up interactions. */
  function init() {
    var root = document.querySelector(ROOT_SELECTOR) || document.body;
    fetch(TERMS_URL)
      .then(function (r) {
        if (!r.ok) throw new Error("glossary: could not load " + TERMS_URL + " (" + r.status + ")");
        return r.json();
      })
      .then(function (data) {
        var index = buildIndex((data && data.terms) || []);
        if (!index) return;
        injectStyles();
        annotate(root, index, {});
        wire(root);
      })
      .catch(function (err) { if (window.console) console.warn(err); });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
