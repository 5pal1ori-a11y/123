"""three.js 3D 장면 + 기존 글꼴(픽셀 제목 · Noto 설명)로 DOES GIF 를 만든다.
사용: (저장소 루트에서 python3 -m http.server 8765 를 띄운 뒤)
  GIF_FONT_DIR=<Galmuri11.ttf · NotoSansKR.ttf 폴더> python3 scripts/three/compose.py public/brand [이름 ...]
장면은 scenes.js, 프레임 렌더는 render.cjs (헤드리스 Chromium).
"""
import importlib.util
import json
import math
import os
import shutil
import subprocess
import sys
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "hq"))
from lib import (Canvas, S, ease_back, sub_text, title_strip, underline, wave_title)  # noqa: E402
from PIL import Image, ImageDraw  # noqa: E402

spec = importlib.util.spec_from_file_location("gacha", os.path.join(HERE, "..", "make-gacha-gifs.py"))
gacha = importlib.util.module_from_spec(spec)
spec.loader.exec_module(gacha)

OUT = sys.argv[1] if len(sys.argv) > 1 else "."
ONLY = set(sys.argv[2:])


def save_gif(frames, path, durations, out_size, colors=255):
    """모든 프레임에서 고른 공용 팔레트 · 디더링 없음 → 안 바뀐 배경은 프레임마다 똑같아서 용량이 작다"""
    small = [fr.resize(out_size, Image.LANCZOS) for fr in frames]
    ow, oh = out_size
    k = len(small)
    th = [s.resize((ow // 2, oh // 2), Image.BILINEAR) for s in small]
    strip = Image.new("RGB", (ow // 2, (oh // 2) * k))
    for i, t in enumerate(th):
        strip.paste(t, (0, (oh // 2) * i))
    pal = strip.quantize(colors=colors, method=Image.Quantize.MEDIANCUT)
    # 고정 Bayer 무늬를 살짝 더해 그라데이션 줄무늬를 없앤다 (프레임마다 같은 무늬라 배경은 그대로 유지)
    import numpy as np
    bayer = np.array([[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]], dtype=np.float32) / 16.0 - 0.47
    noise = np.tile(bayer, (oh // 4 + 1, ow // 4 + 1))[:oh, :ow, None] * 9.0
    small = [Image.fromarray(np.clip(np.asarray(fr, dtype=np.float32) + noise, 0, 255).astype(np.uint8)) for fr in small]
    q = [fr.quantize(palette=pal, dither=Image.Dither.NONE) for fr in small]
    q[0].save(path, save_all=True, append_images=q[1:], duration=durations, loop=0, optimize=False, disposal=1)
    print("saved", os.path.basename(path), os.path.getsize(path) // 1024, "KB", len(frames), "frames", flush=True)


def render(scene, w, h, frames, opts):
    """장면을 프레임별 RGB 이미지(2배 해상도)로 돌려준다"""
    tmp = tempfile.mkdtemp(prefix="three-")
    try:
        jobs = os.path.join(tmp, "jobs.json")
        with open(jobs, "w") as fh:
            json.dump([{"id": "j", "scene": scene, "w": w, "h": h, "frames": frames, "opts": opts}], fh)
        subprocess.run(["node", os.path.join(HERE, "render.cjs"), jobs, tmp], check=True, cwd=HERE, stdout=subprocess.DEVNULL)
        d = os.path.join(tmp, "j")
        return [Image.open(os.path.join(d, f)).convert("RGB") for f in sorted(os.listdir(d))]
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


def canvas_from(img, w, h):
    cv = Canvas(w, h)
    cv.img = img.copy()
    return cv


def title_center(cv, text, y, scale, W, color=(255, 255, 255), shadow=(44, 34, 70), pop=1.0):
    sc = max(3, int(round(scale * pop)))
    im = title_strip(text, sc, color, shadow)
    while im.width > S(W - 40) and sc > 3:
        sc -= 1
        im = title_strip(text, sc, color, shadow)
    cv.img.paste(im, (int(S(W / 2) - im.width / 2), S(y)), im)


def want(name):
    return not ONLY or name in ONLY


# ───────── 배너 (왼쪽 3D 아이콘 + 오른쪽 제목 · 설명) ─────────

def banner(name, w, h, scene, title, sub, opts=None, line=((168, 85, 247), (126, 34, 206)), n=40):
    if not want(name):
        return
    tall = h >= 250
    cx = 150 if tall else 112
    frames3d = render(scene, w, h, n, {"cx": cx, **(opts or {})})
    tx = 292 if tall else 232
    ty = 60 if tall else 24
    sy = 180 if tall else 100
    frames = []
    for f, im in enumerate(frames3d):
        cv = canvas_from(im, w, h)
        wave_title(cv, title, tx, ty, f, n, w - tx - 30, scale=(10 if tall else 6))
        sub_text(cv, sub, tx + 2, sy, size=(29 if tall else 25), max_w=w - tx - 30)
        underline(cv, tx + 2, sy + (52 if tall else 46), f, *line)
        frames.append(cv.img)
    save_gif(frames, os.path.join(OUT, f"{name}.gif"), [70] * (n - 1) + [900], (w, h))


def square_icon(name, scene):
    if not want(name):
        return
    n = 40
    frames = render(scene, 200, 200, n, {})
    save_gif(frames, os.path.join(OUT, f"{name}.gif"), [70] * n, (200, 200))


# ───────── 결과 (600x375, 위쪽 제목) ─────────

W, H = 600, 375
# 제목이 들어갈 자리를 남기도록 3D 를 살짝 작게 · 아래로
RESULT_VIEW = {"zoom": 0.84, "cy": H / 2 + 34}
SLOT_VIEW = {"zoom": 0.78, "cy": H / 2 + 46}
CHECKIN_VIEW = {"zoom": 1.0, "cy": H / 2 + 30}


def checkin(name, jackpot):
    if not want(name):
        return
    n = 52
    frames = []
    for f, im in enumerate(render("checkin", W, H, n, {"gold": jackpot, **CHECKIN_VIEW})):
        cv = canvas_from(im, W, H)
        if f >= 20:
            pop = ease_back((f - 20) / 8)
            title_center(cv, "잭팟!" if jackpot else "출석 완료!", 22, 9, W, color=(255, 220, 90) if jackpot else (255, 255, 255), pop=max(0.3, pop))
        frames.append(cv.img)
    save_gif(frames, os.path.join(OUT, f"{name}.gif"), [60] * (n - 1) + [4000], (W, H))


def slot(name, win):
    if not want(name):
        return
    n = 60
    frames = []
    for f, im in enumerate(render("slot", W, H, n, {"win": win, **SLOT_VIEW})):
        cv = canvas_from(im, W, H)
        if f >= 36:
            pop = ease_back((f - 36) / 8)
            title_center(cv, "승리!" if win else "아쉬워요", 18, 9, W, color=(255, 220, 90) if win else (200, 200, 215), pop=max(0.3, pop))
        frames.append(cv.img)
    save_gif(frames, os.path.join(OUT, f"{name}.gif"), [55] * (n - 1) + [4000], (W, H))


def mine(name, kind):
    if not want(name):
        return
    n = 40 if kind == "idle" else 70
    frames = []
    view = {} if kind == "idle" else RESULT_VIEW
    for f, im in enumerate(render("mine", W, H, n, {"kind": kind, **view})):
        cv = canvas_from(im, W, H)
        if kind == "idle":
            wave_title(cv, "다이아 캐기", 26, 22, f, n, 260, scale=5, amp=2)
        elif f >= 37:
            pop = max(0.3, ease_back((f - 37) / 8))
            if kind == "win":
                title_center(cv, "다이아 획득!", 18, 7, W, color=(170, 225, 255), pop=pop)
            else:
                title_center(cv, "꽝", 22, 10, W, color=(200, 200, 215), pop=pop)
        frames.append(cv.img)
    durs = [70] * n if kind == "idle" else [55] * (n - 1) + [4000]
    save_gif(frames, os.path.join(OUT, f"{name}.gif"), durs, (W, H))


# ───────── 인형뽑기 (720x405 로 그려 600x338 저장) ─────────

GW, GH = 720, 405
CLAW_CACHE = {}


def claw_frames(kind, n):
    key = (kind, n)
    if key not in CLAW_CACHE:
        CLAW_CACHE[key] = render("claw", GW, GH, n, {"kind": kind})
    return CLAW_CACHE[key]


def claw_idle(name):
    if not want(name):
        return
    n = 40
    frames = []
    for im in claw_frames("idle", n):
        img = im.copy()
        gacha.title(img, "랜덤뽑기", "눌러서 인형뽑기에 도전!")
        frames.append(img)
    save_gif(frames, os.path.join(OUT, f"{name}.gif"), [70] * n, (600, 338))


LABEL_COL = {"win": (170, 220, 255), "coin": (255, 214, 80), "charge": (255, 214, 80), "nitro": (220, 170, 255), "mc": (150, 230, 140), "none": (190, 190, 205)}


def claw_result(name, kind):
    if not want(name):
        return
    n = 84
    render_kind = "coin" if kind == "charge" else kind
    frames, durs = [], []
    tx = gacha.S(548)
    for f, im in enumerate(claw_frames(render_kind, n)):
        img = im.copy()
        if f < 57:
            gacha.title(img, "랜덤뽑기", "집게가 캡슐을 집는 중…")
        elif f >= 72:
            pop = max(0.25, gacha.ease_back(min(1, (f - 72) / 8)))
            d = ImageDraw.Draw(img)
            label = "꽝" if kind == "none" else "당첨!"
            fz = gacha.font(max(12, int(60 * min(1, pop))), 900)
            tw = d.textlength(label, font=fz)
            d.text((tx - tw / 2 + gacha.S(4), gacha.S(30) + gacha.S(4)), label, font=fz, fill=(30, 20, 60))
            d.text((tx - tw / 2, gacha.S(30)), label, font=fz, fill=LABEL_COL[kind])
        frames.append(img)
        durs.append(55 if f < n - 1 else 4000)
    save_gif(frames, os.path.join(OUT, f"{name}.gif"), durs, (600, 338))


def suspense(name, scene, opts, title, n=30):
    """결과 전 5초 동안 보여 주는 '여는 중…' GIF (결과가 드러나지 않게)"""
    if not want(name):
        return
    frames = []
    for f, im in enumerate(render(scene, W, H, n, {**RESULT_VIEW, **opts})):
        cv = canvas_from(im, W, H)
        dots = "." * (1 + (f // 5) % 3)
        title_center(cv, title + dots, 20, 7, W, color=(255, 255, 255))
        frames.append(cv.img)
    save_gif(frames, os.path.join(OUT, f"{name}.gif"), [80] * n, (W, H))


def guide(name, steps, w=960, h=300, per=20):
    """여러 단계를 차례로 보여 주는 안내 GIF — 단계마다 3D 장면 + STEP 표시 + 진행 막대"""
    if not want(name):
        return
    frames, durs = [], []
    total = len(steps)
    for si, (scene, opts, title, sub) in enumerate(steps):
        imgs = render(scene, w, h, per, {"cx": 150, **opts})
        for f, im in enumerate(imgs):
            cv = canvas_from(im, w, h)
            sub_text(cv, f"STEP {si + 1} / {total}", 294, 26, size=17, color=(196, 181, 253), weight=700)
            wave_title(cv, title, 292, 58, f, per, w - 292 - 30, scale=9)
            sub_text(cv, sub, 294, 178, size=27, max_w=w - 294 - 30)
            # 진행 막대
            d = cv.d
            x0, x1, y = 294, w - 40, 246
            d.rounded_rectangle([S(x0), S(y), S(x1), S(y + 8)], radius=S(4), fill=(40, 34, 70))
            done = (si + (f + 1) / per) / total
            d.rounded_rectangle([S(x0), S(y), S(x0 + (x1 - x0) * done), S(y + 8)], radius=S(4), fill=(168, 85, 247))
            for k in range(total):
                cx = x0 + (x1 - x0) * (k + 0.5) / total
                c = (168, 85, 247) if k <= si else (70, 62, 110)
                d.ellipse([S(cx - 7), S(y + 4 - 7), S(cx + 7), S(y + 4 + 7)], fill=c)
            frames.append(cv.img)
            durs.append(2400 if f == per - 1 else 150)
    save_gif(frames, os.path.join(OUT, f"{name}.gif"), durs, (w, h))


if __name__ == "__main__":
    G = ((34, 197, 94), (21, 128, 61))
    banner("giveaway-3d", 960, 190, "gift", "경품 추첨", "버튼 한 번으로 참여하세요 · 마감 시 자동 추첨")
    banner("giveaway-end-3d", 960, 190, "gift", "당첨 발표!", "당첨자를 축하드려요 · 주최자에게 문의해 주세요", {"open": True})
    banner("stock-request-3d", 960, 190, "envelope", "재고 요청", "찾는 상품이 없으면 버튼 한 번으로 남겨 주세요")
    banner("purchase-3d", 960, 190, "bag", "주문 완료!", "DOES 를 이용해 주셔서 감사해요")
    banner("number-guess-3d", 960, 300, "tile", "숫자 맞추기", "가장 먼저 맞힌 1명에게 상품", line=G)
    banner("number-guess-win-3d", 960, 300, "crown", "정답!", "가장 먼저 맞혔어요 · 축하합니다", line=G)
    banner("welcome-3d", 960, 300, "heart", "환영합니다!", "DOES 에 오신 걸 환영해요", line=G)
    banner("invite-event-3d", 960, 300, "invite", "초대 이벤트", "친구를 초대하고 보상을 받아 가세요", line=G)
    banner("invite-rank-3d", 960, 190, "trophy", "초대 랭킹", "1시간마다 갱신돼요 · 실제 남아 있는 인원 기준")
    square_icon("stock-request-icon-3d", "envelope")
    banner("admin-online-3d", 960, 300, "status", "관리자 온라인", "지금 문의하면 바로 답변받을 수 있어요", {"online": True}, line=G)
    banner("admin-offline-3d", 960, 300, "status", "관리자 오프라인", "답변이 조금 늦을 수 있어요", {"online": False}, line=((239, 68, 68), (185, 28, 28)))
    banner("referral-3d", 960, 300, "gift", "추천인 코드", "친구가 내 코드로 가입하면 결제할 때마다 보상!")
    banner("ticket-3d", 960, 300, "bubble", "문의 티켓", "궁금한 건 편하게 물어보세요", line=((56, 189, 248), (3, 105, 161)))
    banner("fresh-mfa-3d", 960, 190, "shield", "FRESH MFA", "NO LOGIN HISTORY · 로그인 기록 없는 새 계정", line=G)
    banner("capes-3d", 960, 190, "capes", "CAPES", "MINECRAFT 망토 계정")

    checkin("3d-checkin", False)
    checkin("3d-checkin-jackpot", True)
    slot("3d-gamble-win", True)
    slot("3d-gamble-lose", False)
    mine("3d2-mine-idle", "idle")
    mine("3d2-mine-win", "win")
    mine("3d2-mine-none", "none")

    banner("stock-board-3d", 960, 300, "crates", "재고현황", "실시간 재고를 한눈에 확인하세요", line=G)
    banner("review-3d", 960, 300, "stars", "이용후기", "실제 구매 고객님들의 솔직한 후기")
    banner("inquiry-3d", 960, 300, "bubble", "문의하기", "궁금한 점은 티켓으로 편하게 물어보세요", line=((56, 189, 248), (3, 105, 161)))
    banner("about-3d", 960, 300, "logo", "도스 소개", "마인크래프트 정품 계정 전문 상점 · DOES")
    suspense("suspense-gamble-3d", "slot", {"win": True, "spin": True}, "슬롯 돌리는 중")
    suspense("suspense-checkin-3d", "gift", {}, "출석 상자 여는 중")
    guide(
        "verify-guide-3d",
        [
            ("shield", {}, "인증하기", "버튼을 눌러 디스코드 인증을 완료해요"),
            ("bag", {}, "포인트 충전", "계좌이체로 포인트를 충전해요"),
            ("crates", {}, "계정 고르기", "원하는 마크 계정을 골라 바로 구매해요"),
            ("envelope", {}, "16자리 코드", "디스코드 DM 으로 코드가 도착해요"),
            ("gift", {"open": True}, "계정 확인", "doesmc.xyz/check 에 코드를 넣으면 끝!"),
        ],
    )
    claw_idle("gacha3d2-idle")
    claw_result("gacha3d2-win", "win")
    claw_result("gacha3d2-coin", "coin")
    claw_result("gacha3d2-none", "none")
    claw_result("3d2-raffle-nitro", "nitro")
    claw_result("3d2-raffle-mc", "mc")
    claw_result("3d2-raffle-charge", "charge")
    claw_result("3d2-raffle-none", "none")
