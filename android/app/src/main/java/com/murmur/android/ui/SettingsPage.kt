package com.murmur.android.ui

import android.content.SharedPreferences
import android.database.sqlite.SQLiteException
import android.widget.Toast
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
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Card
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.RadioButton
import androidx.compose.material3.Slider
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import com.murmur.android.BuildConfig
import com.murmur.android.MurmurApp
import com.murmur.android.asr.DownloadState
import com.murmur.android.asr.ModelId
import com.murmur.android.asr.ModelManager
import com.murmur.android.data.HISTORY_ENABLED
import com.murmur.android.data.HISTORY_RETENTION_DAYS
import com.murmur.android.data.KEEP_HISTORY_FOREVER
import kotlinx.coroutines.launch
import kotlin.math.roundToInt

private val retentionOptions = intArrayOf(KEEP_HISTORY_FOREVER, 30, 7, 1)

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
    val context = LocalContext.current
    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState())) {
        Title("Settings", "Murmur is private by design.")
        Setting("Bubble") {
            Row(
                Modifier.fillMaxWidth().heightIn(min = 48.dp).toggleable(
                    value = status.bubbleEnabled,
                    role = Role.Switch,
                    onValueChange = { enabled ->
                        if (enabled) {
                            actions.showBubble()
                        } else {
                            prefs.edit().putBoolean("bubble_enabled", false).apply()
                        }
                    },
                ),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text("Show bubble", Modifier.weight(1f))
                Switch(checked = status.bubbleEnabled, onCheckedChange = null)
            }
            OutlinedButton({
                prefs.edit().putInt("bubble_x", -1).putInt("bubble_y", -1).apply()
                Toast.makeText(context, "Bubble position reset", Toast.LENGTH_SHORT).show()
            }) { Text("Reset bubble position") }
            AccessibilityAccess(status, actions)
            MicrophoneAccess(status, actions)
        }
        HistorySettings(prefs, context.applicationContext as MurmurApp)
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
                RadioOption("System", theme == "system") { onTheme("system") }
                RadioOption("Light", theme == "light") { onTheme("light") }
                RadioOption("Dark", theme == "dark") { onTheme("dark") }
            }
        }
        Setting("About") { Text("Murmur ${BuildConfig.VERSION_NAME} · Offline voice dictation") }
    }
}

@Composable
internal fun historySavingEnabled(prefs: SharedPreferences): Boolean =
    observePreference(prefs, HISTORY_ENABLED) { prefs.getBoolean(HISTORY_ENABLED, true) }

@Composable
private fun <T> observePreference(prefs: SharedPreferences, key: String, read: () -> T): T {
    var value by remember(prefs, key) { mutableStateOf(read()) }
    DisposableEffect(prefs, key) {
        val listener = SharedPreferences.OnSharedPreferenceChangeListener { _, changed ->
            if (changed == key || changed == null) value = read()
        }
        prefs.registerOnSharedPreferenceChangeListener(listener)
        value = read()
        onDispose { prefs.unregisterOnSharedPreferenceChangeListener(listener) }
    }
    return value
}

@Composable
private fun HistorySettings(prefs: SharedPreferences, app: MurmurApp) {
    val enabled = historySavingEnabled(prefs)
    val retention = observePreference(prefs, HISTORY_RETENTION_DAYS) {
        prefs.getInt(HISTORY_RETENTION_DAYS, KEEP_HISTORY_FOREVER)
    }
    var confirmDelete by rememberSaveable { mutableStateOf(false) }

    Setting("Dictation history") {
        Row(
            Modifier.fillMaxWidth().heightIn(min = 48.dp).toggleable(
                value = enabled,
                role = Role.Switch,
                onValueChange = { prefs.edit().putBoolean(HISTORY_ENABLED, it).apply() },
            ),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text("Save dictation history", Modifier.weight(1f))
            Switch(checked = enabled, onCheckedChange = null)
        }
        Text("Turning this off stops saving new dictations. It does not delete saved history.")
        Text("Keep saved dictations", style = MaterialTheme.typography.titleSmall)
        Text("Choosing a shorter period permanently deletes older dictations.")
        Column(Modifier.selectableGroup()) {
            for (days in retentionOptions) {
                val label = when (days) {
                    KEEP_HISTORY_FOREVER -> "Forever"
                    1 -> "1 day"
                    else -> "$days days"
                }
                RadioOption(label, days == retention) {
                    prefs.edit().putInt(HISTORY_RETENTION_DAYS, days).apply()
                    app.applicationScope.launch {
                        try {
                            app.store.pruneHistory(days)
                        } catch (_: SQLiteException) {
                            Toast.makeText(app, "Couldn’t delete expired history.", Toast.LENGTH_LONG).show()
                        }
                    }
                }
            }
        }
        OutlinedButton({ confirmDelete = true }) { Text("Delete all history") }
    }
    if (confirmDelete) {
        AlertDialog(
            onDismissRequest = { confirmDelete = false },
            title = { Text("Delete all history?") },
            text = { Text("This permanently deletes all saved dictations and resets your dictation stats.") },
            confirmButton = {
                TextButton(onClick = {
                    confirmDelete = false
                    app.applicationScope.launch {
                        val message = try {
                            app.store.deleteAllHistory()
                            "Dictation history deleted."
                        } catch (_: SQLiteException) {
                            "Couldn’t delete dictation history."
                        }
                        Toast.makeText(app, message, Toast.LENGTH_LONG).show()
                    }
                }) { Text("Delete all history") }
            },
            dismissButton = { TextButton({ confirmDelete = false }) { Text("Cancel") } },
        )
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
private fun RadioOption(label: String, selected: Boolean, onSelect: () -> Unit) {
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
