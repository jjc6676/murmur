package com.murmur.android.ui

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.key
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.unit.dp

internal data class SetupStatus(
    val microphoneGranted: Boolean = false,
    val microphoneBlocked: Boolean = false,
    val serviceEnabled: Boolean = false,
    val bubbleEnabled: Boolean = true,
    val snoozedUntil: Long = 0L,
) {
    val ready: Boolean get() = microphoneGranted && serviceEnabled
}

internal class SetupActions(
    val requestMicrophone: () -> Unit,
    val openAppSettings: () -> Unit,
    val openAccessibilitySettings: () -> Unit,
    val showBubble: () -> Unit,
)

@Composable
internal fun Onboarding(
    step: Int,
    status: SetupStatus,
    actions: SetupActions,
    onStep: (Int) -> Unit,
    onComplete: () -> Unit,
    onDefer: () -> Unit,
) {
    BackHandler(enabled = step > 0) { onStep(step - 1) }
    key(step) {
        Column(
            Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(24.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            Text("Murmur · ${step + 1} of 4", style = MaterialTheme.typography.labelLarge)
            val title = when (step) {
                0 -> "Welcome to Murmur"
                1 -> "Let Murmur hear you"
                2 -> "Turn on the Murmur bubble"
                else -> "Try it here"
            }
            Text(title, fontFamily = FontFamily.Serif, style = MaterialTheme.typography.headlineLarge)
            when (step) {
                0 -> Text("Speak instead of typing. Murmur turns your voice into text, even offline.")
                1 -> {
                    Text("Microphone access is used only while you dictate. Audio never leaves this device.")
                    MicrophoneAccess(status, actions)
                }
                2 -> {
                    Text("The bubble sits above your usual keyboard whenever you’re typing. Tap it to talk, then tap ✓ to insert. Or hold to talk and release to insert.")
                    Text("In Accessibility settings, choose Murmur and turn it on. Android will show its standard accessibility warning.")
                    Text("Murmur only reads the focused text field to insert your words. Dictation works offline. Nothing leaves your phone.")
                    AccessibilityAccess(status, actions)
                    if (!status.bubbleEnabled || status.snoozedUntil != 0L) {
                        OutlinedButton(actions.showBubble) { Text("Show bubble now") }
                    }
                }
                3 -> {
                    Text("Tap the field, then tap the bubble and say a few words. Tap ✓ to put them here.")
                    TryItField()
                    if (!status.microphoneGranted) MicrophoneAccess(status, actions)
                    if (!status.serviceEnabled) AccessibilityAccess(status, actions)
                    if (!status.bubbleEnabled || status.snoozedUntil != 0L) {
                        OutlinedButton(actions.showBubble) { Text("Show bubble now") }
                    }
                }
            }
            Button(
                onClick = { if (step == 3) onComplete() else onStep(step + 1) },
                enabled = when (step) {
                    1 -> status.microphoneGranted
                    2 -> status.serviceEnabled && status.bubbleEnabled && status.snoozedUntil == 0L
                    3 -> status.ready
                    else -> true
                },
                modifier = Modifier.fillMaxWidth(),
            ) { Text(if (step == 3) "Done" else "Continue") }
            TextButton(onDefer, Modifier.align(Alignment.CenterHorizontally)) { Text("Finish later") }
        }
    }
}

@Composable
internal fun TryItField() {
    var text by rememberSaveable { mutableStateOf("") }
    OutlinedTextField(
        value = text,
        onValueChange = { text = it },
        modifier = Modifier.fillMaxWidth(),
        label = { Text("Practice dictation") },
        placeholder = { Text("Dictate something…") },
    )
}

@Composable
internal fun MicrophoneAccess(status: SetupStatus, actions: SetupActions) {
    Text(if (status.microphoneGranted) "Microphone access granted" else "Microphone access needed")
    if (!status.microphoneGranted) {
        if (!status.microphoneBlocked) {
            OutlinedButton(actions.requestMicrophone) { Text("Grant microphone access") }
        } else {
            Text("In app settings, open Permissions and allow microphone access.")
        }
        OutlinedButton(actions.openAppSettings) { Text("Open app settings") }
    }
}

@Composable
internal fun AccessibilityAccess(status: SetupStatus, actions: SetupActions) {
    Text(if (status.serviceEnabled) "Accessibility access is on" else "Accessibility access is off")
    OutlinedButton(actions.openAccessibilitySettings) { Text("Open settings") }
}
