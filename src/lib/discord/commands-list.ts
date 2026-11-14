export const VENDIX_DISCORD_COMMANDS = [
  {
    name: "island",
    description: "회원의 스카이블럭 섬을 사진으로 봅니다.",
    description_localizations: { ko: "회원의 스카이블럭 섬을 사진으로 봅니다." },
    type: 1,
    options: [
      {
        name: "user",
        name_localizations: { ko: "닉네임" },
        description: "섬을 볼 회원 (비우면 내 섬)",
        type: 6,
        required: false,
      },
    ],
  },
  {
    name: "버튼",
    description: "버튼을 생성합니다.",
    type: 1,
  },
  {
    name: "웹패널",
    description: "웹패널 로그인 정보를 확인합니다.",
    type: 1,
  },
  {
    name: "서버정보",
    description: "이 서버의 라이센스 정보를 확인합니다.",
    type: 1,
  },
  {
    name: "개인봇설정",
    description: "개인봇 토큰 변경, 시작, 정지, 연장을 관리합니다.",
    type: 1,
  },
  {
    name: "개인봇",
    description: "개인봇 라이센스를 생성합니다.",
    type: 1,
    options: [
      {
        name: "일수",
        description: "라이센스 일수",
        type: 4,
        required: true,
        min_value: 1,
      },
      {
        name: "갯수",
        description: "생성 갯수",
        type: 4,
        required: false,
        min_value: 1,
        max_value: 20,
      },
    ],
  },
  {
    name: "수동충전",
    description: "유저에게 잔액을 수동 충전합니다.",
    type: 1,
    options: [
      {
        name: "유저",
        description: "충전할 Discord 유저",
        type: 6,
        required: true,
      },
      {
        name: "금액",
        description: "충전 금액",
        type: 4,
        required: true,
        min_value: 1,
      },
    ],
  },
  {
    name: "자판기",
    description: "자판기 패널을 엽니다.",
    type: 1,
  },
  {
    name: "연동",
    description: "상점 계정과 디스코드를 연동합니다",
    type: 1,
    options: [
      {
        name: "코드",
        description: "마이페이지에서 발급한 연동 코드 (비우면 인증하기 버튼)",
        type: 3,
        required: false,
      },
    ],
  },
  {
    name: "충전",
    description: "충전하기",
    type: 1,
    options: [
      {
        name: "금액",
        description: "충전할 금액 (원)",
        type: 4,
        required: false,
        min_value: 1,
      },
    ],
  },
  {
    name: "설정",
    description: "디스코드 봇 설정 (관리자)",
    type: 1,
  },
  {
    name: "추가",
    description: "재고현황 채널에 상품을 올립니다.",
    type: 1,
    options: [
      {
        name: "상품",
        description: "웹에 등록된 상품",
        type: 3,
        required: true,
        autocomplete: true,
      },
      {
        name: "분류",
        description: "자판기상품 또는 개별상품",
        type: 3,
        required: true,
        choices: [
          { name: "자판기상품", value: "vending" },
          { name: "개별상품", value: "individual" },
        ],
      },
    ],
  },
  {
    name: "삭제",
    description: "재고현황 채널에서 상품을 내립니다.",
    type: 1,
    options: [
      {
        name: "상품",
        description: "웹에 등록된 상품",
        type: 3,
        required: true,
        autocomplete: true,
      },
      {
        name: "분류",
        description: "내릴 분류",
        type: 3,
        required: true,
        choices: [
          { name: "자판기상품", value: "vending" },
          { name: "개별상품", value: "individual" },
        ],
      },
    ],
  },
  {
    name: "재고현황",
    description: "지금 어떤 상품이 재고가 있고 없는지 실시간으로 봅니다.",
    type: 1,
    options: [
      {
        name: "채널",
        description: "관리자: 이 채널에 자동으로 갱신되는 재고판을 올립니다",
        type: 7,
        channel_types: [0, 5],
        required: false,
      },
    ],
  },
  {
    name: "임배드생성",
    description: "메시지를 만들어 원하는 채널로 보냅니다 (관리자)",
    type: 1,
    default_member_permissions: "32",
  },
  {
    name: "입고알림",
    description: "상품이 입고되면 알림을 보낼 채널을 정합니다 (관리자)",
    type: 1,
    default_member_permissions: "32",
    options: [
      {
        name: "채널",
        description: "입고 알림을 보낼 채널",
        type: 7,
        channel_types: [0, 5],
        required: true,
      },
      {
        name: "역할",
        description: "알림과 함께 멘션할 역할 (선택)",
        type: 8,
        required: false,
      },
    ],
  },
  {
    name: "재고요청",
    description: "재고 요청 패널을 채널에 올립니다 (관리자)",
    type: 1,
    options: [
      {
        name: "받을채널",
        description: "손님 요청을 받을 채널 (한 번 지정하면 기억해요)",
        type: 7,
        channel_types: [0, 5],
        required: false,
      },
    ],
  },
  {
    name: "랜덤박스",
    description: "랜덤박스 패널을 채널에 올립니다 (관리자)",
    type: 1,
    default_member_permissions: "32",
  },
  {
    name: "서버상황",
    description: "관리자 온라인/오프라인 패널을 채널에 올립니다 (관리자)",
    type: 1,
    // 관리자 확인은 명령 처리에서 한다 (권한 필터로 목록에서 숨지 않게)
    options: [
      {
        name: "대상",
        description: "상태를 보여줄 관리자 (비우면 기본 관리자)",
        type: 6,
        required: false,
      },
    ],
  },
  {
    name: "계정등록",
    description: "마크 계정 판매 글을 올립니다 (관리자)",
    type: 1,
    options: [
      { name: "닉네임", description: "마인크래프트 닉네임", type: 3, required: true, min_length: 3, max_length: 16 },
      { name: "가격", description: "판매 가격 (원)", type: 4, required: true, min_value: 0 },
      { name: "접두사", description: "채널·제목 앞에 붙일 말 (예: NON, 비우면 지난번 값)", type: 3, required: false, max_length: 12 },
      { name: "카테고리", description: "채널을 만들 카테고리 (한 번 정하면 기억해요)", type: 7, required: false, channel_types: [4] },
    ],
  },
  {
    name: "추천인",
    description: "추천인 코드 안내를 채널에 올립니다",
    type: 1,
    // 관리자 확인은 명령 처리에서 한다 (권한 필터로 목록에서 숨지 않게)
  },
] as const;

/** DOES 봇 서버에만 올리는 명령 (티켓 · 이벤트) */
export const DOES_BOT_COMMANDS = [
  {
    name: "티켓설정",
    description: "티켓 카테고리 · 주제 · 멘션 역할 · 로그 채널을 버튼으로 설정합니다 (관리자)",
    type: 1,
    default_member_permissions: "32",
  },
  {
    name: "티켓패널",
    description: "티켓 열기 패널을 채널에 올립니다 (관리자)",
    type: 1,
    default_member_permissions: "32",
    options: [
      { type: 7, name: "채널", description: "올릴 채널 (비우면 지금 채널)", channel_types: [0, 5], required: false },
      { type: 3, name: "제목", description: "패널 제목", required: false, max_length: 100 },
      { type: 3, name: "설명", description: "패널 설명", required: false, max_length: 1000 },
      { type: 3, name: "이미지", description: "배너 이미지 URL", required: false, max_length: 500 },
    ],
  },
  {
    name: "임배드",
    description: "FRESH MFA · 망토 상품 카드를 재고와 함께 채널에 올립니다 (관리자)",
    type: 1,
    default_member_permissions: "32",
    options: [
      {
        type: 3,
        name: "종류",
        description: "올릴 상품 카드",
        required: true,
        choices: [
          { name: "FRESH MFA", value: "fresh_mfa" },
          { name: "망토", value: "cape" },
        ],
      },
      { type: 7, name: "채널", description: "올릴 채널 (비우면 지금 채널)", channel_types: [0, 5], required: false },
    ],
  },
  {
    name: "이벤트생성",
    description: "참여하기 버튼으로 응모하는 추첨 이벤트를 엽니다 (관리자)",
    type: 1,
    default_member_permissions: "32",
    options: [
      { type: 3, name: "경품", description: "경품 이름", required: true, max_length: 100 },
      { type: 4, name: "당첨자수", description: "뽑을 인원", required: true, min_value: 1, max_value: 50 },
      { type: 4, name: "시간", description: "진행 시간 (1시간 단위, 최대 336시간)", required: true, min_value: 1, max_value: 336 },
      { type: 3, name: "내용", description: "이벤트 설명 (선택)", required: false, max_length: 1000 },
      { type: 7, name: "채널", description: "올릴 채널 (비우면 지금 채널)", channel_types: [0, 5], required: false },
    ],
  },
] as const;
