import { createHmac, randomBytes, timingSafeEqual } from "crypto";

const SECRET = process.env.AUTH_SECRET ?? "vendix-dev-secret-change-me";
const CHALLENGE_TTL_MS = 10 * 60 * 1000;
const PASS_TTL_MS = 5 * 60 * 1000;

function sign(data: string) {
  return createHmac("sha256", SECRET).update(data).digest("base64url");
}

function verifySig(data: string, sig: string) {
  const expected = sign(data);
  const a = Buffer.from(expected);
  const b = Buffer.from(sig);
  if (a.length !== b.length) return false;
  try {
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

function encode(payload: object) {
  const data = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${data}.${sign(data)}`;
}

function decode<T extends { exp: number }>(token: string): T | null {
  if (!token) return null;
  const [data, sig] = token.split(".");
  if (!data || !sig || !verifySig(data, sig)) return null;
  try {
    const payload = JSON.parse(Buffer.from(data, "base64url").toString()) as T;
    if (!payload?.exp || payload.exp < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

type ChallengePayload = {
  kind: "challenge";
  nonce: string;
  exp: number;
};

type PassPayload = {
  kind: "pass";
  nonce: string;
  exp: number;
};

export function createCaptchaChallenge() {
  const payload: ChallengePayload = {
    kind: "challenge",
    nonce: randomBytes(16).toString("hex"),
    exp: Date.now() + CHALLENGE_TTL_MS,
  };
  return { token: encode(payload) };
}

export function solveCaptcha(challengeToken: string) {
  const payload = decode<ChallengePayload>(challengeToken);
  if (!payload || payload.kind !== "challenge" || !payload.nonce) return null;
  const pass: PassPayload = {
    kind: "pass",
    nonce: payload.nonce,
    exp: Date.now() + PASS_TTL_MS,
  };
  return { passToken: encode(pass) };
}

export function verifyCaptcha(token: string) {
  const payload = decode<PassPayload>(token);
  return Boolean(payload && payload.kind === "pass" && payload.nonce);
}
