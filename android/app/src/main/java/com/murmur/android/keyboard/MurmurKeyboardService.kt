package com.murmur.android.keyboard

import android.Manifest
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.content.res.Configuration
import android.graphics.Color
import android.inputmethodservice.InputMethodService
import android.net.Uri
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.provider.Settings
import android.text.InputType
import android.view.ContextThemeWrapper
import android.view.Gravity
import android.view.HapticFeedbackConstants
import android.view.KeyEvent
import android.view.MotionEvent
import android.view.View
import android.view.ViewConfiguration
import android.view.ViewGroup.LayoutParams.MATCH_PARENT
import android.view.ViewGroup.LayoutParams.WRAP_CONTENT
import android.view.inputmethod.EditorInfo
import android.view.inputmethod.InputConnection
import android.view.inputmethod.InputMethodManager
import android.widget.Button
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.ProgressBar
import android.widget.TextView
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
import kotlin.math.roundToInt

private const val READY = "Hold to dictate · tap for hands-free"
private const val REJECTED = "The editor did not accept the edit"
private const val NO_POINTER = -1

class MurmurKeyboardService : InputMethodService() {
    private class Session(
        val generation: Long,
        var connection: InputConnection?,
        val options: Int,
        val keepHistory: Boolean,
    ) {
        val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main)
    }

    private enum class Mode { READY, HOLDING, HANDS_FREE, PROCESSING }

    private val prefs by lazy { getSharedPreferences("settings", MODE_PRIVATE) }
    private val handler = Handler(Looper.getMainLooper())
    private var generation = 0L
    private var session: Session? = null
    private var host: FrameLayout? = null
    private lateinit var mic: Button
    private lateinit var status: TextView
    private lateinit var meter: ProgressBar
    private var recorder: PcmRecorder? = null
    private var dictation: Job? = null
    private var mode = Mode.READY
    private var micPointer = NO_POINTER
    private var deletePointer = NO_POINTER
    private var deleteSession: Session? = null
    private var didRepeat = false

    private val updateMeter = object : Runnable {
        override fun run() {
            if (mode != Mode.HOLDING && mode != Mode.HANDS_FREE) return
            meter.progress = ((recorder?.level ?: 0f) * 100).roundToInt()
            handler.postDelayed(this, 50)
        }
    }

    private val repeatDelete = object : Runnable {
        override fun run() {
            val owner = deleteSession ?: return
            if (deletePointer == NO_POINTER || connection(owner) == null) return
            didRepeat = true
            if (edit(owner, ::deleteOnce)) handler.postDelayed(this, 55)
        }
    }

    override fun onStartInput(attribute: EditorInfo, restarting: Boolean) {
        invalidateSession()
        super.onStartInput(attribute, restarting)
    }

    override fun onCreateInputView(): View = FrameLayout(this).also {
        host = it
        session?.let(::buildKeyboard)
    }

    override fun onStartInputView(info: EditorInfo, restarting: Boolean) {
        super.onStartInputView(info, restarting)
        invalidateSession()
        val owner = Session(generation, currentInputConnection, info.imeOptions, canKeepHistory(info))
        session = owner
        buildKeyboard(owner)
    }

    override fun onFinishInputView(finishingInput: Boolean) {
        invalidateSession()
        super.onFinishInputView(finishingInput)
    }

    override fun onFinishInput() {
        invalidateSession()
        super.onFinishInput()
    }

    override fun onDestroy() {
        invalidateSession()
        host = null
        Transcriber.release()
        super.onDestroy()
    }

    private fun invalidateSession() {
        generation++
        session?.connection = null
        session?.scope?.cancel()
        session = null
        dictation = null
        recorder = null
        micPointer = NO_POINTER
        clearDelete()
        handler.removeCallbacks(updateMeter)
        mode = Mode.READY
        host?.removeAllViews()
    }

    private fun connection(owner: Session): InputConnection? =
        owner.connection?.takeIf { owner.generation == generation && currentInputConnection === it }

    private fun canKeepHistory(info: EditorInfo): Boolean {
        if (info.imeOptions and EditorInfo.IME_FLAG_NO_PERSONALIZED_LEARNING != 0) return false
        val variation = info.inputType and InputType.TYPE_MASK_VARIATION
        return when (info.inputType and InputType.TYPE_MASK_CLASS) {
            InputType.TYPE_CLASS_TEXT -> variation != InputType.TYPE_TEXT_VARIATION_PASSWORD &&
                variation != InputType.TYPE_TEXT_VARIATION_VISIBLE_PASSWORD &&
                variation != InputType.TYPE_TEXT_VARIATION_WEB_PASSWORD
            InputType.TYPE_CLASS_NUMBER -> variation != InputType.TYPE_NUMBER_VARIATION_PASSWORD
            else -> true
        }
    }

    private fun buildKeyboard(owner: Session) {
        val parent = host ?: return
        val dark = when (prefs.getString("theme", "system")) {
            "light" -> false
            "dark" -> true
            else -> resources.configuration.uiMode and Configuration.UI_MODE_NIGHT_MASK ==
                Configuration.UI_MODE_NIGHT_YES
        }
        val theme = if (dark) android.R.style.Theme_Material else android.R.style.Theme_Material_Light
        val ctx = ContextThemeWrapper(this, theme)
        val panel = LinearLayout(ctx).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(10), dp(8), dp(10), dp(8))
            setBackgroundColor(if (dark) Color.rgb(28, 30, 27) else Color.rgb(245, 244, 240))
        }
        status = TextView(ctx).apply {
            gravity = Gravity.CENTER
            minHeight = dp(28)
            textSize = 14f
            setTextColor(if (dark) Color.rgb(238, 238, 232) else Color.rgb(32, 35, 31))
            accessibilityLiveRegion = View.ACCESSIBILITY_LIVE_REGION_POLITE
        }
        meter = ProgressBar(ctx, null, android.R.attr.progressBarStyleHorizontal).apply {
            importantForAccessibility = View.IMPORTANT_FOR_ACCESSIBILITY_NO
            max = 100
        }
        mic = Button(ctx).apply {
            isAllCaps = false
            minHeight = dp(70)
            textSize = 20f
            setOnClickListener { if (session === owner) micClick(owner) }
            setOnTouchListener { view, event -> micTouch(owner, view, event) }
        }
        panel.addView(status, MATCH_PARENT, WRAP_CONTENT)
        panel.addView(meter, MATCH_PARENT, dp(8))
        panel.addView(mic, MATCH_PARENT, WRAP_CONTENT)

        fun key(label: String, description: String, action: () -> Unit) = Button(ctx).apply {
            text = label
            contentDescription = description
            textSize = if (label == "space") 14f else 18f
            isAllCaps = false
            minWidth = dp(48)
            minHeight = dp(48)
            setPadding(dp(1), 0, dp(1), 0)
            setOnClickListener { if (session === owner) action() }
        }

        val keys = listOf(
            key("🌐", "Switch keyboard", ::switchKeyboard),
            key(",", "Comma") { edit(owner) { it.commitText(",", 1) } },
            key("space", "Space") { edit(owner) { it.commitText(" ", 1) } },
            key(".", "Period") { edit(owner) { it.commitText(".", 1) } },
            key("?", "Question mark") { edit(owner) { it.commitText("?", 1) } },
            key("⌫", "Backspace") { edit(owner, ::deleteOnce) }.apply {
                setOnTouchListener { view, event -> deleteTouch(owner, view, event) }
            },
            key("↵", "Enter") { edit(owner) { enter(it, owner.options) } },
        )
        panel.addView(KeyRows(ctx, keys), MATCH_PARENT, WRAP_CONTENT)
        parent.removeAllViews()
        parent.addView(panel, MATCH_PARENT, WRAP_CONTENT)
        showMode(Mode.READY, if (hasPermission()) READY else "Microphone permission required")
    }

    private fun hasPermission() =
        checkSelfPermission(Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED

    private fun switchKeyboard() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P && switchToNextInputMethod(false)) return
        getSystemService(InputMethodManager::class.java)?.showInputMethodPicker()
    }

    private fun micClick(owner: Session) {
        when {
            !hasPermission() -> {
                discard()
                startActivity(
                    Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:$packageName"))
                        .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
                )
            }
            mode == Mode.READY -> start(owner, Mode.HANDS_FREE)
            mode == Mode.HOLDING -> showMode(Mode.HANDS_FREE, "Listening · tap to finish")
            mode == Mode.HANDS_FREE -> finish()
        }
    }

    private fun micTouch(owner: Session, view: View, event: MotionEvent): Boolean {
        if (session !== owner) return true
        when (event.actionMasked) {
            MotionEvent.ACTION_DOWN -> {
                if (mode == Mode.PROCESSING) return true
                micPointer = event.getPointerId(0)
                view.isPressed = true
                if (mode == Mode.READY && hasPermission()) start(owner, Mode.HOLDING)
            }
            MotionEvent.ACTION_POINTER_UP, MotionEvent.ACTION_UP -> {
                if (event.getPointerId(event.actionIndex) != micPointer) return true
                micPointer = NO_POINTER
                view.isPressed = false
                if (mode == Mode.HOLDING && event.eventTime - event.downTime >= 300) finish()
                else view.performClick()
            }
            MotionEvent.ACTION_CANCEL -> {
                if (micPointer != NO_POINTER) discard()
                micPointer = NO_POINTER
                view.isPressed = false
            }
        }
        return true
    }

    private fun deleteTouch(owner: Session, view: View, event: MotionEvent): Boolean {
        if (session !== owner) return true
        when (event.actionMasked) {
            MotionEvent.ACTION_DOWN -> {
                clearDelete()
                deletePointer = event.getPointerId(0)
                deleteSession = owner
                view.isPressed = true
                handler.postDelayed(repeatDelete, ViewConfiguration.getLongPressTimeout().toLong())
            }
            MotionEvent.ACTION_POINTER_UP, MotionEvent.ACTION_UP -> {
                if (event.getPointerId(event.actionIndex) != deletePointer) return true
                val click = !didRepeat
                clearDelete()
                view.isPressed = false
                if (click) view.performClick()
            }
            MotionEvent.ACTION_CANCEL -> {
                clearDelete()
                view.isPressed = false
            }
        }
        return true
    }

    private fun clearDelete() {
        handler.removeCallbacks(repeatDelete)
        deleteSession = null
        deletePointer = NO_POINTER
        didRepeat = false
    }

    private fun start(owner: Session, initial: Mode) {
        if (connection(owner) == null) {
            micPointer = NO_POINTER
            mic.isPressed = false
            showMode(Mode.READY, REJECTED)
            return
        }
        val capture = PcmRecorder()
        recorder = capture
        val listening = if (initial == Mode.HOLDING) "Listening · release to insert" else "Listening · tap to finish"
        showMode(initial, "$listening · ${PcmRecorder.LIMIT_MINUTES} minute limit")
        handler.post(updateMeter)
        if (prefs.getBoolean("haptics", true)) mic.performHapticFeedback(HapticFeedbackConstants.KEYBOARD_TAP)
        dictation = owner.scope.launch {
            var message = READY
            var limit = ""
            try {
                val audio = capture.record()
                if (audio.atLimit) limit = "${PcmRecorder.LIMIT_MINUTES} minute limit reached · "
                micPointer = NO_POINTER
                mic.isPressed = false
                showMode(Mode.PROCESSING, "${limit}Transcribing…")
                message = if (audio.durationMs < 100) "Recording too short"
                else recognize(owner, audio)
            } catch (cancelled: CancellationException) {
                throw cancelled
            } catch (_: TranscriptionException) {
                message = "Transcription failed · check the selected model in Murmur"
            } catch (_: SecurityException) {
                message = "Microphone permission required"
            } catch (_: Exception) {
                message = if (mode == Mode.HOLDING || mode == Mode.HANDS_FREE) "Microphone unavailable"
                else "Dictation failed"
            } finally {
                if (session === owner && recorder === capture) {
                    recorder = null
                    dictation = null
                    micPointer = NO_POINTER
                    mic.isPressed = false
                    showMode(Mode.READY, limit + message)
                }
            }
        }
    }

    private fun finish() {
        recorder?.finish()
        showMode(Mode.PROCESSING, "Finishing recording…")
    }

    private fun discard() {
        recorder = null
        dictation?.cancel()
        dictation = null
        showMode(Mode.READY, "Recording discarded")
    }

    private fun showMode(next: Mode, message: String) {
        mode = next
        val label = when (next) {
            Mode.READY -> if (hasPermission()) "●  Hold to speak" else "Open microphone settings"
            Mode.HOLDING -> "●  Release to insert"
            Mode.HANDS_FREE -> "■  Finish"
            Mode.PROCESSING -> "Working…"
        }
        mic.text = label
        mic.contentDescription = when (next) {
            Mode.READY -> if (hasPermission()) "Start hands-free dictation" else label
            Mode.HOLDING -> "Continue hands-free"
            Mode.HANDS_FREE -> "Finish dictation"
            Mode.PROCESSING -> label
        }
        mic.isEnabled = next != Mode.PROCESSING
        status.text = message
        if (next == Mode.READY || next == Mode.PROCESSING) {
            handler.removeCallbacks(updateMeter)
            meter.progress = 0
        }
    }

    private suspend fun recognize(owner: Session, audio: PcmRecorder.Capture): String {
        val store = (application as MurmurApp).store
        val raw = withContext(Dispatchers.Default) {
            Transcriber.transcribe(applicationContext, audio.samples)
        }
        if (raw.isBlank()) return "No speech recognized"
        val result = withContext(Dispatchers.Default) {
            val dictionary = store.rules("dictionary").map { (from, to) -> ReplacementRule(from, to) }
            val snippets = store.rules("snippets").map { (from, to) -> ReplacementRule(from, to) }
            TextPipeline.format(raw, dictionary, snippets)
        }
        val hasText = result.text.isNotBlank()
        if (!hasText && !result.pressEnter) return "No speech recognized"
        if (hasText && !edit(owner) { target ->
                val last = target.getTextBeforeCursor(1, 0)?.lastOrNull()
                val needsSpace = last != null && !last.isWhitespace() && last !in "([{"
                target.commitText(if (needsSpace) " " + result.text else result.text, 1)
            }) return REJECTED
        val entered = !result.pressEnter || edit(owner) { enter(it, owner.options) }
        if (hasText && owner.keepHistory) {
            // A successful insertion may itself restart input. Finish only this authorized
            // write, never another editor operation, if that happens.
            try {
                withContext(NonCancellable) {
                    store.addDictation(result.text, TextPipeline.countWords(result.text), audio.durationMs)
                }
            } catch (_: Exception) {
                return if (entered) "Inserted · history could not be saved" else "Inserted · Enter and history failed"
            }
        }
        return if (entered) READY else "The editor did not accept Enter"
    }

    private fun edit(owner: Session, operation: (InputConnection) -> Boolean): Boolean {
        val ok = try {
            connection(owner)?.let(operation) == true
        } catch (_: RuntimeException) {
            false
        }
        if (!ok && session === owner) status.text = REJECTED
        return ok
    }

    private fun deleteOnce(target: InputConnection): Boolean {
        if (!target.getSelectedText(0).isNullOrEmpty()) return target.commitText("", 1)
        if (target.deleteSurroundingTextInCodePoints(1, 0)) return true
        // Some editors do not implement the code-point API. Ask the editor to handle
        // Delete rather than blindly deleting one UTF-16 code unit.
        return sendKey(target, KeyEvent.KEYCODE_DEL)
    }

    private fun enter(target: InputConnection, options: Int): Boolean {
        val action = options and EditorInfo.IME_MASK_ACTION
        if (options and EditorInfo.IME_FLAG_NO_ENTER_ACTION == 0 &&
            action != EditorInfo.IME_ACTION_NONE && action != EditorInfo.IME_ACTION_UNSPECIFIED
        ) return target.performEditorAction(action)
        return sendKey(target, KeyEvent.KEYCODE_ENTER)
    }

    private fun sendKey(target: InputConnection, code: Int): Boolean {
        val down = target.sendKeyEvent(KeyEvent(KeyEvent.ACTION_DOWN, code))
        val up = target.sendKeyEvent(KeyEvent(KeyEvent.ACTION_UP, code))
        return down && up
    }
}

private fun Context.dp(value: Int) = (value * resources.displayMetrics.density).roundToInt()

/** Distribute keys over balanced rows using the actual IME width, including split-screen. */
private class KeyRows(context: Context, private val keys: List<Button>) : LinearLayout(context) {
    private var columns = 0

    init {
        orientation = VERTICAL
    }

    override fun onMeasure(widthMeasureSpec: Int, heightMeasureSpec: Int) {
        val gap = context.dp(2)
        val capacity = (MeasureSpec.getSize(widthMeasureSpec) / (context.dp(48) + 2 * gap))
            .coerceIn(1, keys.size)
        val rows = (keys.size + capacity - 1) / capacity
        val needed = (keys.size + rows - 1) / rows
        if (needed != columns) {
            columns = needed
            for (i in 0 until childCount) (getChildAt(i) as LinearLayout).removeAllViews()
            removeAllViews()
            for (group in keys.chunked(columns)) {
                val row = LinearLayout(context)
                for (key in group) {
                    val params = LayoutParams(0, WRAP_CONTENT, 1f)
                    params.setMargins(gap, 0, gap, 0)
                    row.addView(key, params)
                }
                addView(row, MATCH_PARENT, WRAP_CONTENT)
            }
        }
        super.onMeasure(widthMeasureSpec, heightMeasureSpec)
    }
}
