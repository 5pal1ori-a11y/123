"""초고퀄 결과 GIF — 출석 · 도박 · 다이아 채굴 · (다른 봇) 랜덤뽑기
금액은 디스코드 메시지 글자로 보여 주므로 그림에는 넣지 않는다. 제목은 기존 픽셀 글꼴.
사용: GIF_FONT_DIR=<폴더> python3 scripts/hq/scenes.py public/brand
"""
import math
import os
import random
import sys

sys.path.insert(0, os.path.dirname(__file__))
from lib import (Canvas, S, OUT, coin, confetti, ease_back, ease_out, gem, night_bg, rays, save_gif,  # noqa: E402
                 soft_glow, sparkle, title_strip, twinkles)

out = sys.argv[1] if len(sys.argv) > 1 else "."
W, H = 600, 375


def title_center(cv, text, y, scale, color=(255, 255, 255), shadow=(44, 34, 70), pop=1.0):
    sc = max(3, int(round(scale * pop)))
    im = title_strip(text, sc, color, shadow)
    while im.width > S(W - 40) and sc > 3:
        sc -= 1
        im = title_strip(text, sc, color, shadow)
    cv.img.paste(im, (int(S(W / 2) - im.width / 2), S(y)), im)


def shadow_ellipse(cv, cx, y, w):
    cv.d.ellipse([S(cx - w), S(y - 8), S(cx + w), S(y + 8)], fill=(6, 6, 14))


# ───────── 출석: 달력 + 체크 도장 ─────────

def calendar(cv, cx, cy, s, gold):
    d = cv.d
    w, h = 170 * s, 170 * s
    x0, y0 = cx - w / 2, cy - h / 2
    d.rounded_rectangle([S(x0), S(y0), S(x0 + w), S(y0 + h)], radius=S(18 * s), fill=OUT)
    d.rounded_rectangle([S(x0 + 6 * s), S(y0 + 6 * s), S(x0 + w - 6 * s), S(y0 + h - 6 * s)], radius=S(14 * s), fill=(255, 250, 240))
    head = (255, 196, 50) if gold else (239, 68, 68)
    d.rounded_rectangle([S(x0 + 6 * s), S(y0 + 6 * s), S(x0 + w - 6 * s), S(y0 + 48 * s)], radius=S(14 * s), fill=head)
    d.rectangle([S(x0 + 6 * s), S(y0 + 30 * s), S(x0 + w - 6 * s), S(y0 + 48 * s)], fill=head)
    d.rectangle([S(x0 + 6 * s), S(y0 + 44 * s), S(x0 + w - 6 * s), S(y0 + 50 * s)], fill=tuple(int(v * 0.8) for v in head))
    for rx in (x0 + 44 * s, x0 + w - 44 * s):
        d.rounded_rectangle([S(rx - 7 * s), S(y0 - 14 * s), S(rx + 7 * s), S(y0 + 18 * s)], radius=S(6 * s), fill=OUT)
        d.rounded_rectangle([S(rx - 4 * s), S(y0 - 11 * s), S(rx + 4 * s), S(y0 + 15 * s)], radius=S(4 * s), fill=(200, 204, 220))
    for r in range(4):
        for c in range(5):
            gx = x0 + 22 * s + c * 26 * s
            gy = y0 + 62 * s + r * 24 * s
            col = (255, 220, 160) if gold and (r * 5 + c) % 3 == 0 else (226, 222, 214)
            d.rounded_rectangle([S(gx), S(gy), S(gx + 18 * s), S(gy + 16 * s)], radius=S(4 * s), fill=col)


def stamp(cv, cx, cy, s, rot=0.0):
    d = cv.d
    r = 46 * s
    d.ellipse([S(cx - r - 5), S(cy - r - 5), S(cx + r + 5), S(cy + r + 5)], fill=OUT)
    d.ellipse([S(cx - r), S(cy - r), S(cx + r), S(cy + r)], fill=(34, 197, 94))
    d.ellipse([S(cx - r * 0.8), S(cy - r * 0.85), S(cx + r * 0.4), S(cy - r * 0.2)], fill=(74, 222, 128))
    pts = [(-0.45, 0.02), (-0.12, 0.34), (0.5, -0.32)]
    P = [(S(cx + (x * math.cos(rot) - y * math.sin(rot)) * r), S(cy + (x * math.sin(rot) + y * math.cos(rot)) * r)) for x, y in pts]
    d.line(P, fill=OUT, width=S(16 * s), joint="curve")
    d.line(P, fill=(255, 255, 255), width=S(10 * s), joint="curve")


def checkin(path, jackpot):
    n = 52
    frames = []
    for f in range(n):
        cv = Canvas(W, H)
        night_bg(cv, f, n, seed=7)
        cx, cy = 300, 220
        soft_glow(cv, cx, cy, 150, (255, 200, 80) if jackpot else (120, 60, 220), 90)
        if f >= 22 and jackpot:
            rays(cv, cx, cy, (f - 22) / 14, (255, 214, 120), reach=330)
        rise = (1 - ease_out(f / 10)) * 40
        shadow_ellipse(cv, cx, 318, 100)
        calendar(cv, cx, cy + rise, 1.0, jackpot)
        if f >= 10:
            t = min(1, (f - 10) / 8)
            drop = (1 - ease_out(t)) * -260
            sq = 1.0 + (0.12 if 18 <= f <= 19 else 0)
            stamp(cv, cx + 60, cy + 40 + drop, sq, rot=-0.15)
            if 18 <= f <= 22:
                for i in range(6):
                    a = i / 6 * math.pi * 2
                    k = (f - 18) / 4
                    sparkle(cv, cx + 60 + math.cos(a) * 70 * k, cy + 40 + math.sin(a) * 70 * k, 9)
        if f >= 20:
            pop = ease_back((f - 20) / 8)
            title_center(cv, "잭팟!" if jackpot else "출석 완료!", 26, 9, color=(255, 220, 90) if jackpot else (255, 255, 255), pop=max(0.3, pop))
            for i in range(4):
                coin(cv, 90 + i * 140 + math.sin(f * 0.2 + i) * 10, ((f - 20) * 9 + i * 70) % 420 - 40, 14, spin=f * 0.4 + i)
        if jackpot and f >= 20:
            confetti(cv, f - 20, 3, 0, W, y_range=H, count=50)
        twinkles(cv, f, n, [(70, 80), (540, 90), (520, 320)])
        frames.append(cv.img)
    save_gif(frames, path, [60] * (n - 1) + [4000], (W, H))


# ───────── 도박: 슬롯머신 ─────────

SYMS = ["7", "cherry", "bell", "gem"]


def draw_symbol(cv, sym, cx, cy, s, dim=False):
    d = cv.d
    if sym == "7":
        from lib import pixel_text_img
        g = pixel_text_img("7", (120, 120, 130) if dim else (239, 68, 68), int(5 * s), (60, 20, 30))
        cv.img.paste(g, (int(S(cx) - g.width / 2), int(S(cy) - g.height / 2)), g)
    elif sym == "cherry":
        c = (120, 120, 130) if dim else (239, 68, 68)
        d.line([S(cx - 10 * s), S(cy + 6 * s), S(cx), S(cy - 18 * s), S(cx + 10 * s), S(cy + 6 * s)], fill=(60, 140, 60), width=S(4 * s))
        for dx in (-12, 12):
            d.ellipse([S(cx + dx * s - 11 * s), S(cy + 2 * s), S(cx + dx * s + 11 * s), S(cy + 24 * s)], fill=OUT)
            d.ellipse([S(cx + dx * s - 8 * s), S(cy + 5 * s), S(cx + dx * s + 8 * s), S(cy + 21 * s)], fill=c)
    elif sym == "bell":
        c = (120, 120, 130) if dim else (255, 200, 50)
        d.pieslice([S(cx - 20 * s), S(cy - 22 * s), S(cx + 20 * s), S(cy + 18 * s)], 180, 360, fill=c, outline=OUT, width=S(3))
        d.rectangle([S(cx - 20 * s), S(cy - 2 * s), S(cx + 20 * s), S(cy + 10 * s)], fill=c, outline=OUT, width=S(3))
        d.ellipse([S(cx - 6 * s), S(cy + 8 * s), S(cx + 6 * s), S(cy + 20 * s)], fill=OUT)
    else:
        gem(cv, cx, cy, 20 * s)


def slot(path, win):
    n = 60
    frames = []
    result = ["7", "7", "7"] if win else ["7", "7", "cherry"]
    stops = [22, 28, 34]
    for f in range(n):
        cv = Canvas(W, H)
        night_bg(cv, f, n, seed=9)
        done = f >= 36
        cx, cy = 300, 215
        soft_glow(cv, cx, cy, 170, (255, 200, 80) if (win and done) else (120, 60, 220), 90)
        if win and done:
            rays(cv, cx, cy, (f - 36) / 12, (255, 214, 120), reach=340)
        shake = math.sin(f * 3) * 5 if (not win and 36 <= f < 44) else 0
        d = cv.d
        x0, y0, x1, y1 = cx - 170 + shake, cy - 105, cx + 170 + shake, cy + 115
        shadow_ellipse(cv, cx, y1 + 18, 170)
        d.rounded_rectangle([S(x0), S(y0), S(x1), S(y1)], radius=S(26), fill=OUT)
        d.rounded_rectangle([S(x0 + 7), S(y0 + 7), S(x1 - 7), S(y1 - 7)], radius=S(21), fill=(124, 58, 237))
        d.rounded_rectangle([S(x0 + 7), S(y0 + 7), S(x1 - 7), S(y0 + 46)], radius=S(21), fill=(167, 139, 250))
        d.rectangle([S(x0 + 7), S(y1 - 40), S(x1 - 7), S(y1 - 7)], fill=(91, 33, 182))
        for i in range(11):
            on = ((i + f // 2) % 2 == 0) or (win and done and f % 4 < 2)
            bx = x0 + 28 + i * 28.5
            d.ellipse([S(bx - 6), S(y0 + 20), S(bx + 6), S(y0 + 32)], fill=(255, 236, 140) if on else (110, 60, 160))
        # 레버
        d.rounded_rectangle([S(x1 - 2), S(cy - 30), S(x1 + 14), S(cy + 40)], radius=S(6), fill=(60, 60, 80))
        lever = -60 + (min(1, f / 6) * 90 if f < 12 else 30)
        d.line([S(x1 + 6), S(cy), S(x1 + 6 + 30 * math.sin(math.radians(lever))), S(cy - 70 * math.cos(math.radians(lever)))], fill=(200, 204, 220), width=S(7))
        kx, ky = x1 + 6 + 30 * math.sin(math.radians(lever)), cy - 70 * math.cos(math.radians(lever))
        d.ellipse([S(kx - 14), S(ky - 14), S(kx + 14), S(ky + 14)], fill=OUT)
        d.ellipse([S(kx - 10), S(ky - 10), S(kx + 10), S(ky + 10)], fill=(239, 68, 68))
        # 릴
        for r in range(3):
            rx = x0 + 34 + r * 96
            rw, rt, rb = 80, y0 + 62, y0 + 168
            d.rounded_rectangle([S(rx - 4), S(rt - 4), S(rx + rw + 4), S(rb + 4)], radius=S(12), fill=OUT)
            d.rounded_rectangle([S(rx), S(rt), S(rx + rw), S(rb)], radius=S(9), fill=(250, 250, 255))
            mid = (rt + rb) / 2
            if f < stops[r]:
                off = (f * 26 + r * 30) % 64
                for k in range(-1, 3):
                    sy = rt + off + (k - 1) * 64
                    if rt + 8 < sy < rb - 8:
                        draw_symbol(cv, SYMS[(f // 2 + r + k) % 4], rx + rw / 2, sy, 0.9)
                d.rectangle([S(rx), S(rt), S(rx + rw), S(rt + 14)], fill=(226, 226, 236))
                d.rectangle([S(rx), S(rb - 14), S(rx + rw), S(rb)], fill=(226, 226, 236))
            else:
                bounce = 4 if f == stops[r] else 0
                draw_symbol(cv, result[r], rx + rw / 2, mid + bounce, 1.1, dim=(not win and done and r == 2))
        if done:
            pop = ease_back((f - 36) / 8)
            title_center(cv, "승리!" if win else "아쉬워요", 20, 9, color=(255, 220, 90) if win else (200, 200, 215), pop=max(0.3, pop))
            if win:
                for i in range(8):
                    a = i / 8 * math.pi * 2 + 0.3
                    t = min(1, (f - 36) / 14)
                    coin(cv, cx + math.cos(a) * 230 * t, cy + math.sin(a) * 150 * t + t * t * 60, 14, spin=f * 0.5 + i)
            else:
                for i in range(3):
                    t = (f - 36) / 20
                    pr = 14 + 18 * t
                    gx, gy = cx + 120 + i * 20, y0 - 10 - t * 60 - i * 10
                    g = int(120 - 50 * t)
                    d.ellipse([S(gx - pr), S(gy - pr), S(gx + pr), S(gy + pr)], fill=(g, g, g + 10))
        twinkles(cv, f, n, [(60, 70), (550, 60), (40, 320)])
        frames.append(cv.img)
    save_gif(frames, path, [55] * (n - 1) + [4000], (W, H))


# ───────── 다이아 채굴 ─────────

def ore_block(cv, cx, cy, s, crack=0, shake=0.0):
    d = cv.d
    w = 150 * s
    x0, y0 = cx - w / 2 + shake, cy - w / 2
    d.rounded_rectangle([S(x0 - 5), S(y0 - 5), S(x0 + w + 5), S(y0 + w + 5)], radius=S(10), fill=OUT)
    rnd = random.Random(4)
    cell = w / 6
    for r in range(6):
        for c in range(6):
            v = rnd.choice([(150, 156, 172), (128, 134, 150), (170, 176, 190), (140, 146, 160)])
            d.rectangle([S(x0 + c * cell), S(y0 + r * cell), S(x0 + (c + 1) * cell), S(y0 + (r + 1) * cell)], fill=v)
    for gx, gy in ((0.2, 0.25), (0.65, 0.18), (0.45, 0.55), (0.78, 0.66), (0.22, 0.75)):
        gem(cv, x0 + gx * w, y0 + gy * w, 13 * s)
    lines = [[(0.5, 0), (0.55, 0.2), (0.45, 0.38), (0.55, 0.55)], [(0.55, 0.55), (0.72, 0.65), (0.68, 0.85), (0.8, 1)], [(0.45, 0.38), (0.25, 0.5), (0.15, 0.7), (0, 0.78)]]
    for i in range(min(crack, 3)):
        pts = [(S(x0 + x * w), S(y0 + y * w)) for x, y in lines[i]]
        d.line(pts, fill=OUT, width=S(5), joint="curve")


def pickaxe(cv, px, py, ang, s):
    d = cv.d
    L = 150 * s
    hx, hy = px + math.cos(ang) * L, py + math.sin(ang) * L
    d.line([S(px), S(py), S(hx), S(hy)], fill=OUT, width=S(16 * s))
    d.line([S(px), S(py), S(hx), S(hy)], fill=(160, 104, 52), width=S(10 * s))
    perp = ang + math.pi / 2
    pts = []
    for k in range(-10, 11):
        t = k / 10
        bend = (1 - t * t) * 18 * s
        pts.append((hx + math.cos(perp) * t * 62 * s + math.cos(ang) * bend, hy + math.sin(perp) * t * 62 * s + math.sin(ang) * bend))
    d.line([(S(x), S(y)) for x, y in pts], fill=OUT, width=S(20 * s), joint="curve")
    d.line([(S(x), S(y)) for x, y in pts], fill=(120, 190, 255), width=S(13 * s), joint="curve")
    d.line([(S(x), S(y)) for x, y in pts[3:9]], fill=(200, 232, 255), width=S(5 * s))


def mine(path, kind):
    """kind: idle · win · none"""
    n = 40 if kind == "idle" else 70
    frames = []
    cx, cy = 240, 225
    for f in range(n):
        cv = Canvas(W, H)
        night_bg(cv, f, n, seed=13)
        soft_glow(cv, cx, cy, 160, (90, 140, 255), 80)
        d = cv.d
        d.rectangle([0, S(310), S(W), S(H)], fill=(24, 22, 40))
        d.rectangle([0, S(306), S(W), S(312)], fill=(46, 42, 72))
        if kind == "idle":
            ph = (f % 20) / 20
            ang = -2.6 + (math.sin(ph * math.pi * 2) + 1) / 2 * 1.1
            ore_block(cv, cx, cy, 1.0, 0, shake=(3 if 0.45 < ph < 0.55 else 0))
            pickaxe(cv, cx + 200, cy + 80, ang, 0.95)
            if 0.45 < ph < 0.6:
                for i in range(6):
                    sparkle(cv, cx + 60 + i * 8, cy - 70 + (i % 3) * 14, 7)
            from lib import wave_title
            wave_title(cv, "다이아 캐기", 340, 40, f, n, 240, scale=5, amp=2)
        else:
            hit_phase = min(f, 35)
            hits = hit_phase // 12
            ph = (hit_phase % 12) / 12
            if f < 36:
                ang = -2.6 + (1 - abs(math.sin(ph * math.pi))) * 1.1
                hitting = 0.4 < ph < 0.6
                ore_block(cv, cx, cy, 1.0, hits + (1 if hitting else 0), shake=(5 if hitting else 0))
                pickaxe(cv, cx + 200, cy + 80, ang, 0.95)
                if hitting:
                    for i in range(8):
                        a = -math.pi * (0.2 + i * 0.08)
                        sparkle(cv, cx + 60 + math.cos(a) * 40, cy - 40 + math.sin(a) * 40, 8)
            elif f < 44:
                t = (f - 36) / 8
                rnd = random.Random(7)
                for i in range(18):
                    a = rnd.uniform(-math.pi, 0)
                    sp = rnd.uniform(80, 200)
                    x = cx + math.cos(a) * sp * t
                    y = cy + math.sin(a) * sp * t + t * t * 160
                    sz = rnd.uniform(8, 18) * (1 - t * 0.5)
                    d.rectangle([S(x - sz), S(y - sz), S(x + sz), S(y + sz)], fill=rnd.choice([(150, 156, 172), (128, 134, 150), (100, 170, 255)]))
            else:
                t = (f - 44) / 10
                pop = max(0.3, ease_back(t))
                d.rectangle([S(cx - 70), S(298), S(cx + 70), S(310)], fill=(128, 134, 150))
                if kind == "win":
                    rays(cv, cx, cy - 10, (f - 44) / 12, (140, 200, 255), reach=320)
                    soft_glow(cv, cx, cy - 10, 120, (150, 210, 255), 160)
                    gem(cv, cx, cy - 20 + math.sin(f * 0.3) * 6, 70 * pop)
                    confetti(cv, f - 44, 21, 0, W, y_range=H, count=40)
                    title_center(cv, "다이아 획득!", 22, 7, color=(170, 225, 255), pop=pop)
                else:
                    for i in range(5):
                        a = i / 5 * math.pi * 2
                        r = 26 + 30 * min(1, t)
                        pr = 18 + 10 * min(1, t)
                        gx, gy = cx + math.cos(a) * r, cy + math.sin(a) * r - 20 * min(1, t)
                        g = int(110 - 40 * min(1, t))
                        d.ellipse([S(gx - pr), S(gy - pr), S(gx + pr), S(gy + pr)], fill=(g, g, g + 10))
                    title_center(cv, "꽝", 30, 10, color=(200, 200, 215), pop=pop)
        twinkles(cv, f, n, [(60, 70), (560, 80), (540, 280)])
        frames.append(cv.img)
    durs = [70] * n if kind == "idle" else [55] * (n - 1) + [4000]
    save_gif(frames, path, durs, (W, H))


checkin(os.path.join(out, "hq-checkin.gif"), False)
checkin(os.path.join(out, "hq-checkin-jackpot.gif"), True)
slot(os.path.join(out, "hq-gamble-win.gif"), True)
slot(os.path.join(out, "hq-gamble-lose.gif"), False)
mine(os.path.join(out, "hq-mine-idle.gif"), "idle")
mine(os.path.join(out, "hq-mine-win.gif"), "win")
mine(os.path.join(out, "hq-mine-none.gif"), "none")

# 다른 봇 랜덤뽑기(니트로 · 계정 · 충전 · 꽝): 인형뽑기 연출을 그대로 쓴다
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
import importlib.util  # noqa: E402

spec = importlib.util.spec_from_file_location("gacha", os.path.join(os.path.dirname(__file__), "..", "make-gacha-gifs.py"))
gacha = importlib.util.module_from_spec(spec)
spec.loader.exec_module(gacha)
for k in ("nitro", "mc", "charge", "none"):
    gacha.claw_result(os.path.join(out, f"hq-raffle-{k}.gif"), k)
