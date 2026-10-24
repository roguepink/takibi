// 焚き火の場面。tools/flow_media.py が作る(手で直さない)。2026-10-25 Google Flow(Veo 3.1 Lite)
// clips はどれも 同じ絵で始まって 同じ絵で終わる 8秒の動画。アプリがランダムな順番でつなぐ。end = 熾火になる動画(おやすみの終わり)
export const MEDIA_V = 3;   // 絵と動画を作り直したら上げる
export const SCENES = [
  {
    "id": "yama",
    "name": "山",
    "clips": [
      "media/yama/01.mp4",
      "media/yama/02.mp4",
      "media/yama/03.mp4",
      "media/yama/04.mp4",
      "media/yama/05.mp4",
      "media/yama/06.mp4",
      "media/yama/07.mp4",
      "media/yama/08.mp4",
      "media/yama/09.mp4",
      "media/yama/10.mp4"
    ],
    "still": "media/yama/still.jpg",
    "end": "media/yama/end.mp4",
    "fire": [
      0.496,
      0.616
    ]
  },
  {
    "id": "umi",
    "name": "海",
    "clips": [
      "media/umi/01.mp4",
      "media/umi/02.mp4",
      "media/umi/03.mp4",
      "media/umi/04.mp4",
      "media/umi/05.mp4",
      "media/umi/06.mp4",
      "media/umi/07.mp4",
      "media/umi/08.mp4",
      "media/umi/09.mp4",
      "media/umi/10.mp4"
    ],
    "still": "media/umi/still.jpg",
    "end": "media/umi/end.mp4",
    "fire": [
      0.533,
      0.591
    ]
  }
];
