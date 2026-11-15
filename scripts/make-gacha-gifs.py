"""랜덤뽑기 고화질 GIF — 인형뽑기 기계 (720x405 로 그려 600x338 로 저장, 2배로 그려 줄여서 계단 없이)
사용: GIF_FONT_DIR=<NotoSansKR.ttf 폴더> python3 scripts/make-gacha-gifs.py public/brand
만드는 파일: gacha-idle.gif · gacha-win.gif(상품) · gacha-coin.gif(잔액 당첨) · gacha-none.gif(꽝)
"""
import math
import os
import random
import sys
from PIL import Image, ImageDraw, ImageFilter, ImageFont

FONT_DIR = os.environ.get("GIF_FONT_DIR", ".")
W, H = 720, 405
SS = 2  # 2배로 그려서 줄인다
DW, DH = W * SS, H * SS


def font(size, weight=800):
    f = ImageFont.truetype(os.path.join(FONT_DIR, "NotoSansKR.ttf"), size * SS)
    try:
        f.set_variation_by_axes([weight])
    except Exception:
        pass
    return f


def S(v):
    return int(round(v * SS))


def ease_out(t):
    return 1 - (1 - t) ** 3


def ease_back(t):
    c1 = 1.70158
    return 1 + (c1 + 1) * (t - 1) ** 3 + c1 * (t - 1) ** 2


random.seed(5)
STARS = [(random.uniform(0, W), random.uniform(0, H), random.uniform(0.6, 1.8), random.random()) for _ in range(70)]
CAPS = [((random.uniform(-62, 62), random.uniform(-40, 52)), random.choice([
    ((255, 92, 120), (255, 240, 245)), ((255, 196, 64), (255, 250, 230)), ((96, 170, 255), (240, 248, 255)),
    ((126, 224, 160), (240, 255, 246)), ((186, 120, 255), (248, 240, 255)), ((255, 140, 70), (255, 245, 235)),
]), random.uniform(0, 6.28)) for _ in range(16)]


def background(f, n):
    img = Image.new("RGB", (DW, DH), (10, 11, 22))
    # 은은한 보라 빛 (가운데 왼쪽)
    glow = Image.new("L", (DW, DH), 0)
    gd = ImageDraw.Draw(glow)
    cx, cy = S(250), S(205)
    for r in range(S(260), 0, -S(6)):
        a = int(70 * (1 - r / S(260)) ** 2)
        gd.ellipse([cx - r, cy - r, cx + r, cy + r], fill=a)
    color = Image.new("RGB", (DW, DH), (120, 60, 220))
    img = Image.composite(color, img, glow)
    d = ImageDraw.Draw(img)
    for x, y, s, ph in STARS:
        tw = 0.5 + 0.5 * math.sin((f / n) * math.pi * 4 + ph * 6.28)
        c = int(90 + 150 * tw)
        r = S(s * (0.6 + 0.6 * tw))
        d.ellipse([S(x) - r, S(y) - r, S(x) + r, S(y) + r], fill=(c, c, min(255, c + 30)))
    return img


def capsule(d, cx, cy, r, top, bottom, angle=0.0, open_gap=0.0):
    """두 색 캡슐 (위 색 · 아래 흰색), angle 만큼 기울어짐"""
    # 그림자 테두리
    for half, col, sign in ((0, top, -1), (1, bottom, 1)):
        off = open_gap * sign
        box = [cx - r, cy - r + off, cx + r, cy + r + off]
        start = 180 + math.degrees(angle) if half == 0 else 0 + math.degrees(angle)
        d.pieslice(box, start, start + 180, fill=(20, 18, 34))
        inner = [box[0] + S(3), box[1] + S(3), box[2] - S(3), box[3] - S(3)]
        d.pieslice(inner, start, start + 180, fill=col)
    # 반짝임
    d.ellipse([cx - r * 0.55, cy - r * 0.62 - open_gap, cx - r * 0.15, cy - r * 0.32 - open_gap], fill=(255, 255, 255))


def machine(img, f, knob_angle, jiggle):
    d = ImageDraw.Draw(img)
    mx, my = S(250), S(205)
    # 받침 그림자
    d.ellipse([mx - S(120), my + S(150), mx + S(120), my + S(176)], fill=(6, 6, 14))
    # 몸통
    body = [mx - S(105), my + S(10), mx + S(105), my + S(160)]
    d.rounded_rectangle(body, radius=S(26), fill=(24, 16, 30))
    d.rounded_rectangle([body[0] + S(5), body[1] + S(5), body[2] - S(5), body[3] - S(5)], radius=S(22), fill=(225, 56, 86))
    d.rounded_rectangle([body[0] + S(5), body[1] + S(5), body[2] - S(5), body[1] + S(40)], radius=S(22), fill=(245, 96, 120))
    d.rectangle([body[0] + S(5), body[3] - S(34), body[2] - S(5), body[3] - S(5)], fill=(176, 36, 66))
    # 코인 투입구
    d.rounded_rectangle([mx + S(48), my + S(40), mx + S(78), my + S(78)], radius=S(6), fill=(40, 20, 34))
    d.rectangle([mx + S(61), my + S(48), mx + S(65), my + S(70)], fill=(250, 210, 90))
    # 배출구
    d.rounded_rectangle([mx - S(40), my + S(102), mx + S(30), my + S(146)], radius=S(12), fill=(30, 14, 26))
    d.rounded_rectangle([mx - S(34), my + S(108), mx + S(24), my + S(140)], radius=S(9), fill=(60, 26, 44))
    # 손잡이
    kx, ky = mx - S(42), my + S(62)
    d.ellipse([kx - S(30), ky - S(30), kx + S(30), ky + S(30)], fill=(24, 16, 30))
    d.ellipse([kx - S(25), ky - S(25), kx + S(25), ky + S(25)], fill=(236, 236, 246))
    d.ellipse([kx - S(25), ky - S(25), kx + S(25), ky - S(4)], fill=(255, 255, 255))
    ex, ey = math.cos(knob_angle), math.sin(knob_angle)
    d.line([kx - ex * S(20), ky - ey * S(20), kx + ex * S(20), ky + ey * S(20)], fill=(120, 120, 150), width=S(9))
    # 목
    d.rectangle([mx - S(70), my - S(6), mx + S(70), my + S(16)], fill=(24, 16, 30))
    d.rectangle([mx - S(64), my - S(2), mx + S(64), my + S(12)], fill=(250, 210, 90))
    # 유리 돔
    dome_c = (mx, my - S(80))
    R = S(102)
    d.ellipse([dome_c[0] - R - S(5), dome_c[1] - R - S(5), dome_c[0] + R + S(5), dome_c[1] + R + S(5)], fill=(24, 16, 30))
    d.ellipse([dome_c[0] - R, dome_c[1] - R, dome_c[0] + R, dome_c[1] + R], fill=(52, 70, 120))
    # 캡슐들
    for (ox, oy), (top, bottom), ph in CAPS:
        jx = math.sin(f * 0.9 + ph) * jiggle * 4
        jy = abs(math.sin(f * 0.7 + ph)) * -jiggle * 6
        capsule(d, dome_c[0] + S(ox + jx), dome_c[1] + S(oy + jy), S(19), top, bottom, angle=ph)
    # 유리 반사
    hl = Image.new("L", (DW, DH), 0)
    hd = ImageDraw.Draw(hl)
    hd.ellipse([dome_c[0] - R + S(12), dome_c[1] - R + S(10), dome_c[0] + R - S(12), dome_c[1] + R - S(10)], fill=60)
    hd.ellipse([dome_c[0] - R + S(4), dome_c[1] - R + S(20), dome_c[0] + R - S(30), dome_c[1] + R - S(4)], fill=0)
    hd.ellipse([dome_c[0] - S(72), dome_c[1] - S(74), dome_c[0] - S(40), dome_c[1] - S(46)], fill=200)
    img.paste(Image.new("RGB", (DW, DH), (255, 255, 255)), (0, 0), hl)
    return (mx, my)


def title(img, text, sub, color=(255, 255, 255), pop=1.0):
    d = ImageDraw.Draw(img)
    x = S(430)
    room = S(W - 430 - 24)  # 오른쪽 끝까지 남는 폭 — 넘치면 글자를 줄인다
    size1 = int(64 * pop)
    f1 = font(size1, 900)
    while size1 > 24 and d.textlength(text, font=f1) > room:
        size1 -= 2
        f1 = font(size1, 900)
    size2 = 22
    f2 = font(size2, 500)
    while size2 > 12 and d.textlength(sub, font=f2) > room:
        size2 -= 1
        f2 = font(size2, 500)
    # 보라 그림자
    d.text((x + S(4), S(130) + S(5)), text, font=f1, fill=(90, 40, 170))
    d.text((x, S(130)), text, font=f1, fill=color)
    d.text((x + S(2), S(222)), sub, font=f2, fill=(200, 196, 230))
    d.rounded_rectangle([x + S(2), S(266), x + S(122), S(272)], radius=S(3), fill=(168, 85, 247))


def rays(img, cx, cy, t, color=(255, 220, 120)):
    layer = Image.new("L", (DW, DH), 0)
    ld = ImageDraw.Draw(layer)
    n = 14
    rot = t * 1.2
    R = S(260)
    for i in range(n):
        a0 = rot + i * (2 * math.pi / n)
        a1 = a0 + math.pi / n * 0.55
        ld.polygon([(cx, cy), (cx + math.cos(a0) * R, cy + math.sin(a0) * R), (cx + math.cos(a1) * R, cy + math.sin(a1) * R)], fill=int(90 * min(1, t * 2)))
    layer = layer.filter(ImageFilter.GaussianBlur(S(6)))
    img.paste(Image.new("RGB", (DW, DH), color), (0, 0), layer)


def soft_glow(img, cx, cy, r, color, alpha):
    layer = Image.new("L", (DW, DH), 0)
    ImageDraw.Draw(layer).ellipse([cx - r, cy - r, cx + r, cy + r], fill=alpha)
    layer = layer.filter(ImageFilter.GaussianBlur(r * 0.45))
    img.paste(Image.new("RGB", (DW, DH), color), (0, 0), layer)


def gem(d, cx, cy, s):
    pts_top = [(cx - s, cy - s * 0.2), (cx - s * 0.55, cy - s * 0.7), (cx + s * 0.55, cy - s * 0.7), (cx + s, cy - s * 0.2)]
    bottom = (cx, cy + s * 0.95)
    d.polygon(pts_top + [bottom], fill=(20, 18, 40))
    k = 0.86
    inner = [(cx + (x - cx) * k, cy + (y - cy) * k) for x, y in pts_top] + [(cx, cy + s * 0.95 * k)]
    d.polygon(inner, fill=(150, 210, 255))
    d.polygon([inner[0], inner[1], (cx, cy - s * 0.2 * k), inner[4]], fill=(190, 232, 255))
    d.polygon([inner[3], inner[2], (cx, cy - s * 0.2 * k), inner[4]], fill=(100, 160, 240))
    d.polygon([inner[1], inner[2], (cx, cy - s * 0.2 * k)], fill=(235, 248, 255))
    d.line([inner[0], inner[3]], fill=(70, 120, 210), width=S(3))


def grass_block(d, cx, cy, s):
    """마인크래프트 잔디 블록 (정육면체 느낌)"""
    top = [(cx, cy - s), (cx + s, cy - s * 0.5), (cx, cy), (cx - s, cy - s * 0.5)]
    left = [(cx - s, cy - s * 0.5), (cx, cy), (cx, cy + s), (cx - s, cy + s * 0.5)]
    right = [(cx + s, cy - s * 0.5), (cx, cy), (cx, cy + s), (cx + s, cy + s * 0.5)]
    for poly, col in ((top, (110, 200, 90)), (left, (150, 100, 60)), (right, (120, 78, 46))):
        d.polygon(poly, fill=col, outline=(30, 24, 20))
    d.polygon([(cx - s, cy - s * 0.5), (cx, cy), (cx, cy + s * 0.22), (cx - s, cy - s * 0.28)], fill=(90, 175, 70))
    d.polygon([(cx + s, cy - s * 0.5), (cx, cy), (cx, cy + s * 0.22), (cx + s, cy - s * 0.28)], fill=(70, 150, 56))


def coins(d, cx, cy, s, f):
    for i, (dx, dy) in enumerate([(-0.9, 0.35), (0.85, 0.4), (0, 0), (-0.35, -0.55), (0.45, -0.5)]):
        x, y = cx + dx * s, cy + dy * s + math.sin(f * 0.5 + i) * S(3)
        r = s * 0.5
        d.ellipse([x - r, y - r, x + r, y + r], fill=(120, 70, 10))
        d.ellipse([x - r + S(4), y - r + S(4), x + r - S(4), y + r - S(4)], fill=(255, 196, 50))
        d.ellipse([x - r * 0.6, y - r * 0.6, x + r * 0.6, y + r * 0.6], outline=(230, 150, 20), width=S(4))
        d.ellipse([x - r * 0.55, y - r * 0.7, x - r * 0.15, y - r * 0.35], fill=(255, 245, 190))


def confetti(d, f, seed):
    rnd = random.Random(seed)
    cols = [(255, 214, 80), (255, 110, 150), (120, 190, 255), (130, 230, 160), (200, 140, 255)]
    for i in range(46):
        x = rnd.uniform(380, 720)
        sp = rnd.uniform(4, 9)
        y = (rnd.uniform(-200, 400) + f * sp) % 460 - 40
        a = f * 0.3 + i
        w, h = S(rnd.uniform(5, 9)), S(rnd.uniform(9, 15) * abs(math.sin(a)) + 2)
        c = cols[i % len(cols)]
        d.rectangle([S(x) - w / 2, S(y) - h / 2, S(x) + w / 2, S(y) + h / 2], fill=c)


def sparkle(d, x, y, s, c=(255, 255, 240)):
    d.polygon([(x, y - s), (x + s * 0.22, y - s * 0.22), (x + s, y), (x + s * 0.22, y + s * 0.22), (x, y + s), (x - s * 0.22, y + s * 0.22), (x - s, y), (x - s * 0.22, y - s * 0.22)], fill=c)


def save(frames, path, durations):
    OW, OH = 600, 338  # 디스코드에서 충분히 선명하고 파일은 가볍게
    small = [fr.resize((OW, OH), Image.LANCZOS) for fr in frames]
    strip = Image.new("RGB", (OW, OH * 8))
    for i, k in enumerate(range(0, len(small), max(1, len(small) // 8))):
        if i < 8:
            strip.paste(small[k], (0, OH * i))
    pal = strip.quantize(colors=255, method=Image.Quantize.MEDIANCUT)
    q = [fr.quantize(palette=pal, dither=Image.Dither.FLOYDSTEINBERG) for fr in small]
    q[0].save(path, save_all=True, append_images=q[1:], duration=durations, loop=0, optimize=True, disposal=1)
    print("saved", path, os.path.getsize(path) // 1024, "KB", len(frames), "frames")


def idle(path):
    n = 36
    frames = []
    for f in range(n):
        img = background(f, n)
        machine(img, f, math.sin(f / n * math.pi * 2) * 0.35 - 0.5, 1.0)
        title(img, "랜덤뽑기", "버튼을 눌러 캡슐을 뽑아 보세요")
        d = ImageDraw.Draw(img)
        for i, (sx, sy) in enumerate([(150, 70), (360, 110), (110, 260), (650, 330)]):
            t = (math.sin(f / n * math.pi * 4 + i * 1.7) + 1) / 2
            if t > 0.3:
                sparkle(d, S(sx), S(sy), S(6 + 8 * t))
        frames.append(img)
    save(frames, path, [70] * n)


def result(path, kind):
    """kind: win (보석) · coin (잔액) · none (꽝)"""
    frames, durs = [], []
    n = 56
    for f in range(n):
        img = background(f, n)
        turn = min(1, f / 12)
        knob = -0.5 + ease_out(turn) * math.pi * 2
        mx, my = machine(img, f, knob, 1.6 if f < 14 else 0.6)
        d = ImageDraw.Draw(img)
        # 캡슐이 굴러 나와 오른쪽 가운데로
        tx, ty = S(520), S(210)
        if 12 <= f < 30:
            t = (f - 12) / 18
            sx, sy = mx - S(5), my + S(124)
            x = sx + (tx - sx) * ease_out(t)
            y = sy + (ty - sy) * ease_out(t) - math.sin(t * math.pi) * S(90)
            spin = t * 9
            capsule(d, x, y, S(40), (186, 120, 255), (250, 250, 255), angle=spin)
        elif 30 <= f < 38:
            shake = math.sin(f * 2.4) * S(6)
            capsule(d, tx + shake, ty, S(40), (186, 120, 255), (250, 250, 255), angle=0)
            if f >= 34:
                soft_glow(img, tx, ty, S(80), (255, 230, 150) if kind != "none" else (120, 120, 140), 140)
                d = ImageDraw.Draw(img)
                capsule(d, tx + shake, ty, S(40), (186, 120, 255), (250, 250, 255), angle=0)
        elif f >= 38:
            t = min(1, (f - 38) / 8)
            if kind != "none":
                rays(img, tx, ty, (f - 38) / 10, (255, 214, 120) if kind == "coin" else (170, 210, 255))
                soft_glow(img, tx, ty, S(110), (255, 220, 140) if kind == "coin" else (150, 200, 255), 170)
            else:
                soft_glow(img, tx, ty, S(70), (90, 90, 110), 120)
            d = ImageDraw.Draw(img)
            # 캡슐 반쪽이 위아래로 벌어짐
            gap = ease_out(t) * S(70)
            capsule(d, tx - S(110), ty + S(40), S(32), (186, 120, 255), (186, 120, 255), angle=-0.6 - t, open_gap=0)
            capsule(d, tx + S(110), ty + S(48), S(30), (250, 250, 255), (250, 250, 255), angle=0.4 + t, open_gap=0)
            pop = max(0.25, ease_back(min(1, (f - 38) / 9)))
            if kind == "win":
                gem(d, tx, ty - S(8), S(58) * pop)
            elif kind == "nitro":
                gem(d, tx, ty - S(8), S(58) * pop)
            elif kind == "mc":
                grass_block(d, tx, ty, S(54) * pop)
            elif kind in ("coin", "charge"):
                coins(d, tx, ty, S(62) * pop, f)
            else:
                # 연기 몇 덩이
                for i in range(5):
                    a = i / 5 * math.pi * 2
                    r = S(26 + 30 * t)
                    pr = S(18 + 10 * t)
                    gx, gy = tx + math.cos(a) * r, ty + math.sin(a) * r - S(20) * t
                    g = int(110 - 40 * t)
                    d.ellipse([gx - pr, gy - pr, gx + pr, gy + pr], fill=(g, g, g + 10))
            if kind != "none":
                confetti(d, f - 38, 11)
                for i, (sx, sy) in enumerate([(tx - S(90), ty - S(80)), (tx + S(95), ty - S(70)), (tx + S(70), ty + S(85))]):
                    if (f + i * 3) % 6 < 4:
                        sparkle(d, sx, sy, S(10 + 6 * ((f + i) % 3)))
            # 큰 글자
            label = {"win": "당첨!", "coin": "당첨!", "none": "꽝"}[kind]
            col = {"win": (170, 220, 255), "coin": (255, 214, 80), "none": (170, 170, 185)}[kind]
            fz = font(max(12, int(54 * min(1, max(0.25, pop)))), 900)
            tw = d.textlength(label, font=fz)
            d.text((tx - tw / 2 + S(4), S(40) + S(4)), label, font=fz, fill=(30, 20, 60))
            d.text((tx - tw / 2, S(40)), label, font=fz, fill=col)
        frames.append(img)
        durs.append(60 if f < n - 1 else 4000)
    save(frames, path, durs)


# ───────────── 인형뽑기 기계 ─────────────

CAB = (70, 26, 372, 392)  # 기계 바깥
GLASS = (92, 78, 350, 318)  # 유리 안쪽
RAIL_Y = 92
CHUTE_X = 132  # 배출구 위치 (유리 왼쪽 아래)
random.seed(21)
PILE = []
for i in range(26):
    x = random.uniform(186, 336)
    y = 300 - random.uniform(0, 34) - (0 if x > 220 else random.uniform(0, 10))
    PILE.append((x, y, random.choice([
        ((255, 92, 120), (255, 240, 245)), ((255, 196, 64), (255, 250, 230)), ((96, 170, 255), (240, 248, 255)),
        ((126, 224, 160), (240, 255, 246)), ((255, 140, 70), (255, 245, 235)),
    ]), random.uniform(0, 6.28)))
PILE.sort(key=lambda p: p[1])
TARGET = (268, 286)  # 집을 캡슐 (보라)


def cabinet(img, f):
    d = ImageDraw.Draw(img)
    x0, y0, x1, y1 = (S(v) for v in CAB)
    d.ellipse([x0 - S(10), y1 - S(8), x1 + S(10), y1 + S(16)], fill=(6, 6, 14))
    d.rounded_rectangle([x0, y0, x1, y1], radius=S(22), fill=(24, 16, 30))
    d.rounded_rectangle([x0 + S(6), y0 + S(6), x1 - S(6), y1 - S(6)], radius=S(18), fill=(236, 72, 132))
    d.rounded_rectangle([x0 + S(6), y0 + S(6), x1 - S(6), y0 + S(40)], radius=S(18), fill=(250, 120, 170))
    # 위 간판 전구
    for i in range(9):
        on = (i + f // 3) % 2 == 0
        cx = x0 + S(30) + i * S(30)
        d.ellipse([cx - S(6), y0 + S(16) - S(6), cx + S(6), y0 + S(16) + S(6)], fill=(255, 230, 120) if on else (150, 60, 100))
    # 유리
    gx0, gy0, gx1, gy1 = (S(v) for v in GLASS)
    d.rounded_rectangle([gx0 - S(4), gy0 - S(4), gx1 + S(4), gy1 + S(4)], radius=S(10), fill=(24, 16, 30))
    d.rounded_rectangle([gx0, gy0, gx1, gy1], radius=S(8), fill=(34, 42, 84))
    d.rectangle([gx0, gy1 - S(40), gx1, gy1], fill=(44, 54, 104))
    # 배출구 칸막이 (왼쪽 아래)
    d.rectangle([gx0, gy1 - S(56), S(CHUTE_X + 36), gy1 - S(50)], fill=(250, 210, 90))
    d.rectangle([S(CHUTE_X + 30), gy1 - S(56), S(CHUTE_X + 36), gy1], fill=(250, 210, 90))
    # 아래 받침 · 꺼내는 곳
    d.rounded_rectangle([x0 + S(26), gy1 + S(18), x0 + S(120), y1 - S(18)], radius=S(10), fill=(30, 14, 26))
    d.rounded_rectangle([x0 + S(32), gy1 + S(24), x0 + S(114), y1 - S(24)], radius=S(8), fill=(70, 30, 52))
    # 조이스틱 · 버튼
    d.rounded_rectangle([x1 - S(130), gy1 + S(22), x1 - S(30), y1 - S(22)], radius=S(10), fill=(200, 40, 100))
    jx = x1 - S(95)
    d.line([jx, gy1 + S(48), jx + S(math.sin(f * 0.4) * 6), gy1 + S(30)], fill=(40, 30, 50), width=S(6))
    d.ellipse([jx - S(10) + S(math.sin(f * 0.4) * 6), gy1 + S(20), jx + S(10) + S(math.sin(f * 0.4) * 6), gy1 + S(40)], fill=(255, 92, 120))
    d.ellipse([x1 - S(62), gy1 + S(32), x1 - S(40), gy1 + S(54)], fill=(255, 214, 80))
    # 레일
    d.rectangle([gx0 + S(6), S(RAIL_Y - 4), gx1 - S(6), S(RAIL_Y + 4)], fill=(170, 176, 200))


def pile(d, skip_target=False):
    for x, y, cols, ph in PILE:
        capsule(d, S(x), S(y), S(15), cols[0], cols[1], angle=ph)
    if not skip_target:
        capsule(d, S(TARGET[0]), S(TARGET[1]), S(17), (186, 120, 255), (250, 250, 255), angle=0.3)


def glass_shine(img):
    gx0, gy0, gx1, gy1 = (S(v) for v in GLASS)
    hl = Image.new("L", (DW, DH), 0)
    hd = ImageDraw.Draw(hl)
    hd.polygon([(gx0 + S(20), gy0), (gx0 + S(60), gy0), (gx0 + S(10), gy1), (gx0 - S(30) + S(20), gy1)], fill=36)
    hd.polygon([(gx0 + S(80), gy0), (gx0 + S(94), gy0), (gx0 + S(44), gy1), (gx0 + S(30), gy1)], fill=26)
    img.paste(Image.new("RGB", (DW, DH), (255, 255, 255)), (0, 0), hl)


def claw(d, cx, cy, open_amt):
    """cx: 가로 위치, cy: 집게 머리 높이, open_amt 0(닫힘)~1(벌어짐)"""
    X, Y = S(cx), S(cy)
    d.rectangle([X - S(14), S(RAIL_Y - 8), X + S(14), S(RAIL_Y + 8)], fill=(90, 96, 120))
    d.line([X, S(RAIL_Y + 8), X, Y - S(10)], fill=(200, 204, 220), width=S(3))
    d.rounded_rectangle([X - S(13), Y - S(14), X + S(13), Y + S(4)], radius=S(5), fill=(150, 156, 180))
    for side in (-1, 1):
        a = side * (0.25 + 0.55 * open_amt)
        mid = (X + side * S(10) + math.sin(a) * S(18), Y + math.cos(a) * S(18))
        tip = (mid[0] - side * S(8) * (1 - open_amt * 0.6), mid[1] + S(16))
        d.line([X + side * S(8), Y, mid[0], mid[1]], fill=(110, 116, 140), width=S(6))
        d.line([mid, tip], fill=(110, 116, 140), width=S(6))
        d.ellipse([tip[0] - S(4), tip[1] - S(4), tip[0] + S(4), tip[1] + S(4)], fill=(80, 86, 110))
    # 가운데 다리
    d.line([X, Y + S(4), X, Y + S(22) - S(6) * (1 - open_amt)], fill=(110, 116, 140), width=S(5))


def claw_idle(path):
    n = 40
    frames = []
    for f in range(n):
        img = background(f, n)
        cabinet(img, f)
        d = ImageDraw.Draw(img)
        pile(d)
        cx = 220 + math.sin(f / n * math.pi * 2) * 90
        cy = 150 + math.sin(f / n * math.pi * 4) * 6
        claw(d, cx, cy, 0.7)
        glass_shine(img)
        title(img, "랜덤뽑기", "눌러서 인형뽑기에 도전!")
        d = ImageDraw.Draw(img)
        for i, (sx, sy) in enumerate([(400, 90), (690, 120), (660, 330)]):
            t = (math.sin(f / n * math.pi * 4 + i * 1.7) + 1) / 2
            if t > 0.35:
                sparkle(d, S(sx), S(sy), S(6 + 8 * t))
        frames.append(img)
    save(frames, path, [70] * n)


def claw_result(path, kind):
    frames, durs = [], []
    n = 84
    tx, ty = S(548), S(214)
    for f in range(n):
        img = background(f, n)
        cabinet(img, f)
        d = ImageDraw.Draw(img)
        grabbed = 26 <= f < 52
        pile(d, skip_target=f >= 26)
        # 집게 위치
        if f < 10:
            cx, cy, op = CHUTE_X + (TARGET[0] - CHUTE_X) * ease_out(f / 10), 140, 0.9
        elif f < 22:
            cx, cy, op = TARGET[0], 140 + (TARGET[1] - 40 - 140) * ease_out((f - 10) / 12), 0.9
        elif f < 27:
            cx, cy, op = TARGET[0], TARGET[1] - 40, 0.9 - 0.8 * (f - 22) / 5
        elif f < 39:
            cx, cy, op = TARGET[0], (TARGET[1] - 40) + (140 - (TARGET[1] - 40)) * ease_out((f - 27) / 12), 0.1
        elif f < 51:
            cx, cy, op = TARGET[0] + (CHUTE_X - TARGET[0]) * ease_out((f - 39) / 12), 140, 0.1
        else:
            cx, cy, op = CHUTE_X, 140, min(0.9, 0.1 + (f - 51) * 0.2)
        if grabbed:
            sway = math.sin(f * 0.8) * 3 if f >= 39 else 0
            capsule(d, S(cx + sway), S(cy + 40), S(17), (186, 120, 255), (250, 250, 255), angle=0.3)
        elif 52 <= f < 58:
            fy = 180 + (f - 52) ** 2 * 6
            capsule(d, S(CHUTE_X), S(fy), S(17), (186, 120, 255), (250, 250, 255), angle=0.3 + f)
        claw(d, cx, cy, op)
        glass_shine(img)
        d = ImageDraw.Draw(img)
        # 꺼내는 곳에서 굴러 나와 오른쪽으로
        if 58 <= f < 66:
            t = (f - 58) / 8
            sx, sy = S(120), S(352)
            x = sx + (tx - sx) * ease_out(t)
            y = sy + (ty - sy) * ease_out(t) - math.sin(t * math.pi) * S(80)
            capsule(d, x, y, S(40), (186, 120, 255), (250, 250, 255), angle=t * 9)
        elif 66 <= f < 72:
            shake = math.sin(f * 2.4) * S(6)
            if f >= 69:
                soft_glow(img, tx, ty, S(80), (255, 230, 150) if kind != "none" else (120, 120, 140), 140)
                d = ImageDraw.Draw(img)
            capsule(d, tx + shake, ty, S(40), (186, 120, 255), (250, 250, 255), angle=0)
        elif f >= 72:
            t = min(1, (f - 72) / 7)
            if kind != "none":
                rc = {"coin": (255, 214, 120), "charge": (255, 214, 120), "nitro": (210, 150, 255), "mc": (150, 230, 140)}.get(kind, (170, 210, 255))
                rays(img, tx, ty, (f - 72) / 9, rc)
                soft_glow(img, tx, ty, S(110), rc, 170)
            else:
                soft_glow(img, tx, ty, S(70), (90, 90, 110), 120)
            d = ImageDraw.Draw(img)
            capsule(d, tx - S(110) * ease_out(t), ty + S(40), S(30), (186, 120, 255), (186, 120, 255), angle=-0.6 - t)
            capsule(d, tx + S(110) * ease_out(t), ty + S(48), S(28), (250, 250, 255), (250, 250, 255), angle=0.4 + t)
            pop = max(0.25, ease_back(min(1, (f - 72) / 8)))
            if kind == "win":
                gem(d, tx, ty - S(8), S(58) * pop)
            elif kind == "nitro":
                gem(d, tx, ty - S(8), S(58) * pop)
            elif kind == "mc":
                grass_block(d, tx, ty, S(54) * pop)
            elif kind in ("coin", "charge"):
                coins(d, tx, ty, S(62) * pop, f)
            else:
                for i in range(5):
                    a = i / 5 * math.pi * 2
                    r = S(26 + 30 * t)
                    pr = S(18 + 10 * t)
                    gx, gy = tx + math.cos(a) * r, ty + math.sin(a) * r - S(20) * t
                    g = int(110 - 40 * t)
                    d.ellipse([gx - pr, gy - pr, gx + pr, gy + pr], fill=(g, g, g + 10))
            if kind != "none":
                confetti(d, f - 72, 11)
                for i, (sx, sy) in enumerate([(tx - S(90), ty - S(80)), (tx + S(95), ty - S(70)), (tx + S(70), ty + S(85))]):
                    if (f + i * 3) % 6 < 4:
                        sparkle(d, sx, sy, S(10 + 6 * ((f + i) % 3)))
            label = "꽝" if kind == "none" else "당첨!"
            col = {"win": (170, 220, 255), "coin": (255, 214, 80), "charge": (255, 214, 80), "nitro": (220, 170, 255), "mc": (150, 230, 140), "none": (190, 190, 205)}[kind]
            fz = font(max(12, int(60 * min(1, pop))), 900)
            tw = d.textlength(label, font=fz)
            d.text((tx - tw / 2 + S(4), S(36) + S(4)), label, font=fz, fill=(30, 20, 60))
            d.text((tx - tw / 2, S(36)), label, font=fz, fill=col)
        else:
            # 오른쪽: 기다리는 동안 제목
            title(img, "랜덤뽑기", "집게가 캡슐을 집는 중…")
        frames.append(img)
        durs.append(55 if f < n - 1 else 4000)
    save(frames, path, durs)


if __name__ == "__main__":
    out = sys.argv[1] if len(sys.argv) > 1 else "."
    claw_idle(os.path.join(out, "gacha-idle-2.gif"))
    claw_result(os.path.join(out, "gacha-win.gif"), "win")
    claw_result(os.path.join(out, "gacha-coin.gif"), "coin")
    claw_result(os.path.join(out, "gacha-none.gif"), "none")
