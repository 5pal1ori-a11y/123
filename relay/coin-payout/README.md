# 코인대행 송금 중계 서버

NOWPayments 송금(Payout) API 는 **허용한 IP 에서만**, **2FA 확인**을 거쳐야 코인을 보낼 수 있습니다.
사이트(Cloudflare Workers)는 고정 IP 가 없어서, 고정 IP VPS 에서 이 서버를 돌립니다.

사이트 → (서명된 요청) → 이 서버 → NOWPayments 로그인 · 송금 생성 · 2FA 확인 → 상태 확인 → 사이트로 결과 (서명)

## 1. NOWPayments 준비
1. 대시보드 → Settings → Payments → **API key** 발급
2. 대시보드 → Account settings → **2FA 를 Google Authenticator 로** 켜기. QR 아래 **시크릿 키(base32)** 를 따로 저장
3. 대시보드 → Payouts / Mass payouts → **Whitelisted IP** 에 VPS 공인 IP 추가
4. 커스터디(보관) 잔고에 보낼 LTC · USDT(TRC20) 를 미리 넣어 두기 (송금 수수료도 잔고에서 나감)

## 2. VPS 설치 (Ubuntu 기준)
```bash
sudo apt-get install -y nodejs caddy   # Node 18 이상
sudo mkdir -p /opt/coin-payout && sudo cp server.mjs /opt/coin-payout/
```
`/etc/coin-payout.env` (권한 600):
```
RELAY_SECRET=<32자 이상 무작위 — 사이트 COIN_RELAY_SECRET 과 같게>
NP_API_KEY=...
NP_EMAIL=...
NP_PASSWORD=...
NP_TOTP_SECRET=...
CALLBACK_HOSTS=doesmc.xyz
MAX_AMOUNTS=ltc:20,usdttrc20:800
DATA_FILE=/opt/coin-payout/payouts.json
```
`/etc/systemd/system/coin-payout.service`:
```
[Service]
EnvironmentFile=/etc/coin-payout.env
ExecStart=/usr/bin/node /opt/coin-payout/server.mjs
WorkingDirectory=/opt/coin-payout
Restart=always
[Install]
WantedBy=multi-user.target
```
`/etc/caddy/Caddyfile` (도메인 A 레코드를 VPS IP 로):
```
relay.example.com {
  reverse_proxy 127.0.0.1:8787
}
```
```bash
sudo systemctl enable --now coin-payout && sudo systemctl reload caddy
```

## 3. 사이트에 연결
Cloudflare Workers `vendix` → Settings → Variables and Secrets 에 **Secret** 으로:
- `COIN_RELAY_URL` = `https://relay.example.com`
- `COIN_RELAY_SECRET` = 위 RELAY_SECRET 과 같은 값

설정 전에는 관리자가 직접 보내고 TXID 를 적는 방식으로 동작합니다.

## 안전장치
- 같은 주문 ID 는 한 번만 송금 (payouts.json 에 기록)
- 한 건 최대 수량(MAX_AMOUNTS) 초과 · 허용 안 된 코인 · 결과 주소(CALLBACK_HOSTS) 밖이면 거절
- 요청은 5분 안의 HMAC 서명만 받음 · 127.0.0.1 에서만 듣고 HTTPS 는 Caddy 가 처리
- 6시간 안에 송금이 안 끝나면 자동 실패 처리하지 않음 (중복 송금 방지) → NOWPayments 대시보드에서 확인
