import Image from "next/image";
import { ArrowRight, BadgeCheck, BarChart3, Box, Crown, Gamepad2, KeyRound, Link2, Medal, Search, ShieldCheck, Store } from "lucide-react";
import { DOES_MC_ORIGIN, MFA_SITE_ORIGIN } from "@/lib/domain";
import { getShopBySlug, initStore, MFA_SHOP_SLUG } from "@/lib/store";

export const dynamic = "force-dynamic";
export const metadata = {
  title: { absolute: "DOES · 마인크래프트 계정의 모든 것" },
  description: "마인크래프트 정품 계정 상점 · 안전거래 · 렌탈 · 시세 · 웹마크까지. 도스.com",
};

const SHOP = MFA_SITE_ORIGIN;
const DISCORD = "https://discord.gg/doesmc";

const SERVICES = [
  { icon: Store, title: "계정 상점", body: "정품 계정 · 망토 계정을 포인트로 바로. 결제하면 자동 지급.", href: `${SHOP}/dashboard?tab=products` },
  { icon: BadgeCheck, title: "도스마켓", body: "내 계정을 DOES가 대신 팔아 드려요. 구매자 보호 24시간 뒤 정산.", href: `${SHOP}/dashboard?tab=dosmarket` },
  { icon: Link2, title: "안전거래 링크", body: "밖에서 만난 거래도 돈은 DOES가 맡아요. 문제 생기면 환불.", href: `${SHOP}/dashboard?tab=dosmarket&sub=safe` },
  { icon: KeyRound, title: "계정 렌탈", body: "비싼 망토 계정, 필요한 기간만 빌려 쓰세요.", href: `${SHOP}/dashboard?tab=rental` },
  { icon: Medal, title: "시즌패스", body: "출석 · 구매로 레벨업하고 일반 · 패스 보상을 받아요.", href: `${SHOP}/dashboard?tab=season` },
  { icon: Crown, title: "도스플랜", body: "추가 할인 · 우선 구매 · 매달 포인트. BASIC · PASS+.", href: `${SHOP}/dashboard?tab=premium` },
  { icon: ShieldCheck, title: "계정 여권", body: "QR 하나로 계정 이력 · 진품 여부를 확인해요.", href: `${SHOP}/passport` },
  { icon: Search, title: "닉네임 조회", body: "스킨 · 망토 · 닉네임 이력 · 하이픽셀을 한 번에.", href: `${SHOP}/mc` },
  { icon: BarChart3, title: "거래소 전광판", body: "실시간 체결 · 오늘 거래액 · 망토 시세 등락.", href: `${SHOP}/board` },
];

async function liveStats() {
  try {
    await initStore();
    const shop = getShopBySlug(MFA_SHOP_SLUG);
    if (!shop) return null;
    const { boardData } = await import("@/lib/board");
    return await boardData(shop.id);
  } catch {
    return null;
  }
}

export default async function DoesIntroPage() {
  const stats = await liveStats();
  const won = (n: number) => `₩${Math.round(n).toLocaleString("ko-KR")}`;
  return (
    <div className="min-h-screen overflow-x-hidden bg-[#06080d] text-slate-100">
      <div className="pointer-events-none fixed inset-0" style={{ background: "radial-gradient(ellipse 70% 50% at 50% -10%, rgba(16,185,129,0.22), transparent 70%), radial-gradient(ellipse 50% 40% at 90% 30%, rgba(99,102,241,0.12), transparent 70%)" }} />

      <header className="relative mx-auto flex max-w-6xl items-center justify-between px-5 py-5">
        <div className="flex items-center gap-2.5">
          <Image src="/does-logo.png" alt="DOES" width={36} height={36} />
          <span className="text-lg font-black tracking-tight">DOES</span>
        </div>
        <nav className="flex items-center gap-2 text-sm">
          <a href={DOES_MC_ORIGIN} className="hidden rounded-xl px-3 py-2 font-semibold text-slate-300 hover:text-white sm:block">웹마크</a>
          <a href={DISCORD} className="hidden rounded-xl px-3 py-2 font-semibold text-slate-300 hover:text-white sm:block">디스코드</a>
          <a href={SHOP} className="rounded-xl bg-emerald-500 px-4 py-2 font-bold text-white">상점 가기</a>
        </nav>
      </header>

      <main className="relative mx-auto max-w-6xl px-5">
        <section className="pb-14 pt-16 text-center sm:pt-24">
          <p className="text-xs font-bold tracking-[0.4em] text-emerald-400">MINECRAFT ACCOUNT PLATFORM</p>
          <h1 className="mx-auto mt-4 max-w-3xl text-4xl font-black leading-tight tracking-tight sm:text-6xl">
            마인크래프트 계정의
            <br />
            <span className="bg-gradient-to-r from-emerald-300 to-cyan-300 bg-clip-text text-transparent">모든 것, DOES</span>
          </h1>
          <p className="mx-auto mt-5 max-w-xl text-base text-slate-400 sm:text-lg">
            사고 · 팔고 · 빌리고 · 확인하고 · 놀고. 계정 거래에 필요한 건 전부 한곳에, 돈은 DOES가 안전하게 맡아요.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <a href={SHOP} className="flex items-center gap-1.5 rounded-2xl bg-emerald-500 px-6 py-3.5 text-base font-bold text-white shadow-[0_0_40px_rgba(16,185,129,0.35)]">
              상점 둘러보기 <ArrowRight className="size-4" />
            </a>
            <a href={DOES_MC_ORIGIN} className="flex items-center gap-1.5 rounded-2xl border border-white/15 bg-white/5 px-6 py-3.5 text-base font-bold">
              <Gamepad2 className="size-4" /> 웹마크 하러 가기
            </a>
          </div>

          {stats ? (
            <div className="mx-auto mt-12 grid max-w-3xl grid-cols-3 gap-3">
              {[
                ["누적 거래", `${stats.allTime.trades.toLocaleString("ko-KR")}건`],
                ["판매 중 매물", `${stats.listings.toLocaleString("ko-KR")}개`],
                ["오늘 거래액", won(stats.today.volume)],
              ].map(([l, v]) => (
                <div key={l} className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                  <p className="text-xl font-black sm:text-2xl">{v}</p>
                  <p className="mt-0.5 text-xs text-slate-400">{l}</p>
                </div>
              ))}
            </div>
          ) : null}
        </section>

        <section className="py-12">
          <h2 className="text-center text-2xl font-black sm:text-3xl">DOES에서 할 수 있는 것</h2>
          <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {SERVICES.map(({ icon: Icon, title, body, href }) => (
              <a key={title} href={href} className="group rounded-2xl border border-white/10 bg-white/[0.03] p-5 transition hover:border-emerald-400/50 hover:bg-white/[0.05]">
                <Icon className="size-6 text-emerald-400" />
                <p className="mt-3 flex items-center gap-1 text-base font-bold">
                  {title} <ArrowRight className="size-3.5 opacity-0 transition group-hover:opacity-100" />
                </p>
                <p className="mt-1 text-sm text-slate-400">{body}</p>
              </a>
            ))}
          </div>
        </section>

        <section className="grid gap-4 py-12 lg:grid-cols-2">
          <div className="rounded-3xl border border-white/10 bg-gradient-to-br from-emerald-500/15 to-transparent p-7">
            <ShieldCheck className="size-8 text-emerald-400" />
            <h3 className="mt-3 text-xl font-black">돈은 DOES가 맡아요</h3>
            <ul className="mt-3 space-y-1.5 text-sm text-slate-300">
              <li>· 구매자가 낸 돈은 DOES가 보관하고, 계정이 문제없을 때만 판매자에게 정산</li>
              <li>· 받은 뒤 24시간 구매자 보호 — 문제가 있으면 신고 한 번으로 정산 중지</li>
              <li>· 계정 로그인 정보는 암호화해서 보관, 결제한 사람에게만 전달</li>
              <li>· 계정 여권 QR로 이력과 진품 여부를 누구나 확인</li>
            </ul>
          </div>
          <a href={DOES_MC_ORIGIN} className="block rounded-3xl border border-white/10 bg-gradient-to-br from-indigo-500/15 to-transparent p-7 transition hover:border-indigo-400/50">
            <Box className="size-8 text-indigo-300" />
            <h3 className="mt-3 text-xl font-black">웹마크 · mc.도스.com</h3>
            <p className="mt-3 text-sm text-slate-300">브라우저에서 바로 하는 마인크래프트. 메인 광장에서 친구를 만나고, 야생 서버에서 살아남고, 나만의 섬을 꾸며요. 사고 싶은 계정의 스킨 · 망토를 미리 입어 볼 수도 있어요.</p>
            <p className="mt-4 flex items-center gap-1 text-sm font-bold text-indigo-300">지금 들어가기 <ArrowRight className="size-4" /></p>
          </a>
        </section>

        <section className="py-14 text-center">
          <h2 className="text-2xl font-black sm:text-3xl">지금 DOES에 들어와요</h2>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <a href={SHOP} className="rounded-2xl bg-emerald-500 px-6 py-3.5 font-bold text-white">상점 · shop.도스.com</a>
            <a href={DISCORD} className="rounded-2xl bg-[#5865F2] px-6 py-3.5 font-bold text-white">디스코드 참여</a>
          </div>
        </section>
      </main>

      <footer className="relative border-t border-white/5 py-8 text-center text-xs text-slate-500">
        <p>DOES · 도스.com</p>
        <p className="mt-1">
          <a href={`${SHOP}/does-terms`} className="hover:text-slate-300">이용약관</a> · <a href={`${SHOP}/privacy`} className="hover:text-slate-300">개인정보처리방침</a>
        </p>
      </footer>
    </div>
  );
}
