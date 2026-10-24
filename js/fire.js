// 焚き火の場面(動画)。いちばん大事な所: 8秒くらいの短い動画を ランダムにつないで、同じ映像が続かないように見せる。
//
// しくみ:
// - <video> を2つ重ねる(A と B)。片方が流れている間に、もう片方へ 次の動画を前もって読みこんでおく。
// - 流れている動画が 終わる 約0.8秒前に、次の動画を頭から流しはじめ、0.8秒で上に重ねて切りかえる。
//   どの動画も「同じ絵で始まって 同じ絵で終わる」ので、重ねても つなぎ目が見えない。
// - 次の動画が まだ読めていないときは、いまの動画を もう一度くり返す(loop)。止まって見えるより良い。
// - 順番: 全部を1回ずつ流してから 混ぜなおす(袋から1つずつ出す形)。混ぜなおした はじめが 直前と同じにならないように。
//   場面を変えた最初の1本は おだやかな動画(火の粉が少ない)から。
// - 動画が止まったら 流しなおす。読めない動画は とばし、その場で ほかの動画を流す。どれも流せないときは 静止画(still)。
//   読めなかった動画は、電波がもどったとき・3分おきに もう一度ためす。
// - 火をつける前・火を消したあとは 熾火の絵(ember)を暗く見せる。火をつけると 熾火から炎へ ふわっと。
//   読みこみ中は 止まった動画ではなく 静止画を見せ、動きだしてから 動画を ふわっと重ねる。
// - 横長の画面では、左右を 同じ絵の全体を小さく写して大きくぼかしたもので うめ、境目は ぼかしてなじませる。
// - おやすみの終わりは end の動画(火が小さくなって熾火になる)へ つなぎ、半分の速さで流して 最後の絵で止める。
import { SCENES, MEDIA_V } from './scenes.js';

export const XF = 0.8;                         // 重ねて切りかえる秒
export const END_RATE = 0.5;                   // 熾火になる動画の速さ(そのままだと 大きな炎が約1.5秒で熾火になって 速すぎる)
export const SIZES = [{ name: 'ふつう', zoom: 1 }, { name: '大きく', zoom: 1.22 }, { name: 'いちばん大きく', zoom: 1.45 }];
export const BRIGHT = [0.45, 0.6, 0.75, 0.88, 1.0];
export const WARMTH = [{ name: 'そのまま', v: 0 }, { name: 'あたたかく', v: 0.5 }, { name: 'もっと', label: 'もっと あたたかく', v: 1 }];

// 場面を変えた最初の1本は、この番号の動画から選ぶ(火の粉が少ない おだやかな動画。リーダー 2026-10-25 の並びで 山 09〜11・海 09〜11)。
// 動画を作り直すと 番号が変わることがある(js/scenes.js は tools/flow_media.py が作る)。そのときは ここを直す。無い番号は ただ無視される。
const CALM = { yama: ['09', '10', '11'], umi: ['09', '10', '11'] };
const BAD_RETRY = 3 * 60 * 1000;               // 読めなかった動画を もう一度ためすまで

const q = (u) => `${u}?v=${MEDIA_V}`;      // 作り直したら MEDIA_V が上がる → スマホに覚えた古い動画を使わない
const sstep = (x) => { x = Math.min(1, Math.max(0, x)); return x * x * (3 - 2 * x); };
function shuffle(a) { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
function el(tag, cls, parent) { const e = document.createElement(tag); e.className = cls; parent.appendChild(e); return e; }
function tryPlay(v) { try { const p = v.play(); if (p && p.catch) p.catch(() => {}); return p; } catch (e) { return null; } }
function makeVideo(parent) {
  const v = el('video', 'layer', parent);
  Object.assign(v, { muted: true, defaultMuted: true, playsInline: true, autoplay: false, preload: 'auto', loop: true });
  v.setAttribute('muted', ''); v.setAttribute('playsinline', ''); v.setAttribute('webkit-playsinline', '');
  v.disableRemotePlayback = true;
  return v;
}

export class Fire {
  constructor(root) {
    this.root = root;
    root.innerHTML = '';
    this.blur = el('canvas', 'blur', root);
    this.blur.width = 128; this.blur.height = 72;
    this.bx = this.blur.getContext('2d');
    this.stage = el('div', 'stage', root);
    this.still = el('img', 'layer still', this.stage); this.still.alt = '';
    this.v = [makeVideo(this.stage), makeVideo(this.stage)];
    this.ember = el('img', 'layer ember', this.stage); this.ember.alt = '';   // 熾火だけの絵(火をつける前・消したあと)
    this.black = el('div', 'black', root);

    this.si = -1;            // いまの場面
    this.cur = 0;            // いま見えている video(0 か 1)
    this.bag = [];           // まだ流していない動画(全部出したら 混ぜなおす)
    this.recent = [];        // 最近 選んだ動画
    this.played = 0;         // つないだ本数(確かめ用)
    this.log = [];           // 流した順(確かめ用)
    this.xf = null;          // 重ねている途中 { from, to, t0 }
    this.chain = false;      // つないで流している
    this.ending = null;      // おやすみの終わり
    this.bad = new Set();    // 読めなかった動画
    this.allBad = false;
    this.shown = false;      // 動画が動きだして 見せはじめた
    this.reveal = 0;         // 動画を ふわっと出している途中(はじめた時刻)
    this.opt = { size: 0, bright: 3, warm: 0 };
    this.cur_b = BRIGHT[3]; this.cur_w = 0;
    this.fade = 1; this.fadeTarget = 1; this.fadeIn = 2.5; this.fadeOut = 1.2;
    this.emberOp = 1; this.emberTarget = 1; this.emberSecs = 2.5;
    this.dim = 1;            // おやすみの終わりに 少しずつ暗く(1 = そのまま)
    this.running = false; this.onFrame = null;
    this.stuck = 0; this.lastT = -1; this.retryAt = 0;
    this.movedAt = 0; this.moveT = -1;   // 動画が最後に動いた時刻(読みこみ中の案内のため)
    this.frame = 0;
    this.css = {};           // いま書いてある見た目(変わったときだけ書く)

    for (const v of this.v) {
      v.addEventListener('error', () => this.onError(v));
      v.addEventListener('ended', () => this.onEnded(v));
      v.addEventListener('progress', () => { v._prog = performance.now(); });
    }
    addEventListener('online', () => this.retryBad());
    setInterval(() => this.retryBad(), BAD_RETRY);
    this.resize();
    addEventListener('resize', () => this.resize());
    addEventListener('orientationchange', () => setTimeout(() => this.resize(), 300));
  }

  get scene() { return SCENES[this.si]; }

  // ---------- 置き場所 ----------
  resize() {
    const W = innerWidth, H = innerHeight, ar = 9 / 16;
    let w, h;
    const wide = W / H > ar * 1.25;            // 横長(パソコン・タブレット・スマホの横向き)
    if (!wide) { h = H; w = H * ar; if (w < W) { w = W; h = W / ar; } }   // たて: 横を少し切ってでも いっぱいに
    else { h = H; w = H * ar; }                                          // 横長: 全体を見せて、左右は ぼかし
    this.wide = wide;
    this.root.classList.toggle('wide', wide);
    this.box = { w, h, x: (W - w) / 2, y: (H - h) / 2 };
    Object.assign(this.stage.style, { width: w + 'px', height: h + 'px', left: this.box.x + 'px', top: this.box.y + 'px' });
  }

  set(o) { Object.assign(this.opt, o); }

  // 熾火の絵を 出す(on)/ 消す。secs 秒かけて。0 なら すぐ
  setEmber(on, secs = 2.5) {
    this.emberTarget = on ? 1 : 0; this.emberSecs = secs;
    if (!secs) this.emberOp = this.emberTarget;
  }

  // ---------- 場面 ----------
  // 場面を入れかえる(黒い幕の後ろで呼ぶ)。play = すぐ流しはじめる
  setScene(i, play) {
    if (i < 0 || i >= SCENES.length) i = 0;
    const changed = i !== this.si;
    this.si = i;
    const s = this.scene;
    if (changed) {
      this.bag = []; this.recent = [];
      this.still.src = q(s.still);
      if (s.ember) { this.ember.src = q(s.ember); this.ember.hidden = false; } else { this.ember.removeAttribute('src'); this.ember.hidden = true; }
    }
    this.cancelEnd();
    this.xf = null; this.allBad = false;
    this.shown = false; this.reveal = 0;
    const a = this.v[this.cur], b = this.v[1 - this.cur];
    for (const v of this.v) { v.pause(); v.style.opacity = 0; v.style.zIndex = 1; v.loop = true; }
    this.load(a, this.pick(true));   // 最初の1本は おだやかな動画から
    this.load(b, this.pick());
    a.style.zIndex = 2;
    this.stuck = 0; this.lastT = -1;
    if (play) this.play();
  }

  // 次に流す動画を選ぶ。全部を1回ずつ流してから 混ぜなおす。読めないものは とばす。calm = おだやかな動画から
  pick(calm) {
    const s = this.scene;
    let list = s.clips.filter((c) => !this.bad.has(c));
    if (!list.length) list = s.clips.slice();
    let c = null;
    if (calm) {
      const ids = CALM[s.id] || [];
      const cs = list.filter((x) => ids.some((n) => x.endsWith('/' + n + '.mp4')));
      if (cs.length) { c = cs[Math.floor(Math.random() * cs.length)]; this.bag = this.refill(list.filter((x) => x !== c), [c]); }
    }
    if (!c) {
      this.bag = this.bag.filter((x) => list.includes(x));
      if (!this.bag.length) this.bag = this.refill(list, this.recent);
      c = this.bag.shift();
    }
    this.recent.push(c); if (this.recent.length > 12) this.recent.shift();
    return c;
  }
  // 混ぜなおす。はじめの数本が 直前に流したものと同じにならないように
  refill(list, rec) {
    if (list.length < 2) return list.slice();
    const k = Math.max(1, Math.min(3, list.length - 2)), last = rec.slice(-k);   // 11本なら 直前3本をさける(同じ動画は 4本以上あけて出る)
    let b = shuffle(list);
    for (let n = 0; n < 30 && b.slice(0, k).some((x) => last.includes(x)); n++) b = shuffle(list);
    return b;
  }

  load(v, clip) {
    v.dataset.clip = clip;
    v.poster = q(this.scene.still);
    v.src = q(clip);
    v.loop = true;
    v.defaultPlaybackRate = 1;
    try { v.load(); } catch (e) {}
    v.playbackRate = 1;
    v._primed = false; v._prog = 0;
  }

  // 次の動画を 一瞬だけ流して止める → iPhone でも 最初の絵まで 読みこまれる(見えない所で)
  prime(v) {
    if (v._primed || !this.chain) return;
    v._primed = true;
    const p = tryPlay(v);
    const stop = () => { if (v !== this.v[this.cur] && !(this.xf && this.xf.to === v)) { v.pause(); try { v.currentTime = 0; } catch (e) {} } };
    if (p && p.then) p.then(() => setTimeout(stop, 60), () => { v._primed = false; });
    else setTimeout(stop, 120);
  }

  // 流しはじめる(画面にふれた直後に呼ぶと、iPhone でも 2つの video が流せるようになる)
  play() {
    this.chain = true;
    const a = this.v[this.cur], b = this.v[1 - this.cur];
    tryPlay(a);
    // ふれた操作の中で もう片方も一度 流しておく(iPhone の決まり)
    this.prime(b);
  }

  pauseAll() { for (const v of this.v) v.pause(); }

  // 動画が いま動いている(読みこみ中・止まっているときは false)。「よみこんでいます」を出すかどうかに使う
  get moving() { return !!this.xf || (this.shown && performance.now() - this.movedAt < 1500); }

  // 読めなかった動画を もう一度ためす(電波がもどった・3分たった)
  retryBad() {
    if (!this.bad.size) return;
    this.bad.clear();
    if (!this.allBad) return;
    this.allBad = false;
    if (!this.chain || this.ending || this.si < 0) return;
    const a = this.v[this.cur], b = this.v[1 - this.cur];
    this.shown = false; this.reveal = 0;
    this.load(a, this.pick()); this.load(b, this.pick());
    tryPlay(a); this.prime(b);
  }

  // ---------- 切りかえ ----------
  ready(v) { return !v.error && (v.readyState >= 3 || (v.readyState >= 2 && v._primed)); }

  beginXF() {
    const from = this.v[this.cur], to = this.v[1 - this.cur];
    try { if (to.currentTime > 0.05) to.currentTime = 0; } catch (e) {}
    to.style.zIndex = 3; from.style.zIndex = 2;
    to.style.opacity = 0;
    if (!this.shown) from.style.opacity = 0;   // まだ見せていなかった(読めなかった)動画からは 静止画の上に重ねる
    tryPlay(to);
    this.reveal = 0;
    this.xf = { from, to, t0: performance.now() };
  }

  endXF() {
    const { from, to } = this.xf;
    this.xf = null;
    to.style.opacity = 1; to.style.zIndex = 2;
    from.style.opacity = 0; from.style.zIndex = 1;
    from.pause();
    this.cur = this.v.indexOf(to);
    this.shown = true;
    this.played++; this.log.push(to.dataset.clip); if (this.log.length > 50) this.log.shift();
    this.stuck = 0; this.lastT = -1;
    if (this.ending && this.ending.armed && to === this.ending.v) { this.startedEnd(); return; }
    // 終わりの動画を待っているなら、次は end を読む
    if (this.ending && !this.ending.armed) { this.armEnd(); return; }
    this.load(from, this.pick());
    this.prime(from);
  }

  // 流れている動画が(重ねる前に)終わってしまったとき: すぐ切りかえる
  onEnded(v) {
    if (this.ending && this.ending.started && v === this.ending.v) { this.finishEnd(); return; }
    if (v !== this.v[this.cur] || this.xf) return;
    const to = this.v[1 - this.cur];
    if (this.ready(to)) { this.beginXF(); this.xf.t0 -= XF * 1000; this.endXF(); }
    else { try { v.currentTime = 0; } catch (e) {} tryPlay(v); }
  }

  // 読めない動画: とばして、その場で ほかの動画を流す
  onError(v) {
    const clip = v.dataset.clip;
    if (!clip || !v.getAttribute('src') || this.si < 0) return;
    if (this.ending && v === this.ending.v) { this.finishEnd(); return; }
    this.bad.add(clip);
    if (this.scene.clips.every((c) => this.bad.has(c))) {   // どれもだめ → 静止画のまま(電波がもどったら また ためす)
      this.allBad = true; this.xf = null; this.shown = false; this.reveal = 0;
      for (const x of this.v) { x.pause(); x.style.opacity = 0; }
      return;
    }
    const a = this.v[this.cur], b = this.v[1 - this.cur];
    if (this.xf) {
      if (v === this.xf.to) {   // 重ねている途中で 次がだめになった → 重ねるのをやめて いまの動画のまま
        this.xf = null; v.style.opacity = 0; v.style.zIndex = 1; a.style.zIndex = 2;
        if (this.shown) a.style.opacity = 1;
        this.load(v, this.pick()); this.prime(v);
      }
      return;                   // 消えていく方が だめになった → そのまま重ねおわる
    }
    if (v === a) {
      if (this.ready(b)) { this.beginXF(); return; }
      this.load(a, this.pick());
      if (this.chain) tryPlay(a);
      return;
    }
    this.load(v, this.pick()); this.prime(v);
  }

  // ---------- おやすみの終わり ----------
  // いまの動画のあと、end の動画(火が小さくなって熾火になる)へ つなぐ。はじまったら onStart、終わったら onDone
  playEnd(onStart, onDone) {
    this.cancelEnd();
    this.ending = { onStart, onDone, armed: false, started: false };
    if (!this.scene.end || !this.chain) { setTimeout(() => this.finishEnd(), 0); return; }
    if (!this.xf) this.armEnd();
    // 読めない・流れないときの保険
    this.ending.guard = setTimeout(() => { if (this.ending && !this.ending.started) this.finishEnd(); }, 25000);
  }
  armEnd() {
    const e = this.ending;
    const v = this.v[1 - this.cur];
    e.armed = true; e.v = v;
    v.dataset.clip = this.scene.end;
    v.poster = '';
    v.src = q(this.scene.end);
    v.loop = false;
    v.defaultPlaybackRate = END_RATE;
    try { v.load(); } catch (err) {}
    v.playbackRate = END_RATE;
    v._primed = false;
    this.prime(v);
  }
  startedEnd() {
    const e = this.ending, v = e.v;
    e.started = true; e.t0 = performance.now();
    v.playbackRate = END_RATE;
    // 途中で止まっても(電波が弱いなど)必ず終わるように: 長さ+10秒の保険
    const dur = isFinite(v.duration) && v.duration > 1 ? v.duration : 8;
    clearTimeout(e.guard);
    e.guard = setTimeout(() => this.finishEnd(), (dur / END_RATE + 10) * 1000);
    if (e.onStart) e.onStart();
  }
  finishEnd() {
    const e = this.ending;
    if (!e || e.done) return;
    e.done = true;
    clearTimeout(e.guard);
    this.chain = false;
    if (e.onDone) e.onDone();
  }
  cancelEnd() {
    if (this.ending) clearTimeout(this.ending.guard);
    this.ending = null;
  }

  // ---------- 描く ----------
  start() {
    if (this.running) return;
    this.running = true;
    this.last = performance.now();
    if (this.chain && !(this.ending && this.ending.done)) tryPlay(this.v[this.cur]);
    const loop = (now) => {
      if (!this.running) return;
      const dt = Math.min(0.05, (now - this.last) / 1000); this.last = now;
      this.update(dt, now); this.draw();
      if (this.onFrame) this.onFrame(dt);
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }
  stop() { this.running = false; cancelAnimationFrame(this.raf); this.pauseAll(); }

  update(dt, now) {
    this.frame++;
    if (this.fade < this.fadeTarget) this.fade = Math.min(this.fadeTarget, this.fade + dt / this.fadeOut);
    else if (this.fade > this.fadeTarget) this.fade = Math.max(this.fadeTarget, this.fade - dt / this.fadeIn);
    if (this.emberOp < this.emberTarget) this.emberOp = Math.min(this.emberTarget, this.emberOp + dt / this.emberSecs);
    else if (this.emberOp > this.emberTarget) this.emberOp = Math.max(this.emberTarget, this.emberOp - dt / this.emberSecs);
    const k = Math.min(1, dt * 1.6);
    this.cur_b += (BRIGHT[this.opt.bright] - this.cur_b) * k;
    this.cur_w += (WARMTH[this.opt.warm].v - this.cur_w) * k;
    if (Math.abs(this.cur_b - BRIGHT[this.opt.bright]) < 0.002) this.cur_b = BRIGHT[this.opt.bright];
    if (Math.abs(this.cur_w - WARMTH[this.opt.warm].v) < 0.002) this.cur_w = WARMTH[this.opt.warm].v;
    if (!this.chain || this.allBad) return;

    const a = this.v[this.cur], b = this.v[1 - this.cur];
    if (a.currentTime !== this.moveT) { this.moveT = a.currentTime; if (!a.paused) this.movedAt = now; }
    // 重ねている途中
    if (this.xf) {
      const t = (now - this.xf.t0) / (XF * 1000);
      this.xf.to.style.opacity = sstep(t).toFixed(3);
      if (t >= 1) this.endXF();
      return;
    }
    // はじめの1本: 動きだしてから ふわっと出す(それまでは 静止画)
    if (!this.shown && !a.paused && a.currentTime > 0.05 && a.readyState >= 2) { this.shown = true; this.reveal = now; }
    if (this.reveal) {
      const t = (now - this.reveal) / (XF * 1000);
      a.style.opacity = sstep(t).toFixed(3);
      if (t >= 1) this.reveal = 0;
    }
    if (this.ending && this.ending.started) return;   // 終わりの動画は 最後まで流して止める
    // 終わりが近づいたら 次へ
    const dur = isFinite(a.duration) && a.duration > 1 ? a.duration : 8;
    if (!a.paused && a.currentTime >= dur - XF - 0.06 && a.currentTime < dur) {
      if (this.ready(b)) this.beginXF();
      else this.prime(b);                     // まだ読めていない → いまの動画が もう一度くり返す(loop)
    }
    // 止まっていないか 見張る(1秒ごと)
    if (now - this.retryAt > 1000) {
      this.retryAt = now;
      if (a.error) { this.onError(a); return; }
      if (a.paused && !document.hidden) tryPlay(a);
      if (a.currentTime === this.lastT && !a.paused) this.stuck++; else this.stuck = 0;
      this.lastT = a.currentTime;
      const loading = a.networkState === 2 && now - (a._prog || 0) < 3000;   // 読みこみが進んでいる
      if (this.stuck >= 2 && this.ready(b)) { this.stuck = 0; this.beginXF(); }          // 止まったまま、次は準備できている → 次へ
      else if (this.stuck >= 5 && !loading) {                                             // 5秒うごかず 読みこみも進まない → ほかの動画へ
        this.stuck = 0;
        this.load(a, this.pick()); tryPlay(a);
      }
      if (!b._primed && b.readyState < 2) this.prime(b);
    }
  }

  // 見た目を書く(値が変わったときだけ)
  put(key, target, prop, val) {
    if (this.css[key] === val) return;
    this.css[key] = val; target.style[prop] = val;
  }

  draw() {
    const zoom = SIZES[this.opt.size].zoom;
    const fp = (this.scene && this.scene.fire) || [0.5, 0.68];     // 火の位置(絵の割合)。scenes.js に fire があれば それを使う
    const w = this.cur_w, b = this.cur_b * this.dim;
    this.put('filt', this.stage, 'filter', `brightness(${b.toFixed(3)}) saturate(${(1 + 0.12 * w).toFixed(3)}) sepia(${(0.28 * w).toFixed(3)})`);
    this.put('org', this.stage, 'transformOrigin', `${(fp[0] * 100).toFixed(1)}% ${(fp[1] * 100).toFixed(1)}%`);
    this.put('tf', this.stage, 'transform', zoom === 1 ? '' : `scale(${zoom})`);
    this.put('black', this.black, 'opacity', sstep(this.fade).toFixed(3));
    this.put('ember', this.ember, 'opacity', sstep(this.emberOp).toFixed(3));
    // 横長の画面: 左右を ぼかした絵で うめる(絵の全体を 小さなキャンバスに写して 大きくぼかす。4コマに1回)
    if (this.wide) {
      this.put('bf', this.blur, 'filter', `blur(28px) brightness(${(0.5 * b).toFixed(3)}) saturate(1.1)`);
      if (this.frame % 4 === 0) {
        try {
          const top = this.xf ? this.xf.to : this.v[this.cur];
          let src = this.still;
          if (this.emberOp > 0.5 && !this.ember.hidden && this.ember.complete && this.ember.naturalWidth) src = this.ember;
          else if (this.shown && top.readyState >= 2) src = top;   // おやすみの終わり(止めた最後の絵)も そのまま写す
          if (src.tagName === 'IMG' && !(src.complete && src.naturalWidth)) return;
          this.bx.drawImage(src, 0, 0, 128, 72);
        } catch (e) {}
      }
    }
  }
}
