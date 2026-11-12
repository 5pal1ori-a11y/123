const USER = 6;
const STRING = 3;
const INTEGER = 4;

function perm(...bits: number[]) {
  let v = BigInt(0);
  for (const b of bits) v |= BigInt(1) << BigInt(b);
  return String(v);
}

export const SECURITY_DISCORD_COMMANDS = [
  {
    name: "등록",
    description: "이 서버를 보안봇에 등록합니다. 웹패널은 Discord 소유자 로그인입니다.",
    type: 1,
    default_member_permissions: perm(5), // MANAGE_GUILD
  },
  {
    name: "보안웹",
    description: "보안봇 웹패널 링크 (Discord 소유자 로그인)",
    type: 1,
    default_member_permissions: perm(5),
  },
  {
    name: "킥",
    description: "유저를 서버에서 추방합니다.",
    type: 1,
    default_member_permissions: perm(1), // KICK_MEMBERS
    options: [
      { type: USER, name: "유저", description: "추방할 유저", required: true },
      { type: STRING, name: "사유", description: "킥 사유", required: false },
    ],
  },
  {
    name: "밴",
    description: "유저를 서버에서 차단합니다.",
    type: 1,
    default_member_permissions: perm(2), // BAN_MEMBERS
    options: [
      { type: USER, name: "유저", description: "차단할 유저", required: true },
      { type: STRING, name: "사유", description: "밴 사유", required: false },
      {
        type: INTEGER,
        name: "삭제기간",
        description: "최근 메시지 삭제(일, 0~7)",
        required: false,
        min_value: 0,
        max_value: 7,
      },
      {
        type: INTEGER,
        name: "기간분",
        description: "임시밴 분(비우면 영구)",
        required: false,
        min_value: 1,
        max_value: 525600,
      },
    ],
  },
  {
    name: "언밴",
    description: "유저 차단을 해제합니다.",
    type: 1,
    default_member_permissions: perm(2),
    options: [
      { type: STRING, name: "유저id", description: "언밴할 유저 ID", required: true },
      { type: STRING, name: "사유", description: "사유", required: false },
    ],
  },
  {
    name: "뮤트",
    description: "유저를 타임아웃(뮤트)합니다.",
    type: 1,
    default_member_permissions: perm(40), // MODERATE_MEMBERS
    options: [
      { type: USER, name: "유저", description: "뮤트할 유저", required: true },
      {
        type: INTEGER,
        name: "분",
        description: "타임아웃 시간(분)",
        required: true,
        min_value: 1,
        max_value: 40320,
      },
      { type: STRING, name: "사유", description: "사유", required: false },
    ],
  },
  {
    name: "언뮤트",
    description: "유저 타임아웃을 해제합니다.",
    type: 1,
    default_member_permissions: perm(40),
    options: [
      { type: USER, name: "유저", description: "언뮤트할 유저", required: true },
      { type: STRING, name: "사유", description: "사유", required: false },
    ],
  },
  {
    name: "청소",
    description: "채널에서 최근 메시지를 삭제합니다.",
    type: 1,
    default_member_permissions: perm(13), // MANAGE_MESSAGES
    options: [
      {
        type: INTEGER,
        name: "개수",
        description: "삭제할 메시지 수 (1~100)",
        required: true,
        min_value: 1,
        max_value: 100,
      },
      { type: USER, name: "유저", description: "특정 유저만 (선택)", required: false },
    ],
  },
  {
    name: "락다운",
    description: "서버를 긴급 잠금합니다 (@everyone 메시지 차단).",
    type: 1,
    default_member_permissions: perm(5),
    options: [{ type: STRING, name: "사유", description: "사유", required: false }],
  },
  {
    name: "언락",
    description: "서버 락다운을 해제합니다.",
    type: 1,
    default_member_permissions: perm(5),
  },
  {
    name: "경고",
    description: "유저에게 경고를 기록하고 로그에 남깁니다.",
    type: 1,
    default_member_permissions: perm(13),
    options: [
      { type: USER, name: "유저", description: "대상 유저", required: true },
      { type: STRING, name: "사유", description: "경고 사유", required: true },
    ],
  },
  {
    name: "보안상태",
    description: "현재 보안 설정·락다운 상태를 확인합니다.",
    type: 1,
  },
  {
    name: "오토모드동기화",
    description: "웹패널 설정을 Discord AutoMod 규칙에 다시 적용합니다.",
    type: 1,
    default_member_permissions: perm(5),
  },
  {
    name: "슬로우모드",
    description: "현재 채널 슬로우모드(초)를 설정합니다. 0이면 해제.",
    type: 1,
    default_member_permissions: perm(4), // MANAGE_CHANNELS
    options: [
      {
        type: INTEGER,
        name: "초",
        description: "0~21600",
        required: true,
        min_value: 0,
        max_value: 21600,
      },
    ],
  },
  {
    name: "닉네임초기화",
    description: "유저 서버 닉네임을 초기화합니다.",
    type: 1,
    default_member_permissions: perm(27), // MANAGE_NICKNAMES
    options: [
      { type: USER, name: "유저", description: "대상 유저", required: true },
      { type: STRING, name: "사유", description: "사유", required: false },
    ],
  },
  {
    name: "유저정보",
    description: "유저 가입·역할·타임아웃 등 보안 정보를 확인합니다.",
    type: 1,
    options: [{ type: USER, name: "유저", description: "대상 유저", required: true }],
  },
  {
    name: "경고목록",
    description: "유저의 최근 경고 기록을 확인합니다.",
    type: 1,
    default_member_permissions: perm(13),
    options: [{ type: USER, name: "유저", description: "대상 유저", required: true }],
  },
  {
    name: "스냅샷",
    description: "채널·역할 구조 스냅샷을 저장합니다.",
    type: 1,
    default_member_permissions: perm(5),
    options: [{ type: STRING, name: "라벨", description: "메모", required: false }],
  },
  {
    name: "스냅샷목록",
    description: "저장된 스냅샷 목록을 확인합니다.",
    type: 1,
    default_member_permissions: perm(5),
  },
  {
    name: "보안리포트",
    description: "최근 7일 보안 이벤트 요약을 지금 보냅니다.",
    type: 1,
    default_member_permissions: perm(5),
  },
] as const;
