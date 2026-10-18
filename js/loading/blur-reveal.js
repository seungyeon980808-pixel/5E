/*
 * BlurReveal — 흐린 상태에서 이미지가 점점 드러나는 로딩 효과 (의존성 없음)
 *
 * 성능 원칙
 *  - 매 프레임 blur 값을 바꾸지 않는다. 시작 시 한 번만 저해상도·블러 사본(레벨) 3장을 만든다.
 *  - 이후 움직임은 opacity / transform 애니메이션(Web Animations)만 사용한다.
 *    → 브라우저 컴포지터에서 돌아가므로 메인 스레드가 바빠도 끊기지 않고, 작업 시간을 빼앗지 않는다.
 *  - 결과가 빨리 오면(instantMs 이내) 효과를 생략한다. 결과 표시를 일부러 늦추는 시간은 없다.
 *
 * 사용법
 *  const r = BlurReveal.attach(frameEl, { variant: 'fade' });
 *  r.start(placeholder);   // 지금 장면과 관련된 원천: 기존 썸네일, 수정 전 이미지, 작은 미리보기 등
 *  r.update(intermediate); // 생성 중간 결과 (블러 진행 상태를 유지한 채 교체)
 *  r.complete(finalSrc);   // 실제 완료 신호 → 선명하게 정착
 *  원천은 URL 문자열, <img>, <canvas>, ImageBitmap 모두 가능.
 */
(function (global) {
  'use strict';

  var DEFAULTS = {
    variant: 'fade',      // 'fade' 블러업 | 'sweep' 위→아래 | 'focus' 초점 맞추기
    startBlur: 0.12,      // 처음에는 선과 글자를 읽을 수 없을 정도로 흐리게
    residualBlur: 0.018,  // 완료 전에는 이동하는 초점 안에서도 흐림을 유지한다
    revealMs: 8000,       // 3배 시간에 걸쳐 큰 윤곽을 드러낸다. 진행률을 뜻하지 않는다
    settleMs: 320,        // 실제 완료 신호에 맞춰 선명한 결과로 전환
    instantMs: 150,       // 결과가 이 시간 안에 오면 효과 없이 바로 표시
    driven: false,        // true면 시간 대신 progress(0~1) 값만큼 선명해진다 (실제 단계 진행)
    fit: 'contain',         // 'cover' | 'contain'
    reducedMotion: null   // null이면 OS의 '동작 줄이기' 설정을 따른다
  };

  // 레벨별 해상도·블러·톤. 블러가 강할수록 살짝 어둡게 해서 흰 종이가 어두운 화면에서 튀지 않게 한다.
  var LEVELS = [
    { scale: 0.18, blur: 1.0,  tone: { b: 0.68, c: 1.12 } },
    { scale: 0.30, blur: 0.35, tone: { b: 0.84, c: 1.08 } },
    { scale: 0.50, blur: 0,    tone: { b: 0.96, c: 1.03 } } // blur 0 → residualBlur 사용
  ];
  var EASE = 'cubic-bezier(.22,.61,.36,1)';

  var canFilter = (function () {
    try { return typeof document.createElement('canvas').getContext('2d').filter === 'string'; }
    catch (e) { return false; }
  })();

  function el(tag, cls) { var n = document.createElement(tag); if (cls) n.className = cls; return n; }
  function canvas(w, h) { var c = el('canvas'); c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(h)); return c; }
  function srcSize(s) { return [s.naturalWidth || s.videoWidth || s.width, s.naturalHeight || s.videoHeight || s.height]; }

  function loadSource(src) {
    if (typeof src === 'string') {
      var img = new Image();
      img.decoding = 'async';
      img.src = src;
      return img.decode().then(function () { return img; });
    }
    if (src instanceof HTMLImageElement && !src.complete) return src.decode().then(function () { return src; });
    return Promise.resolve(src);
  }

  function fitRect(sw, sh, dw, dh, fit) {
    var k = fit === 'contain' ? Math.min(dw / sw, dh / sh) : Math.max(dw / sw, dh / sh);
    var w = sw * k, h = sh * k;
    return [(dw - w) / 2, (dh - h) / 2, w, h];
  }

  // 저해상도 블러 사본 1장. 가장자리를 복제해 두고 흐리므로 블러가 프레임 밖으로 번지거나 테두리가 어두워지지 않는다.
  function renderLevel(src, cssW, cssH, level, radiusCss, fit) {
    var w = Math.max(4, Math.round(cssW * level.scale));
    var h = Math.max(4, Math.round(cssH * level.scale));
    var r = radiusCss * level.scale;
    var pad = Math.ceil(r * 2) + 2;
    var W = w + pad * 2, H = h + pad * 2;

    var tmp = canvas(W, H), t = tmp.getContext('2d');
    var ss = srcSize(src), fr = fitRect(ss[0], ss[1], w, h, fit);
    t.save();
    t.beginPath(); t.rect(pad, pad, w, h); t.clip();
    t.fillStyle = '#fff'; t.fillRect(pad, pad, w, h);
    t.drawImage(src, pad + fr[0], pad + fr[1], fr[2], fr[3]);
    t.restore();
    // 가장자리 복제 (edge clamp)
    t.drawImage(tmp, pad, pad, 1, h, 0, pad, pad, h);
    t.drawImage(tmp, pad + w - 1, pad, 1, h, pad + w, pad, pad, h);
    t.drawImage(tmp, 0, pad, W, 1, 0, 0, W, pad);
    t.drawImage(tmp, 0, pad + h - 1, W, 1, 0, pad + h, W, pad);

    var out = canvas(w, h), o = out.getContext('2d');
    if (canFilter) {
      o.filter = 'blur(' + r.toFixed(2) + 'px) brightness(' + level.tone.b + ') contrast(' + level.tone.c + ')';
      o.drawImage(tmp, -pad, -pad);
    } else {
      // ctx.filter 미지원(일부 Safari): 축소 후 확대로 블러를 근사하고, 어둡게 하기만 적용
      var k = Math.max(1, r / 1.5);
      var small = canvas(W / k, H / k), s = small.getContext('2d');
      s.imageSmoothingQuality = 'high';
      s.drawImage(tmp, 0, 0, small.width, small.height);
      o.imageSmoothingQuality = 'high';
      o.drawImage(small, -pad, -pad, W, H);
      o.fillStyle = 'rgba(0,0,0,' + (1 - level.tone.b).toFixed(3) + ')';
      o.fillRect(0, 0, w, h);
    }
    out.className = 'br-layer';
    return out;
  }

  function Reveal(frame, opts) {
    this.frame = frame;
    this.o = Object.assign({}, DEFAULTS, opts || {});
    this.state = 'idle';
    this.prepMs = 0;
    this.animations = new Set();
    frame.classList.add('br-frame');
    this.stage = el('div', 'br-stage');
    this.bar = el('div', 'br-bar');
    this.barFill = el('div', 'br-bar-fill');
    this.bar.appendChild(this.barFill);
    frame.prepend(this.stage);
    frame.appendChild(this.bar);
  }

  Reveal.prototype = {
    set: function (opts) { Object.assign(this.o, opts); return this; },

    reduced: function () {
      if (this.o.reducedMotion != null) return this.o.reducedMotion;
      return global.matchMedia && global.matchMedia('(prefers-reduced-motion: reduce)').matches;
    },

    elapsed: function () { return performance.now() - this.t0; },

    // 실제 진행률(0~1)에 맞춰 흐림을 걷는다. 앞으로만 간다.
    progress: function (p) {
      p = Math.max(this.progressValue || 0, Math.min(1, Math.max(0, p || 0)));
      this.progressValue = p;
      if (this.stack && this.stack.timeline) {
        var total = this.stack.total;
        this.stack.timeline.forEach(function (a) { a.pause(); a.currentTime = p * total; });
      }
      return this;
    },

    start: function (placeholder, elapsedMs) {
      this.reset();
      this.state = 'loading';
      this.progressValue = 0;
      this.t0 = performance.now() - Math.max(0, elapsedMs || 0);
      this.token = {};
      this.frame.classList.add('is-loading');
      this.frame.setAttribute('aria-busy', 'true');
      this._emit('loading');
      this._startBar();
      return placeholder == null ? Promise.resolve() : this._show(placeholder, this.token, 0);
    },

    update: function (src) {
      if (this.state !== 'loading') return Promise.resolve();
      return this._show(src, this.token, 240);
    },

    complete: function (finalSrc) {
      if (this.state !== 'loading') return Promise.resolve();
      var self = this, tok = this.token;
      this.state = 'settling';
      return loadSource(finalSrc).then(function (src) {
        if (tok !== self.token) return;
        self.frame.dataset.loadingPhase = 'settling';
        var layer = self._finalLayer(src);
        var instant = !self.stack || self.elapsed() < self.o.instantMs;
        var dur = self.reduced() ? 200 : self.o.settleMs;
        self._finishBar(instant);
        var done = function () {
          if (tok !== self.token) return;
          Array.prototype.slice.call(self.stage.children).forEach(function (n) { if (n !== layer) n.remove(); });
          self.stack = null;
          self.state = 'done';
          delete self.frame.dataset.loadingPhase;
          self.frame.classList.remove('is-loading');
          self.frame.removeAttribute('aria-busy');
          self._emit('done');
        };
        if (instant) { layer.style.opacity = 1; done(); return; }
        if (self.o.variant === 'focus' && self.stack && !self.reduced()) {
          var cur = getComputedStyle(self.stack.root).transform;
          self.stack.root.getAnimations().forEach(function (a) { a.cancel(); });
          self._animate(self.stack.root, [{ transform: cur === 'none' ? 'none' : cur }, { transform: 'scale(1)' }],
            { duration: dur, easing: EASE, fill: 'forwards' });
          self._animate(layer, [{ transform: cur === 'none' ? 'none' : cur }, { transform: 'scale(1)' }],
            { duration: dur, easing: EASE, fill: 'forwards' });
        }
        return self._animate(layer, [{ opacity: 0 }, { opacity: 1 }], { duration: dur, easing: EASE, fill: 'forwards' })
          .finished.then(done, done);
      }).catch(function (error) {
        if (tok === self.token) { self.reset(); self.state = 'failed'; self._emit('failed'); }
        throw error;
      });
    },

    reset: function () {
      this.token = null;
      this.state = 'idle';
      delete this.frame.dataset.loadingPhase;
      this.stack = null;
      // getAnimations() omits detached descendants. A replaced preview can
      // still own paused animations that retain their canvases indefinitely.
      this.animations.forEach(function (a) { a.cancel(); });
      this.animations.clear();
      this.stage.getAnimations({subtree:true}).forEach(function (a) { a.cancel(); });
      this.stage.textContent = '';
      this.bar.getAnimations().concat(this.barFill.getAnimations()).forEach(function (a) { a.cancel(); });
      this.bar.style.opacity = 0;
      this.frame.classList.remove('is-loading');
      this.frame.removeAttribute('aria-busy');
    },

    destroy: function () { this.reset(); this.stage.remove(); this.bar.remove(); this.frame.classList.remove('br-frame'); },

    // ---- 내부 ----

    _animate: function (node, frames, options) {
      var animation = node.animate(frames, options);
      this.animations.add(animation);
      return animation;
    },

    _emit: function (state) {
      this.frame.dispatchEvent(new CustomEvent('blurreveal', { detail: { state: state, reveal: this } }));
    },

    _show: function (srcIn, tok, fadeMs) {
      var self = this;
      return loadSource(srcIn).then(function (src) {
        if (tok !== self.token || self.state !== 'loading') return;
        var t = performance.now();
        var stack = self._buildStack(src);
        self.prepMs = performance.now() - t;
        var old = self.stack;
        self.stage.appendChild(stack.root);
        self.stack = stack;
        if (old && fadeMs) {
          self._animate(stack.root, [{ opacity: 0 }, { opacity: 1 }], { duration: fadeMs, easing: EASE })
            .finished.then(function () { old.root.remove(); }, function () {});
        } else if (old) {
          old.root.remove();
        }
      });
    },

    _buildStack: function (src) {
      var rect = this.frame.getBoundingClientRect(), W = rect.width, H = rect.height;
      var o = this.o, root = el('div', 'br-stack');
      var radii = [o.startBlur * W * LEVELS[0].blur, o.startBlur * W * LEVELS[1].blur, Math.max(o.residualBlur * W, 0.6)];
      var c = LEVELS.map(function (lv, i) { return renderLevel(src, W, H, lv, radii[i], o.fit); });
      var stack = { root: root, layers: c };

      if (this.reduced()) {
        // 동작 줄이기: 움직임 없이 중간 블러 한 장만 보여 주고, 완료 시 짧게 교차 전환
        root.appendChild(c[1]);
        return stack;
      }

      var D = o.revealMs, total = D * 3, e = this.elapsed(), self = this;
      stack.timeline = []; stack.total = total;
      var run = function (node, frames) {
        var a = self._animate(node, frames, { duration: total, easing: 'linear', fill: 'forwards' });
        if (o.driven) { a.pause(); a.currentTime = (self.progressValue || 0) * total; }
        else a.currentTime = Math.min(e, total);
        stack.timeline.push(a);
        return a;
      };
      var mid = [{ opacity: 0 }, { opacity: 0, offset: 0.06 }, { opacity: 0.5, offset: 0.4 }, { opacity: 1 }];
      var fine = [
        { opacity: 0, offset: 0 },
        { opacity: 0, offset: 0.04, easing: EASE },
        { opacity: 0.78, offset: 0.25, easing: 'ease-out' },
        { opacity: 1, offset: 1 }
      ];

      root.appendChild(c[0]);
      root.appendChild(c[1]);
      run(c[1], mid);

      if (o.variant === 'focus') {
        // A soft moving window shows the third, still-blurred level. The
        // counter-moving inner layer keeps the actual image geometry still.
        // All three blur canvases are prepared once; only transforms move.
        if (o.driven) {
          // 진행할수록 덜 흐린 레벨이 그림 전체에 깔린다. 지나가는 초점 창은 그대로 둔다.
          var whole = canvas(c[2].width, c[2].height);
          whole.getContext('2d').drawImage(c[2], 0, 0);
          whole.className = 'br-whole';
          whole.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block';
          root.appendChild(whole);
          run(whole, [{ opacity: 0 }, { opacity: 0, offset: 0.45 }, { opacity: 1 }]);
        }
        var scan = el('div', 'br-focus-window'), content = el('div', 'br-focus-content');
        content.appendChild(c[2]); scan.appendChild(content);
        scan.appendChild(el('div', 'br-focus-glow')); root.appendChild(scan);
      } else if (o.variant === 'sweep') {
        // 위→아래로 덜 흐린 레벨이 내려오며 드러난다 (부드러운 경계, transform만 사용)
        var win = el('div', 'br-sweep'), inner = el('div', 'br-sweep-inner');
        var hw = H * 1.25;
        inner.appendChild(c[2]);
        win.appendChild(inner);
        root.appendChild(win);
        run(win, [
          { transform: 'translateY(' + (-hw) + 'px)', easing: EASE },
          { transform: 'translateY(' + (-hw * 0.14) + 'px)', offset: 0.33, easing: 'ease-out' },
          { transform: 'translateY(0px)' }
        ]);
        run(inner, [
          { transform: 'translateY(' + hw + 'px)', easing: EASE },
          { transform: 'translateY(' + (hw * 0.14) + 'px)', offset: 0.33, easing: 'ease-out' },
          { transform: 'translateY(0px)' }
        ]);
      } else {
        root.appendChild(c[2]);
        run(c[2], fine);
      }
      return stack;
    },

    _finalLayer: function (src) {
      var layer;
      if (src instanceof HTMLImageElement) {
        layer = el('img', 'br-final');
        layer.alt = '';
        layer.decoding = 'sync';
        layer.src = src.currentSrc || src.src;
      } else {
        var rect = this.frame.getBoundingClientRect(), dpr = global.devicePixelRatio || 1;
        layer = canvas(rect.width * dpr, rect.height * dpr);
        layer.className = 'br-final';
        var ss = srcSize(src), fr = fitRect(ss[0], ss[1], layer.width, layer.height, this.o.fit);
        layer.getContext('2d').drawImage(src, fr[0], fr[1], fr[2], fr[3]);
      }
      layer.style.objectFit = this.o.fit;
      layer.style.opacity = 0;
      this.stage.appendChild(layer);
      return layer;
    },

    _startBar: function () {
      if (this.reduced()) { this.bar.style.opacity = 1; this.barFill.style.transform = 'scaleX(.4)'; return; }
      this.barFill.style.transform = '';
      this._animate(this.bar, [{ opacity: 0 }, { opacity: 1 }], { duration: 200, delay: this.o.instantMs, fill: 'forwards' });
      this._animate(this.barFill, [
        { transform: 'scaleX(0)', easing: EASE },
        { transform: 'scaleX(.72)', offset: 0.33, easing: 'ease-out' },
        { transform: 'scaleX(.94)' }
      ], { duration: this.o.revealMs * 3, fill: 'forwards' });
    },

    _finishBar: function (instant) {
      var fill = this.barFill, bar = this.bar;
      var cur = getComputedStyle(fill).transform;
      fill.getAnimations().forEach(function (a) { a.cancel(); });
      bar.getAnimations().forEach(function (a) { a.cancel(); });
      if (instant) { bar.style.opacity = 0; return; }
      this._animate(fill, [{ transform: cur === 'none' ? 'scaleX(0)' : cur }, { transform: 'scaleX(1)' }],
        { duration: 180, easing: EASE, fill: 'forwards' });
      this._animate(bar, [{ opacity: getComputedStyle(bar).opacity }, { opacity: 0 }],
        { duration: 260, delay: 160, fill: 'forwards' });
    }
  };

  global.BlurReveal = {
    defaults: DEFAULTS,
    attach: function (frame, opts) { return new Reveal(frame, opts); }
  };
})(typeof window === 'undefined' ? globalThis : window);

export const BlurReveal = globalThis.BlurReveal;
