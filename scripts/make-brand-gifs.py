"""브랜드 배너 GIF 생성기 (960x360, 어두운 우주 배경 픽셀아트 — /랜덤박스 배너와 같은 스타일)
사용: GIF_FONT_DIR=<Galmuri11.ttf, NotoSansKR.ttf 가 있는 폴더> python3 scripts/make-brand-gifs.py public/brand
"""
import math
import os
import random
import sys
from PIL import Image, ImageDraw, ImageFont

FONT_DIR = os.environ.get("GIF_FONT_DIR", ".")
W, H = 960, 360
N = 36
DELAY = 70

BG = (18, 16, 28)
PIX = ImageFont.truetype(os.path.join(FONT_DIR, "Galmuri11.ttf"), 12)


def noto(size, weight):
    f = ImageFont.truetype(os.path.join(FONT_DIR, "NotoSansKR.ttf"), size)
    try:
        f.set_variation_by_axes([weight])
    except Exception:
        pass
    return f


SUBF = noto(29, 400)
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
    for i, (x, y, c, ph) in enumerate(STARS):
        if (f + ph) % 18 < 12:
            rect(d, x, y, 3, 3, c)
    # 좌하단 장식은 두지 않고 별만


def glow(img, cx, cy, f):
    d = ImageDraw.Draw(img)
    pulse = int(round(math.sin(f / N * math.pi * 2) * 4))
    for r, c in ((162 + pulse, (34, 22, 48)), (112 + pulse // 2, (66, 28, 66)), (78, (96, 36, 84))):
        d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=c)


def sparkle(d, x, y, big=False):
    s = 4 if big else 3
    pixels(d, x, y, SPARK, {"w": (255, 246, 214)}, s)


def coin(d, x, y):
    pixels(d, x, y, COIN, COIN_PAL, 4)


def gift(d, f, cx, base, open_lid=False):
    s = 10
    ph = (f / N) * 2 % 1
    hop = abs(math.sin(ph * math.pi)) * 12
    gx = cx - 8 * s
    by = int(base - 16 * s - hop)
    pixels(d, gx, by + 7 * s, GIFT_BODY, GIFT_PAL, s)
    lid = 4 * s + int(abs(math.sin(ph * math.pi)) * 8) if open_lid else int(abs(math.sin(ph * math.pi)) * 10)
    pixels(d, gx, by - lid, GIFT_LID, GIFT_PAL, s)


def envelope(d, f, cx, base):
    s = 8
    bob = int(round(math.sin(f / N * math.pi * 2) * 7))
    ex, ey = cx - 10 * s, base - 14 * s + bob
    pixels(d, ex, ey, ENVELOPE, ENV_PAL, s)
    on = (f // 5) % 2 == 0
    rect(d, ex + 20 * s - 26, ey - 26, 44, 44, (36, 22, 40))
    rect(d, ex + 20 * s - 22, ey - 22, 36, 36, (255, 96, 110) if on else (232, 64, 84))


def pill_yellow(d, x, y, text):
    w = int(d.textlength(text, font=PILLF)) + 48
    d.rounded_rectangle([x, y, x + w, y + 52], radius=12, fill=(255, 214, 80))
    d.text((x + 24, y + 8), text, font=PILLF, fill=(40, 30, 20))
    return x + w


def pill_line(d, x, y, text):
    w = int(d.textlength(text, font=PILLF)) + 62
    d.rounded_rectangle([x, y, x + w, y + 52], radius=12, outline=(236, 72, 153), width=3)
    d.text((x + 22, y + 8), text, font=PILLF, fill=(250, 150, 200))
    d.rectangle([x + w - 24, y + 24, x + w - 20, y + 28], fill=(250, 150, 200))


def fit_scale(title, scale, limit=470):
    """제목이 오른쪽 끝을 넘지 않는 가장 큰 배율"""
    for sc in range(scale, 3, -1):
        total = 0
        for ch in title:
            total += 3 * sc if ch == " " else pixel_text(ch, (255, 255, 255), sc, (0, 0, 0)).width + 10
        if total <= limit:
            return sc
    return 4


def render(path, icon, title, sub, pill_a, pill_b, scale=9):
    frames = []
    for f in range(N):
        img = Image.new("RGBA", (W, H), BG + (255,))
        d = ImageDraw.Draw(img)
        background(d, f)
        glow(img, 230, 190, f)
        d = ImageDraw.Draw(img)
        icon(d, f)
        # 제목: 한 글자씩 살짝 출렁
        x = 458
        sc = fit_scale(title, scale)
        for idx, ch in enumerate(title):
            if ch == " ":
                x += 3 * sc
                continue
            g = pixel_text(ch, (255, 255, 255), sc, (176, 50, 130))
            y = 52 + int(round(math.sin(f / N * math.pi * 2 - idx * 0.9) * 4))
            img.alpha_composite(g, (x, y))
            x += g.width + 10
        d = ImageDraw.Draw(img)
        d.text((460, 196), sub, font=SUBF, fill=(214, 208, 240))
        e = pill_yellow(d, 460, 246, pill_a)
        pill_line(d, e + 16, 246, pill_b)
        frames.append(img.convert("RGB"))
    strip = Image.new("RGB", (W, H * 6))
    for i, k in enumerate(range(0, N, N // 6)):
        if i < 6:
            strip.paste(frames[k], (0, H * i))
    pal = strip.quantize(colors=160, method=Image.Quantize.MEDIANCUT)
    q = [fr.quantize(palette=pal, dither=Image.Dither.NONE) for fr in frames]
    q[0].save(path, save_all=True, append_images=q[1:], duration=[DELAY] * N, loop=0, optimize=True, disposal=1)
    print("saved", path, os.path.getsize(path) // 1024, "KB")


def icon_giveaway(d, f):
    gift(d, f, 230, 322)
    coin(d, 166 + (f % 6 < 3) * 2, 100)
    coin(d, 262, 38 + int(math.sin(f / 5) * 4))
    sparkle(d, 200, 66, f % 8 < 4)


def icon_end(d, f):
    gift(d, f, 230, 322, open_lid=True)
    for i in range(14):
        x = 120 + int(random.Random(i).random() * 220)
        y = int((random.Random(i + 40).random() * 240 + f * 7) % 300) + 20
        c = CONF[i % 4]
        if (i + f) % 2:
            rect(d, x, y, 5, 10, c)
        else:
            rect(d, x, y, 10, 5, c)
    sparkle(d, 200, 66, f % 8 < 4)


def icon_stock(d, f):
    envelope(d, f, 230, 290)
    coin(d, 150, 84 + int(math.sin(f / 5) * 4))
    coin(d, 296, 120)
    sparkle(d, 216, 52, f % 8 < 4)


out = sys.argv[1] if len(sys.argv) > 1 else "."
render(os.path.join(out, "giveaway.gif"), icon_giveaway, "경품 추첨", "버튼 한 번으로 참여하세요", "누구나 참여", "마감 시 자동 추첨", scale=9)
render(os.path.join(out, "giveaway-end.gif"), icon_end, "당첨 발표!", "당첨을 축하드려요", "축하합니다", "주최자에게 문의", scale=9)
render(os.path.join(out, "stock-request.gif"), icon_stock, "재고 요청", "찾는 상품이 없으면 남겨 주세요", "품절 · 미입고", "입고 검토 중", scale=9)
