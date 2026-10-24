#!/usr/bin/env python3
"""sound/ の音を数字で確かめる(音は流さない)。
使い方: ~/.local/venvs/ryokoshi/bin/python tools/sound_check.py [--mix]

調べること
- それぞれの m4a: 長さ・音量(LUFS)・ピーク・大きさ(MB)
- くり返し(loopStart→loopEnd→loopStart)のつなぎ目:
    * つなぎ目の1サンプルの段差が、ふだんの段差の何倍か(クリックの目安。3倍以下なら気づかない)
    * つなぎ目をまたぐ 50ms の音量の変化が、ふだんの変化とくらべてどうか(ふだんの 99% 以内なら OK)
- pops: 始まりと終わりが 0 近くか(プチッとならないか)
--mix: _check/ に「焚き火+波」「焚き火+森」を2分ずつ混ぜた mp3 を作る。
       つなぎ目が途中(だいたい 60 秒あたり)に来るように、loopEnd の 60 秒前から流しはじめる。
"""
import json, os, subprocess, sys
import numpy as np

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SR = 48000


def load(path, ch=2):
    raw = subprocess.run(["ffmpeg", "-nostdin", "-v", "error", "-i", path, "-ac", str(ch), "-ar", str(SR),
                          "-f", "f32le", "-"], capture_output=True, check=True).stdout
    return np.frombuffer(raw, np.float32).astype(np.float64).reshape(-1, ch)


def lufs_file(path):
    r = subprocess.run(["ffmpeg", "-nostdin", "-i", path, "-af", "ebur128=peak=true", "-f", "null", "-"],
                       capture_output=True, text=True).stderr
    s = r[r.rfind("Summary:"):]
    return float(s.split("I:")[1].split("LUFS")[0]), float(s.split("Peak:")[1].split("dBFS")[0])


def seam_report(y, ls, le):
    a, b = int(round(ls * SR)), int(round(le * SR))
    body = y[a:b]
    d = np.abs(np.diff(body, axis=0)).max(axis=1)
    jump = np.abs(body[0] - body[-1]).max()          # つなぎ目の段差(終わり→始まり)
    p50, p999 = np.median(d), np.percentile(d, 99.9)
    # 50ms ごとの音量(dB)の となりどうしの変化
    w = SR // 20
    loop2 = np.concatenate([body, body[:w * 4]])
    rms = lambda s: 20 * np.log10(np.sqrt(np.mean(s ** 2)) + 1e-12)
    steps = np.array([abs(rms(body[i:i + w]) - rms(body[i + w:i + 2 * w])) for i in range(0, len(body) - 2 * w, w)])
    seam_step = abs(rms(body[-w:]) - rms(loop2[len(body):len(body) + w]))
    return {
        "jump": jump, "jump_vs_median": jump / (p50 + 1e-12), "jump_vs_p999": jump / (p999 + 1e-12),
        "seam_rms_step_db": seam_step, "typical_step_p50": float(np.median(steps)),
        "typical_step_p99": float(np.percentile(steps, 99)),
    }


def main():
    mix = "--mix" in sys.argv
    with open(os.path.join(ROOT, "sound", "sounds.json"), encoding="utf-8") as f:
        cfg = json.load(f)
    ok = True
    print("== くり返しの音")
    for kind in ("fire", "yama", "umi"):
        for e in cfg[kind]:
            p = os.path.join(ROOT, e["file"])
            y = load(p)
            i, tp = lufs_file(p)
            r = seam_report(y, e["loopStart"], e["loopEnd"])
            good = r["jump_vs_p999"] < 1.0 and r["seam_rms_step_db"] <= r["typical_step_p99"]
            ok &= good
            print(f"{e['file']:22s} {len(y)/SR:7.2f}s {i:6.1f} LUFS TP {tp:5.1f}  {os.path.getsize(p)/1e6:4.2f}MB  "
                  f"loop {e['loopStart']}–{e['loopEnd']}")
            print(f"    つなぎ目の段差 {r['jump']:.5f} = ふだんの中央値の {r['jump_vs_median']:.1f} 倍"
                  f" / ふだんの99.9%点の {r['jump_vs_p999']:.2f} 倍")
            print(f"    50msの音量の変化 つなぎ目 {r['seam_rms_step_db']:.2f} dB"
                  f" (ふだん 中央 {r['typical_step_p50']:.2f} / 99% {r['typical_step_p99']:.2f})  {'OK' if good else '要確認'}")
    print("== はぜる音(pops)")
    for e in cfg["pops"]:
        p = os.path.join(ROOT, e["file"])
        y = load(p)
        nz = np.where(np.abs(y).max(axis=1) > 1e-4)[0]
        head, tail = np.abs(y[nz[0]]).max(), np.abs(y[-1]).max()
        pk = 20 * np.log10(np.abs(y).max())
        good = tail < 1e-3
        ok &= good
        print(f"{e['file']:22s} {len(y)/SR:5.2f}s peak {pk:5.1f} dBFS  音の頭 {nz[0]/SR*1000:4.0f}ms"
              f"  最後のサンプル {tail:.5f} {'OK' if good else '要確認'}")
    print("全部 OK" if ok else "要確認あり")
    if mix:
        make_mix(cfg)


def loop_play(e, dur, start_before_end=60.0):
    """Web Audio の loop と同じように、loopStart–loopEnd をくり返した dur 秒を作る。"""
    y = load(os.path.join(ROOT, e["file"]))
    a, b = int(round(e["loopStart"] * SR)), int(round(e["loopEnd"] * SR))
    body = y[a:b]
    st = max(0, len(body) - int(start_before_end * SR))
    n = int(dur * SR)
    reps = int(np.ceil((st + n) / len(body))) + 1
    return np.tile(body, (reps, 1))[st:st + n] * e["gain"]


def make_mix(cfg, dur=120.0):
    rng = np.random.default_rng(7)
    pops = [load(os.path.join(ROOT, p["file"])) * p["gain"] for p in cfg["pops"]]
    out_dir = os.path.join(ROOT, "_check")
    for scene, amb_key, name in (("umi", "umi", "takibi+nami"), ("yama", "yama", "takibi+mori")):
        fire = next((e for e in cfg["fire"] if e.get("scene") == scene), cfg["fire"][0])
        x = loop_play(fire, dur) + loop_play(cfg[amb_key][0], dur, 40.0)
        # はぜる音を 6〜20 秒に1回くらい(アプリと同じくらいのつもり)
        t = rng.uniform(3, 10)
        while t < dur - 1:
            p = pops[rng.integers(len(pops))]
            s = int(t * SR)
            seg = p[: len(x) - s] * rng.uniform(0.5, 1.0)
            x[s:s + len(seg)] += seg
            t += rng.uniform(6, 20)
        # 2秒のフェードイン・アウト(聞く人が驚かないように)
        f = np.linspace(0, 1, SR * 2)[:, None]
        x[:SR * 2] *= f
        x[-SR * 2:] *= f[::-1]
        pk = np.abs(x).max()
        if pk > 0.95:
            x *= 0.95 / pk
        mp3 = os.path.join(out_dir, f"{name}-2min.mp3")
        subprocess.run(["ffmpeg", "-nostdin", "-v", "error", "-y", "-f", "f32le", "-ar", str(SR), "-ac", "2", "-i", "-",
                        "-c:a", "libmp3lame", "-b:a", "192k", mp3], input=x.astype(np.float32).tobytes(), check=True)
        i, tp = lufs_file(mp3)
        print(f"見本: {mp3}  {i:.1f} LUFS  TP {tp:.1f}  (焚き火 {fire['file']} + {cfg[amb_key][0]['file']}, つなぎ目 約60秒/40秒)")


if __name__ == "__main__":
    main()
