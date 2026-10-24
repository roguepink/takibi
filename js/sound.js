// 焚き火の音とまわりの音(Web Audio)。読むのは sound/sounds.json だけ(中身は音の係が調整する)。
//   { "fire": [{file, gain, loopStart, loopEnd, scene}, …],   焚き火のパチパチの下地(くり返し・場面に合うものを選ぶ)
//     "yama": [{…}], "umi": [{…}],                          まわりの音(場面ごと・くり返し)
//     "pops": [{file, gain}, …] }                             ときどき鳴らす はぜる音(間・大きさ・左右・高さ・やわらかさを ばらばらに)
// 決めたことと理由は docs/sound.md。
// - 焚き火の音(fire + pops)と まわりの音(yama/umi)は、大きさを別々に変えられる。
// - iPhone は 画面にふれた操作の中でないと鳴らせない → start() は ふれたときに呼ぶ。
// - 場面を変えたら、焚き火の音も まわりの音も ゆっくり重ねて入れかえ、使わなくなった音は 30秒たってからメモリから はなす
//   (古い iPhone のため。すぐ はなすと、場所を何度も変えたとき 開きなおしてメモリが はね上がる)。
// - 遅い回線では 動画を先に: gate(約束)があれば、それがすむまで 音のファイルを読まない(app.js が 1本目の動画を読み終わるまで)。
// - 止めたら(火を消す・おやすみの終わり・音を止める)、消えおわってから 音の仕組みごと休ませる(電池)。
// - おやすみで小さくしていくと、火が熾火になるように パチッが減り、音も やわらかく(高い音が少なく)なる。
// - アプリを閉じたら すぐ止め、もどったら 1.5秒かけて ふわっと もどす(急に大きな音が出ないように)。
// - sounds.json が無い・読めないときは、何もしない(音なしで動く)。

const rnd = (a, b) => a + Math.random() * (b - a);
const any = (list) => list[Math.floor(Math.random() * list.length)];
const curve = (v) => v * v;   // すべり棒(0〜1)→ 音の大きさ。耳に自然になるように 2乗
const OPEN = 16000;           // 焚き火の音の「やわらかさ」のふだんの値(Hz)。これより上は もともと ほとんど無い

// パチッの間(秒)。ふつう 4〜14秒、ときどき すぐ もう1回(はぜが続く)、ときどき長い間。平均 約9秒
function popGap(prevBurst) {
  const r = Math.random();
  if (!prevBurst && r < 0.1) return [rnd(0.15, 0.5), true];
  if (r < 0.85) return [rnd(4, 14), false];
  return [rnd(14, 26), false];
}

export class Sound {
  constructor() {
    this.def = null;
    this.ctx = null;
    this.on = false;              // 鳴らしている(止めたら false)
    this.fireVol = 0.8; this.ambVol = 0.65;
    this.level = 1;               // 全体の大きさの 目ざす値(おやすみで下がる)
    this.bufs = new Map();
    this.fireLayer = null; this.fireFile = null;
    this.ambLayer = null; this.ambId = null;
    this.popT = 0; this.lastPop = -1; this.rev = '';
    this.gate = null;             // これがすむまで 音のファイルを読まない(遅い回線で 動画を先に)
    this.relT = 0; this.restT = 0;
  }

  async load() {
    try {
      const r = await fetch('sound/sounds.json', { cache: 'no-cache' });
      if (!r.ok) throw new Error(r.status);
      const d = await r.json();
      this.rev = d.v ? '?v=' + d.v : '';   // 音を作り直したら v を上げる(sw.js は音を ずっと覚えるので、名前を変えて 新しい方を読ませる)
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
      this.tone = this.ctx.createBiquadFilter(); this.tone.type = 'lowpass'; this.tone.frequency.value = OPEN; this.tone.Q.value = 0.5;
      this.ambBus = this.ctx.createGain(); this.ambBus.gain.value = curve(this.ambVol);
      this.fireBus.connect(this.tone); this.tone.connect(this.master);   // つなぎは1つずつ(古い Safari は connect が何も返さない)
      this.ambBus.connect(this.master);
      this.master.connect(this.ctx.destination);
    }
    if (this.ctx.state !== 'running') { try { this.ctx.resume(); } catch (e) {} }
    return true;
  }

  buf(file) {
    if (!this.bufs.has(file)) {
      const p = (this.gate || Promise.resolve()).then(() => fetch(file + (this.rev || '')))
        .then((r) => { if (!r.ok) throw new Error(r.status); return r.arrayBuffer(); })
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
  // 使っていない 長い音を メモリから はなす(fire・まわりの音は 1つ 30〜70MB ある)。
  // その場面から 30秒はなれてから(すぐ もどってきたとき 開きなおさないように)
  releaseLater() { clearTimeout(this.relT); this.relT = setTimeout(() => this.release(), 30000); }
  release() {
    if (!this.def) return;
    const keep = new Set([this.fireFile, this.ambFile].filter(Boolean));
    for (const p of this.def.pops) keep.add(p.file);
    for (const f of [...this.bufs.keys()]) if (!keep.has(f)) this.bufs.delete(f);
  }

  // すぐ止まる短い動き(すべり棒など)は 直線で
  ramp(param, to, secs) {
    const now = this.ctx.currentTime;
    param.cancelScheduledValues(now);
    param.setValueAtTime(param.value, now);
    param.linearRampToValueAtTime(to, now + Math.max(0.02, secs));
  }
  // 長い動き(入る・消える・入れかえ)は 耳に自然な形で(はじめ早く、だんだん ゆっくり。secs で ほぼ着く)
  glide(param, to, secs) {
    const now = this.ctx.currentTime;
    secs = Math.max(0.05, secs);
    param.cancelScheduledValues(now);
    param.setValueAtTime(param.value, now);
    param.setTargetAtTime(to, now, secs / 4);
    param.setValueAtTime(to, now + secs * 1.25);
  }

  pick(list, sceneId) { return list.find((x) => x.scene === sceneId) || list[0]; }

  // くり返し鳴らす音を1つ作る(はじめは 0 → fade 秒で item.gain まで)
  async loop(item, bus, fade) {
    const b = await this.buf(item.file);
    const src = this.ctx.createBufferSource();
    src.buffer = b; src.loop = true;
    const ls = +item.loopStart || 0, le = +item.loopEnd || 0;
    if (le > ls && le <= b.duration) { src.loopStart = ls; src.loopEnd = le; }
    const g = this.ctx.createGain(); g.gain.value = 0;
    src.connect(g); g.connect(bus);
    // はじめる所を ばらばらに(毎回 同じ所から聞こえないように)
    const a = src.loopEnd > src.loopStart ? src.loopStart : 0, z = src.loopEnd > src.loopStart ? src.loopEnd : b.duration;
    src.start(0, rnd(a, a + (z - a) * 0.9));
    this.glide(g.gain, item.gain == null ? 1 : +item.gain, fade);
    return { src, g };
  }
  drop(layer, fade) {
    if (!layer) return;
    layer.then((L) => {
      if (!L || !this.ctx) return;
      this.glide(L.g.gain, 0, fade);
      setTimeout(() => { try { L.src.stop(); L.src.disconnect(); L.g.disconnect(); } catch (e) {} this.releaseLater(); }, fade * 1250 + 200);
    });
  }

  // 鳴らしはじめる(ふれた操作の中で)
  start(sceneId, fade = 4) {
    if (!this.ensure()) return;
    clearTimeout(this.restT);
    this.on = true;
    this.level = 1;
    this.ramp(this.tone.frequency, OPEN, 0.1);
    this.setScene(sceneId, 3);
    this.glide(this.master.gain, 1, fade);
    if (this.def.pops.length) { for (const p of this.def.pops) this.buf(p.file).catch(() => {}); this.schedulePop(rnd(2, 5), false); }
  }

  // 場面に合わせて、焚き火の音と まわりの音を ゆっくり入れかえる
  setScene(id, fade = 6) {
    if (!this.ctx || !this.on) return;
    if (this.def.fire.length) {
      const f = this.pick(this.def.fire, id);
      if (f.file !== this.fireFile || !this.fireLayer) {
        this.drop(this.fireLayer, fade);
        this.fireFile = f.file;
        this.fireLayer = this.loop(f, this.fireBus, fade).catch(() => null);
      }
    }
    if (id === this.ambId) return;
    this.ambId = id;
    this.drop(this.ambLayer, fade);
    const list = this.def[id] || [];
    const a = list.length ? any(list) : null;
    this.ambFile = a ? a.file : null;
    this.ambLayer = a ? this.loop(a, this.ambBus, fade).catch(() => null) : null;
  }

  // ときどき はぜる音(パチッ)。火が小さくなる(level が下がる)ほど 間が のびる
  schedulePop(secs, burst) {
    clearTimeout(this.popT);
    this.popT = setTimeout(() => {
      if (!this.on) return;
      if (this.ctx.state === 'running' && Math.random() < Math.min(1, this.level * 1.3)) this.pop();
      const [g, b] = popGap(burst);
      this.schedulePop(b ? g : g / Math.max(0.3, this.level), b);
    }, secs * 1000);
  }
  async pop() {
    const n = this.def.pops.length;
    let i = Math.floor(Math.random() * n);
    if (n > 1 && i === this.lastPop) i = (i + 1 + Math.floor(Math.random() * (n - 1))) % n;   // 同じ音を2回続けない
    this.lastPop = i;
    const item = this.def.pops[i];
    let b; try { b = await this.buf(item.file); } catch (e) { return; }
    const c = this.ctx;
    const src = c.createBufferSource();
    src.buffer = b;
    src.playbackRate.value = rnd(0.9, 1.1);                       // 高さを少し
    const g = c.createGain(); g.gain.value = (item.gain == null ? 0.5 : +item.gain) * rnd(0.4, 1);   // 大きさを
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = rnd(3500, 12000); lp.Q.value = 0.5;   // 近い・遠い(やわらかさ)を
    src.connect(lp); lp.connect(g);
    let last = g;
    if (c.createStereoPanner) { const p = c.createStereoPanner(); p.pan.value = rnd(-0.35, 0.35); g.connect(p); last = p; }   // 火の幅くらいに 左右を
    last.connect(this.fireBus);
    src.onended = () => { try { src.disconnect(); lp.disconnect(); g.disconnect(); if (last !== g) last.disconnect(); } catch (e) {} };
    src.start();
  }

  setFire(v) { this.fireVol = v; if (this.ctx) this.ramp(this.fireBus.gain, curve(v), 0.15); }
  setAmb(v) { this.ambVol = v; if (this.ctx) this.ramp(this.ambBus.gain, curve(v), 0.15); }

  // 全体を secs 秒で to へ(おやすみの終わり など)。0.55 より小さくすると 焚き火の高い音も 少しずつ しぼる(熾火の音)
  fadeTo(to, secs) {
    if (!this.ctx || !this.on) return;
    this.level = to;
    this.glide(this.master.gain, to, secs);
    const hz = to >= 0.55 ? OPEN : 1200 * Math.pow(15, Math.max(0, to) / 0.55);   // 0.3 → 約5kHz、0.12 → 約2kHz
    this.glide(this.tone.frequency, hz, secs);
  }

  // 止める(ゆっくり小さくして)。止める途中で また start() されても、前の音は 自分で消えていく
  stop(fade = 2) {
    if (!this.ctx || !this.on) return;
    this.on = false;
    clearTimeout(this.popT);
    this.glide(this.master.gain, 0, fade);
    const f = this.fireLayer, a = this.ambLayer;
    this.fireLayer = this.ambLayer = null; this.ambId = null; this.fireFile = this.ambFile = null;
    this.drop(f, fade); this.drop(a, fade);
    // 消えおわったら 音の仕組みごと休ませる(また start() すれば 起きる)
    clearTimeout(this.restT);
    this.restT = setTimeout(() => { if (!this.on && this.ctx && this.ctx.state === 'running') { try { this.ctx.suspend(); } catch (e) {} } }, fade * 1250 + 400);
  }

  // アプリを閉じたとき: すぐ止める(大きさを 0 にしてから)/ もどったら: 1.5秒で ふわっと もどす
  suspend() {
    if (!this.ctx) return;
    try { this.master.gain.cancelScheduledValues(this.ctx.currentTime); this.master.gain.value = 0; } catch (e) {}
    if (this.ctx.state === 'running') { try { this.ctx.suspend(); } catch (e) {} }
  }
  resume() {
    if (!this.ctx || !this.on || this.ctx.state === 'running') return;
    const up = () => { if (this.on) this.glide(this.master.gain, this.level, 1.5); };
    try { const p = this.ctx.resume(); if (p && p.then) p.then(up, () => {}); else up(); } catch (e) {}
  }
  get running() { return !!(this.ctx && this.on && this.ctx.state === 'running'); }
}
