/*
 * Chord parsing / transposition engine.
 * Pure logic, no DOM. Loaded both as a content script (exposes globalThis.CTChords)
 * and via require() from the Node tests.
 */
(function (root) {
  'use strict';

  var PC_OF_LETTER = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  var SHARP_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  var FLAT_NAMES  = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
  var ACCIDENTAL = { '#': 1, '♯': 1, 'b': -1, '♭': -1, 'x': 2 };

  // What may follow the root of a chord. Deliberately strict so that ordinary
  // words ("Cab", "Dominant", "Go") are not mistaken for chords in generic mode.
  var SUFFIX_RE = /^(?:maj|Maj|MAJ|min|Min|MIN|sus|add|aug|dim|alt|omit|no|M|m|[+\-#b♯♭()°øΔ,\/\d\s])*$/;
  var NOTE_ONLY_RE = /^[A-G][#b♯♭]?$/;

  function mod12(n) { return ((n % 12) + 12) % 12; }

  function noteToPc(letter, accidentals) {
    var pc = PC_OF_LETTER[letter];
    for (var i = 0; i < accidentals.length; i++) pc += (ACCIDENTAL[accidentals[i]] || 0);
    return mod12(pc);
  }

  /**
   * Parse a chord symbol such as "D#m", "Bb7", "F#m7b5", "C/G".
   * Returns { root, suffix, bass, text } with pitch classes, or null if not a chord.
   */
  function parseChord(raw) {
    if (typeof raw !== 'string') return null;
    var text = raw.trim();
    if (!text || text.length > 16) return null;

    var main = text;
    var bass = null;
    var slash = text.lastIndexOf('/');
    if (slash > 0) {
      var after = text.slice(slash + 1).trim();
      if (NOTE_ONLY_RE.test(after)) {
        main = text.slice(0, slash).trim();
        bass = noteToPc(after[0], after.slice(1));
      }
    }

    var m = /^([A-G])([#b♯♭x]{0,2})([\s\S]*)$/.exec(main);
    if (!m) return null;
    var suffix = m[3];
    if (!SUFFIX_RE.test(suffix)) return null;

    return { root: noteToPc(m[1], m[2]), suffix: suffix, bass: bass, text: text };
  }

  function isChord(raw) { return parseChord(raw) !== null; }

  /** Rough triad quality, used for key detection. */
  function chordQuality(parsed) {
    var s = parsed.suffix;
    if (/^(dim|°|ø)/.test(s) || /^m(in)?7?[b♭]5/.test(s)) return 'dim';
    if (/^(m|min|-)(?!aj)/.test(s)) return 'min';
    return 'maj'; // major, 7ths, sus, aug, add... — all rooted on the same letter
  }

  function pcName(pc, preferFlat, unicodeAccidentals) {
    var name = (preferFlat ? FLAT_NAMES : SHARP_NAMES)[mod12(pc)];
    if (unicodeAccidentals) name = name.replace('#', '♯').replace('b', '♭');
    return name;
  }

  /** Transpose one chord symbol. Non-chords are returned untouched. */
  function transposeChord(text, steps, preferFlat) {
    var p = parseChord(text);
    if (!p) return text;
    var unicode = /[♯♭]/.test(text);
    var out = pcName(p.root + steps, preferFlat, unicode) + p.suffix;
    if (p.bass !== null) out += '/' + pcName(p.bass + steps, preferFlat, unicode);
    return out;
  }

  /**
   * Reduce a chord to the plain triad a beginner can play: the root, and minor
   * or major. Sevenths, ninths, suspensions and slash basses all fall away —
   * `Fm7b5` becomes `Fm`, `Bmaj7` becomes `B`, `Abm/Gb` becomes `Abm`.
   *
   * This changes the harmony, and is meant to: it is the substitution printed
   * in beginner songbooks. The root's spelling is kept exactly as the page
   * wrote it, so transposing afterwards behaves the same as before.
   */
  function simplifyChord(text) {
    var parsed = parseChord(text);
    if (!parsed) return text;
    var root = /^[A-G][#b♯♭x]{0,2}/.exec(text.trim());
    if (!root) return text;
    // A diminished or half-diminished chord reads closest as a minor triad.
    return root[0] + (chordQuality(parsed) === 'maj' ? '' : 'm');
  }

  // ---- Key detection -------------------------------------------------------

  var MAJOR_DEGREES   = [0, 2, 4, 5, 7, 9, 11];
  var MAJOR_QUALITIES = ['maj', 'min', 'min', 'maj', 'maj', 'min', 'dim'];
  var MINOR_DEGREES   = [0, 2, 3, 5, 7, 8, 10];
  var MINOR_QUALITIES = ['min', 'dim', 'maj', 'min', 'min', 'maj', 'maj'];

  var MAJOR_KEY_NAMES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];
  var MINOR_KEY_NAMES = ['Cm', 'C#m', 'Dm', 'Ebm', 'Em', 'Fm', 'F#m', 'Gm', 'G#m', 'Am', 'Bbm', 'Bm'];
  // Keys whose signature uses sharps; everything else is spelled with flats.
  var SHARP_KEYS = { 'G': 1, 'D': 1, 'A': 1, 'E': 1, 'B': 1, 'F#': 1,
                     'Em': 1, 'Bm': 1, 'F#m': 1, 'C#m': 1, 'G#m': 1, 'D#m': 1 };

  function keyName(pc, minor) {
    return (minor ? MINOR_KEY_NAMES : MAJOR_KEY_NAMES)[mod12(pc)];
  }

  function keyPrefersFlat(pc, minor) {
    return !SHARP_KEYS[keyName(pc, minor)];
  }

  /**
   * Guess the key from the chords of a song.
   * Scores all 24 keys by how well the chords fit their diatonic triads,
   * with extra weight on the first and (especially) last chord as tonic.
   */
  function detectKey(chordTexts) {
    var parsed = [];
    for (var i = 0; i < chordTexts.length; i++) {
      var p = parseChord(chordTexts[i]);
      if (p) parsed.push(p);
    }
    if (!parsed.length) return null;

    var counts = {};
    parsed.forEach(function (p) {
      var k = p.root + '|' + chordQuality(p);
      counts[k] = (counts[k] || 0) + 1;
    });

    var first = parsed[0], last = parsed[parsed.length - 1];
    var best = null;

    for (var pc = 0; pc < 12; pc++) {
      [false, true].forEach(function (minor) {
        var degrees  = minor ? MINOR_DEGREES : MAJOR_DEGREES;
        var qualities = minor ? MINOR_QUALITIES : MAJOR_QUALITIES;
        var score = 0;

        Object.keys(counts).forEach(function (k) {
          var parts = k.split('|');
          var root = parseInt(parts[0], 10), quality = parts[1], n = counts[k];
          var idx = degrees.indexOf(mod12(root - pc));
          if (idx < 0) score -= n * 0.6;                       // out of key
          else score += n * (qualities[idx] === quality ? 3 : 1.5);
        });

        var tonicQuality = minor ? 'min' : 'maj';
        if (first.root === pc && chordQuality(first) === tonicQuality) score += 3;
        if (last.root === pc && chordQuality(last) === tonicQuality) score += 4;

        if (!best || score > best.score) best = { score: score, pc: pc, minor: minor };
      });
    }

    best.name = keyName(best.pc, best.minor);
    return best;
  }

  /** Does the source text lean on flats or sharps? Fallback when no key is found. */
  function sourcePrefersFlat(chordTexts) {
    var sharps = 0, flats = 0;
    chordTexts.forEach(function (t) {
      var p = parseChord(t);
      if (!p) return;
      if (/^[A-G][b♭]/.test(t)) flats++;
      else if (/^[A-G][#♯]/.test(t)) sharps++;
    });
    return flats > sharps;
  }

  /**
   * Decide how to spell accidentals after transposing.
   * mode: 'auto' (follow the target key), 'sharp', or 'flat'.
   */
  function spellingForTarget(chordTexts, key, steps, mode) {
    if (mode === 'sharp') return false;
    if (mode === 'flat') return true;
    if (key) return keyPrefersFlat(key.pc + steps, key.minor);
    return sourcePrefersFlat(chordTexts);
  }

  // ---- Plain-text chord lines (generic / <pre> sheets) ---------------------

  /**
   * Transpose a monospace chord line, keeping every chord in its original
   * column where possible (a widened chord pushes the rest of the line right).
   *
   * `startColumn` is where this text begins on its visual line, for pages that
   * split a line across several text nodes. Trailing spaces are kept: on a
   * fragment they are what holds the next fragment in place. With `simplify`,
   * each chord is reduced to its plain triad on the way through.
   */
  function transposeChordLine(line, steps, preferFlat, startColumn, simplify) {
    var start = startColumn || 0;
    var out = '';
    var re = /\S+/g;
    var m, end = 0;
    while ((m = re.exec(line)) !== null) {
      var token = m[0];
      var column = start + m.index;
      var source = simplify ? simplifyChord(token) : token;
      // Not moving the song? Then keep the page's own spelling: simplifying
      // "Bbmaj7" should give "Bb", never "A#".
      var replacement = steps === 0 ? source : transposeChord(source, steps, preferFlat);
      var gap = Math.max(column - (start + out.length), out.length ? 1 : 0);
      out += ' '.repeat(gap) + replacement;
      end = m.index + token.length;
    }
    return out + line.slice(end);
  }

  /** Is this line a chord line (as opposed to lyrics)? */
  function looksLikeChordLine(line) {
    var tokens = line.trim().split(/\s+/).filter(Boolean);
    if (!tokens.length) return false;
    var chords = tokens.filter(isChord).length;
    return chords === tokens.length || (tokens.length > 1 && chords / tokens.length >= 0.8);
  }

  var api = {
    parseChord: parseChord,
    isChord: isChord,
    chordQuality: chordQuality,
    transposeChord: transposeChord,
    simplifyChord: simplifyChord,
    transposeChordLine: transposeChordLine,
    looksLikeChordLine: looksLikeChordLine,
    detectKey: detectKey,
    keyName: keyName,
    keyPrefersFlat: keyPrefersFlat,
    spellingForTarget: spellingForTarget,
    sourcePrefersFlat: sourcePrefersFlat,
    mod12: mod12,
    SHARP_NAMES: SHARP_NAMES,
    FLAT_NAMES: FLAT_NAMES
  };

  root.CTChords = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
