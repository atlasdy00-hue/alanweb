// Home cover: a lattice of Ising-like spins (arrows), each bistable
// between "up" (the preferred, resting orientation) and "down". Near
// the cursor a site is frustrated — it jitters and flips between the
// two states at random — and relaxes back to "up" once the cursor
// moves away. A click acts as a pulse source: the wavefront running
// left of the click kicks spins to the left, the one running right
// kicks them to the right, both fading with distance and then ringing
// back to "up".
(function () {
  var canvas = document.querySelector('.lattice-canvas');
  var cover = canvas && canvas.closest('.cover-panel');
  if (!canvas || !cover || !canvas.getContext) return;
  var ctx = canvas.getContext('2d');

  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  var SPACING = 34;               // px between lattice sites
  var ARROW_LEN = 14;              // px, tip-to-tail
  var HEAD_LEN = 4.4;               // px, arrowhead stroke length
  var BASE_ANGLE = -Math.PI / 2;    // "up" direction on screen
  var SPRING = 46;                  // pull back toward the current target (up or down)
  var DAMPING = 5.5;                 // under-damped on purpose: flips overshoot and settle
  var KICK_RADIUS = 62;              // px, cursor influence radius
  var FLIP_RATE = 16;                // max flip attempts / sec at full excitation
  var FLIP_THRESHOLD = 0.04;         // below this excitation, a site just wants "up"
  var VIBRATE_STRENGTH = 30;         // random jitter torque at full excitation
  var EXCITE_SMOOTH = 10;            // how fast excitation itself ramps up/down
  var SWEEP_SPEED = 16;              // columns / sec a click-triggered wave travels
  var WAVE_DECAY_LENGTH = 6.5;       // columns; wave amplitude falls off as exp(-d / this)
  var WAVE_IMPULSE = 20;             // angular velocity kick at the click column (d = 0)
  var GLOW_DECAY = 6;                // how fast the wave's visual glow fades, per second

  var cols = 0, rows = 0;
  var angle = [], vel = [], target = [], excite = [], glow = [];
  var cw = 0, ch = 0, dpr = 1;
  var mouse = { x: -9999, y: -9999, active: false };
  var sweeps = [];
  var colors = { rest: '#454b57', peak: '#3f6e6a' };

  function hexToRgb(hex) {
    var m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec((hex || '').trim());
    if (!m) return { r: 130, g: 130, b: 130 };
    return { r: parseInt(m[1], 16), g: parseInt(m[2], 16), b: parseInt(m[3], 16) };
  }

  function readColors() {
    var s = getComputedStyle(document.documentElement);
    colors = {
      rest: (s.getPropertyValue('--ink-soft') || '#454b57').trim(),
      peak: (s.getPropertyValue('--accent-soft') || '#3f6e6a').trim()
    };
  }

  function idx(cx, cy) { return cy * cols + cx; }

  function siteXY(cx, cy) {
    var padX = (cw - (cols - 1) * SPACING) / 2;
    var padY = (ch - (rows - 1) * SPACING) / 2;
    return [padX + cx * SPACING, padY + cy * SPACING];
  }

  function colFromX(x) {
    var padX = (cw - (cols - 1) * SPACING) / 2;
    var c = Math.round((x - padX) / SPACING);
    return Math.max(0, Math.min(cols - 1, c));
  }

  function triggerColumn(cx, dist, dir) {
    if (cx < 0 || cx >= cols) return;
    // A real (undriven) oscillator response: an impulse, scaled down with
    // distance from the click, that rings the site back to its preferred
    // "up" via the ordinary spring below — no randomness, so every site in
    // the wavefront moves in lockstep. `dir` is the push direction (-1
    // left of the click, +1 right of it, 0 at the click column itself), so
    // the pulse spreads outward from the cursor like it does from a source.
    var amp = Math.exp(-dist / WAVE_DECAY_LENGTH);
    for (var cy = 0; cy < rows; cy++) {
      var i = idx(cx, cy);
      vel[i] += dir * WAVE_IMPULSE * amp;
      glow[i] = Math.max(glow[i], amp);
    }
  }

  function wrapPi(a) {
    a = a % (2 * Math.PI);
    if (a > Math.PI) a -= 2 * Math.PI;
    if (a < -Math.PI) a += 2 * Math.PI;
    return a;
  }

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

    cols = Math.max(2, Math.floor(cw / SPACING));
    rows = Math.max(2, Math.floor(ch / SPACING));
    var n = cols * rows;
    angle = new Array(n).fill(0);
    vel = new Array(n).fill(0);
    target = new Array(n).fill(0);
    excite = new Array(n).fill(0);
    glow = new Array(n).fill(0);
    sweeps = [];
  }

  function advanceSweeps(dt) {
    for (var s = sweeps.length - 1; s >= 0; s--) {
      var sweep = sweeps[s];
      sweep.radius += SWEEP_SPEED * dt;
      while (sweep.nextD <= sweep.radius) {
        if (sweep.nextD === 0) {
          triggerColumn(sweep.originCol, 0, 0);
        } else {
          triggerColumn(sweep.originCol - sweep.nextD, sweep.nextD, -1);
          triggerColumn(sweep.originCol + sweep.nextD, sweep.nextD, 1);
        }
        sweep.nextD++;
      }
      // stop once even the near edge of the fade is inaudibly faint
      if (sweep.nextD > cols || sweep.nextD > WAVE_DECAY_LENGTH * 8) sweeps.splice(s, 1);
    }
  }

  function step(dt) {
    advanceSweeps(dt);
    for (var cy = 0; cy < rows; cy++) {
      for (var cx = 0; cx < cols; cx++) {
        var i = idx(cx, cy);

        var targetExcite = 0;
        if (mouse.active) {
          var pos = siteXY(cx, cy);
          var dx = pos[0] - mouse.x, dy = pos[1] - mouse.y;
          var dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < KICK_RADIUS) {
            var f = 1 - dist / KICK_RADIUS;
            targetExcite = f * f * (3 - 2 * f); // smoothstep falloff
          }
        }
        excite[i] += (targetExcite - excite[i]) * Math.min(1, dt * EXCITE_SMOOTH);

        if (excite[i] > FLIP_THRESHOLD) {
          if (Math.random() < FLIP_RATE * excite[i] * dt) {
            target[i] = target[i] === 0 ? Math.PI : 0;
          }
        } else {
          target[i] = 0; // no excitation left: only "up" is on offer
        }

        var diff = wrapPi(target[i] - angle[i]);
        var accel = SPRING * diff - DAMPING * vel[i];
        accel += (Math.random() * 2 - 1) * VIBRATE_STRENGTH * excite[i];

        vel[i] += accel * dt;
        angle[i] = wrapPi(angle[i] + vel[i] * dt);

        glow[i] *= Math.exp(-GLOW_DECAY * dt);
      }
    }
  }

  function draw() {
    ctx.clearRect(0, 0, cw, ch);
    var rc = hexToRgb(colors.rest), pc = hexToRgb(colors.peak);

    for (var cy = 0; cy < rows; cy++) {
      for (var cx = 0; cx < cols; cx++) {
        var i = idx(cx, cy);
        var pos = siteXY(cx, cy);
        var x = pos[0], y = pos[1];
        var e = Math.max(excite[i], glow[i]);

        var r = Math.round(rc.r + (pc.r - rc.r) * e);
        var g = Math.round(rc.g + (pc.g - rc.g) * e);
        var b = Math.round(rc.b + (pc.b - rc.b) * e);
        var alpha = 0.3 + 0.55 * e;

        var a = BASE_ANGLE + angle[i];
        var hx = Math.cos(a) * ARROW_LEN / 2;
        var hy = Math.sin(a) * ARROW_LEN / 2;
        var ha = a + Math.PI * 0.82;
        var hb = a - Math.PI * 0.82;

        ctx.strokeStyle = 'rgba(' + r + ',' + g + ',' + b + ',' + alpha.toFixed(3) + ')';
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.moveTo(x - hx, y - hy);
        ctx.lineTo(x + hx, y + hy);
        ctx.moveTo(x + hx, y + hy);
        ctx.lineTo(x + hx + Math.cos(ha) * HEAD_LEN, y + hy + Math.sin(ha) * HEAD_LEN);
        ctx.moveTo(x + hx, y + hy);
        ctx.lineTo(x + hx + Math.cos(hb) * HEAD_LEN, y + hy + Math.sin(hb) * HEAD_LEN);
        ctx.stroke();
      }
    }
  }

  var lastT = null;
  function frame(t) {
    if (lastT == null) lastT = t;
    var dt = Math.min(0.05, (t - lastT) / 1000);
    lastT = t;
    step(dt);
    draw();
    requestAnimationFrame(frame);
  }

  function onMove(e) {
    var rect = canvas.getBoundingClientRect();
    mouse.x = e.clientX - rect.left;
    mouse.y = e.clientY - rect.top;
    mouse.active = true;
  }
  function onLeave() { mouse.active = false; }

  function onClick(e) {
    var rect = canvas.getBoundingClientRect();
    var x = e.clientX - rect.left;
    sweeps.push({ originCol: colFromX(x), radius: 0, nextD: 0 });
  }

  readColors();
  resize();
  draw();

  if (reduceMotion) {
    window.addEventListener('resize', function () { resize(); draw(); });
    return;
  }

  cover.addEventListener('mousemove', onMove);
  cover.addEventListener('mouseleave', onLeave);
  cover.addEventListener('click', onClick);
  window.addEventListener('resize', resize);

  var darkQuery = window.matchMedia('(prefers-color-scheme: dark)');
  if (darkQuery.addEventListener) darkQuery.addEventListener('change', readColors);
  else if (darkQuery.addListener) darkQuery.addListener(readColors);

  requestAnimationFrame(frame);
})();
