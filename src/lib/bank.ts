export type BankInfo = {
  bankName: string;
  accountNumber: string;
  accountHolder: string;
};

export function getPlatformBank(): BankInfo {
  return {
    bankName: process.env.BANK_NAME ?? "카카오뱅크",
    accountNumber: process.env.BANK_ACCOUNT ?? "3333-01-1234567",
    accountHolder: process.env.BANK_HOLDER ?? "DOES",
  };
}

export function getShopBank(shop?: {
  bankName?: string | null;
  bankAccount?: string | null;
  bankHolder?: string | null;
}): BankInfo {
  const platform = getPlatformBank();
  return {
    bankName: shop?.bankName?.trim() || platform.bankName,
    accountNumber: shop?.bankAccount?.trim() || platform.accountNumber,
    accountHolder: shop?.bankHolder?.trim() || platform.accountHolder,
  };
}
