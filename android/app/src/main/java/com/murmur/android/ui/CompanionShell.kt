package com.murmur.android.ui

import android.content.SharedPreferences
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.key
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.unit.dp
import com.murmur.android.MurmurApp

private val tabs = listOf("Home" to "⌂", "Dictionary" to "Aa", "Snippets" to "↗", "Settings" to "⚙")

@Composable
internal fun CompanionShell(
    app: MurmurApp,
    prefs: SharedPreferences,
    status: SetupStatus,
    actions: SetupActions,
    showResume: Boolean,
    onResumeSetup: () -> Unit,
    theme: String,
    onTheme: (String) -> Unit,
) {
    var tab by rememberSaveable { mutableIntStateOf(0) }
    Scaffold(bottomBar = {
        NavigationBar {
            tabs.forEachIndexed { index, (name, glyph) ->
                NavigationBarItem(
                    selected = tab == index,
                    onClick = { tab = index },
                    icon = { Text(glyph) },
                    label = { Text(name) },
                )
            }
        }
    }) { padding ->
        Box(Modifier.padding(padding)) {
            key(tab) {
                when (tab) {
                    0 -> Home(app.store, showResume, onResumeSetup)
                    1 -> Rules(app.store, dictionary = true)
                    2 -> Rules(app.store, dictionary = false)
                    3 -> SettingsPage(app.models, prefs, status, actions, theme, onTheme)
                }
            }
        }
    }
}

@Composable
internal fun Title(title: String, subtitle: String) {
    Column(Modifier.padding(start = 20.dp, top = 20.dp, end = 20.dp, bottom = 12.dp)) {
        Text(title, fontFamily = FontFamily.Serif, style = MaterialTheme.typography.headlineLarge)
        Text(subtitle, color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}
