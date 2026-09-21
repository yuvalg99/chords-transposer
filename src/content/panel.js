/*
 * Floating control panel, rendered inside a shadow root so the host page's
 * CSS (and ours) stay out of each other's way.
 */
(function (root) {
  'use strict';

  var CSS = [
    ':host { all: initial; }',
    '*, *::before, *::after { box-sizing: border-box; }',
    '.wrap {',
    '  position: fixed; z-index: 2147483000; direction: ltr;',
    '  font: 13px/1.35 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif;',
    '  color: #e8eaf2; background: #1b1e2b; border: 1px solid #333a52;',
    '  border-radius: 12px; box-shadow: 0 10px 30px rgba(0,0,0,.35);',
    '  width: 240px; user-select: none; overflow: hidden;',
    '}',
    '.wrap.collapsed { width: auto; }',
    '.head { display: flex; align-items: center; gap: 6px; padding: 7px 8px 7px 10px;',
    '  background: #232739; cursor: grab; }',
    '.head.dragging { cursor: grabbing; }',
    '.title { flex: 1; font-size: 11px; letter-spacing: .04em; text-transform: uppercase;',
    '  color: #9aa3c0; white-space: nowrap; overflow: hidden; }',
    '.iconbtn { width: 20px; height: 20px; display: grid; place-items: center; border: 0; border-radius: 6px;',
    '  background: transparent; color: #9aa3c0; cursor: pointer; font-size: 14px; line-height: 1; padding: 0; }',
    '.iconbtn:hover { background: #333a52; color: #fff; }',
    '.iconbtn.on { color: #8ee0b0; }',
    '.body { padding: 10px; }',
    '.stepper { display: flex; align-items: center; gap: 8px; }',
    '.step { flex: 0 0 44px; height: 40px; border: 1px solid #3a4260; background: #2a3050; color: #fff;',
    '  border-radius: 9px; font-size: 20px; cursor: pointer; }',
    '.step:hover { background: #38406a; }',
    '.step:active { transform: translateY(1px); }',
    '.amount { flex: 1; text-align: center; }',
    '.amount b { display: block; font-size: 20px; font-variant-numeric: tabular-nums; }',
    '.amount span { font-size: 10px; color: #8b93b0; text-transform: uppercase; letter-spacing: .05em; }',
    '.keys { margin-top: 9px; display: flex; align-items: center; justify-content: center; gap: 6px;',
    '  background: #232739; border-radius: 8px; padding: 6px; font-size: 13px; }',
    '.keys .from { color: #8b93b0; }',
    '.keys select { background: #2a3050; color: #8ee0b0; border: 1px solid #3a4260; border-radius: 6px;',
    '  font: inherit; font-weight: 700; padding: 1px 4px; cursor: pointer; }',
    '.meta { margin-top: 7px; font-size: 11px; color: #8b93b0; text-align: center; min-height: 14px; }',
    '.countbtn { background: transparent; border: 0; color: #8b93b0; font: inherit; cursor: pointer;',
    '  padding: 0; text-decoration: underline dotted #4b5477; text-underline-offset: 3px; }',
    '.countbtn:hover { color: #cfd4e6; }',
    '.strip { display: none; grid-template-columns: repeat(3, 1fr); gap: 2px;',
    '  padding: 6px 4px 10px; background: #171a26; border-top: 1px solid #2a3145;',
    '  max-height: 216px; overflow-y: auto; }',
    '.strip.open { display: grid; }',
    '.capolist { display: none; padding: 6px 8px 10px; background: #171a26;',
    '  border-top: 1px solid #2a3145; }',
    '.capolist.open { display: block; }',
    '.caporow { display: flex; align-items: center; gap: 7px; width: 100%; border: 0;',
    '  background: transparent; color: #9aa3c0; font: inherit; padding: 4px 5px;',
    '  border-radius: 6px; cursor: pointer; text-align: left; }',
    '.caporow:hover { background: #232739; color: #e8eaf2; }',
    '.caporow.on { background: #2f3a63; color: #fff; }',
    '.capon { width: 50px; font-variant-numeric: tabular-nums; }',
    '.capokey { width: 42px; font-weight: 700; color: #cfd4e6; }',
    '.caporow.best .capokey { color: #8ee0b0; }',
    '.bar { flex: 1; height: 6px; border-radius: 3px; background: #262b3f; overflow: hidden; }',
    '.bar i { display: block; height: 100%; border-radius: 3px; }',
    '.capohint { font-size: 10px; color: #6f7794; text-align: center; padding: 6px 4px 0; }',
    '.strip .chip { display: flex; align-items: center; justify-content: center;',
    '  border-radius: 8px; cursor: pointer; }',
    '.strip .chip:hover { background: #222739; }',
    '.strip .chip svg { display: block; }',
    '.strip .noshape { font-size: 11px; color: #6f7794; padding: 22px 0; text-align: center; }',
    '.row { margin-top: 9px; display: flex; gap: 6px; }',
    '.seg { display: flex; flex: 1; border: 1px solid #3a4260; border-radius: 8px; overflow: hidden; }',
    '.seg button { flex: 1; border: 0; background: #232739; color: #9aa3c0; font: inherit; padding: 5px 0; cursor: pointer; }',
    '.seg button.on { background: #4655a8; color: #fff; }',
    '.btn { border: 1px solid #3a4260; background: #232739; color: #9aa3c0; border-radius: 8px;',
    '  font: inherit; padding: 5px 9px; cursor: pointer; white-space: nowrap; }',
    '.btn:hover { background: #333a52; color: #fff; }',
    '.btn.easy { color: #8ee0b0; border-color: #35543f; }',
    '.btn.easy.on { background: #2f5a43; color: #cfeedd; border-color: #2f5a43; }',
    '.btn.easy:disabled { opacity: .4; cursor: default; }',
    '.hint { margin-top: 8px; font-size: 10px; color: #6f7794; text-align: center; }',
    '.simplify { margin-top: 6px; width: 100%; }',
    '.simplify.on { background: #2f5a43; color: #cfeedd; border-color: #2f5a43; }',
    '.scrollrow { margin-top: 8px; display: flex; align-items: center; gap: 8px; }',
    '.play { width: 38px; flex: 0 0 38px; text-align: center; }',
    '.play.on { background: #2f5a43; color: #cfeedd; border-color: #2f5a43; }',
    '.speed { flex: 1; min-width: 0; height: 4px; -webkit-appearance: none; appearance: none;',
    '  background: #333a52; border-radius: 2px; cursor: pointer; }',
    '.speed::-webkit-slider-thumb { -webkit-appearance: none; width: 13px; height: 13px;',
    '  border-radius: 50%; background: #8ee0b0; cursor: pointer; }',
    '.speedval { width: 34px; font-size: 10px; color: #6f7794; text-align: right;',
    '  font-variant-numeric: tabular-nums; }',
    '.pill { display: flex; align-items: center; gap: 7px; padding: 7px 11px; cursor: grab; }',
    '.pill b { font-size: 14px; font-variant-numeric: tabular-nums; }',
    '.pill span { font-size: 11px; color: #9aa3c0; }',
    '.hidden { display: none !important; }'
  ].join('\n');

  var KEY_CHOICES = ['C', 'C#/Db', 'D', 'D#/Eb', 'E', 'F', 'F#/Gb', 'G', 'G#/Ab', 'A', 'A#/Bb', 'B'];

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  function Panel(handlers) {
    this.h = handlers;
    this.collapsed = false;
    this.build();
  }

  Panel.prototype.build = function () {
    this.host = document.createElement('div');
    this.host.id = 'chords-transposer-root';
    this.shadow = this.host.attachShadow({ mode: 'open' });

    var style = document.createElement('style');
    style.textContent = CSS;
    this.shadow.appendChild(style);

    var wrap = el('div', 'wrap');
    this.wrap = wrap;

    // --- collapsed pill
    var pill = el('div', 'pill hidden');
    this.pillValue = el('b', null, '0');
    pill.appendChild(el('span', null, '♯'));
    pill.appendChild(this.pillValue);
    pill.addEventListener('click', this.toggleCollapsed.bind(this));
    this.pill = pill;

    // --- header
    var head = el('div', 'head');
    head.appendChild(el('div', 'title', 'Chords Transposer'));
    this.soundBtn = el('button', 'iconbtn', '♪');
    this.soundBtn.title = 'Click a chord to hear it';
    this.soundBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      this.h.onSound();
    }.bind(this));
    head.appendChild(this.soundBtn);

    this.diagramsBtn = el('button', 'iconbtn', '▦');
    this.diagramsBtn.title = 'Chord diagrams on hover';
    this.diagramsBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      this.h.onDiagrams();
    }.bind(this));
    head.appendChild(this.diagramsBtn);

    var minBtn = el('button', 'iconbtn', '–');
    minBtn.title = 'Minimise';
    minBtn.addEventListener('click', this.toggleCollapsed.bind(this));
    var closeBtn = el('button', 'iconbtn', '×');
    closeBtn.title = 'Hide (reopen from the toolbar icon)';
    closeBtn.addEventListener('click', function (e) { e.stopPropagation(); this.h.onClose(); }.bind(this));
    head.appendChild(minBtn);
    head.appendChild(closeBtn);
    this.head = head;

    // --- body
    var body = el('div', 'body');

    var stepper = el('div', 'stepper');
    var down = el('button', 'step', '−');
    down.title = 'Down a semitone (Alt+Shift+↓)';
    down.addEventListener('click', function () { this.h.onStep(-1); }.bind(this));
    var up = el('button', 'step', '+');
    up.title = 'Up a semitone (Alt+Shift+↑)';
    up.addEventListener('click', function () { this.h.onStep(1); }.bind(this));
    var amount = el('div', 'amount');
    this.amountValue = el('b', null, '0');
    amount.appendChild(this.amountValue);
    amount.appendChild(el('span', null, 'semitones'));
    stepper.appendChild(down);
    stepper.appendChild(amount);
    stepper.appendChild(up);
    body.appendChild(stepper);

    var keys = el('div', 'keys');
    this.keyFrom = el('span', 'from', '—');
    keys.appendChild(this.keyFrom);
    keys.appendChild(el('span', 'arrow', '→'));
    this.keySelect = document.createElement('select');
    this.keySelect.title = 'Jump straight to a key';
    this.keySelect.addEventListener('change', function () {
      this.h.onSetKey(parseInt(this.keySelect.value, 10));
    }.bind(this));
    keys.appendChild(this.keySelect);
    body.appendChild(keys);

    this.meta = el('div', 'meta');
    this.countBtn = el('button', 'countbtn');
    this.countBtn.addEventListener('click', function () { this.h.onToggleSection('chords'); }.bind(this));
    this.capoBtn = el('button', 'countbtn');
    this.capoBtn.addEventListener('click', function () { this.h.onToggleSection('capo'); }.bind(this));
    this.meta.appendChild(this.countBtn);
    this.metaSep = el('span', 'metasep', ' · ');
    this.meta.appendChild(this.metaSep);
    this.meta.appendChild(this.capoBtn);
    body.appendChild(this.meta);

    var row = el('div', 'row');
    var seg = el('div', 'seg');
    this.segButtons = {};
    [['auto', 'Auto'], ['sharp', '♯'], ['flat', '♭']].forEach(function (opt) {
      var b = el('button', null, opt[1]);
      b.title = opt[0] === 'auto' ? 'Spell accidentals to fit the new key' : 'Always use ' + opt[1];
      b.addEventListener('click', function () { this.h.onAccidental(opt[0]); }.bind(this));
      this.segButtons[opt[0]] = b;
      seg.appendChild(b);
    }, this);
    row.appendChild(seg);

    this.easyBtn = el('button', 'btn easy', 'Easy');
    this.easyBtn.addEventListener('click', function () { this.h.onEasy(); }.bind(this));
    row.appendChild(this.easyBtn);

    var reset = el('button', 'btn reset', 'Reset');
    reset.addEventListener('click', function () { this.h.onReset(); }.bind(this));
    row.appendChild(reset);
    body.appendChild(row);

    this.simplifyBtn = el('button', 'btn simplify', 'Simplify chords');
    this.simplifyBtn.addEventListener('click', function () { this.h.onSimplify(); }.bind(this));
    body.appendChild(this.simplifyBtn);

    // Auto-scroll: hands stay on the guitar.
    var scrollRow = el('div', 'row scrollrow');
    this.playBtn = el('button', 'btn play', '▶');
    this.playBtn.addEventListener('click', function () { this.h.onScroll(); }.bind(this));
    this.speed = document.createElement('input');
    this.speed.type = 'range';
    this.speed.className = 'speed';
    this.speed.min = '8';
    this.speed.max = '120';
    this.speed.step = '2';
    this.speed.title = 'Scrolling speed';
    this.speed.addEventListener('input', function () {
      this.h.onSpeed(parseInt(this.speed.value, 10));
    }.bind(this));
    this.speedVal = el('span', 'speedval');
    scrollRow.appendChild(this.playBtn);
    scrollRow.appendChild(this.speed);
    scrollRow.appendChild(this.speedVal);
    body.appendChild(scrollRow);

    this.hint = el('div', 'hint', 'Alt+Shift+↑ / ↓ · Alt+Shift+0');
    body.appendChild(this.hint);
    this.body = body;

    // Two drawers under the controls: the song's chord shapes, and where to
    // put a capo. One at a time, or the panel becomes a wall.
    this.strip = el('div', 'strip');
    this.capoList = el('div', 'capolist');

    wrap.appendChild(pill);
    wrap.appendChild(head);
    wrap.appendChild(body);
    wrap.appendChild(this.strip);
    wrap.appendChild(this.capoList);
    this.shadow.appendChild(wrap);

    this.makeDraggable(head);
    this.makeDraggable(pill);
  };

  Panel.prototype.mount = function (position) {
    (document.body || document.documentElement).appendChild(this.host);
    this.setPosition(position || { left: 16, bottom: 16 });
  };

  Panel.prototype.setPosition = function (pos) {
    var w = this.wrap.style;
    if (pos.top != null) { w.top = pos.top + 'px'; w.bottom = 'auto'; }
    else { w.bottom = (pos.bottom != null ? pos.bottom : 16) + 'px'; w.top = 'auto'; }
    w.left = (pos.left != null ? pos.left : 16) + 'px';
    w.right = 'auto';
    this.position = pos;
  };

  Panel.prototype.makeDraggable = function (handle) {
    var self = this;
    handle.addEventListener('pointerdown', function (e) {
      if (e.target.classList && e.target.classList.contains('iconbtn')) return;
      var rect = self.wrap.getBoundingClientRect();
      var dx = e.clientX - rect.left;
      var dy = e.clientY - rect.top;
      handle.classList.add('dragging');
      handle.setPointerCapture(e.pointerId);

      function move(ev) {
        var left = Math.min(Math.max(0, ev.clientX - dx), window.innerWidth - rect.width);
        var top = Math.min(Math.max(0, ev.clientY - dy), window.innerHeight - rect.height);
        self.setPosition({ left: Math.round(left), top: Math.round(top) });
      }
      function up(ev) {
        handle.classList.remove('dragging');
        handle.releasePointerCapture(ev.pointerId);
        handle.removeEventListener('pointermove', move);
        handle.removeEventListener('pointerup', up);
        self.h.onMove(self.position);
      }
      handle.addEventListener('pointermove', move);
      handle.addEventListener('pointerup', up);
    });
  };

  Panel.prototype.toggleCollapsed = function () {
    this.collapsed = !this.collapsed;
    this.wrap.classList.toggle('collapsed', this.collapsed);
    this.head.classList.toggle('hidden', this.collapsed);
    this.body.classList.toggle('hidden', this.collapsed);
    this.pill.classList.toggle('hidden', !this.collapsed);
    this.h.onCollapse(this.collapsed);
  };

  Panel.prototype.setCollapsed = function (collapsed) {
    if (collapsed !== this.collapsed) this.toggleCollapsed();
  };

  Panel.prototype.setVisible = function (visible) {
    this.host.style.display = visible ? '' : 'none';
  };

  /**
   * state: { steps, accidental, keyFrom, keyTo, targetPc, capo, count, stale }
   */
  Panel.prototype.update = function (state) {
    var label = (state.steps > 0 ? '+' : '') + state.steps;
    this.amountValue.textContent = label;
    this.pillValue.textContent = label;

    this.keyFrom.textContent = state.keyFrom || '—';

    // Rebuild the key dropdown so it shows the pitch classes relative to the song.
    var minor = state.minor;
    var options = '';
    for (var i = 0; i < 12; i++) {
      var pc = root.CTChords.mod12(state.basePc + i);
      var name = root.CTChords.keyName(pc, minor);
      var steps = ((i + 6) % 12) - 6; // -5..+6 around the original key
      options += '<option value="' + steps + '">' + name + '</option>';
    }
    if (this.keySelect.dataset.base !== String(state.basePc) + minor) {
      this.keySelect.innerHTML = options;
      this.keySelect.dataset.base = String(state.basePc) + minor;
    }
    this.keySelect.value = String(((state.steps + 6) % 12 + 12) % 12 - 6);
    this.keySelect.style.visibility = state.keyFrom ? 'visible' : 'hidden';

    // Both handles live in the meta line, so they stay put whether or not the
    // song is transposed.
    var showing = state.openSection;
    this.countBtn.textContent = state.count
      ? state.count + ' chords ' + (showing === 'chords' ? '▴' : '▾') : '';
    this.countBtn.style.display = state.count ? '' : 'none';
    this.metaSep.style.display = state.count ? '' : 'none';
    this.countBtn.title = showing === 'chords'
      ? 'Hide the chord shapes' : 'Show every chord in this song';

    this.capoBtn.textContent = (state.steps < 0 ? 'capo ' + (-state.steps) : 'capo') +
      (showing === 'capo' ? ' ▴' : ' ▾');
    this.capoBtn.title = 'Where to put a capo to keep the original pitch';

    this.simplifyBtn.classList.toggle('on', !!state.simplify);
    this.simplifyBtn.title = state.simplify
      ? 'Showing plain triads — click for the chords as written'
      : 'Reduce every chord to a plain major or minor triad';

    this.playBtn.textContent = state.scrolling ? '❙❙' : '▶';
    this.playBtn.classList.toggle('on', !!state.scrolling);
    this.playBtn.title = state.scrolling ? 'Stop scrolling (Alt+Shift+Space)'
                                         : 'Scroll the page while you play (Alt+Shift+Space)';
    if (document.activeElement !== this.speed) this.speed.value = String(state.speed);
    this.speedVal.textContent = state.speed + '/s';

    this.renderStrip(state.chords, showing === 'chords');
    this.renderCapo(state.capo, showing === 'capo');

    this.diagramsBtn.classList.toggle('on', !!state.diagrams);
    this.soundBtn.classList.toggle('on', !!state.sound);
    this.soundBtn.title = state.sound
      ? 'Click a chord to hear it — click here for silence'
      : 'Turn chord sounds on';

    var easy = state.easiest;
    this.easyBtn.disabled = !easy;
    this.easyBtn.classList.toggle('on', !!easy && easy.steps === state.steps);
    this.easyBtn.title = easy
      ? (easy.steps === state.steps
          ? 'These are the easiest shapes for this song'
          : 'Easiest to play: ' + easy.label)
      : 'Working out the easiest key...';

    Object.keys(this.segButtons).forEach(function (k) {
      this.segButtons[k].classList.toggle('on', k === state.accidental);
    }, this);
  };

  /** items: [{ name, svg }] — already rendered markup, or null if unplayable. */
  Panel.prototype.renderStrip = function (items, open) {
    this.strip.classList.toggle('open', open);
    if (!open || !items) return;

    var signature = items.map(function (item) { return item.name; }).join(' ');
    if (this.strip.dataset.signature === signature) return;   // nothing changed
    this.strip.dataset.signature = signature;
    this.strip.textContent = '';

    items.forEach(function (item) {
      var chip = el('div', 'chip');
      if (item.svg) chip.innerHTML = item.svg;
      else chip.appendChild(el('div', 'noshape', item.name));
      chip.title = 'Hear ' + item.name;
      chip.addEventListener('click', function () { this.h.onPlay(item.name); }.bind(this));
      this.strip.appendChild(chip);
    }, this);
  };

  /**
   * options: [{ capo, steps, key, score, hard, best, current }] — one row per
   * capo position, with a bar showing what the shapes cost to play.
   */
  Panel.prototype.renderCapo = function (options, open) {
    this.capoList.classList.toggle('open', open);
    if (!open || !options) return;

    this.capoList.textContent = '';
    options.forEach(function (option) {
      var row = el('button', 'caporow' + (option.current ? ' on' : '') + (option.best ? ' best' : ''));
      row.appendChild(el('span', 'capon', option.capo === 0 ? 'no capo' : 'capo ' + option.capo));
      row.appendChild(el('span', 'capokey', option.key));

      // Effort as a bar: green is a song of open chords, red is a wall of barres.
      var bar = el('span', 'bar');
      var fill = el('i');
      var share = Math.max(0.06, Math.min(1, option.score / 6));
      fill.style.width = Math.round(share * 100) + '%';
      fill.style.background = option.score < 2 ? '#5fc48a' : (option.score < 3.6 ? '#d9b24c' : '#d4685f');
      bar.appendChild(fill);
      row.appendChild(bar);

      row.title = (option.hard
        ? option.hard + ' hard chord' + (option.hard === 1 ? '' : 's') + ' to play'
        : 'no hard chords') + ' — ' + option.key + ' shapes';
      row.addEventListener('click', function () { this.h.onCapo(option.steps); }.bind(this));
      this.capoList.appendChild(row);
    }, this);

    this.capoList.appendChild(el('div', 'capohint', 'every row sounds like the original'));
  };

  Panel.prototype.destroy = function () {
    if (this.host && this.host.parentNode) this.host.parentNode.removeChild(this.host);
  };

  root.CTPanel = Panel;
})(typeof globalThis !== 'undefined' ? globalThis : this);
