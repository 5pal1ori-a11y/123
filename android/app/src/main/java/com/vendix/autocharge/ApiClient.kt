package com.vendix.autocharge

import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.util.regex.Pattern

object ApiClient {
    private val amountPattern = Pattern.compile("(\\d{1,3}(?:,\\d{3})+|\\d+)\\s*원")

    fun parseAmount(text: String): Int? {
        val m = amountPattern.matcher(text)
        if (!m.find()) return null
        return m.group(1)?.replace(",", "")?.toIntOrNull()
    }

    fun postAutoCharge(
        baseUrl: String,
        shopSlug: String,
        deviceKey: String,
        amount: Int,
        depositorText: String,
    ): Pair<Boolean, String> {
        val url = URL("${baseUrl.trimEnd('/')}/api/charges/auto")
        val conn = (url.openConnection() as HttpURLConnection).apply {
            requestMethod = "POST"
            setRequestProperty("Content-Type", "application/json")
            setRequestProperty("x-orel-shop", shopSlug)
            doOutput = true
            connectTimeout = 10000
            readTimeout = 10000
        }
        val body = JSONObject()
            .put("amount", amount)
            .put("depositorText", depositorText)
            .put("deviceKey", deviceKey)
            .toString()
        conn.outputStream.use { it.write(body.toByteArray(Charsets.UTF_8)) }
        val code = conn.responseCode
        val stream = if (code in 200..299) conn.inputStream else conn.errorStream
        val response = stream?.bufferedReader()?.use { it.readText() } ?: ""
        conn.disconnect()
        return Pair(code in 200..299, response)
    }

    fun fetchStatus(baseUrl: String, shopSlug: String, deviceKey: String): Pair<Boolean, Boolean> {
        val url = URL("${baseUrl.trimEnd('/')}/api/charges/auto")
        val conn = (url.openConnection() as HttpURLConnection).apply {
            requestMethod = "GET"
            setRequestProperty("x-orel-shop", shopSlug)
            setRequestProperty("x-vendix-device", deviceKey)
            connectTimeout = 10000
            readTimeout = 10000
        }
        val code = conn.responseCode
        if (code !in 200..299) {
            conn.disconnect()
            return Pair(false, true)
        }
        val text = conn.inputStream.bufferedReader().use { it.readText() }
        conn.disconnect()
        return try {
            val json = JSONObject(text)
            Pair(true, json.optBoolean("autoChargeEnabled", true))
        } catch (_: Exception) {
            Pair(true, true)
        }
    }
}
