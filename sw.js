'use strict';
/* 電波がなくても開けるようにする(ホーム画面に入れたあと)。
   - アプリの本体(下の FILES)は、はじめに全部覚える。開くときは まずネットで最新を取りにいき、3秒つながらなければ 覚えているものを出す。
     場面の静止画・熾火の絵も はじめに覚える(js/scenes.js を読んで MEDIA_V つきで)。
   - 動画・音(sound/)・曲(music/)・文字の形は、一度使ったものだけ 覚えておく(はじめに全部はダウンロードしない)。
   - 動画は ブラウザが「途中から少しずつ」読む(Range)。iPhone は 流すたびに 何度も読みにくる(1時間で 0.5〜0.9GB にもなった)。
     そこで、覚えた動画があれば 電波があっても 覚えたものから その部分を切りだして渡す。
     覚えていなければ、まるごと1回だけ取ってきて覚え、そこから切りだす(同じ動画を2回ダウンロードしない)。
   - 古い動画・音(MEDIA_V や 音の v が上がる前のもの)は、開くたびに js/app.js が消す。
   FILES を変えたときは VERSION を1つ上げる。 */
const VERSION = 'takibi-v3';
const FILES = ['./', 'index.html', 'install.js', 'shots/1.jpg', 'shots/2.jpg', 'shots/3.jpg', 'shots/4.jpg', 'css/app.css', 'js/app.js', 'js/fire.js', 'js/sound.js', 'js/music.js', 'js/scenes.js',
  'sound/sounds.json', 'music/tracks.json',
  'manifest.webmanifest', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/maskable-512.png', 'icons/apple-touch-icon.png'];
const KEEP = 'takibi-keep';   // 動画・絵・音・曲・フォント(VERSION を上げても消さない。古いものは app.js が消す)

// js/scenes.js から、はじめに覚える絵(静止画・熾火の絵)を ?v=MEDIA_V つきで 取りだす
async function sceneImages() {
  const t = await (await fetch('js/scenes.js', { cache: 'no-store' })).text();
  const m = /MEDIA_V\s*=\s*(\d+)/.exec(t);
  if (!m) return [];
  const out = [];
  for (const x of t.matchAll(/"(?:still|ember)"\s*:\s*"([^"]+)"/g)) out.push(`${x[1]}?v=${m[1]}`);
  return out;
}

async function install() {
  await (await caches.open(VERSION)).addAll(FILES);
  try {   // 静止画・熾火の絵(失敗しても 入れるのは止めない)
    const keep = await caches.open(KEEP);
    for (const u of await sceneImages()) {
      if (await keep.match(u)) continue;
      const r = await fetch(u);
      if (r.ok) await keep.put(u, r);
    }
  } catch (e) {}
}
self.addEventListener('install', (e) => { e.waitUntil(install().then(() => self.skipWaiting())); });
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION && k !== KEEP).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

// 覚えた動画の中身(なんども切りだすので 4本だけ 手もとに置いておく)
const mem = new Map();
function remember(key, b) { mem.delete(key); mem.set(key, b); while (mem.size > 4) mem.delete(mem.keys().next().value); return b; }
// 動画の中身を わたす。覚えていなければ まるごと1回だけ取ってきて覚える(同じ動画を いくつも同時に頼まれても 1回だけ)
const filling = new Map();
function bytes(key) {
  if (mem.has(key)) return Promise.resolve(remember(key, mem.get(key)));
  if (!filling.has(key)) {
    const p = caches.open(KEEP).then((c) => c.match(key).then((hit) => hit || fetch(key).then((res) => {
      if (!res.ok || res.status !== 200) return null;                 // 取れなかった(この動画は とばされる)
      return c.put(key, res.clone()).then(() => res, () => res);       // 覚えられなくても(容量など) 今回は渡す
    }))).then((res) => res && res.arrayBuffer().then((buf) => remember(key, { buf, type: res.headers.get('Content-Type') || 'video/mp4' })));
    filling.set(key, p);
    p.then(() => filling.delete(key), () => filling.delete(key));
  }
  return filling.get(key);
}
// 頼まれた部分(bytes=始め-終わり)だけ 切りだす
function slice(req, b) {
  const m = /bytes=(\d*)-(\d*)/.exec(req.headers.get('range') || '');
  const size = b.buf.byteLength;
  let a = m && m[1] ? +m[1] : 0, z = m && m[2] ? +m[2] : size - 1;
  if (m && !m[1] && m[2]) { a = Math.max(0, size - +m[2]); z = size - 1; }
  z = Math.min(z, size - 1);
  if (a > z) return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${size}` } });
  return new Response(b.buf.slice(a, z + 1), { status: 206, headers: {
    'Content-Type': b.type, 'Content-Range': `bytes ${a}-${z}/${size}`,
    'Content-Length': String(z - a + 1), 'Accept-Ranges': 'bytes' } });
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const isFont = url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com';
  const isMedia = url.origin === location.origin && /\/(media\/.+\.(mp4|jpg|webp)|sound\/.+\.(m4a|mp3|aac|ogg|wav)|music\/.+\.(mp3|m4a|aac|ogg|wav))$/i.test(url.pathname);
  if (isMedia && req.headers.has('range')) {
    // 動画の途中読み: 覚えたものから切りだす。覚えていなければ まるごと1回取ってきて 覚えてから
    const key = url.href;
    e.respondWith(bytes(key).then((b) => b ? slice(req, b) : Response.error(), () => Response.error()));
    return;
  }
  if (isFont || isMedia) {
    e.respondWith(caches.open(KEEP).then((c) => c.match(req).then((hit) => hit || fetch(req).then((res) => {
      if ((res.ok && res.status === 200) || res.type === 'opaque') c.put(req, res.clone());
      return res;
    }))));
    return;
  }
  if (url.origin !== location.origin) return;
  const nav = req.mode === 'navigate';
  const key = nav ? './' : req;
  const net = fetch(req).then((res) => {
    if (res.ok) { const copy = res.clone(); e.waitUntil(caches.open(VERSION).then((c) => c.put(key, copy))); }
    return res;
  });
  const late = new Promise((r) => setTimeout(r, 3000));
  const fromCache = () => caches.match(key, { ignoreSearch: nav }).then((hit) => hit || (nav ? caches.match('index.html') : undefined));
  e.respondWith(Promise.race([net, late.then(() => fromCache().then((hit) => hit || net))]).then((res) => res || net).catch(() => fromCache().then((hit) => hit || Response.error())));
});
