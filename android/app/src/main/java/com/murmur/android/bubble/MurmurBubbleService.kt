package com.murmur.android.bubble

import android.Manifest
import android.accessibilityservice.AccessibilityService
import android.app.KeyguardManager
import android.content.BroadcastReceiver
import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.SharedPreferences
import android.content.pm.PackageManager
import android.content.res.Configuration
import android.graphics.Rect
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.os.PersistableBundle
import android.os.PowerManager
import android.os.SystemClock
import android.text.InputType
import android.view.accessibility.AccessibilityEvent
import android.view.accessibility.AccessibilityNodeInfo
import android.view.accessibility.AccessibilityWindowInfo
import android.widget.Toast
import androidx.core.content.ContextCompat
import com.murmur.android.MainActivity
import com.murmur.android.MurmurApp
import com.murmur.android.asr.PcmRecorder
import com.murmur.android.asr.Transcriber
import com.murmur.android.asr.TranscriptionException
import com.murmur.android.text.ReplacementRule
import com.murmur.android.text.TextPipeline
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.NonCancellable
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

class MurmurBubbleService : AccessibilityService(), SharedPreferences.OnSharedPreferenceChangeListener {
    private class Session(val target: AccessibilityNodeInfo) {
        val recorder = PcmRecorder()
        var job: Job? = null
        var processing = false
        var inserted = false
    }

    private val settings by lazy { getSharedPreferences("settings", MODE_PRIVATE) }
    private val power by lazy { getSystemService(PowerManager::class.java) }
    private val keyguard by lazy { getSystemService(KeyguardManager::class.java) }
    private val handler = Handler(Looper.getMainLooper())
    private var scope: CoroutineScope? = null
    private var overlay: BubbleOverlay? = null
    private var session: Session? = null
    private var updatePending = false
    private val update = Runnable {
        updatePending = false
        updateFocus()
    }
    private val screenReceiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context, intent: Intent) {
            if (intent.action == Intent.ACTION_SCREEN_OFF) {
                cancelSession()
                overlay?.hide()
            } else scheduleUpdate()
        }
    }

    override fun onServiceConnected() {
        super.onServiceConnected()
        if (scope != null) return
        val serviceScope = CoroutineScope(SupervisorJob() + Dispatchers.Main)
        scope = serviceScope
        overlay = BubbleOverlay(this, settings, ::start, ::finish, ::cancelSession) { session?.recorder?.level ?: 0f }
        settings.registerOnSharedPreferenceChangeListener(this)
        val filter = IntentFilter(Intent.ACTION_SCREEN_OFF).apply { addAction(Intent.ACTION_USER_PRESENT) }
        ContextCompat.registerReceiver(this, screenReceiver, filter, ContextCompat.RECEIVER_NOT_EXPORTED)
        serviceScope.launch {
            try {
                Transcriber.preload(applicationContext)
            } catch (cancelled: CancellationException) {
                throw cancelled
            } catch (_: Exception) {
                // Preload is opportunistic; the next requested transcription reports model errors.
            }
        }
        scheduleUpdate()
    }

    override fun onAccessibilityEvent(event: AccessibilityEvent?) {
        // Never carry a live recording across two different editors, even during the debounce.
        val owner = session
        if (owner != null && event?.eventType == AccessibilityEvent.TYPE_VIEW_FOCUSED && !sameTarget(owner)) {
            cancelSession()
            if (!owner.inserted) changedFieldNotice()
        }
        scheduleUpdate()
    }

    override fun onConfigurationChanged(newConfig: Configuration) {
        super.onConfigurationChanged(newConfig)
        scheduleUpdate()
    }

    override fun onSharedPreferenceChanged(prefs: SharedPreferences, key: String?) {
        if (key == null || key == "bubble_enabled" || key == "bubble_snoozed_until") updateFocus()
    }

    private fun scheduleUpdate() {
        if (scope != null && !updatePending) {
            updatePending = true
            handler.postDelayed(update, 150L)
        }
    }

    private fun allowed() = settings.getBoolean("bubble_enabled", true) &&
        settings.getLong("bubble_snoozed_until", 0L) <= System.currentTimeMillis() &&
        power?.isInteractive == true && keyguard?.isDeviceLocked == false

    private fun updateFocus() {
        val bubble = overlay ?: return
        val field = if (allowed()) focusedField() else null
        val owner = session
        val changed = owner != null && owner.target != field
        if (changed) cancelSession()
        try {
            if (field == null) bubble.hide() else bubble.show(keyboardTop())
        } finally {
            field?.discardNode()
        }
        if (changed && owner?.inserted == false) changedFieldNotice()
    }

    private fun changedFieldNotice() {
        if (!allowed()) return
        // The new focus may not allow a bubble (including password fields).
        Toast.makeText(this, "Field changed. Dictation discarded.", Toast.LENGTH_SHORT).show()
    }

    private fun focusedField(): AccessibilityNodeInfo? {
        val node = findFocus(AccessibilityNodeInfo.FOCUS_INPUT) ?: run {
            val root = rootInActiveWindow ?: return null
            try {
                root.findFocus(AccessibilityNodeInfo.FOCUS_INPUT)
            } finally {
                root.discardNode()
            }
        } ?: return null
        val window = node.window
        try {
            if (window == null || !window.isFocused || window.type == AccessibilityWindowInfo.TYPE_ACCESSIBILITY_OVERLAY) {
                node.discardNode()
                return null
            }
            // A virtual provider can return its previously focused child. Its current editor
            // may be a sibling; only search within the same input-focused window.
            if (node.isFocusable && !node.isFocused) {
                node.discardNode()
                return window.root?.takeFocusedEditor()
            }
            return node.takeFocusedEditor()
        } finally {
            window?.discardWindow()
        }
    }

    // API 31 returns the host View when Compose has not yet materialized its focused
    // semantics node. Inspect descendants' focus flags, never their text. This consumes
    // the receiver, transferring ownership of only the matching node to the caller.
    private fun AccessibilityNodeInfo.takeFocusedEditor(): AccessibilityNodeInfo? {
        if (isFocusedEditor()) return this
        if (!isSecret()) {
            for (index in 0 until childCount) {
                val field = getChild(index)?.takeFocusedEditor() ?: continue
                discardNode()
                return field
            }
        }
        discardNode()
        return null
    }

    private fun AccessibilityNodeInfo.isFocusedEditor() =
        isFocused && isEnabled && isVisibleToUser && !isSecret() &&
            (isEditable || actionList.contains(AccessibilityNodeInfo.AccessibilityAction.ACTION_SET_TEXT))

    private fun AccessibilityNodeInfo.isSecret(): Boolean {
        if (isPassword) return true
        val variation = inputType and InputType.TYPE_MASK_VARIATION
        return when (inputType and InputType.TYPE_MASK_CLASS) {
            InputType.TYPE_CLASS_NUMBER -> variation == InputType.TYPE_NUMBER_VARIATION_PASSWORD
            InputType.TYPE_CLASS_TEXT -> variation == InputType.TYPE_TEXT_VARIATION_PASSWORD ||
                variation == InputType.TYPE_TEXT_VARIATION_VISIBLE_PASSWORD ||
                variation == InputType.TYPE_TEXT_VARIATION_WEB_PASSWORD
            else -> false
        }
    }

    private fun keyboardTop(): Int? {
        val bounds = Rect()
        var top: Int? = null
        for (window in windows) {
            if (window.type == AccessibilityWindowInfo.TYPE_INPUT_METHOD) {
                window.getBoundsInScreen(bounds)
                if (!bounds.isEmpty && bounds.top > 0) top = minOf(top ?: bounds.top, bounds.top)
            }
            window.discardWindow()
        }
        return top
    }

    private fun sameTarget(owner: Session): Boolean {
        if (session !== owner || !allowed()) return false
        val target = owner.target
        if (!target.refresh() || !target.isFocusedEditor()) return false
        val field = focusedField() ?: return false
        val same = field == target
        field.discardNode()
        return same
    }

    @Suppress("DEPRECATION")
    private fun AccessibilityNodeInfo.discardNode() {
        if (Build.VERSION.SDK_INT < 33) recycle()
    }

    @Suppress("DEPRECATION")
    private fun AccessibilityWindowInfo.discardWindow() {
        if (Build.VERSION.SDK_INT < 33) recycle()
    }

    private fun microphoneNotice() {
        overlay?.message("Allow microphone in Murmur") {
            startActivity(Intent(this, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
        }
    }

    private fun start() {
        val serviceScope = scope ?: return
        if (session != null || !allowed()) return
        val field = focusedField() ?: run {
            updateFocus()
            return
        }
        if (checkSelfPermission(Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
            field.discardNode()
            microphoneNotice()
            return
        }
        val owner = Session(field)
        session = owner
        overlay?.haptic()
        overlay?.render(BubbleMode.RECORDING)
        owner.job = serviceScope.launch {
            try {
                val audio = owner.recorder.record() // PcmRecorder caps capture at five minutes.
                processing(owner)
                val message = if (audio.durationMs < 100L) "Recording too short" else recognize(owner, audio)
                if (session === owner && message != null) overlay?.message(message)
            } catch (cancelled: CancellationException) {
                throw cancelled
            } catch (_: TranscriptionException) {
                overlay?.message("Transcription failed. Check the model in Murmur.")
            } catch (_: SecurityException) {
                if (checkSelfPermission(Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
                    microphoneNotice()
                } else overlay?.message("Dictation unavailable")
            } catch (_: Exception) {
                overlay?.message(if (owner.processing) "Dictation failed" else "Microphone unavailable")
            } finally {
                if (session === owner) clearSession(owner)
            }
        }
    }

    private fun finish() {
        val owner = session ?: return
        if (owner.processing) return
        overlay?.haptic()
        owner.recorder.finish()
        processing(owner)
    }

    private fun processing(owner: Session) {
        if (owner.processing) return
        owner.processing = true
        overlay?.render(BubbleMode.PROCESSING)
    }

    private fun clearSession(owner: Session) {
        session = null
        owner.target.discardNode()
        overlay?.render(BubbleMode.IDLE)
    }

    private fun cancelSession() {
        val owner = session ?: return
        owner.job?.cancel()
        clearSession(owner)
    }

    private suspend fun recognize(owner: Session, audio: PcmRecorder.Capture): String? {
        val raw = Transcriber.transcribe(applicationContext, audio.samples)
        if (raw.isBlank()) return "No speech recognized"
        val store = (application as MurmurApp).store
        val result = withContext(Dispatchers.Default) {
            val dictionary = store.rules("dictionary").map { (from, to) -> ReplacementRule(from, to) }
            val snippets = store.rules("snippets").map { (from, to) -> ReplacementRule(from, to) }
            TextPipeline.format(raw, dictionary, snippets)
        }
        val hasText = result.text.isNotBlank()
        if (!hasText && !result.pressEnter) return "No speech recognized"
        if (!sameTarget(owner)) return "Field changed. Dictation discarded."
        if (hasText && !insert(owner, result.text)) return "Couldn’t insert dictation in this field"
        owner.inserted = hasText
        val entered = !result.pressEnter || enter(owner)
        if (hasText) {
            // Enter can immediately move focus. Persist only the already accepted insertion.
            try {
                withContext(NonCancellable) {
                    store.addDictation(result.text, TextPipeline.countWords(result.text), audio.durationMs)
                }
            } catch (_: Exception) {
                return "Inserted, but history could not be saved"
            }
        }
        return if (entered) null else "This field did not accept Enter"
    }

    private fun insert(owner: Session, words: String): Boolean {
        val target = owner.target
        val text = target.editorText()
        val start = target.textSelectionStart
        val end = target.textSelectionEnd
        val edit = TextInsertion.insert(text, start, end, words)
        val setText = Bundle().apply { putCharSequence(AccessibilityNodeInfo.ACTION_ARGUMENT_SET_TEXT_CHARSEQUENCE, edit.text) }
        if (target.performAction(AccessibilityNodeInfo.ACTION_SET_TEXT, setText)) {
            if (sameTarget(owner)) {
                val cursor = Bundle().apply {
                    putInt(AccessibilityNodeInfo.ACTION_ARGUMENT_SELECTION_START_INT, edit.cursor)
                    putInt(AccessibilityNodeInfo.ACTION_ARGUMENT_SELECTION_END_INT, edit.cursor)
                }
                target.performAction(AccessibilityNodeInfo.ACTION_SET_SELECTION, cursor)
            }
            return true
        }
        if (!sameTarget(owner) || target.editorText() != text ||
            target.textSelectionStart != start || target.textSelectionEnd != end) return false
        return paste(owner, edit.inserted)
    }

    private fun AccessibilityNodeInfo.editorText() = if (isShowingHintText) "" else text?.toString().orEmpty()

    private fun paste(owner: Session, words: String): Boolean {
        val clipboard = getSystemService(ClipboardManager::class.java) ?: return false
        val previous = clipboard.primaryClip
        // Android 10+ conceals the clipboard from background UIDs. A null read outside our
        // own focused activity is ambiguous: never destroy a clip we cannot back up.
        if (previous == null && Build.VERSION.SDK_INT >= 29 && owner.target.packageName != packageName) return false
        val token = SystemClock.elapsedRealtimeNanos()
        val marker = "com.murmur.android.bubble.clip"
        val clip = ClipData.newPlainText("Murmur dictation", words).apply {
            description.extras = PersistableBundle().apply {
                putLong(marker, token)
                putBoolean("android.content.extra.IS_SENSITIVE", true)
            }
        }
        clipboard.setPrimaryClip(clip)
        try {
            return sameTarget(owner) && owner.target.performAction(AccessibilityNodeInfo.ACTION_PASTE)
        } finally {
            // Do not overwrite a new copy made by the user or by the receiving app.
            if (clipboard.primaryClipDescription?.extras?.getLong(marker) == token) {
                when {
                    previous != null -> clipboard.setPrimaryClip(previous)
                    Build.VERSION.SDK_INT >= 28 -> clipboard.clearPrimaryClip()
                    else -> clipboard.setPrimaryClip(ClipData.newPlainText("", ""))
                }
            }
        }
    }

    private fun enter(owner: Session): Boolean {
        if (Build.VERSION.SDK_INT < 30 || !sameTarget(owner)) return false
        val id = AccessibilityNodeInfo.AccessibilityAction.ACTION_IME_ENTER.id
        return owner.target.actionList.any { it.id == id } && owner.target.performAction(id)
    }

    override fun onInterrupt() {
        cancelSession()
        overlay?.hide()
    }

    private fun disconnect() {
        val serviceScope = scope ?: return
        scope = null
        handler.removeCallbacks(update)
        updatePending = false
        settings.unregisterOnSharedPreferenceChangeListener(this)
        unregisterReceiver(screenReceiver)
        cancelSession()
        serviceScope.cancel()
        overlay?.hide()
        overlay = null
        Transcriber.release()
    }

    override fun onUnbind(intent: Intent): Boolean {
        disconnect()
        return super.onUnbind(intent)
    }

    override fun onDestroy() {
        disconnect()
        super.onDestroy()
    }
}
