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

## まだのこと
- 作っている途中(2026-10-25)
