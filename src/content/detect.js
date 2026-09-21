/*
 * Generic chord discovery.
 *
 * Nothing here knows about any particular site. Chords are found by looking
 * for leaf elements whose entire text is a chord symbol, then keeping only
 * those that belong to a *group* of similar elements — a chord sheet marks its
 * chords up consistently, so the chords on a page share a tag and class and
 * most elements with that tag and class are chords. A stray "A" in a sentence
 * or a letter index in a sidebar fails that test.
 *
 * Classic monospace sheets, where the chords are plain text on their own
 * lines, are found separately as text blocks.
 */
(function (root) {
  'use strict';

  var Chords = root.CTChords;

  // Elements that never hold a chord of a song sheet.
  var SKIP_TAGS = {
    SCRIPT: 1, STYLE: 1, NOSCRIPT: 1, TEXTAREA: 1, INPUT: 1, SELECT: 1, OPTION: 1,
    BUTTON: 1, IFRAME: 1, CANVAS: 1, TEMPLATE: 1, CODE: 1, KBD: 1, SAMP: 1, TITLE: 1
  };

  // Page furniture: key pickers, A-Z indexes and menus live here.
  var SKIP_ANCESTORS = [
    'nav', 'header', 'footer', 'aside', 'form', 'table[role="presentation"] nav',
    '[role="navigation"]', '[role="banner"]', '[role="search"]', '[role="menu"]',
    '[role="tablist"]', '[class*="menu" i]', '[class*="navbar" i]', '[class*="nav-" i]',
    '[class*="breadcrumb" i]', '[class*="pagination" i]', '[class*="toolbar" i]',
    '[class*="transpose" i]', '[class*="dropdown" i]'
  ].join(',');

  var TEXT_BLOCK_HINTS = [
    'pre', '[class*="chord" i]', '[class*="tab" i]', '[class*="song" i]',
    '[class*="lyric" i]', '[id*="chord" i]', '[id*="tab" i]', '[id*="song" i]'
  ].join(',');

  var MAX_ELEMENTS = 30000;   // don't walk enormous pages
  var MAX_CHORD_TEXT = 16;
  var MIN_GROUP_CHORDS = 3;   // a group must hold at least this many chords
  var MIN_GROUP_RATIO = 0.6;  // ...and most of the group must be chords
  var MIN_TOTAL = 4;          // a page needs this many chords to be a chord sheet
  var MIN_DISTINCT = 3;

  /**
   * Is this actually on screen? Sites often keep several versions of a song in
   * the page — the same sheet in other keys, or for other instruments — with
   * all but one hidden. Counting those distorts the key, and makes "easiest to
   * play" average a hard key against an easy one.
   */
  function isRendered(el) {
    if (!el.getClientRects().length) return false;
    return getComputedStyle(el).visibility !== 'hidden';
  }

  function classOf(el) {
    return typeof el.className === 'string' ? el.className.trim() : '';
  }

  // Two ways of saying "elements like this one": by tag and class, and by that
  // plus the parent. The second catches sheets built from unclassed elements.
  function signaturesOf(el) {
    var own = el.tagName + '|' + classOf(el);
    var parent = el.parentElement;
    return parent ? [own, own + '>' + parent.tagName + '|' + classOf(parent)] : [own];
  }

  function collectLeaves() {
    var leaves = [];
    if (!document.body) return leaves;
    var all = document.body.getElementsByTagName('*');
    var limit = Math.min(all.length, MAX_ELEMENTS);
    for (var i = 0; i < limit; i++) {
      var el = all[i];
      if (el.children.length || SKIP_TAGS[el.tagName]) continue;
      var text = (el.textContent || '').trim();
      if (!text || text.length > MAX_CHORD_TEXT) continue;
      leaves.push({ el: el, text: text, chord: Chords.isChord(text) });
    }
    return leaves;
  }

  function groupLeaves(leaves) {
    var groups = Object.create(null);
    leaves.forEach(function (leaf) {
      signaturesOf(leaf.el).forEach(function (signature) {
        var group = groups[signature];
        if (!group) group = groups[signature] = { total: 0, chords: 0, distinct: {}, multiChar: 0 };
        group.total++;
        if (!leaf.chord) return;
        group.chords++;
        group.distinct[leaf.text] = true;
        if (leaf.text.length > 1) group.multiChar++;
      });
    });
    return groups;
  }

  function groupLooksLikeChords(group) {
    return !!group &&
      group.chords >= MIN_GROUP_CHORDS &&
      group.chords / group.total >= MIN_GROUP_RATIO &&
      Object.keys(group.distinct).length >= 2 &&
      // An "A B C D E F G" index is all single letters; a real sheet is not.
      group.multiChar >= 1;
  }

  /** Chord-carrying elements on this page, in document order. */
  function chordElements() {
    var leaves = collectLeaves();
    var groups = groupLeaves(leaves);
    var found = [];
    leaves.forEach(function (leaf) {
      if (!leaf.chord) return;
      if (leaf.el.closest(SKIP_ANCESTORS)) return;
      var ok = signaturesOf(leaf.el).some(function (signature) {
        return groupLooksLikeChords(groups[signature]);
      });
      // Checked last: it is the only test here that costs a layout.
      if (ok && isRendered(leaf.el)) found.push(leaf.el);
    });
    return found;
  }

  function isPreformatted(el) {
    var style = getComputedStyle(el);
    if (style.whiteSpace.indexOf('pre') === 0) return true;
    var font = style.fontFamily.toLowerCase();
    return font.indexOf('mono') !== -1 || font.indexOf('courier') !== -1;
  }

  /**
   * Blocks of preformatted text holding chord lines — the classic
   * chords-above-lyrics sheet, with no markup around the chords themselves.
   */
  function textBlocks() {
    var candidates = [];
    var nodes = document.querySelectorAll(TEXT_BLOCK_HINTS);
    for (var i = 0; i < nodes.length; i++) {
      var el = nodes[i];
      var text = el.textContent || '';
      if (text.indexOf('\n') === -1 || text.length > 200000) continue;
      if (el.querySelector('[data-ct-orig]')) continue;   // already handled element by element
      if (!isPreformatted(el) || !isRendered(el)) continue;
      var lines = text.split('\n').filter(Chords.looksLikeChordLine).length;
      if (lines < 2) continue;
      candidates.push(el);
    }
    // Keep only the innermost block of any nested pair.
    return candidates.filter(function (el) {
      return !candidates.some(function (other) { return other !== el && el.contains(other); });
    });
  }

  /** Everything the content script needs to decide whether to act. */
  function scan() {
    var elements = chordElements();
    var blocks = textBlocks();
    var distinct = {};
    elements.forEach(function (el) { distinct[el.textContent.trim()] = true; });
    var lines = 0;
    blocks.forEach(function (block) {
      block.textContent.split('\n').forEach(function (line) {
        if (!Chords.looksLikeChordLine(line)) return;
        lines++;
        line.trim().split(/\s+/).forEach(function (token) {
          if (Chords.isChord(token)) distinct[token] = true;
        });
      });
    });
    var distinctCount = Object.keys(distinct).length;
    return {
      elements: elements,
      blocks: blocks,
      distinct: distinctCount,
      chordLines: lines,
      // A page qualifies on either route: marked-up chords or text chord lines.
      confident: (elements.length >= MIN_TOTAL || lines >= 2) && distinctCount >= MIN_DISTINCT
    };
  }

  root.CTDetect = { scan: scan, chordElements: chordElements, textBlocks: textBlocks };
})(typeof globalThis !== 'undefined' ? globalThis : this);
