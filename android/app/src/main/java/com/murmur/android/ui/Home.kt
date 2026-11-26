package com.murmur.android.ui

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.content.Intent
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.material3.Card
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.key
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.produceState
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.unit.dp
import com.murmur.android.data.Dictation
import com.murmur.android.data.MurmurStore
import com.murmur.android.data.Stats
import kotlinx.coroutines.launch
import java.text.DateFormat
import java.util.Calendar
import java.util.Date

private const val PageSize = 50

@Composable
internal fun Home(
    store: MurmurStore,
    status: SetupStatus,
    actions: SetupActions,
    showResume: Boolean,
    onResumeSetup: () -> Unit,
) {
    val revision by store.revision.collectAsState()
    val stats by produceState<Stats?>(null, store, revision) { value = store.stats() }
    var query by rememberSaveable { mutableStateOf("") }
    var offset by rememberSaveable { mutableIntStateOf(0) }
    val rows by key(store, query, revision, offset) {
        produceState<List<Dictation>?>(null) { value = store.history(query, PageSize + 1, offset) }
    }
    val entries = rows
    val scope = rememberCoroutineScope()
    val list = rememberLazyListState()
    LaunchedEffect(offset) { list.scrollToItem(0) }
    LaunchedEffect(entries, offset) {
        if (entries != null && entries.isEmpty() && offset > 0) offset -= PageSize
    }
    val greeting = if (Calendar.getInstance().get(Calendar.HOUR_OF_DAY) < 12) "Good morning" else "Good day"
    LazyColumn(Modifier.fillMaxSize(), state = list) {
        item {
            Title(greeting, "Everything you say stays on this phone.")
            if (!status.serviceEnabled || !status.bubbleEnabled) {
                BubbleNotice(
                    title = "Murmur bubble is off",
                    action = "Turn on",
                    onClick = {
                        actions.showBubble()
                        if (!status.serviceEnabled) actions.openAccessibilitySettings()
                    },
                )
            }
            if (status.snoozedUntil != 0L) {
                val time = android.text.format.DateFormat.format("HH:mm", status.snoozedUntil)
                BubbleNotice("Bubble hidden until $time", "Show now", actions.showBubble)
            }
            if (showResume) {
                OutlinedButton(onResumeSetup, Modifier.padding(horizontal = 20.dp)) { Text("Resume setup") }
            }
            Row(
                Modifier.fillMaxWidth().padding(horizontal = 20.dp),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                Metric(stats?.totalWords?.toString() ?: "—", "total words", Modifier.weight(1f))
                Metric(stats?.averageWpm?.takeIf { it > 0 }?.toString() ?: "—", "average WPM", Modifier.weight(1f))
                Metric(stats?.streakDays?.toString() ?: "—", "day streak", Modifier.weight(1f))
            }
            OutlinedTextField(
                value = query,
                onValueChange = {
                    query = it
                    offset = 0
                },
                modifier = Modifier.fillMaxWidth().padding(20.dp),
                singleLine = true,
                label = { Text("Search dictations") },
            )
        }
        when {
            entries == null -> item { Text("Loading history…", Modifier.padding(20.dp)) }
            entries.isEmpty() -> item {
                val message = if (query.isEmpty()) {
                    "Tap the bubble in a text field to dictate. Your words will appear here."
                } else {
                    "No dictations match your search."
                }
                Text(message, Modifier.padding(20.dp))
            }
            else -> {
                items(minOf(PageSize, entries.size), key = { entries[it].id }) { index ->
                    val entry = entries[index]
                    DictationCard(entry) { scope.launch { store.deleteDictation(entry.id) } }
                }
                if (offset > 0 || entries.size > PageSize) item {
                    Row(Modifier.fillMaxWidth().padding(20.dp), horizontalArrangement = Arrangement.SpaceBetween) {
                        TextButton({ offset -= PageSize }, enabled = offset > 0) { Text("Previous page") }
                        TextButton({ offset += PageSize }, enabled = entries.size > PageSize) { Text("Next page") }
                    }
                }
            }
        }
    }
}

@Composable
private fun BubbleNotice(title: String, action: String, onClick: () -> Unit) {
    Card(Modifier.fillMaxWidth().padding(horizontal = 20.dp, vertical = 6.dp)) {
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Text(title, style = MaterialTheme.typography.titleMedium)
            OutlinedButton(onClick) { Text(action) }
        }
    }
}

@Composable
private fun Metric(value: String, label: String, modifier: Modifier) {
    Card(modifier) {
        Column(Modifier.padding(12.dp)) {
            Text(value, fontFamily = FontFamily.Serif, style = MaterialTheme.typography.headlineSmall)
            Text(label, style = MaterialTheme.typography.labelMedium)
        }
    }
}

@Composable
private fun DictationCard(row: Dictation, onDelete: () -> Unit) {
    val context = LocalContext.current
    val timestamp = remember(row.createdAt) {
        DateFormat.getDateTimeInstance(DateFormat.MEDIUM, DateFormat.SHORT).format(Date(row.createdAt))
    }
    Card(Modifier.fillMaxWidth().padding(horizontal = 20.dp, vertical = 5.dp)) {
        Column(Modifier.padding(16.dp)) {
            Text(row.text)
            Text(timestamp, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            Row {
                TextButton({
                    val clipboard = context.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
                    clipboard.setPrimaryClip(ClipData.newPlainText("Murmur dictation", row.text))
                }) { Text("Copy") }
                TextButton({
                    val share = Intent(Intent.ACTION_SEND).setType("text/plain").putExtra(Intent.EXTRA_TEXT, row.text)
                    context.startActivity(Intent.createChooser(share, "Share dictation"))
                }) { Text("Share") }
                TextButton(onDelete) { Text("Delete") }
            }
        }
    }
}
