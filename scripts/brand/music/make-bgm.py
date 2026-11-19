#!/usr/bin/env python3
"""
DOES 배경음악 — 직접 합성하는 저작권 걱정 없는 일렉트로닉/로파이 루프.

    python3 scripts/brand/music/make-bgm.py <길이초> <출력.wav> [--bpm 104] [--seed 7]

구성: 패드 코드(Am - F - C - G) · 아르페지오 · 베이스 · 드럼(킥·스네어·하이햇)
앞 2마디는 패드만, 그다음 드럼이 들어오고, 끝 3초는 서서히 줄어든다. numpy 만 필요.
"""
import sys
import wave

import numpy as np

args = sys.argv[1:]
DUR = float(args[0]) if args else 60.0
OUT = args[1] if len(args) > 1 else "bgm.wav"
BPM = float(args[args.index("--bpm") + 1]) if "--bpm" in args else 104.0
SEED = int(args[args.index("--seed") + 1]) if "--seed" in args else 7
SR = 44100
rng = np.random.default_rng(SEED)

N = int(DUR * SR)
L = np.zeros(N)
R = np.zeros(N)
beat = 60.0 / BPM
bar = beat * 4


def midi(n):
    return 440.0 * 2 ** ((n - 69) / 12)


def add(buf, start, sig, gain=1.0):
    i = int(start * SR)
    if i >= N:
        return
    j = min(N, i + len(sig))
    buf[i:j] += sig[: j - i] * gain


def lowpass(x, cutoff):
    """한 극 저역 통과 (부드럽게)"""
    a = np.exp(-2 * np.pi * cutoff / SR)
    y = np.empty_like(x)
    acc = 0.0
    for k in range(len(x)):
        acc = (1 - a) * x[k] + a * acc
        y[k] = acc
    return y


def env_adsr(n, a, d, s, r):
    t = np.arange(n) / SR
    e = np.full(n, s)
    ai = int(a * SR)
    di = int(d * SR)
    ri = int(r * SR)
    if ai:
        e[:ai] = np.linspace(0, 1, ai)
    if di:
        e[ai : ai + di] = np.linspace(1, s, min(di, max(0, n - ai)))[: max(0, min(di, n - ai))]
    if ri and n > ri:
        e[-ri:] *= np.linspace(1, 0, ri)
    return e


def saw(freq, n, detune=0.0):
    t = np.arange(n) / SR
    ph = (t * freq * (1 + detune)) % 1.0
    return 2 * ph - 1


# 코드 진행 (Am F C G) — 각 1마디
CHORDS = [
    [57, 60, 64, 69],  # Am
    [53, 57, 60, 65],  # F
    [48, 55, 60, 64],  # C
    [55, 59, 62, 67],  # G
]
ROOTS = [45, 41, 36, 43]

n_bars = int(np.ceil(DUR / bar)) + 1

# ── 패드 ──
for b in range(n_bars):
    t0 = b * bar
    ch = CHORDS[b % 4]
    n = int(bar * 1.15 * SR)
    sigL = np.zeros(n)
    sigR = np.zeros(n)
    for note in ch:
        f = midi(note)
        sigL += saw(f, n, -0.004) + 0.5 * saw(f * 2, n, 0.003)
        sigR += saw(f, n, 0.004) + 0.5 * saw(f * 2, n, -0.003)
    e = env_adsr(n, 0.35, 0.4, 0.75, 0.45)
    sigL = lowpass(sigL * e, 900)
    sigR = lowpass(sigR * e, 900)
    add(L, t0, sigL, 0.05)
    add(R, t0, sigR, 0.05)

# ── 아르페지오 (8분음표) ──
pattern = [0, 1, 2, 3, 2, 1, 2, 3]
for b in range(n_bars):
    if b < 1:
        continue
    ch = CHORDS[b % 4]
    for k in range(8):
        t0 = b * bar + k * beat / 2
        note = ch[pattern[k]] + 12
        n = int(0.42 * SR)
        t = np.arange(n) / SR
        f = midi(note)
        sig = (np.sin(2 * np.pi * f * t) + 0.35 * np.sin(2 * np.pi * 2 * f * t) + 0.12 * np.sin(2 * np.pi * 3 * f * t)) * np.exp(-t * 9)
        pan = 0.5 + 0.35 * np.sin(k * 0.9 + b)
        add(L, t0, sig, 0.07 * (1 - pan) * 2)
        add(R, t0, sig, 0.07 * pan * 2)
        # 짧은 메아리
        add(L, t0 + beat * 0.75, sig, 0.025 * pan * 2)
        add(R, t0 + beat * 0.75, sig, 0.025 * (1 - pan) * 2)

# ── 베이스 ──
for b in range(n_bars):
    if b < 2:
        continue
    root = ROOTS[b % 4]
    for k, (pos, ln) in enumerate([(0, 0.9), (1.5, 0.4), (2, 0.9), (3.5, 0.4)]):
        t0 = b * bar + pos * beat
        n = int(ln * beat * SR)
        t = np.arange(n) / SR
        f = midi(root)
        sig = np.sin(2 * np.pi * f * t) + 0.25 * np.sin(2 * np.pi * 2 * f * t)
        sig *= env_adsr(n, 0.005, 0.08, 0.8, 0.05)
        add(L, t0, sig, 0.16)
        add(R, t0, sig, 0.16)

# ── 드럼 ──
duck = np.ones(N)


def kick(t0):
    n = int(0.45 * SR)
    t = np.arange(n) / SR
    f = 52 + 90 * np.exp(-t * 28)
    ph = 2 * np.pi * np.cumsum(f) / SR
    sig = np.sin(ph) * np.exp(-t * 7.5)
    add(L, t0, sig, 0.42)
    add(R, t0, sig, 0.42)
    i = int(t0 * SR)
    m = int(0.28 * SR)
    j = min(N, i + m)
    if i < N:
        duck[i:j] = np.minimum(duck[i:j], 0.45 + 0.55 * np.linspace(0, 1, m)[: j - i])


def snare(t0):
    n = int(0.25 * SR)
    t = np.arange(n) / SR
    noise = rng.uniform(-1, 1, n)
    hp = noise - lowpass(noise, 1800)
    sig = hp * np.exp(-t * 18) + 0.35 * np.sin(2 * np.pi * 190 * t) * np.exp(-t * 30)
    add(L, t0, sig, 0.16)
    add(R, t0, sig, 0.16)


def hat(t0, g=0.05):
    n = int(0.06 * SR)
    t = np.arange(n) / SR
    noise = rng.uniform(-1, 1, n)
    hp = noise - lowpass(noise, 7000)
    sig = hp * np.exp(-t * 70)
    add(L, t0, sig, g * 1.1)
    add(R, t0, sig, g * 0.9)


for b in range(n_bars):
    if b < 2:
        continue
    t0 = b * bar
    for k in range(4):
        if k in (0, 2) or (k == 3 and b % 2 == 1):
            kick(t0 + k * beat if k != 3 else t0 + 3.5 * beat)
        if k in (1, 3):
            snare(t0 + k * beat)
    for k in range(8):
        hat(t0 + k * beat / 2, 0.05 if k % 2 else 0.032)

# 패드 · 아르페지오에 사이드체인 느낌 (킥 때 살짝 눌림) — 전체에 약하게
L *= 0.6 + 0.4 * duck
R *= 0.6 + 0.4 * duck

# 시작 · 끝 페이드
fade_in = int(1.0 * SR)
fade_out = int(3.0 * SR)
L[:fade_in] *= np.linspace(0, 1, fade_in)
R[:fade_in] *= np.linspace(0, 1, fade_in)
L[-fade_out:] *= np.linspace(1, 0, fade_out) ** 1.5
R[-fade_out:] *= np.linspace(1, 0, fade_out) ** 1.5

# 부드러운 리미터 + 정규화
mix = np.stack([L, R], axis=1)
mix = np.tanh(mix * 1.6) / np.tanh(1.6)
mix /= max(1e-9, np.abs(mix).max())
mix *= 0.89
pcm = (mix * 32767).astype(np.int16)
with wave.open(OUT, "wb") as w:
    w.setnchannels(2)
    w.setsampwidth(2)
    w.setframerate(SR)
    w.writeframes(pcm.tobytes())
print(f"saved {OUT} ({DUR:.1f}s, {BPM:.0f} BPM)")
