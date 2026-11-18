"""사이트 링크 카드용 DOES 배너 GIF (960x400, 2x 렌더 후 축소로 안티앨리어싱)."""
import math, random, sys
from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = sys.argv[1] if len(sys.argv) > 1 else "."
OUT = sys.argv[2] if len(sys.argv) > 2 else f"{ROOT}/public/brand/does-link-v2.gif"
W, H, S = 960, 400, 2
FR = 24
FONT = f"{ROOT}/public/fonts/Pretendard-%s.otf"
f = lambda w, sz: ImageFont.truetype(FONT % w, sz * S)
LOGO = Image.open(f"{ROOT}/public/emoji/does_logo.png").convert("RGBA")

def lerp(a, b, t): return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(len(a)))

def background(t):
    img = Image.new("RGB", (W * S, H * S))
    px = img.load()
    top, bot = (9, 12, 28), (4, 6, 16)
    base = Image.new("RGB", (W * S, H * S))
    d0 = ImageDraw.Draw(base)
    for y in range(H * S):
        d0.line([(0, y), (W * S, y)], fill=lerp(top, bot, y / (H * S)))
    img = base
    glow = Image.new("RGB", img.size, (0, 0, 0))
    g = ImageDraw.Draw(glow)
    ox = math.sin(t * math.tau) * 30
    g.ellipse([-200 * S + ox * S, -160 * S, 420 * S + ox * S, 300 * S], fill=(60, 56, 150))
    g.ellipse([620 * S - ox * S, 140 * S, 1140 * S - ox * S, 520 * S], fill=(14, 96, 130))
    glow = glow.filter(ImageFilter.GaussianBlur(120 * S))
    from PIL import ImageChops
    glow = glow.point(lambda v: int(v * 0.42))
    img = ImageChops.add(img, glow, scale=1.0, offset=0)
    # 격자
    grid = Image.new("RGBA", img.size, (0, 0, 0, 0))
    gd = ImageDraw.Draw(grid)
    for x in range(0, W * S, 48 * S):
        gd.line([(x, 0), (x, H * S)], fill=(120, 130, 255, 14), width=S)
    for y in range(0, H * S, 48 * S):
        gd.line([(0, y), (W * S, y)], fill=(120, 130, 255, 14), width=S)
    img = Image.alpha_composite(img.convert("RGBA"), grid)
    # 별
    rnd = random.Random(7)
    sd = ImageDraw.Draw(img)
    for i in range(70):
        x, y = rnd.randint(0, W * S), rnd.randint(0, H * S)
        tw = 0.5 + 0.5 * math.sin(t * math.tau + i)
        r = (1 + rnd.random() * 1.6) * S
        c = (200, 220, 255, int(60 + 150 * tw))
        sd.ellipse([x - r, y - r, x + r, y + r], fill=c)
    return img.convert("RGB")

def gem(draw, cx, cy, s, col):
    pts = [(cx, cy - s), (cx + s * 0.8, cy - s * 0.2), (cx, cy + s), (cx - s * 0.8, cy - s * 0.2)]
    draw.polygon(pts, fill=col)
    draw.polygon([(cx, cy - s), (cx + s * 0.8, cy - s * 0.2), (cx, cy - s * 0.2)], fill=tuple(min(255, c + 60) for c in col))

def text_glow(base, xy, txt, font, fill, glow_col, blur, anchor="la"):
    layer = Image.new("RGBA", base.size, (0, 0, 0, 0))
    ImageDraw.Draw(layer).text(xy, txt, font=font, fill=glow_col, anchor=anchor)
    layer = layer.filter(ImageFilter.GaussianBlur(blur * S))
    base.alpha_composite(layer)
    ImageDraw.Draw(base).text(xy, txt, font=font, fill=fill, anchor=anchor)

def frame(i):
    t = i / FR
    base = background(t).convert("RGBA")
    # 로고 글로우 맥박
    pulse = 0.5 + 0.5 * math.sin(t * math.tau)
    lg = Image.new("RGBA", base.size, (0, 0, 0, 0))
    ImageDraw.Draw(lg).ellipse([(130 - 90) * S, (150 - 90) * S, (130 + 90) * S, (150 + 90) * S], fill=(99, 102, 241, int(120 + 90 * pulse)))
    base.alpha_composite(lg.filter(ImageFilter.GaussianBlur(40 * S)))
    logo = LOGO.resize((int(120 * S), int(120 * S)), Image.LANCZOS)
    by = int((150 - 60 + math.sin(t * math.tau) * 5) * S)
    base.alpha_composite(logo, (int(70 * S), by))

    d = ImageDraw.Draw(base)
    # 타이틀 DOES (글로우 + 시머)
    tf = f("Black", 150)
    text_glow(base, (230 * S, 100 * S), "DOES", tf, (255, 255, 255, 255), (99, 102, 241, 170), 18)
    # 시머: 흰 띠가 지나가며 글자를 밝힘
    sx = int((-200 + (t * 1.3) * 1000) * S)
    band = Image.new("RGBA", base.size, (0, 0, 0, 0))
    ImageDraw.Draw(band).polygon([(sx, 0), (sx + 90 * S, 0), (sx + 30 * S, H * S), (sx - 60 * S, H * S)], fill=(255, 255, 255, 70))
    mask = Image.new("L", base.size, 0)
    ImageDraw.Draw(mask).text((230 * S, 100 * S), "DOES", font=tf, fill=255)
    band.putalpha(Image.composite(band.getchannel("A"), Image.new("L", base.size, 0), mask))
    base.alpha_composite(band)

    text_glow(base, (236 * S, 262 * S), "마인크래프트 정품 계정 샵", f("Bold", 34), (236, 240, 255, 255), (0, 0, 0, 0), 1)
    d = ImageDraw.Draw(base)
    d.text((236 * S, 310 * S), "자동 자판기 · 16자리 안전 전달 · 30일 보증", font=f("Medium", 21), fill=(160, 170, 205, 255))

    # 칩
    chips = ["24시간 자동", "16자리 코드", "30일 보증", "계좌이체·코인"]
    cx = 68 * S
    chip_f = f("Bold", 17)
    for k, c in enumerate(chips):
        tw_ = d.textlength(c, font=chip_f)
        w_ = tw_ + 30 * S
        x0, y0 = cx, 348 * S
        hl = 0.5 + 0.5 * math.sin(t * math.tau - k * 0.8)
        d.rounded_rectangle([x0, y0, x0 + w_, y0 + 36 * S], radius=18 * S, fill=(30, 36, 80, 230), outline=(int(90 + 60 * hl), int(200 + 40 * hl), 255, 255), width=2 * S)
        d.text((x0 + w_ / 2, y0 + 18 * S), c, font=chip_f, fill=(225, 240, 255, 255), anchor="mm")
        cx = x0 + w_ + 12 * S

    # 떠다니는 보석
    gems = [(860, 90, 34, (129, 140, 248), 0.0), (800, 280, 22, (34, 211, 238), 0.35), (905, 210, 16, (125, 211, 252), 0.6)]
    for gx, gy, gs, col, ph in gems:
        yy = gy + math.sin(t * math.tau + ph * math.tau) * 10
        gem(d, gx * S, yy * S, gs * S, col)

    # 테두리
    d.rounded_rectangle([2 * S, 2 * S, (W - 2) * S, (H - 2) * S], radius=28 * S, outline=(255, 255, 255, 40), width=2 * S)
    out = base.convert("RGB").resize((W, H), Image.LANCZOS)
    return out.quantize(colors=200, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE)

frames = [frame(i) for i in range(FR)]
frames[0].save(OUT, save_all=True, append_images=frames[1:], duration=70, loop=0, optimize=True, disposal=2)
print("wrote", OUT, "frames", FR)
