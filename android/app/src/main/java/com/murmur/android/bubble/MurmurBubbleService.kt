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
import android.text.InputType
import android.text.Spanned
import android.text.TextUtils
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
import com.murmur.android.data.HISTORY_ENABLED
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
    private var preloadJob: Job? = null
    private var geometryDirty = true
    private var placedWindowId: Int? = null
    private val availableBounds = Rect()
    private val editorWindowBounds = Rect()
    private val imeBounds = Rect()
    private val windowBounds = Rect()
    private val snoozeExpiry = Runnable { availabilityChanged() }
    private class CopyOffer(val target: AccessibilityNodeInfo, val words: String)
    private var copyOffer: CopyOffer? = null
    private val forgetCopy = Runnable { clearCopyOffer() }
    private var updatePending = false
    private val update = Runnable {
        updatePending = false
        updateFocus()
    }
    private val screenReceiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context, intent: Intent) {
            if (intent.action == Intent.ACTION_SCREEN_OFF) {
                cancelSession()
                hideBubble()
            } else availabilityChanged()
        }
    }

    override fun onServiceConnected() {
        super.onServiceConnected()
        if (scope != null) return
        val serviceScope = CoroutineScope(SupervisorJob() + Dispatchers.Main)
        scope = serviceScope
        overlay = BubbleOverlay(this, settings, ::start, ::finish, ::cancelSession) { session?.recorder?.level ?: 0f }
        settings.registerOnSharedPreferenceChangeListener(this)
        val filter = IntentFilter(Intent.ACTION_SCREEN_OFF).apply {
            addAction(Intent.ACTION_SCREEN_ON)
            addAction(Intent.ACTION_USER_PRESENT)
            addAction(Intent.ACTION_TIME_CHANGED)
        }
        ContextCompat.registerReceiver(this, screenReceiver, filter, ContextCompat.RECEIVER_NOT_EXPORTED)
        availabilityChanged()
    }

    private fun availabilityChanged() {
        val serviceScope = scope ?: return
        handler.removeCallbacks(snoozeExpiry)
        val until = settings.getLong("bubble_snoozed_until", 0L)
        val now = System.currentTimeMillis()
        val enabled = settings.getBoolean("bubble_enabled", true)
        if (enabled && until > now) handler.postDelayed(snoozeExpiry, until - now)
        if (!enabled || until > now) {
            preloadJob?.cancel()
            preloadJob = null
        } else if (preloadJob == null) {
            preloadJob = serviceScope.launch {
                if (!bubbleAvailable()) return@launch
                try {
                    Transcriber.preload(applicationContext)
                } catch (cancelled: CancellationException) {
                    throw cancelled
                } catch (_: Exception) {
                    // The requested transcription reports any model error.
                }
            }
        }
        updateFocus()
    }

    override fun onAccessibilityEvent(event: AccessibilityEvent?) {
        // Recheck immediately while capturing or decoding: a content change can turn
        // the same focused node into a password field without another focus event.
        val owner = session
        if (owner != null && !sameTarget(owner)) {
            cancelSession()
            if (!owner.inserted) changedFieldNotice()
        }
        val type = event?.eventType
        scheduleUpdate(geometryChanged = type == AccessibilityEvent.TYPE_WINDOWS_CHANGED ||
            type == AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED)
    }

    override fun onConfigurationChanged(newConfig: Configuration) {
        super.onConfigurationChanged(newConfig)
        scheduleUpdate(geometryChanged = true)
    }

    override fun onSharedPreferenceChanged(prefs: SharedPreferences, key: String?) {
        if (key == null || key == "bubble_enabled" || key == "bubble_snoozed_until") availabilityChanged()
    }

    private fun scheduleUpdate(geometryChanged: Boolean) {
        if (geometryChanged) geometryDirty = true
        if (scope != null && !updatePending) {
            updatePending = true
            handler.postDelayed(update, 150L)
        }
    }

    private fun bubbleAvailable() = settings.getBoolean("bubble_enabled", true) &&
        settings.getLong("bubble_snoozed_until", 0L) <= System.currentTimeMillis()

    private fun allowed() = bubbleAvailable() && power?.isInteractive == true &&
        keyguard?.isDeviceLocked == false && keyguard?.isKeyguardLocked == false

    private fun hideBubble() {
        placedWindowId = null
        clearCopyOffer()
        overlay?.hide()
    }

    private fun updateFocus() {
        val bubble = overlay ?: return
        val field = if (allowed()) focusedField() else null
        val owner = session
        val changed = owner != null && owner.target != field
        if (changed) cancelSession()
        try {
            if (copyOffer?.let { it.target != field } == true) hideBubble()
            if (field == null) {
                if (placedWindowId != null) hideBubble()
            } else if (geometryDirty || placedWindowId != field.windowId) {
                placeBubble(bubble, field)
                placedWindowId = field.windowId
            }
            geometryDirty = false
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
        val node = findFocus(AccessibilityNodeInfo.FOCUS_INPUT)
        if (node != null) {
            val window = node.window
            try {
                if (window != null && window.isFocusedApplication()) {
                    if (node.isFocused && node.isSecret()) {
                        node.discardNode()
                        return null
                    }
                    if (node.isFocusable && !node.isFocused) {
                        node.discardNode() // A stale virtual child; the editor can be a sibling.
                    } else {
                        node.takeFocusedEditor()?.let { return it }
                    }
                    return window.root?.takeFocusedEditor()
                }
            } finally {
                window?.discardWindow()
            }
            node.discardNode()
        }

        // No usable global result. Never substitute accessibility focus or another app.
        var field: AccessibilityNodeInfo? = null
        for (window in windows) {
            try {
                if (field == null && window.isFocusedApplication()) {
                    field = window.root?.takeFocusedEditor()
                }
            } finally {
                window.discardWindow()
            }
        }
        return field
    }

    private fun AccessibilityWindowInfo.isFocusedApplication() =
        isFocused && type == AccessibilityWindowInfo.TYPE_APPLICATION

    // API 31 returns the host View when Compose has not yet materialized its focused
    // semantics node. Inspect descendants' focus flags, never their text. This consumes
    // the receiver, transferring ownership of only the matching node to the caller.
    private fun AccessibilityNodeInfo.takeFocusedEditor(): AccessibilityNodeInfo? {
        if (isFocusedEditor() && refresh() && isFocusedEditor()) return this
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

    private fun placeBubble(bubble: BubbleOverlay, field: AccessibilityNodeInfo) {
        editorWindowBounds.setEmpty()
        imeBounds.setEmpty()
        for (window in windows) {
            try {
                if (window.id == field.windowId && window.isFocusedApplication()) {
                    window.getBoundsInScreen(editorWindowBounds)
                } else if (window.type == AccessibilityWindowInfo.TYPE_INPUT_METHOD) {
                    window.getBoundsInScreen(windowBounds)
                    imeBounds.union(windowBounds)
                }
            } finally {
                window.discardWindow()
            }
        }
        bubble.getSafeDisplayBounds(availableBounds)
        if (editorWindowBounds.isEmpty || availableBounds.isEmpty) {
            bubble.show(if (imeBounds.isEmpty) null else imeBounds.top)
            return
        }
        if (!availableBounds.intersect(editorWindowBounds)) availableBounds.setEmpty()
        if (imeBounds.intersect(availableBounds)) excludeIme(availableBounds, imeBounds)
        if (availableBounds.isEmpty) {
            // A fullscreen IME can leave no room even for a cancel button.
            cancelSession()
            clearCopyOffer()
        }
        bubble.showInBounds(availableBounds)
    }

    // The overlay accepts one rectangle. Choose the largest unobstructed strip;
    // a floating keyboard need not take the entire width of a split-screen app.
    private fun excludeIme(bounds: Rect, ime: Rect) {
        val above = (ime.top - bounds.top).toLong() * bounds.width()
        val below = (bounds.bottom - ime.bottom).toLong() * bounds.width()
        val left = (ime.left - bounds.left).toLong() * bounds.height()
        val right = (bounds.right - ime.right).toLong() * bounds.height()
        when (maxOf(maxOf(above, below), maxOf(left, right))) {
            above -> bounds.bottom = ime.top
            below -> bounds.top = ime.bottom
            left -> bounds.right = ime.left
            else -> bounds.left = ime.right
        }
    }

    private fun sameTarget(owner: Session) = session === owner && stillFocused(owner.target)

    private fun stillFocused(target: AccessibilityNodeInfo): Boolean {
        if (!allowed()) return false
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
        clearCopyOffer()
        val owner = Session(field)
        session = owner
        overlay?.haptic()
        overlay?.render(BubbleMode.RECORDING)
        owner.job = serviceScope.launch {
            try {
                owner.recorder.withCapture { audio ->
                    processing(owner)
                    val message = if (audio.durationMs < 100L) "Recording too short" else recognize(owner, audio)
                    if (session === owner && message != null) overlay?.message(message)
                }
            } catch (cancelled: CancellationException) {
                throw cancelled
            } catch (_: TranscriptionException) {
                if (session === owner) overlay?.message("Transcription failed. Check the model in Murmur.")
            } catch (_: SecurityException) {
                if (session !== owner) return@launch
                if (checkSelfPermission(Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
                    microphoneNotice()
                } else overlay?.message("Dictation unavailable")
            } catch (_: Exception) {
                if (session === owner) overlay?.message(if (owner.processing) "Dictation failed" else "Microphone unavailable")
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
        if (hasText) {
            when (insert(owner, result.text)) {
                Insertion.VERIFIED -> Unit
                Insertion.MANUAL -> {
                    offerCopy(owner, result.text)
                    return null
                }
                Insertion.UNCERTAIN -> return "Couldn’t verify dictation. Check the field."
            }
        }
        owner.inserted = hasText
        val entered = !result.pressEnter || enter(owner)
        if (hasText) {
            // Enter can immediately move focus. Only a verified insertion reaches here.
            try {
                withContext(NonCancellable) {
                    if (settings.getBoolean(HISTORY_ENABLED, true)) {
                        store.addDictation(result.text, TextPipeline.countWords(result.text), audio.durationMs)
                    }
                }
            } catch (_: Exception) {
                return "Inserted, but history could not be saved"
            }
        }
        return if (entered) null else "This field did not accept Enter"
    }

    private enum class Insertion { VERIFIED, MANUAL, UNCERTAIN }

    private fun insert(owner: Session, words: String): Insertion {
        val target = owner.target
        val hint = target.isShowingHintText
        val text = target.plainEditorText() ?: return Insertion.MANUAL
        val start = target.textSelectionStart
        val end = target.textSelectionEnd
        val noCaret = start == -1 && end == -1
        // Out-of-range offsets are evidence of an incomplete snapshot. An unknown
        // selection in a populated editor is not permission to append or replace.
        if (!(noCaret && text.isEmpty()) && (start !in 0..text.length || end !in 0..text.length)) {
            return Insertion.MANUAL
        }
        val edit = TextInsertion.insert(text, start, end, words)
        val args = Bundle().apply {
            putCharSequence(AccessibilityNodeInfo.ACTION_ARGUMENT_SET_TEXT_CHARSEQUENCE, edit.text)
        }
        val accepted = target.performAction(AccessibilityNodeInfo.ACTION_SET_TEXT, args)
        if (!sameTarget(owner)) return Insertion.UNCERTAIN
        if (!accepted) {
            val unchanged = target.isShowingHintText == hint && target.plainEditorText() == text &&
                target.textSelectionStart == start && target.textSelectionEnd == end
            return if (unchanged) Insertion.MANUAL else Insertion.UNCERTAIN
        }
        // Never move a selection, issue Enter, or save history based on action acceptance.
        if (!target.showsText(edit.text)) return Insertion.UNCERTAIN
        if (target.hasCaret(edit.cursor) ||
            (noCaret && target.textSelectionStart == -1 && target.textSelectionEnd == -1)) {
            return Insertion.VERIFIED
        }
        val cursor = Bundle().apply {
            putInt(AccessibilityNodeInfo.ACTION_ARGUMENT_SELECTION_START_INT, edit.cursor)
            putInt(AccessibilityNodeInfo.ACTION_ARGUMENT_SELECTION_END_INT, edit.cursor)
        }
        target.performAction(AccessibilityNodeInfo.ACTION_SET_SELECTION, cursor)
        return if (sameTarget(owner) && target.showsText(edit.text) && target.hasCaret(edit.cursor)) {
            Insertion.VERIFIED
        } else Insertion.UNCERTAIN
    }

    private fun AccessibilityNodeInfo.hasCaret(offset: Int) =
        textSelectionStart == offset && textSelectionEnd == offset

    private fun AccessibilityNodeInfo.showsText(expected: String) =
        !isShowingHintText && TextUtils.equals(text, expected)

    private fun AccessibilityNodeInfo.plainEditorText(): String? {
        if (isShowingHintText) return "" // The visible hint is not part of the value.
        val value = text ?: return null // Withheld text is not a known-empty editor.
        return when (value) {
            is String -> value
            is Spanned -> if (value.getSpans(0, value.length, Any::class.java).isEmpty()) value.toString() else null
            else -> null // Unknown representation: don't flatten it into a whole-field write.
        }
    }

    @Suppress("DEPRECATION")
    private fun offerCopy(owner: Session, words: String) {
        if (!sameTarget(owner)) return
        clearCopyOffer()
        copyOffer = CopyOffer(AccessibilityNodeInfo.obtain(owner.target), words)
        // The overlay's listener can outlive its notice; don't let it retain a transcript.
        overlay?.message("Copy for manual paste", ::copyForManualPaste)
        handler.postDelayed(forgetCopy, 6_500L)
    }

    private fun copyForManualPaste() {
        val offer = copyOffer ?: return
        try {
            if (!stillFocused(offer.target)) return
            val clipboard = getSystemService(ClipboardManager::class.java)
            if (clipboard == null) {
                overlay?.message("Clipboard unavailable")
                return
            }
            val clip = ClipData.newPlainText("Murmur dictation", offer.words).apply {
                description.extras = PersistableBundle().apply { putBoolean("android.content.extra.IS_SENSITIVE", true) }
            }
            clipboard.setPrimaryClip(clip)
            overlay?.message("Copied. Paste in the field.")
        } catch (_: SecurityException) {
            overlay?.message("Clipboard unavailable")
        } finally {
            clearCopyOffer()
        }
    }

    private fun clearCopyOffer() {
        val offer = copyOffer ?: return
        copyOffer = null
        handler.removeCallbacks(forgetCopy)
        offer.target.discardNode()
    }

    private fun enter(owner: Session): Boolean {
        if (Build.VERSION.SDK_INT < 30 || !sameTarget(owner)) return false
        val id = AccessibilityNodeInfo.AccessibilityAction.ACTION_IME_ENTER.id
        return owner.target.actionList.any { it.id == id } && owner.target.performAction(id)
    }

    override fun onInterrupt() {
        cancelSession()
        hideBubble()
    }

    // MurmurApp handles process-wide onTrimMemory; older Android versions may
    // also deliver the legacy low-memory callback.
    @Deprecated("Legacy Android memory-pressure callback")
    override fun onLowMemory() {
        super.onLowMemory()
        Transcriber.releaseIfIdle()
    }

    private fun disconnect() {
        val serviceScope = scope ?: return
        scope = null
        handler.removeCallbacks(update)
        handler.removeCallbacks(snoozeExpiry)
        preloadJob = null
        updatePending = false
        settings.unregisterOnSharedPreferenceChangeListener(this)
        unregisterReceiver(screenReceiver)
        cancelSession()
        serviceScope.cancel()
        hideBubble()
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
