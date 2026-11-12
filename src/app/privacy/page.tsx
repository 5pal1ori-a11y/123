import type { Metadata } from "next";
import { LegalPageShell, LegalSection } from "@/components/platform/legal-page-shell";

export const metadata: Metadata = {
  title: "개인정보 처리방침",
  description: "DOES 개인정보 처리방침",
};

export default function PrivacyPage() {
  return (
    <LegalPageShell title="개인정보 처리방침" updatedAt="2026년 9월 5일">
      <LegalSection title="1. 수집하는 개인정보">
        <p>회사는 서비스 제공을 위해 다음 정보를 수집할 수 있습니다.</p>
        <ul className="list-disc space-y-1 pl-5 text-neutral-400">
          <li>계정: 이메일, 닉네임, 비밀번호(해시), 상점 관리자 정보</li>
          <li>결제·충전: 입금자명, 금액, 주문·거래 기록, 암호화폐/문화상품권 처리에 필요한 최소 정보</li>
          <li>Discord 연동: Discord 사용자 ID, 사용자명, 아바타, 서버(Guild) ID, OAuth 토큰(연동 목적 범위)</li>
          <li>이용 기록: 접속 로그, 기기/세션 식별값, 고객 문의 내용</li>
        </ul>
      </LegalSection>

      <LegalSection title="2. 이용 목적">
        <p>
          회원 식별 및 인증, 상점·자판기 운영, 결제·충전·발송, Discord 봇·연결 역할 인증,
          고객 지원, 부정 이용 방지, 서비스 개선 및 공지 전달 목적으로 처리합니다.
        </p>
      </LegalSection>

      <LegalSection title="3. 보유 및 이용 기간">
        <p>
          원칙적으로 목적 달성 후 지체 없이 파기합니다. 다만 관련 법령에 따라 거래·분쟁·세무
          관련 기록은 일정 기간 보관할 수 있으며, Discord 연동 정보는 연동 해제 또는 계정 삭제
          시 삭제·비식별화합니다.
        </p>
      </LegalSection>

      <LegalSection title="4. 제3자 제공 및 처리 위탁">
        <p>
          회사는 이용자 동의 없이 개인정보를 외부에 제공하지 않습니다. 다만 Discord 등 연동
          기능 이용 시 해당 플랫폼으로 필요한 범위의 정보가 전송될 수 있으며, 인프라(예:
          Cloudflare) 운영을 위해 처리가 위탁될 수 있습니다.
        </p>
      </LegalSection>

      <LegalSection title="5. 이용자 권리">
        <p>
          이용자는 개인정보 열람·정정·삭제·처리정지·연동 해제를 요청할 수 있습니다. 요청은
          서비스 내 설정 또는{" "}
          <a className="text-white underline-offset-2 hover:underline" href="mailto:privacy@vendix.team">
            privacy@vendix.team
          </a>
          으로 가능합니다. 법령상 보관이 필요한 경우 해당 범위에서는 삭제가 제한될 수 있습니다.
        </p>
      </LegalSection>

      <LegalSection title="6. 안전성 확보 조치">
        <p>
          비밀번호 해시 저장, 전송 구간 암호화(HTTPS), 접근 권한 제한, 세션·CSRF 보호 등
          합리적 보안 조치를 적용합니다. 다만 인터넷 특성상 완전한 보안을 보장할 수는 없습니다.
        </p>
      </LegalSection>

      <LegalSection title="7. Discord 연결 역할">
        <p>
          Discord &quot;연결된 역할&quot; 인증 시 OAuth를 통해 계정 식별 정보를 확인하고, 역할
          조건에 필요한 메타데이터(예: 인증 여부, 연동 여부)를 Discord에 전달할 수 있습니다.
          이용자는 Discord 설정에서 연동을 해제할 수 있습니다.
        </p>
      </LegalSection>

      <LegalSection title="8. 고지 및 문의">
        <p>
          본 방침이 변경되면 웹사이트에 게시합니다. 개인정보 보호 관련 문의:{" "}
          <a className="text-white underline-offset-2 hover:underline" href="mailto:privacy@vendix.team">
            privacy@vendix.team
          </a>
        </p>
      </LegalSection>
    </LegalPageShell>
  );
}
