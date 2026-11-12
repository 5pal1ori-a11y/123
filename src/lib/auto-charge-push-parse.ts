/** Pushbullet / MacroDroid 은행 입금 알림 파싱
 *  버튼자판기 main.py `extract_bank_info` + api.py `extract` 기준
 */

export type BankPushInput = {
  body?: string;
  title?: string;
  package_name?: string;
  packageName?: string;
  application_name?: string;
  applicationName?: string;
};

export type ParsedBankPush = {
  depositorName: string;
  amount: number;
  bankHint: string | null;
  rawText: string;
};

/** MacroDroid / Pushbullet에서 받는 은행 알림 패키지 (버튼자판기 whitelist) */
export const AOS_BANK_PACKAGES = [
  "com.IBK.SmartPush.app",
  "com.kbstar.kbbank",
  "NH올원뱅크",
  "com.nh.mobilenoti",
  "nh.smart.banking",
  "nh.smart.nhcok",
  "com.wooribank.smart.npib",
  "com.kakaobank.channel",
  "com.kebhana.hanapush",
  "com.kbstar.starpush",
  "com.kbankwith.smartbank",
  "com.shinhan.sbanking",
  "viva.republica.toss",
  "com.smg.mgnoti",
  "com.kbstar.reboot",
] as const;

/** 은행 표시명 → MacroDroid package_name */
export const BANK_PACKAGE_BY_NAME: Record<string, string> = {
  카카오뱅크: "com.kakaobank.channel",
  토스뱅크: "viva.republica.toss",
  KB국민은행: "com.kbstar.kbbank",
  신한은행: "com.shinhan.sbanking",
  우리은행: "com.wooribank.smart.npib",
  하나은행: "com.kebhana.hanapush",
  NH농협은행: "com.nh.mobilenoti",
  IBK기업은행: "com.IBK.SmartPush.app",
  케이뱅크: "com.kbankwith.smartbank",
  새마을금고: "com.smg.mgnoti",
};

export function defaultPackageForBank(bankName: string) {
  return BANK_PACKAGE_BY_NAME[bankName] ?? "com.kakaobank.channel";
}

export function isAosBankPackage(packageName: string) {
  const pkg = packageName.trim();
  if (!pkg) return false;
  return (AOS_BANK_PACKAGES as readonly string[]).includes(pkg);
}

export function normDepositorName(value: string): string {
  return (value ?? "").trim().replace(/\s+/g, " ");
}

function digitsOnly(value: string): number | null {
  const n = Number(String(value).replace(/,/g, "").replace(/원/g, "").trim());
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : null;
}

function isDigitAmount(raw: string): number {
  const cleaned = raw.replace(/,/g, "").replace(/원/g, "").replace(/입금/g, "").trim();
  return /^\d+$/.test(cleaned) ? Number(cleaned) : 0;
}

/**
 * 버튼자판기 AOS extract — package/title/body → (amount, name)
 */
export function extractAosBankPush(
  packageName: string,
  title: string,
  body: string,
  applicationName?: string,
): { amount: number; name: string } {
  let amount = 0;
  let name = "";
  const pkg = packageName || "";
  const app = applicationName || "";

  try {
    if (pkg === "com.IBK.SmartPush.app") {
      const parts = body.split(" ");
      name = parts[2] ?? "";
      amount = isDigitAmount(parts[1] ?? "");
    } else if (pkg === "com.kbstar.kbbank") {
      amount = isDigitAmount((title.split(" ")[1] ?? "").replace(/,/g, ""));
      name = body.split(" ")[4] ?? "";
    } else if (pkg === "NH올원뱅크" || app === "NH올원뱅크" || pkg.includes("NH올원")) {
      const start = body.indexOf("입금");
      if (start >= 0) {
        const end = body.indexOf("원", start + 2);
        const amountStr = body.slice(start + 2, end >= 0 ? end : undefined).trim().replace(/,/g, "");
        amount = /^\d+$/.test(amountStr) ? Number(amountStr) : 0;
      }
      const lastLine = body.split("\n").pop() ?? "";
      const tokens = lastLine.split(/\s+/).filter(Boolean);
      name = tokens.length >= 2 ? tokens[tokens.length - 2]! : tokens[0] ?? "";
    } else if (pkg === "com.nh.mobilenoti" || pkg === "nh.smart.banking" || pkg === "nh.smart.nhcok") {
      const parts = body.split(" ");
      name = parts[5] ?? "";
      amount = isDigitAmount((parts[1] ?? "").replace(/입금/g, ""));
    } else if (pkg === "com.wooribank.smart.npib") {
      const parts = body.split(" ");
      // main.py: name=parts[2], amount=parts[3]
      name = parts[2] ?? "";
      amount = isDigitAmount(parts[3] ?? "");
      if (!amount || !name) {
        // api.py fallback
        name = parts[1] ?? "";
        amount = isDigitAmount(parts[5] ?? "");
      }
    } else if (pkg === "com.kakaobank.channel") {
      const parts = body.split(" ");
      name = parts[0] ?? "";
      const t1 = (title.split(" ")[1] ?? "").replace(/,/g, "").replace(/원/g, "");
      amount = /^\d+$/.test(t1) ? Number(t1) : 0;
    } else if (pkg === "com.kebhana.hanapush") {
      // main.py regex (더 정확)
      const match = body.match(/입금\s([\d,]+)원\n([가-힣A-Za-z*]+)\n잔액/);
      if (match) {
        amount = isDigitAmount(match[1] ?? "");
        name = match[2] ?? "";
      } else {
        const parts = body.split(" ");
        name = parts[0] ?? "";
        const rv = [...parts].reverse();
        amount = rv.length >= 6 ? isDigitAmount(rv[5] ?? "") : 0;
      }
    } else if (pkg === "com.kbstar.starpush") {
      const parts = body.split(" ");
      name = parts[3] ?? "";
      const raw = (parts[5] ?? "").replace(/,/g, "");
      amount = /^\d+$/.test(raw) ? Number(raw) : 0;
    } else if (pkg === "com.kbankwith.smartbank") {
      // main.py multiline
      const lines = body.split("\n");
      if (lines.length >= 2) {
        const amountStr = (lines[0] ?? "").replace(/입금\s*/g, "").replace(/원/g, "").replace(/,/g, "");
        amount = /^\d+$/.test(amountStr) ? Number(amountStr) : 0;
        name = ((lines[1] ?? "").split("|")[0] ?? "").trim();
      }
      if (!amount) {
        const parts = body.replace(/\n/g, " ").split(" ");
        amount = isDigitAmount(parts[1] ?? "");
        name = parts[2] ?? "";
      }
    } else if (pkg === "com.shinhan.sbanking") {
      const parts = body.split(" ");
      name = parts[1] ?? "";
      amount = isDigitAmount(parts[0] ?? "");
    } else if (pkg === "viva.republica.toss") {
      if (title.includes("입금")) {
        const amountStr = title.replace(/원\s*입금/g, "").replace(/,/g, "").trim();
        amount = /^\d+$/.test(amountStr) ? Number(amountStr) : 0;
        name = body.split(" ")[0] ?? "";
      } else if (title.includes("받았어요")) {
        const amountStr = title.replace(/원을\s*받았어요/g, "").replace(/,/g, "").trim();
        amount = /^\d+$/.test(amountStr) ? Number(amountStr) : 0;
        const parts = body.split(" ");
        name = (parts[0] ?? "").replace(/님이?$/, "");
      } else {
        const cand = body.replace(/,/g, "").match(/(\d+)/);
        if (cand) amount = Number(cand[1]);
        if (title.includes("님")) name = title.split("님")[0] ?? "";
        else name = body.split(" ")[0] ?? "";
      }
    } else if (pkg === "com.smg.mgnoti") {
      const parts = body.split(" ");
      amount = isDigitAmount(parts[1] ?? "");
      name = String(parts[parts.length - 1] ?? "");
    } else if (pkg === "com.kbstar.reboot") {
      const parts = body.split(" ");
      const raw = String(parts[1] ?? "").replace(/,/g, "");
      const amt = raw.length > 2 ? raw.slice(0, -2) : "";
      amount = /^\d+$/.test(amt) ? Number(amt) : 0;
      name = String(parts[0] ?? "").slice(0, -2);
    }
  } catch {
    return { amount: 0, name: "" };
  }

  return { amount, name: normDepositorName(name) };
}

function parseFromBodyTitle(input: BankPushInput): ParsedBankPush | null {
  const rawBody = String(input.body ?? "");
  const title = String(input.title ?? "");
  const pkg = String(input.package_name ?? input.packageName ?? "");
  const appName = String(input.application_name ?? input.applicationName ?? "");

  const { amount, name } = extractAosBankPush(pkg, title, rawBody, appName);
  if (!name || !amount) return null;

  return {
    depositorName: name,
    amount,
    bankHint: appName || pkg || null,
    rawText: [title, rawBody].filter(Boolean).join("\n"),
  };
}

/**
 * 버튼자판기 api.py `_parse_deposit_message` + 실제 은행 알림 보강
 * iOS 단축어가 알림 원문만 보낼 때 입금자명·금액을 추출합니다.
 */
export function parseIosDepositMessage(
  message: string,
): { name: string; amount: string } | null {
  const text = String(message || "")
    .replace(/\r\n/g, "\n")
    .replace(/\u00a0/g, " ")
    .trim();
  if (!text) return null;

  const patterns: Array<[RegExp, number, number]> = [
    // 카카오: [카카오뱅크] … 입금 10,000원 홍길동
    [/\[카카오뱅크\][\s\S]*?입금\s*([0-9,]+)원\s*([가-힣A-Za-z0-9*]+)/, 1, 2],
    // 입금 10,000원\n홍길동\n잔액 …
    [/입금\s*([0-9,]+)원\s*\n\s*([가-힣A-Za-z*]{2,20})\s*(?:\n|$)/, 1, 2],
    // 입금 10,000원 홍길동
    [/입금\s*([0-9,]+)원\s+([가-힣A-Za-z0-9*]{2,20})/, 1, 2],
    // 홍길동 10,000원 입금
    [/([가-힣A-Za-z0-9*]{2,20})\s*([0-9,]+)원\s*입금/, 2, 1],
    // 10,000원 입금 … 홍길동
    [/([0-9,]+)원\s*입금[\s\S]{0,40}?([가-힣A-Za-z*]{2,20})/, 1, 2],
    // 토스: 홍길동님이 10,000원을 보냈어요 / 입금했어요
    [/([가-힣A-Za-z*]{2,20})님이\s*.*?([0-9,]+)원/, 2, 1],
    // 제목형: 입금 10,000원 + 어딘가에 이름
    [/입금\s*([0-9,]+)원[\s\S]*?\n([가-힣A-Za-z*]{2,20})(?:\s|\n|$)/, 1, 2],
  ];

  for (const [pattern, amountIdx, nameIdx] of patterns) {
    const match = text.match(pattern);
    if (match?.[amountIdx] && match?.[nameIdx]) {
      const amount = match[amountIdx]!;
      const name = sanitizeIosName(match[nameIdx]!);
      if (name && amount) return { name, amount };
    }
  }

  // 금액만 잡고, 이름 후보를 줄에서 고름
  const amountMatch =
    text.match(/입금\s*([0-9,]+)원/) ||
    text.match(/([0-9,]+)원\s*입금/) ||
    text.match(/([0-9]{1,3}(?:,[0-9]{3})+|\d{4,})\s*원/);
  if (!amountMatch?.[1]) return null;

  const amount = amountMatch[1];
  const lines = text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  const blacklist = new Set([
    "카카오뱅크",
    "토스",
    "토스뱅크",
    "국민은행",
    "신한은행",
    "우리은행",
    "하나은행",
    "농협",
    "Web발신",
    "발신",
    "입금",
    "출금",
    "잔액",
    "송금",
    "이체",
    "알림",
    "은행",
  ]);

  for (const line of lines) {
    if (/원/.test(line) && /\d/.test(line)) continue;
    if (blacklist.has(line)) continue;
    const name = sanitizeIosName(line);
    if (name) return { name, amount };
  }

  const tokens = text.match(/[가-힣A-Za-z*]{2,20}/g) ?? [];
  const name = [...tokens]
    .reverse()
    .map(sanitizeIosName)
    .find((t) => t && !blacklist.has(t));
  if (name) return { name, amount };

  return null;
}

function sanitizeIosName(raw: string): string | null {
  const name = normDepositorName(raw.replace(/[님이은는을를]+$/g, ""));
  if (!name) return null;
  if (/^\d+$/.test(name)) return null;
  if (name.length < 2 || name.length > 20) return null;
  if (
    /^(카카오|토스|국민|신한|우리|하나|농협|잔액|입금|출금|송금|이체|알림|은행)/.test(
      name,
    )
  ) {
    return null;
  }
  return name;
}

/** 단축어/매크로가 message에 객체·배열을 넣어도 원문으로 합침 */
export function coerceAutoChargeMessage(raw: unknown): string {
  if (raw == null) return "";
  if (typeof raw === "string") return raw.trim();
  if (typeof raw === "number" || typeof raw === "boolean") return String(raw);
  if (Array.isArray(raw)) {
    return raw.map(coerceAutoChargeMessage).filter(Boolean).join("\n");
  }
  if (typeof raw === "object") {
    const o = raw as Record<string, unknown>;
    const parts = [o.title, o.body, o.text, o.message, o.content, o.msg]
      .map(coerceAutoChargeMessage)
      .filter(Boolean);
    if (parts.length) return parts.join("\n");
    try {
      return JSON.stringify(raw);
    } catch {
      return "";
    }
  }
  return "";
}

/** 알림 본문에서 입금자명 추출 (범용 fallback) */
export function parseDepositorNameFromText(text: string): string | null {
  const ios = parseIosDepositMessage(text);
  if (ios?.name) return normDepositorName(ios.name);

  const t = text.trim();
  if (!t) return null;

  const toss = t.match(/^(.+?)님이\s/);
  if (toss?.[1]) return normDepositorName(toss[1]);

  const from = t.match(/(?:입금자|보낸분|송금인)[:：\s]*([^\d,원\s]{2,20})/);
  if (from?.[1]) return normDepositorName(from[1]);

  const hana = t.match(/입금\s[\d,]+원\n([가-힣A-Za-z*]+)\n잔액/);
  if (hana?.[1]) return normDepositorName(hana[1]);

  const deposit = t.match(/입금\s*([^\d,원\s]{2,20})/);
  if (deposit?.[1]) return normDepositorName(deposit[1]);

  return null;
}

export function parseBankPush(input: BankPushInput): ParsedBankPush | null {
  const structured = parseFromBodyTitle(input);
  if (structured) return structured;

  const rawText = [input.title, input.body].filter(Boolean).join("\n");
  if (!rawText.trim()) return null;

  const amountMatch = rawText.match(/(\d{1,3}(?:,\d{3})+|\d+)\s*(?:원|KRW)/i);
  const amount = amountMatch?.[1] ? digitsOnly(amountMatch[1]) : null;
  const depositorName = parseDepositorNameFromText(rawText);
  if (!amount || !depositorName) return null;

  return {
    depositorName,
    amount,
    bankHint: input.package_name ?? input.packageName ?? input.application_name ?? null,
    rawText,
  };
}

export const BANK_PUSH_SAMPLES: Record<string, { title: string; body: string; package_name: string }> = {
  카카오뱅크: {
    title: "입금 10,000원",
    body: "홍길동",
    package_name: "com.kakaobank.channel",
  },
  토스뱅크: {
    title: "10,000원 입금",
    body: "홍길동 보냈어요",
    package_name: "viva.republica.toss",
  },
  KB국민은행: {
    title: "입금 10,000원",
    body: "KB 입금 알림 내용 홍길동 님",
    package_name: "com.kbstar.kbbank",
  },
  신한은행: {
    title: "입금",
    body: "10,000원 홍길동",
    package_name: "com.shinhan.sbanking",
  },
  우리은행: {
    title: "입금",
    body: "우리은행 알림 홍길동 10000원",
    package_name: "com.wooribank.smart.npib",
  },
  하나은행: {
    title: "입금",
    body: "입금 10,000원\n홍길동\n잔액 50,000원",
    package_name: "com.kebhana.hanapush",
  },
  NH농협은행: {
    title: "입금",
    body: "농협 10000원 입금 알림 기타 홍길동",
    package_name: "com.nh.mobilenoti",
  },
  IBK기업은행: {
    title: "입금",
    body: "기업 10,000원 홍길동",
    package_name: "com.IBK.SmartPush.app",
  },
  케이뱅크: {
    title: "입금",
    body: "입금 10,000원\n홍길동|체크카드",
    package_name: "com.kbankwith.smartbank",
  },
  새마을금고: {
    title: "입금",
    body: "MG 10000원 입금 홍길동",
    package_name: "com.smg.mgnoti",
  },
};
