# 音の出どころ・作者・許可

アプリの音はすべて本物の録音です。使ったのは、公開サイトで使ってよいと はっきり書かれたものだけ(CC0 と CC BY)。
CC BY のもの(★)は、アプリのクレジット(設定・「この音について」など)にも名前と許可を出してください。

| 使った所 | 元の録音 | 作者 | 許可 | 元の場所 |
|---|---|---|---|---|
| fire-1(山の焚き火) | Big branching fire #3 (s0989) | Joseph SARDIN / BigSoundBank | CC0 | https://bigsoundbank.com/big-branching-fire-3-s0989.html |
| fire-1(山の焚き火) | Big branching fire #2 (s0988) | Joseph SARDIN / BigSoundBank | CC0 | https://bigsoundbank.com/big-branching-fire-2-s0988.html |
| fire-2(海の焚き火)・pops | Fireplace #3 (s2855) | Joseph SARDIN / BigSoundBank | CC0 | https://bigsoundbank.com/fireplace-3-s2855.html |
| umi-1(波) | Small Waves Facing the Ocean (s1046) — Houlgate(フランス・ノルマンディー)の砂浜 | Joseph SARDIN / BigSoundBank | CC0 | https://bigsoundbank.com/small-waves-facing-the-ocean-s1046.html |
| yama-1(かすかな沢) | Small Stream (s0823) | Joseph SARDIN / BigSoundBank | CC0 | https://bigsoundbank.com/small-stream-s0823.html |
| yama-1(虫とカエル)★ | Nature sounds ambience in a Dordogne pond | Glaneur de sons(Freesound より Wikimedia Commons へ) | CC BY 3.0 | https://commons.wikimedia.org/wiki/File:Nature_sounds_ambience_in_a_Dordogne_pond.ogg |
| yama-1(遠いフクロウ)★ | Tawny owl calling at night in Tuntorp, Brastad, Sweden | W.carter | CC BY 4.0 | https://commons.wikimedia.org/wiki/File:Tawny_owl_calling_at_night_in_Tuntorp,_Brastad,_Sweden.ogg |

BigSoundBank の許可(https://bigsoundbank.com/droits.html): 各ページに「CC0 (public domain): Free and royalty-free」。商用も可・許可を求めなくてよい・名前の表示は義務ではない(あるとうれしい、とのこと)。
CC BY 3.0: https://creativecommons.org/licenses/by/3.0/ ・ CC BY 4.0: https://creativecommons.org/licenses/by/4.0/
(ダウンロード・確認日 2026-10-25)

## アプリに出すクレジット(そのまま使える文)

> 焚き火・波・沢の音: Joseph SARDIN – BigSoundBank.com(CC0)
> 夜の虫とカエル: “Nature sounds ambience in a Dordogne pond” by Glaneur de sons(CC BY 3.0)/ 遠いフクロウ: “Tawny owl calling at night in Tuntorp” by W.carter(CC BY 4.0)。どちらも編集して使用。

## どこをどう直したか(CC BY は「変えたこと」を示す必要があるため)

すべて `tools/sound_build.py` で行った。共通: 48kHz にそろえ、くり返しのつなぎ目を重ねて(クロスフェード)切れ目なくし、音量をそろえ(LUFS)、とがったピークだけを先読みリミッターで丸め、AAC 112kbps にした。

- **fire-1**: s0989 の 1.5〜121.5 秒と s0988 の 2.5〜75 秒を 3 秒重ねてつないだ(s0988 の頭のマイクの音をよけた)。110Hz より下(マイクにあたる風のゴー)を切った。モノラルを左右同じに。火の強弱の大きな波を ゆっくりならした(差を約7割小さく)。約 -21 LUFS。
- **fire-2**: s2855 の 0.6〜79 秒と 119.5〜181 秒を 3 秒重ねてつないだ(80〜118 秒にある木の「ピー」という鳴りは使わない)。60Hz より下を切った。音量の波をならした。約 -22 LUFS。
- **pops**: s2855 から、前後 0.4 秒に大きな音のない「パチッ」を 12 個切り出した(0.6 秒・はじめ 5ms・終わり 350ms のフェード・150Hz より下を切る・ピーク -6dBFS)。
- **umi-1**: s1046 の 1〜137 秒。120Hz より下(風のゴー)を切り、3.5kHz より上を 7dB 下げて遠めの波にした。6 秒重ねてくり返し。約 -24 LUFS。
- **yama-1**(156 秒の輪): ドルドーニュの池の録音(57 秒)を 250Hz より下を切って3回つなぎ(4 秒重ね)、さらに 26 秒ずらして左右を入れかえた小さめの層を重ねた。沢(s0823)を 150Hz より下を切り、2.5kHz より上を 10dB 下げ、虫より 14LU 小さく重ねた。フクロウの録音から鳴き声を2つ(23〜27 秒・98.3〜102.3 秒)450〜1500Hz だけ取り出し、短いこだまと 1.2kHz のローパスで遠くにして 40 秒・118 秒に置いた。約 -24 LUFS。
