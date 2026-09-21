/*
 * Draws a chord diagram as SVG, from a voicing worked out in core/shapes.js.
 * Used by the hover tooltip and by the chord strip in the panel.
 */
(function (root) {
  'use strict';


  var STRINGS = 6;
  var ROWS = 5;                 // frets drawn
  var GAP_X = 13;               // between strings
  var GAP_Y = 15;               // between frets
  var PAD_X = 16;
  var TOP = 40;                 // room for the name and the o/x markers
  var WIDTH = PAD_X * 2 + GAP_X * (STRINGS - 1);
  var HEIGHT = TOP + GAP_Y * ROWS + 12;

  function svgFor(shape, options) {
    var fretted = shape.frets.filter(function (f) { return f > 0; });
    var highest = fretted.length ? Math.max.apply(null, fretted) : 0;
    var lowest = fretted.length ? Math.min.apply(null, fretted) : 0;
    var usesOpen = shape.frets.indexOf(0) !== -1;

    // Draw from the nut whenever the shape is near it — a diagram shifted up
    // the neck for an open chord reads as the wrong chord.
    var startFret = (usesOpen || highest <= ROWS) ? 1 : lowest;
    var offset = startFret - 1;
    var atNut = startFret === 1;
    var parts = [];

    // direction is pinned: most chord sites are right-to-left, and a chord
    // name like "D/F#" gets reordered to "#D/F" if bidi gets hold of it.
    parts.push('<svg xmlns="http://www.w3.org/2000/svg" width="' + WIDTH + '" height="' + HEIGHT +
      '" viewBox="0 0 ' + WIDTH + ' ' + HEIGHT + '" direction="ltr" style="direction:ltr">');

    // name
    parts.push('<text x="' + (WIDTH / 2) + '" y="16" text-anchor="middle" fill="#8ee0b0" ' +
      'font-family="system-ui, -apple-system, Segoe UI, Roboto, sans-serif" font-size="13" ' +
      'font-weight="700">' + escapeText(shape.name) + '</text>');

    // open / muted markers
    for (var s = 0; s < STRINGS; s++) {
      var x = PAD_X + s * GAP_X;
      if (shape.frets[s] === 0) {
        parts.push('<circle cx="' + x + '" cy="' + (TOP - 10) + '" r="3.4" fill="none" stroke="#9aa3c0" stroke-width="1.3"/>');
      } else if (shape.frets[s] < 0) {
        parts.push('<path d="M' + (x - 3.2) + ' ' + (TOP - 13.2) + ' l6.4 6.4 M' + (x + 3.2) + ' ' +
          (TOP - 13.2) + ' l-6.4 6.4" stroke="#6f7794" stroke-width="1.3" stroke-linecap="round"/>');
      }
    }

    // nut or position label
    if (atNut) {
      parts.push('<rect x="' + PAD_X + '" y="' + (TOP - 3) + '" width="' + (GAP_X * (STRINGS - 1)) +
        '" height="3.4" fill="#9aa3c0"/>');
    } else {
      parts.push('<text x="' + (PAD_X - 6) + '" y="' + (TOP + 12) + '" text-anchor="end" fill="#8b93b0" ' +
        'font-family="system-ui, sans-serif" font-size="10">' + startFret + '</text>');
    }

    // grid
    for (var r = 0; r <= ROWS; r++) {
      var y = TOP + r * GAP_Y;
      parts.push('<line x1="' + PAD_X + '" y1="' + y + '" x2="' + (PAD_X + GAP_X * (STRINGS - 1)) +
        '" y2="' + y + '" stroke="#3a4260" stroke-width="1"/>');
    }
    for (var t = 0; t < STRINGS; t++) {
      var sx = PAD_X + t * GAP_X;
      parts.push('<line x1="' + sx + '" y1="' + TOP + '" x2="' + sx + '" y2="' + (TOP + GAP_Y * ROWS) +
        '" stroke="#3a4260" stroke-width="1"/>');
    }

    // A barre is only worth drawing when the shape really is one finger across
    // several strings; two dots are clearer than a bar over two strings.
    var hand = root.CTShapes.handAnalysis(shape.frets);
    if (hand.barre && fretted.length >= 4) {
      var barredFret = hand.barreFret;
      var strings = [];
      shape.frets.forEach(function (f, i) { if (f === barredFret) strings.push(i); });
      var from = PAD_X + strings[0] * GAP_X;
      var to = PAD_X + strings[strings.length - 1] * GAP_X;
      var by = TOP + (barredFret - offset - 0.5) * GAP_Y;
      parts.push('<rect x="' + (from - 5) + '" y="' + (by - 5) + '" width="' + (to - from + 10) +
        '" height="10" rx="5" fill="#8ee0b0"/>');
    }

    // fretted notes
    shape.frets.forEach(function (fret, string) {
      if (fret <= 0) return;
      var cx = PAD_X + string * GAP_X;
      var cy = TOP + (fret - offset - 0.5) * GAP_Y;
      parts.push('<circle cx="' + cx + '" cy="' + cy + '" r="5" fill="#8ee0b0"/>');
    });

    // A quiet mark that this can be heard, not just read.
    if (options && options.note) {
      parts.push('<text x="' + (WIDTH - 7) + '" y="15" text-anchor="end" ' +
        'fill="#5b6488" font-family="system-ui, sans-serif" font-size="11">\u266a</text>');
    }

    parts.push('</svg>');
    return parts.join('');
  }

  function escapeText(text) {
    return String(text).replace(/[&<>"]/g, function (ch) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch];
    });
  }

  /**
   * `options.width` scales the whole diagram; the drawing itself is always
   * laid out in the same coordinates and the SVG does the rest.
   */
  function svg(shape, options) {
    var markup = svgFor(shape, options);
    var width = options && options.width;
    if (!width) return markup;
    var height = Math.round(width * (HEIGHT / WIDTH));
    return markup.replace('width="' + WIDTH + '" height="' + HEIGHT + '"',
      'width="' + width + '" height="' + height + '"');
  }

  root.CTDiagram = { svg: svg, WIDTH: WIDTH, HEIGHT: HEIGHT };
})(typeof globalThis !== 'undefined' ? globalThis : this);
