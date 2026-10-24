'use strict';
/* 電波がなくても開けるようにする(ホーム画面に入れたあと)。
   - アプリの本体(下の FILES)は、はじめに全部覚える。開くときは まずネットで最新を取りにいき、3秒つながらなければ 覚えているものを出す。
   - 動画・静止画(media/)・音(sound/)・曲(music/)・文字の形は、一度使ったものだけ 覚えておく(はじめに全部はダウンロードしない)。
   - 動画は ブラウザが「途中から少しずつ」読む(Range)。ネットにつながるときは ふつうにネットから。
     つながらないときは、覚えている動画から その部分を切りだして渡す。
   FILES を変えたときは VERSION を1つ上げる。 */
const VERSION = 'takibi-v1';
const FILES = ['./', 'index.html', 'css/app.css', 'js/app.js', 'js/fire.js', 'js/sound.js', 'js/music.js', 'js/scenes.js',
  'manifest.webmanifest', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/maskable-512.png', 'icons/apple-touch-icon.png'];
const KEEP = 'takibi-keep';   // 動画・音・曲・フォント(VERSION を上げても消さない)

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(FILES)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION && k !== KEEP).map((k) => caches.delete(k))))
    // 作り直す前の 動画・絵は もう使わないので 消す(js/scenes.js の MEDIA_V と ちがう ?v= のもの)
    .then(() => fetch('js/scenes.js', { cache: 'no-store' }).then((r) => r.text()).then((t) => {
      const m = /MEDIA_V\s*=\s*(\d+)/.exec(t);
      if (!m) return;
      return caches.open(KEEP).then((c) => c.keys().then((reqs) => Promise.all(reqs.filter((r) => /\/media\//.test(r.url) && !r.url.endsWith('?v=' + m[1])).map((r) => c.delete(r)))));
    }).catch(() => {}))
    .then(() => self.clients.claim()));
});

// 覚えている動画から、頼まれた部分(bytes=始め-終わり)だけ切りだす
async function slice(req, full) {
  const buf = await full.arrayBuffer();
  const m = /bytes=(\d*)-(\d*)/.exec(req.headers.get('range') || '');
  const size = buf.byteLength;
  let a = m && m[1] ? +m[1] : 0, b = m && m[2] ? +m[2] : size - 1;
  if (m && !m[1] && m[2]) { a = Math.max(0, size - +m[2]); b = size - 1; }
  b = Math.min(b, size - 1);
  if (a > b) return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${size}` } });
  return new Response(buf.slice(a, b + 1), { status: 206, headers: {
    'Content-Type': full.headers.get('Content-Type') || 'video/mp4', 'Content-Range': `bytes ${a}-${b}/${size}`,
    'Content-Length': String(b - a + 1), 'Accept-Ranges': 'bytes' } });
}
const filling = new Set();

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const isFont = url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com';
  const isMedia = url.origin === location.origin && /\/(media\/.+\.(mp4|jpg|webp)|sound\/.+\.(m4a|mp3|aac|ogg|wav)|music\/.+\.(mp3|m4a|aac|ogg|wav))$/i.test(url.pathname);
  if (isMedia && req.headers.has('range')) {
    // 動画の途中読み: ネットが先。だめなら 覚えているものから切りだす。はじめて見た動画は うしろで まるごと覚える
    const key = url.href;
    e.respondWith(fetch(req).catch(() => caches.open(KEEP).then((c) => c.match(key)).then((hit) => hit ? slice(req, hit) : Response.error())));
    if (!filling.has(key)) {
      filling.add(key);
      e.waitUntil(caches.open(KEEP).then((c) => c.match(key).then((hit) => hit || fetch(key).then((res) => { if (res.ok && res.status === 200) return c.put(key, res); })))
        .catch(() => {}).then(() => filling.delete(key)));
    }
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
