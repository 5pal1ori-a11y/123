export function adminLogLabel(action: string): string {
  switch (action) {
    case "order.points":
    case "order.paid":
    case "order.dispensed":
      return "상품 구매";
    case "charge.complete":
      return "포인트 충전";
    case "charge.auto.matched":
      return "자동충전 승인";
    case "charge.auto.unmatched":
      return "자동충전 실패 (맞는 신청 없음)";
    case "referral.apply":
      return "추천인 등록";
    case "referral.reward":
      return "추천 보상 지급";
    case "user.register":
    case "user.google":
      return "신규 가입";
    case "inventory.bulk_add":
      return "재고 입고";
    case "banner.approve":
      return "배너 승인";
    case "banner.purchase":
      return "배너 신청";
    case "banner.reject":
      return "배너 거절";
    case "banner.takedown":
      return "배너 내림";
    case "inquiry.create":
      return "문의 접수";
    case "inquiry.reply":
      return "문의 답변";
    case "product.create":
      return "상품 등록";
    case "product.update":
      return "상품 수정";
    case "user.update":
      return "회원 수정";
    case "user.delete":
    case "user.self_delete":
      return "계정 삭제";
    case "backup.import":
      return "백업 복원";
    case "settings.update":
      return "설정 변경";
    case "shop.profile_update":
      return "상점 프로필 수정";
    default:
      return action;
  }
}
