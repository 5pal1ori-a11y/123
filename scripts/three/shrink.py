"""이미 만든 GIF 의 용량 줄이기 — 앞 프레임과 거의 같은 픽셀은 앞 프레임 값을 그대로 써서
GIF 가 바뀐 부분(작은 사각형)만 저장하게 한다. 사용: python3 scripts/three/shrink.py <gif ...>"""
import os
import sys

import numpy as np
from PIL import Image

THRESH = int(os.environ.get("SHRINK_THRESH", "14"))


def shrink(path):
    im = Image.open(path)
    pal = im.getpalette()
    frames, durs = [], []
    for i in range(im.n_frames):
        im.seek(i)
        durs.append(im.info.get("duration", 70))
        frames.append(np.asarray(im.convert("RGB"), dtype=np.int16))
    out = [frames[0]]
    for cur in frames[1:]:
        prev = out[-1]
        same = np.abs(cur - prev).max(axis=-1) < THRESH
        nxt = cur.copy()
        nxt[same] = prev[same]
        out.append(nxt)
    pimg = Image.new("P", (1, 1))
    pimg.putpalette(pal)
    q = [Image.fromarray(f.astype(np.uint8)).quantize(palette=pimg, dither=Image.Dither.NONE) for f in out]
    before = os.path.getsize(path)
    q[0].save(path, save_all=True, append_images=q[1:], duration=durs, loop=0, optimize=False, disposal=1)
    print(os.path.basename(path), before // 1024, "->", os.path.getsize(path) // 1024, "KB", flush=True)


for p in sys.argv[1:]:
    shrink(p)
