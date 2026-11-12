"use client";

import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

export const TERMS_REQUIRED_MESSAGE = "이용약관과 개인정보처리방침에 동의해 주세요.";

/** 구매 직전 필수 동의 — 체크해야 결제 버튼이 열린다. 서버도 agreeTerms 를 확인한다. */
export function TermsConsent({
  checked,
  onChange,
  className,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  className?: string;
}) {
  return (
    <label className={cn("terms-consent", checked && "is-on", className)}>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span className="terms-consent-box" aria-hidden>
        <Check strokeWidth={3.2} />
      </span>
      <span className="terms-consent-text">
        <a href="/terms" target="_blank" rel="noopener noreferrer">
          이용약관
        </a>
        과{" "}
        <a href="/privacy" target="_blank" rel="noopener noreferrer">
          개인정보처리방침
        </a>
        을 확인했으며, 구매에 동의합니다. <b>(필수)</b>
      </span>
    </label>
  );
}
