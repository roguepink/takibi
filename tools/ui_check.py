#!/usr/bin/env python3
"""アプリを スマホのふりで開いて、順に操作して 写真をとる(音なし・画面なし)。構成係・UI/UX係の確かめ用。
  ~/.local/venvs/ryokoshi/bin/python tools/ui_check.py            # iPhone 13(WebKit)と Android(Chrome)とパソコン
  ~/.local/venvs/ryokoshi/bin/python tools/ui_check.py --only iphone
写真は _check/ui/(Git に入れない)。
見ること: タップで火がつく → 動画が3本以上つながる → 操作の板 → 場所の切りかえ → おやすみ(短い時間)→ 真っ黒 → 「もう一度、火をつける」。
動画は 途中読み(Range)ができるサーバーで出す(iPhone の Safari は これがないと動画を流さない)。
"""
import argparse, functools, http.server, json, os, re, socketserver, threading, time
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
FAKE_SOUND = False
CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"


class H(http.server.SimpleHTTPRequestHandler):
    """途中読み(Range)に こたえる 小さなサーバー"""
    def end_headers(self):
        self.send_header("Cache-Control", "no-store"); self.send_header("Accept-Ranges", "bytes"); super().end_headers()
    def log_message(self, *a): pass
    def send_head(self):
        rng = self.headers.get("Range")
        path = self.translate_path(self.path)
        if not rng or not os.path.isfile(path):
            return super().send_head()
        m = re.match(r"bytes=(\d*)-(\d*)", rng)
        size = os.path.getsize(path)
        a = int(m.group(1)) if m.group(1) else 0
        b = int(m.group(2)) if m.group(2) else size - 1
        if not m.group(1) and m.group(2): a, b = size - int(m.group(2)), size - 1
        b = min(b, size - 1)
        f = open(path, "rb"); f.seek(a)
        self.send_response(206)
        self.send_header("Content-Type", self.guess_type(path))
        self.send_header("Content-Range", f"bytes {a}-{b}/{size}")
        self.send_header("Content-Length", str(b - a + 1))
        self.end_headers()
        self._left = b - a + 1
        return f
    def copyfile(self, src, dst):
        left = getattr(self, "_left", None)
        if left is None: return super().copyfile(src, dst)
        while left > 0:
            buf = src.read(min(65536, left))
            if not buf: break
            try: dst.write(buf)
            except (BrokenPipeError, ConnectionResetError): break
            left -= len(buf)


def run(p, name, kind, port, out):
    from playwright.sync_api import Error as PWError
    url = f"http://127.0.0.1:{port}/index.html"
    if kind == "iphone":
        br = p.webkit.launch()
        ctx = br.new_context(**p.devices["iPhone 13"])
    elif kind == "android":
        br = p.chromium.launch(executable_path=CHROME, headless=True, args=["--mute-audio"])
        ctx = br.new_context(**p.devices["Pixel 7"])
    else:
        br = p.chromium.launch(executable_path=CHROME, headless=True, args=["--mute-audio"])
        ctx = br.new_context(viewport={"width": 1280, "height": 800})
    if FAKE_SOUND:
        # 音の係の sounds.json の代わりに、_check/app/snd の仮の音を わたす(sound/ には何も置かない)
        def fake(route):
            route.fulfill(content_type="application/json", body=json.dumps({
                "fire": [{"file": "_check/app/snd/fire.wav", "gain": 0.8, "loopStart": 0.5, "loopEnd": 9.5}],
                "yama": [{"file": "_check/app/snd/yama.wav", "gain": 0.6}], "umi": [{"file": "_check/app/snd/umi.wav", "gain": 0.6}],
                "pops": [{"file": "_check/app/snd/pop.wav", "gain": 0.5}]}))
        ctx.route("**/sound/sounds.json", fake)
    pg = ctx.new_page(); errs = []
    pg.on("console", lambda m: errs.append(f"[{m.type}] {m.text}") if m.type in ("error", "warning") else None)
    pg.on("pageerror", lambda e: errs.append(f"[pageerror] {e}"))
    pg.goto(url)
    vw, vh = pg.viewport_size["width"], pg.viewport_size["height"]
    def shot(n, wait=0.0):
        time.sleep(wait); pg.screenshot(path=str(out / f"{name}-{n}.png"))
    def S(): return pg.evaluate("__takibi.state")
    def tap(x=None, y=None):
        x = vw / 2 if x is None else x; y = vh * 0.45 if y is None else y
        if kind == "pc": pg.mouse.click(x, y)
        else: pg.touchscreen.tap(x, y)
    res = {"name": name}
    shot("1-start", 3.0)
    tap(); time.sleep(3.0)
    res["lit"] = S()["phase"]
    shot("2-lit")
    # 動画が つながっていくか(26秒 = 8秒の動画 3本ぶん以上)
    seen = []
    for i in range(13):
        time.sleep(2.0); s = S(); seen.append((round(s["t"], 1), s["cur"], s["played"], s["paused"]))
        if i == 4: shot("3-playing")
    s = S()
    res["played"] = s["played"]; res["log"] = s["log"]; res["paused_samples"] = sum(1 for x in seen if x[3])
    res["bad"] = s["bad"]
    res["sound"] = pg.evaluate("(() => { const s = __takibi.sound; return { has: s.has, on: s.on, ctx: s.ctx && s.ctx.state, master: s.master && +s.master.gain.value.toFixed(2), fire: !!s.fireLayer, amb: s.ambId, bufs: [...s.bufs.keys()] }; })()")
    # 操作の板
    tap(); shot("4-ui", 0.9)
    pg.evaluate("__takibi.openSheet('place')"); shot("5-place", 0.8)
    pg.evaluate("__takibi.openSheet('sleep')"); shot("6-sleep", 0.6)
    pg.evaluate("__takibi.openSheet('adjust')"); shot("7-adjust", 0.6)
    if pg.evaluate("!document.getElementById('soundBtn').hidden"):
        pg.evaluate("__takibi.openSheet('sound')"); shot("7b-sound", 0.6)
    # 場所の切りかえ(黒をはさむ)
    pg.evaluate("__takibi.hideUI(true); __takibi.changeScene(1)")
    shot("8-switching", 1.4)
    time.sleep(4.5); res["sound_after_switch"] = pg.evaluate("__takibi.sound.ambId"); s = S(); res["after_switch"] = {k: s[k] for k in ("scene", "cur", "paused", "played")}
    shot("9-umi")
    # おやすみ(3秒後)→ 終わりの動画 → 真っ黒
    pg.evaluate("__takibi.sleepSecs(3)")
    time.sleep(4 + 6); shot("10-ending"); res["ending"] = S()["ending"]
    for _ in range(30):
        time.sleep(1.0)
        e = S()["ending"]
        if e and e["done"]: break
    time.sleep(16.5); s = S(); res["slept"] = {k: s[k] for k in ("phase", "fade", "running")}
    shot("11-slept")
    res["sound_slept"] = pg.evaluate("(() => { const s = __takibi.sound; return { on: s.on, master: s.master && +s.master.gain.value.toFixed(3) }; })()")
    tap(); shot("12-relight", 1.0)
    try:
        pg.click("#relight", timeout=3000) if kind == "pc" else pg.tap("#relight", timeout=3000)
    except PWError as e:
        res["relight_err"] = str(e)[:120]
    time.sleep(4); s = S(); res["relit"] = {k: s[k] for k in ("phase", "paused", "played")}
    shot("13-relit")
    res["errors"] = errs[:20]
    br.close()
    return res


def main():
    global FAKE_SOUND
    ap = argparse.ArgumentParser(); ap.add_argument("--only", default=""); ap.add_argument("--fake-sound", action="store_true", help="仮の音で 音の仕組みも確かめる(鳴らさない)")
    a = ap.parse_args()
    FAKE_SOUND = a.fake_sound
    if FAKE_SOUND:
        d = ROOT / "_check/app/snd"; d.mkdir(parents=True, exist_ok=True)
        import subprocess
        # 仮の音は 無音(テストで音を出さない)。Playwright の WebKit は m4a を読めないので wav
        for n, dur in [("fire", 10), ("yama", 10), ("umi", 10), ("pop", 0.08)]:
            f = d / f"{n}.wav"
            if not f.exists(): subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-f", "lavfi", "-i", "anullsrc=r=44100:cl=stereo", "-t", str(dur), str(f)], check=True)
    from playwright.sync_api import sync_playwright
    out = ROOT / "_check" / "ui"; out.mkdir(parents=True, exist_ok=True)
    socketserver.TCPServer.allow_reuse_address = True
    with socketserver.ThreadingTCPServer(("127.0.0.1", 0), functools.partial(H, directory=str(ROOT))) as srv:
        threading.Thread(target=srv.serve_forever, daemon=True).start()
        port = srv.server_address[1]
        with sync_playwright() as p:
            for name, kind in [("iphone13", "iphone"), ("android", "android"), ("pc", "pc")]:
                if a.only and a.only not in (name, kind): continue
                r = run(p, name, kind, port, out)
                print(json.dumps(r, ensure_ascii=False, indent=1))


if __name__ == "__main__":
    main()
