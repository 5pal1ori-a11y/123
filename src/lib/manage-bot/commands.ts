export const MANAGE_DISCORD_COMMANDS = [
  {
    name: "등록",
    description: "이 서버에 관리봇을 등록합니다.",
    type: 1,
  },
  {
    name: "배너패널",
    description: "상단 배너 생성 패널을 올립니다.",
    type: 1,
  },
  {
    name: "배너라이센스",
    description: "상단 배너 라이선스를 발급합니다.",
    type: 1,
    options: [
      {
        name: "일수",
        description: "배너 유지 일수",
        type: 4,
        required: true,
        min_value: 1,
        max_value: 365,
      },
      {
        name: "갯수",
        description: "발급 개수",
        type: 4,
        required: true,
        min_value: 1,
        max_value: 50,
      },
    ],
  },
  {
    name: "파트너설정",
    description: "자동 파트너 홍보 설정을 확인·변경합니다.",
    type: 1,
    options: [
      {
        name: "문구",
        description: "홍보 메시지",
        type: 3,
        required: false,
      },
      {
        name: "웹훅명",
        description: "웹훅에 표시될 이름",
        type: 3,
        required: false,
      },
      {
        name: "웹훅사진",
        description: "웹훅 아바타 URL",
        type: 3,
        required: false,
      },
      {
        name: "시",
        description: "발송 시각 (KST 시 0-23)",
        type: 4,
        required: false,
        min_value: 0,
        max_value: 23,
      },
      {
        name: "분",
        description: "발송 시각 (KST 분 0-59)",
        type: 4,
        required: false,
        min_value: 0,
        max_value: 59,
      },
      {
        name: "사용",
        description: "자동 발송 ON/OFF (1=켜기 0=끄기)",
        type: 4,
        required: false,
        min_value: 0,
        max_value: 1,
      },
    ],
  },
  {
    name: "파트너웹훅",
    description: "파트너 웹훅 URL을 추가합니다.",
    type: 1,
    options: [
      {
        name: "url",
        description: "Discord 웹훅 URL",
        type: 3,
        required: true,
      },
      {
        name: "이름",
        description: "웹훅 라벨 (관리용)",
        type: 3,
        required: false,
      },
    ],
  },
  {
    name: "파트너즉시",
    description: "등록된 웹훅에 홍보 메시지를 지금 보냅니다.",
    type: 1,
  },
  {
    name: "임배드생성",
    description: "임베드를 만들고 선택한 채널로 전송합니다.",
    type: 1,
  },
] as const;
