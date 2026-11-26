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
    private var imeTop: Int? = null
    private var dragging = false
    private var dragX = 0
    private var dragY = 0
    private var originX = 0
    private var originY = 0
    private val controls = BubbleView(context, start, finish, cancel, level, ::drag, ::drop)
    private val notice = label()
    private val target = label().apply {
        text = "✕  Hide for 1 hour"
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

    @Suppress("DEPRECATION")
    fun show(keyboardTop: Int?) {
        imeTop = keyboardTop
        if (Build.VERSION.SDK_INT >= 30) {
            val metrics = wm.currentWindowMetrics
            val display = metrics.bounds
            val insets = metrics.windowInsets.getInsetsIgnoringVisibility(
                WindowInsets.Type.systemBars() or WindowInsets.Type.displayCutout(),
            )
            bounds.set(display.left + insets.left, display.top + insets.top,
                display.right - insets.right, display.bottom - insets.bottom)
        } else {
            val size = Point()
            wm.defaultDisplay.getRealSize(size)
            val insets = controls.rootWindowInsets
            bounds.set(insets?.stableInsetLeft ?: 0, insets?.stableInsetTop ?: context.dp(24),
                size.x - (insets?.stableInsetRight ?: 0), size.y - (insets?.stableInsetBottom ?: context.dp(48)))
        }
        position()
    }

    fun hide() {
        controls.clearGesture()
        dragging = false
        notice.removeCallbacks(clearNotice)
        remove(notice)
        remove(target)
        remove(controls)
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
        notice.maxWidth = bounds.width().coerceAtLeast(1)
        notice.setOnClickListener(if (action == null) null else View.OnClickListener { action() })
        notice.isClickable = action != null
        if (action == null) noticeParams.flags = noticeParams.flags or WindowManager.LayoutParams.FLAG_NOT_TOUCHABLE
        else noticeParams.flags = noticeParams.flags and WindowManager.LayoutParams.FLAG_NOT_TOUCHABLE.inv()
        // A changed touchability flag must be sent even if the notice hasn't moved.
        if (notice.parent != null) wm.updateViewLayout(notice, noticeParams)
        placeNotice()
        notice.postDelayed(clearNotice, if (action == null) 3200L else 6500L)
    }

    private fun measure(view: View) {
        val free = View.MeasureSpec.makeMeasureSpec(0, View.MeasureSpec.UNSPECIFIED)
        view.measure(free, free)
    }

    private fun position() {
        measure(controls)
        val w = controls.measuredWidth
        val h = controls.measuredHeight
        val gap = context.dp(8)
        val idleSize = context.dp(56)
        val floor = imeTop?.takeIf { it > bounds.top + idleSize }?.coerceAtMost(bounds.bottom) ?: bounds.bottom
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
    }

    private fun placeNotice() {
        measure(notice)
        val x = (controlParams.x + controls.measuredWidth - notice.measuredWidth)
            .coerceIn(bounds.left, maxOf(bounds.left, bounds.right - notice.measuredWidth))
        val above = controlParams.y - notice.measuredHeight - context.dp(4)
        place(notice, noticeParams, x, if (above >= bounds.top) above else controlParams.y + controls.measuredHeight)
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

    private fun drag(dx: Int, dy: Int, rawX: Int, rawY: Int) {
        if (!dragging) {
            dragging = true
            originX = controlParams.x
            originY = controlParams.y
            remove(notice)
            measure(target)
            val left = bounds.centerX() - target.measuredWidth / 2
            val top = bounds.bottom - target.measuredHeight - context.dp(16)
            place(target, targetParams, left, top)
            hit.set(left, top, left + target.measuredWidth, top + target.measuredHeight)
            hit.inset(-context.dp(8), -context.dp(8))
        }
        dragX = originX + dx
        dragY = originY + dy
        target.setTextColor(if (hit.contains(rawX, rawY)) lavender else cream)
        target.scaleX = if (hit.contains(rawX, rawY)) 1.1f else 1f
        target.scaleY = target.scaleX
        position()
    }

    private fun drop(x: Int, y: Int, cancelled: Boolean) {
        if (!dragging) return
        dragging = false
        remove(target)
        if (!cancelled && hit.contains(x, y)) {
            settings.edit().putLong("bubble_snoozed_until", System.currentTimeMillis() + 3_600_000L).apply()
            hide()
        } else {
            if (!cancelled) settings.edit().putInt("bubble_x", controlParams.x).putInt("bubble_y", controlParams.y).apply()
            position()
        }
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
) : LinearLayout(context) {
    private val slop = ViewConfiguration.get(context).scaledTouchSlop
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
    private var mode = BubbleMode.IDLE

    init {
        gravity = Gravity.CENTER
        clipToPadding = false
        val pad = context.dp(4)
        setPadding(pad, pad, pad, pad)
        decorate(logo, lavender, 14, "Start dictation", start)
        decorate(wave, lavender, 28, "Finish dictation", finish)
        addView(logo, context.dp(48), context.dp(48))
        addView(cross, context.dp(48), context.dp(48))
        addView(wave, LayoutParams(context.dp(140), context.dp(56)).apply {
            leftMargin = context.dp(6)
            rightMargin = leftMargin
        })
        addView(check, context.dp(48), context.dp(48))
        render(BubbleMode.IDLE)
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
        mode = next
        val idle = next == BubbleMode.IDLE
        logo.visibility = if (idle) View.VISIBLE else View.GONE
        cross.visibility = if (idle) View.GONE else View.VISIBLE
        wave.visibility = cross.visibility
        check.visibility = if (next == BubbleMode.RECORDING) View.VISIBLE else View.GONE
        wave.mode = next
        wave.isClickable = next == BubbleMode.RECORDING
        wave.contentDescription = if (next == BubbleMode.PROCESSING) "Transcribing…" else "Listening. Tap to finish dictation"
    }

    fun clearGesture() {
        removeCallbacks(longPress)
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
            postDelayed(longPress, 300L)
            return true
        }
        if (!tracking) return super.dispatchTouchEvent(event)
        val x = event.rawX.roundToInt()
        val y = event.rawY.roundToInt()
        when (event.actionMasked) {
            MotionEvent.ACTION_MOVE -> if (!held) {
                val dx = event.rawX - downX
                val dy = event.rawY - downY
                if (moved || dx * dx + dy * dy > slop * slop) {
                    moved = true
                    removeCallbacks(longPress)
                    logo.isPressed = false
                    drag(dx.roundToInt(), dy.roundToInt(), x, y)
                }
            }
            MotionEvent.ACTION_UP, MotionEvent.ACTION_CANCEL, MotionEvent.ACTION_POINTER_DOWN -> {
                val wasDrag = moved
                val wasHold = held
                val cancelled = event.actionMasked != MotionEvent.ACTION_UP
                clearGesture()
                when {
                    wasDrag -> drop(x, y, cancelled)
                    wasHold && mode == BubbleMode.RECORDING -> if (cancelled) cancel() else finish()
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
