<<<<<<< HEAD
# VENDIX

멀티테넌트 디지털 자판기 플랫폼.

- **플랫폼** `vendix.team` — 라이선스 구매 · 상점 등록
- **상점** `{상점명}.vendix.team` — 자판기 스토어프론트 · Admin `{상점명}.vendix.team/admin`
- **인증봇** `verify.vendix.team` — Discord 서버 인증 웹패널
- **티켓봇** `ticket.vendix.team` — Discord 티켓 · 트랜스크립트 ([docs/TICKET_BOT.md](docs/TICKET_BOT.md))
- 기본 상품 없음 — 상점 Admin에서 상품/시리얼 등록
- 저장소: `data/db.json`

## 흐름

1. 플랫폼에서 라이선스 구매 → 키 발급  
2. `/activate`에서 상점명(slug) 등록 → `slug.vendix.team` 활성화  
3. 상점 Admin에서 상품·재고 등록 후 판매  

## Env

```
NEXT_PUBLIC_ROOT_DOMAIN=vendix.team
NEXT_PUBLIC_APP_URL=https://vendix.team
```

로컬 개발: `NEXT_PUBLIC_ROOT_DOMAIN=localhost` → `http://{slug}.localhost:3000`

DNS (Cloudflare, **1회 설정 필수**):

| 타입 | 이름 | 값 | 프록시 |
|------|------|-----|--------|
| (기존) | `@` | Workers/apex | Proxied |
| **추가** | `*` | `100::` (AAAA) | **Proxied** |

`*.vendix.team` 와일드카드가 없으면 `test.vendix.team` 등 상점 서브도메인은 **DNS_PROBE_FINISHED_NXDOMAIN** 으로 열리지 않습니다.

Cloudflare 대시보드 → **vendix.team** → **DNS** → **레코드 추가**:
- 유형: `AAAA`
- 이름: `*`
- IPv6: `100::`
- 프록시: 켜짐(주황 구름)

Wrangler 라우트 `*.vendix.team/*` 는 이미 배포되어 있습니다. DNS만 추가하면 상점 주소(`{slug}.vendix.team`)가 동작합니다.

## Dev

```bash
npm install
npm run dev
```

- 플랫폼: http://localhost:3000  
- 상점 예 (로컬): http://my-shop.localhost:3000
- 상점 예 (프로덕션): https://my-shop.vendix.team  
=======
# 123
>>>>>>> 25b234d8ec13890e86b423a9a14c3083ff0564e7
