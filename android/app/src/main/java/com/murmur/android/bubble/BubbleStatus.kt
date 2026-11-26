package com.murmur.android.bubble

import android.accessibilityservice.AccessibilityServiceInfo
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.provider.Settings
import android.view.accessibility.AccessibilityManager

object BubbleStatus {
    fun isServiceEnabled(context: Context): Boolean {
        val component = ComponentName(context, MurmurBubbleService::class.java)
        val manager = context.getSystemService(AccessibilityManager::class.java) ?: return false
        if (!manager.isEnabled) return false
        val enabled = Settings.Secure.getString(
            context.contentResolver, Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES,
        ).orEmpty()
        return enabled.split(':').any { ComponentName.unflattenFromString(it) == component } ||
            manager.getEnabledAccessibilityServiceList(AccessibilityServiceInfo.FEEDBACK_ALL_MASK).any {
                ComponentName.unflattenFromString(it.id) == component
            }
    }

    fun openAccessibilitySettings(context: Context) {
        context.startActivity(Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
    }
}
