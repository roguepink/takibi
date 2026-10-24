// ひとくべ — 画面の動き(火をつける・操作を出す/かくす・場所・音・おやすみ・覚えておく)
// 操作の決まりは 姉妹アプリ「一灯」(rosoku)と同じ。
import { Fire, SIZES, BRIGHT, WARMTH } from './fire.js';
import { SCENES, MEDIA_V } from './scenes.js';
import { Sound } from './sound.js';
import { Music } from './music.js';

const $ = (id) => document.getElementById(id);
const KEY = 'takibi-v1';
const SLEEPS = [
  { min: 0, name: 'なし' }, { min: 5, name: '5分' }, { min: 10, name: '10分' }, { min: 15, name: '15分' },
  { min: 30, name: '30分' }, { min: 45, name: '45分' }, { min: 60, name: '60分' }, { min: 90, name: '90分' },
];
const TOUCH_TO_LIGHT = 'ふれると、火がともります';
const IDLE = 0.74;   // 火をつける前・消したあとの 黒い幕の濃さ(熾火の絵が うっすら見える)
const AMB_NAME = { yama: '森の音', umi: '波の音' };
const placeName = (s) => `${s.name}の焚き火`;
const params = new URLSearchParams(location.search);

// ---------- 覚えておく ----------
const st = Object.assign(
  { scene: 0, size: 0, bright: 3, warm: 0, soundOn: true, fireVol: 80, ambVol: 65, vol: 40, order: 'random', musicOn: false, track: 0, hints: 0 },
  load()
);
function load() { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { return {}; } }
function save() { try { localStorage.setItem(KEY, JSON.stringify(st)); } catch (e) {} }   // LINE の中などで 失敗しても 止まらない
if (params.has('scene')) { const i = SCENES.findIndex((s) => s.id === params.get('scene')); if (i >= 0) st.scene = i; }
if (!(st.scene < SCENES.length)) st.scene = 0;

// ---------- 場面 ----------
const fire = new Fire($('scene'));
fire.set({ size: st.size, bright: st.bright, warm: st.warm });
fire.setScene(st.scene, false);
fire.setEmber(true, 0);
fire.fade = 1; fire.fadeIn = 3.0; fire.fadeTarget = IDLE;   // はじめは 火をつける前の 熾火が 暗く うっすら見える
fire.start();

const sound = new Sound();
sound.fireVol = st.fireVol / 100; sound.ambVol = st.ambVol / 100;
const music = new Music();
music.volume = st.vol / 100; music.order = st.order;

// phase: 'dark' はじめ / 'lit' 火がついている / 'out' 自分で消した / 'slept' おやすみで消えた(終わりの動画〜真っ黒)
let phase = 'dark';

// ---------- はじめ ----------
setTimeout(() => $('title').classList.add('on'), 200);
setTimeout(() => { if (phase === 'dark') showHint(TOUCH_TO_LIGHT); }, 900);

// 案内(下の暗い所)。lines を渡すと その位置で改行する
function showHint(text, lines) {
  const h = $('hint');
  if (lines) { h.textContent = ''; lines.forEach((l, i) => { if (i) h.appendChild(document.createElement('br')); h.appendChild(document.createTextNode(l)); }); }
  else h.textContent = text;
  h.classList.add('on');
}
function hideHint() { $('hint').classList.remove('on'); }
let toastT = 0;
function toast(text, ms = 2000) {
  const t = $('toast'); t.textContent = text; t.classList.add('on');
  clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('on'), ms);
}

// 読みこみ中: 3秒たっても動画が流れなければ「よみこんでいます」を うすく出す
let loadWatch = 0, stillSince = 0;
function watchLoading() {
  clearInterval(loadWatch); stillSince = performance.now();
  loadWatch = setInterval(() => {
    const l = $('loading');
    if (phase !== 'lit' || document.hidden) { l.classList.remove('on'); if (phase !== 'lit') clearInterval(loadWatch); return; }
    if (fire.moving) { stillSince = performance.now(); l.classList.remove('on'); return; }
    if (performance.now() - stillSince > 3000 && !uiOn) { hideHint(); l.classList.add('on'); }
  }, 500);
}
function hideLoading() { clearInterval(loadWatch); $('loading').classList.remove('on'); }

// 1本目の動画を読み終わるまで 音は読まない(遅い回線で 動画を先に。最長30秒まつ)
function firstClipLoaded() {
  return new Promise((res) => {
    const t0 = Date.now();
    const tick = () => {
      const v = fire.v[fire.cur];
      let done = fire.allBad || fire.played > 0 || Date.now() - t0 > 30000;
      try {
        if (!done && v.readyState >= 3) {
          const end = v.buffered.length ? v.buffered.end(v.buffered.length - 1) : 0;
          if ((isFinite(v.duration) && end >= v.duration - 0.3) || v.networkState === 1) done = true;   // 全部読んだ・読みこみが ひと休みした
        }
      } catch (e) {}
      if (done) res(); else setTimeout(tick, 400);
    };
    tick();
  });
}
let soundGated = false;

let outT = 0, relightT = 0, darkDone = false, lineShown = false;
// 火をつける(ふれた操作の中で呼ぶ → 動画・音・画面つけっぱなしを ここで始められる)
function lightUp() {
  const again = phase === 'slept' || phase === 'out';
  phase = 'lit'; darkDone = false;
  clearTimeout(outT); clearTimeout(relightT);
  $('title').classList.remove('on');
  hideHint();
  $('relight').hidden = true;
  fire.dim = 1;
  if (again) { fire.setScene(st.scene, false); if (fire.fade >= 0.99) fire.setEmber(true, 0); }
  fire.play();
  fire.setEmber(false, 2.6);            // 熾火から 炎へ ふわっと
  fire.fadeIn = 2.5; fire.fadeTarget = 0;
  if (!fire.running) fire.start();
  wake(true);
  if (!soundGated) { soundGated = true; sound.gate = firstClipLoaded(); }
  if (st.soundOn) startSound();
  if (st.musicOn && music.tracks.length) music.play();
  watchLoading();
  if (st.hints < 3) {
    st.hints++; save();
    setTimeout(() => { if (phase === 'lit' && !uiOn && fire.moving) showHint('画面にふれると、場所や音をえらべます'); }, 6000);
    setTimeout(() => { if (!uiOn) hideHint(); }, 11000);
  }
  // LINE の中: 1回だけ「ブラウザで開く」を うすく案内(LINE の中では 画面が消えやすく、ホーム画面にも入れられない)
  if (inLine && !lineShown) {
    lineShown = true;
    setTimeout(() => { if (phase === 'lit' && !uiOn) { hideLoading(); showHint('', ['右上の「…」から', '『ブラウザで開く』を押すと、', '画面が消えずに ずっと見られます']); } }, 12500);
    setTimeout(() => { if (!uiOn) hideHint(); }, 22500);
  }
  const t = +params.get('sleep');   // 隠し設定: ?sleep=20 → 20秒で おやすみ(確かめ用)
  if (t > 0 && !sleepEnd) sleepSecs(t);
}

function startSound() { sound.start(SCENES[st.scene].id); refreshLabels(); }

// 自分で消す: 炎が 熾火へ ゆっくり → 暗く → 「ふれると、火がともります」
function putOut() {
  phase = 'out';
  hideUI(true); clearSleep(); hideLoading(); hideHint();
  fire.fadeOut = 2.5; fire.fadeTarget = IDLE;
  fire.setEmber(true, 3);
  sound.stop(3); music.stop(3);         // 止めおわったら 音の仕組みも休ませる(sound.js)
  outT = setTimeout(() => {
    if (phase !== 'out') return;
    fire.chain = false; fire.pauseAll();
    showHint(TOUCH_TO_LIGHT);
    // 1分たったら、画面のつけっぱなしをやめ、描くのも止める(電池のため)
    outT = setTimeout(() => { if (phase === 'out') { fire.stop(); wake(false); } }, 57000);
  }, 3000);
}

// おやすみの終わり: 終わりの動画(火が小さくなって熾火)→ だんだん暗く → 真っ黒。音も小さく消える。描くのも止める
function sleepOut() {
  phase = 'slept';
  hideUI(true); clearSleep(); hideLoading(); hideHint();
  sound.fadeTo(0.3, 12);
  fire.playEnd(
    () => { sound.fadeTo(0.12, 10); },                        // 終わりの動画が はじまった
    () => {                                                   // 終わりの動画が おわった → 最後の絵のまま 暗くする
      if (phase !== 'slept') return;
      fire.fadeOut = 15; fire.fadeTarget = 1;
      sound.fadeTo(0, 14);
      if (music.playing) music.fadeOut(10);
      outT = setTimeout(() => { if (phase === 'slept') finishDark(); }, 15500);
    });
}
// 真っ黒にして すべて止める(音の仕組みも休ませる・画面つけっぱなしをやめる・描くのも止める)
function finishDark() {
  darkDone = true;
  fire.cancelEnd(); fire.chain = false; fire.pauseAll();
  fire.fade = fire.fadeTarget = 1; fire.draw();
  sound.stop(0.1);
  if (music.playing) music.stop(0.1);
  resumeMusic = false;
  fire.stop(); wake(false);
}
// 画面を消している間・ほかのアプリの間に 時間がすぎていた → もどったとき 音を出さずに すぐ真っ黒
function goDark() {
  phase = 'slept';
  clearTimeout(outT);
  hideUI(true); clearSleep(); hideLoading(); hideHint();
  finishDark();
}
// ---------- 操作の部品を出す・かくす ----------
const ui = $('ui');
let uiOn = false, uiAt = 0, hideT = 0, fadeT = 0, sheet = null;
ui.inert = true;
function showUI() {
  if (phase !== 'lit') return;
  uiOn = true; uiAt = performance.now();
  clearTimeout(fadeT);
  ui.inert = false;
  ui.classList.remove('fading');
  ui.classList.add('on'); ui.setAttribute('aria-hidden', 'false');
  document.body.classList.remove('nocursor');
  hideHint(); $('loading').classList.remove('on');
  refreshLabels();
  bump();
}
function hideUI(now) {
  uiOn = false;
  clearTimeout(hideT); clearTimeout(fadeT);
  ui.classList.remove('on'); ui.setAttribute('aria-hidden', 'true');
  if (!now) ui.classList.add('fading');   // 消えかけ(1.2秒)の間は、押せば また出てくる
  fadeT = setTimeout(() => {
    ui.classList.remove('fading');
    if (uiOn) return;
    ui.inert = true;
    document.body.classList.add('nocursor');
    openSheet(null);
  }, now ? 0 : 1200);
}
function bump() {
  clearTimeout(hideT);
  hideT = setTimeout(() => hideUI(), sheet ? 15000 : 6000);
}
function openSheet(id) {
  sheet = sheet === id ? null : id;   // 同じボタンを もう一度押すと閉じる
  for (const s of ['place', 'sound', 'music', 'sleep', 'adjust']) $(s).hidden = s !== sheet;
  $('drawer').classList.toggle('top', sheet === 'adjust');   // 「ととのえる」は 火をかくさないように 上に出す
  document.querySelectorAll('#bar [data-open]').forEach((b) => b.classList.toggle('cur', b.dataset.open === sheet));
  if (uiOn) bump();
}
document.querySelectorAll('#bar [data-open]').forEach((b) => b.addEventListener('click', () => openSheet(b.dataset.open)));
ui.addEventListener('pointerdown', () => { if (!uiOn) showUI(); else bump(); }, true);
ui.addEventListener('input', () => { if (uiOn) bump(); });

// 画面(火)にふれたとき
let down = null, tappedAt = -1e9;
addEventListener('pointerdown', (e) => {
  if (e.button > 0) return;
  if (e.target.closest('.bar, .sheet, .relight')) return;
  down = { x: e.clientX, y: e.clientY, wasOn: uiOn };
});
addEventListener('pointercancel', () => { down = null; });
addEventListener('pointerup', (e) => {
  if (!down) return;
  const d = down; down = null;
  // iPhone の Safari は、ボタン以外の所をタップしても click を出さないことがある(一灯で「開けない」と言われた原因)。
  // 火をつける・もう一度つける は、指を離したとき(pointerup)に行う。pointerup は iPhone でも「ふれた」扱いなので 音も出せる
  if (phase !== 'lit') {
    if (Math.hypot(e.clientX - d.x, e.clientY - d.y) <= 20) { tappedAt = performance.now(); tapIdle(); }
    return;
  }
  // 音が止まっていたら(画面にもどったとき など)、ふれたついでに また鳴らす
  if (st.soundOn) { if (!sound.on && sound.has) startSound(); else sound.resume(); }
  if (st.musicOn && music.tracks.length && !music.playing && !sleepEnd) { if (music.ctx) music.ctx.resume(); music.play(3); }
  fire.play();   // 止まっていたら 流しなおす(ふれた操作の中なので iPhone でも流せる)
  const dx = e.clientX - d.x, dy = e.clientY - d.y;
  // 操作が出ているときだけ、左右にはらうと 場所が変わる
  if (d.wasOn && Math.abs(dx) > 80 && Math.abs(dy) < Math.abs(dx) * 0.5) {
    changeScene((st.scene + (dx < 0 ? 1 : -1) + SCENES.length) % SCENES.length);
    bump();
    return;
  }
  if (Math.hypot(dx, dy) > 20) return;
  if (!uiOn) showUI();
  else if (performance.now() - uiAt > 300) hideUI();
});
function tapIdle() {
  if (phase === 'dark' || phase === 'out') lightUp();
  else if (phase === 'slept') {
    $('relight').hidden = false;
    clearTimeout(relightT);
    relightT = setTimeout(() => { $('relight').hidden = true; }, 10000);   // 暗い寝室で 光りつづけないように
  }
}
// パソコン(マウス)・キーボード用。指でふれた直後の click は 二重にしない
addEventListener('click', (e) => {
  if (e.button > 0 || e.target.closest('.bar, .sheet, .relight')) return;
  if (performance.now() - tappedAt < 800) return;
  if (phase !== 'lit') tapIdle();
});
$('relight').addEventListener('click', () => { fire.fadeIn = 3; lightUp(); });
let lastMove = null;
addEventListener('pointermove', (e) => {
  if (e.pointerType !== 'mouse' || phase !== 'lit') return;
  if (lastMove && Math.hypot(e.clientX - lastMove[0], e.clientY - lastMove[1]) > 8) { if (!uiOn) showUI(); else bump(); }
  lastMove = [e.clientX, e.clientY];
});
addEventListener('focusin', (e) => { if (e.target.closest && e.target.closest('#ui') && !uiOn) showUI(); });

// ---------- 場所(山 / 海) ----------
const places = $('places');
SCENES.forEach((s, i) => {
  const b = document.createElement('button');
  b.innerHTML = `<img src="${s.still}?v=${MEDIA_V}" alt="" loading="lazy"><span></span>`;
  b.lastChild.textContent = placeName(s);
  b.addEventListener('click', () => { changeScene(i); openSheet(null); hideUI(); });
  places.appendChild(b);
});
let switching = 0, switchBusy = false;
// 黒をはさんで ゆっくり入れかえる。まわりの音も ゆっくり入れかえる。
// 切りかえ中(黒くなって もどりはじめるまで 約2.6秒)に また押されても 無視する(音を何度も開きなおさないように)
function changeScene(i) {
  if (i === st.scene || switchBusy) return;
  switchBusy = true;
  st.scene = i; save(); refreshChoices(); refreshLabels();
  toast(placeName(SCENES[i]), 2600);
  sound.setScene(SCENES[i].id, 6);
  clearTimeout(switching);
  fire.fadeOut = 1.4; fire.fadeTarget = 1;
  switching = setTimeout(() => {
    const lit = phase === 'lit';
    fire.setScene(i, lit);
    if (!lit) fire.setEmber(true, 0);
    fire.fadeIn = 2.6; fire.fadeTarget = lit ? 0 : IDLE;
    switching = setTimeout(() => { switchBusy = false; }, 1000);
  }, 1600);
}

// ---------- ととのえる ----------
function choices(el, items, get, set) {
  el.innerHTML = '';
  items.forEach((it, i) => {
    const b = document.createElement('button');
    if (it.html) b.innerHTML = it.html; else b.textContent = it.name;
    b.setAttribute('aria-label', it.label || it.name);
    b.addEventListener('click', () => { set(i); refreshChoices(); save(); });
    el.appendChild(b);
  });
  el._get = get;
}
choices($('sizeChoices'), SIZES, () => st.size, (i) => { st.size = i; fire.set({ size: i }); });
choices($('brightChoices'), BRIGHT.map((_, i) => ({ html: `<i style="width:${7 + i * 2}px;height:${7 + i * 2}px;opacity:${0.45 + i * 0.13}"></i>`, label: `明るさ ${i + 1}` })),
  () => st.bright, (i) => { st.bright = i; fire.set({ bright: i }); });
choices($('warmChoices'), WARMTH, () => st.warm, (i) => { st.warm = i; fire.set({ warm: i }); });
const ORDERS = ['order', 'random', 'one'];
choices($('orderChoices'), [{ name: '順番に' }, { name: 'ばらばら' }, { name: '1曲くり返し' }], () => Math.max(0, ORDERS.indexOf(st.order)), (i) => { st.order = ORDERS[i]; music.order = st.order; });
choices($('sleepChoices'), SLEEPS, () => sleepIdx, (i) => { setSleep(i); openSheet(null); });   // 選んだら 板を閉じる

function refreshChoices() {
  document.querySelectorAll('.choices').forEach((el) => {
    if (!el._get) return;
    const v = el._get();
    [...el.children].forEach((b, i) => b.setAttribute('aria-pressed', String(i === v)));
  });
  [...places.children].forEach((b, i) => b.setAttribute('aria-pressed', String(i === st.scene)));
}
$('out').addEventListener('click', () => { if (phase === 'lit') putOut(); });

// ---------- おやすみ ----------
// 時間は Date.now() で見る。画面が消えて描くのが止まっても、1秒ごとの見張りで 終わりを必ず通る。
let sleepIdx = 0, sleepEnd = 0, faded = false, sleepWatch = 0, sleepStopping = false;
// 最後の1分で 小さくしていた音・曲・火を もどす(おやすみを 変えた・やめたとき)
function unfade() {
  if (!faded) return;
  faded = false;
  sound.fadeTo(1, 3);
  fire.dim = 1;
  if (sleepStopping) { sleepStopping = false; if (st.musicOn && music.tracks.length && !music.playing) music.play(3); }
}
function setSleep(i) {
  sleepIdx = i; unfade();
  if (SLEEPS[i].min === 0) { clearSleep(); fire.dim = 1; }
  else {
    sleepEnd = Date.now() + SLEEPS[i].min * 60000;
    toast('おやすみ ' + SLEEPS[i].name, 2200);
    clearInterval(sleepWatch); sleepWatch = setInterval(sleepTick, 1000);
  }
  refreshLabels();
}
function sleepSecs(s) {   // 確かめ用(短い時間で おやすみ)
  sleepIdx = 1; unfade(); sleepEnd = Date.now() + s * 1000;
  clearInterval(sleepWatch); sleepWatch = setInterval(sleepTick, 1000);
  refreshLabels();
}
function clearSleep() {
  sleepEnd = 0; sleepIdx = 0;
  clearInterval(sleepWatch);
  refreshChoices(); refreshLabels();
}
function sleepTick() {
  if (!sleepEnd || phase !== 'lit') return;
  const left = (sleepEnd - Date.now()) / 1000;
  if (left <= 0) {
    // 画面を消している間・ほかのアプリの間に すぎていた → 音を出さずに 真っ黒のまま
    if (document.hidden || left < -5) { goDark(); return; }
    if (switchBusy) return;   // 場所の切りかえ中なら、切りかえが すんでから(1秒ごとに また見る)
    sleepOut(); return;
  }
  // 最後の1分: 曲と音を 少しずつ小さく、火も ほんの少し暗く
  if (left <= 60 && !faded) {
    faded = true; sound.fadeTo(0.55, Math.max(3, left));
    if (music.playing) { sleepStopping = true; music.fadeOut(Math.max(5, left)); }
  }
  fire.dim = left < 60 ? 0.82 + 0.18 * Math.max(0, left) / 60 : 1;
}

let labelT = 0;
function refreshLabels() {
  const l = $('sleepLab');
  if (sleepEnd && phase === 'lit') {
    const m = Math.max(1, Math.ceil((sleepEnd - Date.now()) / 60000));
    l.textContent = `あと${m}分`; l.classList.add('timing');
  } else { l.textContent = 'おやすみ'; l.classList.remove('timing'); }
  $('ambLab').textContent = AMB_NAME[SCENES[st.scene].id] || 'まわりの音';
  $('splay').textContent = st.soundOn ? '音を止める' : '音を出す';
  $('soundBtn').classList.toggle('playing', st.soundOn && sound.on);
  $('musicBtn').classList.toggle('playing', music.playing);
  $('mplay').textContent = music.playing ? '止める' : '流す';
  [...$('tracks').querySelectorAll('button')].forEach((b, i) => {
    const on = music.playing && i === music.idx;
    b.setAttribute('aria-current', String(on));
    b.querySelector('.mark').textContent = on ? '・' : '';
  });
  clearTimeout(labelT);
  if (uiOn) labelT = setTimeout(refreshLabels, 15000);
}

// ---------- 音 ----------
sound.load().then((ok) => { if (ok) $('soundBtn').hidden = false; cleanCaches(ok ? sound.rev : null); });

// スマホに覚えた 古い動画・音を消す(作り直して MEDIA_V や 音の v が上がったら、前のものは もう使わない)
async function cleanCaches(soundRev) {
  try {
    if (!('caches' in window) || !(await caches.has('takibi-keep'))) return;
    const c = await caches.open('takibi-keep');
    for (const r of await c.keys()) {
      const u = new URL(r.url);
      if (/\/media\//.test(u.pathname)) { if (u.search !== '?v=' + MEDIA_V) await c.delete(r); }
      else if (/\/sound\/.+\.(m4a|mp3|aac|ogg|wav)$/i.test(u.pathname) && soundRev != null) { if (u.search !== soundRev) await c.delete(r); }
    }
  } catch (e) {}
}
$('splay').addEventListener('click', () => {
  st.soundOn = !st.soundOn; save();
  if (st.soundOn) startSound(); else sound.stop(1.5);
  refreshLabels();
});
$('fireVol').value = st.fireVol;
$('ambVol').value = st.ambVol;
$('fireVol').addEventListener('input', (e) => { st.fireVol = +e.target.value; sound.setFire(st.fireVol / 100); save(); });
$('ambVol').addEventListener('input', (e) => { st.ambVol = +e.target.value; sound.setAmb(st.ambVol / 100); save(); });

// ---------- 曲(music/tracks.json に曲があるときだけ) ----------
music.onchange = () => {
  if (!sleepStopping) st.musicOn = music.playing;
  st.track = music.idx; save();
  refreshLabels();
};
music.load().then((n) => {
  if (!n) return;
  music.idx = Math.min(st.track, n - 1);
  $('musicBtn').hidden = false;
  const ol = $('tracks');
  music.tracks.forEach((t, i) => {
    const li = document.createElement('li');
    const b = document.createElement('button');
    b.innerHTML = '<span class="mark"></span><span></span>';
    b.lastChild.textContent = t.title || t.file;
    b.addEventListener('click', () => music.pick(i));
    li.appendChild(b); ol.appendChild(li);
  });
  refreshLabels();
});
$('mplay').addEventListener('click', () => music.toggle());
$('vol').value = st.vol;
$('vol').addEventListener('input', (e) => { st.vol = +e.target.value; music.setVolume(st.vol / 100); save(); });

// ---------- 画面を消さない ----------
let lock = null;
async function wake(on) {
  try {
    if (on && 'wakeLock' in navigator) {
      if (!lock) { lock = await navigator.wakeLock.request('screen'); lock.addEventListener('release', () => { lock = null; }); }
    } else if (!on && lock) { await lock.release(); lock = null; }
  } catch (e) { if (on) $('wakeNote').hidden = false; }
}
if (!('wakeLock' in navigator)) $('wakeNote').hidden = false;

// アプリを閉じたら(ほかのアプリへ・画面を消す)、音も動画も すぐ止める。もどったら また流す
let resumeMusic = false;
function closeSound() { sound.suspend(); if (music.pauseNow()) resumeMusic = true; refreshLabels(); }
addEventListener('pagehide', closeSound);
document.addEventListener('visibilitychange', () => {
  if (document.hidden) { fire.stop(); closeSound(); return; }
  // はなれている間に おやすみの時間がすぎていた → 音を出さずに すぐ真っ黒
  if (phase === 'lit' && sleepEnd && Date.now() >= sleepEnd) { goDark(); return; }
  if (phase === 'slept') {
    // 暗くなる途中で離れていたら、真っ暗にしておく
    if (darkDone) return;
    if (fire.ending && fire.ending.done) { clearTimeout(outT); finishDark(); return; }
  }
  fire.start();
  if (phase === 'lit' || phase === 'slept') { sound.resume(); }
  if (resumeMusic && phase === 'lit') { resumeMusic = false; if (music.ctx) music.ctx.resume(); music.play(3); }
  if (phase === 'lit') wake(true);
});

// ---------- 全画面・ホーム画面・LINE ----------
const ua = navigator.userAgent;
const isIOS = /iPhone|iPad|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const inLine = /Line\//i.test(ua);
const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone;
if (document.documentElement.requestFullscreen && !isIOS) {
  const fs = $('fs');
  fs.hidden = false;
  fs.addEventListener('click', () => {
    if (document.fullscreenElement) document.exitFullscreen(); else document.documentElement.requestFullscreen().catch(() => {});
  });
  document.addEventListener('fullscreenchange', () => { fs.textContent = document.fullscreenElement ? '元にもどす' : '画面いっぱいにする'; });
}
if (inLine) $('lineNote').hidden = false;
// ホーム画面に入れる案内(年配の人にも分かるように。改行の位置は 手で決める)
const SHARE = '<svg class="ico" viewBox="0 0 24 24" aria-label="四角に上向きの矢印の印"><path d="M8.5 9H6v11h12V9h-2.5"/><path d="M12 3v11M8.5 6.5 12 3l3.5 3.5"/></svg>';
if (!standalone && !inLine && matchMedia('(pointer: coarse)').matches) {
  $('installNote').innerHTML = isIOS
    ? `ホーム画面に入れると、<br>アプリのように すぐ開けます。<br>画面の下の ${SHARE}(□に↑の印)<br>または「…」を押して、<br>『ホーム画面に追加』を えらびます。`
    : 'ホーム画面に入れると、<br>アプリのように すぐ開けます。<br>右上の「︙」を押して、<br>『ホーム画面に追加』を えらびます。';
}
let installEvt = null;
addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault(); installEvt = e;
  const n = $('installNote');
  n.innerHTML = '<button class="link" id="install">ホーム画面に入れる</button>';
  $('install').addEventListener('click', () => { installEvt.prompt(); installEvt = null; n.textContent = ''; });
});

// ---------- キー(パソコン) ----------
addEventListener('keydown', (e) => {
  const inControl = e.target.closest && e.target.closest('input, button');
  if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
    if (inControl || phase !== 'lit') return;
    changeScene((st.scene + (e.key === 'ArrowRight' ? 1 : -1) + SCENES.length) % SCENES.length);
  } else if (e.key === ' ') {
    if (inControl) return;
    e.preventDefault();
    if (phase === 'lit') { if (sound.has) $('splay').click(); } else if (phase !== 'slept') lightUp();
  } else if (e.key === 'Escape') hideUI();
  else if (e.key === 'Enter' && !inControl && (phase === 'dark' || phase === 'out')) lightUp();
});

refreshChoices();
refreshLabels();

if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});

// 確かめ用(自動で確かめるとき)
window.__takibi = {
  fire, sound, music, st, lightUp, putOut, showUI, hideUI, openSheet, setSleep, sleepSecs, changeScene,
  get phase() { return phase; },
  get state() {
    const v = fire.v[fire.cur];
    return { phase, scene: SCENES[st.scene].id, played: fire.played, log: fire.log.slice(), cur: v.dataset.clip, t: v.currentTime, paused: v.paused, ready: v.readyState, fade: fire.fade, xf: !!fire.xf, bad: [...fire.bad], ending: fire.ending ? { started: fire.ending.started, done: !!fire.ending.done } : null, running: fire.running, soundOn: sound.on };
  },
};
