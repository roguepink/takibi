# sound/ — ひとくべ の音

作り方: `~/.local/venvs/ryokoshi/bin/python tools/sound_build.py`(元の録音は `_check/sound-raw/`。Git に入れない)
確かめ: `~/.local/venvs/ryokoshi/bin/python tools/sound_check.py`(音は流さず数字で)
仕上がりの見本: `tools/sound_mix.py`(アプリと同じ混ぜ方で `_check/mix-yama-2min.mp3`・`_check/mix-umi-2min.mp3`)
決めたことと理由(Veo の音を使わない理由も): [../docs/sound.md](../docs/sound.md)
中身を見る: `tools/sound_analyze.py <ファイル>`(帯域ごとの音量・パチッの数)
出どころと許可: [CREDITS.md](CREDITS.md)

## sounds.json の形

```json
{
  "version": 1,
  "v": 2,
  "fire": [ {"file":"sound/fire-1.m4a","gain":0.8,"loopStart":0.5,"loopEnd":187.0,"scene":"yama","label":"…"}, … ],
  "yama": [ {"file":"sound/yama-1.m4a","gain":0.55,"loopStart":0.5,"loopEnd":156.5,"label":"…"} ],
  "umi":  [ {"file":"sound/umi-1.m4a","gain":0.55,"loopStart":0.5,"loopEnd":130.5,"label":"…"} ],
  "pops": [ {"file":"sound/pop-01.m4a","gain":0.5}, … ]
}
```

| 項目 | 意味 |
|---|---|
| `file` | ページからの相対パス。AAC(.m4a)・48kHz・ステレオ 112kbps(fire-1 は左右が同じなので モノラル 80kbps = メモリ半分) |
| `gain` | 0〜1。そのまま GainNode にかける。焚き火とまわりの音の釣り合いはここで決めてある(fire 0.8 / 山 0.65 / 海 0.82 / pops 0.9。すべり棒のはじめの値 80・65 と合わせて、まわりは焚き火より 山 約8・海 約5 LU 小さい) |
| `loopStart` / `loopEnd` | 秒。`AudioBufferSourceNode.loop = true` で この2つを入れ、`start(0, loopStart)` で流す。この区間はちょうど1周で、終わり→始まりが切れ目なくつながる |
| `scene` | fire だけ。`"yama"` = 山の焚き火に合う、`"umi"` = 海の焚き火に合う。合うものがなければ fire[0] |
| `label` | 人が読むための説明(画面に出さなくてよい) |
| `duration` / `lufs` | ファイル全体の長さ(秒)と音量(LUFS)。確かめ用 |
| `version` | 形が変わったら上げる |
| `v` | 音のファイルを作り直したら上げる(`?v=` を付けて読むので、sw.js が覚えた古い音を使わない) |

- ファイルの前後 0.5 秒は「輪の続き」(AAC の頭の小さなずれよけ)。ループさせずに頭から流しても変な音はしない。
- 音量の目安: fire 約 -21〜-22 LUFS、山・海 約 -24 LUFS。
- pops は単発の「パチッ」(0.66 秒・はじめに 20ms の無音)。js/sound.js が 平均 約10秒に1回 ばらばらに重ねる(間・大きさ・高さ・やわらかさ・左右は docs/sound.md)。
- 場面ごとの組み合わせ: 山 = fire(scene:yama) + yama、海 = fire(scene:umi) + umi。場所を変えると 両方を 6秒で 重ねて入れかえる。
