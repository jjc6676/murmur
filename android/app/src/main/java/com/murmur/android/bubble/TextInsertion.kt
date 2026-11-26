package com.murmur.android.bubble

internal object TextInsertion {
    data class Edit(val text: String, val cursor: Int, val inserted: String)

    fun insert(current: String, selectionStart: Int, selectionEnd: Int, newText: String): Edit {
        // Some accessibility providers do not expose a selection (-1). Append in that case.
        val start = if (selectionStart < 0 || selectionEnd < 0) current.length
        else minOf(selectionStart, selectionEnd).coerceAtMost(current.length)
        val end = maxOf(start, selectionStart, selectionEnd).coerceAtMost(current.length)
        val previous = current.getOrNull(start - 1)
        val followsBoundary = previous == null || previous.isWhitespace() || previous in "([{“‘"
        val first = newText.firstOrNull()
        val inserted = when {
            followsBoundary && first == ' ' -> newText.trimStart(' ')
            !followsBoundary && first != null && !first.isWhitespace() && first !in ".,!?;:)]}’”" -> " $newText"
            else -> newText
        }
        return Edit(current.replaceRange(start, end, inserted), start + inserted.length, inserted)
    }
}
