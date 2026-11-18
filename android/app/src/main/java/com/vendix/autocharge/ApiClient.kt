package com.vendix.autocharge

import org.json.JSONObject
import java.io.IOException
import java.net.HttpURLConnection
import java.net.URL
import java.util.regex.Pattern

object ApiClient {
    private val amountPattern = Pattern.compile("(\\d{1,3}(?:,\\d{3})+|\\d+)\\s*원")

    data class Result(val code: Int, val response: String)

    fun parseAmount(text: String): Int? {
        val m = amountPattern.matcher(text)
        if (!m.find()) return null
        return m.group(1)?.replace(",", "")?.toIntOrNull()?.takeIf { it > 0 }
    }

    /**
     * 입금 알림 전송. 제목·본문·앱 이름을 그대로 보내 서버가 은행별 형식으로 입금자명을 읽는다.
     * 네트워크 오류·서버 오류(5xx)는 최대 3번 다시 보낸다.
     */
    fun postAutoCharge(
        baseUrl: String,
        shopSlug: String,
        deviceKey: String,
        amount: Int,
        title: String,
        body: String,
        packageName: String,
    ): Result {
        val payload = JSONObject()
            .put("amount", amount)
            .put("depositorText", "$title\n$body".trim())
            .put("deviceKey", deviceKey)
            .put(
                "push",
                JSONObject()
                    .put("title", title)
                    .put("body", body)
                    .put("package_name", packageName),
            )
            .toString()

        var last = Result(0, "")
        val waits = longArrayOf(0L, 2_000L, 5_000L)
        for (wait in waits) {
            if (wait > 0) Thread.sleep(wait)
            last = try {
                request("POST", "${baseUrl.trimEnd('/')}/api/charges/auto", shopSlug, deviceKey, payload)
            } catch (e: IOException) {
                Result(0, e.message ?: "network error")
            }
            if (last.code in 200..499) return last
        }
        return last
    }

    fun fetchStatus(baseUrl: String, shopSlug: String, deviceKey: String): Pair<Boolean, Boolean> {
        val r = try {
            request("GET", "${baseUrl.trimEnd('/')}/api/charges/auto", shopSlug, deviceKey, null)
        } catch (_: IOException) {
            return Pair(false, true)
        }
        if (r.code !in 200..299) return Pair(false, true)
        return try {
            Pair(true, JSONObject(r.response).optBoolean("autoChargeEnabled", true))
        } catch (_: Exception) {
            Pair(true, true)
        }
    }

    /** 앱 화면에 보여 줄 한 줄 결과 */
    fun describe(r: Result): String {
        val msg = try {
            val j = JSONObject(r.response)
            when {
                j.optBoolean("ok", false) || j.has("charge") -> "충전 승인됨"
                j.has("error") -> j.optString("error")
                else -> r.response.take(80)
            }
        } catch (_: Exception) {
            r.response.take(80)
        }
        return if (r.code == 0) "전송 실패 — $msg" else "HTTP ${r.code} · $msg"
    }

    private fun request(method: String, url: String, shopSlug: String, deviceKey: String, body: String?): Result {
        val conn = (URL(url).openConnection() as HttpURLConnection).apply {
            requestMethod = method
            setRequestProperty("x-orel-shop", shopSlug)
            setRequestProperty("x-vendix-shop", shopSlug)
            setRequestProperty("x-vendix-device", deviceKey)
            connectTimeout = 10_000
            readTimeout = 15_000
            if (body != null) {
                doOutput = true
                setRequestProperty("Content-Type", "application/json; charset=utf-8")
            }
        }
        try {
            if (body != null) conn.outputStream.use { it.write(body.toByteArray(Charsets.UTF_8)) }
            val code = conn.responseCode
            val stream = if (code in 200..299) conn.inputStream else conn.errorStream
            val text = stream?.bufferedReader()?.use { it.readText() } ?: ""
            return Result(code, text)
        } finally {
            conn.disconnect()
        }
    }
}
