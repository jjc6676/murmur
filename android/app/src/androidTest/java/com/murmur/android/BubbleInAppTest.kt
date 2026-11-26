package com.murmur.android

import android.content.Context
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.mutableStateOf
import androidx.compose.ui.test.assertIsFocused
import androidx.compose.ui.test.assertIsNotFocused
import androidx.compose.ui.test.hasSetTextAction
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.requestFocus
import androidx.core.content.edit
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import com.murmur.android.bubble.BubbleDebug
import com.murmur.android.bubble.BubbleStatus
import com.murmur.android.ui.TryItField
import org.junit.Assume.assumeTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class BubbleInAppTest {
    @get:Rule
    val compose = createComposeRule()

    @Test
    fun focusingPracticeFieldAttachesBubbleAndRemovingFieldDetachesIt() {
        val context = InstrumentationRegistry.getInstrumentation().targetContext
        assumeTrue("Enable Murmur's accessibility service to exercise its overlay", BubbleStatus.isServiceEnabled(context))
        compose.waitUntil(15_000) { BubbleDebug.connected }
        val prefs = context.getSharedPreferences("settings", Context.MODE_PRIVATE)
        val previousEnabled = prefs.getBoolean("bubble_enabled", true).takeIf { prefs.contains("bubble_enabled") }
        val previousSnooze = prefs.getLong("bubble_snoozed_until", 0L).takeIf { prefs.contains("bubble_snoozed_until") }
        try {
            prefs.edit { putBoolean("bubble_enabled", true); remove("bubble_snoozed_until") }
            val showField = mutableStateOf(true)
            compose.setContent { MaterialTheme { if (showField.value) TryItField() } }
            val field = compose.onNode(hasSetTextAction())
            field.assertIsNotFocused()
            compose.waitUntil(5_000) { !BubbleDebug.visible }

            field.requestFocus().assertIsFocused()
            compose.waitUntil(5_000) { BubbleDebug.visible }

            compose.runOnIdle { showField.value = false }
            compose.waitUntil(5_000) { !BubbleDebug.visible }
        } finally {
            prefs.edit {
                if (previousEnabled == null) remove("bubble_enabled") else putBoolean("bubble_enabled", previousEnabled)
                if (previousSnooze == null) remove("bubble_snoozed_until") else putLong("bubble_snoozed_until", previousSnooze)
            }
        }
    }
}
