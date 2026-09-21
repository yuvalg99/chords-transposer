/*
 * Guitar voicings, worked out rather than looked up.
 *
 * A chord symbol is turned into its intervals, and the fretboard is searched
 * for playable ways to sound them. That means any symbol the parser accepts
 * gets a diagram — m7b5, sus2, add9, slash chords — without shipping a table
 * of shapes that would always be missing something.
 *
 * Pure logic, no DOM: loaded as a content script (globalThis.CTShapes) and
 * required directly by the tests.
 */
(function (root) {
  'use strict';

  var Chords = root.CTChords || (typeof require === 'function' ? require('./chords.js') : null);

  var TUNING = [4, 9, 2, 7, 11, 4];   // E A D G B E, low string first
  var STRINGS = 6;
  var MAX_BASE = 11;                  // highest position to search
  var SPAN = 3;                       // a hand covers base..base+3
  var OPEN_REACH = 4;                 // open strings stay usable this far up
  var MAX_FINGERS = 4;
  var MUTED = -1;

  function mod12(n) { return ((n % 12) + 12) % 12; }

  /**
   * Intervals of a chord symbol's suffix, in semitones from the root.
   * Returns { tones, fifth } — fifth is the droppable one.
   */
  function chordIntervals(suffix) {
    var s = (suffix || '').replace(/[\s()]/g, '');
    var tones = [0];

    var isPower = /^5/.test(s);
    var isDim = /^(dim|°)/.test(s);
    var isAug = /^(aug|\+)/.test(s);
    var isMinor = /^(m|min|-)(?!aj)/.test(s);
    var sus2 = /sus2/.test(s);
    var sus4 = /sus4/.test(s) || /sus(?!2)/.test(s);

    // third (or what stands in for it)
    if (sus2) tones.push(2);
    else if (sus4) tones.push(5);
    else if (isDim || isMinor) tones.push(3);
    else if (!isPower) tones.push(4);

    // fifth
    var fifth = 7;
    if (isDim || /[b♭]5/.test(s)) fifth = 6;
    else if (isAug || /[#♯]5/.test(s)) fifth = 8;
    tones.push(fifth);

    // sixth / seventh
    var isAdd = /add/.test(s);
    var major7 = /(maj|Maj|MAJ|Δ)(7|9|11|13)/.test(s) || /^M7/.test(s) || /^Mmaj7/.test(s);
    var has7 = /(^|[^b♭#♯0-9])7/.test(s) || (/9|11|13/.test(s) && !isAdd);
    if (/dim7|°7/.test(s)) tones.push(9);              // fully diminished
    else if (/6/.test(s)) tones.push(9);
    else if (major7) tones.push(11);
    else if (has7) tones.push(10);

    // extensions
    if (/9/.test(s)) tones.push(/[b♭]9/.test(s) ? 1 : (/[#♯]9/.test(s) ? 3 : 2));
    if (/11/.test(s)) tones.push(/[#♯]11/.test(s) ? 6 : 5);
    if (/13/.test(s)) tones.push(/[b♭]13/.test(s) ? 8 : 9);

    var unique = [];
    tones.forEach(function (t) { if (unique.indexOf(t) === -1) unique.push(t); });
    return { tones: unique.sort(function (a, b) { return a - b; }), fifth: fifth };
  }

  /**
   * What the fretting hand has to do: how many fingers, whether a fret is
   * barred (and which), and whether it is asked to hold one fret on two
   * strings with no way to bar them — the shape of a voicing that looks fine
   * on paper and is horrible to play.
   */
  function handAnalysis(frets) {
    var fretted = [];
    for (var i = 0; i < STRINGS; i++) {
      if (frets[i] > 0) fretted.push({ string: i, fret: frets[i] });
    }
    if (!fretted.length) return { fingers: 0, barre: false, barreFret: 0, awkward: false };

    var byFret = {};
    fretted.forEach(function (f) {
      (byFret[f.fret] = byFret[f.fret] || []).push(f.string);
    });

    var best = { fingers: fretted.length, barre: false, barreFret: 0 };
    var awkward = false;

    // A barre can sit at any fret, not only the lowest one: a bass note below
    // a barred shape is ordinary (low E under a barre at the fourth fret).
    Object.keys(byFret).forEach(function (key) {
      var fret = parseInt(key, 10);
      var strings = byFret[key];
      if (strings.length < 2) return;

      // Neighbouring strings wanting the same fret: either one finger bars
      // them, or two fingers reach for them separately.
      for (var pair = 1; pair < strings.length; pair++) {
        if (reachAwkwardly(frets, strings[pair - 1], strings[pair], fret)) awkward = true;
      }

      var from = strings[0], to = strings[strings.length - 1], barrable = true;
      for (var s = from; s <= to; s++) {
        // The barring finger crosses every string in between: none may need a
        // lower fret, ring open, or need to stay silent.
        if (frets[s] === MUTED || frets[s] === 0 || frets[s] < fret) barrable = false;
      }
      if (!barrable) return;

      var fingers = 1 + fretted.filter(function (f) { return f.fret !== fret; }).length;
      if (fingers < best.fingers) best = { fingers: fingers, barre: true, barreFret: fret };
    });

    return {
      fingers: best.fingers,
      barre: best.barre,
      barreFret: best.barreFret,
      awkward: awkward
    };
  }

  /**
   * Two strings want the same fret. Can a hand do it?
   *
   * Side by side, yes — two fingers, or one laid across. Far apart it depends
   * on what lies between: strings that are open or fretted *lower* leave the
   * natural diagonal of the hand intact (open G, 320003), but a string fretted
   * *higher* in between means a finger has to cross under the others to reach,
   * which is the mark of a shape nobody plays.
   */
  function reachAwkwardly(frets, lowString, highString, fret) {
    if (highString - lowString < 3) return false;
    var crosses = false, blocked = false;
    for (var s = lowString + 1; s < highString; s++) {
      if (frets[s] > fret) crosses = true;
      else blocked = true;          // open, silent or lower: no bar possible here
    }
    return crosses && blocked;
  }

  function fingersNeeded(frets) { return handAnalysis(frets).fingers; }

  function soundingStrings(frets) {
    var out = [];
    for (var i = 0; i < STRINGS; i++) if (frets[i] !== MUTED) out.push(i);
    return out;
  }

  function score(frets, base) {
    var open = 0, fretted = 0, sounding = 0;
    for (var i = 0; i < STRINGS; i++) {
      if (frets[i] === MUTED) continue;
      sounding++;
      if (frets[i] === 0) open++; else fretted++;
    }
    var hand = handAnalysis(frets);
    var frettedFrets = frets.filter(function (f) { return f > 0; });
    var spread = frettedFrets.length
      ? Math.max.apply(null, frettedFrets) - Math.min.apply(null, frettedFrets)
      : 0;

    var value = 0;
    value += open * 1.6;                 // open strings ring, and are easy
    value += sounding * 1.8;             // a thin voicing is a last resort
    value -= fretted * 0.35;
    value -= base * 0.5;                 // prefer the lowest position that works
    value -= hand.fingers * 0.6;
    if (hand.barre) value += 1.2;        // barre shapes are what players reach for
    if (hand.awkward) value -= 3;        // a finger would have to cross under another
    if (spread > 2) value -= (spread - 2) * 1.2;   // no four-fret stretches
    return value;
  }

  /**
   * Best playable voicing for a chord symbol, or null.
   * Returns { frets, base, name } with one fret per string (low to high),
   * -1 meaning muted.
   */
  function shapeFor(symbol) {
    var parsed = Chords.parseChord(symbol);
    if (!parsed) return null;

    var spec = chordIntervals(parsed.suffix);
    var chordPcs = spec.tones.map(function (t) { return mod12(parsed.root + t); });
    var bassPc = parsed.bass === null ? mod12(parsed.root) : parsed.bass;
    // The named bass of a slash chord is a note the shape may sound, even
    // though it is not one of the chord's own tones.
    if (chordPcs.indexOf(bassPc) === -1) chordPcs.push(bassPc);

    // The fifth is the note a guitarist drops first; everything else defines
    // the chord and has to be in there somewhere. A slash chord already asks
    // for four notes, so the fifth becomes droppable there too.
    var noteCount = spec.tones.length + (parsed.bass === null ? 0 : 1);
    var required = spec.tones
      .filter(function (t) { return noteCount < 4 || t !== spec.fifth; })
      .map(function (t) { return mod12(parsed.root + t); });
    if (parsed.bass !== null && required.indexOf(bassPc) === -1) required.push(bassPc);

    var best = null;

    for (var base = 0; base <= MAX_BASE; base++) {
      var low = base === 0 ? 0 : base;
      var high = base === 0 ? SPAN : base + SPAN;

      // What each string can play in this position.
      var options = [];
      for (var s = 0; s < STRINGS; s++) {
        var choices = [MUTED];
        for (var fret = low; fret <= high; fret++) {
          if (fret === 0 && base > OPEN_REACH) continue;
          if (fret !== 0 && fret < 1) continue;
          if (chordPcs.indexOf(mod12(TUNING[s] + fret)) !== -1) choices.push(fret);
        }
        if (base > 0 && chordPcs.indexOf(mod12(TUNING[s])) !== -1 && base <= OPEN_REACH) {
          if (choices.indexOf(0) === -1) choices.push(0);
        }
        options.push(choices);
      }

      var frets = new Array(STRINGS);
      (function walk(stringIndex) {
        if (stringIndex === STRINGS) {
          var candidate = frets.slice();
          if (!isPlayable(candidate, required, bassPc)) return;
          var value = score(candidate, base);
          if (!best || value > best.value) {
            best = { value: value, frets: candidate, base: base };
          }
          return;
        }
        var choices = options[stringIndex];
        for (var i = 0; i < choices.length; i++) {
          frets[stringIndex] = choices[i];
          walk(stringIndex + 1);
        }
      })(0);
    }

    if (!best) return null;
    var lowestFret = Math.min.apply(null, best.frets.filter(function (f) { return f > 0; }).concat([99]));
    return {
      name: symbol,
      frets: best.frets,
      base: lowestFret === 99 ? 1 : lowestFret,
      fingers: fingersNeeded(best.frets)
    };
  }

  function innerMutes(frets, sounding) {
    var count = 0;
    for (var i = sounding[0]; i <= sounding[sounding.length - 1]; i++) {
      if (frets[i] === MUTED) count++;
    }
    return count;
  }

  function isPlayable(frets, required, bassPc) {
    var sounding = [];
    for (var i = 0; i < STRINGS; i++) if (frets[i] !== MUTED) sounding.push(i);
    if (sounding.length < 3) return false;

    // Muted strings only at the edges: a hole in the middle of a chord is not
    // a shape anyone reads off a diagram.
    if (innerMutes(frets, sounding) > 0) return false;

    if (mod12(TUNING[sounding[0]] + frets[sounding[0]]) !== bassPc) return false;

    var usesOpen = false, highest = 0;
    for (var n = 0; n < STRINGS; n++) {
      if (frets[n] === 0) usesOpen = true;
      if (frets[n] > highest) highest = frets[n];
    }
    if (usesOpen && highest > 3) return false;   // the hand cannot be in two places

    var played = sounding.map(function (s) { return mod12(TUNING[s] + frets[s]); });
    for (var k = 0; k < required.length; k++) {
      if (played.indexOf(required[k]) === -1) return false;
    }
    return fingersNeeded(frets) <= MAX_FINGERS;
  }

  var cache = new Map();
  function diagramFor(symbol) {
    if (cache.has(symbol)) return cache.get(symbol);
    var shape = null;
    try { shape = shapeFor(symbol); } catch (e) { shape = null; }
    cache.set(symbol, shape);
    return shape;
  }

  // ---- how hard is this to play? ---------------------------------------

  /**
   * Rough effort a chord costs a guitarist, as a number where 0 is an open
   * chord that plays itself and anything past ~5 is a barre up the neck.
   */
  function difficulty(symbol) {
    var shape = diagramFor(symbol);
    if (!shape) return 12;                       // nothing playable found at all

    var frets = shape.frets;
    var hand = handAnalysis(frets);
    var open = 0, fretted = 0, sounding = 0;
    for (var i = 0; i < STRINGS; i++) {
      if (frets[i] === MUTED) continue;
      sounding++;
      if (frets[i] === 0) open++; else fretted++;
    }

    var effort = hand.fingers;
    // Two adjacent strings under one finger is not what anyone means by a
    // barre chord; a full one across the neck is the wall beginners hit.
    if (hand.barre && fretted >= 4) effort += 2.5;
    effort += Math.max(0, shape.base - 1) * 0.35;   // further up the neck
    effort -= open * 0.6;                            // open strings play themselves
    if (sounding === 6) effort -= 0.2;               // nothing to avoid hitting
    return Math.max(0, effort);
  }

  /**
   * Which transposition makes a song easiest to play?
   *
   * `counts` maps chord symbol to how often it appears, so a barre chord in
   * every chorus weighs more than one passing chord. Every key is scored and
   * the best one wins.
   *
   * The result is expressed as a negative shift wherever that keeps a capo
   * usable (down 3 with a capo on 3 sounds exactly like the original), and
   * positive only when the capo would end up past the seventh fret.
   */
  function weighted(counts) {
    var parsed = [];
    Object.keys(counts).forEach(function (symbol) {
      var chord = Chords.parseChord(symbol);
      if (chord) parsed.push({ chord: chord, weight: counts[symbol] });
    });
    return parsed;
  }

  /**
   * What this song costs to play when shifted by `shift` semitones: the mean
   * effort per chord, and how many of the chords played are hard ones.
   */
  function shiftCost(counts, shift) {
    var parsed = Array.isArray(counts) ? counts : weighted(counts);
    if (!parsed.length) return null;

    var total = 0, weight = 0, hard = 0, hardNames = [];
    parsed.forEach(function (entry) {
      var symbol = spell(entry.chord, shift);
      var cost = difficulty(symbol);
      total += cost * entry.weight;
      weight += entry.weight;
      if (cost >= 4) {
        hard += entry.weight;
        if (hardNames.indexOf(symbol) === -1) hardNames.push(symbol);
      }
    });
    return { score: total / weight, hardChords: hard, hardNames: hardNames };
  }

  function easiestShift(counts) {
    var parsed = weighted(counts);
    if (!parsed.length) return null;

    var results = [];
    for (var shift = 0; shift < 12; shift++) {
      var cost = shiftCost(parsed, shift);
      var steps = shift >= 5 ? shift - 12 : shift;   // keep the capo reachable
      results.push({
        steps: steps,
        score: cost.score,
        hardChords: cost.hardChords,
        distance: Math.abs(steps)
      });
    }

    results.sort(function (a, b) {
      if (Math.abs(a.score - b.score) > 0.15) return a.score - b.score;
      return a.distance - b.distance;              // a tie goes to the smaller move
    });
    return results[0];
  }

  /** The chord symbol this chord becomes when shifted, spelled for its key. */
  function spell(chord, shift) {
    var flat = Chords.keyPrefersFlat(chord.root + shift, /^(m|min|-)(?!aj)/.test(chord.suffix));
    var name = Chords.transposeChord(chord.text, shift, flat);
    return name;
  }

  var api = {
    chordIntervals: chordIntervals,
    difficulty: difficulty,
    easiestShift: easiestShift,
    shiftCost: shiftCost,
    shapeFor: shapeFor,
    diagramFor: diagramFor,
    fingersNeeded: fingersNeeded,
    handAnalysis: handAnalysis,
    TUNING: TUNING
  };
  root.CTShapes = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
