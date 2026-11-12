package com.vendix.autocharge

import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification
import android.util.Log

class DepositNotificationService : NotificationListenerService() {
    override fun onNotificationPosted(sbn: StatusBarNotification?) {
        if (sbn == null) return
        if (!Prefs.getBool(this, Prefs.KEY_AUTO_CHARGE, true)) return

        val extras = sbn.notification.extras ?: return
        val title = extras.getCharSequence("android.title")?.toString() ?: ""
        val text = extras.getCharSequence("android.text")?.toString() ?: ""
        val bigText = extras.getCharSequence("android.bigText")?.toString() ?: ""
        val combined = "$title $text $bigText"

        if (!combined.contains("입금") && !combined.contains("송금") && !combined.contains("이체")) {
            return
        }

        val amount = ApiClient.parseAmount(combined) ?: return
        val baseUrl = Prefs.get(this, Prefs.KEY_BASE_URL)
        val shopSlug = Prefs.get(this, Prefs.KEY_SHOP_SLUG)
        val deviceKey = Prefs.get(this, Prefs.KEY_DEVICE_KEY)
        if (baseUrl.isBlank() || shopSlug.isBlank() || deviceKey.isBlank()) return

        Thread {
            val (ok, response) = ApiClient.postAutoCharge(baseUrl, shopSlug, deviceKey, amount, combined)
            Log.i("VendixAutoCharge", "auto charge amount=$amount ok=$ok response=$response")
        }.start()
    }
}
