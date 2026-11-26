package com.murmur.android.ui

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.ListItem
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.produceState
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.murmur.android.data.MurmurStore
import kotlinx.coroutines.launch

@Composable
internal fun Rules(store: MurmurStore, dictionary: Boolean) {
    val kind = if (dictionary) "dictionary" else "snippets"
    val revision by store.revision.collectAsState()
    val rows by produceState<List<Pair<String, String>>>(emptyList(), store, kind, revision) {
        value = store.rules(kind)
    }
    var phrase by rememberSaveable { mutableStateOf("") }
    var replacement by rememberSaveable { mutableStateOf("") }
    val scope = rememberCoroutineScope()
    LazyColumn(Modifier.fillMaxSize()) {
        item {
            if (dictionary) {
                Title("Dictionary", "Teach Murmur names and terms it should recognize.")
            } else {
                Title("Snippets", "Expand a short spoken trigger into longer text.")
            }
            Card(Modifier.fillMaxWidth().padding(20.dp)) {
                Column(Modifier.padding(16.dp)) {
                    OutlinedTextField(
                        value = phrase,
                        onValueChange = { phrase = it },
                        modifier = Modifier.fillMaxWidth(),
                        label = { Text(if (dictionary) "Word or phrase" else "Spoken trigger") },
                    )
                    OutlinedTextField(
                        value = replacement,
                        onValueChange = { replacement = it },
                        modifier = Modifier.fillMaxWidth(),
                        label = { Text(if (dictionary) "Replacement (optional)" else "Expansion") },
                    )
                    Button(
                        onClick = {
                            val from = phrase.trim()
                            val to = if (dictionary && replacement.isBlank()) from else replacement
                            scope.launch { store.addRule(kind, from, to) }
                            phrase = ""
                            replacement = ""
                        },
                        enabled = phrase.isNotBlank() && (dictionary || replacement.isNotBlank()),
                        modifier = Modifier.align(Alignment.End).padding(top = 8.dp),
                    ) { Text("Add") }
                }
            }
        }
        items(rows) { (from, to) ->
            ListItem(
                headlineContent = { Text(from) },
                supportingContent = { if (from != to) Text(to) },
                trailingContent = {
                    TextButton({ scope.launch { store.deleteRule(kind, from) } }) { Text("Delete") }
                },
            )
            HorizontalDivider()
        }
    }
}
