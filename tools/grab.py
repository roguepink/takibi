#!/usr/bin/env python3
"""Flow から保存した いちばん新しいファイルを _check/flow/raw/<名前> に写す(2026-10-25)。
  python3 tools/grab.py <名前>
保存のしかた: Flow のページで画像・動画の URL(…/asb/…)を取り、別のタブでその URL の最後に「=d」をつけて開く。
(ページの中から続けて保存すると Chrome が止めるが、アドレスを開く保存は止められない)
~/Downloads の、2分以内に保存した jpg/png/mp4 だけを見る。写せたら ダウンロードのほうは消す。"""
import shutil, sys, time
from pathlib import Path
d = Path.home() / "Downloads"
for _ in range(30):
    fs = [f for f in d.iterdir() if f.is_file() and f.suffix.lower() in (".jpg", ".jpeg", ".png", ".mp4") and time.time() - f.stat().st_mtime < 120]
    if fs: break
    time.sleep(1)
else:
    print("新しいファイルなし"); sys.exit(1)
f = max(fs, key=lambda f: f.stat().st_mtime)
dst = Path(__file__).resolve().parent.parent / "_check/flow/raw" / sys.argv[1]
shutil.copy2(f, dst)
if dst.stat().st_size == f.stat().st_size:
    f.unlink()
print("写した:", sys.argv[1], "←", f.name, dst.stat().st_size)
