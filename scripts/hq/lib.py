"""고화질 GIF 공용 도구 — 2배로 부드럽게 그려 줄여서 계단 없이 만든다.
글꼴: 제목은 픽셀 글꼴(Galmuri11, 기존 배너와 같음), 설명은 Noto Sans KR.
"""
import math
import os
import random
from PIL import Image, ImageDraw, ImageFilter, ImageFont

FONT_DIR = os.environ.get("GIF_FONT_DIR", ".")
SS = 2


class Canvas:
    def __init__(self, w, h):
        self.w, self.h = w, h
        self.img = Image.new("RGB", (w * SS, h * SS), (10, 11, 22))

    @property
    def d(self):
        return ImageDraw.Draw(self.img)


def S(v):
    return int(round(v * SS))


def ease_out(t):
    t = max(0.0, min(1.0, t))
    return 1 - (1 - t) ** 3


def ease_back(t):
    t = max(0.0, min(1.0, t))
    c1 = 1.70158
    return 1 + (c1 + 1) * (t - 1) ** 3 + c1 * (t - 1) ** 2


# ───────── 글꼴 ─────────

PIX = None


def pix_font():
    global PIX
    if PIX is None:
        PIX = ImageFont.truetype(os.path.join(FONT_DIR, "Galmuri11.ttf"), 12)
    return PIX


def noto(size, weight=500):
    f = ImageFont.truetype(os.path.join(FONT_DIR, "NotoSansKR.ttf"), int(size * SS))
    try:
        f.set_variation_by_axes([weight])
    except Exception:
        pass
    return f


def pixel_text_img(text, color, scale, shadow=(44, 34, 70)):
    """기존 배너와 같은 픽셀 제목 (Galmuri 를 굵게 찍어 nearest 로 키움 + 그림자)"""
    tmp = Image.new("RGBA", (len(text) * 14 + 8, 18), (0, 0, 0, 0))
    td = ImageDraw.Draw(tmp)
    td.text((2, 1), text, font=pix_font(), fill=color + (255,))
    td.text((3, 1), text, font=pix_font(), fill=color + (255,))
    bb = tmp.getbbox()
    if not bb:
        return Image.new("RGBA", (1, 1))
    tmp = tmp.crop(bb)
    sc = scale * SS
    big = tmp.resize((tmp.width * sc, tmp.height * sc), Image.NEAREST)
    sh = Image.new("RGBA", tmp.size, (0, 0, 0, 0))
    sh.paste(Image.new("RGBA", tmp.size, shadow + (255,)), (0, 0), tmp)
    sh = sh.resize(big.size, Image.NEAREST)
    off = max(SS * 2, sc // 2)
    out = Image.new("RGBA", (big.width + off, big.height + off), (0, 0, 0, 0))
    out.alpha_composite(sh, (off, off))
    out.alpha_composite(big, (0, 0))
    return out


def fit_pixel_title(text, max_w, scale=10, color=(255, 255, 255), shadow=(44, 34, 70)):
    """max_w(원래 크기 px) 안에 들어가는 가장 큰 배율로"""
    for sc in range(scale, 2, -1):
        im = title_strip(text, sc, color, shadow)
        if im.width <= S(max_w):
            return im
    return title_strip(text, 3, color, shadow)


def title_strip(text, sc, color, shadow, gap=4):
    parts = []
    for ch in text:
        if ch == " ":
            parts.append(None)
        else:
            parts.append(pixel_text_img(ch, color, sc, shadow))
    space = sc * 3 * SS
    w = sum(p.width + S(gap) if p else space for p in parts)
    h = max((p.height for p in parts if p), default=10)
    out = Image.new("RGBA", (max(1, w), h), (0, 0, 0, 0))
    x = 0
    for p in parts:
        if p is None:
            x += space
            continue
        out.alpha_composite(p, (x, h - p.height))
        x += p.width + S(gap)
    return out


def wave_title(cv, text, x, y, f, n, max_w, scale=10, color=(255, 255, 255), shadow=(44, 34, 70), amp=3):
    """글자마다 살짝 출렁이는 제목"""
    sc = scale
    while sc > 3 and title_strip(text, sc, color, shadow).width > S(max_w):
        sc -= 1
    cx = S(x)
    for idx, ch in enumerate(text):
        if ch == " ":
            cx += sc * 3 * SS
            continue
        g = pixel_text_img(ch, color, sc, shadow)
        dy = int(round(math.sin(f / n * math.pi * 2 - idx * 0.9) * amp * SS))
        cv.img.paste(g, (cx, S(y) + dy), g)
        cx += g.width + S(4)
    return sc


def sub_text(cv, text, x, y, size=26, color=(206, 206, 222), max_w=None, weight=500):
    d = cv.d
    sz = size
    f = noto(sz, weight)
    while max_w and sz > 12 and d.textlength(text, font=f) > S(max_w):
        sz -= 1
        f = noto(sz, weight)
    d.text((S(x), S(y)), text, font=f, fill=color)


def underline(cv, x, y, f, color=(168, 85, 247), dark=(126, 34, 206), full=120):
    t = min(1, f / 12)
    w = int(full * (1 - (1 - t) ** 3))
    if w <= 0:
        return
    cv.d.rounded_rectangle([S(x), S(y), S(x + w), S(y + 6)], radius=S(3), fill=color)
    cv.d.rectangle([S(x), S(y + 4), S(x + w), S(y + 6)], fill=dark)


# ───────── 배경 · 빛 ─────────

def night_bg(cv, f, n, glow_at=None, glow_color=(120, 60, 220), seed=3, stars=60, base=(12, 13, 24)):
    cv.img.paste(base, (0, 0, cv.img.width, cv.img.height))
    # 세로 그라데이션
    grad = Image.linear_gradient("L").resize(cv.img.size)
    cv.img.paste((22, 20, 44), (0, 0), grad.point(lambda v: int(v * 0.45)))
    if glow_at:
        soft_glow(cv, glow_at[0], glow_at[1], glow_at[2], glow_color, 120)
    rnd = random.Random(seed)
    d = cv.d
    for i in range(stars):
        x, y = rnd.uniform(0, cv.w), rnd.uniform(0, cv.h)
        s = rnd.uniform(0.6, 1.7)
        ph = rnd.random()
        tw = 0.5 + 0.5 * math.sin((f / n) * math.pi * 4 + ph * 6.28)
        c = int(80 + 150 * tw)
        r = S(s * (0.6 + 0.6 * tw))
        d.ellipse([S(x) - r, S(y) - r, S(x) + r, S(y) + r], fill=(c, c, min(255, c + 30)))


def soft_glow(cv, cx, cy, r, color, alpha):
    layer = Image.new("L", cv.img.size, 0)
    ImageDraw.Draw(layer).ellipse([S(cx - r), S(cy - r), S(cx + r), S(cy + r)], fill=alpha)
    layer = layer.filter(ImageFilter.GaussianBlur(S(r) * 0.45))
    cv.img.paste(color, (0, 0, cv.img.width, cv.img.height), layer)


def rays(cv, cx, cy, t, color=(255, 220, 120), reach=260, count=14, strength=90):
    layer = Image.new("L", cv.img.size, 0)
    ld = ImageDraw.Draw(layer)
    rot = t * 1.2
    R = S(reach)
    X, Y = S(cx), S(cy)
    for i in range(count):
        a0 = rot + i * (2 * math.pi / count)
        a1 = a0 + math.pi / count * 0.55
        ld.polygon([(X, Y), (X + math.cos(a0) * R, Y + math.sin(a0) * R), (X + math.cos(a1) * R, Y + math.sin(a1) * R)], fill=int(strength * min(1, t * 2)))
    layer = layer.filter(ImageFilter.GaussianBlur(S(5)))
    cv.img.paste(color, (0, 0, cv.img.width, cv.img.height), layer)


def ring_glow(cv, cx, cy, f, n, outer=(31, 27, 50), inner=(47, 30, 80), r1=112, r2=84):
    pulse = math.sin(f / n * math.pi * 2) * 3
    d = cv.d
    for r, c in ((r1 + pulse, outer), (r2 + pulse / 2, inner)):
        d.ellipse([S(cx - r), S(cy - r), S(cx + r), S(cy + r)], fill=c)


def confetti(cv, f, seed, x0, x1, y_range=420, count=44, speed=(4, 9)):
    rnd = random.Random(seed)
    cols = [(255, 214, 80), (255, 110, 150), (120, 190, 255), (130, 230, 160), (200, 140, 255)]
    d = cv.d
    for i in range(count):
        x = rnd.uniform(x0, x1)
        sp = rnd.uniform(*speed)
        y = (rnd.uniform(-200, y_range) + f * sp) % (y_range + 40) - 40
        a = f * 0.3 + i
        w, h = S(rnd.uniform(5, 9)), S(rnd.uniform(9, 15) * abs(math.sin(a)) + 2)
        d.rectangle([S(x) - w / 2, S(y) - h / 2, S(x) + w / 2, S(y) + h / 2], fill=cols[i % len(cols)])


def sparkle(cv, x, y, s, c=(255, 255, 240)):
    X, Y, s = S(x), S(y), S(s)
    cv.d.polygon([(X, Y - s), (X + s * 0.22, Y - s * 0.22), (X + s, Y), (X + s * 0.22, Y + s * 0.22), (X, Y + s), (X - s * 0.22, Y + s * 0.22), (X - s, Y), (X - s * 0.22, Y - s * 0.22)], fill=c)


def twinkles(cv, f, n, points):
    for i, (sx, sy) in enumerate(points):
        t = (math.sin(f / n * math.pi * 4 + i * 1.7) + 1) / 2
        if t > 0.3:
            sparkle(cv, sx, sy, 5 + 8 * t)


# ───────── 소품 ─────────

OUT = (24, 18, 34)


def gift(cv, cx, bottom, s=1.0, lid_lift=0.0, ribbon=(255, 214, 80), body=(244, 114, 182), dark=(200, 62, 140)):
    d = cv.d
    w, h = 120 * s, 84 * s
    x0, y0 = cx - w / 2, bottom - h
    d.rounded_rectangle([S(x0), S(y0), S(x0 + w), S(bottom)], radius=S(10 * s), fill=OUT)
    d.rounded_rectangle([S(x0 + 5 * s), S(y0 + 5 * s), S(x0 + w - 5 * s), S(bottom - 5 * s)], radius=S(8 * s), fill=body)
    d.rectangle([S(x0 + w * 0.62), S(y0 + 5 * s), S(x0 + w - 5 * s), S(bottom - 5 * s)], fill=dark)
    d.rectangle([S(cx - 10 * s), S(y0 + 5 * s), S(cx + 10 * s), S(bottom - 5 * s)], fill=ribbon)
    d.rectangle([S(x0 + 8 * s), S(y0 + 12 * s), S(x0 + 22 * s), S(y0 + 40 * s)], fill=(255, 190, 225))
    # 뚜껑
    ly = y0 - 22 * s - lid_lift
    lx0, lx1 = cx - w / 2 - 8 * s, cx + w / 2 + 8 * s
    d.rounded_rectangle([S(lx0), S(ly), S(lx1), S(ly + 28 * s)], radius=S(8 * s), fill=OUT)
    d.rounded_rectangle([S(lx0 + 5 * s), S(ly + 5 * s), S(lx1 - 5 * s), S(ly + 23 * s)], radius=S(6 * s), fill=(255, 168, 214))
    d.rectangle([S(cx - 10 * s), S(ly + 5 * s), S(cx + 10 * s), S(ly + 23 * s)], fill=ribbon)
    # 리본 고리
    for side in (-1, 1):
        bx = cx + side * 22 * s
        d.ellipse([S(bx - 20 * s), S(ly - 26 * s), S(bx + 20 * s), S(ly + 4 * s)], fill=OUT)
        d.ellipse([S(bx - 15 * s), S(ly - 21 * s), S(bx + 15 * s), S(ly - 1 * s)], fill=ribbon)
        d.ellipse([S(bx - 7 * s), S(ly - 14 * s), S(bx + 7 * s), S(ly - 6 * s)], fill=(214, 160, 30))
    d.ellipse([S(cx - 10 * s), S(ly - 12 * s), S(cx + 10 * s), S(ly + 6 * s)], fill=OUT)
    d.ellipse([S(cx - 7 * s), S(ly - 9 * s), S(cx + 7 * s), S(ly + 3 * s)], fill=ribbon)


def coin(cv, x, y, r, spin=0.0):
    d = cv.d
    sx = abs(math.cos(spin)) * 0.85 + 0.15
    rx = r * sx
    d.ellipse([S(x - rx), S(y - r), S(x + rx), S(y + r)], fill=(120, 70, 10))
    d.ellipse([S(x - rx + 3 * sx), S(y - r + 3), S(x + rx - 3 * sx), S(y + r - 3)], fill=(255, 196, 50))
    if sx > 0.4:
        d.ellipse([S(x - rx * 0.62), S(y - r * 0.62), S(x + rx * 0.62), S(y + r * 0.62)], outline=(230, 150, 20), width=S(3))
        d.ellipse([S(x - rx * 0.55), S(y - r * 0.72), S(x - rx * 0.12), S(y - r * 0.32)], fill=(255, 245, 190))


def coin_pile(cv, cx, cy, s, f):
    for i, (dx, dy) in enumerate([(-0.9, 0.35), (0.85, 0.4), (0, 0), (-0.35, -0.55), (0.45, -0.5)]):
        coin(cv, cx + dx * s, cy + dy * s + math.sin(f * 0.5 + i) * 3, s * 0.5, spin=0)


def gem(cv, cx, cy, s, palette=None):
    d = cv.d
    lite, mid, dark, top = palette or ((190, 232, 255), (150, 210, 255), (100, 160, 240), (235, 248, 255))
    pts_top = [(cx - s, cy - s * 0.2), (cx - s * 0.55, cy - s * 0.7), (cx + s * 0.55, cy - s * 0.7), (cx + s, cy - s * 0.2)]
    bottom = (cx, cy + s * 0.95)
    d.polygon([(S(x), S(y)) for x, y in pts_top + [bottom]], fill=OUT)
    k = 0.86
    inner = [(cx + (x - cx) * k, cy + (y - cy) * k) for x, y in pts_top] + [(cx, cy + s * 0.95 * k)]
    P = lambda pts: [(S(x), S(y)) for x, y in pts]
    d.polygon(P(inner), fill=mid)
    c = (cx, cy - s * 0.2 * k)
    d.polygon(P([inner[0], inner[1], c, inner[4]]), fill=lite)
    d.polygon(P([inner[3], inner[2], c, inner[4]]), fill=dark)
    d.polygon(P([inner[1], inner[2], c]), fill=top)
    d.line(P([inner[0], inner[3]]), fill=tuple(max(0, v - 40) for v in dark), width=S(2))


def capsule(cv, cx, cy, r, top, bottom, angle=0.0):
    d = cv.d
    X, Y, R = S(cx), S(cy), S(r)
    for half, col in ((0, top), (1, bottom)):
        start = (180 if half == 0 else 0) + math.degrees(angle)
        d.pieslice([X - R, Y - R, X + R, Y + R], start, start + 180, fill=OUT)
        d.pieslice([X - R + S(3), Y - R + S(3), X + R - S(3), Y + R - S(3)], start, start + 180, fill=col)
    d.ellipse([X - R * 0.55, Y - R * 0.62, X - R * 0.15, Y - R * 0.32], fill=(255, 255, 255))


def save_gif(frames, path, durations, out_size, colors=255, dither=True):
    small = [fr.resize(out_size, Image.LANCZOS) for fr in frames]
    ow, oh = out_size
    k = min(8, len(small))
    strip = Image.new("RGB", (ow, oh * k))
    for i, idx in enumerate(range(0, len(small), max(1, len(small) // k))):
        if i < k:
            strip.paste(small[idx], (0, oh * i))
    pal = strip.quantize(colors=colors, method=Image.Quantize.MEDIANCUT)
    q = [fr.quantize(palette=pal, dither=Image.Dither.FLOYDSTEINBERG if dither else Image.Dither.NONE) for fr in small]
    q[0].save(path, save_all=True, append_images=q[1:], duration=durations, loop=0, optimize=True, disposal=1)
    print("saved", os.path.basename(path), os.path.getsize(path) // 1024, "KB", len(frames), "frames")
