// 焚き火の場面(動画)。いちばん大事な所: 8秒くらいの短い動画を ランダムにつないで、同じ映像が続かないように見せる。
//
// しくみ:
// - <video> を2つ重ねる(A と B)。片方が流れている間に、もう片方へ 次の動画を前もって読みこんでおく。
// - 流れている動画が 終わる 約0.4秒前に、次の動画を頭から流しはじめ、0.4秒で上に重ねて切りかえる。
//   どの動画も「同じ絵で始まって 同じ絵で終わる」ので、重ねても つなぎ目が見えない。
// - 次の動画が まだ読めていないときは、いまの動画を もう一度くり返す(loop)。止まって見えるより良い。
// - 順番はランダム。直前の数本は さける。
// - 動画が止まったら 流しなおす。読めない動画は とばす。どれも流せないときは 静止画(still)を見せる。
// - 横長の画面では、左右を 同じ動画を大きくぼかした絵で うめる。
// - おやすみの終わりは end の動画(火が小さくなって熾火になる)へ つなぎ、最後の絵で止める。
import { SCENES, MEDIA_V } from './scenes.js';

export const XF = 0.4;                         // 重ねて切りかえる秒
export const SIZES = [{ name: 'ふつう', zoom: 1 }, { name: '大きく', zoom: 1.22 }, { name: 'もっと', zoom: 1.45 }];
export const BRIGHT = [0.45, 0.6, 0.75, 0.88, 1.0];
export const WARMTH = [{ name: 'そのまま', v: 0 }, { name: 'あたたかく', v: 0.5 }, { name: 'もっと', label: 'もっと あたたかく', v: 1 }];

const q = (u) => `${u}?v=${MEDIA_V}`;      // 作り直したら MEDIA_V が上がる → スマホに覚えた古い動画を使わない
const sstep = (x) => { x = Math.min(1, Math.max(0, x)); return x * x * (3 - 2 * x); };
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
    this.blur.width = 64; this.blur.height = 36;
    this.bx = this.blur.getContext('2d');
    this.stage = el('div', 'stage', root);
    this.still = el('img', 'layer still', this.stage); this.still.alt = '';
    this.v = [makeVideo(this.stage), makeVideo(this.stage)];
    this.black = el('div', 'black', root);

    this.si = -1;            // いまの場面
    this.cur = 0;            // いま見えている video(0 か 1)
    this.recent = [];        // 最近 流した動画(さけるため)
    this.played = 0;         // つないだ本数(確かめ用)
    this.log = [];           // 流した順(確かめ用)
    this.xf = null;          // 重ねている途中 { from, to, t0 }
    this.chain = false;      // つないで流している
    this.ending = null;      // おやすみの終わり { onDone, t0 }
    this.bad = new Set();    // 読めなかった動画
    this.opt = { size: 0, bright: 3, warm: 0 };
    this.cur_b = BRIGHT[3]; this.cur_w = 0;
    this.fade = 1; this.fadeTarget = 1; this.fadeIn = 2.5; this.fadeOut = 1.2;
    this.dim = 1;            // おやすみの終わりに 少しずつ暗く(1 = そのまま)
    this.running = false; this.onFrame = null;
    this.stuck = 0; this.lastT = -1; this.retryAt = 0;
    this.frame = 0;

    for (const v of this.v) {
      v.addEventListener('error', () => this.onError(v));
      v.addEventListener('ended', () => this.onEnded(v));
    }
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

  // ---------- 場面 ----------
  // 場面を入れかえる(黒い幕の後ろで呼ぶ)。play = すぐ流しはじめる
  setScene(i, play) {
    if (i < 0 || i >= SCENES.length) i = 0;
    const changed = i !== this.si;
    this.si = i;
    const s = this.scene;
    if (changed) { this.recent = []; this.still.src = q(s.still); }
    this.cancelEnd();
    this.xf = null;
    const a = this.v[this.cur], b = this.v[1 - this.cur];
    for (const v of this.v) { v.pause(); v.style.opacity = 0; v.style.zIndex = 1; v.loop = true; }
    this.load(a, this.pick());
    this.load(b, this.pick());
    a.style.zIndex = 2;
    this.stuck = 0; this.lastT = -1;
    if (play) this.play();
  }

  // 次に流す動画を選ぶ(ランダム・直前の数本は さける・読めないものは とばす)
  pick() {
    const all = this.scene.clips.filter((c) => !this.bad.has(c));
    const list = all.length ? all : this.scene.clips;
    const avoid = Math.min(3, Math.max(0, list.length - 2));   // 4本なら 直前2本、10本なら 直前3本をさける
    const rec = this.recent.slice(-avoid);
    let cand = list.filter((c) => !rec.includes(c));
    if (!cand.length) cand = list;
    const c = cand[Math.floor(Math.random() * cand.length)];
    this.recent.push(c); if (this.recent.length > 12) this.recent.shift();
    return c;
  }

  load(v, clip) {
    v.dataset.clip = clip;
    v.poster = q(this.scene.still);
    v.src = q(clip);
    v.loop = true;
    try { v.load(); } catch (e) {}
    v._primed = false;
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
    a.style.opacity = 1;
    tryPlay(a);
    // ふれた操作の中で もう片方も一度 流しておく(iPhone の決まり)
    this.prime(b);
  }

  pauseAll() { for (const v of this.v) v.pause(); }

  // ---------- 切りかえ ----------
  ready(v) { return v.readyState >= 3 || (v.readyState >= 2 && v._primed); }

  beginXF() {
    const from = this.v[this.cur], to = this.v[1 - this.cur];
    try { if (to.currentTime > 0.05) to.currentTime = 0; } catch (e) {}
    to.style.zIndex = 3; from.style.zIndex = 2;
    to.style.opacity = 0;
    tryPlay(to);
    this.xf = { from, to, t0: performance.now() };
  }

  endXF() {
    const { from, to } = this.xf;
    this.xf = null;
    to.style.opacity = 1; to.style.zIndex = 2;
    from.style.opacity = 0; from.style.zIndex = 1;
    from.pause();
    this.cur = this.v.indexOf(to);
    this.played++; this.log.push(to.dataset.clip); if (this.log.length > 50) this.log.shift();
    this.stuck = 0; this.lastT = -1;
    if (this.ending && this.ending.armed && to === this.ending.v) { this.ending.started = true; this.ending.t0 = performance.now(); if (this.ending.onStart) this.ending.onStart(); return; }
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

  onError(v) {
    const clip = v.dataset.clip;
    if (!clip || !v.getAttribute('src')) return;
    if (this.ending && v === this.ending.v) { this.finishEnd(); return; }
    this.bad.add(clip);
    if (this.scene && this.scene.clips.every((c) => this.bad.has(c))) { this.allBad = true; for (const x of this.v) x.style.opacity = 0; return; }   // どれもだめ → 静止画のまま
    // 読めない動画を とばして、ほかのを読む
    if (v === this.v[this.cur] && !this.xf) {
      const other = this.v[1 - this.cur];
      if (this.ready(other)) { this.beginXF(); return; }
    }
    if (v !== this.v[this.cur]) this.load(v, this.pick());
  }

  // ---------- おやすみの終わり ----------
  // いまの動画のあと、end の動画(火が小さくなって熾火になる)へ つなぐ。終わったら onDone
  playEnd(onStart, onDone) {
    this.ending = { onStart, onDone, armed: false, started: false };
    if (!this.scene.end) { setTimeout(() => this.finishEnd(), 0); return; }
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
    try { v.load(); } catch (err) {}
    v._primed = false;
    this.prime(v);
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
    const k = Math.min(1, dt * 1.6);
    this.cur_b += (BRIGHT[this.opt.bright] - this.cur_b) * k;
    this.cur_w += (WARMTH[this.opt.warm].v - this.cur_w) * k;
    if (!this.chain) return;

    const a = this.v[this.cur], b = this.v[1 - this.cur];
    // 重ねている途中
    if (this.xf) {
      const t = (now - this.xf.t0) / (XF * 1000);
      this.xf.to.style.opacity = sstep(t).toFixed(3);
      if (t >= 1) this.endXF();
      return;
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
      if (a.paused && !document.hidden) tryPlay(a);
      if (a.currentTime === this.lastT && !a.paused) this.stuck++; else this.stuck = 0;
      this.lastT = a.currentTime;
      if (this.stuck >= 5) {                  // 5秒うごかない → ほかの動画へ
        this.stuck = 0;
        if (this.ready(b)) this.beginXF(); else { this.load(a, this.pick()); a.style.opacity = 1; tryPlay(a); }
      }
      if (!b._primed && b.readyState < 2) this.prime(b);
    }
  }

  draw() {
    const top = this.xf ? this.xf.to : this.v[this.cur];
    const zoom = SIZES[this.opt.size].zoom;
    const fp = (this.scene && this.scene.fire) || [0.5, 0.68];     // 火の位置(絵の割合)。scenes.js に fire があれば それを使う
    const w = this.cur_w;
    const filt = `brightness(${(this.cur_b * this.dim).toFixed(3)}) saturate(${(1 + 0.12 * w).toFixed(3)}) sepia(${(0.28 * w).toFixed(3)})`;
    this.stage.style.filter = filt;
    this.stage.style.transformOrigin = `${(fp[0] * 100).toFixed(1)}% ${(fp[1] * 100).toFixed(1)}%`;
    this.stage.style.transform = zoom === 1 ? '' : `scale(${zoom})`;
    const f = this.fade;
    this.black.style.opacity = sstep(f).toFixed(3);
    // 横長の画面: 左右を ぼかした絵で うめる(小さな絵に写して 大きくぼかす。4コマに1回)
    if (this.wide && this.frame % 4 === 0) {
      try {
        const src = top.readyState >= 2 && this.chain ? top : this.still;
        if (src === this.still && !this.still.complete) return;
        const sw = src.videoWidth || src.naturalWidth || 716, sh = src.videoHeight || src.naturalHeight || 1280;
        const cw = sw * 0.7, ch = cw * 36 / 64, cy = Math.max(0, Math.min(sh - ch, fp[1] * sh - ch / 2));   // 火のあたりを横長に切りだす
        this.bx.drawImage(src, (sw - cw) / 2, cy, cw, ch, 0, 0, 64, 36);
        this.blur.style.filter = `blur(28px) brightness(${(0.42 * this.cur_b * this.dim).toFixed(3)}) saturate(1.1)`;
      } catch (e) {}
    }
  }
}
