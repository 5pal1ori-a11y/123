package com.vendix.autocharge

import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.provider.Settings
import android.widget.Button
import android.widget.CompoundButton
import android.widget.EditText
import android.widget.Switch
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity

class MainActivity : AppCompatActivity() {
    private lateinit var baseUrl: EditText
    private lateinit var shopSlug: EditText
    private lateinit var deviceKey: EditText
    private lateinit var status: TextView
    private lateinit var autoSwitch: Switch

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)

        baseUrl = findViewById(R.id.baseUrl)
        shopSlug = findViewById(R.id.shopSlug)
        deviceKey = findViewById(R.id.deviceKey)
        status = findViewById(R.id.status)
        autoSwitch = findViewById(R.id.autoSwitch)

        loadFromPrefs()
        handlePairIntent(intent)

        autoSwitch.isChecked = Prefs.getBool(this, Prefs.KEY_AUTO_CHARGE, true)
        autoSwitch.setOnCheckedChangeListener { _: CompoundButton, checked: Boolean ->
            Prefs.setBool(this, Prefs.KEY_AUTO_CHARGE, checked)
            status.text = if (checked) "자동충전 ON" else "자동충전 OFF"
        }

        findViewById<Button>(R.id.saveBtn).setOnClickListener {
            saveFields()
            status.text = "저장됨 · 연동 확인 중…"
            verifyConnection()
        }

        findViewById<Button>(R.id.notifBtn).setOnClickListener {
            startActivity(Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS))
        }

        findViewById<Button>(R.id.verifyBtn).setOnClickListener {
            verifyConnection()
        }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        handlePairIntent(intent)
    }

    private fun loadFromPrefs() {
        baseUrl.setText(Prefs.get(this, Prefs.KEY_BASE_URL, "https://vendix.team"))
        shopSlug.setText(Prefs.get(this, Prefs.KEY_SHOP_SLUG))
        deviceKey.setText(Prefs.get(this, Prefs.KEY_DEVICE_KEY))
    }

    private fun saveFields() {
        Prefs.set(this, Prefs.KEY_BASE_URL, baseUrl.text.toString().trim())
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
        val base = baseUrl.text.toString().trim()
        val shop = shopSlug.text.toString().trim()
        val key = deviceKey.text.toString().trim()
        if (base.isBlank() || shop.isBlank() || key.isBlank()) {
            status.text = "URL · 상점 · 시크릿을 모두 입력하세요"
            return
        }

        Thread {
            val (ok, serverEnabled) = ApiClient.fetchStatus(base, shop, key)
            runOnUiThread {
                if (!ok) {
                    status.text = "연동 실패 — 시크릿 또는 URL을 확인하세요"
                    return@runOnUiThread
                }
                val localOn = autoSwitch.isChecked
                status.text = when {
                    !serverEnabled -> "서버 자동충전 OFF (Admin에서 켜야 함)"
                    localOn -> "연동 완료 · 자동충전 ON"
                    else -> "연동 완료 · 앱 자동충전 OFF"
                }
            }
        }.start()
    }
}
