// Biography cover: a close-up, fixed 3D crystal lattice — the camera
// sits just inside it, so it reads as a tunnel receding in depth. The
// nearest atom brightens as the cursor approaches; clicking it sends a
// white beam along its three axes plus scattered background sparks,
// both fading with distance and time.
(function () {
  var canvas = document.querySelector('.crystal-canvas');
  var cover = canvas && canvas.closest('.cover-panel');
  if (!canvas || !cover || !canvas.getContext) return;
  var ctx = canvas.getContext('2d');

  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  var NX = 5, NY = 5, NZ = 11;         // cross-section 5x5, 11 layers deep — a tunnel, not a block
  var ANGLE_Y = 0.5;                   // fixed rad turntable angle (static, not animated)
  var TILT = -0.38;                    // fixed rad tilt so depth reads clearly
  var NEAR_MARGIN = 1.15;              // cells between the camera and the nearest atom — smaller = closer
  var FOCAL_K = 1.05;                  // focal length as a multiple of panel width

  var ATOM_WORLD_RADIUS = 0.022;       // atom radius, in the same "cells" unit as spacing

  var GLOW_RADIUS = 110;               // px, how far from the host the cursor starts lighting it up
  var GLOW_SMOOTH = 8;                 // how fast the hover glow itself ramps up/down
  var HOST_HIT_RADIUS = 90;            // px, how generous a click near the host counts as "on" it

  var BEAM_SPEED = 4.2;                // cells / sec a beam front travels outward
  var BEAM_DECAY_LEN = 7;              // cells; how far a beam gets before it's essentially spent
  var GLOW_DECAY = 1.1;                // per second; how fast a lit atom/bond fades back to rest (~longer, brighter tail)

  var SPARK_COUNT = 110;               // random background bonds lit per click, independent of the axis beams
  var SPARK_STRENGTH = 1.15;           // peak spark brightness, before its own depth fade
  var SPARK_DELAY = 0.22;              // sec after the click before background sparks appear —
                                        // the axis beam from the host must read first, always

  var cw = 0, ch = 0, dpr = 1;
  var FOCAL = 1, CAM_Z = 6;
  var mouse = { x: -9999, y: -9999, active: false };
  var colors = { rest: '#454b57', host: '#a8540f' };
  var sparkDelay = -1;                 // seconds remaining until the pending sparks fire, or -1 if none pending

  var atoms = [];
  var atomIndexOf = {};   // "ix,iy,iz" -> index into atoms[]
  var lastT = null;
  var hoverGlow = 0;

  // Cached, static scene geometry — rebuilt only on resize, never per frame.
  var bondSegs = [];        // {x1,y1,x2,y2,width,alpha,a,b}
  var bondIndexOf = {};     // "aIdx_bIdx" -> index into bondSegs
  var atomDraws = [];       // {x,y,radius,alpha,idx}
  var atomGlow = [];        // per-atom transient brightness from a passing beam
  var bondGlow = [];        // same, per bond
  var hostP = { x: 0, y: 0, scale: 1 };
  var hostIndex = 0;
  var beams = [];

  function hexToRgb(hex) {
    var m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec((hex || '').trim());
    if (!m) return { r: 130, g: 130, b: 130 };
    return { r: parseInt(m[1], 16), g: parseInt(m[2], 16), b: parseInt(m[3], 16) };
  }

  function mix(a, b, t) { return a + (b - a) * t; }

  function readColors() {
    var s = getComputedStyle(document.documentElement);
    colors = {
      rest: (s.getPropertyValue('--ink-soft') || '#454b57').trim(),
      host: (s.getPropertyValue('--muted') || '#928d7d').trim()
    };
  }

  function atomKey(ix, iy, iz) { return ix + ',' + iy + ',' + iz; }

  function buildLattice() {
    atoms = [];
    atomIndexOf = {};
    for (var ix = 0; ix < NX; ix++) {
      for (var iy = 0; iy < NY; iy++) {
        for (var iz = 0; iz < NZ; iz++) {
          atomIndexOf[atomKey(ix, iy, iz)] = atoms.length;
          atoms.push({
            x: ix - (NX - 1) / 2,
            y: iy - (NY - 1) / 2,
            z: iz - (NZ - 1) / 2,
            ix: ix, iy: iy, iz: iz
          });
        }
      }
    }
  }

  function rotateY(p, a) {
    var c = Math.cos(a), s = Math.sin(a);
    return { x: p.x * c + p.z * s, y: p.y, z: -p.x * s + p.z * c };
  }
  function rotateX(p, a) {
    var c = Math.cos(a), s = Math.sin(a);
    return { x: p.x, y: p.y * c - p.z * s, z: p.y * s + p.z * c };
  }
  function rotated(p) { return rotateX(rotateY(p, ANGLE_Y), TILT); }

  function project(p) {
    var r = rotated(p);
    var z = r.z + CAM_Z;
    var scale = FOCAL / z;
    return { x: cw / 2 + r.x * scale, y: ch / 2 - r.y * scale, z: r.z, scale: scale };
  }

  // The camera sits just in front of the nearest atom, however deep the
  // rotation happens to push it — found once from geometry alone, so it
  // stays correct however NX/NY/NZ/ANGLE_Y/TILT are tuned.
  function computeCamZ() {
    var minZ = Infinity;
    atoms.forEach(function (p) {
      var z = rotated(p).z;
      if (z < minZ) minZ = z;
    });
    CAM_Z = NEAR_MARGIN - minZ;
  }

  // Recomputes projection + every cached draw call. The lattice itself
  // never moves after this, so there's no need to redo it per frame —
  // only a resize (panel size change) invalidates it.
  function layout() {
    FOCAL = cw * FOCAL_K;

    var projected = atoms.map(project);

    hostIndex = 0;
    for (var i = 1; i < projected.length; i++) {
      if (projected[i].z < projected[hostIndex].z) hostIndex = i;
    }

    // Frame the close-up atom deliberately (not the whole tunnel — most of
    // it is meant to run off-frame, the way a close look through a real
    // lattice would) a little left of centre and just above the caption.
    var raw = projected[hostIndex];
    var shiftX = cw * 0.46 - raw.x, shiftY = ch * 0.4 - raw.y;
    projected.forEach(function (p) { p.x += shiftX; p.y += shiftY; });
    hostP = projected[hostIndex];

    var hostScale = hostP.scale;
    var relOf = function (p) { return Math.min(1, p.scale / hostScale); };

    bondSegs = [];
    bondIndexOf = {};
    for (var a = 0; a < atoms.length; a++) {
      var atomA = atoms[a], pa = projected[a], relA = relOf(pa);
      ['x', 'y', 'z'].forEach(function (axis) {
        var target = { ix: atomA.ix, iy: atomA.iy, iz: atomA.iz };
        target[axis === 'x' ? 'ix' : axis === 'y' ? 'iy' : 'iz']++;
        var b = atomIndexOf[atomKey(target.ix, target.iy, target.iz)];
        if (b === undefined) return;
        var pb = projected[b], relB = relOf(pb);
        var rel = (relA + relB) / 2;
        bondIndexOf[Math.min(a, b) + '_' + Math.max(a, b)] = bondSegs.length;
        bondSegs.push({
          x1: pa.x, y1: pa.y, x2: pb.x, y2: pb.y,
          width: 0.5 + 1.4 * rel,
          alpha: 0.05 + 0.4 * rel,
          rel: rel,
          a: a, b: b
        });
      });
    }

    var order = projected.map(function (p, idx) { return idx; });
    order.sort(function (m, n) { return projected[n].z - projected[m].z; });

    atomDraws = [];
    order.forEach(function (idx) {
      if (idx === hostIndex) return; // the host is drawn separately, on top
      var p = projected[idx], rel = relOf(p);
      atomDraws.push({
        x: p.x, y: p.y,
        radius: ATOM_WORLD_RADIUS * p.scale,
        alpha: 0.1 + 0.75 * rel,
        idx: idx
      });
    });

    atomGlow = new Array(atoms.length).fill(0);
    bondGlow = new Array(bondSegs.length).fill(0);
    beams = [];
    sparkDelay = -1;
  }

  // Fires three beams from the host atom, one per crystal axis, each
  // travelling both directions along its row of bonds at once. Background
  // sparks are scheduled, not fired immediately — the light always has to
  // read as starting at the host first.
  function triggerBeam() {
    beams.push({ nextD: 0, radius: 0 });
    sparkDelay = SPARK_DELAY;
  }

  // Scatters the light across bonds elsewhere in the lattice too — not just
  // the three axis lines through the host — as if it were catching facets
  // deeper in the crystal. Each spark's brightness is capped by how close
  // that bond already sits to the camera, so it still fades with depth.
  function triggerSparks() {
    var count = Math.min(SPARK_COUNT, bondSegs.length);
    for (var n = 0; n < count; n++) {
      var i = Math.floor(Math.random() * bondSegs.length);
      var seg = bondSegs[i];
      var amount = seg.rel * SPARK_STRENGTH * (0.4 + Math.random() * 0.6);
      bondGlow[i] = Math.max(bondGlow[i], amount);
      igniteAtom(seg.a, amount * 0.8);
      igniteAtom(seg.b, amount * 0.8);
    }
  }

  function igniteAtom(idx, amount) {
    if (idx === undefined) return;
    atomGlow[idx] = Math.max(atomGlow[idx], amount);
  }
  function igniteBond(aIdx, bIdx, amount) {
    var bi = bondIndexOf[Math.min(aIdx, bIdx) + '_' + Math.max(aIdx, bIdx)];
    if (bi === undefined) return;
    bondGlow[bi] = Math.max(bondGlow[bi], amount);
  }

  function advanceBeams(dt) {
    var host = atoms[hostIndex];
    var maxD = Math.max(NX, NY, NZ);

    for (var s = beams.length - 1; s >= 0; s--) {
      var beam = beams[s];
      beam.radius += BEAM_SPEED * dt;

      while (beam.nextD <= beam.radius) {
        var d = beam.nextD;
        var amount = Math.exp(-d / BEAM_DECAY_LEN);

        if (d === 0) {
          igniteAtom(hostIndex, 1);
        } else {
          [['ix', host.ix], ['iy', host.iy], ['iz', host.iz]].forEach(function (pair) {
            var axis = pair[0], base = pair[1];
            [1, -1].forEach(function (sign) {
              var cur = { ix: host.ix, iy: host.iy, iz: host.iz };
              cur[axis] = base + sign * d;
              var curIdx = atomIndexOf[atomKey(cur.ix, cur.iy, cur.iz)];
              if (curIdx === undefined) return;

              var prev = { ix: host.ix, iy: host.iy, iz: host.iz };
              prev[axis] = base + sign * (d - 1);
              var prevIdx = atomIndexOf[atomKey(prev.ix, prev.iy, prev.iz)];

              igniteAtom(curIdx, amount);
              if (prevIdx !== undefined) igniteBond(prevIdx, curIdx, amount);
            });
          });
        }
        beam.nextD++;
      }

      if (beam.nextD > maxD) beams.splice(s, 1);
    }
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
    layout();
  }

  function draw(dt) {
    if (dt > 0) {
      advanceBeams(dt);

      if (sparkDelay >= 0) {
        sparkDelay -= dt;
        if (sparkDelay <= 0) {
          sparkDelay = -1;
          triggerSparks();
        }
      }

      var targetHoverGlow = 0;
      if (mouse.active) {
        var dx = hostP.x - mouse.x, dy = hostP.y - mouse.y;
        var dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < GLOW_RADIUS) {
          var f = 1 - dist / GLOW_RADIUS;
          targetHoverGlow = f * f;
        }
      }
      hoverGlow += (targetHoverGlow - hoverGlow) * Math.min(1, dt * GLOW_SMOOTH);

      var decay = Math.exp(-GLOW_DECAY * dt);
      for (var i = 0; i < atomGlow.length; i++) atomGlow[i] *= decay;
      for (var j = 0; j < bondGlow.length; j++) bondGlow[j] *= decay;
    }

    ctx.clearRect(0, 0, cw, ch);
    var rc = hexToRgb(colors.rest), hc = hexToRgb(colors.host);

    ctx.save();
    bondSegs.forEach(function (seg, i) {
      var glow = Math.min(1.4, bondGlow[i] || 0);
      var r = mix(rc.r, 255, Math.min(1, glow)), g = mix(rc.g, 255, Math.min(1, glow)), b = mix(rc.b, 255, Math.min(1, glow));
      ctx.strokeStyle = 'rgba(' + (r | 0) + ',' + (g | 0) + ',' + (b | 0) + ',' + Math.min(1, seg.alpha + 1.1 * glow).toFixed(3) + ')';
      ctx.lineWidth = seg.width * (1 + 2.4 * glow);
      ctx.shadowColor = glow > 0.05 ? 'rgba(255,246,232,' + Math.min(0.95, glow).toFixed(3) + ')' : 'transparent';
      ctx.shadowBlur = glow > 0.05 ? 14 * glow : 0;
      ctx.beginPath();
      ctx.moveTo(seg.x1, seg.y1);
      ctx.lineTo(seg.x2, seg.y2);
      ctx.stroke();
    });
    ctx.restore();

    ctx.save();
    atomDraws.forEach(function (p) {
      var glow = Math.min(1.4, atomGlow[p.idx] || 0);
      var r = mix(rc.r, 255, Math.min(1, glow)), g = mix(rc.g, 255, Math.min(1, glow)), b = mix(rc.b, 255, Math.min(1, glow));
      ctx.fillStyle = 'rgba(' + (r | 0) + ',' + (g | 0) + ',' + (b | 0) + ',' + Math.min(1, p.alpha + 0.95 * glow).toFixed(3) + ')';
      ctx.shadowColor = glow > 0.05 ? 'rgba(255,246,232,' + Math.min(0.95, glow).toFixed(3) + ')' : 'transparent';
      ctx.shadowBlur = glow > 0.05 ? 22 * glow : 0;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.radius * (1 + 1.4 * glow), 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.restore();

    // the host atom: brightens and grows as the cursor nears, or whenever a
    // beam it fired loops back through the origin
    var hGlow = Math.max(hoverGlow, atomGlow[hostIndex] || 0);
    var hostRadius = ATOM_WORLD_RADIUS * hostP.scale * (2.3 + 0.9 * hGlow);
    var hr = mix(hc.r, 255, hGlow * 0.6), hgc = mix(hc.g, 255, hGlow * 0.6), hb = mix(hc.b, 255, hGlow * 0.6);

    if (hGlow > 0.02) {
      ctx.save();
      ctx.shadowColor = 'rgba(' + (hr | 0) + ',' + (hgc | 0) + ',' + (hb | 0) + ',' + (0.7 * hGlow).toFixed(3) + ')';
      ctx.shadowBlur = hostRadius * (1.5 + 3 * hGlow);
      ctx.fillStyle = 'rgba(' + (hr | 0) + ',' + (hgc | 0) + ',' + (hb | 0) + ',0.95)';
      ctx.beginPath();
      ctx.arc(hostP.x, hostP.y, hostRadius, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    } else {
      ctx.fillStyle = 'rgba(' + hc.r + ',' + hc.g + ',' + hc.b + ',0.95)';
      ctx.beginPath();
      ctx.arc(hostP.x, hostP.y, hostRadius, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function frame(t) {
    if (lastT == null) lastT = t;
    var dt = Math.min(0.05, (t - lastT) / 1000);
    lastT = t;
    draw(dt);
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
    var x = e.clientX - rect.left, y = e.clientY - rect.top;
    var dx = x - hostP.x, dy = y - hostP.y;
    if (Math.sqrt(dx * dx + dy * dy) <= HOST_HIT_RADIUS) triggerBeam();
  }

  readColors();
  buildLattice();
  computeCamZ();
  resize();
  draw(0);

  if (reduceMotion) {
    window.addEventListener('resize', function () { resize(); draw(0); });
    var pageElRM = document.getElementById('page-biography');
    if (pageElRM && window.MutationObserver) {
      new MutationObserver(function () {
        if (!pageElRM.hidden) { resize(); draw(0); }
      }).observe(pageElRM, { attributes: true, attributeFilter: ['hidden'] });
    }
    return;
  }

  cover.addEventListener('mousemove', onMove);
  cover.addEventListener('mouseleave', onLeave);
  cover.addEventListener('click', onClick);
  window.addEventListener('resize', resize);

  var darkQuery = window.matchMedia('(prefers-color-scheme: dark)');
  if (darkQuery.addEventListener) darkQuery.addEventListener('change', readColors);
  else if (darkQuery.addListener) darkQuery.addListener(readColors);

  // The Biography page starts out [hidden], so the panel measures 0x0 at
  // load; re-measure once the router actually shows it.
  var pageEl = document.getElementById('page-biography');
  if (pageEl && window.MutationObserver) {
    new MutationObserver(function () {
      if (!pageEl.hidden) resize();
    }).observe(pageEl, { attributes: true, attributeFilter: ['hidden'] });
  }

  requestAnimationFrame(frame);
})();
