// Teaching cover: a semicircular contour-integration path (the classic
// diagram for evaluating real integrals by residues) that draws itself,
// holds, fades, and loops. One pole sits on the imaginary axis; another
// sits on the real axis and is avoided with a small indentation arc.
(function () {
  var canvas = document.querySelector('.contour-canvas');
  var cover = canvas && canvas.closest('.cover-panel');
  if (!canvas || !cover || !canvas.getContext) return;
  var ctx = canvas.getContext('2d');

  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  var DRAW_DURATION = 3.0;   // sec to trace the full contour
  var HOLD_DURATION = 1.1;   // sec fully drawn before fading
  var FADE_DURATION = 0.7;   // sec fading out
  var PAUSE_DURATION = 0.6;  // sec blank before the next pass

  var ARC_STEPS = 56;                 // resolution of the sampled outer semicircle
  var INDENT_STEPS = 16;              // resolution of the small avoiding arc
  var INDENT_RADIUS = 0.07;           // unit space; how wide a berth the indentation gives the real-axis pole
  var POLE_RED = '#c0392b';

  // Two poles, both directly on an axis (|p| < 1). POLE_IM is enclosed by
  // the arc; POLE_REAL sits on the contour's real-axis leg, so the path
  // detours around it with a small semicircular indentation instead of
  // passing through it.
  var POLE_IM = { x: 0, y: 0.42, color: 'red' };
  var POLE_REAL = { x: 0.55, y: 0, color: 'red' };
  var POLES = [POLE_IM, POLE_REAL];

  // The contour: diameter along the real axis, indenting up and over
  // POLE_REAL, then the big counterclockwise arc back to the start.
  var segments = [
    { type: 'line', a: { x: -1, y: 0 }, b: { x: POLE_REAL.x - INDENT_RADIUS, y: 0 } },
    { type: 'arc', cx: POLE_REAL.x, cy: 0, r: INDENT_RADIUS, a0: Math.PI, a1: 0, steps: INDENT_STEPS },
    { type: 'line', a: { x: POLE_REAL.x + INDENT_RADIUS, y: 0 }, b: { x: 1, y: 0 } },
    { type: 'arc', cx: 0, cy: 0, r: 1, a0: 0, a1: Math.PI, steps: ARC_STEPS }
  ];
  segments.forEach(function (seg) {
    seg.length = seg.type === 'line'
      ? Math.hypot(seg.b.x - seg.a.x, seg.b.y - seg.a.y)
      : seg.r * Math.abs(seg.a1 - seg.a0);
  });
  var pathLength = segments.reduce(function (s, seg) { return s + seg.length; }, 0);

  function segmentPointAt(seg, local) {
    if (seg.type === 'line') {
      return { x: seg.a.x + (seg.b.x - seg.a.x) * local, y: seg.a.y + (seg.b.y - seg.a.y) * local };
    }
    var a = seg.a0 + (seg.a1 - seg.a0) * local;
    return { x: seg.cx + seg.r * Math.cos(a), y: seg.cy + seg.r * Math.sin(a) };
  }

  var cw = 0, ch = 0, dpr = 1;
  var cx = 0, cy = 0, Rpx = 1;
  var colors = { axis: '#78766b', pole: '#a8540f', path: '#3f6e6a' };

  var phase = 'draw', timer = 0, progress = 0, pathAlpha = 1;
  var lastT = null;

  function hexToRgb(hex) {
    var m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec((hex || '').trim());
    if (!m) return { r: 130, g: 130, b: 130 };
    return { r: parseInt(m[1], 16), g: parseInt(m[2], 16), b: parseInt(m[3], 16) };
  }

  function readColors() {
    var s = getComputedStyle(document.documentElement);
    colors = {
      axis: (s.getPropertyValue('--muted') || '#78766b').trim(),
      pole: (s.getPropertyValue('--accent') || '#a8540f').trim(),
      path: (s.getPropertyValue('--accent-soft') || '#3f6e6a').trim()
    };
  }

  function toScreen(x, y) { return { x: cx + x * Rpx, y: cy - y * Rpx }; }

  function resize() {
    var rect = cover.getBoundingClientRect();
    cw = Math.max(1, Math.round(rect.width));
    ch = Math.max(1, Math.round(rect.height));
    dpr = Math.max(1, window.devicePixelRatio || 1);
    canvas.width = Math.round(cw * dpr);
    canvas.height = Math.round(ch * dpr);
    canvas.style.width = cw + 'px';
    canvas.style.height = ch + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    cx = cw * 0.7;

    // Line the real axis up with the bottom of the "Teaching" heading,
    // measured directly rather than guessed as a fraction of panel height.
    var h1 = cover.querySelector('h1');
    cy = ch * 0.62;
    if (h1) {
      var hr = h1.getBoundingClientRect();
      if (hr.height > 0) cy = hr.bottom - rect.top;
    }

    Rpx = Math.max(20, Math.min(cw * 0.24, cy * 0.78, (cw - cx) / 1.3));
  }

  function drawAxes(rc) {
    var reach = Rpx * 1.2;
    ctx.strokeStyle = 'rgba(' + rc.r + ',' + rc.g + ',' + rc.b + ',0.45)';
    ctx.lineWidth = 1;

    // real axis
    ctx.beginPath();
    ctx.moveTo(cx - reach, cy);
    ctx.lineTo(cx + reach, cy);
    ctx.stroke();

    // imaginary axis
    ctx.beginPath();
    ctx.moveTo(cx, cy + reach * 0.22);
    ctx.lineTo(cx, cy - reach);
    ctx.stroke();

    ctx.fillStyle = ctx.strokeStyle;
    arrowhead(cx + reach, cy, 0);
    arrowhead(cx, cy - reach, -Math.PI / 2);

    ctx.font = '11px "IBM Plex Mono", ui-monospace, monospace';
    ctx.fillText('Re', cx + reach - 16, cy - 7);
    ctx.fillText('Im', cx + 7, cy - reach + 13);
  }

  function arrowhead(x, y, angle) {
    var s = 5;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(-s * 1.6, -s * 0.7);
    ctx.lineTo(-s * 1.6, s * 0.7);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  function drawGrid(rc) {
    var cell = 22;
    ctx.strokeStyle = 'rgba(' + rc.r + ',' + rc.g + ',' + rc.b + ',0.09)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (var x = 0; x <= cw; x += cell) { ctx.moveTo(x + 0.5, 0); ctx.lineTo(x + 0.5, ch); }
    for (var y = 0; y <= ch; y += cell) { ctx.moveTo(0, y + 0.5); ctx.lineTo(cw, y + 0.5); }
    ctx.stroke();
  }

  function drawPoles(pc, rd) {
    POLES.forEach(function (p) {
      var s = toScreen(p.x, p.y);
      var r = 4;
      var c = p.color === 'red' ? rd : pc;
      ctx.strokeStyle = 'rgba(' + c.r + ',' + c.g + ',' + c.b + ',0.9)';
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(s.x - r, s.y - r); ctx.lineTo(s.x + r, s.y + r);
      ctx.moveTo(s.x + r, s.y - r); ctx.lineTo(s.x - r, s.y + r);
      ctx.stroke();
    });
  }

  // The path is a diameter along the real axis, indented around POLE_REAL,
  // followed by a counterclockwise semicircular arc back to the start —
  // the standard contour for evaluating real integrals by residues, with
  // a principal-value-style detour around the pole sitting on the axis.
  function drawContour(pc, upTo, alpha) {
    var start = toScreen(segmentPointAt(segments[0], 0).x, segmentPointAt(segments[0], 0).y);
    ctx.strokeStyle = 'rgba(' + pc.r + ',' + pc.g + ',' + pc.b + ',' + (0.85 * alpha).toFixed(3) + ')';
    ctx.lineWidth = 2;
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(start.x, start.y);

    var acc = 0, tip = segmentPointAt(segments[0], 0);
    for (var i = 0; i < segments.length; i++) {
      var seg = segments[i];
      var segStart = acc, segEnd = acc + seg.length / pathLength;
      if (upTo <= segStart) break;
      var localUpTo = upTo >= segEnd ? 1 : (upTo - segStart) / (segEnd - segStart);

      if (seg.type === 'arc') {
        var steps = Math.max(1, Math.round(seg.steps * localUpTo));
        for (var k = 1; k <= steps; k++) {
          tip = segmentPointAt(seg, (k / steps) * localUpTo);
          var sp = toScreen(tip.x, tip.y);
          ctx.lineTo(sp.x, sp.y);
        }
      } else {
        tip = segmentPointAt(seg, localUpTo);
        var lp = toScreen(tip.x, tip.y);
        ctx.lineTo(lp.x, lp.y);
      }

      acc = segEnd;
      if (upTo < segEnd) break;
    }
    ctx.stroke();
    return tip;
  }

  function render() {
    ctx.clearRect(0, 0, cw, ch);
    var rc = hexToRgb(colors.axis), pc = hexToRgb(colors.pole), lc = hexToRgb(colors.path), rd = hexToRgb(POLE_RED);

    drawGrid(rc);
    drawAxes(rc);
    drawPoles(pc, rd);

    if (progress > 0 && pathAlpha > 0) {
      var tip = drawContour(lc, progress, pathAlpha);
      if (phase === 'draw') {
        var ts = toScreen(tip.x, tip.y);
        ctx.fillStyle = 'rgba(' + lc.r + ',' + lc.g + ',' + lc.b + ',' + (0.9 * pathAlpha).toFixed(3) + ')';
        ctx.beginPath();
        ctx.arc(ts.x, ts.y, 3.4, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  function step(dt) {
    timer += dt;
    if (phase === 'draw') {
      progress = Math.min(1, timer / DRAW_DURATION);
      pathAlpha = 1;
      if (timer >= DRAW_DURATION) { phase = 'hold'; timer = 0; }
    } else if (phase === 'hold') {
      progress = 1; pathAlpha = 1;
      if (timer >= HOLD_DURATION) { phase = 'fade'; timer = 0; }
    } else if (phase === 'fade') {
      progress = 1;
      pathAlpha = Math.max(0, 1 - timer / FADE_DURATION);
      if (timer >= FADE_DURATION) { phase = 'pause'; timer = 0; }
    } else {
      progress = 0; pathAlpha = 0;
      if (timer >= PAUSE_DURATION) { phase = 'draw'; timer = 0; progress = 0; }
    }
  }

  function frame(t) {
    if (lastT == null) lastT = t;
    var dt = Math.min(0.05, (t - lastT) / 1000);
    lastT = t;
    step(dt);
    render();
    requestAnimationFrame(frame);
  }

  readColors();
  resize();

  // The heading uses a web font that may still be loading at first layout;
  // re-measure once it's actually in so the axis lines up precisely.
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(function () { resize(); render(); });
  }

  if (reduceMotion) {
    progress = 1; pathAlpha = 1; phase = 'hold';
    render();
    window.addEventListener('resize', function () { resize(); render(); });
    var pageElRM = document.getElementById('page-teaching');
    if (pageElRM && window.MutationObserver) {
      new MutationObserver(function () {
        if (!pageElRM.hidden) { resize(); render(); }
      }).observe(pageElRM, { attributes: true, attributeFilter: ['hidden'] });
    }
    return;
  }

  render();
  window.addEventListener('resize', resize);

  var darkQuery = window.matchMedia('(prefers-color-scheme: dark)');
  if (darkQuery.addEventListener) darkQuery.addEventListener('change', readColors);
  else if (darkQuery.addListener) darkQuery.addListener(readColors);

  // The Teaching page starts out [hidden], so the panel measures 0x0 at
  // load; re-measure once the router actually shows it.
  var pageEl = document.getElementById('page-teaching');
  if (pageEl && window.MutationObserver) {
    new MutationObserver(function () {
      if (!pageEl.hidden) resize();
    }).observe(pageEl, { attributes: true, attributeFilter: ['hidden'] });
  }

  requestAnimationFrame(frame);
})();
