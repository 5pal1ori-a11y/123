"""DOES 봇 커스텀 이모지 (봇 앱 이모지로 자동 업로드) → src/lib/discord/emoji-images.ts
사용: GIF_FONT_DIR=<Galmuri11.ttf 폴더> python3 scripts/make-bot-emojis.py
16x16 픽셀 지도를 8배로 키운 128x128. 일부는 움직이는 GIF.
"""
import base64
import io
import os
from PIL import Image, ImageDraw, ImageFont

K = (34, 26, 40)
PAL = {
    "k": K, "w": (255, 255, 255), "W": (230, 236, 245),
    "g": (52, 196, 106), "G": (24, 120, 64), "l": (150, 240, 180),
    "y": (255, 214, 64), "Y": (226, 150, 24), "L": (255, 244, 180),
    "r": (232, 64, 64), "R": (170, 36, 44), "p": (244, 114, 182), "P": (200, 62, 140),
    "b": (96, 165, 250), "B": (37, 99, 235), "c": (125, 211, 252),
    "n": (160, 110, 60), "N": (110, 70, 36), "s": (148, 163, 184), "S": (90, 100, 120),
    "v": (168, 85, 247), "V": (110, 40, 190), "o": (249, 115, 22),
}

M = {}
M["check"] = [
    "....kkkkkkkk....", "..kkggggggggkk..", ".kggggggggggggk.", ".kgggggggggwwgk.",
    "kgggggggggwwwggk", "kggggggggwwwgggk", "kgwwgggggwwggggk", "kgwwwgggwwwggggk",
    "kggwwwgwwwgggggk", "kgggwwwwwggggggk", "kggggwwwgggggggk", "kgggggwggggggGGk",
    ".kgggggggggGGGk.", ".kGgggggggGGGGk.", "..kkGGGGGGGGkk..", "....kkkkkkkk....",
]
M["star"] = [
    ".......kk.......", "......kyyk......", "......kyyk......", ".....kyLyyk.....",
    "kkkkkkyLyyykkkkk", "kyyyyyLyyyyyyyyk", ".kyyyyyyyyyyyyk.", "..kyyyyyyyyyyk..",
    "...kyyyyyyyyk...", "...kyyyyyyyyk...", "..kyyyyYYyyyyk..", "..kyyyYkkYyyyk..",
    ".kyyyYk..kYyyyk.", ".kyyYk....kYyyk.", ".kkkk......kkkk.", "................",
]
M["dot"] = [
    "................", "................", "................", "......kkkk......",
    "....kkggggkk....", "...kgglllgggk...", "...kgllggggGk...", "..kggggggggGGk..",
    "..kggggggggGGk..", "...kgggggGGGk...", "...kGggggGGGk...", "....kkGGGGkk....",
    "......kkkk......", "................", "................", "................",
]
M["inbox"] = [
    "......kkkk......", "......kbbk......", "......kbbk......", "......kbbk......",
    "...kkkkbbkkkk...", "....kbbbbbbk....", ".....kbbbbk.....", "kkkk..kbbk..kkkk",
    "kWWk...kk...kWWk", "kWWk........kWWk", "kWWkkkk..kkkkWWk", "kWWWWWkkkkWWWWWk",
    "kWWWWWWWWWWWWWWk", "ksssssssssssssssk"[:16], "kkkkkkkkkkkkkkkk", "................",
]
M["gift"] = [
    "...kkk....kkk...", "..kyyyk..kyyyk..", "..kyk.ykky.kyk..", "...kyyyyyyyyk...",
    "kkkkkkkyykkkkkkk", "kppppppyypppppPk", "kkkkkkkyykkkkkkk", ".krrrrryyrrrrRk.",
    ".krrrrryyrrrrRk.", ".krrrrryyrrrrRk.", ".krrrrryyrrrrRk.", ".krrrrryyrrrRRk.",
    ".kRrrrryyrrRRRk.", ".kkkkkkkkkkkkkk.", "................", "................",
]
M["party"] = [
    "..........p..y..", ".....b.......k..", "...........kyk..", "..y....v...kyyk.",
    "..........kyyk..", ".......p.kyyk...", "....b....kyk..b.", "........kyyk....",
    ".......kyrrk..p.", "......kyrryk....", ".....kyrryyk..y.", "....kyrryyrk....",
    "...kyrryyrrk....", "..kYYyyrrrk.....", ".kkkkkkkkkk.....", "................",
]
M["clover"] = [
    "................", "...kkk....kkk...", "..kgggk..kgggk..", "..kgllgkkgllgk..",
    "..kggggkkggggk..", "...kgggkkgggk...", "....kkgggkk.....", "...kkgggggkk....",
    "..kgggkkkgggk...", "..kgllk.kgllgk..", "..kgggk..kgggk..", "...kkk.Gk.kkk...",
    ".......kGk......", "........kGk.....", ".........kk.....", "................",
]
M["ticket"] = [
    "................", "................", "kkkkkkkkkkkkkkkk", "kyyyyykyyyyyyyyk",
    "kyyyyy.yyyyyyyyk", ".kyyyykyyrryyyk.", "..kyyy.yrrrryk..", "..kyyykyyrryyk..",
    ".kyyyy.yyyyyyyk.", "kyyyyykyyyyyyyyk", "kYYYYY.YYYYYYYYk", "kkkkkkkkkkkkkkkk",
    "................", "................", "................", "................",
]
M["jackpot"] = [
    "................", "..kkkkkkkkkkkk..", ".kvvvvvvvvvvvvk.", ".kvkkkkkkkkkkvk.",
    ".kvkwwkwwkwwkvk.", ".kvkrrkrrkrrkvk.", ".kvkwrkwrkwrkvk.", ".kvkwrkwrkwrkvk.",
    ".kvkrwkrwkrwkvk.", ".kvkkkkkkkkkkvk.", ".kvvvvvvvvvvvvk.", ".kVVyyVVVVyyVVk.",
    ".kVVVVVVVVVVVVk.", "..kkkkkkkkkkkk..", "................", "................",
]
M["mail"] = [
    "................", "................", "kkkkkkkkkkkkkkkk", "kWkWWWWWWWWWWkWk",
    "kWWkWWWWWWWWkWWk", "kWWWkWWWWWWkWWWk", "kWWWWkkWWkkWWWWk", "kWWWWWWkkWWWWWWk",
    "kWWWWWWWWWWWWWWk", "kWWWWWWWWWWWWWWk", "kWWWWWWWWWWWWWWk", "kkkkkkkkkkkkkkkk",
    "...........rr...", "..........rrrr..", "...........rr...", "................",
]
M["robot"] = [
    ".......kk.......", ".......kyk......", "......kkkk......", "..kkkkkkkkkkkk..",
    ".kssssssssssssk.", ".kskkkksskkkksk.", ".kskcckssskccksk"[:16], ".kskkkksskkkksk.",
    ".ksssssssssssssk"[:16], ".ksskkkkkkkksssk"[:16], ".kssssssssssssk.", "..kkkkkkkkkkkk..",
    "....kSSSSSSk....", "...kSkSSSSkSk...", "...kk.kkkk.kk...", "................",
]
M["plus"] = [
    "................", "......kkkk......", "......kggk......", "......kggk......",
    "......kggk......", "......kggk......", ".kkkkkkggkkkkkk.", ".kggggggggggggk.",
    ".kggggggggggggk.", ".kkkkkkggkkkkkk.", "......kggk......", "......kggk......",
    "......kggk......", "......kggk......", "......kkkk......", "................",
]
M["island"] = [
    "......kkkk......", "....kkggggkk....", "...kgggkkgggk...", "..kgk..kk..kgk..",
    "..kk...kn...kk..", ".......kn.......", ".......kn.......", "......knk.......",
    "......knk.......", "....kkknkkk.....", "..kkyyyyyyyykk..", ".kyyyyyyyyyyyyk.",
    "kbbbbbbbbbbbbbbk", "kcbbcbbbbbcbbbbk", "kkkkkkkkkkkkkkkk", "................",
]
M["gem"] = [
    "................", "................", "....kkkkkkkk....", "...kccbccbccbk..",
    "..kcwcbbcbbcbBk.", ".kcwccbbcbbcbBBk", ".kkkkkkkkkkkkkkk"[:16], ".kcwcccbbbbbbBBk"[:16],
    "..kcwccbbbbbBBk.", "...kccccbbbbBk..", "....kccbbbbBk...", ".....kcbbbBk....",
    "......kcbBk.....", ".......kBk......", "........k.......", "................",
]
M["tree"] = [
    "......kkkk......", "....kkggggkk....", "...kgglggggGk...", "..kgglggggggGk..",
    "..kgggggggggGk..", ".kggggggggggGGk.", ".kgglgggggggGGk.", ".kggggggggggGGk.",
    "..kGggggggGGGk..", "...kkGGGGGGkk...", ".....kknnkk.....", "......knNk......",
    "......knNk......", "....kkknNkkk....", "....kGGGGGGk....", "................",
]
M["sprout"] = [
    "................", "................", "..kkk......kkk..", ".kglgk....kglgk.",
    ".kgggGk..kGgggk.", "..kggGGkkGGggk..", "...kkkGkkGkkk...", "......kGGk......",
    "......kGGk......", "......kGGk......", "...kkkkGGkkkk...", "..knnnnnnnnnnk..",
    "..kNnnnnnnnnNk..", "...kNNNNNNNNk...", "....kkkkkkkk....", "................",
]
M["flag"] = [
    "................", "..kk............", "..kskkkkk.......", "..ksrrrrrkkk....",
    "..ksrrrrrrrrrk..", "..ksrrwrrrrrrk..", "..ksrrrrrrrrk...", "..ksrrrrrrrk....",
    "..ksRkkkkkkk....", "..ksk...........", "..ksk...........", "..ksk...........",
    "..ksk...........", ".kkSkk..........", ".kSSSSk.........", "................",
]
M["brick"] = [
    "................", "................", "kkkkkkkkkkkkkkkk", "krrrrrrkrrrrrrRk",
    "krrrrrrkrrrrrRRk", "kkkkkkkkkkkkkkkk", "krrRkrrrrrrrkrrk", "krRRkrrrrrrRkrrk",
    "kkkkkkkkkkkkkkkk", "krrrrrrkrrrrrrRk", "krrrrrRkrrrrrRRk", "kkkkkkkkkkkkkkkk",
    "................", "................", "................", "................",
]


def draw(rows, overrides=None):
    img = Image.new("RGBA", (128, 128), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    pal = dict(PAL, **(overrides or {}))
    for y, row in enumerate(rows):
        for x, ch in enumerate(row[:16]):
            if ch in pal:
                d.rectangle([x * 8, y * 8, x * 8 + 7, y * 8 + 7], fill=pal[ch])
    return img


def png(img):
    buf = io.BytesIO()
    img.save(buf, format="PNG", optimize=True)
    return buf.getvalue()


def gif(frames, ms=100):
    # 투명 배경: 마젠타를 0번 색으로 고정
    colors = [(255, 0, 255)] + list({v for v in PAL.values()}) + [(255, 255, 255)]
    flat = [v for c in colors for v in c] + [0] * (768 - len(colors) * 3)
    pal_img = Image.new("P", (1, 1))
    pal_img.putpalette(flat)
    out = []
    for fr in frames:
        bg = Image.new("RGB", fr.size, (255, 0, 255))
        bg.paste(fr, (0, 0), fr)
        out.append(bg.quantize(palette=pal_img, dither=Image.Dither.NONE))
    buf = io.BytesIO()
    out[0].save(buf, format="GIF", save_all=True, append_images=out[1:], duration=ms, loop=0, disposal=2, transparency=0)
    return buf.getvalue()


def shine(rows, color_key, frames=10):
    """대각선으로 반짝이 띠가 지나가는 움직이는 이모지"""
    out = []
    for f in range(frames):
        img = draw(rows)
        d = ImageDraw.Draw(img)
        for y, row in enumerate(rows):
            for x, ch in enumerate(row[:16]):
                if ch == color_key and (x + y) in (f * 3, f * 3 + 1):
                    d.rectangle([x * 8, y * 8, x * 8 + 7, y * 8 + 7], fill=(255, 255, 255, 200))
        out.append(img)
    return out


def pulse(rows, frames=8):
    out = []
    for f in range(frames):
        k = 1.0 - 0.12 * (1 - abs(f - frames / 2) / (frames / 2))
        img = draw(rows)
        sz = int(128 * k)
        small = img.resize((sz, sz), Image.NEAREST)
        canvas = Image.new("RGBA", (128, 128), (0, 0, 0, 0))
        canvas.alpha_composite(small, ((128 - sz) // 2, (128 - sz) // 2))
        out.append(canvas)
    return out


FONT = ImageFont.truetype(os.path.join(os.environ.get("GIF_FONT_DIR", "."), "Galmuri11.ttf"), 12)


def sold_badge():
    tmp = Image.new("RGBA", (40, 16), (0, 0, 0, 0))
    ImageDraw.Draw(tmp).text((1, 1), "SOLD", font=FONT, fill=(255, 255, 255, 255))
    tmp = tmp.crop(tmp.getbbox())
    s = 4
    w, h = tmp.width * s + 24, tmp.height * s + 20
    img = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    ImageDraw.Draw(img).rounded_rectangle([0, 0, w - 1, h - 1], radius=10, fill=(220, 38, 38, 255), outline=(255, 255, 255, 255), width=4)
    img.alpha_composite(tmp.resize((tmp.width * s, tmp.height * s), Image.NEAREST), (12, 10))
    return img


EMOJIS = {
    "does_check": ("gif", gif(shine(M["check"], "g"))),
    "does_star": ("gif", gif(shine(M["star"], "y"))),
    "does_online": ("gif", gif(pulse(M["dot"]), 120)),
    "does_offline": ("png", png(draw(M["dot"], {"g": (120, 120, 130), "G": (80, 80, 90), "l": (170, 170, 180)}))),
    "does_inbox": ("png", png(draw(M["inbox"]))),
    "does_gift": ("gif", gif(shine(M["gift"], "r"))),
    "does_party": ("png", png(draw(M["party"]))),
    "does_clover": ("png", png(draw(M["clover"]))),
    "does_ticket": ("png", png(draw(M["ticket"]))),
    "does_jackpot": ("gif", gif(shine(M["jackpot"], "v"))),
    "does_mail": ("png", png(draw(M["mail"]))),
    "does_robot": ("png", png(draw(M["robot"]))),
    "does_plus": ("png", png(draw(M["plus"]))),
    "does_island": ("png", png(draw(M["island"]))),
    "does_gem": ("gif", gif(shine(M["gem"], "b"))),
    "does_tree": ("png", png(draw(M["tree"]))),
    "does_sprout": ("png", png(draw(M["sprout"]))),
    "does_flag": ("png", png(draw(M["flag"]))),
    "does_brick": ("png", png(draw(M["brick"]))),
    "does_sold": ("png", png(sold_badge())),
}

out = os.path.join(os.path.dirname(__file__), "..", "src", "lib", "discord", "emoji-images.ts")
with open(out, "w", encoding="utf-8") as fp:
    fp.write("/** scripts/make-bot-emojis.py 로 만든 DOES 봇 이모지 그림 (직접 고치지 않는다) */\n")
    fp.write("export const BOT_EMOJI_IMAGES = {\n")
    for name, (kind, data) in EMOJIS.items():
        mime = "image/gif" if kind == "gif" else "image/png"
        fp.write(f'  {name}: {{ animated: {"true" if kind == "gif" else "false"}, image: "data:{mime};base64,{base64.b64encode(data).decode()}" }},\n')
    fp.write("} as const;\n")
total = sum(len(d) for _, d in EMOJIS.values())
print("emojis", len(EMOJIS), "bytes", total)

# 미리보기
prev = Image.new("RGB", (10 * 70, 2 * 70), (49, 51, 56))
for i, (name, (kind, data)) in enumerate(EMOJIS.items()):
    im = Image.open(io.BytesIO(data))
    if kind == "gif":
        im.seek(min(2, im.n_frames - 1))
    im = im.convert("RGBA")
    im.thumbnail((64, 64), Image.NEAREST)
    prev.paste(im, ((i % 10) * 70 + 3, (i // 10) * 70 + 3), im)
prev.save("/tmp/claude-0/gw/emojis.png")
