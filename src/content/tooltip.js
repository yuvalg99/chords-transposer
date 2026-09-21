/*
 * The chord diagram that follows the cursor: an SVG fretboard drawn from the
 * voicing worked out in core/shapes.js, in its own shadow root so the host
 * page cannot style it and it cannot style the host page.
 */
(function (root) {
  'use strict';

  var CSS = [
    ':host { all: initial; }',
    '.tip {',
    '  position: fixed; z-index: 2147483001; pointer-events: none;',
    '  background: #1b1e2b; border: 1px solid #333a52; border-radius: 10px;',
    '  box-shadow: 0 8px 24px rgba(0,0,0,.4); padding: 4px;',
    '  opacity: 0; transition: opacity .12s; direction: ltr;',
    '}',
    '.tip.on { opacity: 1; }'
  ].join('\n');

  function Tooltip() {
    this.host = document.createElement('div');
    this.host.id = 'chords-transposer-tip';
    this.shadow = this.host.attachShadow({ mode: 'open' });
    var style = document.createElement('style');
    style.textContent = CSS;
    this.shadow.appendChild(style);
    this.box = document.createElement('div');
    this.box.className = 'tip';
    this.shadow.appendChild(this.box);
    this.mounted = false;
  }

  /** `anchor` is an element, or any rectangle in viewport coordinates. */
  Tooltip.prototype.show = function (anchor, symbol, options) {
    var Shapes = root.CTShapes, Diagram = root.CTDiagram;
    if (!Shapes || !Diagram) return false;
    var shape = Shapes.diagramFor(symbol);
    if (!shape) { this.hide(); return false; }

    this.mount();   // a re-rendering page can carry the host out of the document
    this.box.innerHTML = Diagram.svg(shape, options);

    var rect = anchor.getBoundingClientRect ? anchor.getBoundingClientRect() : anchor;
    var width = Diagram.WIDTH + 10, height = Diagram.HEIGHT + 10;
    var left = Math.round(rect.left + rect.width / 2 - width / 2);
    left = Math.max(4, Math.min(left, window.innerWidth - width - 4));
    // Above the chord by preference — below it, the diagram covers the lyric
    // line the chord sits over — and underneath only when there is no room
    // above, clamped so it stays on screen either way.
    var above = rect.top - height - 8;
    var top = above > 4 ? above : Math.min(rect.bottom + 8, window.innerHeight - height - 4);

    this.box.style.left = left + 'px';
    this.box.style.top = Math.round(top) + 'px';
    this.box.classList.add('on');
    return true;
  };

  /** Put the host in the page, or put it back if the page dropped it. */
  Tooltip.prototype.mount = function () {
    if (this.host.isConnected) return;
    (document.body || document.documentElement).appendChild(this.host);
    this.mounted = true;
  };

  Tooltip.prototype.isVisible = function () {
    return this.box.classList.contains('on');
  };

  Tooltip.prototype.hide = function () {
    this.box.classList.remove('on');
  };

  Tooltip.prototype.destroy = function () {
    if (this.host.parentNode) this.host.parentNode.removeChild(this.host);
    this.mounted = false;
  };

  root.CTTooltip = Tooltip;
})(typeof globalThis !== 'undefined' ? globalThis : this);
