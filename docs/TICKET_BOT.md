# Vendix Ticket Bot

`ticket.vendix.team` — Discord 티켓봇 + 웹패널.

## Discord 앱 설정

1. [Discord Developer Portal](https://discord.com/developers/applications)에서 앱 생성
2. Bot 추가 → Privileged intents는 불필요 (Interactions + REST만 사용)
3. OAuth2 URL Generator: `bot` + `applications.commands`
   - 권한: Manage Channels, View Channels, Send Messages, Read Message History, Manage Roles(선택)
4. **Interactions Endpoint URL**  
   `https://vendix.team/api/ticket-bot/interactions`

## Cloudflare secrets

```bash
npx wrangler secret put TICKET_DISCORD_PUBLIC_KEY
npx wrangler secret put TICKET_DISCORD_APPLICATION_ID
npx wrangler secret put TICKET_DISCORD_BOT_TOKEN
```

`AUTH_SECRET`은 기존 값 재사용 (웹패널 세션).

## 사용 흐름

1. 봇을 서버에 초대
2. `/등록` → 웹패널 URL + 비밀번호 발급
3. `https://ticket.vendix.team/{guildId}` 로그인
4. 설정: 티켓 카테고리, 닫기 역할, 로그 채널, 주제 CRUD
5. `/티켓패널` → 주제 드롭다운 게시
6. 유저가 주제 선택 → `주제-유저명` 채널 생성
7. 닫기(디스코드 버튼 또는 웹) → 트랜스크립트  
   `https://ticket.vendix.team/{guildId}/{username}/{n}`

## 명령

| 명령 | 설명 |
|------|------|
| `/등록` | 서버 등록 · 비번 발급 · 길드 명령 등록 |
| `/티켓패널` | 현재 채널에 패널 게시 |
| `/티켓웹` | 웹패널 링크 |
