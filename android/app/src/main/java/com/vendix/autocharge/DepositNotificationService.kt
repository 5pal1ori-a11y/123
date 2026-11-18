package com.vendix.autocharge

import android.content.ComponentName
import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification
import android.util.Log

/**
 * 은행 앱의 입금 알림을 읽어 /api/charges/auto 로 보낸다.
 * - 은행 앱 알림만 (카톡 등 다른 앱에 "입금 1,000원" 이라고 써서 충전을 승인시키는 것을 막는다)
 * - 출금 알림 제외, 같은 알림은 5분 안에 한 번만
 * - 리스너가 끊기면 다시 붙는다
 */
class DepositNotificationService : NotificationListenerService() {

    companion object {
        private const val TAG = "VendixAutoCharge"
        private const val DEDUPE_MS = 5 * 60_000L

        /** 서버(src/lib/auto-charge-push-parse.ts)가 형식을 아는 은행 앱 */
        val BANK_PACKAGES = setOf(
            "com.kakaobank.channel",
            "viva.republica.toss",
            "com.kbstar.kbbank",
            "com.kbstar.starpush",
            "com.shinhan.sbanking",
            "com.wooribank.smart.npib",
            "com.kebhana.hanapush",
            "com.nh.mobilenoti",
            "nh.smart.banking",
            "nh.smart.nhcok",
            "com.IBK.SmartPush.app",
            "com.kbankwith.smartbank",
            "com.smg.mgnoti",
        )

        private val recent = LinkedHashMap<String, Long>()

        @Synchronized
        private fun seen(key: String): Boolean {
            val now = System.currentTimeMillis()
            recent.entries.removeAll { now - it.value > DEDUPE_MS }
            if (recent.containsKey(key)) return true
            recent[key] = now
            return false
        }
    }

    override fun onListenerConnected() {
        super.onListenerConnected()
        Prefs.set(this, Prefs.KEY_LISTENER_AT, System.currentTimeMillis().toString())
    }

    override fun onListenerDisconnected() {
        super.onListenerDisconnected()
        // 업데이트·절전 등으로 끊기면 조용히 멈추므로 다시 붙여 달라고 요청한다
        requestRebind(ComponentName(this, DepositNotificationService::class.java))
    }

    override fun onNotificationPosted(sbn: StatusBarNotification?) {
        if (sbn == null) return
        if (!Prefs.getBool(this, Prefs.KEY_AUTO_CHARGE, true)) return

        val pkg = sbn.packageName ?: return
        val allowAll = Prefs.getBool(this, Prefs.KEY_ALLOW_ALL_APPS, false)
        if (!allowAll && pkg !in BANK_PACKAGES) return

        val extras = sbn.notification?.extras ?: return
        val title = extras.getCharSequence("android.title")?.toString()?.trim().orEmpty()
        val text = extras.getCharSequence("android.text")?.toString()?.trim().orEmpty()
        val bigText = extras.getCharSequence("android.bigText")?.toString()?.trim().orEmpty()
        val body = if (bigText.length >= text.length) bigText else text
        val combined = "$title\n$body"

        // 입금 알림만 (출금·결제 알림은 금액이 있어도 보내지 않는다)
        if (!combined.contains("입금")) return
        if (title.startsWith("출금") || title.contains("출금 ")) return

        val amount = ApiClient.parseAmount(combined) ?: return
        if (seen("$pkg|$combined")) return

        val baseUrl = Prefs.get(this, Prefs.KEY_BASE_URL)
        val shopSlug = Prefs.get(this, Prefs.KEY_SHOP_SLUG)
        val deviceKey = Prefs.get(this, Prefs.KEY_DEVICE_KEY)
        if (baseUrl.isBlank() || shopSlug.isBlank() || deviceKey.isBlank()) {
            Prefs.recordEvent(this, "설정 없음 — 주소·상점·시크릿을 저장하세요 ($amount 원)")
            return
        }

        Thread {
            val result = ApiClient.postAutoCharge(baseUrl, shopSlug, deviceKey, amount, title, body, pkg)
            Log.i(TAG, "auto charge amount=$amount code=${result.code} response=${result.response}")
            Prefs.recordEvent(this, "${"%,d".format(amount)}원 · ${ApiClient.describe(result)}")
        }.start()
    }
}
