// Miles Caton fan site: one line of chalk. No libraries.
(() => {
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const fine = matchMedia('(pointer:fine)').matches;
  const root = document.documentElement;
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const CHALK = '#EFE7D3', BOARD = '#101312';

  /* ---------- textures ---------- */
  // alpha(i) -> 0..255 for each pixel of a square tile
  const tile = (size, rgb, alpha) => {
    const c = document.createElement('canvas'); c.width = c.height = size;
    const x = c.getContext('2d'), img = x.createImageData(size, size), d = img.data;
    for (let i = 0; i < d.length; i += 4) { d[i] = rgb[0]; d[i + 1] = rgb[1]; d[i + 2] = rgb[2]; d[i + 3] = alpha(); }
    x.putImageData(img, 0, 0); return c;
  };
  // dust on the board
  root.style.setProperty('--noise', `url(${tile(100, [239, 231, 211], () => Math.random() < .5 ? Math.random() * 255 : 0).toDataURL()})`);
  // holes in big type, so it reads as chalk and not print
  root.style.setProperty('--pores', `url(${tile(120, [0, 0, 0], () => { const r = Math.random(); return r < .2 ? r * 700 : 255; }).toDataURL()})`);
  // what gets knocked out of the chalk line
  const poreTile = tile(128, [0, 0, 0], () => { const r = Math.random(); return r < .36 ? 70 + r * 500 : 0; });

  /* ---------- the chalk line ---------- */
  const cv = $('#chalk'), cx = cv.getContext('2d');
  const STEP = 5;
  let W = 0, H = 0, dpr = 1, P = [], L = 0, Lt = 0, raf = 0, last = 0, armed = false, pores = null;
  const dust = [], rubs = [];
  let pluck = null;

  const size = () => {
    W = innerWidth; H = innerHeight; dpr = Math.min(devicePixelRatio || 1, 1.5);
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
    pores = cx.createPattern(poreTile, 'repeat');
  };

  // small seeded random, so a shape looks the same every time it's rebuilt
  const rng = (seed) => () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  const hash = (str) => { let h = 2166136261; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };

  const build = () => {
    const sy = scrollY, pts = [];
    const gut = Math.max(8, Math.min(56, W * .034) * .3);
    let cur = null, run = -1e9, s = 0, penUp = true, mk = 0;
    const put = (x, y, k) => {
      const jx = 1.3 * Math.sin(s * .019 + 1.7) + .8 * Math.sin(s * .063), jy = 1.3 * Math.sin(s * .023 + .4) + .8 * Math.sin(s * .071 + 2);
      const b = Math.max(0, Math.min(2, Math.floor((Math.sin(s * .011) + Math.sin(s * .029 + 1) + 2) / 4 * 3)));
      run = Math.max(run, k);
      pts.push({ x: x + jx, y: y + jy, k: run, m: mk, up: penUp, w: b });
      penUp = false; s += STEP; cur = { x, y };
    };
    const line = (b, kf) => {
      const a = cur, n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / STEP));
      for (let i = 1; i <= n; i++) { const t = i / n, y = a.y + (b.y - a.y) * t; put(a.x + (b.x - a.x) * t, y, kf(y)); }
    };
    const bez = (c1, c2, b, kf) => {
      const a = cur, len = Math.hypot(c1.x - a.x, c1.y - a.y) + Math.hypot(c2.x - c1.x, c2.y - c1.y) + Math.hypot(b.x - c2.x, b.y - c2.y);
      const n = Math.max(2, Math.ceil(len / STEP));
      for (let i = 1; i <= n; i++) {
        const t = i / n, u = 1 - t;
        const x = u * u * u * a.x + 3 * u * u * t * c1.x + 3 * u * t * t * c2.x + t * t * t * b.x;
        const y = u * u * u * a.y + 3 * u * u * t * c1.y + 3 * u * t * t * c2.y + t * t * t * b.y;
        put(x, y, kf(y));
      }
    };
    // get from where the chalk is to the start of the next mark
    const travel = (T, key, direct, side) => {
      const kf = (y) => Math.min(y, key);
      if (!cur) { penUp = true; put(T.x, T.y, key); return; }
      const dx = T.x - cur.x, dy = T.y - cur.y;
      if ((direct && !(W < 900 && dy > 150)) || Math.abs(dy) < 120) {
        const sag = Math.abs(dy) < 60 ? 24 : 0;
        bez({ x: cur.x + dx * .25, y: cur.y + dy * .6 + sag }, { x: T.x - dx * .25, y: T.y - dy * .6 + sag }, T, kf);
        return;
      }
      // long way down: swing out to the edge of the board, run down it, swing back in
      const gx = (side ? side === 'l' : cur.x < W / 2) ? gut : W - gut, d = Math.min(W < 700 ? 44 : 110, dy * .35), a = cur;
      bez({ x: a.x, y: a.y + d * .6 }, { x: gx, y: a.y + d * .3 }, { x: gx, y: a.y + d }, kf);
      line({ x: gx, y: T.y - d }, kf);
      bez({ x: gx, y: T.y - d * .3 }, { x: T.x, y: T.y - d * .6 }, T, kf);
    };

    $$('[data-chalk]').forEach((el, idx) => {
      const type = el.dataset.chalk, direct = el.hasAttribute('data-direct'), side = el.dataset.gutter;
      const box = el.dataset.frame ? ($(el.dataset.frame, el) || el) : el;
      const b = box.getBoundingClientRect();
      if (!b.width && !b.height && type !== 'start') return;
      const r = { l: b.left, t: b.top + sy, r: b.right, b: b.bottom + sy, w: b.width, h: b.height };
      const key = type === 'start' ? -1e8 : r.t + Math.min(r.h * .5, 160);
      const K = () => key, rnd = rng(idx * 7919 + 13);
      mk = idx + 1; el._mk = mk;
      // a mark on its own: lift the chalk, draw it, then carry the long line on from where it was
      const solo = el.hasAttribute('data-solo'), hold = cur;
      if (solo) cur = null;
      try {
      if (type === 'start') {
        // leave the last letter of the signature and sweep back under the whole name
        const h = el.parentElement.getBoundingClientRect(), hb = h.bottom + sy;
        cur = null; travel({ x: r.l, y: r.t }, key);
        bez({ x: h.right + h.width * .3, y: r.t + h.height * .2 }, { x: h.right + h.width * .1, y: hb + h.height * .07 }, { x: h.left + h.width * .5, y: hb + h.height * .03 }, K);
        bez({ x: h.left + h.width * .2, y: hb + h.height * .01 }, { x: h.left - h.width * .1, y: hb - h.height * .01 }, { x: h.left - h.width * .32, y: hb + h.height * .05 }, K);
        return;
      }
      if (type === 'under' || type === 'under2') {
        const y = r.b + Math.max(7, Math.min(12, r.h * .06));
        travel({ x: r.l - 6, y: y + 3 }, key, direct, side);
        bez({ x: r.l + r.w * .3, y: y - 3 }, { x: r.l + r.w * .7, y: y + 4 }, { x: r.r + 12, y: y - 2 }, K);
        if (type === 'under2') {
          const y2 = y + (W < 700 ? 7 : Math.max(10, Math.min(22, r.h * .07)));
          bez({ x: r.r + 26, y: y + 2 }, { x: r.r + 20, y: y2 }, { x: r.r - 10, y: y2 }, K);
          bez({ x: r.l + r.w * .7, y: y2 + 3 }, { x: r.l + r.w * .4, y: y2 - 3 }, { x: r.l - 4, y: y2 + 3 }, K);
        }
        return;
      }
      if (type === 'circle') {
        const pad = Math.max(6, Math.min(20, r.h * .12)), cxm = (r.l + r.r) / 2, cym = (r.t + r.b) / 2, rx = r.w / 2 * 1.16 + pad, ry = r.h / 2 * 1.3 + pad;
        const a0 = -110 * Math.PI / 180, turns = 1.5 * Math.PI * 2, n = Math.ceil((Math.PI * (rx + ry)) * 1.5 / STEP);
        const at = (i) => { const t = i / n, a = a0 + turns * t, g = 1 + .07 * t; return { x: cxm + Math.cos(a) * rx * g + Math.sin(a * 2) * 3, y: cym + Math.sin(a) * ry * g }; };
        travel(at(0), key, direct, side);
        for (let i = 1; i <= n; i++) { const p = at(i); put(p.x, p.y, key); }
        return;
      }
      if (type === 'frame') {
        const p = Math.max(8, Math.min(14, r.w * .04)), j = () => (rnd() - .5) * 9;
        const tl = { x: r.l - p + j(), y: r.t - p + j() }, tr = { x: r.r + p + j(), y: r.t - p + j() }, br = { x: r.r + p + j(), y: r.b + p + j() }, bl = { x: r.l - p + j(), y: r.b + p + j() };
        const edge = (a, b2, over) => {
          const mx = (a.x + b2.x) / 2 + (rnd() - .5) * 6, my = (a.y + b2.y) / 2 + (rnd() - .5) * 6;
          const ex = b2.x + (b2.x - a.x) / Math.hypot(b2.x - a.x, b2.y - a.y) * over, ey = b2.y + (b2.y - a.y) / Math.hypot(b2.x - a.x, b2.y - a.y) * over;
          bez({ x: mx, y: my }, { x: mx, y: my }, { x: ex, y: ey }, K);
        };
        travel({ x: tl.x - 14, y: tl.y + 2 }, key, direct, side);
        edge(cur, tr, 7); edge(tr, br, 6); edge(br, bl, 8); edge(bl, tl, 16);
        return;
      }
      if (type === 'wave') {
        const sd = rng(hash(el.dataset.seed || '' + idx)), mid = (r.t + r.b) / 2, amp = r.h / 2 - 4;
        const ph = [sd() * 6, sd() * 6, sd() * 6], f = [1.3 + sd() * 1.2, 3 + sd() * 2.5, 6 + sd() * 4], car = 13 + sd() * 12;
        const at = (x) => {
          const t = (x - r.l) / r.w, env = Math.sin(Math.PI * t) * (.25 + .75 * Math.abs(.5 * Math.sin(t * f[0] * 6 + ph[0]) + .32 * Math.sin(t * f[1] * 6 + ph[1]) + .18 * Math.sin(t * f[2] * 6 + ph[2])));
          return { x, y: mid + Math.sin(x / car * Math.PI * 2) * amp * env, e: env };
        };
        // start from whichever end the chalk is nearer to
        const back = cur && cur.x > (r.l + r.r) / 2;
        travel({ x: back ? r.r : r.l, y: mid }, key, direct, back ? 'r' : 'l');
        for (let d = 2.5; d <= r.w; d += 2.5) { const p = at(back ? r.r - d : r.l + d); put(p.x, p.y, key); pts[pts.length - 1].e = p.e; pts[pts.length - 1].by = true; }
        return;
      }
      if (type === 'tally') {
        const n = +el.dataset.n || 0, gap = Math.min(30, r.w / (n + Math.floor(n / 5) + 1)), top = r.t + r.h * .08, bot = r.b - r.h * .08;
        let x = r.l + gap * .5, groupStart = x; const hold = cur; // tallies are separate strokes; the long line carries on from where it was
        for (let i = 1; i <= n; i++) {
          if (i % 5 === 0) {
            penUp = true; put(groupStart - gap * .45, bot - (bot - top) * .22 + rnd() * 6, key);
            line({ x: x - gap * .55, y: top + (bot - top) * .2 + rnd() * 6 }, K);
            x += gap * .9; groupStart = x;
          } else {
            const a = { x: x + (rnd() - .5) * 5, y: top + rnd() * 7 }, b2 = { x: x - 3 + (rnd() - .5) * 5, y: bot - rnd() * 7 };
            penUp = true; put(a.x, a.y, key);
            line(b2, K); x += gap;
          }
        }
        cur = hold; penUp = !hold; if (hold) { penUp = true; put(hold.x, hold.y, key); }
        return;
      }
      if (type === 'strike') {
        const hold = cur, y = (r.t + r.b) / 2;
        penUp = true; put(r.l - 7, y + 2 + rnd() * 5, key);
        line({ x: r.r + 9, y: y - 5 + rnd() * 5 }, K);
        cur = hold; penUp = !hold; if (hold) { penUp = true; put(hold.x, hold.y, key); }
        return;
      }
      if (type === 'end') {
        const y0 = r.t + r.h * .92, x0 = r.l, loops = 3, a = Math.min(28, r.w / 12), bb = a * 1.9;
        travel({ x: x0, y: y0 }, key, direct, side);
        const n = Math.ceil(loops * 2 * Math.PI * bb * 1.6 / STEP);
        for (let i = 1; i <= n; i++) { const t = i / n * loops * 2 * Math.PI; put(x0 + a * t - bb * Math.sin(t), y0 - bb * (1 - Math.cos(t)) * .8, key); }
        bez({ x: cur.x + 40, y: y0 + 4 }, { x: cur.x + 110, y: y0 - 14 }, { x: Math.min(r.r, cur.x + 190), y: y0 - 4 }, K);
      }
      } finally {
        if (solo) { cur = hold; penUp = !hold; if (hold) { penUp = true; put(hold.x, hold.y, key); } }
      }
    });

    // carry on from wherever the chalk had got to
    const drawnTo = P.length && L > 0 ? P[Math.min(P.length - 1, Math.floor(L))].k : null;
    P = pts; Lt = 0;
    if (drawnTo === null) L = 0; else { let i = 0; while (i < P.length && P[i].k <= drawnTo) i++; L = i; }
    kick();
  };

  const kick = () => { if (!raf) raf = requestAnimationFrame(frame); };
  const smooth = (t) => { t = Math.max(0, Math.min(1, t)); return t * t * (3 - 2 * t); };

  const frame = (now) => {
    raf = 0;
    const dt = Math.min(.05, (now - last) / 1000 || .016); last = now;
    const sy = scrollY, max = root.scrollHeight - H;
    const thr = sy + H * (.8 + .3 * (max > 4 ? smooth((sy - (max - H * .5)) / (H * .5)) : 1));
    let again = false;
    if (armed) {
      while (Lt < P.length && P[Lt].k <= thr) Lt++;
      if (L < Lt) { L = reduce ? Lt : Math.min(Lt, L + Math.max(190, (Lt - L) * 2.6) * dt); again = L < Lt; }
    }
    // draw
    cx.setTransform(dpr, 0, 0, dpr, 0, 0); cx.clearRect(0, 0, W, H); cx.translate(0, -sy);
    const n = Math.min(P.length, Math.floor(L)), top = sy - 60, bot = sy + H + 60, sc = W < 700 ? .82 : 1, widths = [2.5, 3.2, 3.9];
    let pa = 0, pm = 0;
    if (pluck) {
      pluck.a = pluck.hold ? Math.min(1, pluck.a + dt * 4) : pluck.a * Math.exp(-dt * 2.4);
      if (!pluck.hold && pluck.a < .02) pluck = null; else { pa = pluck.a; pm = pluck.m; again = true; }
    }
    const Y = (p, i) => (pa && p.m === pm && p.by) ? p.y + pa * Math.sin(now * .05 + i * .6) * 9 * (.3 + p.e) : p.y;
    cx.lineCap = 'round'; cx.lineJoin = 'round'; cx.strokeStyle = CHALK;
    for (let pass = 0; pass < 2; pass++) {
      const ox = pass ? 1.1 : 0, oy = pass ? .7 : 0;
      cx.globalAlpha = pass ? .4 : .92;
      let open = false, w = -1;
      cx.beginPath();
      for (let i = 1; i < n; i++) {
        const p = P[i], q = P[i - 1];
        if (p.up || (p.y < top && q.y < top) || (p.y > bot && q.y > bot)) { open = false; continue; }
        if (!open || p.w !== w) {
          if (w >= 0) cx.stroke();
          cx.beginPath(); w = p.w; cx.lineWidth = widths[w] * sc * (pass ? .55 : 1);
          cx.moveTo(q.x + ox, Y(q, i - 1) + oy); open = true;
        }
        cx.lineTo(p.x + ox, Y(p, i) + oy);
      }
      if (w >= 0) cx.stroke();
    }
    cx.globalAlpha = 1;
    // knock the pores out, then anything rubbed off with the eraser
    cx.globalCompositeOperation = 'destination-out';
    cx.fillStyle = pores; cx.fillRect(0, sy, W, H);
    for (const r of rubs) {
      if (r.y < top - 40 || r.y > bot + 40) continue;
      const g = cx.createRadialGradient(r.x, r.y, 4, r.x, r.y, 34);
      g.addColorStop(0, 'rgba(0,0,0,.95)'); g.addColorStop(1, 'rgba(0,0,0,0)');
      cx.fillStyle = g; cx.fillRect(r.x - 34, r.y - 34, 68, 68);
    }
    cx.globalCompositeOperation = 'source-over';
    // a smear where the eraser went
    cx.fillStyle = 'rgba(239,231,211,.018)';
    for (const r of rubs) { if (r.y > top && r.y < bot) { cx.beginPath(); cx.ellipse(r.x, r.y, 36, 17, 0, 0, 6.3); cx.fill(); } }
    // dust falling off the chalk
    cx.setTransform(dpr, 0, 0, dpr, 0, 0);
    cx.fillStyle = CHALK;
    for (let i = dust.length - 1; i >= 0; i--) {
      const d = dust[i]; d.life -= dt; if (d.life <= 0) { dust.splice(i, 1); continue; }
      d.vy += 60 * dt; d.x += d.vx * dt; d.y += d.vy * dt;
      cx.globalAlpha = Math.min(.7, d.life * .9); cx.fillRect(d.x, d.y, d.r, d.r);
    }
    cx.globalAlpha = 1;
    if (again || dust.length) kick();
    // dust comes off the tip while the line is being drawn
    if (again && n > 1 && !reduce && Math.random() < .5) { const p = P[n - 1]; if (p.y > top && p.y < bot) dust.push({ x: p.x, y: p.y - sy, vx: (Math.random() - .5) * 30, vy: 10, life: .9, r: 1 + Math.random() * 1.5 }); }
  };

  size(); build();
  addEventListener('scroll', kick, { passive: true });
  let lastW = innerWidth, rt;
  const rebuild = () => { clearTimeout(rt); rt = setTimeout(() => { size(); build(); lastW = innerWidth; }, 160); };
  addEventListener('resize', () => { if (innerWidth === lastW) { size(); kick(); } else rebuild(); });
  if (window.ResizeObserver) new ResizeObserver(rebuild).observe(document.body);
  addEventListener('load', rebuild);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(rebuild);
  // on the home page the line waits for the signature to finish writing
  setTimeout(() => { armed = true; kick(); }, reduce ? 0 : ($('.sig-write') && scrollY < 40 ? 2200 : 350));

  // a plucked line: the music page waves shake when you point at them
  const pluckEl = (el, hold) => { if (el && el._mk && !reduce) { pluck = { m: el._mk, a: hold ? .2 : 1, hold: !!hold }; kick(); } };
  $$('.panel').forEach(p => {
    const w = $('.wave', p);
    p.addEventListener('pointerenter', () => pluckEl(w));
    p.addEventListener('focusin', () => pluckEl(w));
  });

  // chalk dust under the pointer, and press-and-hold to rub the board
  if (fine) {
    const er = $('.eraser'); let lx = 0, ly = 0, holdT = 0, rubbing = false, rx = 0, ry = 0;
    const rub = (x, y) => { rubs.push({ x, y: y + scrollY }); if (rubs.length > 260) rubs.shift(); };
    addEventListener('pointermove', e => {
      if (rubbing) {
        er.style.transform = `translate(${e.clientX}px,${e.clientY}px) rotate(-8deg)`;
        const d = Math.hypot(e.clientX - rx, e.clientY - ry), k = Math.ceil(d / 14);
        for (let i = 1; i <= k; i++) rub(rx + (e.clientX - rx) * i / k, ry + (e.clientY - ry) * i / k);
        rx = e.clientX; ry = e.clientY; kick(); return;
      }
      if (holdT && Math.hypot(e.clientX - rx, e.clientY - ry) > 8) { clearTimeout(holdT); holdT = 0; }
      if (reduce || Math.hypot(e.clientX - lx, e.clientY - ly) < 26) return;
      lx = e.clientX; ly = e.clientY;
      if (dust.length < 50) { dust.push({ x: lx, y: ly, vx: (Math.random() - .5) * 26, vy: 6, life: .8, r: 1 + Math.random() * 1.4 }); kick(); }
    }, { passive: true });
    addEventListener('pointerdown', e => {
      if (e.button !== 0 || e.target.closest('a,button,input,textarea,select,label,iframe,dialog,#pad,.nav')) return;
      rx = e.clientX; ry = e.clientY;
      holdT = setTimeout(() => {
        holdT = 0; rubbing = true; root.classList.add('erasing');
        const sel = getSelection && getSelection(); if (sel) sel.removeAllRanges();
        er.style.transform = `translate(${rx}px,${ry}px) rotate(-8deg)`; rub(rx, ry); kick();
      }, 230);
    });
    const stop = () => { clearTimeout(holdT); holdT = 0; if (rubbing) { rubbing = false; root.classList.remove('erasing'); } };
    addEventListener('pointerup', stop); addEventListener('pointercancel', stop); addEventListener('blur', stop);
  }

  /* ---------- changing pages: the eraser wipes the board ---------- */
  const fl = $('#flip'), fx = fl.getContext('2d');
  const fSize = () => { fl.width = Math.ceil(innerWidth / 2); fl.height = Math.ceil(innerHeight / 2); };
  const streaks = (a) => {
    const w = fl.width, h = fl.height, r = rng(91);
    fx.lineCap = 'round';
    for (let i = 0; i < 46; i++) {
      const y = r() * h, x = r() * w - w * .2, len = w * (.25 + r() * .6);
      fx.strokeStyle = `rgba(239,231,211,${(.02 + r() * .05) * a})`; fx.lineWidth = 2 + r() * 16;
      fx.beginPath(); fx.moveTo(x, y); fx.lineTo(x + len, y + (r() - .5) * 14); fx.stroke();
    }
  };
  const wipe = (then) => {
    if (reduce) { then(); return; }
    fSize(); fl.style.transition = ''; fl.style.opacity = 1;
    const w = fl.width, h = fl.height, t0 = performance.now(), dur = 430, bands = 3;
    fx.clearRect(0, 0, w, h);
    let prev = 0;
    const step = (now) => {
      const t = Math.min(1, (now - t0) / dur);
      fx.lineCap = 'round'; fx.strokeStyle = BOARD; fx.lineWidth = h / bands * 1.35;
      for (let p = prev; p < t; p += .012) {
        const band = Math.min(bands - 1, Math.floor(p * bands)), u = p * bands - band, dir = band % 2 ? 1 - u : u;
        const x = -w * .15 + dir * w * 1.3, y = h * (band + .5) / bands + Math.sin(u * 3) * h * .03;
        fx.beginPath(); fx.moveTo(x, y); fx.lineTo(x + .5, y); fx.stroke();
      }
      prev = t;
      if (t < 1) requestAnimationFrame(step);
      else { fx.fillStyle = BOARD; fx.fillRect(0, 0, w, h); streaks(1); then(); }
    };
    requestAnimationFrame(step);
  };
  // arriving: the board clears, the smears take a moment longer
  if (!reduce && sessionStorage.getItem('mc_wipe')) {
    sessionStorage.removeItem('mc_wipe');
    fSize(); fl.style.opacity = 1;
    const w = fl.width, h = fl.height, t0 = performance.now();
    const step = (now) => {
      const t = Math.min(1, (now - t0) / 380);
      fx.clearRect(0, 0, w, h); fx.fillStyle = `rgba(16,19,18,${1 - t})`; fx.fillRect(0, 0, w, h); streaks(1);
      if (t < 1) requestAnimationFrame(step); else { fl.style.transition = 'opacity 2.2s'; fl.style.opacity = 0; }
    };
    step(t0);
  }
  document.addEventListener('click', e => {
    const a = e.target.closest('a[href]');
    if (!a || e.defaultPrevented || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || a.target === '_blank' || a.hasAttribute('download')) return;
    const url = new URL(a.href, location.href);
    if (url.origin !== location.origin || url.pathname.startsWith('/admin') || (url.pathname === location.pathname && url.hash)) return;
    if (url.href === location.href) { e.preventDefault(); return; }
    e.preventDefault();
    try { sessionStorage.setItem('mc_wipe', '1'); } catch (_) {}
    wipe(() => { location.href = url.href; });
  });
  addEventListener('pageshow', e => { if (e.persisted) { fl.style.transition = ''; fl.style.opacity = 0; } });

  /* ---------- menu ---------- */
  const nav = $('#nav'), btn = $('#menuBtn');
  if (btn) btn.addEventListener('click', () => {
    const open = nav.classList.toggle('open');
    btn.setAttribute('aria-expanded', open);
    btn.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
    document.body.style.overflow = open ? 'hidden' : '';
  });
  const dds = $$('.dd');
  const closeDds = (except) => dds.forEach(d => { if (d !== except) { d.classList.remove('open'); $('.dd-b', d).setAttribute('aria-expanded', 'false'); } });
  dds.forEach(d => {
    const b = $('.dd-b', d);
    b.addEventListener('click', () => { const open = !d.classList.contains('open'); closeDds(d); d.classList.toggle('open', open); b.setAttribute('aria-expanded', open); });
    if (matchMedia('(hover:hover) and (min-width:901px)').matches) {
      d.addEventListener('mouseenter', () => b.setAttribute('aria-expanded', 'true'));
      d.addEventListener('mouseleave', () => { if (!d.classList.contains('open')) b.setAttribute('aria-expanded', 'false'); });
    }
  });
  document.addEventListener('click', e => { if (!e.target.closest('.dd')) closeDds(); });
  addEventListener('keydown', e => {
    if (e.key !== 'Escape') return;
    if (dds.some(d => d.classList.contains('open'))) { closeDds(); return; }
    if (nav && nav.classList.contains('open')) btn.click();
  });

  /* ---------- reveals ---------- */
  $$('.fade').forEach(el => {
    const sib = [...el.parentElement.children].filter(c => c.classList.contains('fade'));
    el.style.transitionDelay = Math.min(sib.indexOf(el), 6) * .06 + 's';
  });
  const io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } }), { threshold: .12 });
  $$('.rv,.fade').forEach(el => io.observe(el));

  /* ---------- press filters ---------- */
  const fbtns = $$('.filters button');
  fbtns.forEach(b => b.addEventListener('click', () => {
    fbtns.forEach(x => x.setAttribute('aria-pressed', x === b));
    const f = b.dataset.f, items = $$('#pressList > li');
    items.forEach(li => { if (!li.hasAttribute('data-yr')) li.hidden = !(f === 'all' || li.dataset.k === f); });
    items.forEach((li, i) => {
      if (!li.hasAttribute('data-yr')) return;
      let any = false;
      for (let j = i + 1; j < items.length && !items[j].hasAttribute('data-yr'); j++) if (!items[j].hidden) any = true;
      li.hidden = !any;
    });
  }));

  /* ---------- photo viewer ---------- */
  const figs = $$('.ph-fig');
  if (figs.length) {
    const lb = $('#lb'), lbImg = $('#lbImg'), lbCap = $('#lbCap'), lbNum = $('#lbNum');
    let cur = 0;
    const showPh = (i) => {
      cur = (i + figs.length) % figs.length; const f = figs[cur];
      const gi = $('img', f), webp = $('source[type="image/webp"]', f);
      lbImg.sizes = '(max-width: 900px) 100vw, 70vw'; lbImg.srcset = webp ? webp.srcset : (gi ? gi.srcset : ''); lbImg.src = gi ? gi.src : f.dataset.full; lbImg.alt = f.dataset.alt; lbCap.textContent = f.dataset.cap; lbNum.textContent = `${cur + 1} of ${figs.length}`;
    };
    figs.forEach((f, i) => f.addEventListener('click', () => { showPh(i); try { lb.showModal(); } catch (_) { lb.setAttribute('open', ''); } }));
    $('#lbPrev').onclick = () => showPh(cur - 1);
    $('#lbNext').onclick = () => showPh(cur + 1);
    $('#lbClose').onclick = () => lb.close();
    lb.addEventListener('keydown', e => { if (e.key === 'ArrowLeft') showPh(cur - 1); if (e.key === 'ArrowRight') showPh(cur + 1); });
    lb.addEventListener('click', e => { if (e.target === lb) lb.close(); });
    let sx = null;
    lb.addEventListener('touchstart', e => sx = e.touches[0].clientX, { passive: true });
    lb.addEventListener('touchend', e => { if (sx === null) return; const dx = e.changedTouches[0].clientX - sx; if (Math.abs(dx) > 50) showPh(cur + (dx < 0 ? 1 : -1)); sx = null; });
  }

  /* ---------- video player ---------- */
  const tvp = $('#tvp'), slot = $('#tvSlot'), tvTitle = $('#tvTitle'), tvOut = $('#tvOut');
  const openVideo = (el) => {
    const id = el.dataset.yt, list = el.dataset.ytlist;
    const src = id ? `https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0&playsinline=1&modestbranding=1`
                   : `https://www.youtube-nocookie.com/embed/videoseries?list=${list}&autoplay=1&rel=0&playsinline=1`;
    tvTitle.textContent = el.dataset.title || '';
    tvOut.href = id ? `https://www.youtube.com/watch?v=${id}` : `https://www.youtube.com/playlist?list=${list}`;
    slot.innerHTML = '';
    const f = document.createElement('iframe');
    f.src = src; f.title = (el.dataset.title || 'Video') + ' on YouTube';
    f.allow = 'autoplay; encrypted-media; picture-in-picture; fullscreen'; f.allowFullscreen = true;
    f.referrerPolicy = 'strict-origin-when-cross-origin';
    slot.appendChild(f);
    try { tvp.showModal(); } catch (_) { tvp.setAttribute('open', ''); }
    // the song's line keeps shaking while it plays
    const panel = el.closest('.panel'); if (panel) pluckEl($('.wave', panel), true);
  };
  document.addEventListener('click', e => {
    const t = e.target.closest('[data-yt],[data-ytlist]'); if (!t || !tvp) return;
    e.preventDefault(); openVideo(t);
  }, true);
  if (tvp) {
    $('#tvClose').onclick = () => tvp.close();
    tvp.addEventListener('close', () => { slot.innerHTML = ''; if (pluck) pluck.hold = false; });
    tvp.addEventListener('click', e => { if (e.target === tvp) tvp.close(); });
  }

  /* ---------- birthday countdown ---------- */
  const bd = $('#bdayDays');
  if (bd) {
    const m = +bd.dataset.m - 1, d = +bd.dataset.d, born = +bd.dataset.y;
    const now = new Date(), today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    let next = new Date(now.getFullYear(), m, d); if (next < today) next = new Date(now.getFullYear() + 1, m, d);
    const days = Math.round((next - today) / 864e5);
    bd.textContent = days === 0 ? 'Today' : days;
    $('#bdayAge').textContent = next.getFullYear() - born;
  }

  /* ---------- fans: the drawing board ---------- */
  const pad = $('#pad'); let padUsed = false;
  if (pad) {
    const px = pad.getContext('2d'), board = $('#padBoard'), hist = [];
    let color = CHALK, down = false, lx = 0, ly = 0;
    const pos = (e) => { const r = pad.getBoundingClientRect(); return [(e.clientX - r.left) * pad.width / r.width, (e.clientY - r.top) * pad.height / r.height]; };
    const dab = (x, y) => { for (let k = 0; k < 7; k++) { const a = Math.random() * 6.3, d = Math.random() * 6.5, s2 = 1.4 + Math.random() * 2.6; px.globalAlpha = .3 + Math.random() * .6; px.fillRect(x + Math.cos(a) * d, y + Math.sin(a) * d, s2, s2); } };
    const seg = (x, y) => { const d = Math.hypot(x - lx, y - ly), n = Math.max(1, Math.ceil(d / 3)); px.fillStyle = color; for (let i = 1; i <= n; i++) dab(lx + (x - lx) * i / n, ly + (y - ly) * i / n); px.globalAlpha = 1; lx = x; ly = y; };
    pad.addEventListener('pointerdown', e => {
      e.preventDefault(); pad.setPointerCapture(e.pointerId);
      hist.push(px.getImageData(0, 0, pad.width, pad.height)); if (hist.length > 8) hist.shift();
      down = true; [lx, ly] = pos(e); seg(lx + .1, ly + .1); padUsed = true; board.classList.add('used');
    });
    pad.addEventListener('pointermove', e => { if (!down) return; (e.getCoalescedEvents ? e.getCoalescedEvents() : [e]).forEach(ev => { const [x, y] = pos(ev); seg(x, y); }); });
    const up = () => { down = false; };
    pad.addEventListener('pointerup', up); pad.addEventListener('pointercancel', up);
    $$('[data-chalk-color]').forEach(b => b.addEventListener('click', () => { color = b.dataset.chalkColor; $$('[data-chalk-color]').forEach(x => x.setAttribute('aria-pressed', x === b)); }));
    $('#padUndo').onclick = () => { const h = hist.pop(); if (h) px.putImageData(h, 0, 0); if (!hist.length) { padUsed = false; board.classList.remove('used'); } };
    $('#padClear').onclick = () => { hist.length = 0; px.clearRect(0, 0, pad.width, pad.height); padUsed = false; board.classList.remove('used'); };
  }

  /* ---------- Netlify forms: send without leaving the page ---------- */
  $$('form[data-netlify]').forEach(f => f.addEventListener('submit', async e => {
    e.preventDefault();
    const st = $('.status', f), b = $('button[type=submit]', f), fan = f.id === 'fanForm';
    if (fan && !padUsed && !f.link.value.trim() && !f.note.value.trim()) { st.textContent = 'Draw something, write a few words or add a link first.'; return; }
    b.disabled = true; st.textContent = 'Sending…';
    try {
      const fd = new FormData(f); let res;
      if (fan) {
        fd.delete('drawing');
        if (padUsed) fd.set('drawing', await new Promise(r => pad.toBlob(r, 'image/png')), 'drawing.png');
        res = await fetch('/', { method: 'POST', body: fd });
      } else res = await fetch('/', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(fd).toString() });
      if (!res.ok) throw new Error(res.status);
      st.textContent = f.dataset.thanks || 'Thanks.'; f.reset();
      if (fan && padUsed) $('#padClear').click();
    } catch (err) {
      st.textContent = 'That didn’t go through. Try again in a minute.';
    }
    b.disabled = false;
  }));
})();
