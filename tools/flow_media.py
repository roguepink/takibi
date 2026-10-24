#!/usr/bin/env python3
"""Google Flow で作った焚き火の動画を、アプリで使う形にそろえる(2026-10-25)。
  ~/.local/venvs/ryokoshi/bin/python tools/flow_media.py [--check]

  入れるもの(_check/flow/raw/、Git に入れない):
    <場面>-NN.mp4   8秒の動画(Veo 3.1 Lite・開始=終了=その場面の静止画)。NN = 01, 02, …
    <場面>-end.mp4  火が小さくなって熾火になる動画
    (場面 = yama / umi)
  作るもの:
    media/<場面>/NN.mp4 と end.mp4(720x1280・音なし)、media/<場面>/still.jpg(01 の最初のこま)
    icons/scene-<場面>.jpg(場所を選ぶ画面の見本)
    js/scenes.js
  --check: 書き出さずに、1本ずつ「はじめと終わりの絵の差」と「炎の動きの量」だけ出す。
    はじめと終わりの差が大きい動画は、つないだときに ずれが見えるので使わない(BAD に入れる)。
"""
import json, subprocess, sys
from pathlib import Path
import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "_check/flow/raw"
W, H = 720, 1280
MEDIA_V = 3          # 動画・静止画を作り直したら 1つ上げる(スマホに覚えた古い絵を使わせないため)
SCENES = [("yama", "山"), ("umi", "海")]
BAD = {"yama-03", "umi-03", "yama-08"}   # 2026-10-25 目で見て外した: 03 = 薪が空中から飛んできて消える、yama-08 = 一瞬 画面全体が明るくなる


def frames(src, fps=8, size=(180, 320)):
    raw = subprocess.run(["ffmpeg", "-loglevel", "error", "-i", str(src), "-an", "-vf", f"fps={fps},scale={size[0]}:{size[1]}",
                          "-f", "rawvideo", "-pix_fmt", "rgb24", "-"], capture_output=True, check=True).stdout
    return np.frombuffer(raw, np.uint8).reshape(-1, size[1], size[0], 3).astype(np.float32)


def check(src):
    f = frames(src)
    seam = float(np.abs(f[0] - f[-1]).mean())                     # はじめと終わりの差(0 = 同じ絵)
    bright = f.mean(axis=3)
    fire = bright[0] > np.percentile(bright[0], 97)                # 炎の所
    motion = float(np.abs(np.diff(f, axis=0)).mean(axis=3)[:, fire].mean())   # 炎の動き
    rest = float(np.abs(np.diff(f, axis=0)).mean(axis=3)[:, ~fire].mean())    # 炎のほかの動き(小さいほどよい)
    return seam, motion, rest, len(f) / 8


def encode(src, dst, crf=26):
    subprocess.run(["ffmpeg", "-loglevel", "error", "-y", "-i", str(src), "-an",
                    "-vf", f"scale={W}:{H}:force_original_aspect_ratio=increase,crop={W}:{H},fps=24",
                    "-c:v", "libx264", "-crf", str(crf), "-preset", "slow", "-pix_fmt", "yuv420p", "-movflags", "+faststart", str(dst)], check=True)


def main():
    only_check = "--check" in sys.argv
    out = []
    for sid, name in SCENES:
        clips = sorted(RAW.glob(f"{sid}-[0-9][0-9].mp4"))
        for c in clips + sorted(RAW.glob(f"{sid}-end.mp4")):
            s, m, r, d = check(c)
            print(f"{c.stem:10s} 長さ{d:4.1f}秒  つなぎ目の差 {s:5.1f}  炎の動き {m:5.1f}  まわりの動き {r:4.1f}{'  ← 使わない' if c.stem in BAD else ''}")
        if only_check:
            continue
        d = ROOT / "media" / sid
        d.mkdir(parents=True, exist_ok=True)
        for old in d.glob("*.mp4"):
            old.unlink()
        names = []
        for c in clips:
            if c.stem in BAD:
                continue
            n = f"{len(names) + 1:02d}.mp4"
            encode(c, d / n)
            names.append(f"media/{sid}/{n}")
        end = RAW / f"{sid}-end.mp4"
        if end.exists():
            encode(end, d / "end.mp4")
        if names:
            subprocess.run(["ffmpeg", "-loglevel", "error", "-y", "-i", str(ROOT / names[0]), "-vframes", "1", "-q:v", "3", str(d / "still.jpg")], check=True)
            im = Image.open(d / "still.jpg").convert("RGB")
            ch = int(H * 0.62); cw = int(ch * 3 / 4)
            im.crop(((W - cw) // 2, int(H * 0.30), (W + cw) // 2, int(H * 0.30) + ch)).resize((300, 400), Image.LANCZOS).save(ROOT / f"icons/scene-{sid}.jpg", quality=84)
        fire = None
        if names:
            L = np.asarray(Image.open(d / "still.jpg").convert("L"), dtype=np.float32)
            ys, xs = np.where(L >= max(200, np.percentile(L, 99.5)))
            fire = [round(float(np.median(xs)) / W, 3), round(float(np.median(ys)) / H, 3)]   # 火の位置(「大きさ」の中心)
        out.append(dict(id=sid, name=name, clips=names, still=f"media/{sid}/still.jpg", end=f"media/{sid}/end.mp4" if end.exists() else None, fire=fire))
    if only_check:
        return
    js = ["// 焚き火の場面。tools/flow_media.py が作る(手で直さない)。2026-10-25 Google Flow(Veo 3.1 Lite)",
          "// clips はどれも 同じ絵で始まって 同じ絵で終わる 8秒の動画。アプリがランダムな順番でつなぐ。end = 熾火になる動画(おやすみの終わり)",
          f"export const MEDIA_V = {MEDIA_V};   // 絵と動画を作り直したら上げる",
          "export const SCENES = " + json.dumps(out, ensure_ascii=False, indent=2) + ";", ""]
    (ROOT / "js/scenes.js").write_text("\n".join(js))
    print("ok", [(o["id"], len(o["clips"])) for o in out])


if __name__ == "__main__":
    main()
