# 焚き火アプリ — takibi リポジトリ

ノブさんの依頼(2026-10-25): 焚き火の映像を、ただ眺める癒しのアプリ。一灯(rosoku)・one candle(kyandoru)の姉妹。
- 場面は2つだけ: **山の焚き火** と **海の焚き火**。
- 同じ場面でも同じ映像がくり返して見えないように、8秒の動画を場面ごとに約10本作り、**ランダムな順番でつなぐ**。
  どの動画も「はじめと終わりが同じ絵」(Google Flow のフレーム指定: 開始=終了=その場面の静止画)なので、つなぎ目が出ない。
- 動画は Google Flow(Veo 3.1 Lite)。Mac の Chrome を Claude in Chrome で動かして作る。人のペースの決まり(~/.claude/scripts/hito-pace.py)を守る。
- 焚き火の音は本物の録音(自由に使えるもの)。まわりの音: 山 = 夜の森、海 = 波。
- 専門家チーム: リーダー(全体の指示)/ 構成係 / デザイン係 / UI・UX係 / 音の専門家 / 音のまとめ係。

## 係の受け持ち(同時に作業するときに ぶつからないように)
- アプリ(構成・UI/UX・デザイン): index.html, css/, js/, sw.js, manifest.webmanifest, icons/
- 音: sound/(音のファイル・sound/sounds.json・sound/CREDITS.md), tools/sound_*.py
- 動画(リーダー): media/, tools/flow_*.py, js/scenes.js

## 約束ごと(つなぐ所)
- js/scenes.js(tools/flow_media.py が作る):
  `export const MEDIA_V = n; export const SCENES = [{ id:'yama', name:'山', clips:['media/yama/01.mp4', …], still:'media/yama/still.jpg', end:'media/yama/end.mp4' }, { id:'umi', … }]`
  clips はどれも 8秒前後・同じ絵で始まって終わる。end は「火が小さくなって熾火(おきび)になる」動画(おやすみの終わりに使う)。動画に音は入れない(音は sound/ で別に流す)。
- sound/sounds.json(音の係が作る): 形は sound/README.md に書く。

## しくみ(構成係・デザイン係・UI/UX係, 2026-10-25)
- 名前: **ひとくべ**(薪を ひとつ くべる)。ROGUE PINK はクレジットだけ。理由と決めたことは docs/design.md。
- ビルドなし。`index.html` + `css/app.css` + `js/`(ES modules・importmap なし)。GitHub Pages でそのまま動く。
- `js/fire.js` … 動画を **ランダムにつなぐ** 場面。`<video>` 2つを重ね、終わる0.4秒前に次を頭から流して0.4秒で重ねる。直前の数本はさける。
  次が読めていなければ いまの動画をくり返す。止まったら流しなおす・読めない動画はとばす・全部だめなら still。おやすみの終わりは end へつないで止める。
  横長の画面は 左右を同じ動画のぼかしでうめる。scenes.js の場面に `fire:[x,y]`(火の位置・絵の割合)があれば「大きさ」の中心に使う(なければ 0.5, 0.68)。
- `js/sound.js` … `sound/sounds.json` だけ読む(fire / yama / umi / pops)。焚き火の音とまわりの音を別々の大きさで。無ければ「音」ボタンを出さず音なし。
- `js/music.js` … 曲(一灯と同じ)。`music/tracks.json` が空 `[]` なので いまは「曲」ボタンは出ない。
- `js/app.js` … 画面の動き・場所・おやすみ・設定の記憶(localStorage `takibi-v1`)。確かめ用 `window.__takibi`、隠し設定 `?sleep=20`・`?scene=umi`。
- `sw.js` … 電波がなくても開ける。動画・音は一度使ったものだけ覚え、電波がないときは覚えた動画から Range を切りだして渡す。本体のファイルを増やしたら FILES と VERSION を直す。
- iPhone で開けない問題(一灯 2026-10-24)の直しは最初から入れてある: 火をつけるのは pointerup、#scene に cursor: pointer、click はパソコン用で二重にしない。

## 確かめ方
- `~/.local/venvs/ryokoshi/bin/python tools/ui_check.py [--only iphone|android|pc] [--fake-sound]`
  iPhone 13(WebKit)・Android(Chrome)・パソコンで、タップ→火がつく→動画が3本以上つながる→操作の板→場所の切りかえ→おやすみ→真っ黒→もう一度つける まで(1台 約1.5分)。
  写真は `_check/ui/`(Git に入れない)。動画の途中読み(Range)ができるサーバーで出す(iPhone は これがないと動画を流さない)。
  `--fake-sound` は 無音の仮の音で 音の仕組みも確かめる(音は出さない)。
- 仕上げに `iphone-check` スキル(古い iPhone・LINE の中・Android)。
- 仮の動画・アイコンの作り方は `_check/app/`(make_placeholder.sh・icons.py)。本物が来たら使わない。

## まだのこと
- 作っている途中(2026-10-25)
