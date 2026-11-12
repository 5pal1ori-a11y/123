/** Pushbullet / MacroDroid 입금 알림 파싱이 검증된 은행 */
export type AutoChargeBank = {
  id: string;
  name: string;
  /** iOS 단축어 「알림 받을 때」 앱 선택 이름 */
  iosAppLabel: string;
};

export const AUTO_CHARGE_BANKS: readonly AutoChargeBank[] = [
  { id: "kakaobank", name: "카카오뱅크", iosAppLabel: "카카오뱅크" },
  { id: "toss", name: "토스뱅크", iosAppLabel: "토스" },
  { id: "kb", name: "KB국민은행", iosAppLabel: "KB스타뱅킹" },
  { id: "shinhan", name: "신한은행", iosAppLabel: "신한 SOL뱅크" },
  { id: "woori", name: "우리은행", iosAppLabel: "우리WON뱅킹" },
  { id: "hana", name: "하나은행", iosAppLabel: "하나1Q" },
  { id: "nh", name: "NH농협은행", iosAppLabel: "NH올원뱅크" },
  { id: "ibk", name: "IBK기업은행", iosAppLabel: "IBK기업은행" },
  { id: "kbank", name: "케이뱅크", iosAppLabel: "케이뱅크" },
  { id: "sc", name: "SC제일은행", iosAppLabel: "SC제일은행" },
  { id: "suhyup", name: "수협은행", iosAppLabel: "수협은행" },
  { id: "bnk_busan", name: "BNK부산은행", iosAppLabel: "BNK부산은행" },
  { id: "bnk_gyeongnam", name: "BNK경남은행", iosAppLabel: "BNK경남은행" },
  { id: "kwangju", name: "광주은행", iosAppLabel: "광주은행" },
  { id: "jeonbuk", name: "전북은행", iosAppLabel: "전북은행" },
  { id: "jeju", name: "제주은행", iosAppLabel: "제주은행" },
  { id: "mg", name: "새마을금고", iosAppLabel: "MG새마을금고" },
  { id: "cu", name: "신협", iosAppLabel: "신협" },
  { id: "post", name: "우체국", iosAppLabel: "우체국" },
] as const;

const BANK_NAME_SET = new Set(AUTO_CHARGE_BANKS.map((b) => b.name));

export function isAutoChargeBank(name: string | null | undefined) {
  if (!name?.trim()) return false;
  return BANK_NAME_SET.has(name.trim());
}

export function getAutoChargeBank(name: string | null | undefined): AutoChargeBank | null {
  if (!name?.trim()) return null;
  return AUTO_CHARGE_BANKS.find((b) => b.name === name.trim()) ?? null;
}

export function resolveAutoChargeBankName(name: string | null | undefined): string {
  const trimmed = name?.trim() ?? "";
  if (!trimmed) return AUTO_CHARGE_BANKS[0]!.name;
  if (isAutoChargeBank(trimmed)) return trimmed;

  const aliases: Record<string, string> = {
    토스: "토스뱅크",
    국민은행: "KB국민은행",
    KB: "KB국민은행",
    농협: "NH농협은행",
    농협은행: "NH농협은행",
    기업은행: "IBK기업은행",
    카카오: "카카오뱅크",
  };
  return aliases[trimmed] ?? AUTO_CHARGE_BANKS[0]!.name;
}

export function autoChargeBankLabels() {
  return AUTO_CHARGE_BANKS.map((b) => b.name);
}

export function autoChargeBankHint(name: string | null | undefined) {
  const bank = getAutoChargeBank(name);
  if (!bank) return "자동충전 가능 은행 중 하나를 선택하세요.";
  return `${bank.name} 입금 알림을 푸시불릿(AOS) + MacroDroid·Tasker로 연동할 수 있어요.`;
}
