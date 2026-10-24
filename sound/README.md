# sound/ — ひとくべ の音

作り方: `~/.local/venvs/ryokoshi/bin/python tools/sound_build.py`(元の録音は `_check/sound-raw/`。Git に入れない)
確かめ: `~/.local/venvs/ryokoshi/bin/python tools/sound_check.py [--mix]`(音は流さず数字で。`--mix` で `_check/` に2分の見本 mp3)
中身を見る: `tools/sound_analyze.py <ファイル>`(帯域ごとの音量・パチッの数)
出どころと許可: [CREDITS.md](CREDITS.md)

## sounds.json の形

```json
{
  "version": 1,
  "fire": [ {"file":"sound/fire-1.m4a","gain":0.8,"loopStart":0.5,"loopEnd":187.0,"scene":"yama","label":"…"}, … ],
  "yama": [ {"file":"sound/yama-1.m4a","gain":0.55,"loopStart":0.5,"loopEnd":156.5,"label":"…"} ],
  "umi":  [ {"file":"sound/umi-1.m4a","gain":0.55,"loopStart":0.5,"loopEnd":130.5,"label":"…"} ],
  "pops": [ {"file":"sound/pop-01.m4a","gain":0.5}, … ]
}
```

| 項目 | 意味 |
|---|---|
| `file` | ページからの相対パス。AAC(.m4a)・48kHz・ステレオ・112kbps |
| `gain` | 0〜1。そのまま GainNode にかける。焚き火とまわりの音の釣り合いはここで決めてある(fire 0.8 / 山・海 0.55 / pops 0.5) |
| `loopStart` / `loopEnd` | 秒。`AudioBufferSourceNode.loop = true` で この2つを入れ、`start(0, loopStart)` で流す。この区間はちょうど1周で、終わり→始まりが切れ目なくつながる |
| `scene` | fire だけ。`"yama"` = 山の焚き火に合う、`"umi"` = 海の焚き火に合う。合うものがなければ fire[0] |
| `label` | 人が読むための説明(画面に出さなくてよい) |
| `duration` / `lufs` | ファイル全体の長さ(秒)と音量(LUFS)。確かめ用 |
| `version` | 形が変わったら上げる |

- ファイルの前後 0.5 秒は「輪の続き」(AAC の頭の小さなずれよけ)。ループさせずに頭から流しても変な音はしない。
- 音量の目安: fire 約 -21〜-22 LUFS、山・海 約 -24 LUFS(gain をかけると まわりの音は焚き火より 5〜6 LU 小さい)。
- pops は単発の「パチッ」(0.66 秒・はじめに 20ms の無音)。焚き火の上に ときどき(6〜20 秒に1回くらい、ばらばらに)重ねる想定。ピッチ(playbackRate 0.9〜1.1)や大きさ(0.5〜1.0倍)を少し散らすと同じ音に聞こえにくい。
- 場面ごとの組み合わせのおすすめ: 山 = fire(scene:yama) + yama、海 = fire(scene:umi) + umi。
