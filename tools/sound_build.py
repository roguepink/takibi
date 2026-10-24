#!/usr/bin/env python3
"""焚き火アプリ(ひとくべ)の音を作る。音は流さない。

入力: _check/sound-raw/ (ダウンロードした元の録音。Git に入れない)
出力: sound/*.m4a と sound/sounds.json

使い方: ~/.local/venvs/ryokoshi/bin/python tools/sound_build.py

しくみ
- くり返し(ループ)は「輪っか」の上で作る: 長さ L の輪に、録音を つなぎ目を重ねて(クロスフェード)置く。
  輪の終わりは そのまま輪の始まりにつながるので、つなぎ目が出ない。
- AAC は はじめに少し無音(エンコーダーの遅れ)が入るので、ファイルの前後に PAD 秒ずつ
  「輪の続き」を足しておく。loopStart=PAD, loopEnd=PAD+L。デコードで少しずれても、
  [loopStart, loopEnd] は ちょうど1周ぶんの連続した音になる。
"""
import json, os, subprocess, sys
import numpy as np
from scipy.signal import butter, sosfiltfilt

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RAW = os.path.join(ROOT, "_check", "sound-raw")
WORK = os.path.join(ROOT, "_check", "sound-work")
OUT = os.path.join(ROOT, "sound")
SR = 48000
PAD = 0.5          # 秒。loopStart
BITRATE = "112k"
rng = np.random.default_rng(20261025)


# ---------- 読み書き ----------
def load(path, ch=2):
    raw = subprocess.run(["ffmpeg", "-nostdin", "-v", "error", "-i", path, "-ac", str(ch), "-ar", str(SR),
                          "-f", "f32le", "-"], capture_output=True, check=True).stdout
    return np.frombuffer(raw, np.float32).astype(np.float64).reshape(-1, ch)


def save_wav(path, x):
    x = np.ascontiguousarray(np.clip(x, -1, 1).astype(np.float32))
    subprocess.run(["ffmpeg", "-nostdin", "-v", "error", "-y", "-f", "f32le", "-ar", str(SR), "-ac", str(x.shape[1]),
                    "-i", "-", "-c:a", "pcm_f32le", path], input=x.tobytes(), check=True)


def encode_m4a(wav, m4a):
    subprocess.run(["ffmpeg", "-nostdin", "-v", "error", "-y", "-i", wav, "-c:a", "aac_at", "-b:a", BITRATE,
                    "-movflags", "+faststart", m4a], check=True)


def lufs(x):
    """ITU-R BS.1770 の積分ラウドネス(ffmpeg ebur128 で測る)"""
    tmp = os.path.join(WORK, "_lufs.wav")
    save_wav(tmp, x)
    r = subprocess.run(["ffmpeg", "-nostdin", "-i", tmp, "-af", "ebur128=peak=true", "-f", "null", "-"],
                       capture_output=True, text=True).stderr
    summ = r[r.rfind("Summary:"):]
    i = float(summ.split("I:")[1].split("LUFS")[0])
    tp = float(summ.split("Peak:")[1].split("dBFS")[0])
    return i, tp


# ---------- 音の加工 ----------
def sec(t):
    return int(round(t * SR))


def cut(x, a, b=None):
    return x[sec(a):(sec(b) if b is not None else None)]


def hp(x, f, order=2):
    return sosfiltfilt(butter(order, f, "hp", fs=SR, output="sos"), x, axis=0)


def lp(x, f, order=2):
    return sosfiltfilt(butter(order, f, "lp", fs=SR, output="sos"), x, axis=0)


def bp(x, lo, hi, order=4):
    return sosfiltfilt(butter(order, [lo, hi], "bp", fs=SR, output="sos"), x, axis=0)


def high_shelf_cut(x, f, db):
    """f より上を db だけ下げる(遠くの音にする)。ローパスとの混ぜ合わせで作る。"""
    g = 10 ** (db / 20)
    low = lp(x, f, 2)
    return low + g * (x - low)


def fades(n, kind="eqpow"):
    t = np.linspace(0, 1, n)
    if kind == "eqpow":   # 関係のない2つの音(雑音っぽい音)を重ねるとき、音量が落ちない
        return np.sin(t * np.pi / 2), np.cos(t * np.pi / 2)
    return t, 1 - t


def concat_xfade(a, b, c):
    n = sec(c)
    fi, fo = fades(n)
    mid = a[-n:] * fo[:, None] + b[:n] * fi[:, None]
    return np.concatenate([a[:-n], mid, b[n:]])


def ring_place(buf, seg, start, c):
    """長さ len(buf) の輪に seg を start から置く(はじめと終わり c 秒をフェード)。"""
    n = sec(c)
    w = np.ones(len(seg))
    fi, fo = fades(n)
    w[:n] = fi
    w[-n:] = fo
    L = len(buf)
    idx = (np.arange(len(seg)) + start) % L
    np.add.at(buf, idx, seg * w[:, None])


def ring_tile(x, L, c, offsets=None):
    """録音 x を、長さ L の輪に すきまなく敷く(つなぎ目は c 秒の重ね)。"""
    S = len(x)
    n = sec(c)
    k = max(1, int(np.ceil(L / (S - n))))
    step = L / k
    seglen = int(np.ceil(step)) + n
    assert seglen <= S, (seglen, S)
    buf = np.zeros((L, x.shape[1]))
    for i in range(k):
        off = 0 if offsets is None else offsets[i % len(offsets)]
        off = min(off, S - seglen)
        ring_place(buf, x[off:off + seglen], int(round(i * step)), c)
    return buf


def _release(g, r):
    """ゲインが下がるときはすぐ、戻るときは r の速さでゆっくり。"""
    try:
        from numba import njit
    except Exception:
        njit = None
    def run(g, r):
        out = np.empty_like(g)
        cur = 1.0
        for i in range(g.shape[0]):
            v = g[i]
            cur = v if v < cur else v + (cur - v) * r
            out[i] = cur
        return out
    return (njit(cache=False)(run) if njit else run)(g, r)


def limiter_fast(x, ceiling_db=-2.0, release=0.03, look=0.003):
    """先読みのピークリミッター(はぜる音の とがりだけを丸める。波形を切らない)。
    必要な倍率の「前後 look 秒の最小値」をとり、それを look 秒の窓でなめらかにするので、
    ピークの位置では必ず必要な倍率以下になる(切り落としが起きない)。"""
    from scipy.ndimage import minimum_filter1d
    ceil = 10 ** (ceiling_db / 20)
    a = np.abs(x).max(axis=1)
    need = np.minimum(1.0, ceil / np.maximum(a, 1e-12))
    la = sec(look)
    g = minimum_filter1d(need, size=2 * la + 1)
    g = _release(g, np.exp(-1.0 / (release * SR)))
    g = np.minimum(g, minimum_filter1d(need, size=2 * la + 1))
    k = np.hanning(la + 1); k /= k.sum()
    g = np.convolve(g, k, mode="same")
    return x * g[:, None]


def to_lufs(x, target, ceiling_db=-2.0, iters=4):
    """音量を target LUFS にそろえる(とがったピークはリミッターで丸める)。"""
    y = x
    for _ in range(iters):
        i, _tp = lufs(y)
        y = limiter_fast(y * 10 ** ((target - i) / 20), ceiling_db)
    i, tp = lufs(y)
    return y, i, tp


def finish_loop(name, ring):
    """輪(ring)を仕上げて m4a にする。前後に PAD 秒の続きを足す。"""
    i, tp = lufs(ring)   # 音量は ring_limit_target でそろえ済み。ここでは測るだけ(継ぎ目を変えない)
    p = sec(PAD)
    full = np.concatenate([ring[-p:], ring, ring[:p]])
    wav = os.path.join(WORK, name + ".wav")
    save_wav(wav, full)
    m4a = os.path.join(OUT, name + ".m4a")
    encode_m4a(wav, m4a)
    L = len(ring) / SR
    print(f"  {name}: {L:.2f}s  {i:.1f} LUFS  TP {tp:.1f}  -> {os.path.getsize(m4a)/1e6:.2f} MB")
    return {"file": f"sound/{name}.m4a", "loopStart": PAD, "loopEnd": round(PAD + L, 4),
            "duration": round(len(full) / SR, 4), "lufs": round(i, 1)}


def slow_level(ring, win=8.0, strength=0.6):
    """ゆっくりした音量の波をならす(火が急に強く/弱くなる差を 6 割ほど小さく)。輪のまま計算するので継ぎ目に影響しない。"""
    hop = SR // 10
    L = len(ring)
    e = (ring ** 2).mean(axis=1)
    n = L // hop
    blk = e[:n * hop].reshape(n, hop).mean(axis=1)
    k = int(win * 10)
    ker = np.hanning(2 * k + 1); ker /= ker.sum()
    ext = np.concatenate([blk[-k:], blk, blk[:k]])          # 輪としてなめらかに
    loc = np.convolve(ext, ker, mode="valid")
    db = 10 * np.log10(loc + 1e-15)
    gdb = -(db - np.mean(db)) * strength
    t_blk = (np.arange(n) + 0.5) * hop
    t = np.arange(L)
    g = 10 ** (np.interp(t, np.concatenate([t_blk - L, t_blk, t_blk + L]), np.tile(gdb, 3)) / 20)
    return ring * g[:, None]


def ring_limit_target(ring, target, ceiling=-2.0):
    """輪のままリミッターをかける(継ぎ目でリミッターの動きが途切れないよう、3周ぶんで処理)。"""
    L = len(ring)
    tri = np.concatenate([ring, ring, ring])
    tri, i, tp = to_lufs(tri, target, ceiling)
    return tri[L:2 * L]


# ---------- 各音 ----------
def bsb(n, ch=2):
    return load(os.path.join(RAW, "bigsoundbank", f"{n}.wav"), ch)


def wm(name, ch=2):
    return load(os.path.join(RAW, "wikimedia", name), ch)


def make_fire_yama():
    """外の焚き火(枝の大きな火)。0989 と 0988 をつなぐ。風のゴーを切る。"""
    a = cut(bsb("0989"), 1.5, 121.5)
    b = cut(bsb("0988"), 2.5, 75.0)
    x = concat_xfade(a, b, 3.0)
    x = hp(x, 110, 4)              # マイクにあたる風の低いゴー(110Hz より下)を切る
    L = len(x) - sec(3.0)
    ring = slow_level(ring_limit_target(ring_tile(x, L, 3.0), -22.0, ceiling=-4.5), strength=0.7)
    ring = ring_limit_target(ring, -21.0, ceiling=-4.5)   # AAC にするとピークが 3dB ほど上がるので低めに
    return finish_loop("fire-1", ring)


def make_fire_umi():
    """暖炉の火(落ち着いたパチパチ)。80〜118秒の木の『ピー』という鳴りは使わない。"""
    x0 = bsb("2855")
    a = cut(x0, 0.6, 79.0)
    b = cut(x0, 119.5, 181.0)
    x = concat_xfade(a, b, 3.0)
    x = hp(x, 60, 2)
    L = len(x) - sec(3.0)
    ring = slow_level(ring_limit_target(ring_tile(x, L, 3.0), -22.0, ceiling=-4.5), strength=0.7)
    ring = ring_limit_target(ring, -22.0, ceiling=-4.5)
    return finish_loop("fire-2", ring)


def make_umi():
    """砂浜に寄せる小さな波(ノルマンディー Houlgate)。風の低いゴーを切り、高い音を少し下げて遠めに。"""
    x = cut(bsb("1046"), 1.0, 137.0)
    x = hp(x, 120, 4)
    x = high_shelf_cut(x, 3500, -7)
    L = len(x) - sec(6.0)
    ring = ring_tile(x, L, 6.0)
    ring = ring_limit_target(ring, -24.0, ceiling=-4.5)
    return finish_loop("umi-1", ring)


def make_yama():
    """夜の山: 虫とカエルの声(ドルドーニュの池) + かすかな沢 + 遠いフクロウ2回。輪の長さ 156 秒。"""
    L = sec(156.0)
    # 虫・カエル(モノラル)。左右に少しずらして置き、広がりを出す
    pond = hp(wm("dordogne-pond.ogg", 1), 250, 4)[:, 0]
    pond_l = ring_tile(np.stack([pond, pond], 1), L, 4.0, offsets=[0, 0, 0])
    # 2つめの層: 同じ音を 26 秒ずらして、左右を入れかえた小さめの層(同じ鳴き方がそろって聞こえないように)
    pond_r = np.roll(pond_l[:, ::-1], sec(26.0), axis=0)
    bed = pond_l * np.array([1.0, 0.75]) * 0.8 + pond_r * 0.35
    # かすかな沢(山の小さな流れ)。高い音を下げて遠くに
    st = bsb("0823")
    st = high_shelf_cut(hp(st, 150, 2), 2500, -10)
    st_ring = ring_tile(st, L, 5.0, offsets=[0, 8 * SR])
    bed_i, _ = lufs(bed)
    st_i, _ = lufs(st_ring)
    bed = bed + st_ring * 10 ** ((bed_i - 14 - st_i) / 20)   # 虫より 14 LU 小さく
    # 遠いフクロウ(モリフクロウ、スウェーデン)。鳴き声の帯域だけ取り出し、遠くの音にする
    owl = wm("owl-tuntorp.ogg", 1)[:, 0]
    for src_t, at_t, pan in [(23.0, 40.0, 0.35), (98.3, 118.0, 0.7)]:
        h = bp(owl[sec(src_t):sec(src_t + 4.0)], 450, 1500)
        fi, fo = fades(sec(0.4), "lin")
        h[:len(fi)] *= fi
        h[-len(fo):] *= fo
        # 遠さ: かすかな響き(短いこだま)
        rev = h.copy()
        for d, g in [(0.045, 0.35), (0.11, 0.22), (0.19, 0.12), (0.31, 0.06)]:
            rev = rev + np.concatenate([np.zeros(sec(d)), h * g])[:len(h)]
        rev = lp(rev, 1200, 2)
        st2 = np.stack([rev * (1 - pan), rev * pan], 1)
        hb, _ = lufs(np.concatenate([st2, np.zeros((SR, 2))]))
        # 鳴いているあいだ、虫より 6 LU くらい小さい音に
        st2 *= 10 ** ((bed_i - 6 - hb) / 20)
        ring_place(bed, st2, sec(at_t), 0.01)
    ring = ring_limit_target(bed, -24.0, ceiling=-4.5)
    return finish_loop("yama-1", ring)


def make_pops():
    """暖炉の録音(2855)から、まわりに大きな音のない『パチッ』を12個切り出す。"""
    x = bsb("2855")
    x = hp(x, 150, 2)
    h = np.abs(hp(x, 2000, 4)).max(axis=1)
    hop = SR // 200
    env = np.array([h[i:i + hop].max() for i in range(0, len(h) - hop, hop)])
    base = np.median(env)
    cands = []
    for i in range(20, len(env) - 120):
        t = i * hop / SR
        if 78.0 < t < 120.0:        # 木の『ピー』がある区間は使わない
            continue
        if env[i] == env[i - 20:i + 20].max() and env[i] > base * 25:
            # 前後 0.4 秒に 同じくらい大きい音がない(ひとつだけの はぜ)
            around = np.concatenate([env[i - 80 if i > 80 else 0:i - 6], env[i + 6:i + 80]])
            if around.max() < env[i] * 0.35:
                cands.append((env[i], i))
    cands.sort(reverse=True)
    picked = []
    for v, i in cands:
        if all(abs(i - j) > 200 for _, j in picked):   # 1秒以上はなれたもの
            picked.append((v, i))
        if len(picked) >= 30:
            break
    # 大きすぎる/小さすぎるものを避け、真ん中あたりの強さから12個
    picked.sort()
    m = len(picked)
    chosen = picked[max(0, m // 2 - 9): max(0, m // 2 - 9) + 12] if m > 12 else picked
    chosen.sort(key=lambda p: p[1])
    out = []
    for k, (v, i) in enumerate(chosen, 1):
        s = i * hop - sec(0.03)
        seg = x[s:s + sec(0.6)].copy()
        fi, _ = fades(sec(0.005), "lin")
        seg[:len(fi)] *= fi[:, None]
        tail = np.exp(-np.linspace(0, 5, sec(0.35)))
        seg[-len(tail):] *= tail[:, None]
        seg[-sec(0.01):] *= np.linspace(1, 0, sec(0.01))[:, None]
        seg = seg / np.abs(seg).max() * 10 ** (-6 / 20)    # ピーク -6 dBFS
        name = f"pop-{k:02d}"
        wav = os.path.join(WORK, name + ".wav")
        # AAC の頭の遅れぶん、前に 20ms の無音
        save_wav(wav, np.concatenate([np.zeros((sec(0.02), 2)), seg]))
        encode_m4a(wav, os.path.join(OUT, name + ".m4a"))
        out.append({"file": f"sound/{name}.m4a", "gain": 0.5, "src": round(i * hop / SR, 2)})
    print(f"  pops: {len(out)} 個 (候補 {len(cands)})", [p['src'] for p in out])
    for p in out:
        p.pop("src")
    return out


def main():
    os.makedirs(WORK, exist_ok=True)
    os.makedirs(OUT, exist_ok=True)
    print("音を作る(数分かかる)")
    f1 = make_fire_yama()
    f2 = make_fire_umi()
    u = make_umi()
    y = make_yama()
    pops = make_pops()
    f1.update({"gain": 0.8, "scene": "yama", "label": "外の焚き火(乾いた枝・パチパチ多め)"})
    f2.update({"gain": 0.8, "scene": "umi", "label": "暖炉の火(落ち着いたパチパチ)"})
    u.update({"gain": 0.55, "label": "砂浜に寄せる小さな波(遠め)"})
    y.update({"gain": 0.55, "label": "夜の山(虫とカエル・かすかな沢・遠いフクロウ)"})
    order = ["file", "gain", "loopStart", "loopEnd", "scene", "label", "duration", "lufs"]
    tidy = lambda d: {k: d[k] for k in order if k in d}
    data = {"version": 1, "fire": [tidy(f1), tidy(f2)], "yama": [tidy(y)], "umi": [tidy(u)], "pops": pops}
    with open(os.path.join(OUT, "sounds.json"), "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
        f.write("\n")
    print("sound/sounds.json を書いた")


if __name__ == "__main__":
    main()
