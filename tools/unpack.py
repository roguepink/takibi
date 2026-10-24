#!/usr/bin/env python3
"""Flow の画面から1回の保存でまとめて持ってきたファイル(~/Downloads/takibi-pack-*.bin)を _check/flow/raw/ にほどく(2026-10-25)。
  python3 tools/unpack.py
まとめ方(ページの中で作る): [名前の長さ 4バイト][名前][中身の長さ 4バイト][中身] のくり返し。
Chrome は1つのタブで2回目からの保存を止めるので、まだ保存していない新しいタブで、
動画を1本ずつ開いて fetch で集め → まとめて1つにし → ページに置いた「保存」リンクをクリックして1回だけ保存する。"""
import struct
from pathlib import Path
OUT = Path(__file__).resolve().parent.parent / "_check/flow/raw"
for p in sorted((Path.home() / "Downloads").glob("takibi-pack-*.bin")):
    b = p.read_bytes(); i = 0
    while i < len(b):
        n = struct.unpack(">I", b[i:i+4])[0]; name = b[i+4:i+4+n].decode(); i += 4 + n
        m = struct.unpack(">I", b[i:i+4])[0]; (OUT / name).write_bytes(b[i+4:i+4+m]); i += 4 + m
        print("ほどいた:", name, m)
    p.unlink()
