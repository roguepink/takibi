#!/usr/bin/env python3
"""本物の音(sound/*.m4a)で、アプリの音の動きを ブラウザ(Chrome・音は消して)で確かめる。
使い方: ~/.local/venvs/ryokoshi/bin/python tools/sound_browser_check.py
(Playwright の WebKit は m4a を読めないので Chrome だけ。iPhone の動きは ui_check.py --fake-sound で)

確かめること
- 火をつけると: 山の焚き火の音(fire-1)+森の音 が鳴る / 大きさが ふわっと上がる
- 場所を海にすると: 焚き火の音が fire-2、まわりが波 に入れかわり、使わなくなった音はメモリから はなれる
- パチッが ばらばらな間で鳴る(数える)
- アプリを閉じる(suspend)→ 大きさ 0 で止まる → もどる → ふわっと もとの大きさ
- おやすみの小さくする(fadeTo)で 焚き火の音が やわらかく(高い音を しぼる)なる
- 止めて すぐ また鳴らしても、前の音が残らない
"""
import functools, http.server, json, os, socketserver, threading, time

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"


class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a):
        pass


def main():
    from playwright.sync_api import sync_playwright
    socketserver.TCPServer.allow_reuse_address = True
    with socketserver.ThreadingTCPServer(("127.0.0.1", 0), functools.partial(Quiet, directory=ROOT)) as srv:
        threading.Thread(target=srv.serve_forever, daemon=True).start()
        url = f"http://127.0.0.1:{srv.server_address[1]}/index.html?scene=yama"
        with sync_playwright() as p:
            exe = CHROME if os.path.exists(CHROME) else None
            br = p.chromium.launch(executable_path=exe, headless=True, args=["--mute-audio", "--autoplay-policy=no-user-gesture-required"])
            pg = br.new_context(viewport={"width": 390, "height": 844}).new_page()
            errs = []
            pg.on("pageerror", lambda e: errs.append(str(e)))
            pg.add_init_script("""
              (() => { const C = window.AudioContext; if (!C) return;
                const o = C.prototype.createBufferSource;
                window.__srcs = [];
                C.prototype.createBufferSource = function () { const s = o.call(this); const st = s.start.bind(s);
                  s.start = (...a) => { window.__srcs.push({ t: this.currentTime, dur: s.buffer && s.buffer.duration, loop: s.loop }); return st(...a); }; return s; };
              })();""")
            pg.goto(url)
            pg.wait_for_function("window.__takibi && __takibi.sound.has", timeout=15000)
            pg.mouse.click(195, 400)   # 火をつける
            st = lambda: pg.evaluate("""(() => { const s = __takibi.sound; return { on: s.on, ctx: s.ctx && s.ctx.state,
                master: s.master && +s.master.gain.value.toFixed(3), tone: s.tone && Math.round(s.tone.frequency.value),
                fire: s.fireFile, amb: s.ambId, ambFile: s.ambFile, level: s.level,
                bufs: [...s.bufs.keys()].filter((k) => !/pop-/.test(k)), pops: (window.__srcs || []).filter((x) => !x.loop).length,
                loops: (window.__srcs || []).filter((x) => x.loop).length }; })()""")
            r = {}
            time.sleep(1.0); r["1秒後"] = st()
            time.sleep(5.0); r["6秒後"] = st()
            pg.evaluate("__takibi.changeScene(1)")
            time.sleep(9.5); r["海にして 9.5秒後"] = st()
            t0 = pg.evaluate("(window.__srcs || []).filter((x) => !x.loop).length")
            time.sleep(60); r["さらに60秒"] = st()
            r["60秒のパチッの数"] = r["さらに60秒"]["pops"] - t0
            times = pg.evaluate("(window.__srcs || []).filter((x) => !x.loop).map((x) => +x.t.toFixed(2))")
            gaps = [round(b - a, 2) for a, b in zip(times, times[1:])]
            r["パチッの間(秒)"] = gaps
            pg.evaluate("__takibi.sound.suspend()"); time.sleep(0.5); r["閉じた"] = st()
            pg.evaluate("__takibi.sound.resume()"); time.sleep(0.3); r["もどって 0.3秒"] = st()
            time.sleep(2.0); r["もどって 2.3秒"] = st()
            pg.evaluate("__takibi.sound.fadeTo(0.12, 3)"); time.sleep(4); r["fadeTo(0.12)"] = st()
            pg.evaluate("__takibi.sound.stop(2)"); time.sleep(0.3)
            pg.evaluate(f"__takibi.sound.start('umi')"); time.sleep(4.5)
            r["止めて すぐ また鳴らす"] = st()
            r["errors"] = errs
            print(json.dumps(r, ensure_ascii=False, indent=1))
            br.close()


if __name__ == "__main__":
    main()
