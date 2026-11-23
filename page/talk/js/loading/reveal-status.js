/*
 * RevealStatus — BlurReveal 위에 얹는 5E 상태 표시 (빛줄기 + 5E 워드마크 + 상태 문구)
 *
 * 성능 원칙은 BlurReveal과 같다
 *  - 빛줄기와 5E 글자 속 빛은 transform 애니메이션만 쓴다 (컴포지터).
 *  - backdrop-filter는 쓰지 않는다 (아래 이미지가 움직이는 동안 매 프레임 다시 흐려야 해서 비싸다).
 *  - 문구 전환도 opacity / transform만 사용한다.
 *
 * 문구는 시간이 아니라 실제 신호에 맞춰 바꾼다.
 *  const s = RevealStatus.attach(frameEl, { layout: 'chip' });
 *  s.show('이미지 읽는 중');      // 요청 보냄
 *  s.set('새로 그리는 중', 2, 3);  // 첫 중간 결과 도착 (선택: 단계/전체)
 *  s.set('거의 다 됐어요', 3, 3);  // 마지막 단계 신호가 있을 때만
 *  s.done();                      // 실제 완료
 */
(function (global) {
  'use strict';

  var EASE = 'cubic-bezier(.22,.61,.36,1)';

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  function Status(frame, opts) {
    this.frame = frame;
    this.o = Object.assign({ layout: 'chip', mark: '5E', doneText: '완료', hideAfter: 900, reducedMotion: null }, opts || {});
    this.root = el('div', 'rs rs--' + this.o.layout);
    this.root.setAttribute('role', 'status');
    this.root.setAttribute('aria-live', 'polite');

    this.sheen = el('div', 'rs-sheen');
    this.scrim = el('div', 'rs-scrim');
    this.label = el('div', 'rs-label');

    // 5E: 기본 글자 + 빛이 지나가는 창(같은 글자를 한 겹 더, 창만 움직임)
    this.mark = el('span', 'rs-mark');
    this.mark.appendChild(el('span', 'rs-mark-base', this.o.mark));
    var win = el('span', 'rs-mark-win'), glow = el('span', 'rs-mark-glow', this.o.mark);
    win.appendChild(glow);
    this.mark.appendChild(win);
    this.mark.setAttribute('aria-hidden', 'true');

    this.text = el('span', 'rs-text');
    this.step = el('span', 'rs-step');
    this.activity = el('span', 'rs-activity');
    this.activity.setAttribute('aria-hidden', 'true');
    for (var i = 0; i < 3; i++) this.activity.appendChild(el('i'));
    this.time = el('time', 'rs-elapsed');
    this.time.setAttribute('aria-live', 'off');
    this.time.hidden = true;

    this.label.appendChild(this.mark);
    this.label.appendChild(el('span', 'rs-sep'));
    this.label.appendChild(this.activity);
    this.label.appendChild(this.text);
    this.label.appendChild(this.step);
    this.label.appendChild(this.time);
    this.root.appendChild(this.scrim);
    this.root.appendChild(this.sheen);
    this.root.appendChild(this.label);
    frame.appendChild(this.root);
  }

  Status.prototype = {
    reduced: function () {
      if (this.o.reducedMotion != null) return this.o.reducedMotion;
      return global.matchMedia && global.matchMedia('(prefers-reduced-motion: reduce)').matches;
    },

    show: function (msg, step, total) {
      this.reset();
      this.root.classList.toggle('is-reduced', !!this.reduced());
      this.root.classList.add('is-on');
      this._msg(msg, true);
      this._step(step, total);
      return this;
    },

    set: function (msg, step, total) {
      if (!this.root.classList.contains('is-on') || this.current === msg) return this;
      this._msg(msg, false);
      this._step(step, total);
      return this;
    },

    done: function (msg) {
      var self = this;
      if (!this.root.classList.contains('is-on')) return this;
      this.root.classList.add('is-done');
      this._msg(msg || this.o.doneText, false);
      this._step(null);
      clearTimeout(this._hide);
      this._hide = setTimeout(function () { self.root.classList.remove('is-on', 'is-done'); }, this.o.hideAfter);
      return this;
    },

    fail: function (msg) {
      this.show(msg);
      this.root.classList.add('is-failed');
      return this;
    },

    setElapsed: function (ms) {
      var seconds = Math.max(0, Math.floor(ms / 1000));
      var text = String(Math.floor(seconds / 60)).padStart(2, '0') + ':' + String(seconds % 60).padStart(2, '0');
      if (this.time.textContent !== text) this.time.textContent = text;
      this.time.hidden = false;
      this.time.dateTime = 'PT' + seconds + 'S';
      this.time.setAttribute('aria-label', '경과 시간 ' + text);
      return this;
    },

    reset: function () {
      this.root.getAnimations({subtree:true}).forEach(function (a) { a.cancel(); });
      clearTimeout(this._hide);
      this.current = null;
      this.text.textContent = '';
      this.text.style.width = '';
      this.step.textContent = '';
      this.time.hidden = true;
      this.time.textContent = '';
      this.root.classList.remove('is-on', 'is-done', 'is-failed');
      return this;
    },

    destroy: function () { this.reset(); this.root.remove(); },

    _step: function (step, total) {
      this.step.textContent = step && total ? String(step).padStart(2, '0') + ' / ' + String(total).padStart(2, '0') : '';
    },

    // 문구는 짧은 이동과 교차 전환으로 바뀐다.
    _msg: function (msg, instant) {
      this.current = msg;
      var old = this.text.lastElementChild;
      var next = el('span', 'rs-msg', msg);
      this.text.appendChild(next);
      var w = next.offsetWidth;
      if (instant || !old) {
        Array.prototype.slice.call(this.text.children).forEach(function (n) { if (n !== next) n.remove(); });
        this.text.style.width = w + 'px';
        return;
      }
      this.text.style.width = w + 'px';
      old.classList.add('is-leaving');
      var reduced = this.reduced();
      old.animate(reduced ? [{ opacity: 1 }, { opacity: 0 }]
        : [{ opacity: 1 }, { opacity: 0, transform: 'translateY(-3px)' }],
        { duration: 220, easing: 'ease-in', fill: 'forwards' }).finished.then(function () { old.remove(); }, function () {});
      next.animate(reduced ? [{ opacity: 0 }, { opacity: 1 }]
        : [{ opacity: 0, transform: 'translateY(3px)' }, { opacity: 1, transform: 'none' }],
        { duration: 460, delay: 80, easing: EASE, fill: 'backwards' });
    }
  };

  global.RevealStatus = {
    attach: function (frame, opts) { return new Status(frame, opts); }
  };
})(typeof window === 'undefined' ? globalThis : window);

export const RevealStatus = globalThis.RevealStatus;
