/*
 * Things a page holds that are *about* a chord but are not its text, and so
 * cannot be transposed: fingering diagrams, and inline event handlers that pop
 * one up. Left alone they would quietly show the original chord. None of this
 * is site-specific — it keys off the chord symbol the page itself wrote.
 */
(function (root) {
  'use strict';

  var Chords = root.CTChords;
  // Hover handlers only — a chord that is also a link keeps working on click.
  var HOVER_EVENTS = [
    'onmouseover', 'onmouseout', 'onmouseenter', 'onmouseleave',
    'onpointerover', 'onpointerenter', 'onpointerout', 'onpointerleave'
  ];

  var DIAGRAM_SELECTOR = [
    'img[src*="chord" i]', 'img[alt*="chord" i]', 'img[alt]',
    '[class*="diagram" i]', '[class*="chord-card" i]', '[class*="chordcard" i]',
    '[class*="chord-box" i]', '[class*="chordbox" i]', '[class*="chord-shape" i]',
    '[class*="chordshape" i]', '[class*="fretboard" i]', '[class*="fretbox" i]'
  ].join(',');

  var STALE_TITLE = 'This diagram is the original chord — hover a chord, or open ' +
    'the chord list in the panel, for the transposed shape';

  /**
   * Take hover away from the page for these chords, or give it back.
   *
   * Sites pop up their own fingering diagram when you hover a chord, built
   * from the chord that was printed there. Once the page is transposed that
   * diagram is simply wrong, and even untransposed it is a second tooltip
   * fighting with ours. Inline handlers are removed here and remembered so
   * they can be put back; handlers added with addEventListener are dealt with
   * by swallowing the event (see the content script).
   *
   * `onlyWithDiagram` keeps the page's own tooltip for a chord we cannot draw,
   * so taking hover over never leaves the reader with nothing.
   */
  function suppressHover(elements, suppress, onlyWithDiagram) {
    var Shapes = root.CTShapes;
    elements.forEach(function (el) {
      var stored = el.getAttribute('data-ct-events');
      if (suppress) {
        if (stored) return;
        if (onlyWithDiagram && Shapes && !Shapes.diagramFor((el.textContent || '').trim())) return;
        var saved = null;
        HOVER_EVENTS.forEach(function (name) {
          var handler = el.getAttribute(name);
          if (!handler) return;
          saved = saved || {};
          saved[name] = handler;
        });
        if (!saved) return;
        Object.keys(saved).forEach(function (name) { el.removeAttribute(name); });
        el.setAttribute('data-ct-events', JSON.stringify(saved));
      } else if (stored) {
        var handlers = {};
        try { handlers = JSON.parse(stored); } catch (e) { handlers = {}; }
        Object.keys(handlers).forEach(function (name) { el.setAttribute(name, handlers[name]); });
        el.removeAttribute('data-ct-events');
      }
    });
  }

  /** Dim chord diagrams while the page is transposed. */
  function markDiagrams(stale) {
    var nodes = document.querySelectorAll(DIAGRAM_SELECTOR);
    for (var i = 0; i < nodes.length; i++) {
      var node = nodes[i];
      // A wrapper around the chords themselves is a container, not a diagram.
      if (node.querySelector && node.querySelector('[data-ct-orig]')) continue;
      // img[alt] is in the selector to catch diagrams labelled with the chord
      // they show; anything else with an alt is an ordinary picture.
      if (node.tagName === 'IMG' && !/chord/i.test(node.src + ' ' + node.className) &&
          !Chords.isChord((node.getAttribute('alt') || '').trim())) continue;
      if (stale) {
        if (!node.hasAttribute('data-ct-dimmed')) {
          node.setAttribute('data-ct-dimmed', node.title || '');
          node.style.opacity = '0.3';
          node.style.filter = 'grayscale(1)';
          node.title = STALE_TITLE;
        }
      } else if (node.hasAttribute('data-ct-dimmed')) {
        node.style.opacity = '';
        node.style.filter = '';
        var previous = node.getAttribute('data-ct-dimmed');
        if (previous) node.title = previous; else node.removeAttribute('title');
        node.removeAttribute('data-ct-dimmed');
      }
    }
  }

  root.CTQuirks = {
    suppressHover: suppressHover,
    markDiagrams: markDiagrams
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
