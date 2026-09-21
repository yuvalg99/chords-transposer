/*
 * Hearing a chord: the voicing from core/shapes.js, plucked.
 *
 * Each string is synthesised with Karplus-Strong — a burst of noise fed
 * through a short delay line that loses a little on every pass. It is a few
 * lines of arithmetic and sounds far more like a plucked string than an
 * oscillator does, and it ships nothing: no samples, no files, no network.
 */
(function (root) {
  'use strict';

  // Open strings of a guitar in standard tuning, in hertz.
  var OPEN_STRINGS = [82.41, 110.00, 146.83, 196.00, 246.94, 329.63];

  var STRUM = 0.028;        // seconds between one string and the next
  var LENGTH = 2.1;         // seconds of sound per string
  var DAMPING = 0.9965;     // how much a string loses on each pass
  var MASTER = 0.16;        // overall level: audible, never startling

  var context = null;
  var current = null;       // gain node of whatever is sounding now
  var buffers = new Map();

  function audioContext() {
    if (!context) {
      var Ctor = root.AudioContext || root.webkitAudioContext;
      if (!Ctor) return null;
      context = new Ctor();
    }
    if (context.state === 'suspended') context.resume();
    return context;
  }

  /** One plucked string, as a sound buffer. */
  function pluck(ctx, frequency) {
    var key = Math.round(frequency * 4);
    if (buffers.has(key)) return buffers.get(key);

    var rate = ctx.sampleRate;
    var samples = Math.floor(rate * LENGTH);
    var buffer = ctx.createBuffer(1, samples, rate);
    var out = buffer.getChannelData(0);

    var period = Math.max(2, Math.round(rate / frequency));
    var line = new Float32Array(period);
    for (var i = 0; i < period; i++) line[i] = Math.random() * 2 - 1;
    // Soften the initial noise, or the attack is all fizz.
    for (var j = 1; j < period; j++) line[j] = (line[j] + line[j - 1]) * 0.5;

    var index = 0, previous = 0;
    var fadeFrom = Math.floor(samples * 0.82);
    for (var n = 0; n < samples; n++) {
      var value = line[index];
      line[index] = (value + previous) * 0.5 * DAMPING;   // lose a little each pass
      previous = value;
      // Fade the tail, so a note that is still ringing does not end in a click.
      out[n] = n < fadeFrom ? value : value * (1 - (n - fadeFrom) / (samples - fadeFrom));
      index = (index + 1) % period;
    }

    if (buffers.size > 48) buffers.clear();
    buffers.set(key, buffer);
    return buffer;
  }

  /** Strum a shape: { frets: [...] }, -1 for a string that stays silent. */
  function play(shape) {
    if (!shape || !shape.frets) return false;
    var ctx = audioContext();
    if (!ctx) return false;

    // Let go of whatever is still ringing, gently.
    if (current) {
      var fading = current;
      fading.gain.setTargetAtTime(0, ctx.currentTime, 0.02);
      setTimeout(function () { try { fading.disconnect(); } catch (e) { /* gone */ } }, 300);
    }

    var master = ctx.createGain();
    master.gain.value = MASTER;
    master.connect(ctx.destination);
    current = master;

    var order = 0;
    shape.frets.forEach(function (fret, string) {
      if (fret < 0) return;
      var frequency = OPEN_STRINGS[string] * Math.pow(2, fret / 12);
      var source = ctx.createBufferSource();
      source.buffer = pluck(ctx, frequency);
      var voice = ctx.createGain();
      // Lower strings a touch quieter, the way a real strum sits.
      voice.gain.value = 0.85 - string * 0.04;
      source.connect(voice).connect(master);
      source.start(ctx.currentTime + order * STRUM);
      order++;
    });
    return order > 0;
  }

  root.CTAudio = { play: play };
})(typeof globalThis !== 'undefined' ? globalThis : this);
