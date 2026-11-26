package com.murmur.android.bubble

import android.content.Context
import android.content.SharedPreferences
import android.content.res.ColorStateList
import android.graphics.Canvas
import android.graphics.Paint
import android.graphics.PixelFormat
import android.graphics.Point
import android.graphics.Rect
import android.graphics.drawable.GradientDrawable
import android.graphics.drawable.RippleDrawable
import android.os.Build
import android.os.SystemClock
import android.view.Gravity
import android.view.MotionEvent
import android.view.View
import android.view.ViewConfiguration
import android.view.ViewGroup.LayoutParams.WRAP_CONTENT
import android.view.WindowInsets
import android.view.WindowManager
import android.widget.LinearLayout
import android.widget.TextView
import androidx.core.view.ViewCompat
import kotlin.math.abs
import kotlin.math.roundToInt
import kotlin.math.sqrt

private val lavender = 0xFFEBDDFB.toInt()
private val cream = 0xFFFFFDE8.toInt()
private val ink = 0xFF1A1A1A.toInt()
private fun Context.dp(value: Int) = (value * resources.displayMetrics.density).roundToInt()
private fun Context.shape(color: Int, radius: Int) = GradientDrawable().apply {
    setColor(color)
    cornerRadius = dp(radius).toFloat()
}

internal enum class BubbleMode { IDLE, RECORDING, PROCESSING }

internal object BubbleDebug {
    @Volatile var visible = false
}

/** Each window wraps its content; unused screen space always belongs to the underlying app. */
internal class BubbleOverlay(
    private val context: Context,
    private val settings: SharedPreferences,
    start: () -> Unit,
    finish: () -> Unit,
    cancel: () -> Unit,
    level: () -> Float,
) {
    private val wm = requireNotNull(context.getSystemService(WindowManager::class.java))
    private val bounds = Rect()
    private val hit = Rect()
    private val requestedBounds = Rect()
    private val displaySize = Point()
    private var imeTop: Int? = null
    private var rotation = -1
    private var dragging = false
    private var dragX = 0
    private var dragY = 0
    private var originX = 0
    private var originY = 0
    private val controls: BubbleView = BubbleView(context, start, finish, cancel, level, ::drag, ::drop,
        ::snooze, ::moveBy, ::resetPosition)
    private val notice = label()
    private val target = label().apply {
        text = "✕  Hide for 1 hour"
        minimumWidth = context.dp(48)
        minimumHeight = minimumWidth
        importantForAccessibility = View.IMPORTANT_FOR_ACCESSIBILITY_NO
    }
    private val controlParams = params()
    private val targetParams = params(touchable = false)
    private val noticeParams = params()
    private val clearNotice = Runnable { remove(notice) }

    private fun label() = TextView(context).apply {
        gravity = Gravity.CENTER
        textSize = 14f
        setTextColor(cream)
        background = context.shape(ink, 18)
        val pad = context.dp(14)
        setPadding(pad, context.dp(8), pad, context.dp(8))
        accessibilityLiveRegion = View.ACCESSIBILITY_LIVE_REGION_POLITE
    }

    private fun params(touchable: Boolean = true) = WindowManager.LayoutParams(
        WRAP_CONTENT, WRAP_CONTENT, WindowManager.LayoutParams.TYPE_ACCESSIBILITY_OVERLAY,
        WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS or
            WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN or
            (if (touchable) 0 else WindowManager.LayoutParams.FLAG_NOT_TOUCHABLE),
        PixelFormat.TRANSLUCENT,
    ).apply {
        gravity = Gravity.TOP or Gravity.LEFT
        if (Build.VERSION.SDK_INT >= 30) fitInsetsTypes = 0
    }

    init {
        controls.setOnApplyWindowInsetsListener { view, insets ->
            if (dragging) {
                refreshBounds()
                position()
            }
            view.onApplyWindowInsets(insets)
        }
    }

    fun show(keyboardTop: Int?) {
        requestedBounds.setEmpty()
        imeTop = keyboardTop
        refreshBounds()
        position()
    }

    /** Service-computed usable region in screen coordinates, excluding the IME. */
    fun showInBounds(availableBounds: Rect) {
        if (availableBounds.isEmpty) {
            hideUnplaceable()
            return
        }
        requestedBounds.set(availableBounds)
        imeTop = null
        refreshBounds()
        position()
    }

    private fun refreshBounds() {
        val currentRotation = displayRotation()
        if (rotation != currentRotation && dragging) {
            controls.clearGesture()
            dragging = false
            remove(target)
        }
        rotation = currentRotation
        getSafeDisplayBounds(bounds)
        if (!requestedBounds.isEmpty && !bounds.intersect(requestedBounds)) bounds.setEmpty()
        imeTop?.let { if (it > bounds.top) bounds.bottom = minOf(bounds.bottom, it) }
    }

    /** Writes the display area outside system bars and cutouts, before editor or IME clipping. */
    @Suppress("DEPRECATION")
    fun getSafeDisplayBounds(out: Rect) {
        if (Build.VERSION.SDK_INT >= 30) {
            val metrics = wm.currentWindowMetrics
            val display = metrics.bounds
            val insets = metrics.windowInsets.getInsetsIgnoringVisibility(
                WindowInsets.Type.systemBars() or WindowInsets.Type.displayCutout(),
            )
            out.set(display.left + insets.left, display.top + insets.top,
                display.right - insets.right, display.bottom - insets.bottom)
        } else {
            wm.defaultDisplay.getRealSize(displaySize)
            val insets = controls.rootWindowInsets
            out.set(insets?.stableInsetLeft ?: 0, insets?.stableInsetTop ?: context.dp(24),
                displaySize.x - (insets?.stableInsetRight ?: 0), displaySize.y - (insets?.stableInsetBottom ?: context.dp(48)))
        }
    }

    @Suppress("DEPRECATION")
    private fun displayRotation() = controls.display?.rotation ?: wm.defaultDisplay.rotation

    fun hide() {
        controls.clearGesture()
        dragging = false
        notice.removeCallbacks(clearNotice)
        remove(notice)
        remove(target)
        remove(controls)
    }

    private fun hideUnplaceable() {
        hide()
        controls.cancelIfRecording()
    }

    fun render(mode: BubbleMode) {
        controls.render(mode)
        if (controls.parent != null) position()
    }

    fun haptic() {
        if (settings.getBoolean("haptics", true)) {
            controls.performHapticFeedback(android.view.HapticFeedbackConstants.VIRTUAL_KEY)
        }
    }

    fun message(text: String, action: (() -> Unit)? = null) {
        if (controls.parent == null) return
        notice.removeCallbacks(clearNotice)
        notice.text = text
        notice.setOnClickListener(if (action == null) null else View.OnClickListener { action() })
        notice.isClickable = action != null
        notice.minimumWidth = if (action == null) 0 else context.dp(48)
        notice.minimumHeight = notice.minimumWidth
        if (action == null) noticeParams.flags = noticeParams.flags or WindowManager.LayoutParams.FLAG_NOT_TOUCHABLE
        else noticeParams.flags = noticeParams.flags and WindowManager.LayoutParams.FLAG_NOT_TOUCHABLE.inv()
        // A changed touchability flag must be sent even if the notice hasn't moved.
        if (notice.parent != null) wm.updateViewLayout(notice, noticeParams)
        placeNotice()
        notice.postDelayed(clearNotice, if (action == null) 3200L else 6500L)
    }

    private fun measure(view: View) {
        view.measure(View.MeasureSpec.makeMeasureSpec(bounds.width(), View.MeasureSpec.AT_MOST),
            View.MeasureSpec.makeMeasureSpec(bounds.height(), View.MeasureSpec.AT_MOST))
    }

    private fun position() {
        val tap = context.dp(48)
        if (bounds.width() < tap || bounds.height() < tap) {
            hideUnplaceable()
            return
        }
        controls.fitTo(bounds.width(), bounds.height())
        measure(controls)
        val w = controls.measuredWidth
        val h = controls.measuredHeight
        val gap = context.dp(8)
        val idleSize = context.dp(56)
        val floor = bounds.bottom
        val savedX = settings.getInt("bubble_x", -1)
        val savedY = settings.getInt("bubble_y", -1)
        val idleX = if (savedX < 0) bounds.right - idleSize - gap else savedX
        val idleY = if (savedY < 0) floor - idleSize - gap else savedY
        val x = if (dragging) dragX else idleX + idleSize - w
        val y = if (dragging) dragY else idleY + idleSize - h
        val bottom = if (dragging) bounds.bottom else floor - gap
        place(controls, controlParams, x.coerceIn(bounds.left, maxOf(bounds.left, bounds.right - w)),
            y.coerceIn(bounds.top, maxOf(bounds.top, bottom - h)))
        if (notice.parent != null) placeNotice()
        if (dragging) positionTarget()
    }

    private fun placeNotice() {
        // WRAP_CONTENT windows are remeasured by WindowManager against the display, not this region.
        if (notice.maxWidth != bounds.width()) notice.maxWidth = bounds.width()
        if (notice.maxHeight != bounds.height()) notice.maxHeight = bounds.height()
        measure(notice)
        val x = (controlParams.x + controls.measuredWidth - notice.measuredWidth)
            .coerceIn(bounds.left, maxOf(bounds.left, bounds.right - notice.measuredWidth))
        val above = controlParams.y - notice.measuredHeight - context.dp(4)
        val y = if (above >= bounds.top) above else controlParams.y + controls.measuredHeight
        place(notice, noticeParams, x, y.coerceIn(bounds.top, maxOf(bounds.top, bounds.bottom - notice.measuredHeight)))
    }

    private fun place(view: View, params: WindowManager.LayoutParams, x: Int, y: Int) {
        val moved = params.x != x || params.y != y
        params.x = x
        params.y = y
        if (view.parent == null) wm.addView(view, params)
        else if (moved) wm.updateViewLayout(view, params)
    }

    private fun remove(view: View) {
        if (view.parent != null) wm.removeViewImmediate(view)
    }

    private fun positionTarget() {
        if (target.maxWidth != bounds.width()) target.maxWidth = bounds.width()
        if (target.maxHeight != bounds.height()) target.maxHeight = bounds.height()
        if (target.isLayoutRequested || target.measuredWidth == 0) measure(target)
        val w = target.measuredWidth
        val h = target.measuredHeight
        val left = bounds.left + (bounds.width() - w) / 2
        val top = maxOf(bounds.top, bounds.bottom - h - context.dp(16))
        place(target, targetParams, left, top)
        val pad = context.dp(8)
        hit.set(maxOf(bounds.left, left - pad), maxOf(bounds.top, top - pad),
            minOf(bounds.right, left + w + pad), minOf(bounds.bottom, top + h + pad))
    }

    private fun drag(dx: Int, dy: Int, rawX: Int, rawY: Int) {
        if (rotation != displayRotation()) {
            controls.clearGesture()
            refreshBounds()
            position()
            return
        }
        if (!dragging) {
            dragging = true
            originX = controlParams.x
            originY = controlParams.y
            remove(notice)
        }
        dragX = originX + dx
        dragY = originY + dy
        position()
        val overTarget = hit.contains(rawX, rawY)
        if (target.isActivated != overTarget) {
            target.isActivated = overTarget
            target.setTextColor(if (overTarget) ink else cream)
            target.backgroundTintList = if (overTarget) ColorStateList.valueOf(lavender) else null
        }
    }

    private fun drop(x: Int, y: Int, cancelled: Boolean) {
        if (!dragging) return
        refreshBounds()
        if (!dragging || bounds.isEmpty) {
            position()
            return
        }
        if (!cancelled) positionTarget()
        dragging = false
        remove(target)
        if (!cancelled && hit.contains(x, y)) {
            snooze()
        } else {
            if (!cancelled) settings.edit().putInt("bubble_x", controlParams.x).putInt("bubble_y", controlParams.y).apply()
            position()
        }
    }

    private fun snooze() {
        controls.announceForAccessibility("Bubble hidden for one hour")
        settings.edit().putLong("bubble_snoozed_until", System.currentTimeMillis() + 3_600_000L).apply()
        hide()
    }

    private fun moveBy(horizontal: Int, vertical: Int) {
        val step = context.dp(56)
        val x = (controlParams.x + horizontal * step).coerceIn(bounds.left,
            maxOf(bounds.left, bounds.right - controls.width))
        val y = (controlParams.y + vertical * step).coerceIn(bounds.top,
            maxOf(bounds.top, bounds.bottom - controls.height - context.dp(8)))
        if (x == controlParams.x && y == controlParams.y) {
            controls.announceForAccessibility("Bubble is at the edge")
            return
        }
        settings.edit().putInt("bubble_x", x).putInt("bubble_y", y).apply()
        position()
        controls.announceForAccessibility("Bubble moved")
    }

    private fun resetPosition() {
        settings.edit().remove("bubble_x").remove("bubble_y").apply()
        position()
        controls.announceForAccessibility("Bubble position reset")
    }
}

/** Own the entire idle pointer stream: expanding the child controls must not lose the hold release. */
private class BubbleView(
    context: Context,
    private val start: () -> Unit,
    private val finish: () -> Unit,
    private val cancel: () -> Unit,
    level: () -> Float,
    private val drag: (Int, Int, Int, Int) -> Unit,
    private val drop: (Int, Int, Boolean) -> Unit,
    snooze: () -> Unit,
    moveBy: (Int, Int) -> Unit,
    resetPosition: () -> Unit,
) : LinearLayout(context) {
    private val slop = ViewConfiguration.get(context).scaledTouchSlop
    private val cancelDistance = context.dp(56)
    private var cancelArmed = false
    private var tracking = false
    private var held = false
    private var moved = false
    private var downX = 0f
    private var downY = 0f
    private val longPress = Runnable {
        if (tracking && !moved) {
            held = true
            start()
        }
    }
    private val logo = Bars(context, level)
    private val wave = Bars(context, level)
    private val cross = icon("✕", "Cancel dictation", lavender, cancel)
    private val check = icon("✓", "Insert dictation", cream, finish)
    private val holdHint = TextView(context).apply {
        gravity = Gravity.CENTER
        textSize = 14f
        setTextColor(ink)
        background = context.shape(lavender, 24)
        val pad = context.dp(12)
        setPadding(pad, context.dp(6), pad, context.dp(6))
        minimumHeight = context.dp(48)
    }
    private var mode = BubbleMode.IDLE
    private var fittedWidth = -1
    private var fittedHeight = -1
    private var singleAction = false
    private var compactHoldHint = false

    init {
        gravity = Gravity.CENTER
        clipToPadding = false
        val pad = context.dp(4)
        setPadding(pad, pad, pad, pad)
        decorate(logo, lavender, 14, "Start dictation", start)
        idleAction("Hide for one hour", snooze)
        idleAction("Move left") { moveBy(-1, 0) }
        idleAction("Move right") { moveBy(1, 0) }
        idleAction("Move up") { moveBy(0, -1) }
        idleAction("Move down") { moveBy(0, 1) }
        idleAction("Reset position", resetPosition)
        decorate(wave, lavender, 28, "Finish dictation", finish)
        addView(logo, context.dp(48), context.dp(48))
        addView(cross, context.dp(48), context.dp(48))
        addView(wave, LayoutParams(context.dp(140), context.dp(56)).apply {
            leftMargin = context.dp(6)
            rightMargin = leftMargin
        })
        addView(check, context.dp(48), context.dp(48))
        check.setOnLongClickListener {
            cancel()
            true
        }
        check.isLongClickable = false
        addView(holdHint, context.dp(168), WRAP_CONTENT)
        render(BubbleMode.IDLE)
    }

    private fun idleAction(label: String, action: () -> Unit) {
        ViewCompat.addAccessibilityAction(logo, label) { _, _ ->
            if (mode != BubbleMode.IDLE || tracking) false else {
                action()
                true
            }
        }
    }

    override fun onAttachedToWindow() {
        super.onAttachedToWindow()
        BubbleDebug.visible = true
    }

    override fun onDetachedFromWindow() {
        BubbleDebug.visible = false
        super.onDetachedFromWindow()
    }

    private fun decorate(view: View, color: Int, radius: Int, label: String, action: () -> Unit) {
        view.background = RippleDrawable(ColorStateList.valueOf(0x201A1A1A), context.shape(color, radius), null)
        view.elevation = context.dp(3).toFloat()
        view.contentDescription = label
        view.setOnClickListener { action() }
    }

    private fun icon(glyph: String, label: String, color: Int, action: () -> Unit) = TextView(context).apply {
        text = glyph
        gravity = Gravity.CENTER
        includeFontPadding = false
        textSize = 23f
        setTextColor(ink)
        decorate(this, color, 24, label, action)
    }

    fun render(next: BubbleMode) {
        val changed = mode != next
        if (changed) fittedWidth = -1
        mode = next
        val idle = next == BubbleMode.IDLE
        val holdRecording = held && next == BubbleMode.RECORDING
        logo.visibility = if (idle) View.VISIBLE else View.GONE
        holdHint.visibility = if (holdRecording) View.VISIBLE else View.GONE
        if (holdRecording && changed) showHoldHint()
        wave.mode = next
        wave.isClickable = next == BubbleMode.RECORDING
        wave.contentDescription = if (next == BubbleMode.PROCESSING) "Transcribing…" else "Listening. Tap to finish dictation"
        if (changed && !holdRecording && !idle) announceForAccessibility(wave.contentDescription)
    }

    fun cancelIfRecording() {
        if (mode == BubbleMode.RECORDING) cancel()
    }

    fun fitTo(width: Int, height: Int) {
        if (width == fittedWidth && height == fittedHeight) return
        fittedWidth = width
        fittedHeight = height
        val tap = context.dp(48)
        val recording = mode == BubbleMode.RECORDING && !held
        val column = recording && width < 2 * tap && height >= 2 * tap
        val single = recording && width < 2 * tap && !column
        val cols = if (recording && !column && !single) 2 else 1
        val rows = if (column) 2 else 1
        val padX = minOf(context.dp(4), (width - cols * tap) / 2)
        val padY = minOf(context.dp(4), (height - rows * tap) / 2)
        setPadding(padX, padY, padX, padY)
        orientation = if (column) VERTICAL else HORIZONTAL

        val expanded = recording || mode == BubbleMode.PROCESSING
        cross.visibility = if (expanded && !single) View.VISIBLE else View.GONE
        check.visibility = if (recording) View.VISIBLE else View.GONE
        // A single 48dp cell cannot show two buttons. Tap inserts; long press cancels.
        if (singleAction != single) {
            singleAction = single
            check.isLongClickable = single
            check.text = if (single) "✓\nHold: ✕" else "✓"
            check.textSize = if (single) 12f else 23f
            check.contentDescription = if (single) "Insert dictation. Touch and hold to cancel" else "Insert dictation"
            if (single) check.announceForAccessibility(check.contentDescription)
        }

        val innerWidth = width - 2 * padX
        val innerHeight = height - 2 * padY
        val waveParams = wave.layoutParams as LayoutParams
        val waveWidth = minOf(context.dp(140), innerWidth - cols * tap - waveParams.leftMargin - waveParams.rightMargin)
        val showWave = expanded && !column && !single && waveWidth >= tap
        wave.visibility = if (showWave) View.VISIBLE else View.GONE
        if (showWave) {
            waveParams.width = waveWidth
            waveParams.height = minOf(context.dp(56), innerHeight)
            wave.layoutParams = waveParams
        }
        if (holdHint.visibility == View.VISIBLE) {
            holdHint.maxHeight = innerHeight
            holdHint.layoutParams = holdHint.layoutParams.apply { this.width = minOf(context.dp(168), innerWidth) }
            compactHoldHint = innerWidth < context.dp(120) || innerHeight < context.dp(56)
            showHoldHint(announce = false)
        }
    }

    private fun showHoldHint(announce: Boolean = true) {
        val hint = if (cancelArmed) "Release to cancel\nSlide back to keep recording"
            else "Listening · release to insert\nSlide away to cancel"
        val visible = if (!compactHoldHint) hint else if (cancelArmed) "✕" else "●"
        if (holdHint.text != visible) holdHint.text = visible
        holdHint.contentDescription = hint
        if (announce) holdHint.announceForAccessibility(hint)
    }

    fun clearGesture() {
        removeCallbacks(longPress)
        cancelArmed = false
        tracking = false
        held = false
        moved = false
        logo.isPressed = false
    }

    override fun dispatchTouchEvent(event: MotionEvent): Boolean {
        if (event.actionMasked == MotionEvent.ACTION_DOWN && mode == BubbleMode.IDLE) {
            clearGesture()
            tracking = true
            downX = event.rawX
            downY = event.rawY
            logo.isPressed = true
            postDelayed(longPress, ViewConfiguration.getLongPressTimeout().toLong())
            return true
        }
        if (!tracking) return super.dispatchTouchEvent(event)
        val x = event.rawX.roundToInt()
        val y = event.rawY.roundToInt()
        if (event.actionMasked == MotionEvent.ACTION_MOVE || event.actionMasked == MotionEvent.ACTION_UP) {
            val dx = event.rawX - downX
            val dy = event.rawY - downY
            val distanceSquared = dx * dx + dy * dy
            if (held && mode == BubbleMode.RECORDING) {
                val away = distanceSquared >= cancelDistance * cancelDistance
                if (away != cancelArmed) {
                    cancelArmed = away
                    showHoldHint()
                }
            } else if (!held && (moved || distanceSquared > slop * slop)) {
                moved = true
                removeCallbacks(longPress)
                logo.isPressed = false
                drag(dx.roundToInt(), dy.roundToInt(), x, y)
            }
        }
        if (!tracking) return true // Rotation cancelled a drag during its final move.
        when (event.actionMasked) {
            MotionEvent.ACTION_UP, MotionEvent.ACTION_CANCEL, MotionEvent.ACTION_POINTER_DOWN -> {
                val wasDrag = moved
                val wasHold = held
                val cancelled = event.actionMasked != MotionEvent.ACTION_UP || (wasHold && cancelArmed)
                clearGesture()
                when {
                    wasDrag -> drop(x, y, cancelled)
                    wasHold && mode == BubbleMode.RECORDING -> if (cancelled) {
                        announceForAccessibility("Dictation cancelled")
                        cancel()
                    } else finish()
                    !wasHold && !cancelled -> logo.performClick()
                }
            }
        }
        return true
    }
}

private class Bars(context: Context, private val level: () -> Float) : View(context) {
    private val paint = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = ink }
    private val density = resources.displayMetrics.density
    private val samples = FloatArray(19)
    var mode = BubbleMode.IDLE
        set(value) {
            if (field == value) return
            field = value
            samples.fill(0f)
            invalidate()
        }

    override fun onDraw(canvas: Canvas) {
        val cx = width / 2f
        val cy = height / 2f
        when (mode) {
            BubbleMode.IDLE -> for (i in -2..2) {
                val half = when (abs(i)) {
                    0 -> 11f
                    1 -> 7f
                    else -> 3.5f
                }
                bar(canvas, cx + i * 5f * density, cy, half * density, 1.7f * density)
            }
            BubbleMode.RECORDING -> {
                samples.copyInto(samples, 0, 1)
                samples[samples.lastIndex] = sqrt(level().coerceIn(0f, 1f))
                for (i in samples.indices) {
                    val x = cx + (i - samples.size / 2) * 5.5f * density
                    bar(canvas, x, cy, (2f + samples[i] * 18f) * density, 1.8f * density)
                }
                postInvalidateDelayed(50L)
            }
            BubbleMode.PROCESSING -> {
                val active = ((SystemClock.uptimeMillis() / 240) % 3).toInt()
                for (i in 0..2) {
                    paint.alpha = if (i == active) 255 else 85
                    canvas.drawCircle(cx + (i - 1) * 13f * density, cy, 3f * density, paint)
                }
                paint.alpha = 255
                postInvalidateDelayed(120L)
            }
        }
    }

    private fun bar(canvas: Canvas, x: Float, y: Float, halfHeight: Float, radius: Float) {
        canvas.drawRoundRect(x - radius, y - halfHeight, x + radius, y + halfHeight, radius, radius, paint)
    }
}
