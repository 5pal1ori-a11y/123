import { Lock } from "lucide-react";

export const LOGIN_REQUIRED_ITEMS = [
  "구매 및 주문 처리",
  "개인 잔액과 포인트 확인",
  "출석 보상과 계정 연동",
  "개인정보가 포함된 마이페이지 이용",
];

/** "로그인이 필요합니다" 안내 — 게스트가 로그인 전용 기능을 눌렀을 때 */
export function LoginRequiredNotice({ className = "" }: { className?: string }) {
  return (
    <div className={`text-left ${className}`}>
      <p className="flex items-center gap-2 text-base font-bold">
        <Lock className="size-4" />
        로그인이 필요합니다
      </p>
      <p className="mt-1.5 text-xs opacity-70">상품과 상점은 로그인 없이 둘러볼 수 있어요. 아래 기능은 Discord 로그인 후 이용할 수 있어요.</p>
      <ul className="mt-3 space-y-1.5 text-sm">
        {LOGIN_REQUIRED_ITEMS.map((t) => (
          <li key={t} className="flex items-center gap-2">
            <span className="size-1.5 shrink-0 rounded-full bg-current opacity-60" />
            {t}
          </li>
        ))}
      </ul>
    </div>
  );
}
