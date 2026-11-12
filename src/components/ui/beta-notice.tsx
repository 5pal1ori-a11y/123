/** 전체 공지 — 모든 화면 위 가운데에 항상 떠 있다. 클릭을 막지 않는다 */
export function BetaNotice() {
  return (
    <div
      role="status"
      data-beta-notice
      className="pointer-events-none fixed left-1/2 top-[calc(env(safe-area-inset-top)+6px)] z-[2147483000] -translate-x-1/2 select-none"
    >
      <div className="flex items-center gap-1.5 whitespace-nowrap rounded-full border border-white/12 bg-[#0a0a0f]/75 py-1 pl-1 pr-3 text-[11px] font-medium leading-none text-white/85 shadow-[0_6px_20px_-8px_rgba(0,0,0,0.7)] backdrop-blur-md">
        <span className="rounded-full bg-amber-400/90 px-1.5 py-[3px] font-[family-name:var(--font-jetbrains)] text-[9px] font-bold tracking-[0.12em] text-[#1a1203]">
          BETA
        </span>
        베타테스트 중입니다
      </div>
    </div>
  );
}
