export const VERIFY_DISCORD_COMMANDS = [
  {
    name: "등록",
    description: "이 서버를 인증봇에 등록하고 복구키를 발급합니다. 웹패널은 상점 관리자 로그인입니다.",
    type: 1,
  },
  {
    name: "인증",
    description: "인증 패널을 이 채널에 게시합니다.",
    type: 1,
    options: [
      {
        type: 3,
        name: "캠페인",
        description: "유입 추적용 캠페인 태그 (선택)",
        required: false,
      },
    ],
  },
  {
    name: "복구",
    description: "복구키로 저장된 인증 유저를 이 서버에 초대합니다.",
    type: 1,
    options: [
      {
        type: 3,
        name: "복구키",
        description: "/등록 시 받은 복구키",
        required: true,
      },
    ],
  },
  {
    name: "통계",
    description: "오늘 입장·인증·차단·의심점수를 확인합니다.",
    type: 1,
  },
  {
    name: "차단추가",
    description: "유저 ID를 인증 블랙리스트에 추가합니다.",
    type: 1,
    options: [
      {
        type: 3,
        name: "유저id",
        description: "Discord 유저 스노우플레이크",
        required: true,
      },
    ],
  },
  {
    name: "차단해제",
    description: "블랙리스트에서 유저 ID를 제거합니다.",
    type: 1,
    options: [
      {
        type: 3,
        name: "유저id",
        description: "Discord 유저 스노우플레이크",
        required: true,
      },
    ],
  },
] as const;
