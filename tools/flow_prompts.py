# Google Flow で作る 焚き火の指示文(2026-10-25)。
# 場面ごとに: 静止画 STILL(Nano Banana Pro, 9:16, 0クレジット)→ 開始=終了=その静止画 の 8秒動画 CLIPS(Veo 3.1 Lite, 10クレジット)
#            → 熾火になる END(開始=静止画、終了=熾火の静止画 EMBER)
COMMON = ("Photorealistic night photograph, vertical 9:16, shot on a full-frame camera on a tripod, static locked-off camera, eye level slightly above the fire. "
          "A real campfire burns in the lower-middle of the frame, centered horizontally, its flames about 58% from the top: "
          "a teepee of thick split hardwood logs inside a ring of round grey stones, healthy natural orange-yellow flames about 50 cm tall, glowing red embers at the base, "
          "a few tiny sparks. The firelight warmly lights the ground and stones nearby and fades into darkness. "
          "Calm, quiet, peaceful, healing mood. No people, no tents, no chairs, no text, no lettering, no watermark.")
STILL = {
  "yama": COMMON + " Setting: a small clearing high in the Japanese mountains on a clear autumn night. Mossy ground with a few fallen leaves, "
          "dark cedar and maple trees at the sides softly lit orange by the fire, and above, far behind, layered dark mountain ridges under a deep blue night sky full of stars and a faint Milky Way.",
  "umi":  COMMON + " Setting: a quiet sandy beach at night. Pale sand and a few pieces of driftwood near the fire, "
          "behind the fire gentle low waves softly breaking on the shore, the calm dark sea reaching a straight horizon, a low moon making a silver path on the water, a few stars in the deep blue sky.",
}
EMBER = ("Edit this image: the same scene, same camera, everything identical, but the campfire has burned down: no flames at all, only a low pile of "
         "glowing orange-red embers and charred logs with a thin wisp of smoke; the surroundings are much darker, lit only faintly by the embers.")
# 動画: 開始と終了は同じ静止画。カメラは動かさない。1本ずつ 火の動きを変える(同じに見えないように)
MOTION = ("Static locked-off camera, no camera movement, no zoom. Realistic campfire in real time: {m} "
          "The background stays still except {bg}. Natural, calm, continuous. The last frame matches the first frame.")
BG = {"yama": "a very slight breeze in the leaves and the stars twinkling faintly",
      "umi": "the gentle waves rolling in and out on the shore and the moonlight shimmering on the sea"}
CLIPS = [
  "the flames dance softly and steadily, licking up around the logs, small sparks drifting upward now and then.",
  "a gentle gust leans the flames to the left for a moment, then they rise straight again; a few sparks swirl up.",
  "a log settles slightly with a small burst of sparks rising into the dark, then the flames calm down.",
  "the flames flicker low and slow, embers pulsing bright and dim, a thin curl of smoke rising.",
  "the flames grow a little taller, flaring up with lively tongues of fire, then slowly return to their size.",
  "a breeze from the right bends the flames gently to the right and back, sparks streaming briefly.",
  "the flames waver quietly, a small blue flame appears at the base of a log, embers crackling and glowing.",
  "bright sparks pop out of the fire twice and float up, the flames twisting gently.",
  "the fire breathes slowly: the flames shrink a little and then swell again, the embers glowing deep red.",
  "the flames ripple restlessly in a soft wind, flickering shadows on the stones, a few sparks drifting away.",
]
END = ("Static locked-off camera, no camera movement. Over 8 seconds the campfire slowly dies down: the flames shrink and go out one by one, "
       "leaving only a low pile of glowing red embers and a thin wisp of smoke. The background stays still except {bg}.")
