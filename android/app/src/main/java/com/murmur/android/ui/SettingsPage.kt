package com.murmur.android.ui

import android.content.SharedPreferences
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.selection.selectableGroup
import androidx.compose.foundation.selection.toggleable
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Card
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.RadioButton
import androidx.compose.material3.Slider
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import com.murmur.android.asr.DownloadState
import com.murmur.android.asr.ModelId
import com.murmur.android.asr.ModelManager
import kotlin.math.roundToInt

@Composable
internal fun SettingsPage(
    models: ModelManager,
    prefs: SharedPreferences,
    status: SetupStatus,
    actions: SetupActions,
    theme: String,
    onTheme: (String) -> Unit,
) {
    val maxThreads = minOf(4, Runtime.getRuntime().availableProcessors())
    var threads by remember { mutableIntStateOf(prefs.getInt("threads", maxThreads).coerceIn(1, maxThreads)) }
    var haptics by remember { mutableStateOf(prefs.getBoolean("haptics", true)) }
    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState())) {
        Title("Settings", "Murmur is private by design.")
        ModelSettings(models)
        Setting("Transcription threads") {
            Text(threads.toString())
            if (maxThreads > 1) {
                Slider(
                    value = threads.toFloat(),
                    onValueChange = { threads = it.roundToInt() },
                    onValueChangeFinished = { prefs.edit().putInt("threads", threads).apply() },
                    valueRange = 1f..maxThreads.toFloat(),
                    steps = maxThreads - 2,
                )
            }
        }
        Card(Modifier.fillMaxWidth().padding(horizontal = 20.dp, vertical = 6.dp)) {
            Row(
                Modifier.fillMaxWidth().toggleable(
                    value = haptics,
                    role = Role.Switch,
                    onValueChange = {
                        haptics = it
                        prefs.edit().putBoolean("haptics", it).apply()
                    },
                ).padding(16.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text("Haptic feedback", Modifier.weight(1f))
                Switch(checked = haptics, onCheckedChange = null)
            }
        }
        Setting("Appearance") {
            Column(Modifier.selectableGroup()) {
                ThemeOption("System", theme == "system") { onTheme("system") }
                ThemeOption("Light", theme == "light") { onTheme("light") }
                ThemeOption("Dark", theme == "dark") { onTheme("dark") }
            }
        }
        Setting("Microphone") { MicrophoneAccess(status, actions) }
        Setting("Keyboard") { KeyboardAccess(status, actions) }
        Setting("About") { Text("Murmur 0.1.0 · Offline voice dictation") }
    }
}

@Composable
private fun ModelSettings(models: ModelManager) {
    val state by models.state.collectAsState()
    Setting("Speech model") {
        val download = state.download
        when (download) {
            is DownloadState.Running -> {
                val progress = download.progress.coerceIn(0f, 1f)
                Text("Installing model · ${(progress * 100).roundToInt()}%")
                LinearProgressIndicator(progress = { progress }, modifier = Modifier.fillMaxWidth())
            }
            is DownloadState.Failed -> Text(
                download.message,
                modifier = Modifier.semantics { liveRegion = LiveRegionMode.Polite },
                color = MaterialTheme.colorScheme.error,
            )
            DownloadState.Idle -> Unit
        }
        for (id in ModelId.entries) {
            val name = when (id) {
                ModelId.BASE_EN -> "Base English"
                ModelId.TINY_EN -> "Tiny English"
            }
            if (id in state.installed) {
                if (id == state.active) {
                    Text("$name · selected")
                } else {
                    OutlinedButton({ models.select(id) }) { Text("Select $name") }
                }
            } else {
                val action = when {
                    download is DownloadState.Failed -> "Retry installing $name"
                    id == ModelId.BASE_EN -> "Prepare $name (bundled)"
                    else -> "Download $name"
                }
                OutlinedButton({ models.startDownload(id) }, enabled = download !is DownloadState.Running) {
                    Text(action)
                }
            }
        }
    }
}

@Composable
private fun ThemeOption(label: String, selected: Boolean, onSelect: () -> Unit) {
    Row(
        Modifier.fillMaxWidth().heightIn(min = 48.dp).selectable(selected, role = Role.RadioButton, onClick = onSelect),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        RadioButton(selected, onClick = null)
        Text(label)
    }
}

@Composable
private fun Setting(title: String, content: @Composable () -> Unit) {
    Card(Modifier.fillMaxWidth().padding(horizontal = 20.dp, vertical = 6.dp)) {
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Text(title, style = MaterialTheme.typography.titleMedium)
            content()
        }
    }
}
