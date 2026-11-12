import type { Metadata } from "next";
import { LegalPageShell, LegalSection } from "@/components/platform/legal-page-shell";

export const metadata: Metadata = {
  title: "이용약관",
  description: "DOES 서비스 이용약관",
};

export default function TermsPage() {
  return (
    <LegalPageShell title="이용약관" updatedAt="2026년 9월 5일">
      <LegalSection title="1. 목적">
        <p>
          본 약관은 DOES(이하 &quot;회사&quot;)가 제공하는 디지털 상품 판매·자판기·Discord 봇
          연동 등 관련 서비스(이하 &quot;서비스&quot;)의 이용 조건과 회사와 이용자 간의 권리·의무를
          정합니다.
        </p>
      </LegalSection>

      <LegalSection title="2. 정의">
        <p>
          &quot;이용자&quot;란 본 약관에 동의하고 서비스를 이용하는 개인 또는 사업을 말합니다.
          &quot;상점&quot;이란 이용자가 개설·운영하는 하위 판매 공간을 말합니다.
          &quot;디지털 상품&quot;이란 코드·계정·라이선스 등 무형의 재화를 말합니다.
        </p>
      </LegalSection>

      <LegalSection title="3. 약관의 효력과 변경">
        <p>
          회사는 필요 시 약관을 개정할 수 있으며, 개정 시 서비스 내 공지 또는 웹사이트에
          게시합니다. 개정 약관은 게시일부터 효력이 발생하며, 이용자가 계속 서비스를 이용하면
          변경에 동의한 것으로 봅니다.
        </p>
      </LegalSection>

      <LegalSection title="4. 서비스 내용">
        <p>
          회사는 상점 개설, 상품·재고 관리, 결제·충전, Discord 봇/슬래시 명령, 웹 관리자
          패널 등 기능을 제공합니다. 구체 기능은 요금제·상점 설정에 따라 달라질 수 있습니다.
        </p>
      </LegalSection>

      <LegalSection title="5. 계정 및 보안">
        <p>
          이용자는 정확한 정보로 가입·연동해야 하며, 계정·연동 정보의 관리 책임은 이용자에게
          있습니다. Discord 등 외부 계정 연동 시 해당 플랫폼의 약관도 함께 적용됩니다.
        </p>
      </LegalSection>

      <LegalSection title="6. 디지털 상품 및 환불">
        <p>
          디지털 상품은 특성상  ind도 후 교환·환불이 제한될 수 있습니다. 상점별 추가 정책이
          있는 경우 해당 상점 약관이 우선 적용될 수 있으며, 법령상 청약철회가 가능한 경우에는
          관련 법령을 따릅니다.
        </p>
      </LegalSection>

      <LegalSection title="7. 금지 행위">
        <p>
          이용자는 불법·사기·부정 결제, 타인 사칭, 시스템 공격·자동화 악용, 무단 리셀링,
          법령 또는 공서양속에 반하는 상품 판매 등을 해서는 안 됩니다. 위반 시 이용 제한·계정
          정지·법적 조치가 이루어질 수 있습니다.
        </p>
      </LegalSection>

      <LegalSection title="8. 요금 및 구독">
        <p>
          유료 요금제·라이선스 이용 시 표시된 요금·기간·제한이 적용됩니다. 미납·만료 시 기능이
          제한될 수 있으며, 상세는 구매·활성화 화면의 안내를 따릅니다.
        </p>
      </LegalSection>

      <LegalSection title="9. 면책">
        <p>
          회사는 천재지변, 통신 장애, Discord 등 제3자 서비스 장애, 이용자 귀책으로 인한 손해에
          대해 법령이 허용하는 범위에서 책임을 제한합니다. 상점 간 거래의 1차 책임은 해당 상점
          운영자에게 있습니다.
        </p>
      </LegalSection>

      <LegalSection title="10. 준거법">
        <p>
          본 약관은 대한민국 법률에 따르며, 분쟁 발생 시 회사 소재지 관할 법원을 제1심 관할로
          합니다. 문의:{" "}
          <a className="text-white underline-offset-2 hover:underline" href="mailto:support@vendix.team">
            support@vendix.team
          </a>
        </p>
      </LegalSection>
    </LegalPageShell>
  );
}
