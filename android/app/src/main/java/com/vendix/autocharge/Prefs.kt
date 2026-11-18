package com.vendix.autocharge

import android.content.Context
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

object Prefs {
    private const val FILE = "vendix_autocharge"

    fun get(context: Context, key: String, default: String = ""): String =
        context.getSharedPreferences(FILE, Context.MODE_PRIVATE).getString(key, default) ?: default

    fun getBool(context: Context, key: String, default: Boolean = true): Boolean =
        context.getSharedPreferences(FILE, Context.MODE_PRIVATE).getBoolean(key, default)

    fun set(context: Context, key: String, value: String) {
        context.getSharedPreferences(FILE, Context.MODE_PRIVATE).edit().putString(key, value).apply()
    }

    fun setBool(context: Context, key: String, value: Boolean) {
        context.getSharedPreferences(FILE, Context.MODE_PRIVATE).edit().putBoolean(key, value).apply()
    }

    /** 마지막 입금 감지 결과 (앱 화면에 표시) */
    fun recordEvent(context: Context, line: String) {
        val time = SimpleDateFormat("MM/dd HH:mm:ss", Locale.KOREA).format(Date())
        set(context, KEY_LAST_EVENT, "$time  $line")
    }

    const val DEFAULT_BASE_URL = "https://doesmc.xyz"

    const val KEY_BASE_URL = "base_url"
    const val KEY_SHOP_SLUG = "shop_slug"
    const val KEY_DEVICE_KEY = "device_key"
    const val KEY_AUTO_CHARGE = "auto_charge_enabled"
    const val KEY_ALLOW_ALL_APPS = "allow_all_apps"
    const val KEY_LAST_EVENT = "last_event"
    const val KEY_LISTENER_AT = "listener_connected_at"
}
