"""재고현황 커스텀 이모지 (봇 앱 이모지로 올린다) → src/lib/discord/emoji-images.ts
사용: GIF_FONT_DIR=<Galmuri11.ttf 폴더> python3 scripts/make-stock-emojis.py
"""
import base64
import io
import math
import os
from PIL import Image, ImageDraw, ImageFont

FONT = ImageFont.truetype(os.path.join(os.environ.get("GIF_FONT_DIR", "."), "Galmuri11.ttf"), 12)
CHECK = [
    "..kkkkkkkk..",
    ".kggggggggk.",
    "kgggggggggwk",
    "kggggggggwwk",
    "kgwgggggwwgk",
    "kgwwgggwwggk",
    "kggwwgwwgggk",
    "kgggwwwggggk",
    "kggggwgggggk",
    "kggggggggggk",
    ".kggggggggk.",
    "..kkkkkkkk..",
]


def check_gif():
    frames = []
    for f in range(12):
        img = Image.new("RGBA", (128, 128), (0, 0, 0, 0))
        d = ImageDraw.Draw(img)
        s = 10
        ox = (128 - 12 * s) // 2
        shine = f % 12
        for y, row in enumerate(CHECK):
            for x, ch in enumerate(row):
                if ch == ".":
                    continue
                c = {"k": (16, 80, 44), "g": (52, 196, 106), "w": (255, 255, 255)}[ch]
                # 반짝이 띠가 대각선으로 지나간다
                if ch == "g" and (x + y) == shine * 2:
                    c = (150, 240, 180)
                d.rectangle([ox + x * s, ox + y * s, ox + x * s + s - 1, ox + y * s + s - 1], fill=c)
        frames.append(img)
    # 투명 배경: 마젠타를 0번 색으로 고정한 팔레트로 바꾼다
    pal_img = Image.new("P", (1, 1))
    colors = [(255, 0, 255), (16, 80, 44), (52, 196, 106), (255, 255, 255), (150, 240, 180)]
    flat = [v for c in colors for v in c] + [0] * (768 - len(colors) * 3)
    pal_img.putpalette(flat)
    out = []
    for fr in frames:
        bg = Image.new("RGB", fr.size, (255, 0, 255))
        bg.paste(fr, (0, 0), fr)
        out.append(bg.quantize(palette=pal_img, dither=Image.Dither.NONE))
    buf = io.BytesIO()
    out[0].save(buf, format="GIF", save_all=True, append_images=out[1:], duration=90, loop=0, disposal=2, transparency=0)
    return buf.getvalue()


def sold_png():
    tmp = Image.new("RGBA", (40, 16), (0, 0, 0, 0))
    ImageDraw.Draw(tmp).text((1, 1), "SOLD", font=FONT, fill=(255, 255, 255, 255))
    tmp = tmp.crop(tmp.getbbox())
    s = 4
    w, h = tmp.width * s + 24, tmp.height * s + 20
    img = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    d.rounded_rectangle([0, 0, w - 1, h - 1], radius=10, fill=(220, 38, 38, 255), outline=(255, 255, 255, 255), width=4)
    img.alpha_composite(tmp.resize((tmp.width * s, tmp.height * s), Image.NEAREST), (12, 10))
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


ok = check_gif()
sold = sold_png()
out = os.path.join(os.path.dirname(__file__), "..", "src", "lib", "discord", "emoji-images.ts")
with open(out, "w", encoding="utf-8") as fp:
    fp.write("/** scripts/make-stock-emojis.py 로 만든 이모지 그림 (직접 고치지 않는다) */\n")
    fp.write(f'export const EMOJI_STOCK_OK = "data:image/gif;base64,{base64.b64encode(ok).decode()}";\n')
    fp.write(f'export const EMOJI_STOCK_SOLD = "data:image/png;base64,{base64.b64encode(sold).decode()}";\n')
print("ok", len(ok), "sold", len(sold))
with open("/tmp/claude-0/gw/ok.gif", "wb") as f:
    f.write(ok)
with open("/tmp/claude-0/gw/sold.png", "wb") as f:
    f.write(sold)
