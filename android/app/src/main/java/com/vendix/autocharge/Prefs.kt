package com.vendix.autocharge

import android.content.Context

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

    const val KEY_BASE_URL = "base_url"
    const val KEY_SHOP_SLUG = "shop_slug"
    const val KEY_DEVICE_KEY = "device_key"
    const val KEY_AUTO_CHARGE = "auto_charge_enabled"
}
