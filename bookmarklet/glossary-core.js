/*
 * AI Safety Jargon Glossary - bookmarklet core.
 *
 * Same widget logic as ../glossary.js, with two changes that make it work as a
 * bookmarklet (injected into any page on click) instead of an embedded <script>:
 *   1. No fetch. Terms are read from window.__GLOSSARY_TERMS (the build step
 *      inlines terms.json there), so it works on pages we don't control.
 *   2. No document.currentScript / data-* options. Config is hardcoded below.
 *
 * Reader-side default: OCCURRENCES = "all" (annotate every mention), because a
 * reader scrolling a long article wants the term underlined wherever they are,
 * not only the first time it appeared.
 */
(function () {
  "use strict";

  if (window.__aisGlossaryLoaded) return;
  window.__aisGlossaryLoaded = true;

  var TERMS = (window.__GLOSSARY_TERMS && window.__GLOSSARY_TERMS.terms) || [];
  var ROOT_SELECTOR = "body";
  var OCCURRENCES = "all"; // reader-side: annotate every mention
  var WATCH = true;

  var index = null, rootEl = null, seen = Object.create(null), observer = null, rescanTimer = null;

  var SKIP = { A: 1, BUTTON: 1, CODE: 1, PRE: 1, SCRIPT: 1, STYLE: 1, TEXTAREA: 1, NOSCRIPT: 1, KBD: 1 };

  var BASE_CSS =
    // Design A: teal highlight tint + trailing accent (i) glyph.
    ".glossary-term{background:rgba(47,158,143,.16);border-radius:.2em;padding:0 .12em;" +
    "box-decoration-break:clone;-webkit-box-decoration-break:clone;cursor:help}" +
    ".glossary-term::after{content:\"\\24D8\";margin-left:.12em;font-size:.85em;" +
    "color:#2f9e8f;vertical-align:baseline}" +
    ".glossary-term:focus{outline:2px solid #2f9e8f;outline-offset:2px}" +
    ".glossary-tip{position:fixed;z-index:2147483647;max-width:280px;max-height:calc(100vh - 16px);overflow:auto;padding:8px 10px;" +
    "font:14px/1.45 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:#fff;" +
    "background:#1f2430;border-radius:6px;box-shadow:0 4px 16px rgba(0,0,0,.25)}" +
    ".glossary-tip[hidden]{display:none}" +
    ".glossary-tip a{color:#9ec1ff}" +
    ".glossary-tip .glossary-src{display:block;margin-top:6px;font-size:12px;opacity:.85}";

  function injectStyles() {
    var style = document.createElement("style");
    style.textContent = BASE_CSS;
    document.head.appendChild(style);
  }

  function escapeRegExp(s) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  function safeExternalUrl(raw) {
    if (!raw) return "";
    try {
      var u = new URL(String(raw), window.location.href);
      return (u.protocol === "http:" || u.protocol === "https:") ? u.href : "";
    } catch (e) {
      return "";
    }
  }

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
    phrases.sort(function (a, b) { return b.length - a.length; });
    var pattern = phrases.map(escapeRegExp).join("|");
    return { map: map, regex: new RegExp("(^|[^\\w-])(" + pattern + ")(?![\\w-])", "gi") };
  }

  function collectTextNodes(root) {
    var nodes = [];
    var walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode: function (node) {
        if (!node.nodeValue.trim()) return NodeFilter.FILTER_REJECT;
        for (var p = node.parentNode; p && p !== root.parentNode; p = p.parentNode) {
          if (SKIP[p.nodeName]) return NodeFilter.FILTER_REJECT;
          if (p.classList && (p.classList.contains("glossary-term") || p.classList.contains("glossary-tip"))) return NodeFilter.FILTER_REJECT;
        }
        return NodeFilter.FILTER_ACCEPT;
      }
    });
    var n;
    while ((n = walker.nextNode())) nodes.push(n);
    return nodes;
  }

  function makeTermSpan(text, info) {
    var span = document.createElement("span");
    span.className = "glossary-term";
    span.textContent = text;
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

  function annotate(root) {
    if (!index) return;
    collectTextNodes(root).forEach(function (node) {
      var text = node.nodeValue;
      index.regex.lastIndex = 0;
      var frag = document.createDocumentFragment();
      var last = 0, m;
      while ((m = index.regex.exec(text))) {
        var phrase = m[2];
        var key = phrase.toLowerCase();
        var start = m.index + m[1].length;
        if (OCCURRENCES === "first") {
          var canonical = index.map[key].term.toLowerCase();
          if (seen[canonical]) continue;
          seen[canonical] = true;
        }
        frag.appendChild(document.createTextNode(text.slice(last, start)));
        frag.appendChild(makeTermSpan(phrase, index.map[key]));
        last = start + phrase.length;
      }
      if (last === 0) return;
      frag.appendChild(document.createTextNode(text.slice(last)));
      node.parentNode.replaceChild(frag, node);
    });
  }

  function observeMutations(root) {
    if (typeof MutationObserver !== "function") return;
    var rescan = function () {
      rescanTimer = null;
      observer.disconnect();
      try { annotate(root); }
      finally { observer.observe(root, { childList: true, subtree: true }); }
    };
    observer = new MutationObserver(function (mutations) {
      if (rescanTimer) return;
      for (var i = 0; i < mutations.length; i++) {
        var added = mutations[i].addedNodes;
        for (var j = 0; j < added.length; j++) {
          var n = added[j];
          if (n.nodeType === 1 && n.classList &&
              (n.classList.contains("glossary-term") || n.classList.contains("glossary-tip"))) continue;
          if (n.nodeType === 1 || n.nodeType === 3) {
            rescanTimer = window.setTimeout(rescan, 200);
            return;
          }
        }
      }
    });
    observer.observe(root, { childList: true, subtree: true });
  }

  var tip, hideTimer = null;

  function cancelHide() { if (hideTimer) { clearTimeout(hideTimer); hideTimer = null; } }
  function scheduleHide() { cancelHide(); hideTimer = window.setTimeout(hideTip, 250); }
  function hideTip() { cancelHide(); if (tip) tip.hidden = true; }

  function ensureTip() {
    if (tip) return;
    tip = document.createElement("span");
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

  function showTip(el) {
    ensureTip();
    cancelHide();
    // Keep the tooltip anchored to <body> (where ensureTip put it). The widget
    // runs on pages we don't control, where the hovered term can sit inside an
    // ancestor with transform/filter/contain (e.g. arXiv's MathJax wrappers) —
    // that ancestor becomes the containing block for position:fixed, and any
    // overflow:clip on it hides the tip. Re-homing the tip next to the term
    // would re-expose it to that; staying on <body> keeps it viewport-fixed.
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
        src.appendChild(document.createTextNode(el.dataset.sourceName || ""));
      }
      tip.appendChild(src);
    }
    tip.hidden = false;
    var r = el.getBoundingClientRect();
    var gap = 6, margin = 8;
    var tipW = tip.offsetWidth, tipH = tip.offsetHeight;
    var vw = document.documentElement.clientWidth, vh = window.innerHeight;
    var flipUp = (r.bottom + gap + tipH > vh) && (r.top - gap - tipH >= 0);
    var top = flipUp ? (r.top - gap - tipH) : (r.bottom + gap);
    top = Math.max(margin, Math.min(top, vh - tipH - margin));
    var left = Math.max(margin, Math.min(r.left, vw - tipW - margin));
    tip.style.top = top + "px";
    tip.style.left = left + "px";
  }

  function wire(root) {
    var hit = function (e) { return e.target.closest && e.target.closest(".glossary-term"); };
    var inWidget = function (t) { return t && t.closest && (t.closest(".glossary-term") || t.closest(".glossary-tip")); };
    root.addEventListener("mouseover", function (e) { var el = hit(e); if (el) showTip(el); });
    root.addEventListener("mouseout", function (e) { if (hit(e)) scheduleHide(); });
    root.addEventListener("focusin", function (e) { var el = hit(e); if (el) showTip(el); });
    root.addEventListener("focusout", function (e) {
      if (e.relatedTarget && tip && tip.contains(e.relatedTarget)) return;
      scheduleHide();
    });
    root.addEventListener("click", function (e) { var el = hit(e); if (el) showTip(el); });
    document.addEventListener("click", function (e) {
      if (tip && !tip.hidden && !inWidget(e.target)) hideTip();
    });
    document.addEventListener("keydown", function (e) { if (e.key === "Escape") hideTip(); });
    window.addEventListener("scroll", hideTip, { passive: true });
  }

  function flash(msg) {
    var n = document.createElement("div");
    n.textContent = msg;
    n.style.cssText = "position:fixed;z-index:2147483647;left:50%;bottom:24px;transform:translateX(-50%);" +
      "background:#1f2430;color:#fff;padding:10px 16px;border-radius:8px;font:14px system-ui,sans-serif;" +
      "box-shadow:0 4px 16px rgba(0,0,0,.3);opacity:0;transition:opacity .2s";
    document.body.appendChild(n);
    requestAnimationFrame(function () { n.style.opacity = "1"; });
    setTimeout(function () { n.style.opacity = "0"; setTimeout(function () { n.remove(); }, 300); }, 2600);
  }

  function init() {
    rootEl = document.querySelector(ROOT_SELECTOR) || document.body;
    index = buildIndex(TERMS);
    if (!index) { flash("AI Safety Glossary: no terms loaded."); return; }
    injectStyles();
    var before = document.querySelectorAll(".glossary-term").length;
    annotate(rootEl);
    wire(rootEl);
    if (WATCH) observeMutations(rootEl);
    var found = document.querySelectorAll(".glossary-term").length - before;
    flash(found
      ? "AI Safety Glossary on \u2014 " + found + " term" + (found === 1 ? "" : "s") + " highlighted. Hover to read."
      : "AI Safety Glossary on \u2014 no known terms found on this page.");
    // Signal that annotation is done so host pages (e.g. the onboarding demo) can react.
    document.dispatchEvent(new CustomEvent("ais-glossary-ready", { detail: { count: found } }));
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
