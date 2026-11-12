# VENDIX AutoCharge (Android)



입금 알림을 읽어 `/api/charges/auto`로 자동 충전 승인하는 관리자용 앱입니다.



## 빌드

### CLI (Windows, 권장)

```powershell
cd C:\vendix\android   # 또는 android/ 폴더
powershell -ExecutionPolicy Bypass -File .\build-apk.ps1
```

첫 실행 시 Android SDK(`C:\vendix\android-sdk`)와 Gradle wrapper를 자동 설치합니다.  
생성 APK → `public/downloads/vendix-autocharge.apk`

### Android Studio

1. Android Studio에서 `android/` 폴더 열기
2. Build → Build Bundle(s) / APK(s) → Build APK(s)
3. 생성된 APK를 `public/downloads/vendix-autocharge.apk`에 복사



## 웹에서 연동 (권장)



1. 상점 Admin 로그인

2. `{shop}.vendix.team/download` 접속

3. **APK 다운로드** → 설치

4. **QR 스캔** 또는 **앱으로 연동 열기** → 시크릿·상점·URL 자동 입력

5. 알림 접근 권한 허용



Deep link: `vendix://pair?shop={slug}&key={deviceKey}&base=https://vendix.team`



## 수동 설정



- **Shop slug**: 상점 주소 (예: `myshop`)

- **API Base URL**: `https://vendix.team`

- **Device Key**: Admin → 스토어 설정 → APK 시크릿



## 자동충전 ON/OFF



- **앱**: 메인 화면 스위치

- **서버**: Admin → 스토어 설정 → Android 자동충전 활성화

- 서버가 OFF면 API가 403 반환 (앱 ON이어도 승인 안 됨)



## API



```

GET /api/charges/auto

Headers: x-orel-shop, x-vendix-device



POST /api/charges/auto

Headers: x-orel-shop: {slug}

Body: { amount, depositorText, deviceKey }

```



앱은 은행 입금 알림 텍스트에서 금액을 파싱해 위 API를 호출합니다.

## iOS 단축어 (iPhone)

Android APK와 **동일 API** · **동일 Device Key**를 사용합니다.

### iOS 18~25 (대부분의 iPhone)

Apple이 **「알림 받을 때」 자동화를 제공하지 않습니다.** 개인용 자동화 목록에 「알림」이 없는 것이 정상입니다.

**권장 — 클립보드 방식**
1. 단축어 앱에서 「클립보드 가져오기」→「URL POST」 단축어 생성 (Admin → iOS 탭 → 클립보드 안내)
2. 입금 알림 → 길게 눌러 **복사** → 「VENDIX 입금」 단축어 실행

**대안**
- **SMS 자동화**: 입금 **문자**가 오는 은행 → 자동화 → **메시지** (알림 아님)
- **Android APK** 또는 **Pushbullet** (Android 폰으로 알림 전달)

### iOS 26 이상

「개인용 자동화 → **알림**」 트리거 사용 가능 (Admin → iOS 26+ 탭 참고).  
일부 은행은 알림 본문이 단축어에 전달되지 않을 수 있어 클립보드 방식이 더 안정적입니다.

상점 Admin → **계좌관리** → **자동충전 · 폰 연동** → iOS 단축어
