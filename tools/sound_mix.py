#!/usr/bin/env python3
"""アプリ(js/sound.js)と同じ混ぜ方で、仕上がりの音を作って数字で確かめる(音は流さない)。
使い方: ~/.local/venvs/ryokoshi/bin/python tools/sound_mix.py [--secs 120] [--seed 3] [--no-mp3]
  _check/mix-yama-2min.mp3 / _check/mix-umi-2min.mp3 を作る(ノブさんのスマホに送る見本)。

アプリと同じにしてあること
- すべり棒のはじめの値(焚き火 80・まわり 65)と、すべり棒→大きさ の 2乗のカーブ
- sounds.json の gain、場面に合う fire(scene)、くり返しの区間、はじめる所はランダム
- パチッ: 間(ふつう 4〜14秒・ときどき すぐもう1回・ときどき長い間)、大きさ 0.4〜1倍、高さ 0.9〜1.1倍、
  やわらかさ(ローパス 3.5〜12kHz)、左右 ±0.35、同じ音を2回続けない
- 入りは 4秒かけて ふわっと
見本は聞きやすいように 全体を -18 LUFS にそろえる(焚き火とまわりの音の釣り合いは アプリと同じ)。
"""
import argparse, json, os, subprocess
import numpy as np
from scipy.signal import butter, sosfilt

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SR = 48000
FIRE_VOL, AMB_VOL = 0.80, 0.65     # js/app.js の はじめの値(80 / 65)と同じ
curve = lambda v: v * v


def channels(path):
    r = subprocess.run(["ffmpeg", "-nostdin", "-i", path], capture_output=True, text=True).stderr
    return 1 if " mono," in r else 2


def load(path):
    """ブラウザと同じに: 1ch の音は 左右に そのまま同じ大きさで出す(ffmpeg の -ac 2 は 3dB 下げるので使わない)"""
    ch = channels(path)
    raw = subprocess.run(["ffmpeg", "-nostdin", "-v", "error", "-i", path, "-ac", str(ch), "-ar", str(SR), "-f", "f32le", "-"],
                         capture_output=True, check=True).stdout
    y = np.frombuffer(raw, np.float32).astype(np.float64).reshape(-1, ch)
    return np.repeat(y, 2, axis=1) if ch == 1 else y


def lufs_of(x):
    r = subprocess.run(["ffmpeg", "-nostdin", "-f", "f32le", "-ar", str(SR), "-ac", "2", "-i", "-", "-af", "ebur128=peak=true",
                        "-f", "null", "-"], input=x.astype(np.float32).tobytes(), capture_output=True).stderr.decode()
    s = r[r.rfind("Summary:"):]
    return float(s.split("I:")[1].split("LUFS")[0]), float(s.split("Peak:")[1].split("dBFS")[0])


def loop_play(e, n, rng):
    y = load(os.path.join(ROOT, e["file"]))
    a, b = int(round(e["loopStart"] * SR)), int(round(e["loopEnd"] * SR))
    body = y[a:b]
    st = int(rng.uniform(0, 0.9) * len(body))
    reps = int(np.ceil((st + n) / len(body))) + 1
    return np.tile(body, (reps, 1))[st:st + n] * (1.0 if e.get("gain") is None else e["gain"])


def pop_gap(rng, prev_burst):
    r = rng.random()
    if not prev_burst and r < 0.1:
        return rng.uniform(0.15, 0.5), True
    if r < 0.85:
        return rng.uniform(4, 14), False
    return rng.uniform(14, 26), False


def pops_track(cfg, n, rng):
    pops = [load(os.path.join(ROOT, p["file"])) for p in cfg["pops"]]
    gains = [p.get("gain", 0.5) for p in cfg["pops"]]
    out = np.zeros((n, 2))
    t, burst, last, times = rng.uniform(2, 5), False, -1, []
    while t < n / SR - 1:
        i = int(rng.integers(len(pops)))
        if len(pops) > 1 and i == last:
            i = (i + 1 + int(rng.integers(len(pops) - 1))) % len(pops)
        last = i
        p = pops[i]
        rate = rng.uniform(0.9, 1.1)
        idx = np.arange(0, len(p) - 1, rate)
        q = np.stack([np.interp(idx, np.arange(len(p)), p[:, c]) for c in (0, 1)], -1)
        q = sosfilt(butter(2, rng.uniform(3500, 12000), "lp", fs=SR, output="sos"), q, axis=0)
        pan = rng.uniform(-0.35, 0.35)
        q[:, 0] *= np.cos((pan + 1) * np.pi / 4) * np.sqrt(2)
        q[:, 1] *= np.sin((pan + 1) * np.pi / 4) * np.sqrt(2)
        q *= gains[i] * rng.uniform(0.4, 1)
        s = int(t * SR)
        m = min(len(q), n - s)
        out[s:s + m] += q[:m]
        times.append(t)
        g, burst = pop_gap(rng, burst)
        t += g
    return out, times


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--secs", type=float, default=120)
    ap.add_argument("--seed", type=int, default=3)
    ap.add_argument("--no-mp3", action="store_true")
    a = ap.parse_args()
    cfg = json.load(open(os.path.join(ROOT, "sound", "sounds.json"), encoding="utf-8"))
    n = int(a.secs * SR)
    for scene in ("yama", "umi"):
        rng = np.random.default_rng(a.seed + (0 if scene == "yama" else 100))
        fe = next((e for e in cfg["fire"] if e.get("scene") == scene), cfg["fire"][0])
        fire = loop_play(fe, n, rng)
        pops, times = pops_track(cfg, n, rng)
        fire_all = (fire + pops) * curve(FIRE_VOL)
        amb = loop_play(cfg[scene][0], n, rng) * curve(AMB_VOL)
        lf, _ = lufs_of(fire_all)
        lfb, _ = lufs_of(fire * curve(FIRE_VOL))
        la, _ = lufs_of(amb)
        x = fire_all + amb
        # 入り 4秒(アプリと同じ ふわっと)・終わり 3秒
        t = np.arange(n) / SR
        env = 1 - np.exp(-t / 1.0)
        env[-3 * SR:] *= np.linspace(1, 0, 3 * SR)
        x *= env[:, None]
        li, tp = lufs_of(x)
        gaps = np.diff(times)
        print(f"{scene}: 焚き火 {fe['file']} + {cfg[scene][0]['file']}")
        print(f"   アプリでの大きさ(はじめの値): 焚き火 {lf:.1f} LUFS(パチッなし {lfb:.1f})/ まわり {la:.1f} LUFS"
              f" → まわりは焚き火より {lf - la:.1f} LU 小さい / 全体 {li:.1f} LUFS  TP {tp:.1f}")
        print(f"   パチッ {len(times)} 回 / {a.secs:.0f}秒(平均 {a.secs / max(1, len(times)):.1f} 秒に1回、間 最短 {gaps.min():.2f}・最長 {gaps.max():.1f} 秒)")
        if a.no_mp3:
            continue
        g = 10 ** ((-18 - li) / 20)
        x = x * g
        pk = np.abs(x).max()
        if pk > 0.89:
            x *= 0.89 / pk
        mp3 = os.path.join(ROOT, "_check", f"mix-{scene}-{int(a.secs / 60)}min.mp3")
        subprocess.run(["ffmpeg", "-nostdin", "-v", "error", "-y", "-f", "f32le", "-ar", str(SR), "-ac", "2", "-i", "-",
                        "-c:a", "libmp3lame", "-b:a", "192k", mp3], input=x.astype(np.float32).tobytes(), check=True)
        i2, tp2 = lufs_of(load(mp3))
        print(f"   見本 {os.path.relpath(mp3, ROOT)}  {i2:.1f} LUFS  TP {tp2:.1f}  {os.path.getsize(mp3) / 1e6:.1f}MB")


if __name__ == "__main__":
    main()
