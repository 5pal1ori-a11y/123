"use client";

import { Download, Shield, Smartphone, Zap } from "lucide-react";

export function DownloadPageClient({ shopName }: { shopSlug: string; shopName: string }) {
  return (
    <div className="space-y-4">
      <h1 className="flex items-center gap-2 text-xl font-bold">
        <Smartphone className="size-6 text-tint" /> Android 앱
      </h1>

      <div className="glass-thick rounded-3xl p-6 text-center">
        <div className="mx-auto flex size-20 items-center justify-center rounded-3xl bg-tint/10">
          <Download className="size-10 text-tint" />
        </div>
        <h2 className="mt-4 text-lg font-bold">DOES AutoCharge</h2>
        <p className="mt-2 text-sm text-text-secondary">
          입금 알림을 읽어 포인트 충전을 자동 승인합니다.
          <br />
          상점: {shopName}
        </p>
        <a
          href="/downloads/vendix-autocharge.apk"
          download="vendix-autocharge.apk"
          className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-tint py-4 font-semibold text-black"
        >
          <Download className="size-5" /> APK 다운로드
        </a>
        <p className="mt-3 text-[11px] text-label">Android 8.0+ · 알림 접근 권한 필요</p>
      </div>

      <div className="space-y-3">
        {[
          { icon: Zap, title: "자동 매칭", desc: "금액 + 입금자명으로 충전 자동 승인" },
          { icon: Shield, title: "보안 연동", desc: "Admin 패널에서만 기기 연동 · ON/OFF 관리" },
          { icon: Smartphone, title: "백그라운드", desc: "은행 앱 입금 알림을 실시간 감지" },
        ].map((item) => (
          <div key={item.title} className="glass flex gap-3 rounded-2xl p-4">
            <item.icon className="size-6 shrink-0 text-tint" />
            <div>
              <p className="font-semibold">{item.title}</p>
              <p className="text-xs text-label">{item.desc}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="glass rounded-2xl p-4 text-xs text-label">
        <p className="font-semibold text-text">설정 방법</p>
        <ol className="mt-2 list-decimal space-y-1 pl-4">
          <li>위 APK를 폰에 설치</li>
          <li>Admin 패널 → <strong>자동충전</strong> 메뉴에서 QR · 시크릿 연동</li>
          <li>알림 접근 권한 허용</li>
        </ol>
      </div>
    </div>
  );
}
