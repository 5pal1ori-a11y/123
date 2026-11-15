"""초고퀄 배너 GIF — 기존 레이아웃 · 글꼴 유지 (제목 픽셀 · 설명 Noto)
사용: GIF_FONT_DIR=<폴더> python3 scripts/hq/banners.py public/brand
"""
import math
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
from lib import (Canvas, S, capsule, coin, confetti, ease_out, gem, gift, night_bg, ring_glow, save_gif,  # noqa: E402
                 soft_glow, sparkle, sub_text, twinkles, underline, wave_title, OUT)
from PIL import ImageDraw  # noqa: E402

out = sys.argv[1] if len(sys.argv) > 1 else "."
N = 40


def envelope(cv, cx, cy, s, f):
    d = cv.d
    w, h = 150 * s, 100 * s
    x0, y0 = cx - w / 2, cy - h / 2
    d.rounded_rectangle([S(x0), S(y0), S(x0 + w), S(y0 + h)], radius=S(12 * s), fill=OUT)
    d.rounded_rectangle([S(x0 + 5 * s), S(y0 + 5 * s), S(x0 + w - 5 * s), S(y0 + h - 5 * s)], radius=S(9 * s), fill=(248, 246, 255))
    d.polygon([(S(x0 + 6 * s), S(y0 + h - 8 * s)), (S(cx), S(cy + 6 * s)), (S(x0 + w - 6 * s), S(y0 + h - 8 * s))], fill=(226, 224, 240))
    d.line([(S(x0 + 8 * s), S(y0 + 8 * s)), (S(cx), S(cy + 8 * s)), (S(x0 + w - 8 * s), S(y0 + 8 * s))], fill=OUT, width=S(5 * s))
    on = (f // 5) % 2 == 0
    bx, by = x0 + w - 6 * s, y0 + 4 * s
    d.ellipse([S(bx - 22 * s), S(by - 22 * s), S(bx + 22 * s), S(by + 22 * s)], fill=OUT)
    d.ellipse([S(bx - 17 * s), S(by - 17 * s), S(bx + 17 * s), S(by + 17 * s)], fill=(255, 96, 110) if on else (232, 64, 84))
    d.rounded_rectangle([S(bx - 3 * s), S(by - 10 * s), S(bx + 3 * s), S(by + 3 * s)], radius=S(2), fill=(255, 255, 255))
    d.ellipse([S(bx - 3 * s), S(by + 6 * s), S(bx + 3 * s), S(by + 12 * s)], fill=(255, 255, 255))


def bag(cv, cx, cy, s):
    d = cv.d
    w, h = 120 * s, 110 * s
    x0, y0 = cx - w / 2, cy - h / 2 + 10 * s
    d.arc([S(cx - 30 * s), S(y0 - 40 * s), S(cx + 30 * s), S(y0 + 20 * s)], 180, 360, fill=OUT, width=S(9 * s))
    d.rounded_rectangle([S(x0), S(y0), S(x0 + w), S(y0 + h)], radius=S(16 * s), fill=OUT)
    d.rounded_rectangle([S(x0 + 5 * s), S(y0 + 5 * s), S(x0 + w - 5 * s), S(y0 + h - 5 * s)], radius=S(13 * s), fill=(244, 114, 182))
    d.rectangle([S(x0 + w * 0.62), S(y0 + 5 * s), S(x0 + w - 5 * s), S(y0 + h - 5 * s)], fill=(200, 62, 140))
    d.rectangle([S(x0 + 12 * s), S(y0 + 14 * s), S(x0 + 22 * s), S(y0 + 60 * s)], fill=(255, 190, 225))
    d.ellipse([S(cx - 14 * s), S(cy + 2 * s), S(cx + 14 * s), S(cy + 30 * s)], fill=OUT)
    d.ellipse([S(cx - 9 * s), S(cy + 7 * s), S(cx + 9 * s), S(cy + 25 * s)], fill=(255, 214, 80))


def heart(cv, cx, cy, s):
    d = cv.d
    pts = []
    for i in range(80):
        t = i / 80 * math.pi * 2
        x = 16 * math.sin(t) ** 3
        y = -(13 * math.cos(t) - 5 * math.cos(2 * t) - 2 * math.cos(3 * t) - math.cos(4 * t))
        pts.append((x, y))
    P = lambda k, dx=0, dy=0: [(S(cx + x * s * k + dx), S(cy + y * s * k + dy)) for x, y in pts]
    d.polygon(P(1.08), fill=OUT)
    d.polygon(P(1.0), fill=(244, 63, 94))
    d.polygon(P(0.62, 3 * s, 4 * s), fill=(214, 40, 76))
    d.ellipse([S(cx - 11 * s), S(cy - 8 * s), S(cx - 3 * s), S(cy - 1 * s)], fill=(255, 200, 210))


def crown(cv, cx, cy, s):
    d = cv.d
    w = 120 * s
    pts = [(cx - w / 2, cy + 30 * s), (cx - w / 2, cy - 22 * s), (cx - w / 4, cy + 4 * s), (cx, cy - 34 * s), (cx + w / 4, cy + 4 * s), (cx + w / 2, cy - 22 * s), (cx + w / 2, cy + 30 * s)]
    d.polygon([(S(x), S(y)) for x, y in pts], fill=OUT)
    inner = [(cx + (x - cx) * 0.88, cy + 3 * s + (y - cy) * 0.82) for x, y in pts]
    d.polygon([(S(x), S(y)) for x, y in inner], fill=(255, 205, 64))
    d.rectangle([S(cx - w / 2 + 6 * s), S(cy + 16 * s), S(cx + w / 2 - 6 * s), S(cy + 26 * s)], fill=(226, 160, 30))
    for gx, col in ((cx - w / 4, (96, 170, 255)), (cx, (244, 63, 94)), (cx + w / 4, (126, 224, 160))):
        d.ellipse([S(gx - 8 * s), S(cy + 2 * s), S(gx + 8 * s), S(cy + 18 * s)], fill=col)
    for px in (cx - w / 2, cx, cx + w / 2):
        py = cy - (34 if px == cx else 22) * s
        d.ellipse([S(px - 8 * s), S(py - 8 * s), S(px + 8 * s), S(py + 8 * s)], fill=(255, 236, 150))


def number_tile(cv, f, cx, cy, s, final="?"):
    d = cv.d
    w, h = 130 * s, 150 * s
    x0, y0 = cx - w / 2, cy - h / 2 + math.sin(f / N * math.pi * 2) * 4
    d.rounded_rectangle([S(x0), S(y0), S(x0 + w), S(y0 + h)], radius=S(16 * s), fill=OUT)
    d.rounded_rectangle([S(x0 + 6 * s), S(y0 + 6 * s), S(x0 + w - 6 * s), S(y0 + h - 6 * s)], radius=S(12 * s), fill=(96, 165, 250))
    d.rounded_rectangle([S(x0 + 6 * s), S(y0 + 6 * s), S(x0 + w - 6 * s), S(y0 + 28 * s)], radius=S(12 * s), fill=(191, 219, 254))
    d.rectangle([S(x0 + 6 * s), S(y0 + h - 34 * s), S(x0 + w - 6 * s), S(y0 + h - 6 * s)], fill=(37, 99, 235))
    wx0, wy0, wx1, wy1 = x0 + 22 * s, y0 + 30 * s, x0 + w - 22 * s, y0 + h - 40 * s
    d.rounded_rectangle([S(wx0 - 4 * s), S(wy0 - 4 * s), S(wx1 + 4 * s), S(wy1 + 4 * s)], radius=S(8 * s), fill=(30, 58, 138))
    d.rounded_rectangle([S(wx0), S(wy0), S(wx1), S(wy1)], radius=S(6 * s), fill=(255, 255, 255))
    from lib import pixel_text_img
    ch = str((f * 3) % 10) if f < 22 else final
    g = pixel_text_img(ch, (24, 24, 32), 5, (220, 220, 232))
    cv.img.paste(g, (int(S((wx0 + wx1) / 2) - g.width / 2), int(S((wy0 + wy1) / 2) - g.height / 2)), g)


def banner(path, w, h, icon, title, sub, glow_color=(120, 60, 220), line=((168, 85, 247), (126, 34, 206)), n=N, tx=None, ty=None, sy=None, scale=10):
    frames = []
    icx, icy = (112, h / 2) if h < 250 else (150, 150)
    tx = tx or (232 if h < 250 else 292)
    ty = ty or (24 if h < 250 else 60)
    sy = sy or (100 if h < 250 else 180)
    for f in range(n):
        cv = Canvas(w, h)
        night_bg(cv, f, n, stars=50 if h < 250 else 70)
        ring_glow(cv, icx, icy, f, n, r1=(86 if h < 250 else 112), r2=(64 if h < 250 else 84))
        soft_glow(cv, icx, icy, (70 if h < 250 else 95), glow_color, 90)
        icon(cv, f, icx, icy, 0.62 if h < 250 else 0.9)
        wave_title(cv, title, tx, ty, f, n, w - tx - 30, scale=(6 if h < 250 else scale))
        sub_text(cv, sub, tx + 2, sy, size=(25 if h < 250 else 29), max_w=w - tx - 30)
        underline(cv, tx + 2, sy + (46 if h < 250 else 52), f, *line)
        twinkles(cv, f, n, [(icx - 70, icy - 60), (icx + 80, icy - 50), (w - 40, h - 40), (tx + 520, 30)])
        frames.append(cv.img)
    save_gif(frames, path, [70] * (n - 1) + [900], (w, h))


def icon_gift(cv, f, cx, cy, s):
    hop = abs(math.sin((f / N) * 2 * math.pi)) * 10
    gift(cv, cx, cy + 60 * s - hop, s=s * 0.9, lid_lift=hop * 0.6)
    coin(cv, cx - 70 * s, cy - 60 * s + math.sin(f / 5) * 3, 12 * s, spin=f * 0.3)
    coin(cv, cx + 74 * s, cy - 72 * s, 10 * s, spin=f * 0.3 + 1)


def icon_gift_open(cv, f, cx, cy, s):
    gift(cv, cx, cy + 60 * s, s=s * 0.9, lid_lift=40 * s + math.sin(f / 4) * 6)
    soft_glow(cv, cx, cy - 10 * s, 50 * s, (255, 220, 140), 120)
    confetti(cv, f, 5, cx - 120 * s, cx + 120 * s, y_range=int(cy + 120 * s), count=26)


def icon_mail(cv, f, cx, cy, s):
    envelope(cv, cx, cy + math.sin(f / N * math.pi * 2) * 5, s, f)


def icon_bag(cv, f, cx, cy, s):
    bag(cv, cx, cy + math.sin(f / N * math.pi * 2) * 5, s)
    coin(cv, cx - 76 * s, cy - 50 * s, 11 * s, spin=f * 0.3)
    coin(cv, cx + 80 * s, cy + 40 * s, 10 * s, spin=f * 0.3 + 2)


def icon_heart(cv, f, cx, cy, s):
    beat = 1.0 + (0.08 if (f % 12) in (0, 1, 4) else 0)
    heart(cv, cx, cy, 4.2 * s * beat)


def icon_tile(cv, f, cx, cy, s):
    number_tile(cv, f, cx, cy, s)


def icon_crown(cv, f, cx, cy, s):
    crown(cv, cx, cy + math.sin(f / N * math.pi * 4) * 5, s)
    confetti(cv, f, 9, cx - 130, cx + 130, y_range=300, count=26)


# 기존 배너 크기 · 글자 그대로 (파일 이름만 -hq 로 바꿔 디스코드가 새 그림을 받게)
banner(os.path.join(out, "giveaway-hq.gif"), 960, 190, icon_gift, "경품 추첨", "버튼 한 번으로 참여하세요 · 마감 시 자동 추첨")
banner(os.path.join(out, "giveaway-end-hq.gif"), 960, 190, icon_gift_open, "당첨 발표!", "당첨자를 축하드려요 · 주최자에게 문의해 주세요")
banner(os.path.join(out, "stock-request-hq.gif"), 960, 190, icon_mail, "재고 요청", "찾는 상품이 없으면 버튼 한 번으로 남겨 주세요")
banner(os.path.join(out, "purchase-hq.gif"), 960, 190, icon_bag, "주문 완료!", "DOES 를 이용해 주셔서 감사해요")
banner(os.path.join(out, "number-guess-hq.gif"), 960, 300, icon_tile, "숫자 맞추기", "가장 먼저 맞힌 1명에게 상품", line=((34, 197, 94), (21, 128, 61)))
banner(os.path.join(out, "number-guess-win-hq.gif"), 960, 300, icon_crown, "정답!", "가장 먼저 맞혔어요 · 축하합니다", line=((34, 197, 94), (21, 128, 61)))
banner(os.path.join(out, "welcome-hq.gif"), 960, 300, icon_heart, "환영합니다!", "DOES 에 오신 걸 환영해요", line=((34, 197, 94), (21, 128, 61)), glow_color=(220, 60, 110))


# 재고 요청 정사각 썸네일
def square_icon(path):
    frames = []
    for f in range(N):
        cv = Canvas(200, 200)
        night_bg(cv, f, N, stars=16)
        ring_glow(cv, 100, 100, f, N, r1=92, r2=70)
        soft_glow(cv, 100, 100, 60, (120, 60, 220), 90)
        icon_mail(cv, f, 100, 104, 0.82)
        twinkles(cv, f, N, [(36, 40), (166, 52), (160, 166)])
        frames.append(cv.img)
    save_gif(frames, path, [70] * N, (200, 200))


square_icon(os.path.join(out, "stock-request-icon-hq.gif"))
