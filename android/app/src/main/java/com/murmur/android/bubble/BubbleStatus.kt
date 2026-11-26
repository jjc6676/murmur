package com.murmur.android.bubble

import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.provider.Settings

object BubbleStatus {
    fun isServiceEnabled(context: Context): Boolean {
        val resolver = context.contentResolver
        if (Settings.Secure.getInt(resolver, Settings.Secure.ACCESSIBILITY_ENABLED, 0) != 1) return false
        val component = ComponentName(context, MurmurBubbleService::class.java)
        val enabled = Settings.Secure.getString(
            resolver, Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES,
        ) ?: return false
        return enabled.splitToSequence(':').any { ComponentName.unflattenFromString(it) == component }
    }

    fun openAccessibilitySettings(context: Context) {
        context.startActivity(Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
    }
}
