const test = require('node:test');
const assert = require('node:assert');
const S = require('../src/core/shapes.js');
const C = require('../src/core/chords.js');

const TUNING = S.TUNING;
const asText = (shape) => shape.frets.map((f) => (f < 0 ? 'x' : f)).join('');

test('reads intervals out of a chord suffix', () => {
  assert.deepStrictEqual(S.chordIntervals('').tones, [0, 4, 7]);
  assert.deepStrictEqual(S.chordIntervals('m').tones, [0, 3, 7]);
  assert.deepStrictEqual(S.chordIntervals('7').tones, [0, 4, 7, 10]);
  assert.deepStrictEqual(S.chordIntervals('maj7').tones, [0, 4, 7, 11]);
  assert.deepStrictEqual(S.chordIntervals('m7').tones, [0, 3, 7, 10]);
  assert.deepStrictEqual(S.chordIntervals('m7b5').tones, [0, 3, 6, 10]);
  assert.deepStrictEqual(S.chordIntervals('dim7').tones, [0, 3, 6, 9]);
  assert.deepStrictEqual(S.chordIntervals('sus4').tones, [0, 5, 7]);
  assert.deepStrictEqual(S.chordIntervals('sus2').tones, [0, 2, 7]);
  assert.deepStrictEqual(S.chordIntervals('6').tones, [0, 4, 7, 9]);
  assert.deepStrictEqual(S.chordIntervals('aug').tones, [0, 4, 8]);
  assert.deepStrictEqual(S.chordIntervals('5').tones, [0, 7]);
  // add9 adds the ninth without dragging in a seventh
  assert.deepStrictEqual(S.chordIntervals('add9').tones, [0, 2, 4, 7]);
  assert.deepStrictEqual(S.chordIntervals('9').tones, [0, 2, 4, 7, 10]);
});

test('finds the shapes guitarists actually play', () => {
  const expected = {
    C: 'x32010', G: '320003', D: 'xx0232', A: 'x02220', E: '022100',
    Am: 'x02210', Em: '022000', Dm: 'xx0231', F: '133211', Bb: 'x13331',
    G7: '320001', E7: '020100', Am7: 'x02010', Dm7: 'xx0211', Cmaj7: 'x32000',
    'F#m': '244222', Bm: 'x24432', Bbm: 'x13321', 'C#m': 'x46654',
    Csus4: 'x33011', Dsus2: 'xx0230', 'C/G': '332010', 'D/F#': '200232',
    'Am/C': 'x32210'
  };
  for (const [symbol, frets] of Object.entries(expected)) {
    assert.strictEqual(asText(S.shapeFor(symbol)), frets, symbol);
  }
});

test('every shape it returns is playable and correct', () => {
  const roots = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];
  const suffixes = ['', 'm', '7', 'm7', 'maj7', 'sus4', 'sus2', '6', 'm6', 'dim', 'm7b5', 'add9', '9'];
  let checked = 0;

  for (const root of roots) {
    for (const suffix of suffixes) {
      const symbol = root + suffix;
      const shape = S.shapeFor(symbol);
      assert.ok(shape, 'no shape for ' + symbol);

      const frets = shape.frets;
      const sounding = frets.map((f, i) => [f, i]).filter(([f]) => f >= 0);
      assert.ok(sounding.length >= 3, symbol + ' too thin: ' + asText(shape));

      // at most one silenced string inside the chord (a finger leaning on it)
      const first = sounding[0][1], last = sounding[sounding.length - 1][1];
      let holes = 0;
      for (let i = first; i <= last; i++) if (frets[i] === -1) holes++;
      assert.ok(holes <= 1, symbol + ' leaves ' + holes + ' holes: ' + asText(shape));

      // reachable: at most four fingers, at most a four-fret span
      assert.ok(S.fingersNeeded(frets) <= 4, symbol + ' needs too many fingers: ' + asText(shape));
      const used = frets.filter((f) => f > 0);
      if (used.length) {
        assert.ok(Math.max(...used) - Math.min(...used) <= 3, symbol + ' stretches too far: ' + asText(shape));
      }

      // the bass note is the root (or the named bass note)
      const parsed = C.parseChord(symbol);
      const bass = (TUNING[first] + frets[first]) % 12;
      assert.strictEqual(bass, parsed.bass === null ? parsed.root : parsed.bass,
        symbol + ' has the wrong bass note: ' + asText(shape));

      // every note sounded belongs to the chord
      const tones = S.chordIntervals(parsed.suffix).tones.map((t) => (parsed.root + t) % 12);
      const allowed = parsed.bass === null ? tones : tones.concat(parsed.bass);
      for (const [fret, string] of sounding) {
        assert.ok(allowed.includes((TUNING[string] + fret) % 12),
          symbol + ' sounds a note outside the chord: ' + asText(shape));
      }
      checked++;
    }
  }
  assert.strictEqual(checked, roots.length * suffixes.length);
});

test('declines to invent a shape for a non-chord', () => {
  assert.strictEqual(S.shapeFor('Dominant'), null);
  assert.strictEqual(S.shapeFor(''), null);
});

test('handles slash chords, including ones whose bass is not a chord tone', () => {
  // Abm/Gb: the Gb is not part of Ab minor at all, so the search has to be
  // allowed to sound it. It used to come back empty.
  const shape = S.shapeFor('Abm/Gb');
  assert.ok(shape, 'no shape for Abm/Gb');
  const lowest = shape.frets.findIndex((f) => f >= 0);
  assert.strictEqual((TUNING[lowest] + shape.frets[lowest]) % 12, 6, 'Abm/Gb must sound a Gb bass');
  const played = shape.frets.map((f, i) => (f < 0 ? null : (TUNING[i] + f) % 12)).filter((p) => p !== null);
  assert.ok(played.includes(8), 'Abm/Gb must contain its root');
  assert.ok(played.includes(11), 'Abm/Gb must contain its minor third');

  // every inversion of every major and minor triad should be playable
  const roots = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];
  const names = C.SHARP_NAMES;
  let checked = 0;
  for (const root of roots) {
    for (const suffix of ['', 'm']) {
      const parsed = C.parseChord(root + suffix);
      const third = (parsed.root + (suffix === 'm' ? 3 : 4)) % 12;
      for (const bassPc of [third, (parsed.root + 7) % 12]) {
        const symbol = root + suffix + '/' + names[bassPc];
        const inversion = S.shapeFor(symbol);
        assert.ok(inversion, 'no shape for ' + symbol);
        const first = inversion.frets.findIndex((f) => f >= 0);
        assert.strictEqual((TUNING[first] + inversion.frets[first]) % 12, bassPc,
          symbol + ' has the wrong bass: ' + asText(inversion));
        checked++;
      }
    }
  }
  assert.strictEqual(checked, 48);
});

test('rates open chords as easier than barre chords', () => {
  const open = ['Em', 'E', 'A', 'Am', 'G', 'D', 'C', 'Dm'];
  const barre = ['F', 'Bb', 'Bm', 'C#m', 'Eb', 'Ab', 'F#m'];
  const hardest = Math.max(...open.map(S.difficulty));
  const easiest = Math.min(...barre.map(S.difficulty));
  assert.ok(hardest < easiest,
    `open chords should all be easier than every barre chord (${hardest} vs ${easiest})`);
  assert.strictEqual(S.difficulty('Em'), 0);
  assert.ok(S.difficulty('F') > 5);
});

test('finds the key that is kindest to the fretting hand', () => {
  // A song in Eb is four barre chords; somewhere there is a key with none.
  const inEb = { Eb: 12, Ab: 8, Bb: 8, Cm: 6 };
  const easy = S.easiestShift(inEb);
  assert.ok(easy, 'no suggestion for a song in Eb');
  assert.strictEqual(easy.hardChords, 0, 'should land on a key with no hard chords');

  const before = Object.entries(inEb).reduce((sum, [c, n]) => sum + S.difficulty(c) * n, 0);
  const after = Object.entries(inEb).reduce(
    (sum, [c, n]) => sum + S.difficulty(C.transposeChord(c, easy.steps, false)) * n, 0);
  assert.ok(after < before / 2, `should be much easier (${after} vs ${before})`);

  // Down is expressed as a capo where one is reachable; up only when it isn't.
  assert.ok(easy.steps >= -7 && easy.steps <= 4, 'transposition should stay capo-reachable');
});

test('leaves a song alone when there is nothing to gain', () => {
  // G Em C D is already four open chords: nowhere better to go.
  assert.strictEqual(S.easiestShift({ G: 8, Em: 6, C: 6, D: 8 }).steps, 0);
});

test('trades the F away, the way a guitarist would', () => {
  // C Am F G is three open chords and a barre. Down five — capo five to sound
  // the same — turns it into G Em C D.
  const easy = S.easiestShift({ C: 6, Am: 6, F: 4, G: 6 });
  assert.strictEqual(easy.steps, -5);
  assert.strictEqual(easy.hardChords, 0);
  const becomes = ['C', 'Am', 'F', 'G'].map((c) => C.transposeChord(c, easy.steps, false));
  assert.deepStrictEqual(becomes, ['G', 'Em', 'C', 'D']);
});

test('weighs a chord by how often it is played', () => {
  // C# and G cannot both be easy, so whichever is played more should win.
  const whenSharpDominates = S.easiestShift({ 'C#': 20, G: 1 }).steps;
  const whenGDominates = S.easiestShift({ 'C#': 1, G: 20 }).steps;

  const sharpCost = (steps) => S.difficulty(C.transposeChord('C#', steps, false));
  assert.ok(sharpCost(whenSharpDominates) < sharpCost(whenGDominates),
    'the chord played more often should end up the easier one');

  const gCost = (steps) => S.difficulty(C.transposeChord('G', steps, false));
  assert.ok(gCost(whenGDominates) < gCost(whenSharpDominates));

  assert.strictEqual(S.easiestShift({}), null);
});
