// 曲(今回は入れていない。あとで足せるように 一灯と同じ作りを置いておく)。music/tracks.json に書いた曲を流す。曲が無ければ 曲のボタンは出ない。
// - 音は Web Audio の音量(GainNode)で動かす(iPhone はプログラムから音量を変えられないため)
// - はじめは ゆっくり大きく、止めるときは ゆっくり小さく
// - 曲の終わり 8秒は 自動で小さくして、3秒 しずかにしてから 次の曲へ
// - 順番: 'order' 順番に / 'random' ばらばら(同じ曲が続かない) / 'one' 1曲くり返し。最後まで行ったら はじめから

const FADE_IN = 5, FADE_STOP = 1.5, TAIL = 8, GAP = 3;

export class Music {
  constructor() {
    this.tracks = [];
    this.idx = 0;
    this.order = 'random';
    this.volume = 0.4;
    this.playing = false;
    this.onchange = null;
    this.audio = new Audio();
    this.audio.preload = 'none';
    this.audio.crossOrigin = 'anonymous';
    this.audio.setAttribute('playsinline', '');
    this.ctx = null; this.gain = null;
    this.tailing = false;
    this.gapTimer = 0;
    this.loaded = -1;
    this.audio.addEventListener('timeupdate', () => this.tick());
    this.audio.addEventListener('ended', () => this.afterEnd());
    this.audio.addEventListener('error', () => { if (this.playing) this.afterEnd(); });
  }

  async load() {
    try {
      const r = await fetch('music/tracks.json', { cache: 'no-cache' });
      const list = await r.json();
      this.tracks = (Array.isArray(list) ? list : list.tracks || []).filter((t) => t && t.file);
    } catch (e) { this.tracks = []; }
    return this.tracks.length;
  }

  ensureCtx() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch (e) {}
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    const src = this.ctx.createMediaElementSource(this.audio);
    this.gain = this.ctx.createGain();
    this.gain.gain.value = 0;
    src.connect(this.gain).connect(this.ctx.destination);
  }

  ramp(to, secs) {
    if (!this.gain) { this.audio.volume = to; return; }
    const g = this.gain.gain, now = this.ctx.currentTime;
    g.cancelScheduledValues(now);
    g.setValueAtTime(g.value, now);
    g.linearRampToValueAtTime(to, now + secs);
  }

  src(i) { return 'music/' + this.tracks[i].file; }
  // 曲ごとの音の大きさの そろえ(tracks.json の gain。なければ 1)
  level() { const t = this.tracks[this.idx]; return this.volume * (t && t.gain ? t.gain : 1); }

  // 画面にふれたとき(ユーザーの操作の中)で呼ぶこと
  play(fade = FADE_IN) {
    if (!this.tracks.length) return;
    this.ensureCtx();
    clearTimeout(this.gapTimer);
    if (this.loaded !== this.idx) { this.audio.src = this.src(this.idx); this.loaded = this.idx; }
    this.tailing = false;
    if (this.gain) this.gain.gain.value = 0; else this.audio.volume = 0;
    const p = this.audio.play();
    if (p && p.catch) p.catch(() => {});
    this.ramp(this.level(), fade);
    this.playing = true;
    this.meta();
    this.changed();
  }

  stop(fade = FADE_STOP) {
    if (!this.playing) return;
    this.playing = false;
    clearTimeout(this.gapTimer);
    this.ramp(0, fade);
    const a = this.audio;
    setTimeout(() => { if (!this.playing) a.pause(); }, fade * 1000 + 80);
    this.changed();
  }

  // アプリを閉じたとき: すぐ止める(「かけていた」ことは覚えたまま)
  pauseNow() {
    if (!this.playing) return false;
    this.playing = false;
    clearTimeout(this.gapTimer);
    if (this.gain) { this.gain.gain.cancelScheduledValues(0); this.gain.gain.value = 0; }
    this.audio.pause();
    return true;
  }

  toggle() { this.playing ? this.stop() : this.play(); }

  setVolume(v) {
    this.volume = v;
    if (this.playing && !this.tailing) this.ramp(this.level(), 0.15);
  }

  // ゆっくり小さくして止める(おやすみの終わり)
  fadeOut(secs) { if (this.playing) this.stop(secs); }

  pick(i) {
    this.idx = i;
    this.audio.src = this.src(i);
    this.loaded = i;
    this.play(2.5);
  }

  nextIndex() {
    const n = this.tracks.length;
    if (this.order === 'one') return this.idx;
    if (n < 2) return 0;
    if (this.order === 'order') return (this.idx + 1) % n;
    let j;
    do { j = Math.floor(Math.random() * n); } while (j === this.idx);
    return j;
  }

  next() { this.pick(this.nextIndex()); }

  tick() {
    const a = this.audio;
    if (!this.playing || !isFinite(a.duration) || this.tailing) return;
    if (a.duration - a.currentTime <= TAIL) {
      this.tailing = true;
      this.ramp(0, Math.max(0.5, a.duration - a.currentTime));
    }
  }

  afterEnd() {
    if (!this.playing) return;
    this.tailing = false;
    this.gapTimer = setTimeout(() => {
      if (!this.playing) return;
      const j = this.nextIndex();
      if (j !== this.idx || this.loaded !== j) { this.idx = j; this.audio.src = this.src(j); this.loaded = j; }
      else this.audio.currentTime = 0;
      const p = this.audio.play();
      if (p && p.catch) p.catch(() => {});
      this.ramp(this.level(), 3);
      this.meta();
      this.changed();
    }, GAP * 1000);
  }

  meta() {
    if (!('mediaSession' in navigator)) return;
    const t = this.tracks[this.idx];
    try {
      navigator.mediaSession.metadata = new MediaMetadata({ title: t.title || '', artist: t.artist || 'ROGUE PINK', album: 'ひとくべ' });
      navigator.mediaSession.setActionHandler('nexttrack', () => this.next());
      navigator.mediaSession.setActionHandler('play', () => this.play(2));
      navigator.mediaSession.setActionHandler('pause', () => this.stop());
    } catch (e) {}
  }

  changed() { if (this.onchange) this.onchange(); }
}
