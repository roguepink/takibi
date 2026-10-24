#!/usr/bin/env python3
"""アイコンと紹介画像(OGP)を 本物の焚き火の静止画から作る(デザイン係の決まり・直す係 2026-10-25)。
  ~/.local/venvs/ryokoshi/bin/python tools/make_icons.py
- アイコン: media/yama/still.jpg から 火を中心に正方形で切りだす(火の中心 x≈0.496, y≈0.58、一辺は絵の幅の約60〜64%)。
  まわりを少し暗く(火に目が行く)。小さいサイズは コントラストを少し上げる(ホーム画面で つぶれないように)。
  icon-512 / icon-192 / apple-touch-icon(180) / maskable-512(Android が丸や角丸に切るので、火が中心80%に入るよう広めに切る。黒いふちは付けない)。
- 紹介画像 ogp.jpg(1200×630): 一灯(rosoku/icons/ogp.jpg)と同じ組み方。山と海の静止画を並べ、右の暗い所に「ひとくべ」を明朝体の縦書き、
  下に「山と海の焚き火を、ただ眺める。」(ヒラギノ明朝・色 #C8B497)。
作り直したら index.html の og:image の ?v= を上げる(LINE などが 古い絵を覚えているため)。
"""
from pathlib import Path
from PIL import Image, ImageDraw, ImageEnhance, ImageFilter, ImageFont

ROOT = Path(__file__).resolve().parent.parent
ICONS = ROOT / "icons"
FONT = "/System/Library/Fonts/ヒラギノ明朝 ProN.ttc"
INK = (0xC8, 0xB4, 0x97)
CX, CY = 0.496, 0.58


def crop_square(im, side_frac):
    w, h = im.size
    s = int(w * side_frac)
    x0 = int(w * CX - s / 2); y0 = int(h * CY - s / 2)
    x0 = max(0, min(w - s, x0)); y0 = max(0, min(h - s, y0))
    return im.crop((x0, y0, x0 + s, y0 + s))


def vignette(im, strength=0.45):
    """まわりを少し暗く(まん中は そのまま)"""
    w, h = im.size
    m = Image.radial_gradient("L").resize((w, h))              # まん中 0 → ふち 255
    m = m.point(lambda v: int(255 - strength * 255 * min(1, (v / 255) ** 1.6 * 1.25)))
    black = Image.new("RGB", (w, h), (0, 0, 0))
    return Image.composite(im, black, m)


def icon(src, size, side_frac, contrast=1.0, strength=0.45):
    im = crop_square(src, side_frac)
    im = vignette(im, strength).resize((size, size), Image.LANCZOS)
    if contrast != 1.0:
        im = ImageEnhance.Contrast(im).enhance(contrast)
        im = ImageEnhance.Color(im).enhance(1.05)
    if size <= 192:
        im = im.filter(ImageFilter.UnsharpMask(radius=1.0, percent=60, threshold=2))
    return im


def ogp():
    W, H = 1200, 630
    c = Image.new("RGB", (W, H), (6, 4, 3))
    # うしろ: 山の静止画を大きくぼかして暗く(一灯と同じ 光のたまり)
    y = Image.open(ROOT / "media/yama/still.jpg").convert("RGB")
    bg = y.resize((W, int(W * y.height / y.width))).crop((0, 300, W, 300 + H)).filter(ImageFilter.GaussianBlur(40))
    c = Image.blend(c, ImageEnhance.Brightness(bg).enhance(0.35), 0.8)
    # 山と海の静止画を並べる(たて 590)
    ph = 590; pw = int(ph * 9 / 16)
    x = 120
    for name in ["yama", "umi"]:
        im = Image.open(ROOT / f"media/{name}/still.jpg").convert("RGB").resize((pw, ph), Image.LANCZOS)
        c.paste(im, (x, 20)); x += pw + 12
    # 右の暗い所に 名前(縦書き)と ひとこと
    d = ImageDraw.Draw(c)
    f = ImageFont.truetype(FONT, 58)
    tx = 1000
    for i, ch in enumerate("ひとくべ"):
        bb = d.textbbox((0, 0), ch, font=f)
        d.text((tx - (bb[2] - bb[0]) / 2 - bb[0], 150 + i * 76 - bb[1]), ch, font=f, fill=INK)
    f2 = ImageFont.truetype(FONT, 23)
    line = "山と海の焚き火を、ただ眺める。"
    bb = d.textbbox((0, 0), line, font=f2)
    d.text((tx - (bb[2] - bb[0]) / 2, 490), line, font=f2, fill=INK)
    c.save(ICONS / "ogp.jpg", quality=88)


def main():
    src = Image.open(ROOT / "media/yama/still.jpg").convert("RGB")
    icon(src, 512, 0.64).save(ICONS / "icon-512.png", optimize=True)
    icon(src, 192, 0.62, contrast=1.12).save(ICONS / "icon-192.png", optimize=True)
    icon(src, 180, 0.62, contrast=1.12).save(ICONS / "apple-touch-icon.png", optimize=True)
    # Android の maskable: 丸く切られても 火が残るよう 広めに(火が 中心80%の円に入る)。黒いふちは付けない(絵で うめる)
    icon(src, 512, 0.86, strength=0.35).save(ICONS / "maskable-512.png", optimize=True)
    ogp()
    print("icons/ を作りなおした")


if __name__ == "__main__":
    main()
