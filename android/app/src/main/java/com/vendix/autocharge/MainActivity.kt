package com.vendix.autocharge

import android.annotation.SuppressLint
import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.os.PowerManager
import android.provider.Settings
import android.widget.Button
import android.widget.CompoundButton
import android.widget.EditText
import android.widget.Switch
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity
import androidx.core.app.NotificationManagerCompat

class MainActivity : AppCompatActivity() {
    private lateinit var baseUrl: EditText
    private lateinit var shopSlug: EditText
    private lateinit var deviceKey: EditText
    private lateinit var status: TextView
    private lateinit var health: TextView
    private lateinit var lastEvent: TextView
    private lateinit var autoSwitch: Switch
    private lateinit var allowAllSwitch: Switch

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)

        baseUrl = findViewById(R.id.baseUrl)
        shopSlug = findViewById(R.id.shopSlug)
        deviceKey = findViewById(R.id.deviceKey)
        status = findViewById(R.id.status)
        health = findViewById(R.id.health)
        lastEvent = findViewById(R.id.lastEvent)
        autoSwitch = findViewById(R.id.autoSwitch)
        allowAllSwitch = findViewById(R.id.allowAllSwitch)

        findViewById<TextView>(R.id.version).text = "버전 ${appVersion()}"

        loadFromPrefs()
        handlePairIntent(intent)

        autoSwitch.isChecked = Prefs.getBool(this, Prefs.KEY_AUTO_CHARGE, true)
        autoSwitch.setOnCheckedChangeListener { _: CompoundButton, checked: Boolean ->
            Prefs.setBool(this, Prefs.KEY_AUTO_CHARGE, checked)
            status.text = if (checked) "자동충전 ON" else "자동충전 OFF"
        }

        allowAllSwitch.isChecked = Prefs.getBool(this, Prefs.KEY_ALLOW_ALL_APPS, false)
        allowAllSwitch.setOnCheckedChangeListener { _: CompoundButton, checked: Boolean ->
            Prefs.setBool(this, Prefs.KEY_ALLOW_ALL_APPS, checked)
        }

        findViewById<Button>(R.id.saveBtn).setOnClickListener {
            saveFields()
            status.text = "저장됨 · 연동 확인 중…"
            verifyConnection()
        }

        findViewById<Button>(R.id.notifBtn).setOnClickListener {
            startActivity(Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS))
        }

        findViewById<Button>(R.id.batteryBtn).setOnClickListener { requestBatteryExemption() }

        findViewById<Button>(R.id.verifyBtn).setOnClickListener {
            verifyConnection()
        }
    }

    override fun onResume() {
        super.onResume()
        refreshHealth()
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        handlePairIntent(intent)
    }

    private fun appVersion(): String = try {
        packageManager.getPackageInfo(packageName, 0).versionName ?: "?"
    } catch (_: Exception) {
        "?"
    }

    /** 알림 접근 · 배터리 최적화 · 마지막 감지 결과를 화면에 보여 준다 */
    private fun refreshHealth() {
        val listenerOn = NotificationManagerCompat.getEnabledListenerPackages(this).contains(packageName)
        val pm = getSystemService(POWER_SERVICE) as PowerManager
        val batteryOk = pm.isIgnoringBatteryOptimizations(packageName)
        health.text = buildString {
            append(if (listenerOn) "✅ 알림 접근 허용됨" else "❌ 알림 접근 꺼짐 — '알림 접근 권한 설정'에서 켜 주세요")
            append("\n")
            append(if (batteryOk) "✅ 배터리 최적화 제외됨" else "⚠️ 배터리 최적화 중 — 꺼질 수 있어요")
        }
        val last = Prefs.get(this, Prefs.KEY_LAST_EVENT)
        lastEvent.text = if (last.isBlank()) "마지막 입금 감지: 아직 없음" else "마지막 입금 감지: $last"
    }

    @SuppressLint("BatteryLife")
    private fun requestBatteryExemption() {
        val pm = getSystemService(POWER_SERVICE) as PowerManager
        if (pm.isIgnoringBatteryOptimizations(packageName)) {
            status.text = "이미 배터리 최적화에서 제외돼 있어요"
            return
        }
        try {
            startActivity(
                Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS)
                    .setData(Uri.parse("package:$packageName")),
            )
        } catch (_: Exception) {
            startActivity(Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS))
        }
    }

    private fun loadFromPrefs() {
        baseUrl.setText(Prefs.get(this, Prefs.KEY_BASE_URL, Prefs.DEFAULT_BASE_URL))
        shopSlug.setText(Prefs.get(this, Prefs.KEY_SHOP_SLUG))
        deviceKey.setText(Prefs.get(this, Prefs.KEY_DEVICE_KEY))
    }

    private fun saveFields() {
        val base = baseUrl.text.toString().trim().ifBlank { Prefs.DEFAULT_BASE_URL }
        Prefs.set(this, Prefs.KEY_BASE_URL, base)
        Prefs.set(this, Prefs.KEY_SHOP_SLUG, shopSlug.text.toString().trim())
        Prefs.set(this, Prefs.KEY_DEVICE_KEY, deviceKey.text.toString().trim())
    }

    private fun handlePairIntent(intent: Intent?) {
        val data: Uri = intent?.data ?: return
        if (data.scheme != "vendix" || data.host != "pair") return

        val shop = data.getQueryParameter("shop")?.trim().orEmpty()
        val key = data.getQueryParameter("key")?.trim().orEmpty()
        val base = data.getQueryParameter("base")?.trim().orEmpty()

        if (base.isNotBlank()) baseUrl.setText(base)
        if (shop.isNotBlank()) shopSlug.setText(shop)
        if (key.isNotBlank()) deviceKey.setText(key)

        saveFields()
        status.text = "연동 정보가 적용되었습니다"
        verifyConnection()
    }

    private fun verifyConnection() {
        val base = baseUrl.text.toString().trim().ifBlank { Prefs.DEFAULT_BASE_URL }
        val shop = shopSlug.text.toString().trim()
        val key = deviceKey.text.toString().trim()
        if (shop.isBlank() || key.isBlank()) {
            status.text = "상점 · 시크릿을 모두 입력하세요"
            return
        }

        Thread {
            val (ok, serverEnabled) = ApiClient.fetchStatus(base, shop, key)
            runOnUiThread {
                status.text = when {
                    !ok -> "연동 실패 — 시크릿 또는 URL을 확인하세요"
                    !serverEnabled -> "서버 자동충전 OFF (Admin에서 켜야 함)"
                    autoSwitch.isChecked -> "연동 완료 · 자동충전 ON"
                    else -> "연동 완료 · 앱 자동충전 OFF"
                }
                refreshHealth()
            }
        }.start()
    }
}
