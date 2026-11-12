export const TICKET_DISCORD_COMMANDS = [
  {
    name: "등록",
    description: "이 서버를 티켓봇에 등록합니다. 웹패널은 Discord 소유자 로그인입니다.",
    type: 1,
  },
  {
    name: "티켓패널",
    description: "이 채널에 티켓 생성 패널(주제 드롭다운)을 게시합니다.",
    type: 1,
  },
  {
    name: "티켓웹",
    description: "티켓 웹패널 링크 (Discord 소유자 로그인)",
    type: 1,
  },
] as const;
