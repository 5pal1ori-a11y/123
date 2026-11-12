import type { Metadata } from "next";
import { LegalPageShell, LegalSection } from "@/components/platform/legal-page-shell";

export const metadata: Metadata = {
  title: "DOES 이용약관",
  description: "DOES 청약 철회 · 환불 · 결제 · 계정 · 디스코드 서버 이용약관",
};

/** https://doesmc.xyz/이용약관 (middleware 가 이 경로로 rewrite) */
export default function DoesTermsPage() {
  return (
    <LegalPageShell brandOnly title="DOES 이용약관" updatedAt="2026년 10월 9일">
      <LegalSection title="청약 철회">
        <p>
          환불 또는 동일 제품 교체는 두 가지 중 하나의 방식으로만 처리되며, 중복 보상은 불가능합니다.
        </p>
        <p>
          또한, 아래에 명시된 3가지 기준을 모두 충족하고 이를 확인할 수 있는 명확한 증거가 있을 경우에만
          진행됩니다. 만약 단 하나라도 조건을 충족하지 않거나, 고객 측 사유(설정 미비, 약관 위반 등)가
          확인될 경우에는 디지털 상품의 특성상 환불 또는 교체가 어려울 수 있습니다.
        </p>
        <ol className="list-decimal space-y-1 pl-6">
          <li>보증 기간 내 문의한 경우</li>
          <li>영상 자료 등 명확히 입증할 수 있는 증거 자료가 확보된 경우</li>
          <li>제품 명 또는 제품 상세 설명에 보증 가능 제품이라는 것이 명시되어 있을 경우</li>
        </ol>
      </LegalSection>

      <LegalSection title="결제 완료 후 취소 및 자금 반환 규정 (자금 세탁 및 3자 사기 방지)">
        <p>
          당사는 보이스피싱, 제3자 사기, 상품권 악용 및 자금 세탁 등 각종 금융 범죄를 예방하고 안전한 거래
          환경을 유지하기 위해 결제 방식별 환불 정책을 엄격하게 운영하고 있습니다. 결제가 완료되는 시점에
          아래 내용에 동의한 것으로 간주됩니다.
        </p>
      </LegalSection>

      <LegalSection title="주문 진행 이후 취소 및 환불 제한">
        <p>
          결제 완료 후 내부 담당자가 주문 처리에 착수한 경우(예: 외부 공급처 결제 진행, 금액 충전 완료 등),
          디지털 상품 특성상 해당 주문은 취소나 환불이 불가능합니다. 이는 결제 수단과 관계없이 동일하게
          적용됩니다.
        </p>
      </LegalSection>

      <LegalSection title="결제 방식별 환불 기준">
        <p>
          환불이 승인되는 경우에도, 최초 결제 방식에 따라 동일한 경로로만 처리됩니다. 서로 다른 결제
          수단으로의 변경 환불(예: 상품권 → 현금 등)은 허용되지 않습니다.
        </p>
        <h3 className="pt-2 font-bold text-white">3-1. 계좌이체 결제</h3>
        <p>
          금융 사고 방지를 위해 당사에서 고객 계좌로 직접 송금하는 방식은 지원하지 않습니다. 환불을 원하실
          경우, 송금한 은행을 통해 공식적인 반환 요청 절차를 직접 진행해야 합니다. 이후 해당 기관의 요청이
          접수되고, 내부 기준을 충족한 경우에 한해 협조가 이루어집니다.
        </p>
        <h3 className="pt-2 font-bold text-white">3-2. 라이트코인(LTC) 결제</h3>
        <p>
          가상자산 특성상 환불은 원칙적으로 어렵습니다. 다만 예외적으로 승인된 경우, 결제 시 수령된 코인
          수량 기준으로 반환되거나 사이트 잔액으로 전환됩니다. 이 과정에서 발생하는 네트워크 수수료는 이용자
          부담이며, 시세 변동에 따른 손실은 별도로 보상되지 않습니다.
        </p>
      </LegalSection>

      <LegalSection title="결제 약관의 변동 사항">
        <ul className="list-disc space-y-1 pl-6">
          <li>
            회사는 본 결제 관련 약관을 변경할 수 있으며, 변동사항이 있을 경우 커뮤니티(디스코드)를 통해
            안내합니다.
          </li>
        </ul>
      </LegalSection>

      <LegalSection title="제3자 결제 및 대리 결제 관련 안내">
        <p>
          당사는 보이스피싱, 자금 세탁, 타인 명의 도용 등 금융 범죄를 예방하기 위해, 본인 명의가 아닌
          제3자를 통한 입금이나 결제 대행을 엄격히 제한하고 있습니다. 타인 명의로 이루어진 결제는 이상
          거래로 간주될 수 있습니다.
        </p>
      </LegalSection>

      <LegalSection title="위반 시 처리 기준">
        <p>
          제3자 결제, 대리 결제 또는 이에 준하는 거래가 확인될 경우, 해당 주문은 즉시 취소 처리되며 서비스
          이용이 제한됩니다. 또한 처리 과정과 관계없이 관련 주문 및 이용 권한은 모두 회수될 수 있습니다.
        </p>
      </LegalSection>

      <LegalSection title="수동지급">
        <p>
          수동지급 제품의 경우 최대 지급되는데까지 걸리는 시간이 <b className="text-white">48시간</b>입니다.
          이점 꼭 인지하고 구매 부탁드립니다.
        </p>
      </LegalSection>

      <LegalSection title="마인크래프트 계정관련">
        <p>
          모든 마인크래프트 계정은 구매해서 가져오는것이기 때문에 계정이 잠금(락) 당할 확률이 조금씩이라도
          있습니다.
        </p>
        <p>
          이렇기에 도스에선 보증이 가능한 제품들을 계속해서 입고하고있으며 풀보증이라고 적혀있지않은 계정에서
          문제가 발생했을시 보증을 해드리기가 어렵다는점 인지 부탁드립니다.
        </p>
      </LegalSection>

      <LegalSection title="디스코드 서버 관련">
        <p>디스코드 서버에서 흔히 말하는 &quot;뒷메&quot;를 하다가 걸릴시 서비스 이용이 제한될수있습니다.</p>
        <ul className="list-disc space-y-1 pl-6">
          <li>
            적당한 욕설은 허락되나 비방목적의 욕설이나 비하발언 및 성관련발언 시에는 불이익조치가 있을 수
            있습니다.
          </li>
          <li>뒷메, 앞메는 사유 불문하고 서버차단 대상입니다.</li>
          <li>관리자에게 심한욕설 또는 모욕적인 말을할시 서버차단 대상입니다.</li>
          <li>
            마인크래프트 계정회수는 책임 일절 안집니다 앞으로 (보안 카테고리에서 Window Hello 초기화 꼭
            해주세요)
          </li>
        </ul>
      </LegalSection>
    </LegalPageShell>
  );
}
