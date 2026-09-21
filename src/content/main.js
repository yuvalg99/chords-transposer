/*
 * Content script entry point: find the chords on whatever page this is,
 * transpose them, keep the page looking the way it did, and remember the
 * choice per song.
 */
(function () {
  'use strict';

  if (window.__chordsTransposerLoaded) return;
  window.__chordsTransposerLoaded = true;

  var Chords = globalThis.CTChords;
  var Detect = globalThis.CTDetect;
  var Quirks = globalThis.CTQuirks;

  var MAX_STEPS = 11;
  var songKey = 'song:' + location.host + location.pathname + location.search;

  var state = {
    steps: 0, accidental: 'auto', collapsed: false,
    position: null, diagrams: true, openSection: null,
    speed: 28, scrolling: false, simplify: false, sound: true
  };
  var MAX_CAPO = 7;   // past this the frets are too close together to be worth it
  var chordElements = [];   // on screen: what the key and "easiest" are read from
  var taggedElements = [];  // everything we have ever transposed, visible or not
  var textNodes = [];       // [{ node, original }] inside preformatted chord sheets
  var trackedText = new Set();   // the same nodes, for hit-testing under the pointer
  var appliedText = new WeakMap();   // node -> the text we last wrote into it
  var detection = { elements: [], blocks: [], distinct: 0, chordLines: 0, confident: false };
  var detectedKey = null;
  var easiest = null;        // the transposition that is kindest to the fretting hand
  var panel = null;
  var observer = null;
  var applying = false;

  var WATCHED_CHANGES = {
    childList: true,
    subtree: true,
    characterData: true,
    // Sites swap between versions of a song — another key, another instrument —
    // by hiding one and showing another, which is an attribute change and
    // nothing else.
    attributes: true,
    attributeFilter: ['class', 'style', 'hidden']
  };
  var disabled = false;
  var tooltip = null;
  var hoverElement = null;
  var hoverToken = null;
  var lastPointerCheck = 0;
  var lastPointer = null;
  var watchStarted = 0;

  // ---- discovery ---------------------------------------------------------

  function scanElements() {
    var found = Detect.chordElements();
    found.forEach(function (el) {
      if (el.hasAttribute('data-ct-orig')) return;
      el.setAttribute('data-ct-orig', (el.textContent || '').trim());
      if (shouldAlign(el)) el.setAttribute('data-ct-align', '1');
    });
    chordElements = found;
    // A page can hide the sheet we transposed and show another version of the
    // song. The hidden one still carries our text, so it stays in this list:
    // it has to be transposed with everything else, and put back on reset.
    taggedElements = Array.prototype.slice.call(document.querySelectorAll('[data-ct-orig]'));
    measureWidths();   // while the page is still showing the original chords
  }

  // A chord only needs its width preserved if it shares a line with something
  // that would otherwise be dragged sideways. Chords laid out as their own
  // block or flex item (one box per lyric phrase) move nothing.
  function shouldAlign(el) {
    if (getComputedStyle(el).display.indexOf('inline') !== 0) return false;
    for (var node = el.nextSibling; node; node = node.nextSibling) {
      if (node.nodeType === Node.ELEMENT_NODE) return true;
      if (node.nodeType === Node.TEXT_NODE && /\S| /.test(node.nodeValue)) return true;
    }
    return false;
  }

  function scanTextBlocks() {
    var blocks = detection.blocks;
    if (!blocks.length) { textNodes = []; return; }
    var known = new Map();
    textNodes.forEach(function (entry) { known.set(entry.node, entry.original); });

    var collected = [];
    blocks.forEach(function (block) {
      var walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT, null);
      var node;
      while ((node = walker.nextNode())) {
        var original = known.has(node) ? known.get(node) : node.nodeValue;
        if (!original.split('\n').some(Chords.looksLikeChordLine)) continue;
        collected.push({ node: node, original: original });
      }
    });
    textNodes = collected;
    trackedText = new Set(collected.map(function (entry) { return entry.node; }));
  }

  /** The chords as the reader will see them, before transposing. */
  function sourceChordTexts() {
    var texts = originalChordTexts();
    return state.simplify ? texts.map(Chords.simplifyChord) : texts;
  }

  function originalChordTexts() {
    var list = chordElements.map(function (el) { return el.getAttribute('data-ct-orig'); });
    textNodes.forEach(function (entry) {
      entry.original.split('\n').forEach(function (line) {
        if (!Chords.looksLikeChordLine(line)) return;
        line.trim().split(/\s+/).forEach(function (token) {
          if (Chords.isChord(token)) list.push(token);
        });
      });
    });
    return list;
  }

  // ---- keeping chord columns aligned -------------------------------------
  //
  // Where chords sit on their own line above the lyrics, spaced out to line up
  // with the words, a transposed chord is often a character narrower or wider
  // than the original ("D#m" -> "Fm"), which would slide every chord after it
  // sideways. Each chord's original width is measured once and the difference
  // is absorbed by a margin, so everything after it stays put. A chord that
  // grows still pushes the rest of the line right — there is nowhere else for
  // the extra character to go.

  function measureWidths() {
    chordElements.forEach(function (el) {
      if (!el.hasAttribute('data-ct-align') || el.hasAttribute('data-ct-width')) return;
      var width = el.getBoundingClientRect().width;
      if (width > 0) el.setAttribute('data-ct-width', width.toFixed(2));
    });
  }

  function absorbWidthChanges(restore) {
    var aligned = chordElements.filter(function (el) { return el.hasAttribute('data-ct-width'); });
    if (!aligned.length) return;
    aligned.forEach(function (el) { el.style.marginInlineEnd = ''; });
    if (restore) return;
    // Measure everything before writing anything back, so the page lays out once.
    var widths = aligned.map(function (el) { return el.getBoundingClientRect().width; });
    aligned.forEach(function (el, index) {
      var slack = parseFloat(el.getAttribute('data-ct-width')) - widths[index];
      if (slack > 0.5) el.style.marginInlineEnd = slack.toFixed(2) + 'px';
    });
  }

  // ---- applying ----------------------------------------------------------

  function preferFlat() {
    return Chords.spellingForTarget(originalChordTexts(), detectedKey, state.steps, state.accidental);
  }

  function apply() {
    applying = true;
    if (observer) observer.disconnect();

    var flat = preferFlat();
    var steps = state.steps;

    taggedElements.forEach(function (el) {
      var original = el.getAttribute('data-ct-orig');
      var source = state.simplify ? Chords.simplifyChord(original) : original;
      var next = steps === 0 ? source : Chords.transposeChord(source, steps, flat);
      if (el.textContent !== next) el.textContent = next;
      markSimplified(el, source !== original);
      appliedText.set(el, next);
    });

    absorbWidthChanges(steps === 0);

    textNodes.forEach(function (entry) {
      var next = (steps === 0 && !state.simplify) ? entry.original
        : entry.original.split('\n').map(function (line) {
            return Chords.looksLikeChordLine(line)
              ? Chords.transposeChordLine(line, steps, flat, 0, state.simplify)
              : line;
          }).join('\n');
      if (entry.node.nodeValue !== next) entry.node.nodeValue = next;
      appliedText.set(entry.node, next);
    });

    // At rest we only take hover from chords we can actually draw; transposed,
    // we take it from all of them, because the page's own diagram is wrong.
    Quirks.suppressHover(taggedElements, steps !== 0 || state.diagrams, steps === 0);
    Quirks.markDiagrams(steps !== 0);

    if (observer) {
      observer.takeRecords();
      observer.observe(document.body, WATCHED_CHANGES);
    }
    applying = false;
    refreshDiagram();
    updatePanel();
  }

  /**
   * A simplified chord is not what the page printed, so it says so: a dotted
   * underline, with the original on hover.
   */
  function markSimplified(el, simplified) {
    if (simplified) {
      if (!el.hasAttribute('data-ct-simple')) {
        el.setAttribute('data-ct-simple', el.getAttribute('title') || '');
      }
      el.title = 'simplified from ' + el.getAttribute('data-ct-orig');
      el.style.textDecorationLine = 'underline';
      el.style.textDecorationStyle = 'dotted';
    } else if (el.hasAttribute('data-ct-simple')) {
      var previous = el.getAttribute('data-ct-simple');
      if (previous) el.title = previous; else el.removeAttribute('title');
      el.removeAttribute('data-ct-simple');
      el.style.textDecorationLine = '';
      el.style.textDecorationStyle = '';
    }
  }

  // ---- chord diagrams on hover -------------------------------------------

  // Hover is taken over in the capture phase: a page whose diagram is wired up
  // with addEventListener never sees the event, so it cannot raise its own
  // (now wrong) diagram behind ours.
  var HOVER_TYPES = ['mouseover', 'mouseenter', 'pointerover', 'pointerenter'];

  function playChord(symbol) {
    var shape = globalThis.CTShapes.diagramFor(symbol);
    return shape ? globalThis.CTAudio.play(shape) : false;
  }

  function onClick(event) {
    if (!panel) return;
    var target = event.target;
    var el = target && target.closest ? target.closest('[data-ct-orig]') : null;

    if (el) {
      // A chord that is also a link belongs to the page; let it be followed.
      if (el.closest('a, button')) return;
      var symbol = (el.textContent || '').trim();
      if (state.sound) playChord(symbol);
      // The same bargain as hover: take the click away from the page only when
      // we put our own diagram in its place, or when the pop-up it would raise
      // is for a chord that is no longer the one printed there. Sites wire this
      // up by delegation, so stopping it in the capture phase is what keeps
      // their fingering modal from opening behind ours.
      if ((state.diagrams && globalThis.CTShapes.diagramFor(symbol)) || state.steps !== 0) {
        event.stopPropagation();
      }
      pinDiagram(el, symbol);
      return;
    }

    if (trackedText.size && inTextSheet(target)) {
      var hit = chordUnderPointer(event.clientX, event.clientY);
      if (hit) {
        if (state.sound) playChord(hit.symbol);
        pinDiagram(hit.rect, hit.symbol);
        return;
      }
    }
    // A click anywhere else puts a pinned diagram away.
    if (pinned) { pinned = false; hideDiagram(); }
  }

  /**
   * Show a diagram and keep it there. Hovering is a race — a scroll, a stray
   * mouse-out, a page that moves under the pointer — so clicking gives a way
   * to see a chord that nothing can interrupt.
   */
  function pinDiagram(anchor, symbol) {
    if (!state.diagrams) return;
    try {
      if (!buildTooltip()) return;
      pinned = false;                       // so hide() below is not blocked
      hoverElement = anchor.nodeType ? anchor : null;
      pinned = tooltip.show(anchor, symbol, { note: state.sound });
    } catch (error) {
      console.error('[Chords Transposer] chord diagram failed:', error);
    }
  }

  function wireHover() {
    HOVER_TYPES.forEach(function (type) {
      document.addEventListener(type, onHoverIn, true);
    });
    // Sheets that are plain text have no element to hover, so the chord under
    // the pointer is worked out from the text itself.
    document.addEventListener('mousemove', onPointerMove, true);
    document.addEventListener('click', onClick, true);
    document.addEventListener('mouseout', onHoverOut, true);
    window.addEventListener('scroll', onScrolled, true);
    window.addEventListener('blur', hideDiagram);
  }

  // Whose hover is it? Ours once we are drawing diagrams, and always once the
  // page is transposed, where anything the page would show is out of date.
  function ownsHover() {
    return !!panel && (state.diagrams || state.steps !== 0);
  }

  /**
   * Hovering is held as a state, not caught as an event: whenever the pointer
   * is over a chord, that chord's diagram is showing. Every mouse movement
   * re-asserts it, so anything that interrupts — a scroll, a stray mouse-out,
   * the page redrawing under the cursor — heals on the next movement instead
   * of leaving the diagram gone for good.
   */
  function updateHover(event) {
    if (!panel || !state.diagrams) return;
    var target = event.target;
    var el = target && target.closest ? target.closest('[data-ct-orig]') : null;

    if (el) {
      var symbol = (el.textContent || '').trim();
      if (!globalThis.CTShapes.diagramFor(symbol)) return;
      if (hoverElement === el && tooltip && tooltip.isVisible()) return;   // already up
      pinned = false;            // hovering a chord takes over from a pinned one
      hoverElement = el;
      hoverToken = null;
      showDiagram(el, symbol);
      return;
    }

    if (trackedText.size && inTextSheet(target)) {
      lastPointer = { x: event.clientX, y: event.clientY };
      var hit = chordUnderPointer(event.clientX, event.clientY);
      if (hit) {
        var same = hoverToken && hoverToken.node === hit.node && hoverToken.start === hit.start;
        if (same && tooltip && tooltip.isVisible()) return;
        pinned = false;
        hoverToken = hit;
        hoverElement = null;
        showDiagram(hit.rect, hit.symbol);
        return;
      }
    }

    if (!pinned && (hoverElement || hoverToken)) hideDiagram();
  }

  function showDiagram(anchor, symbol) {
    try {
      if (!buildTooltip()) return;
      tooltip.show(anchor, symbol, { note: state.sound });
    } catch (error) {
      console.error('[Chords Transposer] chord diagram failed:', error);
    }
  }

  /** Takes the page's own pop-up out of the way, then shows ours. */
  function onHoverIn(event) {
    if (!ownsHover()) return;
    var target = event.target;
    var el = target && target.closest ? target.closest('[data-ct-orig]') : null;
    if (!el) return;
    var symbol = (el.textContent || '').trim();
    var drawable = state.diagrams && !!globalThis.CTShapes.diagramFor(symbol);
    // Only take the event away from the page when we have something to put in
    // its place, or when what it would show is wrong anyway.
    if (drawable || state.steps !== 0) event.stopPropagation();
    updateHover(event);
  }

  function caretAt(x, y) {
    if (document.caretRangeFromPoint) return document.caretRangeFromPoint(x, y);
    if (document.caretPositionFromPoint) {
      var position = document.caretPositionFromPoint(x, y);
      if (!position) return null;
      var range = document.createRange();
      range.setStart(position.offsetNode, position.offset);
      return range;
    }
    return null;
  }

  /** The chord token under the pointer inside a plain-text chord sheet. */
  function chordUnderPointer(x, y) {
    var caret = caretAt(x, y);
    if (!caret) return null;
    var node = caret.startContainer;
    if (!node || node.nodeType !== Node.TEXT_NODE || !trackedText.has(node)) return null;

    var text = node.nodeValue;
    var start = caret.startOffset, end = caret.startOffset;
    while (start > 0 && !/\s/.test(text.charAt(start - 1))) start--;
    while (end < text.length && !/\s/.test(text.charAt(end))) end++;
    if (end <= start) return null;                 // the pointer is on blank space

    var token = text.slice(start, end);
    if (!Chords.isChord(token)) return null;

    // A lyric line can hold a stray "A"; only trust tokens on a chord line.
    var lineStart = text.lastIndexOf('\n', start - 1) + 1;
    var lineEnd = text.indexOf('\n', end);
    if (lineEnd === -1) lineEnd = text.length;
    if (!Chords.looksLikeChordLine(text.slice(lineStart, lineEnd))) return null;

    var span = document.createRange();
    span.setStart(node, start);
    span.setEnd(node, end);
    var rect = span.getBoundingClientRect();
    if (!rect.width) return null;
    return { node: node, start: start, symbol: token, rect: rect };
  }

  function inTextSheet(node) {
    for (var i = 0; i < detection.blocks.length; i++) {
      if (detection.blocks[i].contains(node)) return true;
    }
    return false;
  }

  function onPointerMove(event) {
    if (!panel || !state.diagrams) return;
    var now = Date.now();
    if (now - lastPointerCheck < 50) return;   // this runs on every mouse move
    lastPointerCheck = now;
    updateHover(event);
  }

  function onHoverOut(event) {
    if (pinned || (!hoverElement && !hoverToken)) return;
    var to = event.relatedTarget;
    if (to && to.closest && to.closest('[data-ct-orig]')) return;   // on to another chord
    if (to && hoverElement && hoverElement.contains(to)) return;
    hideDiagram();
  }

  /**
   * Called after the chords change under an open diagram: redraw it for
   * whatever is now under the pointer rather than making it disappear.
   */
  function refreshDiagram() {
    if (!tooltip || !tooltip.isVisible()) return;
    if (hoverElement && hoverElement.isConnected) {
      tooltip.show(hoverElement, (hoverElement.textContent || '').trim(), { note: state.sound });
      return;
    }
    if (hoverToken && lastPointer) {
      var hit = chordUnderPointer(lastPointer.x, lastPointer.y);
      if (hit) { hoverToken = hit; tooltip.show(hit.rect, hit.symbol, { note: state.sound }); return; }
    }
    hideDiagram();
  }

  /**
   * The page moved under an open diagram. Rather than drop it — which the
   * auto-scroll would do several times a second — put it back where its chord
   * is now. If the chord has moved out from under the pointer, the hover
   * events that follow will close it.
   */
  var pinned = false;   // a diagram opened by clicking stays until dismissed
  var lastReanchor = 0;
  function onScrolled() {
    if (!tooltip || !tooltip.isVisible()) return;
    var now = Date.now();
    if (now - lastReanchor < 50) return;    // scrolling fires all the time
    lastReanchor = now;
    refreshDiagram();
  }

  function hideDiagram(force) {
    if (pinned && !force) return;
    pinned = false;
    hoverElement = null;
    hoverToken = null;
    if (tooltip) tooltip.hide();
  }

  // ---- scrolling while you play -------------------------------------------

  var scrollFrame = null;
  var scrollPos = 0;
  var scrollApplied = 0;
  var scrollLast = 0;

  /**
   * What actually moves: the sheet's own scrolling container if it has one,
   * otherwise the page.
   */
  function scrollTarget() {
    var anchor = chordElements[0] || detection.blocks[0];
    for (var el = anchor; el && el !== document.body; el = el.parentElement) {
      var overflow = getComputedStyle(el).overflowY;
      if ((overflow === 'auto' || overflow === 'scroll' || overflow === 'overlay') &&
          el.scrollHeight > el.clientHeight + 4) {
        return el;
      }
    }
    return document.scrollingElement || document.documentElement;
  }

  function startScroll() {
    if (state.scrolling) return;
    var target = scrollTarget();
    state.scrolling = true;
    scrollPos = target.scrollTop;
    scrollApplied = scrollPos;
    scrollLast = 0;
    scrollFrame = requestAnimationFrame(function step(now) {
      if (!state.scrolling) return;
      var target = scrollTarget();
      // The first frame has no previous timestamp, and a long pause (a
      // background tab) should not make the page leap.
      var elapsed = scrollLast ? Math.min(0.1, (now - scrollLast) / 1000) : 0;
      scrollLast = now;

      // If the reader nudged the page themselves, carry on from where they are.
      if (Math.abs(target.scrollTop - scrollApplied) > 2) scrollPos = target.scrollTop;

      scrollPos += state.speed * elapsed;
      var furthest = target.scrollHeight - target.clientHeight;
      if (scrollPos >= furthest) {
        target.scrollTop = furthest;
        stopScroll();
        return;
      }
      target.scrollTop = scrollPos;
      scrollApplied = target.scrollTop;
      scrollFrame = requestAnimationFrame(step);
    });
    updatePanel();
  }

  function stopScroll() {
    if (scrollFrame) cancelAnimationFrame(scrollFrame);
    scrollFrame = null;
    state.scrolling = false;
    updatePanel();
  }

  function toggleScroll() {
    if (state.scrolling) stopScroll(); else startScroll();
  }

  function setSpeed(speed) {
    state.speed = Math.max(8, Math.min(120, speed));
    updatePanel();
    save();
  }

  // ---- state -------------------------------------------------------------

  function setSteps(steps) {
    state.steps = Math.max(-MAX_STEPS, Math.min(MAX_STEPS, steps));
    apply();
    save();
  }

  /**
   * Which key asks least of the fretting hand, counting each chord as often as
   * it appears — a barre chord in every chorus costs more than a passing one.
   */
  function computeEasiest() {
    var counts = {};
    sourceChordTexts().forEach(function (text) {
      counts[text] = (counts[text] || 0) + 1;
    });
    easiest = globalThis.CTShapes.easiestShift(counts);
    if (!easiest) return;
    var name = detectedKey
      ? Chords.keyName(detectedKey.pc + easiest.steps, detectedKey.minor)
      : (easiest.steps > 0 ? '+' : '') + easiest.steps;
    var move = easiest.steps === 0 ? 'where you are'
      : easiest.steps < 0 ? 'down ' + (-easiest.steps) + ', capo ' + (-easiest.steps)
      : 'up ' + easiest.steps;
    easiest.label = name + ' (' + move + ')';
  }

  /**
   * How many *different* chords the song uses. Counting every occurrence
   * instead reports a number like 94 on a page where a chord sits above every
   * repeated line — true, but not something anyone wants to know.
   */
  function distinctChordCount() {
    var seen = Object.create(null);
    var count = 0;
    sourceChordTexts().forEach(function (text) {
      if (seen[text]) return;
      seen[text] = true;
      count++;
    });
    return count;
  }

  /**
   * A diagram for every chord the song uses, in the order they first appear
   * and spelled as they read now. Only built while the strip is open.
   */
  function chordStripItems() {
    if (state.openSection !== 'chords') return null;
    var flat = preferFlat();
    var seen = Object.create(null);
    var items = [];
    sourceChordTexts().forEach(function (original) {
      var now = state.steps === 0
        ? original
        : Chords.transposeChord(original, state.steps, flat);
      if (seen[now]) return;
      seen[now] = true;
      var shape = globalThis.CTShapes.diagramFor(now);
      items.push({
        name: now,
        svg: shape ? globalThis.CTDiagram.svg(shape, { width: 66 }) : null
      });
    });
    return items;
  }

  /**
   * One row per capo position: the shapes you would be playing there, and what
   * they cost. Every row sounds like the original, because a capo on fret N
   * with the chords moved down N is the same pitch.
   */
  /** What to call the shapes at this capo: the key, or a chord if none was found. */
  function capoLabel(capo) {
    if (detectedKey) return Chords.keyName(detectedKey.pc - capo, detectedKey.minor);
    var first = originalChordTexts()[0];
    return first ? Chords.transposeChord(first, -capo, false) : '';
  }

  function capoOptions() {
    if (state.openSection !== 'capo') return null;
    var counts = {};
    sourceChordTexts().forEach(function (text) {
      counts[text] = (counts[text] || 0) + 1;
    });
    if (!Object.keys(counts).length) return null;

    var rows = [];
    var best = Infinity;
    for (var capo = 0; capo <= MAX_CAPO; capo++) {
      var cost = globalThis.CTShapes.shiftCost(counts, -capo);
      if (!cost) return null;
      rows.push({
        capo: capo,
        steps: -capo,
        key: capoLabel(capo),
        score: cost.score,
        hard: cost.hardChords
      });
      if (cost.score < best) best = cost.score;
    }
    rows.forEach(function (row) {
      row.best = row.score === best;
      row.current = state.steps === row.steps;
    });
    return rows;
  }

  function updatePanel() {
    if (!panel) return;
    panel.update({
      steps: state.steps,
      accidental: state.accidental,
      diagrams: state.diagrams,
      keyFrom: detectedKey ? detectedKey.name : '',
      basePc: detectedKey ? detectedKey.pc : 0,
      minor: detectedKey ? detectedKey.minor : false,
      count: distinctChordCount(),
      openSection: state.openSection,
      scrolling: state.scrolling,
      simplify: state.simplify,
      sound: state.sound,
      speed: state.speed,
      chords: chordStripItems(),
      capo: capoOptions(),
      easiest: easiest,
      stale: state.steps !== 0 && !!document.querySelector('[data-ct-dimmed]')
    });
  }

  function save() {
    try {
      var payload = {
        'ct:prefs': {
          accidental: state.accidental,
          position: state.position,
          collapsed: state.collapsed,
          diagrams: state.diagrams,
          openSection: state.openSection,
          speed: state.speed,
          sound: state.sound
        }
      };
      payload[songKey] = {
        steps: state.steps, accidental: state.accidental, simplify: state.simplify
      };
      chrome.storage.local.set(payload);
    } catch (e) { /* extension context gone */ }
  }

  function load(callback) {
    try {
      chrome.storage.local.get([songKey, 'ct:prefs', 'ct:disabled'], function (data) {
        data = data || {};
        var prefs = data['ct:prefs'] || {};
        var song = data[songKey] || {};
        disabled = (data['ct:disabled'] || []).indexOf(location.host) !== -1;
        state.accidental = song.accidental || prefs.accidental || 'auto';
        state.steps = song.steps || 0;
        state.simplify = !!song.simplify;
        state.position = prefs.position || null;
        state.collapsed = !!prefs.collapsed;
        state.diagrams = prefs.diagrams !== false;
        state.openSection = prefs.openSection || null;
        if (prefs.speed) state.speed = prefs.speed;
        state.sound = prefs.sound !== false;
        callback();
      });
    } catch (e) { callback(); }
  }

  // ---- wiring ------------------------------------------------------------

  function buildTooltip() {
    if (tooltip) return tooltip;
    try {
      if (!globalThis.CTTooltip || !globalThis.CTDiagram || !globalThis.CTShapes) {
        console.error('[Chords Transposer] chord diagrams unavailable:', {
          tooltip: !!globalThis.CTTooltip,
          diagram: !!globalThis.CTDiagram,
          shapes: !!globalThis.CTShapes
        });
        return null;
      }
      tooltip = new globalThis.CTTooltip();
      tooltip.mount();
    } catch (error) {
      console.error('[Chords Transposer] could not build the chord diagram:', error);
      tooltip = null;
    }
    return tooltip;
  }

  function buildPanel() {
    panel = new globalThis.CTPanel({
      onStep: function (delta) { setSteps(state.steps + delta); },
      onSetKey: function (steps) { setSteps(steps); },
      onAccidental: function (mode) { state.accidental = mode; apply(); save(); },
      onReset: function () { setSteps(0); },
      onEasy: function () {
        if (!easiest) computeEasiest();
        if (easiest) setSteps(easiest.steps);
      },
      onToggleSection: function (section) {
        state.openSection = state.openSection === section ? null : section;
        updatePanel();
        save();
      },
      onCapo: function (steps) { setSteps(steps); },
      onSimplify: function () {
        state.simplify = !state.simplify;
        computeEasiest();
        apply();
        save();
      },
      onSound: function () {
        state.sound = !state.sound;
        updatePanel();
        save();
      },
      onPlay: playChord,
      onScroll: toggleScroll,
      onSpeed: setSpeed,
      onDiagrams: function () {
        state.diagrams = !state.diagrams;
        if (!state.diagrams) hideDiagram();
        Quirks.suppressHover(chordElements, state.steps !== 0 || state.diagrams, state.steps === 0);
        updatePanel();
        save();
      },
      onClose: function () { panel.setVisible(false); },
      onMove: function (pos) { state.position = pos; save(); },
      onCollapse: function (collapsed) { state.collapsed = collapsed; save(); }
    });
    panel.mount(state.position);
    panel.setCollapsed(state.collapsed);
  }

  function onKeydown(e) {
    if (e.key === 'Escape' && pinned) { hideDiagram(true); return; }
    if (!e.altKey || !e.shiftKey || e.ctrlKey || e.metaKey) return;
    if (!panel) return;
    var tag = (e.target && e.target.tagName) || '';
    if (tag === 'INPUT' || tag === 'TEXTAREA' || (e.target && e.target.isContentEditable)) return;
    if (e.key === 'ArrowUp') setSteps(state.steps + 1);
    else if (e.key === 'ArrowDown') setSteps(state.steps - 1);
    else if (e.key === '0' || e.code === 'Digit0') setSteps(0);
    else if (e.key === ' ' || e.code === 'Space') toggleScroll();
    else if (e.key === 'ArrowRight') setSpeed(state.speed + 4);
    else if (e.key === 'ArrowLeft') setSpeed(state.speed - 4);
    else return;
    e.preventDefault();
  }

  var OUR_IDS = { 'chords-transposer-root': 1, 'chords-transposer-tip': 1 };

  // Our own panel and tooltip live in the page, so their comings and goings
  // show up as mutations. Reacting to those would re-apply — and hide the very
  // diagram that just opened.
  function ourOwnMutation(record) {
    if (record.target && OUR_IDS[record.target.id]) return true;
    var lists = [record.addedNodes, record.removedNodes];
    for (var i = 0; i < lists.length; i++) {
      for (var j = 0; j < lists[i].length; j++) {
        if (OUR_IDS[lists[i][j].id]) return true;
      }
    }
    return false;
  }

  /**
   * Is everything we transposed still as we left it? Most pages mutate
   * constantly — adverts, lazy images, analytics — and re-reading the whole
   * document for each of those is what makes a page feel like it is chewing
   * itself. This is the cheap question to ask first.
   */
  function trackedContentIntact() {
    var i;
    for (i = 0; i < chordElements.length; i++) {
      var el = chordElements[i];
      if (!el.isConnected || appliedText.get(el) !== el.textContent) return false;
    }
    for (i = 0; i < textNodes.length; i++) {
      var node = textNodes[i].node;
      if (!node.isConnected || appliedText.get(node) !== node.nodeValue) return false;
    }
    // A site swapping to another version of the song hides the one we are on
    // and shows another, leaving our chords untouched but off screen. Sampling
    // one of them catches that without measuring the whole sheet.
    var sample = chordElements[0] ||
      (textNodes[0] && textNodes[0].node.parentElement);
    if (sample && !sample.getClientRects().length) return false;
    return true;
  }

  var rescanTimer = null;
  var deferredScan = null;
  var lastFullScan = 0;
  var FULL_SCAN_GAP = 3000;   // while our chords are untouched, look for new ones rarely
  var WATCH_WINDOW_MS = 30000;   // how long to keep looking on a page with no sheet yet

  /** Look over the page again: new chords, moved chords, a different sheet. */
  function rescan() {
    clearTimeout(deferredScan);
    deferredScan = null;
    lastFullScan = Date.now();

    var before = chordElements.length;
    detection = Detect.scan();

    if (!panel) {
      if (!detection.confident) {
        // An ordinary web page, or one still rendering. Keep looking for a
        // while — sites build their sheet late — then stop rather than
        // re-scan the document for the rest of its life.
        if (Date.now() - watchStarted > WATCH_WINDOW_MS) stopWatching();
        return;
      }
      activate();
      return;
    }

    scanElements();
    scanTextBlocks();
    if (!detectedKey || chordElements.length !== before) {
      detectedKey = Chords.detectKey(originalChordTexts());
      computeEasiest();
    }
    apply();
  }

  function watchPage() {
    if (observer) return;
    observer = new MutationObserver(function (mutations) {
      if (applying) return;
      if (mutations.every(ourOwnMutation)) return;

      // The page changed somewhere. If our own chords are untouched there is
      // nothing to redo right now — but the change might have revealed a sheet
      // elsewhere, so the look is postponed rather than dropped.
      if (panel && trackedContentIntact()) {
        var wait = FULL_SCAN_GAP - (Date.now() - lastFullScan);
        if (wait > 0) {
          if (!deferredScan) deferredScan = setTimeout(rescan, wait);
          return;
        }
      }
      clearTimeout(rescanTimer);
      rescanTimer = setTimeout(rescan, panel ? 250 : 1000);
    });
    watchStarted = Date.now();
    observer.observe(document.body, WATCHED_CHANGES);
  }

  function stopWatching() {
    clearTimeout(deferredScan);
    deferredScan = null;
    if (!observer) return;
    observer.disconnect();
    observer = null;
  }

  function activate() {
    scanElements();
    scanTextBlocks();
    detectedKey = Chords.detectKey(originalChordTexts());
    computeEasiest();
    if (!panel) { buildPanel(); buildTooltip(); wireHover(); }
    apply();
  }

  function start() {
    load(function () {
      if (disabled) return;
      detection = Detect.scan();
      watchPage();                       // pages that render their chords late
      if (detection.confident) activate();
    });
  }

  try {
    chrome.runtime.onMessage.addListener(function (msg, sender, respond) {
      if (!msg || !msg.type) return;
      if (msg.type === 'ct-show') {
        // Force the panel on, even if detection was not confident.
        if (!panel) { watchStarted = Date.now(); detection = Detect.scan(); activate(); watchPage(); }
        else { panel.setVisible(true); panel.setCollapsed(false); }
        respond({ ok: true, chords: chordElements.length });
      } else if (msg.type === 'ct-status') {
        respond({
          ok: true,
          host: location.host,
          active: !!panel,
          disabled: disabled,
          chords: chordElements.length,
          chordLines: detection.chordLines,
          distinct: detection.distinct,
          steps: state.steps,
          key: detectedKey ? detectedKey.name : null,
          keyNow: detectedKey ? Chords.keyName(detectedKey.pc + state.steps, detectedKey.minor) : null
        });
      } else if (msg.type === 'ct-set-steps') {
        setSteps(msg.steps);
        respond({ ok: true });
      } else if (msg.type === 'ct-set-disabled') {
        disabled = !!msg.disabled;
        if (disabled) {
          setSteps(0);
          stopScroll();
          stopWatching();
          if (panel) { panel.destroy(); panel = null; }
        } else if (!panel) {
          watchPage();
          detection = Detect.scan();
          activate();
        }
        respond({ ok: true, disabled: disabled });
      }
      return true;
    });
  } catch (e) { /* not running as an extension (e.g. the test fixture) */ }

  document.addEventListener('keydown', onKeydown, true);

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();
