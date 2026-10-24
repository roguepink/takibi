#!/usr/bin/env python3
"""Google Flow(Veo)の動画に入っている音を、数字と絵(スペクトル)で調べる(音は流さない)。
使い方: ~/.local/venvs/ryokoshi/bin/python tools/sound_veo.py [動画 …]
  何も渡さなければ _check/flow/raw/*.mp4 を全部。絵は _check/sound-ana/veo-*.png

調べること(1本ずつ)
- 音量(LUFS)・ピーク・左右の似かた(1.0 = モノラルと同じ)
- 帯域ごとの音量(本物の録音 fire-1 / fire-2 とくらべる)
- パチッの数(1秒あたり)
- 「ピー」「声」「曲」っぽさ:
    tonal … 500〜4kHz の平らさ(小さいほど 音程のある音。焚き火は 0.3 前後以上)
    harm  … 100〜1000Hz に 長く続く音程(同じ高さの線)がある時間の割合(声・曲・ハミングの目安)
- はじめ0.5秒と終わり0.5秒の音量の差(8秒ごとに つないだとき「段」になるか)
- 終わり→はじめ を 0.4秒重ねたときの、つなぎ目の音量の変化
"""
import glob, os, subprocess, sys
import numpy as np

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SR = 48000
EDGES = [(20, 120), (120, 500), (500, 2000), (2000, 6000), (6000, 20000)]


def load(path, ch=2):
    raw = subprocess.run(["ffmpeg", "-nostdin", "-v", "error", "-i", path, "-vn", "-ac", str(ch), "-ar", str(SR),
                          "-f", "f32le", "-"], capture_output=True, check=True).stdout
    return np.frombuffer(raw, np.float32).astype(np.float64).reshape(-1, ch)


def lufs(path):
    r = subprocess.run(["ffmpeg", "-nostdin", "-i", path, "-vn", "-af", "ebur128=peak=true", "-f", "null", "-"],
                       capture_output=True, text=True).stderr
    s = r[r.rfind("Summary:"):]
    return float(s.split("I:")[1].split("LUFS")[0]), float(s.split("Peak:")[1].split("dBFS")[0])


def db(v):
    return 20 * np.log10(v + 1e-12)


def bands(x):
    n = 1 << int(np.ceil(np.log2(len(x))))
    X = np.abs(np.fft.rfft(x * np.hanning(len(x)), n)) ** 2
    f = np.fft.rfftfreq(n, 1 / SR)
    out = [10 * np.log10(X[(f >= lo) & (f < hi)].sum() / len(x) + 1e-20) for lo, hi in EDGES]
    p = X[(f >= 500) & (f < 4000)] + 1e-20
    return out, float(np.exp(np.mean(np.log(p))) / np.mean(p))


def stft(x, n=4096, hop=1024):
    w = np.hanning(n)
    fr = [np.abs(np.fft.rfft(x[i:i + n] * w)) for i in range(0, len(x) - n, hop)]
    return np.array(fr), np.fft.rfftfreq(n, 1 / SR), hop / SR


def harm_ratio(x):
    """100〜1000Hz で、まわりより 12dB 以上とびでた線が 0.3 秒以上 同じ高さで続く時間の割合"""
    S, f, dt = stft(x)
    m = (f >= 100) & (f <= 1000)
    L = 20 * np.log10(S[:, m] + 1e-9)
    from scipy.ndimage import median_filter
    base = median_filter(L, size=(1, 31))
    peak = (L - base) > 12
    need = int(round(0.3 / dt))
    run = np.zeros(peak.shape[1], int)
    hit = np.zeros(len(L), bool)
    for t in range(len(L)):
        run = np.where(peak[t], run + 1, 0)
        if (run >= need).any():
            hit[t - need + 1:t + 1] = True
    return float(hit.mean())


def pops_per_s(x):
    from scipy.signal import butter, sosfilt
    h = np.abs(sosfilt(butter(4, 2000, 'hp', fs=SR, output='sos'), x))
    hop = SR // 200
    env = np.array([h[i:i + hop].max() for i in range(0, len(h) - hop, hop)])
    base = np.median(env) + 1e-9
    n, last = 0, -100
    for i in range(1, len(env)):
        if env[i] > base * 6 and env[i] > env[i - 1] * 2 and i - last > 10:
            n += 1; last = i
    return n / (len(x) / SR)


def seam(y, xf=0.4):
    """終わり xf 秒 と はじめ xf 秒 を 等パワーで重ねたとき、前後 0.2秒 とくらべて音量がどれだけ動くか"""
    m = y.mean(axis=1)
    n = int(xf * SR)
    t = np.linspace(0, np.pi / 2, n)
    joint = np.concatenate([m[-int(1.0 * SR):-n], m[-n:] * np.cos(t) + m[:n] * np.sin(t), m[n:int(1.0 * SR)]])
    w = SR // 10
    r = [db(np.sqrt(np.mean(joint[i:i + w] ** 2))) for i in range(0, len(joint) - w, w)]
    return float(max(r) - min(r))


def picture(path, y, out):
    """スペクトルの絵(横 = 時間、たて = 高さ 40Hz〜20kHz を対数で、明るい = 大きい)。PIL だけで描く"""
    from PIL import Image, ImageDraw
    m = y.mean(axis=1)
    S, f, dt = stft(m, 2048, 512)
    L = 20 * np.log10(S + 1e-7)
    H = 300
    fy = np.geomspace(40, 20000, H)
    idx = np.clip(np.searchsorted(f, fy), 0, len(f) - 1)
    img = L[:, idx].T[::-1]
    v = np.clip((img - (img.max() - 80)) / 80, 0, 1)
    rgb = np.stack([v ** 0.7, v ** 1.6, v ** 4 * 0.8 + 0.1 * v], -1)
    im = Image.fromarray((rgb * 255).astype(np.uint8)).resize((800, H))
    d = ImageDraw.Draw(im)
    for hz in (100, 1000, 10000):
        yy = H - 1 - int(np.searchsorted(fy, hz) )
        d.line([(0, yy), (800, yy)], fill=(80, 80, 120)); d.text((3, yy - 11), f"{hz}Hz", fill=(200, 200, 255))
    for s in range(1, int(len(m) / SR) + 1):
        x = int(s / (len(m) / SR) * 800); d.line([(x, H - 6), (x, H)], fill=(200, 200, 255))
    d.text((60, 3), os.path.basename(path), fill=(255, 255, 255))
    im.save(out)


def report(path, pic=True):
    y = load(path)
    m = y.mean(axis=1)
    I, tp = lufs(path)
    corr = float(np.corrcoef(y[:, 0], y[:, 1])[0, 1]) if y[:, 0].std() > 0 else 1.0
    b, flat = bands(m)
    head, tail = db(np.sqrt(np.mean(m[:SR // 2] ** 2))), db(np.sqrt(np.mean(m[-SR // 2:] ** 2)))
    # 1秒ごとの音量のゆれ
    sec = [db(np.sqrt(np.mean(m[i:i + SR] ** 2))) for i in range(0, len(m) - SR + 1, SR)]
    r = dict(file=os.path.relpath(path, ROOT), dur=len(m) / SR, lufs=I, tp=tp, corr=corr, bands=b, tonal=flat,
             harm=harm_ratio(m), pops=pops_per_s(m), head=head, tail=tail, seam=seam(y),
             sec_range=float(max(sec) - min(sec)))
    if pic:
        out = os.path.join(ROOT, "_check", "sound-ana", "veo-" + os.path.splitext(os.path.basename(path))[0] + ".png")
        os.makedirs(os.path.dirname(out), exist_ok=True)
        picture(path, y, out)
        r["png"] = os.path.relpath(out, ROOT)
    return r


def show(r):
    print(f"{r['file']}  {r['dur']:.1f}s  {r['lufs']:.1f} LUFS  TP {r['tp']:.1f}  左右の似かた {r['corr']:.2f}")
    print("    帯域 low/lmid/mid/hmid/high: " + " ".join(f"{v:5.0f}" for v in r["bands"]) +
          f"   tonal {r['tonal']:.2f}  harm {r['harm']*100:.0f}%  パチッ {r['pops']:.1f}/秒")
    print(f"    はじめ {r['head']:.1f} dB / 終わり {r['tail']:.1f} dB (差 {r['tail']-r['head']:+.1f})"
          f"  1秒ごとの音量の幅 {r['sec_range']:.1f} dB  つなぎ目(0.4秒重ね)の動き {r['seam']:.1f} dB"
          + (f"  絵 {r['png']}" if 'png' in r else ""))


def main():
    files = [a for a in sys.argv[1:] if not a.startswith("-")] or sorted(glob.glob(os.path.join(ROOT, "_check/flow/raw/*.mp4")))
    print("== くらべる本物の録音(8秒ずつ切って平均)")
    for ref in ("sound/fire-1.m4a", "sound/fire-2.m4a"):
        y = load(os.path.join(ROOT, ref))
        rs = []
        for s in range(SR * 10, len(y) - SR * 8, SR * 30):
            seg = y[s:s + SR * 8].mean(axis=1)
            b, flat = bands(seg)
            rs.append((b, flat, harm_ratio(seg), pops_per_s(seg)))
        b = np.mean([x[0] for x in rs], axis=0)
        print(f"{ref}  帯域 " + " ".join(f"{v:5.0f}" for v in b) +
              f"   tonal {np.mean([x[1] for x in rs]):.2f}  harm {np.mean([x[2] for x in rs])*100:.0f}%"
              f"  パチッ {np.mean([x[3] for x in rs]):.1f}/秒")
    print("== Veo の動画")
    for p in files:
        show(report(p))


if __name__ == "__main__":
    main()
