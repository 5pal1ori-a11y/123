"""브랜드 배너 GIF 생성기 (960x190, 어두운 배경 + 흰 픽셀 제목 + 보라 밑줄 — /추천인 배너와 같은 스타일)
사용: GIF_FONT_DIR=<Galmuri11.ttf, NotoSansKR.ttf 가 있는 폴더> python3 scripts/make-brand-gifs.py public/brand
"""
import math
import os
import random
import sys
from PIL import Image, ImageDraw, ImageFont

FONT_DIR = os.environ.get("GIF_FONT_DIR", ".")
W, H = 960, 190
N = 36
DELAY = 70

BG = (16, 20, 28)
PIX = ImageFont.truetype(os.path.join(FONT_DIR, "Galmuri11.ttf"), 12)


def noto(size, weight):
    f = ImageFont.truetype(os.path.join(FONT_DIR, "NotoSansKR.ttf"), size)
    try:
        f.set_variation_by_axes([weight])
    except Exception:
        pass
    return f


SUBF = noto(25, 400)
PILLF = noto(28, 600)


def rect(d, x, y, w, h, c):
    if w > 0 and h > 0:
        d.rectangle([x, y, x + w - 1, y + h - 1], fill=c)


def pixels(d, ox, oy, rows, pal, s):
    for j, row in enumerate(rows):
        for i, ch in enumerate(row):
            if ch in pal:
                rect(d, ox + i * s, oy + j * s, s, s, pal[ch])


def pixel_text(text, color, scale, shadow):
    tmp = Image.new("RGBA", (len(text) * 14 + 8, 18), (0, 0, 0, 0))
    d = ImageDraw.Draw(tmp)
    d.text((2, 1), text, font=PIX, fill=color)
    d.text((3, 1), text, font=PIX, fill=color)
    tmp = tmp.crop(tmp.getbbox())
    big = tmp.resize((tmp.width * scale, tmp.height * scale), Image.NEAREST)
    sh = tmp.copy()
    px = sh.load()
    for y in range(sh.height):
        for x in range(sh.width):
            if px[x, y][3]:
                px[x, y] = shadow + (255,)
    sh = sh.resize(big.size, Image.NEAREST)
    off = max(3, scale // 2)
    out = Image.new("RGBA", (big.width + off, big.height + off), (0, 0, 0, 0))
    out.alpha_composite(sh, (off, off))
    out.alpha_composite(big, (0, 0))
    return out


random.seed(11)
STARS = [(random.randrange(W), random.randrange(H), random.choice([(70, 62, 110), (110, 96, 170), (150, 130, 210)]), random.randrange(36)) for _ in range(46)]

GIFT_BODY = [
    "kkkkkkkkkkkkkkkk",
    "kppppppyypppppppk"[:16],
    "kppppppyypppppppk"[:16],
    "kPppppyyyppppppk"[:16],
    "kPppppyyyppppppk"[:16],
    "kPppppyyyppppppk"[:16],
    "kPPpppyyypppppPk"[:16],
    "kPPPppyyyppppPPk"[:16],
    "kkkkkkkkkkkkkkkk",
]
GIFT_LID = [
    "...kkk....kkk...",
    "..kyyyk..kyyyk..",
    "..kyk.ykky.kyk..",
    "...kyyyyyyyyk...",
    "kkkkkkkyykkkkkkk",
    "kllllllyyllllllk",
    "kppppppyypppppk"[:16],
]
GIFT_PAL = {"k": (36, 22, 40), "p": (244, 114, 182), "P": (200, 62, 140), "l": (255, 168, 214), "y": (255, 214, 80)}
ENVELOPE = [
    "kkkkkkkkkkkkkkkkkkkk",
    "kwwwwwwwwwwwwwwwwwwk",
    "kkwwwwwwwwwwwwwwwwkk",
    "kwkwwwwwwwwwwwwwwkwk",
    "kwwkwwwwwwwwwwwwkwwk",
    "kwwwkwwwwwwwwwwkwwwk",
    "kwwwwkkwwwwwwkkwwwwk",
    "kwwwwwwkkkkkkwwwwwwk",
    "kwwwwwwwwwwwwwwwwwwk",
    "kwwwwwwwwwwwwwwwwwwk",
    "kkkkkkkkkkkkkkkkkkkk",
]
ENV_PAL = {"k": (36, 22, 40), "w": (250, 246, 255)}
COIN = ["..kkkk..", ".kyyyyk.", "kyllyydk", "kylyyydk", "kyyyyydk", "kyyyyydk", ".kdddk..", "..kkkk.."]
COIN_PAL = {"k": (70, 44, 12), "y": (255, 204, 64), "l": (255, 240, 170), "d": (226, 150, 24)}
SPARK = ["..w..", "..w..", "wwwww", "..w..", "..w.."]
CONF = [(255, 214, 80), (244, 114, 182), (120, 190, 255), (130, 230, 150)]


def background(d, f):
    rect(d, 0, 0, W, H, BG)
    for yy in range(14, H, 30):
        for xx in range(14, W, 30):
            rect(d, xx, yy, 2, 2, (26, 32, 44))


def glow(img, cx, cy, f):
    d = ImageDraw.Draw(img)
    pulse = int(round(math.sin(f / N * math.pi * 2) * 2))
    for r, c in ((86 + pulse, (31, 27, 50)), (64 + pulse // 2, (47, 30, 80))):
        d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=c)


def sparkle(d, x, y, big=False):
    pixels(d, x, y, SPARK, {"w": (255, 246, 214)}, 4 if big else 3)


def coin(d, x, y):
    pixels(d, x, y, COIN, COIN_PAL, 3)


def gift(d, f, cx, base, open_lid=False):
    s = 5
    ph = (f / N) * 2 % 1
    hop = abs(math.sin(ph * math.pi)) * 7
    gx = cx - 8 * s
    by = int(base - 16 * s - hop)
    pixels(d, gx, by + 7 * s, GIFT_BODY, GIFT_PAL, s)
    lid = 4 * s + int(abs(math.sin(ph * math.pi)) * 4) if open_lid else int(abs(math.sin(ph * math.pi)) * 5)
    pixels(d, gx, by - lid, GIFT_LID, GIFT_PAL, s)


def envelope(d, f, cx, base):
    s = 5
    bob = int(round(math.sin(f / N * math.pi * 2) * 4))
    ex, ey = cx - 10 * s, base - 11 * s + bob
    pixels(d, ex, ey, ENVELOPE, ENV_PAL, s)
    on = (f // 5) % 2 == 0
    rect(d, ex + 20 * s - 18, ey - 18, 30, 30, (36, 22, 40))
    rect(d, ex + 20 * s - 15, ey - 15, 24, 24, (255, 96, 110) if on else (232, 64, 84))


def fit_scale(title, scale, limit=700):
    for sc in range(scale, 3, -1):
        total = 0
        for ch in title:
            total += 3 * sc if ch == " " else pixel_text(ch, (255, 255, 255), sc, (0, 0, 0)).width + 8
        if total <= limit:
            return sc
    return 4


def render(path, icon, title, sub, scale=6):
    frames = []
    for f in range(N):
        img = Image.new("RGBA", (W, H), BG + (255,))
        d = ImageDraw.Draw(img)
        background(d, f)
        glow(img, 112, 95, f)
        d = ImageDraw.Draw(img)
        icon(d, f)
        x = 232
        sc = fit_scale(title, scale)
        for idx, ch in enumerate(title):
            if ch == " ":
                x += 3 * sc
                continue
            g = pixel_text(ch, (255, 255, 255), sc, (44, 34, 70))
            y = 26 + int(round(math.sin(f / N * math.pi * 2 - idx * 0.9) * 2))
            img.alpha_composite(g, (x, y))
            x += g.width + 8
        d = ImageDraw.Draw(img)
        d.text((234, 100), sub, font=SUBF, fill=(206, 206, 222))
        t = min(1, f / 12)
        w = int(100 * (1 - (1 - t) ** 3))
        rect(d, 234, 146, w, 5, (168, 85, 247))
        rect(d, 234, 149, w, 3, (126, 34, 206))
        frames.append(img.convert("RGB"))
    strip = Image.new("RGB", (W, H * 6))
    for i, k in enumerate(range(0, N, N // 6)):
        if i < 6:
            strip.paste(frames[k], (0, H * i))
    pal = strip.quantize(colors=160, method=Image.Quantize.MEDIANCUT)
    q = [fr.quantize(palette=pal, dither=Image.Dither.NONE) for fr in frames]
    dur = [DELAY] * N
    dur[-1] = 900
    q[0].save(path, save_all=True, append_images=q[1:], duration=dur, loop=0, optimize=True, disposal=1)
    print("saved", path, os.path.getsize(path) // 1024, "KB")


def icon_giveaway(d, f):
    gift(d, f, 112, 138)
    coin(d, 62 + (f % 6 < 3) * 2, 44)
    coin(d, 150, 34 + int(math.sin(f / 5) * 2))
    sparkle(d, 90, 28, f % 8 < 4)


def icon_end(d, f):
    gift(d, f, 112, 138, open_lid=True)
    for i in range(10):
        x = 56 + int(random.Random(i).random() * 112)
        y = int((random.Random(i + 40).random() * 120 + f * 4) % 140) + 16
        c = CONF[i % 4]
        if (i + f) % 2:
            rect(d, x, y, 3, 6, c)
        else:
            rect(d, x, y, 6, 3, c)
    sparkle(d, 90, 24, f % 8 < 4)


def icon_stock(d, f):
    envelope(d, f, 112, 134)
    coin(d, 62, 44 + int(math.sin(f / 5) * 2))
    coin(d, 156, 62)
    sparkle(d, 104, 24, f % 8 < 4)


out = sys.argv[1] if len(sys.argv) > 1 else "."
render(os.path.join(out, "giveaway.gif"), icon_giveaway, "경품 추첨", "버튼 한 번으로 참여하세요 · 마감 시 자동 추첨")
render(os.path.join(out, "giveaway-end.gif"), icon_end, "당첨 발표!", "당첨자를 축하드려요 · 주최자에게 문의해 주세요")
render(os.path.join(out, "stock-request.gif"), icon_stock, "재고 요청", "찾는 상품이 없으면 버튼 한 번으로 남겨 주세요")
