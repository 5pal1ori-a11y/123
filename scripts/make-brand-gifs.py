"""브랜드 배너 GIF 생성기 (960x240, 숫자 맞추기 배너와 같은 픽셀아트 스타일)
사용: GIF_FONT_DIR=<Galmuri11.ttf, NotoSansKR.ttf 가 있는 폴더> python3 scripts/make-brand-gifs.py public/brand
"""
import math
import random
import sys
from PIL import Image, ImageDraw, ImageFont

import os
FONT_DIR = os.environ.get("GIF_FONT_DIR", ".")
W, H = 960, 240
S = 4  # 픽셀아트 한 칸 크기
N = 40  # 프레임 수
DELAY = 70  # ms

BG = (243, 240, 234)
DOT = (214, 209, 200)
INK = (24, 24, 32)
SUB = (110, 106, 98)
GREEN = (34, 197, 94)
GREEN_D = (21, 128, 61)

PIX = ImageFont.truetype(os.path.join(FONT_DIR, "Galmuri11.ttf"), 12)
SUBF = ImageFont.truetype(os.path.join(FONT_DIR, "NotoSansKR.ttf"), 30)
try:
    SUBF.set_variation_by_axes([800])
except Exception:
    pass
DIGIT = ImageFont.truetype(os.path.join(FONT_DIR, "Galmuri11.ttf"), 12)


def ease_out_back(t):
    c1 = 1.70158
    c3 = c1 + 1
    return 1 + c3 * (t - 1) ** 3 + c1 * (t - 1) ** 2


def pixel_text(text, color, scale, shadow=None):
    """작은 픽셀 폰트로 그린 뒤 nearest로 키운다 (계단 모양 그대로)"""
    tmp = Image.new("RGBA", (len(text) * 14 + 8, 18), (0, 0, 0, 0))
    d = ImageDraw.Draw(tmp)
    d.text((2, 1), text, font=PIX, fill=color)
    d.text((3, 1), text, font=PIX, fill=color)
    bbox = tmp.getbbox()
    tmp = tmp.crop(bbox)
    big = tmp.resize((tmp.width * scale, tmp.height * scale), Image.NEAREST)
    if not shadow:
        return big
    sh = tmp.copy()
    px = sh.load()
    for y in range(sh.height):
        for x in range(sh.width):
            if px[x, y][3]:
                px[x, y] = shadow + (255,)
    sh = sh.resize(big.size, Image.NEAREST)
    out = Image.new("RGBA", (big.width + scale, big.height + scale), (0, 0, 0, 0))
    out.alpha_composite(sh, (scale, scale))
    out.alpha_composite(big, (0, 0))
    return out


def rect(d, x, y, w, h, c):
    if w <= 0 or h <= 0:
        return
    d.rectangle([x, y, x + w - 1, y + h - 1], fill=c)


def pixels(d, ox, oy, rows, palette, s=S):
    for j, row in enumerate(rows):
        for i, ch in enumerate(row):
            if ch in palette:
                rect(d, ox + i * s, oy + j * s, s, s, palette[ch])


# ── 아이콘 (픽셀 맵) ────────────────────────────────
STAR = [
    "......kk......",
    ".....kyyk.....",
    ".....kyyk.....",
    "....kyyyyk....",
    "kkkkkywyyykkkk",
    "kyyyywwyyyyyyk",
    ".kyyyyyyyyyyk.",
    "..kyyyyyyyyk..",
    "...kyyyyyyk...",
    "...kyyyoyyk...",
    "..kyyyookyyk..",
    "..kyyok.koyyk.",
    ".kyok.....koyk",
    ".kkk.......kkk",
]
STAR_PAL = {"k": (40, 32, 20), "y": (253, 214, 64), "w": (255, 249, 196), "o": (234, 160, 30)}

GIFT_BODY = [
    "kkkkkkkkkkkkkkkk",
    "krrrrrryyrrrrrrk",
    "krrrrrryyrrrrrrk",
    "kRrrrrryyrrrrrRk",
    "kRrrrrryyrrrrrRk",
    "kRrrrrryyrrrrrRk",
    "kRrrrrryyrrrrrRk",
    "kRRrrrryyrrrrRRk",
    "kkkkkkkkkkkkkkkk",
]
GIFT_LID = [
    "...kkk....kkk...",
    "..kyyyk..kyyyk..",
    "..kyk.ykky.kyk..",
    "...kyyyyyyyyk...",
    "kkkkkkkyykkkkkkk",
    "kwwwwwwyywwwwwwk",
    "krrrrrryyrrrrrrk",
]
GIFT_PAL = {"k": (40, 24, 24), "r": (230, 72, 60), "R": (190, 48, 44), "y": (250, 204, 60), "w": (248, 118, 100)}

SPARK = ["..k..", "..w..", "kwwwk", "..w..", "..k.."]
SPARK_PAL = {"k": (255, 214, 90), "w": (255, 255, 255)}

CONF_COLORS = [(34, 197, 94), (59, 130, 246), (250, 204, 21), (244, 114, 182), (249, 115, 22)]
random.seed(7)
CONFETTI = [
    (random.uniform(770, 950), random.uniform(0, H), random.choice(CONF_COLORS), random.uniform(0.6, 1.4), random.random())
    for _ in range(18)
]


def number_tile(d, img, f):
    x0, y0, tw, th = 72, 46, 132, 148
    # 착지 바운스: 0~23 굴러가는 숫자, 24에서 '?' 착지
    land = 24
    bob = 0
    if f >= land:
        t = min(1, (f - land) / 8)
        bob = int(round((1 - ease_out_back(t)) * -18)) if t < 1 else 0
        bob += int(round(math.sin((f - land) / (N - land) * math.pi * 2) * 2)) if t >= 1 else 0
    y0 += bob
    # 그림자
    rect(d, x0 + 8, y0 + 10, tw, th, (208, 202, 192))
    # 테두리 + 몸통
    rect(d, x0, y0, tw, th, INK)
    rect(d, x0 + S, y0 + S, tw - 2 * S, th - 2 * S, (86, 196, 250))
    rect(d, x0 + S, y0 + S, tw - 2 * S, 3 * S, (186, 232, 255))
    rect(d, x0 + S, y0 + th - 9 * S, tw - 2 * S, 8 * S, (37, 136, 228))
    # 창
    wx, wy, ww, wh = x0 + 6 * S, y0 + 6 * S, tw - 12 * S, th - 17 * S
    rect(d, wx - S, wy - S, ww + 2 * S, wh + 2 * S, (20, 60, 120))
    rect(d, wx, wy, ww, wh, (255, 255, 255))
    # 숫자
    win = Image.new("RGBA", (ww, wh), (255, 255, 255, 255))
    if f < land:
        speed = 1 + f // 6
        n = (f * speed) % 10
        frac = (f * 0.5) % 1
        for k, dy in ((n, -frac), ((n + 1) % 10, 1 - frac)):
            g = pixel_text(str(k), INK, 6)
            win.alpha_composite(g, ((ww - g.width) // 2, int((wh - g.height) // 2 + dy * wh)))
    else:
        g = pixel_text("?", (37, 99, 235), 6)
        win.alpha_composite(g, ((ww - g.width) // 2, (wh - g.height) // 2))
    img.alpha_composite(win, (wx, wy))
    # 착지 반짝
    if land <= f < land + 6:
        k = f - land
        for (sx, sy) in ((x0 - 14, y0 - 10), (x0 + tw + 2, y0 + 6), (x0 + tw - 6, y0 - 16)):
            pixels(d, sx - k, sy - k, SPARK, SPARK_PAL, s=3 + (k % 2))


def title(img, f):
    text = "숫자 맞추기"
    x, base_y = 262, 44
    for idx, ch in enumerate(text):
        if ch == " ":
            x += 34
            continue
        g = pixel_text(ch, INK, 7, shadow=(222, 216, 206))
        wave = math.sin((f / N) * math.pi * 2 - idx * 0.9)
        y = base_y + int(round(wave * 4))
        img.alpha_composite(g, (x, y))
        x += g.width + 8


def subtitle(d, f):
    x, y = 266, 142
    parts = [("가장 먼저 맞힌 ", SUB), ("1명", GREEN_D), ("에게 상품", SUB)]
    for txt, col in parts:
        d.text((x, y), txt, font=SUBF, fill=col, stroke_width=1, stroke_fill=col)
        x += int(d.textlength(txt, font=SUBF)) + 1
    # 밑줄: 차오르고 유지
    t = min(1, f / 14)
    full = 132
    w = int(full * (1 - (1 - t) ** 3))
    rect(d, 268, 194, max(w, 0), 8, GREEN)
    if w > 0:
        rect(d, 268, 198, max(w, 0), 4, (22, 163, 74))


def gift(d, f):
    gx, gy = 812, 120
    # 통통 튀기 (한 루프에 두 번)
    ph = (f / N) * 2 % 1
    hop = abs(math.sin(ph * math.pi)) * 14
    squash = 1 if ph > 0.92 or ph < 0.08 else 0
    lid_extra = int(abs(math.sin(ph * math.pi)) * 8)
    by = int(gy - hop)
    # 그림자
    sw = 64 - int(hop)
    rect(d, gx + 32 - sw // 2, gy + 16 * S + 4, sw, 6, (214, 208, 198))
    pixels(d, gx, by + 7 * S + squash * S, GIFT_BODY, GIFT_PAL)
    pixels(d, gx, by - lid_extra + squash * S, GIFT_LID, GIFT_PAL)


def star(d, img, f):
    sx, sy = 836, 26
    tw = math.sin(f / N * math.pi * 4)
    layer = Image.new("RGBA", (14 * S, 14 * S), (0, 0, 0, 0))
    pixels(ImageDraw.Draw(layer), 0, 0, STAR, STAR_PAL)
    scale = 1 + 0.08 * tw
    sz = int(14 * S * scale)
    layer = layer.resize((sz, sz), Image.NEAREST)
    img.alpha_composite(layer, (sx - (sz - 14 * S) // 2, sy - (sz - 14 * S) // 2))
    # 주변 반짝이
    for i, (ox, oy) in enumerate(((-26, 8), (64, -4), (70, 50))):
        if (f + i * 5) % 14 < 7:
            pixels(d, sx + ox, sy + oy, SPARK, SPARK_PAL, s=3)


def confetti(d, f):
    for (x, y, c, sp, ph) in CONFETTI:
        yy = (y + f * 6 * sp) % (H + 20) - 10
        xx = x + math.sin(f / 5 + ph * 6) * 6
        w = S if int(f / 3 + ph * 10) % 2 else S * 2
        rect(d, int(xx), int(yy), w, S, c)


def background(d, f):
    rect(d, 0, 0, W, H, BG)
    off = (f * 1) % 32
    for yy in range(-32, H + 32, 32):
        for xx in range(-32, W + 32, 32):
            rect(d, xx + off + 14, yy + off + 14, 4, 4, DOT)



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
ENV_PAL = {"k": (40, 32, 48), "w": (255, 255, 255)}
CROWN = [
    "k....k....k",
    "kk..kyk..kk",
    "kyk.kyk.kyk",
    "kyykyyykyyk",
    "kyyyyyyyyyk",
    "kyyyyryyyyk",
    "kyyyyyyyyyk",
    "kkkkkkkkkkk",
]
CROWN_PAL = {"k": (40, 32, 20), "y": (253, 214, 64), "r": (234, 70, 80)}
CART = [
    "kk..........",
    ".kkkkkkkkkk.",
    ".kgggggggggk",
    "..kgggggggk.",
    "..kgggggggk.",
    "...kkkkkkk..",
    "...k.....k..",
    "..kkk...kkk.",
]
CART_PAL = {"k": (30, 80, 50), "g": (52, 196, 106)}


def wave_title(img, f, text, x, base_y, scale=7, gap=8, space=34):
    for idx, ch in enumerate(text):
        if ch == " ":
            x += space
            continue
        g = pixel_text(ch, INK, scale, shadow=(222, 216, 206))
        wave = math.sin((f / N) * math.pi * 2 - idx * 0.9)
        img.alpha_composite(g, (x, base_y + int(round(wave * 4))))
        x += g.width + gap


def sub_line(d, f, parts, size=30, x=266, y=142):
    font = ImageFont.truetype(os.path.join(FONT_DIR, "NotoSansKR.ttf"), size)
    try:
        font.set_variation_by_axes([800])
    except Exception:
        pass
    for txt, col in parts:
        d.text((x, y), txt, font=font, fill=col, stroke_width=1, stroke_fill=col)
        x += int(d.textlength(txt, font=font)) + 1
    t = min(1, f / 14)
    w = int(132 * (1 - (1 - t) ** 3))
    rect(d, 268, 194, max(w, 0), 8, GREEN)
    if w > 0:
        rect(d, 268, 198, max(w, 0), 4, (22, 163, 74))


def big_gift(d, f, gx, gy, open_lid=False):
    ph = (f / N) * 2 % 1
    hop = abs(math.sin(ph * math.pi)) * 14
    by = int(gy - hop)
    sw = 90 - int(hop)
    rect(d, gx + 48 - sw // 2, gy + 16 * 6 + 6, sw, 7, (214, 208, 198))
    lid = 34 + int(abs(math.sin(ph * math.pi)) * 6) if open_lid else int(abs(math.sin(ph * math.pi)) * 8)
    pixels(d, gx, by + 7 * 6, GIFT_BODY, GIFT_PAL, s=6)
    pixels(d, gx, by - lid, GIFT_LID, GIFT_PAL, s=6)


def envelope(d, f, ex, ey):
    bob = int(round(math.sin(f / N * math.pi * 2) * 6))
    rect(d, ex + 10, ey + bob + 12 * 6 - 2, 120, 8, (214, 208, 198))
    pixels(d, ex, ey + bob, ENVELOPE, ENV_PAL, s=6)
    on = (f // 5) % 2 == 0
    rect(d, ex + 20 * 6 - 22, ey + bob - 20, 36, 36, (40, 32, 48))
    rect(d, ex + 20 * 6 - 18, ey + bob - 16, 28, 28, (250, 90, 100) if on else (230, 60, 75))


def side_icon(d, img, f, kind):
    if kind == "star":
        star(d, img, f)
    elif kind == "crown":
        bob = int(round(math.sin(f / N * math.pi * 4) * 4))
        pixels(d, 826, 40 + bob, CROWN, CROWN_PAL, s=7)
        for i, (ox, oy) in enumerate(((-26, 8), (86, 0), (92, 52))):
            if (f + i * 5) % 14 < 7:
                pixels(d, 826 + ox, 40 + oy, SPARK, SPARK_PAL, s=3)
    elif kind == "cart":
        bob = int(round(math.sin(f / N * math.pi * 2) * 3))
        pixels(d, 818, 34 + bob, CART, CART_PAL, s=8)


def render(path, left, title_text, parts, right, gift_side=True, title_x=262, size=30):
    frames = []
    for f in range(N):
        img = Image.new("RGBA", (W, H), BG + (255,))
        d = ImageDraw.Draw(img)
        background(d, f)
        confetti(d, f)
        left(d, img, f)
        wave_title(img, f, title_text, title_x, 44)
        sub_line(d, f, parts, size=size)
        if gift_side:
            gift(d, f)
        side_icon(d, img, f, right)
        frames.append(img.convert("RGB"))
    strip = Image.new("RGB", (W, H * 6))
    for i, k in enumerate(range(0, N, max(1, N // 6))):
        if i >= 6:
            break
        strip.paste(frames[k], (0, H * i))
    pal = strip.quantize(colors=128, method=Image.Quantize.MEDIANCUT)
    q = [fr.quantize(palette=pal, dither=Image.Dither.NONE) for fr in frames]
    durations = [DELAY] * N
    durations[N - 1] = 900
    q[0].save(path, save_all=True, append_images=q[1:], duration=durations, loop=0, optimize=True, disposal=1)
    print("saved", path, os.path.getsize(path) // 1024, "KB")


out = sys.argv[1] if len(sys.argv) > 1 else "."
render(os.path.join(out, "giveaway.gif"), lambda d, i, f: big_gift(d, f, 70, 62), "GIVEAWAY",
       [("버튼 ", SUB), ("한 번", GREEN_D), ("으로 참여", SUB)], "star", gift_side=False, title_x=274)
render(os.path.join(out, "giveaway-end.gif"), lambda d, i, f: big_gift(d, f, 70, 62, open_lid=True), "당첨 발표!",
       [("당첨자", GREEN_D), ("를 축하합니다", SUB)], "crown", gift_side=False)
render(os.path.join(out, "stock-request.gif"), lambda d, i, f: envelope(d, f, 62, 76), "재고 요청",
       [("찾는 상품이 없으면 ", SUB), ("버튼", GREEN_D), ("으로 남겨 주세요", SUB)], "cart", gift_side=False, size=27)
