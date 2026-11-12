const API_BASE = "https://api.nowpayments.io/v1";

export type NowPaymentsCredentials = {
  apiKey: string;
  ipnSecret: string;
};

export type NowPaymentCreate = {
  payment_id: string;
  payment_status: string;
  pay_address: string;
  pay_amount: number;
  pay_currency: string;
  price_amount: number;
  price_currency: string;
  order_id: string;
  order_description?: string;
};

export async function createNowPayment(
  creds: NowPaymentsCredentials,
  input: {
    orderId: string;
    amountKrw: number;
    payCurrency?: string;
    ipnCallbackUrl: string;
    orderDescription?: string;
  },
): Promise<NowPaymentCreate> {
  const res = await fetch(`${API_BASE}/payment`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": creds.apiKey,
    },
    body: JSON.stringify({
      price_amount: input.amountKrw,
      price_currency: "krw",
      pay_currency: input.payCurrency ?? "usdttrc20",
      order_id: input.orderId,
      order_description: input.orderDescription ?? "DOES point charge",
      ipn_callback_url: input.ipnCallbackUrl,
    }),
  });

  const data = (await res.json()) as NowPaymentCreate & { message?: string };
  if (!res.ok) {
    throw new Error(data.message ?? "NOWPayments 결제 생성 실패");
  }
  return data;
}

/** IPN 서명 검증 (HMAC-SHA512) */
export async function verifyNowPaymentsIpnSignature(
  ipnSecret: string,
  body: string,
  signature: string | null,
): Promise<boolean> {
  if (!signature) return false;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(ipnSecret),
    { name: "HMAC", hash: "SHA-512" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body));
  const hex = Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  const expected = signature.toLowerCase();
  if (hex.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < hex.length; i++) {
    diff |= hex.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  return diff === 0;
}

export type NowPaymentsIpnPayload = {
  payment_id: string | number;
  payment_status: string;
  order_id: string;
  price_amount?: number;
  actually_paid?: number;
};

export function isNowPaymentCompleted(status: string) {
  const s = status.toLowerCase();
  return s === "finished" || s === "confirmed";
}
