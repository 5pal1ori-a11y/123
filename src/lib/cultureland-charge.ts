/**
 * 문화상품권 자동충전 — 일시 중단.
 * `cultureland.js@2.1.2` 패키지가 npm에서 내려가(404) 빌드에 포함할 수 없어서 임시로 막아 둔다.
 * PIN을 쓰기 전에 오류를 내므로 상품권은 소모되지 않는다.
 * 패키지를 다시 구하면 이 파일을 git 기록(df0fa74 이전 버전)으로 되돌리면 된다.
 */

export type CulturelandCredentials = {
  id: string;
  password: string;
};

export async function redeemCultureGiftPin(
  _credentials: CulturelandCredentials,
  _pinRaw: string,
): Promise<{ amount: number; message: string }> {
  void _credentials;
  void _pinRaw;
  throw new Error("문화상품권 자동충전이 일시 중단됐어요. 계좌이체 등 다른 방법으로 충전해 주세요.");
}
