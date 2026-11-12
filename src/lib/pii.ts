/** 개인정보 마스킹 (로그·화면용) */

export function maskEmail(email: string | null | undefined): string {
  if (!email) return "—";
  const trimmed = email.trim();
  const at = trimmed.indexOf("@");
  if (at <= 0) return "***";
  const local = trimmed.slice(0, at);
  const domain = trimmed.slice(at + 1);
  const head = local.slice(0, Math.min(2, local.length));
  return `${head}***@${domain}`;
}

export function maskIp(ip: string | null | undefined): string {
  if (!ip || ip === "unknown") return "—";
  const v4 = ip.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (v4) return `${v4[1]}.${v4[2]}.*.*`;
  if (ip.includes(":")) {
    const parts = ip.split(":");
    return `${parts.slice(0, 2).join(":")}:****`;
  }
  if (ip.length <= 4) return "***";
  return `${ip.slice(0, 4)}…`;
}

export function maskDiscordId(id: string | null | undefined): string {
  if (!id) return "—";
  if (id.length <= 6) return "***";
  return `${id.slice(0, 4)}…${id.slice(-2)}`;
}

/** JSON/meta 문자열 안의 이메일·IP를 대략적으로 가림 */
export function maskPiiInText(text: string): string {
  return text
    .replace(
      /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
      (m) => maskEmail(m),
    )
    .replace(
      /\b(?:\d{1,3}\.){3}\d{1,3}\b/g,
      (m) => maskIp(m),
    );
}
