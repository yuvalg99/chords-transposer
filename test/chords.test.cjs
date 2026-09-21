const test = require('node:test');
const assert = require('node:assert');
const C = require('../src/core/chords.js');

test('parses chord symbols', () => {
  assert.deepStrictEqual(C.parseChord('D#m').root, 3);
  assert.deepStrictEqual(C.parseChord('Bb7').root, 10);
  assert.strictEqual(C.parseChord('C/G').bass, 7);
  assert.strictEqual(C.parseChord('F#m7b5').suffix, 'm7b5');
  assert.strictEqual(C.parseChord('  Am  ').root, 9);
});

test('rejects words that merely start with a note letter', () => {
  ['Cab', 'Dominant', 'Go', 'Bad', 'Field', 'Gone', 'Eye', 'Face', ''].forEach((word) => {
    assert.strictEqual(C.isChord(word), false, word + ' should not be a chord');
  });
});

test('transposes roots, suffixes and bass notes', () => {
  assert.strictEqual(C.transposeChord('D#m', 2, false), 'Fm');
  assert.strictEqual(C.transposeChord('Bb7', -1, true), 'A7');
  assert.strictEqual(C.transposeChord('F#m7b5', 3, true), 'Am7b5');
  assert.strictEqual(C.transposeChord('C/G', 5, false), 'F/C');
  assert.strictEqual(C.transposeChord('Csus4', 1, true), 'Dbsus4');
  assert.strictEqual(C.transposeChord('Amaj7', 2, false), 'Bmaj7');
});

test('wraps around the octave and keeps non-chords untouched', () => {
  assert.strictEqual(C.transposeChord('B', 1, false), 'C');
  assert.strictEqual(C.transposeChord('C', -1, false), 'B');
  assert.strictEqual(C.transposeChord('hello', 3, false), 'hello');
});

test('keeps unicode accidentals when the source uses them', () => {
  assert.strictEqual(C.transposeChord('B♭m', 1, false), 'Bm');
  assert.strictEqual(C.transposeChord('A', 1, true), 'B♭'.replace('♭', 'b'));
  assert.strictEqual(C.transposeChord('A♯', 1, false), 'B');
});

test('detects the key of a progression', () => {
  assert.strictEqual(C.detectKey(['D#m', 'A#m', 'G#m', 'Fm7b5', 'A#', 'D#m']).name, 'Ebm');
  assert.strictEqual(C.detectKey(['C', 'Am', 'F', 'G', 'C']).name, 'C');
  assert.strictEqual(C.detectKey(['Am', 'F', 'C', 'G', 'Am']).name, 'Am');
  assert.strictEqual(C.detectKey(['G', 'D', 'Em', 'C', 'G']).name, 'G');
  assert.strictEqual(C.detectKey([]), null);
});

test('spells accidentals to fit the target key', () => {
  const song = ['C', 'Am', 'F', 'G', 'C'];
  const key = C.detectKey(song);
  // C major up a semitone is Db major — a flat key.
  assert.strictEqual(C.spellingForTarget(song, key, 1, 'auto'), true);
  // C major up two semitones is D major — a sharp key.
  assert.strictEqual(C.spellingForTarget(song, key, 2, 'auto'), false);
  assert.strictEqual(C.spellingForTarget(song, key, 1, 'sharp'), false);
  assert.strictEqual(C.spellingForTarget(song, key, 2, 'flat'), true);
});

test('recognises chord lines but not lyric lines', () => {
  assert.strictEqual(C.looksLikeChordLine('Am      F      C      G'), true);
  assert.strictEqual(C.looksLikeChordLine('   D#m   A#m'), true);
  assert.strictEqual(C.looksLikeChordLine('the quick brown fox jumped'), false);
  assert.strictEqual(C.looksLikeChordLine('   '), false);
});

test('keeps chords in their columns when transposing a line', () => {
  const line = 'Am      F       C       G';
  const out = C.transposeChordLine(line, 2, false);
  assert.strictEqual(out, 'Bm      G       D       A');
  assert.strictEqual(out.indexOf('G'), line.indexOf('F'));

  // A chord that grows pushes the rest of the line right by the minimum needed.
  const tight = 'A B';
  assert.strictEqual(C.transposeChordLine(tight, 1, false), 'A# C');
});

test('round-trips back to the original spelling', () => {
  const chords = ['D#m', 'A#m', 'G#m', 'A#'];
  chords.forEach((c) => {
    const up = C.transposeChord(c, 5, false);
    assert.strictEqual(C.transposeChord(up, -5, false), c);
  });
});

test('simplifies chords down to plain triads', () => {
  const cases = {
    Fm7b5: 'Fm', Bmaj7: 'B', 'Abm/Gb': 'Abm', G7: 'G', Csus4: 'C',
    Dadd9: 'D', C9: 'C', Bdim7: 'Bm', Eaug: 'E', 'F#m7': 'F#m',
    C5: 'C', 'D/F#': 'D', Em7b5: 'Em'
  };
  for (const [from, to] of Object.entries(cases)) {
    assert.strictEqual(C.simplifyChord(from), to, from);
  }
});

test('leaves plain triads and non-chords alone', () => {
  ['C', 'Am', 'Bb', 'F#m', 'Ebm'].forEach((chord) => {
    assert.strictEqual(C.simplifyChord(chord), chord);
  });
  assert.strictEqual(C.simplifyChord('hello'), 'hello');
  assert.strictEqual(C.simplifyChord(''), '');
});

test('keeps the page spelling, and transposes the same either way', () => {
  assert.strictEqual(C.simplifyChord('Bbm7'), 'Bbm');   // not A#m
  assert.strictEqual(C.simplifyChord('A#m7'), 'A#m');
  // simplify-then-transpose must equal transpose-then-simplify
  ['Fm7b5', 'Bmaj7', 'Abm/Gb', 'G7', 'Csus4'].forEach((chord) => {
    const a = C.transposeChord(C.simplifyChord(chord), 3, false);
    const b = C.simplifyChord(C.transposeChord(chord, 3, false));
    assert.strictEqual(a, b, chord);
  });
});

test('simplifies a whole chord line in one pass, keeping columns', () => {
  const line = 'Fm7b5   Bbmaj7   Eb9     Abm/Gb';
  const out = C.transposeChordLine(line, 0, false, 0, true);
  assert.strictEqual(out, 'Fm      Bb       Eb      Abm');
  // every chord stays in the column it was printed in
  assert.strictEqual(out.indexOf('Bb'), line.indexOf('Bbmaj7'));
  assert.strictEqual(out.indexOf('Eb'), line.indexOf('Eb9'));
  assert.strictEqual(out.indexOf('Abm'), line.indexOf('Abm/Gb'));

  // simplifying and transposing together still holds the columns
  const moved = C.transposeChordLine(line, 2, true, 0, true);
  assert.strictEqual(moved.indexOf('C'), line.indexOf('Bbmaj7'));
  assert.strictEqual(moved.indexOf('F'), line.indexOf('Eb9'));
});
