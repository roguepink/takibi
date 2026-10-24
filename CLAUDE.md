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

## しくみ(構成係・デザイン係・UI/UX係, 2026-10-25。直す係が見直しを反映)
- 名前: **ひとくべ**(薪を ひとつ くべる)。ROGUE PINK はクレジットだけ。理由と決めたことは docs/design.md。
- ビルドなし。`index.html` + `css/app.css` + `js/`(ES modules・importmap なし)。GitHub Pages でそのまま動く。
- `js/fire.js` … 動画を **つなぐ** 場面。`<video>` 2つを重ね、終わる0.8秒前に次を頭から流して0.8秒で重ねる。
  順番は「全部1回ずつ流してから混ぜなおす」(直前と同じにならない)。場面を変えた最初の1本は おだやかな動画(fire.js の CALM。いまは 09〜11。番号が変わったら直す)。
  次が読めていなければ いまの動画をくり返す。読めない動画は その場で別の動画へ(読めなかったものは 電波がもどったとき・3分おきに また ためす)。
  見張り: 止まったまま次が準備できていれば次へ、5秒うごかず読みこみも進まなければ別の動画へ。全部だめなら still。
  火をつける前・火を消したあとは scenes.js の ember(熾火の絵)を暗く見せ、火をつけると炎へ ふわっと。読みこみ中は still を見せ、3秒流れなければ「よみこんでいます」。
  おやすみの終わりは end へつなぎ、**半分の速さ**で流して最後の絵で止める(始まったら 長さ+10秒の保険)。
  横長の画面は 絵の全体を 128×72 に写して大きくぼかし左右をうめ、動画のふちは mask でぼかす。`fire:[x,y]`(火の位置)は「大きさ」の中心。
  見た目(filter など)は 値が変わったときだけ書く。
- `js/sound.js` … `sound/sounds.json` だけ読む(fire / yama / umi / pops)。焚き火の音とまわりの音を別々の大きさで。無ければ「音」ボタンを出さず音なし。
  はじめて火をつけたときは 1本目の動画を読み終わってから 音を読む(遅い回線)。使わなくなった音は その場面から30秒はなれてから メモリからはなす。
  止めたら(火を消す・おやすみの終わり・音を止める)消えおわってから AudioContext を suspend。
- `js/music.js` … 曲(一灯と同じ)。`music/tracks.json` が空 `[]` なので いまは「曲」ボタンは出ない。
- `js/app.js` … 画面の動き・場所・おやすみ・設定の記憶(localStorage `takibi-v1`)。確かめ用 `window.__takibi`、隠し設定 `?sleep=20`・`?scene=umi`。
  場所の切りかえ中(約2.6秒)の連打は無視。おやすみの時間が切りかえ中にきたら 切りかえが すんでから終わる。
  画面を消している間に時間がすぎていたら、もどったとき 音を出さずに すぐ真っ黒。開くたびに 古い動画・音(MEDIA_V・音の v がちがう)を覚えた中から消す。
  LINE の中では 火をつけたあと1回だけ「ブラウザで開く」をうすく案内。
- `sw.js` … 電波がなくても開ける。動画は 覚えたものがあれば 電波があっても そこから Range を切りだす(iPhone が何度も読みなおすのを止める)。
  覚えていなければ まるごと1回だけ取って覚えてから切りだす。本体のファイルを増やしたら FILES と VERSION を直す(静止画・熾火の絵は scenes.js から自動)。
- アイコン・紹介画像: `tools/make_icons.py`(山の静止画から。作り直したら index.html の og:image の ?v= を上げる)。
- iPhone で開けない問題(一灯 2026-10-24)の直しは最初から入れてある: 火をつけるのは pointerup、#scene に cursor: pointer、click はパソコン用で二重にしない。

## 確かめ方
- `~/.local/venvs/ryokoshi/bin/python tools/ui_check.py [--only iphone|android|pc] [--fake-sound]`
  iPhone 13(WebKit)・Android(Chrome)・パソコンで、タップ→火がつく→動画が3本以上つながる→操作の板→場所の切りかえ→おやすみ→真っ黒→もう一度つける まで(1台 約1.5分)。
  写真は `_check/ui/`(Git に入れない)。動画の途中読み(Range)ができるサーバーで出す(iPhone は これがないと動画を流さない)。
  `--fake-sound` は 無音の仮の音で 音の仕組みも確かめる(音は出さない)。
- 見直しの試し(Git に入れない `_check/` の中。音は消して流す):
  `_check/review-tech/` errtest(読めない動画)・sleeptest(おやすみの すきま)・swtest / swoffline(電波なし)・datause(通信量)・slownet(遅い回線)・soundstress(音の連打)・longrun(長く流す)。
  `_check/fix/` shots.py(SE・Pro Max・横長・パソコン・Android で板を全部開いて撮る)・seam.py(つなぎ目を0.1秒ごとに撮って差を測る)。
- 仕上げに `iphone-check` スキル(古い iPhone・LINE の中・Android)。

## 動画の作り方(リーダー, 2026-10-25)
- Google Flow のプロジェクト「焚き火 takibi」。指示文は tools/flow_prompts.py。
- 静止画: Nano Banana Pro・9:16・x2 で2枚ずつ出して選んだ(0クレジット)。山 =「Campfire burning in mountain cle…」(天の川)、海 =「Campfire burning on sandy beach」(月の道)。
  フレームの絵を選ぶ板では 検索欄に「mountain cle」「sandy beach」と打つと1つだけ出る(並び順は毎回変わるので 位置で選ばない)。
- 動画: Veo 3.1 Lite・9:16・8秒・x1(10クレジット)。フレーム: 開始=終了=その静止画。動画を作ると 開始・終了は空になるので 毎回えらびなおす。
  熾火になる動画(end)は 開始だけ指定(山の熾火の静止画は 形が変わってしまったので使わなかった)。
- 目で見て外した動画は tools/flow_media.py の BAD。「薪がくずれる・置かれる」と頼むと、薪が空中から飛んできて消える → 薪を動かす指示はしない。
- 保存: Chrome は「1つのタブで2回目からの保存」を止める。画像は 別のタブで …/asb/…=d を開くと保存できる。
  動画は まだ保存していない新しいタブでプロジェクトを開き、ページの中で動画を1本ずつ開いて fetch で集め、1つにまとめて「保存」リンクを置いてクリック(1回だけ)→ tools/unpack.py でほどく。
- そろえる: `~/.local/venvs/ryokoshi/bin/python tools/flow_media.py`(--check で つなぎ目の差・炎の動きだけ見る)。差は 3.5〜5.2 なら つないでも分からない。作り直したら MEDIA_V を上げる。
- 人のペースの決まりで 1時間24回まで。

## まだのこと
- 2026-10-25 できあがり(リーダーが ui_check・iphone-check 8機種 ○ を確かめた)。**GitHub Pages ではまだ公開していない**(ノブさんの OK 待ち)。公開したら roguepink.com/apps への掲載も聞く。
- 本物の iPhone・Android・LINE の中では見ていない。音も実機では鳴らしていない(低電力モードで次の動画が流れるか、電波なしで開けるか も実機で)。
- 山の虫の音は 57秒の録音のくり返し(約52秒ごとに似る)。長い CC0 の録音が見つかれば入れかえる。
- 曲(Suno)はまだ無い。入れるなら music/tracks.json(一灯と同じ形)。
- Flow のクレジット: 動画30本で 300 使用(840 → 540)。
