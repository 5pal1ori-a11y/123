"use client";

import {
  AUTO_CHARGE_BANKS,
  autoChargeBankHint,
  isAutoChargeBank,
} from "@/lib/auto-charge-banks";

type AutoChargeBankSelectProps = {
  value: string;
  onChange: (value: string) => void;
  className?: string;
  id?: string;
};

export function AutoChargeBankSelect({ value, onChange, className, id }: AutoChargeBankSelectProps) {
  const legacy = value.trim() && !isAutoChargeBank(value);

  return (
    <div className="space-y-1.5">
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={className}
        required
      >
        <option value="" disabled>
          자동충전 가능 은행 선택
        </option>
        {legacy ? (
          <option value={value}>{value} (기존 · 목록에서 다시 선택 권장)</option>
        ) : null}
        {AUTO_CHARGE_BANKS.map((bank) => (
          <option key={bank.id} value={bank.name}>
            {bank.name}
          </option>
        ))}
      </select>
      <p className="text-xs text-neutral-600">{autoChargeBankHint(value)}</p>
    </div>
  );
}
