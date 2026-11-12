import {
  isAutoChargeNotification,
  parseAutoChargeAmount,
} from "@/lib/auto-charge-sources";
import {
  normDepositorName,
  parseBankPush,
  parseDepositorNameFromText,
  type BankPushInput,
} from "@/lib/auto-charge-push-parse";

export { detectChargeMethod, parseAutoChargeAmount, isAutoChargeNotification } from "@/lib/auto-charge-sources";
export {
  normDepositorName,
  parseBankPush,
  parseDepositorNameFromText,
} from "@/lib/auto-charge-push-parse";

/** Pushbullet — 계좌 입금 알림만 */
export function isDepositNotification(text: string) {
  return isAutoChargeNotification(text, { bank: true, cultureGift: false, coin: false });
}

/** @deprecated use parseAutoChargeAmount */
export function parseDepositAmount(text: string): number | null {
  return parseAutoChargeAmount(text);
}

export type AutoChargePayload = {
  depositorText: string;
  amount: number | null;
  depositorName: string | null;
  fromPush: boolean;
};

export function resolveAutoChargePayload(input: {
  depositorText?: string;
  push?: BankPushInput;
  amount?: number;
  depositorName?: string;
  bank?: boolean;
  cultureGift?: boolean;
  coin?: boolean;
}): AutoChargePayload | null {
  if (input.push && (input.push.body || input.push.title)) {
    const parsed = parseBankPush(input.push);
    if (parsed) {
      return {
        depositorText: parsed.rawText,
        amount: parsed.amount,
        depositorName: parsed.depositorName,
        fromPush: true,
      };
    }
  }

  const depositorText = (input.depositorText ?? "").trim();
  if (!depositorText && input.amount === undefined) return null;

  const explicitAmount =
    input.amount !== undefined && input.amount > 0 ? Math.floor(input.amount) : null;
  const parsedAmount =
    explicitAmount ??
    (depositorText ? parseAutoChargeAmount(depositorText) : null);

  const explicitName = input.depositorName ? normDepositorName(input.depositorName) : null;
  const parsedName =
    explicitName ?? (depositorText ? parseDepositorNameFromText(depositorText) : null);

  if (parsedAmount !== null) {
    return {
      depositorText: depositorText || `${parsedName ?? ""} ${parsedAmount}원`.trim(),
      amount: parsedAmount,
      depositorName: parsedName,
      fromPush: false,
    };
  }

  if (
    depositorText &&
    isAutoChargeNotification(depositorText, {
      bank: input.bank,
      cultureGift: input.cultureGift,
      coin: input.coin,
    })
  ) {
    return {
      depositorText,
      amount: parseAutoChargeAmount(depositorText),
      depositorName: parsedName,
      fromPush: false,
    };
  }

  return null;
}

export function resolveAutoChargeAmount(input: {
  amount?: number;
  depositorText: string;
  bank?: boolean;
  cultureGift?: boolean;
  coin?: boolean;
}) {
  const payload = resolveAutoChargePayload(input);
  return payload?.amount ?? null;
}
