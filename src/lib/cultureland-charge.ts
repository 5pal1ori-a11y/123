import Cultureland, { CulturelandError, Pin } from "cultureland.js";

export type CulturelandCredentials = {
  id: string;
  password: string;
};

function isError<T>(value: T | CulturelandError): value is CulturelandError {
  return value instanceof CulturelandError;
}

/** 문화상품권 PIN을 컬쳐랜드 계정으로 충전하고 충전 금액을 반환합니다. */
export async function redeemCultureGiftPin(
  credentials: CulturelandCredentials,
  pinRaw: string,
): Promise<{ amount: number; message: string }> {
  const client = new Cultureland();
  const login = await client.login(credentials.id.trim(), credentials.password);
  if (isError(login)) throw new Error(login.message || "컬쳐랜드 로그인 실패");

  const pin = new Pin(pinRaw.trim());
  const voucher = await client.checkVoucher(pin);
  if (isError(voucher)) throw new Error(voucher.message || "상품권 조회 실패");
  if (voucher.balance <= 0) throw new Error("잔액이 없는 상품권입니다.");

  const charged = await client.charge(pin);
  if (isError(charged)) throw new Error(charged.message || "상품권 충전 실패");

  const amount = Array.isArray(charged)
    ? charged.reduce((sum, item) => sum + (item.amount ?? 0), 0)
    : (charged.amount ?? 0);

  if (amount <= 0) throw new Error("충전된 금액이 없습니다.");

  const message = Array.isArray(charged) ? charged[0]?.message : charged.message;
  return { amount, message: message ?? "충전 완료" };
}
