#!/usr/bin/env python3
"""音の中身を数字で見る(音は流さない)。
使い方: python tools/sound_analyze.py <ファイル> [--win 5]
5秒ごとに: 帯域ごとの音量(dB)・パチッ(はぜ)の数・音の「ピー」っぽさ(tonal)を表にする。
- low   20-120Hz  … 風のゴー・車の遠いゴー
- lmid  120-500Hz … 炎のボー
- mid   500-2kHz  … 人の声・鳥
- hmid  2k-6kHz   … パチパチ・虫
- high  6k-     … 細かいパチ・波のしゅわー
"""
import sys, argparse, subprocess, numpy as np

def load(path, sr=48000):
    raw = subprocess.run(["ffmpeg","-nostdin","-v","error","-i",path,"-ac","1","-ar",str(sr),"-f","f32le","-"],
                         capture_output=True, check=True).stdout
    return np.frombuffer(raw, np.float32).astype(np.float64), sr

def bands_db(x, sr, edges):
    n = 1 << int(np.ceil(np.log2(len(x))))
    X = np.abs(np.fft.rfft(x * np.hanning(len(x)), n)) ** 2
    f = np.fft.rfftfreq(n, 1/sr)
    out = []
    for lo, hi in edges:
        m = (f >= lo) & (f < hi)
        out.append(10*np.log10(X[m].sum()/len(x) + 1e-20))
    # 500-4k の平らさ(小さいほどピーという音・声っぽい)
    m = (f >= 500) & (f < 4000)
    p = X[m] + 1e-20
    flat = np.exp(np.mean(np.log(p))) / np.mean(p)
    return out, flat

def pops(x, sr):
    """2kHz より上の音の急な立ち上がりを数える(パチッの数)"""
    from scipy.signal import butter, sosfilt
    sos = butter(4, 2000, 'hp', fs=sr, output='sos')
    h = np.abs(sosfilt(sos, x))
    hop = sr // 200  # 5ms
    env = np.array([h[i:i+hop].max() for i in range(0, len(h)-hop, hop)])
    base = np.median(env) + 1e-9
    peaks = 0; last = -100
    for i in range(1, len(env)):
        if env[i] > base * 6 and env[i] > env[i-1] * 2 and i - last > 10:
            peaks += 1; last = i
    return peaks

def main():
    ap = argparse.ArgumentParser(); ap.add_argument("file"); ap.add_argument("--win", type=float, default=5)
    a = ap.parse_args()
    x, sr = load(a.file)
    edges = [(20,120),(120,500),(500,2000),(2000,6000),(6000,20000)]
    w = int(a.win * sr)
    print(f"{a.file}  {len(x)/sr:.1f}s  peak {20*np.log10(np.abs(x).max()+1e-12):.1f}dBFS")
    print("   t  |  rms | low  lmid  mid  hmid high | pops tonal")
    for s in range(0, len(x) - w // 2, w):
        seg = x[s:s+w]
        if len(seg) < sr: break
        b, flat = bands_db(seg, sr, edges)
        rms = 20*np.log10(np.sqrt(np.mean(seg**2)) + 1e-12)
        print(f"{s/sr:6.0f} | {rms:5.1f} | " + " ".join(f"{v:5.0f}" for v in b) + f" | {pops(seg, sr):4d} {flat:5.2f}")

if __name__ == "__main__":
    main()
