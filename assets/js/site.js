// Miles Caton fan site. No libraries.
(() => {
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const fine = matchMedia('(pointer:fine)').matches;
  const root = document.documentElement;
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];

  /* ---------- noise ---------- */
  const noiseFrames = (w, h, n) => {
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const x = c.getContext('2d'), out = [];
    for (let f = 0; f < n; f++) {
      const img = x.createImageData(w, h), d = img.data;
      for (let i = 0; i < d.length; i += 4) { const v = Math.random() * 255 | 0; d[i] = d[i + 1] = d[i + 2] = v; d[i + 3] = 255; }
      out.push(img);
    }
    return out;
  };
  (() => {
    const c = document.createElement('canvas'); c.width = c.height = 90;
    c.getContext('2d').putImageData(noiseFrames(90, 90, 1)[0], 0, 0);
    root.style.setProperty('--noise', `url(${c.toDataURL()})`);
  })();

  /* channel change: a short burst of static */
  const fl = $('#flip'), fx = fl.getContext('2d'); let fF = [];
  // frames are made the first time they're needed, not on page load
  const fSize = () => { fl.width = Math.ceil(innerWidth / 6); fl.height = Math.ceil(innerHeight / 6); fF = noiseFrames(fl.width, fl.height, 3); };
  const flip = (then, keep) => {
    if (reduce) { then(); return; }
    if (!fF.length) fSize();
    let k = 0; fl.style.transition = ''; fl.style.opacity = 1;
    const step = () => {
      fx.putImageData(fF[k % 3], 0, 0);
      if (k === 2) then();
      if (++k < 6 || keep) { if (k < 40) setTimeout(step, 45); }
      else { fl.style.transition = 'opacity .2s'; fl.style.opacity = 0; }
    };
    step();
  };
  // arriving on a page: fade the static out
  if (!reduce && sessionStorage.getItem('mc_flip')) {
    sessionStorage.removeItem('mc_flip');
    fSize(); fl.style.opacity = 1; fx.putImageData(fF[0], 0, 0);
    requestAnimationFrame(() => { fl.style.transition = 'opacity .35s'; fl.style.opacity = 0; });
  }
  // leaving: static, then go
  document.addEventListener('click', e => {
    const a = e.target.closest('a[href]');
    if (!a || e.defaultPrevented || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || a.target === '_blank' || a.hasAttribute('download')) return;
    const url = new URL(a.href, location.href);
    if (url.origin !== location.origin || url.pathname.startsWith('/admin') || (url.pathname === location.pathname && url.hash)) return;
    if (url.href === location.href) { e.preventDefault(); return; }
    e.preventDefault();
    try { sessionStorage.setItem('mc_flip', '1'); } catch (_) {}
    flip(() => { location.href = url.href; }, true);
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

  /* ---------- the tv on the homepage ---------- */
  const box = $('#static'), cv = $('#tv');
  if (box && cv) {
    let gl = null, prog, U = {}, t0 = performance.now(), level = 1, raf = 0, last = 0, tex = null, burst = 0, wantPhoto = '';
    const pics = {};
    // put a photo inside the static (or none). Loads once, then reuses it.
    const setPhoto = (src) => {
      wantPhoto = src || '';
      if (!gl) return;
      if (!src) { gl.uniform1f(U.has, 0); return; }
      const use = (img) => {
        if (wantPhoto !== src) return;
        gl.bindTexture(gl.TEXTURE_2D, tex);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
        [[gl.TEXTURE_MIN_FILTER, gl.LINEAR], [gl.TEXTURE_MAG_FILTER, gl.LINEAR], [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE]].forEach(([k, v]) => gl.texParameteri(gl.TEXTURE_2D, k, v));
        gl.uniform1i(U.img, 0); gl.uniform2f(U.ires, img.width, img.height); gl.uniform1f(U.has, 1);
      };
      if (pics[src] && pics[src].complete) use(pics[src]);
      else { gl.uniform1f(U.has, 0); const img = pics[src] || (pics[src] = new Image()); img.onload = () => use(img); if (!img.src) img.src = src; }
    };
    let mx = -1, my = -1, tx = 0, ty = 0, auto = true;
    const VS = 'attribute vec2 p;void main(){gl_Position=vec4(p,0.,1.);}';
    const FS = `precision mediump float;
      uniform vec2 res;uniform float t;uniform vec2 m;uniform float lvl;uniform float rad;uniform float grain;uniform sampler2D img;uniform vec2 ires;uniform float has;uniform float zoom;uniform float bur;
      float h(vec2 p){p=fract(p*vec2(443.897,441.423));p+=dot(p,p.yx+19.19);return fract((p.x+p.y)*p.x);}
      void main(){
        vec2 uv=gl_FragCoord.xy/res; vec2 c=uv-.5; float d=dot(c,c);
        vec2 bu=.5+c*(1.+.10*d);
        if(bu.x<0.||bu.x>1.||bu.y<0.||bu.y>1.){gl_FragColor=vec4(0.,0.,0.,1.);return;}
        float f=floor(t*24.);
        vec2 px=floor(bu*res/grain);
        float n=h(px+f*1.37), r=h(px+vec2(1.,0.)+f*1.37), b=h(px-vec2(1.,0.)+f*1.37);
        vec3 col=vec3(mix(n,r,.35),n,mix(n,b,.35));
        float scan=.84+.16*sin(bu.y*res.y*2.1);
        float roll=exp(-pow((fract(bu.y*.9-t*.06-bur*.35)-.5)*9.,2.));
        float q=smoothstep(rad*.35,rad,distance(gl_FragCoord.xy,m));
        float vig=smoothstep(.95,.25,length(c)*1.25);
        float sa=res.x/res.y, ia=ires.x/ires.y;
        vec2 sc=(sa>ia?vec2(1.,ia/sa):vec2(sa/ia,1.))*zoom;
        vec2 fo=clamp(vec2(.47,.36),min(sc*.5,vec2(.5)),max(1.-sc*.5,vec2(.5)));
        vec2 iu=vec2((bu.x-.5)*sc.x+fo.x+bur*.03*sin(bu.y*90.+t*50.),((1.-bu.y)-.5)*sc.y+fo.y);
        float edge=smoothstep(0.,.05,iu.x)*smoothstep(1.,.95,iu.x)*smoothstep(0.,.05,iu.y)*smoothstep(1.,.95,iu.y);
        float ph=smoothstep(.04,.92,has*dot(texture2D(img,clamp(iu,0.,1.)).rgb,vec3(.299,.587,.114))*edge)*(1.-bur);
        float a=mix(lvl*(.82+.18*roll),1.15,bur);
        vec3 stat=col*scan*a*vig*(.55+.75*ph*has+(1.-has)*.45)+roll*.06*vig;
        vec3 pic=vec3(ph)*(.9+.1*sin(bu.y*res.y*2.1))*vig*1.05;
        gl_FragColor=vec4(mix(pic,stat,max(q,bur)),1.);
      }`;
    const initGL = () => {
      try {
        gl = cv.getContext('webgl', { antialias: false });
        if (!gl) return false;
        const sh = (ty, s) => { const o = gl.createShader(ty); gl.shaderSource(o, s); gl.compileShader(o); if (!gl.getShaderParameter(o, gl.COMPILE_STATUS)) throw 0; return o; };
        prog = gl.createProgram(); gl.attachShader(prog, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FS));
        gl.linkProgram(prog); gl.useProgram(prog);
        gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
        const loc = gl.getAttribLocation(prog, 'p'); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
        ['res', 't', 'm', 'lvl', 'rad', 'grain', 'img', 'ires', 'has', 'zoom', 'bur'].forEach(k => U[k] = gl.getUniformLocation(prog, k));
        gl.uniform1f(U.has, 0); gl.uniform1f(U.bur, 0);
        tex = gl.createTexture();
        setPhoto(box.dataset.photo);
        return true;
      } catch (e) { gl = null; return false; }
    };
    let ctx2 = null, f2 = [], fi2 = 0;
    // the grain hides resolution, so render at most ~1000px wide and let the browser scale it up
    let quality = (navigator.hardwareConcurrency || 8) <= 4 || (navigator.connection && navigator.connection.saveData) ? .7 : 1;
    let DPR = Math.min(1, 1000 / Math.max(innerWidth, 1)) * quality;
    let frameGap = 40, costs = [];
    const size = () => {
      const r = box.getBoundingClientRect(); if (!r.width) return;
      if (gl) { cv.width = r.width * DPR; cv.height = r.height * DPR; gl.viewport(0, 0, cv.width, cv.height); }
      else { cv.width = Math.ceil(r.width / 3); cv.height = Math.ceil(r.height / 3); f2 = noiseFrames(cv.width, cv.height, 6); }
    };
    const start = () => {
    if (!initGL()) ctx2 = cv.getContext('2d');
    size();
    const draw = (now) => {
      raf = requestAnimationFrame(draw);
      if (now - last < frameGap) return; last = now;
      const t1 = performance.now();
      level = 1 - Math.min(1, (now - t0) / 2200) * .45;
      const wide = cv.width > cv.height;
      if (auto) { const k = now / 2800; tx = cv.width * ((wide ? .47 : .5) + (wide ? .16 : .12) * Math.cos(k)); ty = cv.height * ((wide ? .42 : .3) + (wide ? .14 : .07) * Math.sin(k * 1.3)); }
      if (mx < 0) { mx = tx; my = ty; }
      mx += (tx - mx) * .22; my += (ty - my) * .22;
      if (gl) {
        gl.uniform2f(U.res, cv.width, cv.height); gl.uniform1f(U.t, now / 1000);
        gl.uniform2f(U.m, mx, cv.height - my); gl.uniform1f(U.lvl, level);
        gl.uniform1f(U.rad, Math.max(cv.width, cv.height) * (wide ? .17 : .2)); gl.uniform1f(U.grain, Math.max(1, 2.6 * DPR));
        gl.uniform1f(U.zoom, cv.width > cv.height * 1.1 ? 1 : 1.16);
        burst = Math.max(0, burst - .09); gl.uniform1f(U.bur, burst);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      } else {
        const W = cv.width, H = cv.height;
        ctx2.putImageData(f2[fi2 = (fi2 + 1) % 6], 0, 0);
        ctx2.globalCompositeOperation = 'destination-out';
        ctx2.fillStyle = `rgba(0,0,0,${1 - level})`; ctx2.fillRect(0, 0, W, H);
        const R = Math.max(W, H) * .17, g = ctx2.createRadialGradient(mx, my, 0, mx, my, R);
        g.addColorStop(0, 'rgba(0,0,0,1)'); g.addColorStop(.5, 'rgba(0,0,0,.85)'); g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx2.fillStyle = g; ctx2.fillRect(mx - R, my - R, R * 2, R * 2); ctx2.globalCompositeOperation = 'source-over';
      }
      // slow device? draw smaller and less often until each frame is cheap
      costs.push(performance.now() - t1);
      if (costs.length === 8) {
        const avg = costs.reduce((a, b) => a + b, 0) / 8; costs = [];
        if (avg > 10 && quality > .35) { quality *= .7; DPR = Math.min(1, 1000 / Math.max(innerWidth, 1)) * quality; size(); }
        else if (avg > 10) frameGap = Math.min(frameGap * 1.5, 160);
      }
      if (reduce) cancelAnimationFrame(raf);
    };
    // only draw while the tv is on screen
    new IntersectionObserver(es => es.forEach(e => {
      cancelAnimationFrame(raf);
      if (e.isIntersecting) raf = requestAnimationFrame(draw);
    })).observe(box);
    if (fine) {
      box.addEventListener('pointermove', e => {
        const r = box.getBoundingClientRect(); auto = false;
        const s = cv.width / r.width; tx = (e.clientX - r.left) * s; ty = (e.clientY - r.top) * s;
      });
      box.addEventListener('pointerleave', () => { auto = true; });
    }
    addEventListener('resize', () => { clearTimeout(size.t); size.t = setTimeout(size, 150); });
    };
    box.classList.add('on-air');
    setTimeout(() => box.classList.add('drawn'), reduce ? 0 : 650);
    // start the tv once the page has finished loading, so it never delays first paint
    const idle = window.requestIdleCallback || ((f) => setTimeout(f, 200));
    if (document.readyState === 'complete') idle(start); else addEventListener('load', () => idle(start), { once: true });

    /* ---------- change the channel ---------- */
    const data = $('#chData');
    if (data) {
      const chans = JSON.parse(data.textContent), total = chans.length;
      const cards = $$('.ch-card', box), osd = $('#osd'), osdN = $('#osdN'), label = $('#chLabel');
      const pad = (n) => String(n).padStart(2, '0');
      let ch = 1, osdT;
      const show = (n, quiet) => {
        n = ((n - 1 + total) % total) + 1;
        if (n === ch && !quiet) return;
        ch = n;
        burst = reduce ? 0 : 1;
        const swap = () => {
          box.dataset.ch = n;
          cards.forEach(c => { const on = +c.dataset.n === n; c.classList.toggle('on', on); c.setAttribute('aria-hidden', !on); $$('a', c).forEach(a => a.tabIndex = on ? 0 : -1); });
          setPhoto(chans[n - 1].photo);
          osdN.textContent = pad(n);
          label.firstChild.nodeValue = `CH ${pad(n)} `;
          label.setAttribute('aria-label', `Channel ${n} of ${total}: ${chans[n - 1].title}`);
          osd.classList.add('show'); clearTimeout(osdT); osdT = setTimeout(() => osd.classList.remove('show'), 2200);
        };
        reduce ? swap() : setTimeout(swap, 140);
        // warm up the next channel's photo
        const nx = chans[n % total].photo; if (nx && !pics[nx]) { pics[nx] = new Image(); pics[nx].src = nx; }
      };
      $('#chPrev').addEventListener('click', () => show(ch - 1));
      $('#chNext').addEventListener('click', () => show(ch + 1));
      // keyboard: left/right and number keys while the tv is on screen
      let inView = true;
      new IntersectionObserver(es => es.forEach(e => inView = e.intersectionRatio > .4), { threshold: [0, .4, 1] }).observe(box);
      addEventListener('keydown', e => {
        if (!inView || e.altKey || e.ctrlKey || e.metaKey || /input|textarea|select/i.test(document.activeElement.tagName) || document.querySelector('dialog[open]')) return;
        if (e.key === 'ArrowRight') { e.preventDefault(); show(ch + 1); }
        else if (e.key === 'ArrowLeft') { e.preventDefault(); show(ch - 1); }
        else if (/^[1-9]$/.test(e.key) && +e.key <= total) show(+e.key);
      });
      // swipe sideways on touch screens; vertical swipes still scroll the page
      let sx = null, sy = null;
      box.addEventListener('touchstart', e => { sx = e.touches[0].clientX; sy = e.touches[0].clientY; }, { passive: true });
      box.addEventListener('touchend', e => {
        if (sx === null) return;
        const dx = e.changedTouches[0].clientX - sx, dy = e.changedTouches[0].clientY - sy; sx = null;
        if (Math.abs(dx) > 45 && Math.abs(dx) > Math.abs(dy) * 1.4) show(ch + (dx < 0 ? 1 : -1));
      });
      // sideways trackpad scroll
      let wheelT = 0;
      box.addEventListener('wheel', e => {
        if (Math.abs(e.deltaX) < 30 || Math.abs(e.deltaX) < Math.abs(e.deltaY)) return;
        e.preventDefault(); const now = Date.now(); if (now - wheelT < 600) return; wheelT = now;
        show(ch + (e.deltaX > 0 ? 1 : -1));
      }, { passive: false });
    }
  }

  /* ---------- reveals ---------- */
  $$('.rv').forEach(el => {
    const walk = (node) => [...node.childNodes].forEach(n => {
      if (n.nodeType === 3) {
        const frag = document.createDocumentFragment();
        n.textContent.split(/(\s+)/).forEach(part => {
          if (!part) return;
          if (/^\s+$/.test(part)) { frag.appendChild(document.createTextNode(part)); return; }
          const w = document.createElement('span'); w.className = 'w';
          const s = document.createElement('span'); s.textContent = part; w.appendChild(s); frag.appendChild(w);
        });
        n.replaceWith(frag);
      } else if (n.nodeType === 1 && !n.classList.contains('mk') && n.tagName !== 'SMALL') walk(n);
    });
    walk(el);
    $$('.w > span', el).forEach((s, i) => s.style.transitionDelay = Math.min(i * .035, .6) + 's');
  });
  $$('.fade').forEach(el => {
    const sib = [...el.parentElement.children].filter(c => c.classList.contains('fade'));
    el.style.transitionDelay = Math.min(sib.indexOf(el), 6) * .06 + 's';
  });
  const io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } }), { threshold: .15 });
  $$('.rv,.fade').forEach(el => io.observe(el));

  /* counters */
  const cio = new IntersectionObserver(es => es.forEach(e => {
    if (!e.isIntersecting) return; cio.unobserve(e.target);
    const el = e.target, n = +el.dataset.count; let i = 0;
    const tick = () => { el.textContent = i; if (i++ < n) setTimeout(tick, reduce ? 0 : 110); };
    tick();
  }), { threshold: .5 });
  $$('[data-count]').forEach(el => cio.observe(el));

  /* release title: one glitch when it comes into view */
  const rel = $('#rel');
  if (rel) new IntersectionObserver((es, o) => es.forEach(e => {
    if (e.isIntersecting && !reduce) { rel.classList.add('glitch'); setTimeout(() => rel.classList.remove('glitch'), 500); o.disconnect(); }
  }), { threshold: .6 }).observe(rel);

  /* ---------- story: the pinned year ---------- */
  const yrNum = $('#yrNum'), yrAge = $('#yrAge');
  if (yrNum) {
    const items = $$('.story li');
    const sio = new IntersectionObserver(es => es.forEach(e => {
      if (!e.isIntersecting) return;
      items.forEach(li => li.classList.toggle('cur-item', li === e.target));
      if (yrNum.textContent !== e.target.dataset.y) {
        yrNum.style.opacity = 0;
        setTimeout(() => { yrNum.textContent = e.target.dataset.y; yrAge.textContent = e.target.dataset.a; yrNum.style.opacity = 1; }, reduce ? 0 : 160);
      }
    }), { rootMargin: '-45% 0px -45% 0px' });
    items.forEach(li => sio.observe(li));
  }

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

  /* ---------- photos: reveal and viewer ---------- */
  const figs = $$('.ph-fig');
  if (figs.length) {
    const phIO = new IntersectionObserver(es => es.forEach(e => {
      if (!e.isIntersecting) return;
      const el = e.target; setTimeout(() => el.classList.add('in'), reduce ? 0 : 120 + (figs.indexOf(el) % 3) * 90); phIO.unobserve(el);
    }), { threshold: .2 });
    figs.forEach(el => phIO.observe(el));
    const lb = $('#lb'), lbImg = $('#lbImg'), lbCap = $('#lbCap'), lbNum = $('#lbNum');
    let cur = 0;
    const showPh = (i) => {
      cur = (i + figs.length) % figs.length; const f = figs[cur];
      const gi = $('img', f), webp = $('source[type="image/webp"]', f);
      lbImg.sizes = '(max-width: 900px) 100vw, 70vw'; lbImg.srcset = webp ? webp.srcset : (gi ? gi.srcset : ''); lbImg.src = gi ? gi.src : f.dataset.full; lbImg.alt = f.dataset.alt; lbCap.textContent = f.dataset.cap; lbNum.textContent = `${cur + 1} of ${figs.length}`;
    };
    const stepPh = (d) => flip(() => showPh(cur + d));
    figs.forEach((f, i) => f.addEventListener('click', () => { showPh(i); try { lb.showModal(); } catch (_) { lb.setAttribute('open', ''); } }));
    $('#lbPrev').onclick = () => stepPh(-1);
    $('#lbNext').onclick = () => stepPh(1);
    $('#lbClose').onclick = () => lb.close();
    lb.addEventListener('keydown', e => { if (e.key === 'ArrowLeft') stepPh(-1); if (e.key === 'ArrowRight') stepPh(1); });
    lb.addEventListener('click', e => { if (e.target === lb) lb.close(); });
    let sx = null;
    lb.addEventListener('touchstart', e => sx = e.touches[0].clientX, { passive: true });
    lb.addEventListener('touchend', e => { if (sx === null) return; const dx = e.changedTouches[0].clientX - sx; if (Math.abs(dx) > 50) stepPh(dx < 0 ? 1 : -1); sx = null; });
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
  };
  document.addEventListener('click', e => {
    const t = e.target.closest('[data-yt],[data-ytlist]'); if (!t || !tvp) return;
    e.preventDefault(); flip(() => openVideo(t));
  }, true);
  if (tvp) {
    $('#tvClose').onclick = () => tvp.close();
    tvp.addEventListener('close', () => { slot.innerHTML = ''; });
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

  /* ---------- Netlify forms: send without leaving the page ---------- */
  $$('form[data-netlify]').forEach(f => f.addEventListener('submit', async e => {
    e.preventDefault();
    const st = $('.status', f), b = $('button[type=submit]', f);
    b.disabled = true; st.textContent = 'Sending…';
    try {
      const res = await fetch('/', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(new FormData(f)).toString() });
      if (!res.ok) throw new Error(res.status);
      st.textContent = f.dataset.thanks || 'Thanks.'; f.reset();
    } catch (err) {
      st.textContent = 'That didn’t go through. Try again in a minute.';
    }
    b.disabled = false;
  }));

  /* ---------- cursor ---------- */
  if (fine && !reduce) {
    const dot = $('.cur'), ring = $('.cur-ring'), lab = $('span', ring);
    let x = -100, y = -100, rx = -100, ry = -100;
    addEventListener('pointermove', e => {
      if (rx < -99) { rx = e.clientX; ry = e.clientY; root.classList.add('cur-on'); }
      x = e.clientX; y = e.clientY; dot.style.transform = `translate(${x}px,${y}px)`;
    }, { passive: true });
    const loop = () => { rx += (x - rx) * .18; ry += (y - ry) * .18; ring.style.transform = `translate(${rx}px,${ry}px)`; requestAnimationFrame(loop); };
    loop();
    document.addEventListener('pointerover', e => { const t = e.target.closest('[data-cur]'); ring.classList.toggle('big', !!t); lab.textContent = t ? t.dataset.cur : ''; });
  }

  addEventListener('resize', () => { if (fF.length) { clearTimeout(fSize.t); fSize.t = setTimeout(fSize, 200); } });
})();
