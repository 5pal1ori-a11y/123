/** 팔레트 고정(최대 256색) GIF89a 인코더 — 프레임은 팔레트 인덱스 배열 */
export type GifFrame = { pixels: Uint8Array; delayCs: number };

class ByteWriter {
  private buf = new Uint8Array(1 << 16);
  length = 0;

  private grow(extra: number) {
    if (this.length + extra <= this.buf.length) return;
    let size = this.buf.length * 2;
    while (size < this.length + extra) size *= 2;
    const next = new Uint8Array(size);
    next.set(this.buf.subarray(0, this.length));
    this.buf = next;
  }

  byte(b: number) {
    this.grow(1);
    this.buf[this.length++] = b & 0xff;
  }

  u16(n: number) {
    this.byte(n);
    this.byte(n >> 8);
  }

  bytes(arr: ArrayLike<number>) {
    this.grow(arr.length);
    for (let i = 0; i < arr.length; i++) this.buf[this.length++] = arr[i]! & 0xff;
  }

  ascii(s: string) {
    for (let i = 0; i < s.length; i++) this.byte(s.charCodeAt(i));
  }

  result() {
    return this.buf.slice(0, this.length);
  }
}

const TABLE_SIZE = 4096 * 256;
let stamp: Int32Array | null = null;
let codes: Int16Array | null = null;
let generation = 0;

function lzw(out: ByteWriter, pixels: Uint8Array, minCodeSize: number) {
  if (!stamp || !codes) {
    stamp = new Int32Array(TABLE_SIZE);
    codes = new Int16Array(TABLE_SIZE);
  }
  const clearCode = 1 << minCodeSize;
  const eoiCode = clearCode + 1;
  let codeSize = minCodeSize + 1;
  let nextCode = eoiCode + 1;
  generation += 1;

  const data = new ByteWriter();
  let block = new Uint8Array(255);
  let blockLen = 0;
  let cur = 0;
  let shift = 0;

  const flushBlock = () => {
    if (!blockLen) return;
    data.byte(blockLen);
    data.bytes(block.subarray(0, blockLen));
    block = new Uint8Array(255);
    blockLen = 0;
  };
  const emit = (code: number) => {
    cur |= code << shift;
    shift += codeSize;
    while (shift >= 8) {
      block[blockLen++] = cur & 0xff;
      if (blockLen === 255) flushBlock();
      cur >>>= 8;
      shift -= 8;
    }
  };

  emit(clearCode);
  let prefix = pixels[0]!;
  for (let i = 1; i < pixels.length; i++) {
    const k = pixels[i]!;
    const key = (prefix << 8) | k;
    if (stamp[key] === generation) {
      prefix = codes[key]!;
      continue;
    }
    emit(prefix);
    if (nextCode === 4096) {
      emit(clearCode);
      generation += 1;
      codeSize = minCodeSize + 1;
      nextCode = eoiCode + 1;
    } else {
      if (nextCode >= 1 << codeSize) codeSize += 1;
      stamp[key] = generation;
      codes[key] = nextCode++;
    }
    prefix = k;
  }
  emit(prefix);
  emit(eoiCode);
  if (shift > 0) {
    block[blockLen++] = cur & 0xff;
    if (blockLen === 255) flushBlock();
  }
  flushBlock();

  out.byte(minCodeSize);
  out.bytes(data.result());
  out.byte(0);
}

/** palette: 0xRRGGBB 값들. 길이는 2~256 (2의 거듭제곱으로 채운다). loop 0 = 무한 반복 */
export function encodeGif(
  width: number,
  height: number,
  palette: number[],
  frames: GifFrame[],
  loop = 0,
): Uint8Array {
  let bits = 1;
  while (1 << bits < palette.length) bits += 1;
  const size = 1 << bits;
  const minCodeSize = Math.max(2, bits);

  const w = new ByteWriter();
  w.ascii("GIF89a");
  w.u16(width);
  w.u16(height);
  w.byte(0x80 | ((bits - 1) << 4) | (bits - 1));
  w.byte(0);
  w.byte(0);
  for (let i = 0; i < size; i++) {
    const c = palette[i] ?? 0;
    w.byte(c >> 16);
    w.byte(c >> 8);
    w.byte(c);
  }

  w.bytes([0x21, 0xff, 0x0b]);
  w.ascii("NETSCAPE2.0");
  w.bytes([0x03, 0x01]);
  w.u16(loop);
  w.byte(0);

  for (const frame of frames) {
    w.bytes([0x21, 0xf9, 0x04, 0x04]);
    w.u16(Math.max(2, Math.min(65535, Math.round(frame.delayCs))));
    w.byte(0);
    w.byte(0);

    w.byte(0x2c);
    w.u16(0);
    w.u16(0);
    w.u16(width);
    w.u16(height);
    w.byte(0);
    lzw(w, frame.pixels, minCodeSize);
  }
  w.byte(0x3b);
  return w.result();
}
