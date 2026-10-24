// 焚き火の音とまわりの音(Web Audio)。読むのは sound/sounds.json だけ(中身は音の係が調整する)。
//   { "fire": [{file, gain, loopStart, loopEnd}, …],   焚き火のパチパチの下地(くり返し)
//     "yama": [{…}], "umi": [{…}],                   まわりの音(場面ごと・くり返し)
//     "pops": [{file, gain}, …] }                      ときどき鳴らす はぜる音(間・大きさ・左右を ばらばらに)
// - 焚き火の音(fire + pops)と まわりの音(yama/umi)は、大きさを別々に変えられる。
// - iPhone は 画面にふれた操作の中でないと鳴らせない → start() は ふれたときに呼ぶ。
// - 場面を変えたら、まわりの音を ゆっくり入れかえる。
// - sounds.json が無い・読めないときは、何もしない(音なしで動く)。

const rnd = (a, b) => a + Math.random() * (b - a);
const any = (list) => list[Math.floor(Math.random() * list.length)];
const curve = (v) => v * v;   // すべり棒(0〜1)→ 音の大きさ。耳に自然になるように 2乗

export class Sound {
  constructor() {
    this.def = null;
    this.ctx = null;
    this.on = false;              // 鳴らしている(止めたら false)
    this.fireVol = 0.7; this.ambVol = 0.5;
    this.bufs = new Map();
    this.fireLayer = null; this.ambLayer = null; this.ambId = null;
    this.popT = 0;
  }

  async load() {
    try {
      const r = await fetch('sound/sounds.json', { cache: 'no-cache' });
      if (!r.ok) throw new Error(r.status);
      const d = await r.json();
      const ok = (a) => (Array.isArray(a) ? a.filter((x) => x && x.file) : []);
      this.def = { fire: ok(d.fire), yama: ok(d.yama), umi: ok(d.umi), pops: ok(d.pops) };
      for (const k of Object.keys(d)) if (!(k in this.def) && Array.isArray(d[k])) this.def[k] = ok(d[k]);   // 場面がふえても読める
    } catch (e) { this.def = null; }
    return this.has;
  }
  get has() { return !!(this.def && Object.values(this.def).some((a) => a.length)); }

  // ふれた操作の中で呼ぶ
  ensure() {
    if (!this.has) return false;
    if (!this.ctx) {
      try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch (e) {}   // iPhone の消音スイッチでも鳴るように(iOS 17〜)
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      this.ctx = new AC();
      this.master = this.ctx.createGain(); this.master.gain.value = 0;
      this.fireBus = this.ctx.createGain(); this.fireBus.gain.value = curve(this.fireVol);
      this.ambBus = this.ctx.createGain(); this.ambBus.gain.value = curve(this.ambVol);
      this.fireBus.connect(this.master); this.ambBus.connect(this.master);
      this.master.connect(this.ctx.destination);
    }
    if (this.ctx.state !== 'running') { try { this.ctx.resume(); } catch (e) {} }
    return true;
  }

  buf(file) {
    if (!this.bufs.has(file)) {
      const p = fetch(file).then((r) => { if (!r.ok) throw new Error(r.status); return r.arrayBuffer(); })
        .then((ab) => new Promise((res, rej) => {
          // 古い Safari は Promise の形がないので 呼び返しの形で。新しいものは Promise も返すので、その失敗も拾っておく
          const r = this.ctx.decodeAudioData(ab, res, rej);
          if (r && r.catch) r.catch(rej);
        }));
      p.catch(() => this.bufs.delete(file));
      this.bufs.set(file, p);
    }
    return this.bufs.get(file);
  }

  ramp(param, to, secs) {
    const now = this.ctx.currentTime;
    param.cancelScheduledValues(now);
    param.setValueAtTime(param.value, now);
    param.linearRampToValueAtTime(to, now + Math.max(0.02, secs));
  }

  // くり返し鳴らす音を1つ作る(はじめは 小さく → fade 秒で item.gain まで)
  async loop(item, bus, fade) {
    const b = await this.buf(item.file);
    const src = this.ctx.createBufferSource();
    src.buffer = b; src.loop = true;
    const ls = +item.loopStart || 0, le = +item.loopEnd || 0;
    if (le > ls && le <= b.duration) { src.loopStart = ls; src.loopEnd = le; }
    const g = this.ctx.createGain(); g.gain.value = 0;
    src.connect(g); g.connect(bus);   // つなぎは1つずつ(古い Safari は connect が何も返さない)
    // はじめる所を ばらばらに(毎回 同じ所から聞こえないように)
    const a = src.loopEnd > src.loopStart ? src.loopStart : 0, z = src.loopEnd > src.loopStart ? src.loopEnd : b.duration;
    src.start(0, rnd(a, a + (z - a) * 0.8));
    this.ramp(g.gain, item.gain == null ? 1 : +item.gain, fade);
    return { src, g };
  }
  drop(layer, fade) {
    if (!layer) return;
    layer.then((L) => {
      if (!L) return;
      this.ramp(L.g.gain, 0, fade);
      setTimeout(() => { try { L.src.stop(); L.src.disconnect(); L.g.disconnect(); } catch (e) {} }, fade * 1000 + 200);
    });
  }

  // 鳴らしはじめる(ふれた操作の中で)
  start(sceneId, fade = 4) {
    if (!this.ensure()) return;
    this.on = true;
    if (!this.fireLayer && this.def.fire.length) this.fireLayer = this.loop(any(this.def.fire), this.fireBus, 3).catch(() => null);
    this.setScene(sceneId, 3);
    this.ramp(this.master.gain, 1, fade);
    if (this.def.pops.length) { for (const p of this.def.pops) this.buf(p.file).catch(() => {}); this.schedulePop(rnd(1.5, 4)); }
  }

  // まわりの音を ゆっくり入れかえる
  setScene(id, fade = 6) {
    if (!this.ctx || !this.on || id === this.ambId) return;
    this.ambId = id;
    this.drop(this.ambLayer, fade);
    const list = this.def[id] || [];
    this.ambLayer = list.length ? this.loop(any(list), this.ambBus, fade).catch(() => null) : null;
  }

  // ときどき はぜる音(パチッ)。ふつうは 2〜9秒おき、ときどき 続けて2〜3回
  schedulePop(secs) {
    clearTimeout(this.popT);
    this.popT = setTimeout(() => {
      if (!this.on) return;
      if (this.ctx.state === 'running') this.pop();
      const r = Math.random();
      this.schedulePop(r < 0.18 ? rnd(0.12, 0.6) : r < 0.85 ? rnd(2, 9) : rnd(9, 16));
    }, secs * 1000);
  }
  async pop() {
    const item = any(this.def.pops);
    let b; try { b = await this.buf(item.file); } catch (e) { return; }
    const src = this.ctx.createBufferSource();
    src.buffer = b;
    src.playbackRate.value = rnd(0.88, 1.12);
    const g = this.ctx.createGain(); g.gain.value = (item.gain == null ? 0.5 : +item.gain) * rnd(0.35, 1);
    src.connect(g);
    if (this.ctx.createStereoPanner) { const p = this.ctx.createStereoPanner(); p.pan.value = rnd(-0.6, 0.6); g.connect(p); p.connect(this.fireBus); }
    else g.connect(this.fireBus);
    src.start();
  }

  setFire(v) { this.fireVol = v; if (this.ctx) this.ramp(this.fireBus.gain, curve(v), 0.15); }
  setAmb(v) { this.ambVol = v; if (this.ctx) this.ramp(this.ambBus.gain, curve(v), 0.15); }

  // 全体を secs 秒で to へ(おやすみの終わり など)
  fadeTo(to, secs) { if (this.ctx && this.on) this.ramp(this.master.gain, to, secs); }

  // 止める(ゆっくり小さくして)
  stop(fade = 2) {
    if (!this.ctx || !this.on) return;
    this.on = false;
    clearTimeout(this.popT);
    this.ramp(this.master.gain, 0, fade);
    const f = this.fireLayer, a = this.ambLayer;
    this.fireLayer = this.ambLayer = null; this.ambId = null;
    setTimeout(() => { if (!this.on) { this.drop(f, 0.05); this.drop(a, 0.05); } }, fade * 1000 + 100);
  }

  // アプリを閉じたとき: すぐ止める / もどったら: また鳴らす
  suspend() { if (this.ctx && this.ctx.state === 'running') { try { this.ctx.suspend(); } catch (e) {} } }
  resume() { if (this.ctx && this.on && this.ctx.state !== 'running') { try { this.ctx.resume(); } catch (e) {} } }
  get running() { return !!(this.ctx && this.on && this.ctx.state === 'running'); }
}
