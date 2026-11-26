package com.murmur.android

import android.Manifest
import android.content.Intent
import android.content.SharedPreferences
import android.content.pm.PackageManager
import android.database.ContentObserver
import android.net.Uri
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.provider.Settings
import android.view.WindowManager
import androidx.activity.ComponentActivity
import androidx.activity.SystemBarStyle
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import com.murmur.android.bubble.BubbleStatus
import com.murmur.android.ui.CompanionShell
import com.murmur.android.ui.Onboarding
import com.murmur.android.ui.SetupActions
import com.murmur.android.ui.SetupStatus
import kotlinx.coroutines.delay

private val LightColors = lightColorScheme(
    primary = Color(0xFF2F604A),
    background = Color(0xFFF5F4F0),
    onBackground = Color(0xFF20231F),
    surface = Color.White,
)
private val DarkColors = darkColorScheme(
    primary = Color(0xFF96C9AF),
    background = Color(0xFF171916),
    surface = Color(0xFF242621),
)

class MainActivity : ComponentActivity() {
    private val prefs by lazy { getSharedPreferences("settings", MODE_PRIVATE) }
    private var status by mutableStateOf(SetupStatus())
    private val accessibilityObserver = object : ContentObserver(Handler(Looper.getMainLooper())) {
        override fun onChange(selfChange: Boolean) = refreshSetup()
    }
    private val bubblePreferences = SharedPreferences.OnSharedPreferenceChangeListener { _, key ->
        if (key == "bubble_enabled" || key == "bubble_snoozed_until") refreshSetup()
    }
    private val microphone = registerForActivityResult(ActivityResultContracts.RequestPermission()) {
        prefs.edit().putBoolean("microphone_requested", true).apply()
        refreshSetup()
    }
    private val actions = SetupActions(
        requestMicrophone = { microphone.launch(Manifest.permission.RECORD_AUDIO) },
        openAppSettings = {
            startActivity(Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:$packageName")))
        },
        openAccessibilitySettings = { BubbleStatus.openAccessibilitySettings(this) },
        showBubble = {
            prefs.edit()
                .putBoolean("bubble_enabled", true)
                .putLong("bubble_snoozed_until", 0L)
                .apply()
        },
    )

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        window.setSoftInputMode(WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE)
        refreshSetup()
        migratePreferences()
        setContent { Companion() }
    }

    override fun onStart() {
        super.onStart()
        prefs.registerOnSharedPreferenceChangeListener(bubblePreferences)
        contentResolver.registerContentObserver(
            Settings.Secure.getUriFor(Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES),
            false,
            accessibilityObserver,
        )
    }

    override fun onResume() {
        super.onResume()
        refreshSetup()
    }

    override fun onStop() {
        prefs.unregisterOnSharedPreferenceChangeListener(bubblePreferences)
        contentResolver.unregisterContentObserver(accessibilityObserver)
        super.onStop()
    }

    private fun refreshSetup() {
        val permission = Manifest.permission.RECORD_AUDIO
        val snoozedUntil = prefs.getLong("bubble_snoozed_until", 0L)
        status = SetupStatus(
            microphoneGranted = checkSelfPermission(permission) == PackageManager.PERMISSION_GRANTED,
            microphoneBlocked = prefs.getBoolean("microphone_requested", false) &&
                !shouldShowRequestPermissionRationale(permission),
            serviceEnabled = BubbleStatus.isServiceEnabled(this),
            bubbleEnabled = prefs.getBoolean("bubble_enabled", true),
            snoozedUntil = if (snoozedUntil > System.currentTimeMillis()) snoozedUntil else 0L,
        )
    }

    private fun migratePreferences() {
        if (!prefs.contains("onboarded") && !prefs.contains("dark")) return
        val edit = prefs.edit()
        if (!prefs.contains("onboarding_completed") && prefs.getBoolean("onboarded", false)) {
            // The old flag did not distinguish finishing from skipping.
            edit.putBoolean("onboarding_completed", status.ready)
            edit.putBoolean("onboarding_deferred", !status.ready)
        }
        if (!prefs.contains("theme") && prefs.getBoolean("dark", false)) {
            edit.putString("theme", "dark")
        }
        edit.remove("onboarded").remove("dark").apply()
    }

    @Composable
    private fun Companion() {
        val app = application as MurmurApp
        val snoozedUntil = status.snoozedUntil
        LaunchedEffect(snoozedUntil) {
            if (snoozedUntil != 0L) {
                delay(snoozedUntil - System.currentTimeMillis())
                refreshSetup()
            }
        }
        var theme by remember { mutableStateOf(prefs.getString("theme", "system") ?: "system") }
        val dark = when (theme) {
            "dark" -> true
            "light" -> false
            else -> isSystemInDarkTheme()
        }
        DisposableEffect(dark) {
            val transparent = android.graphics.Color.TRANSPARENT
            val bars = if (dark) SystemBarStyle.dark(transparent) else SystemBarStyle.light(transparent, transparent)
            enableEdgeToEdge(statusBarStyle = bars, navigationBarStyle = bars)
            onDispose {}
        }

        var completed by remember { mutableStateOf(prefs.getBoolean("onboarding_completed", false)) }
        var deferred by remember { mutableStateOf(prefs.getBoolean("onboarding_deferred", false)) }
        var step by remember { mutableIntStateOf(prefs.getInt("onboarding_step", 0).coerceIn(0, 3)) }
        fun setStep(next: Int) {
            step = next
            prefs.edit().putInt("onboarding_step", next).apply()
        }
        fun setRoute(done: Boolean, later: Boolean) {
            completed = done
            deferred = later
            prefs.edit()
                .putBoolean("onboarding_completed", done)
                .putBoolean("onboarding_deferred", later)
                .apply()
        }

        MaterialTheme(colorScheme = if (dark) DarkColors else LightColors) {
            Surface(Modifier.fillMaxSize(), color = MaterialTheme.colorScheme.background) {
                Box(Modifier.fillMaxSize().safeDrawingPadding().imePadding()) {
                    if (!completed && !deferred) {
                        Onboarding(step, status, actions, ::setStep, { setRoute(true, false) }, { setRoute(false, true) })
                    } else {
                        CompanionShell(
                            app = app,
                            prefs = prefs,
                            status = status,
                            actions = actions,
                            showResume = deferred || !status.microphoneGranted,
                            onResumeSetup = {
                                if (completed) setStep(if (!status.microphoneGranted) 1 else 2)
                                setRoute(false, false)
                            },
                            theme = theme,
                            onTheme = {
                                theme = it
                                prefs.edit().putString("theme", it).apply()
                            },
                        )
                    }
                }
            }
        }
    }
}
