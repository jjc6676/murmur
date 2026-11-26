package com.murmur.android.bubble

internal object TextInsertion {
    data class Edit(val text: String, val cursor: Int, val inserted: String)

    fun insert(current: String, selectionStart: Int, selectionEnd: Int, newText: String): Edit {
        // Some accessibility providers do not expose a selection (-1). Append in that case.
        val missing = selectionStart < 0 || selectionEnd < 0
        val left = if (missing) current.length else minOf(selectionStart, selectionEnd).coerceAtMost(current.length)
        val right = if (missing) current.length else maxOf(selectionStart, selectionEnd).coerceAtMost(current.length)
        // Move a split caret past the character; expand a nonempty selection to whole characters.
        val end = if (current.splitsPair(right)) right + 1 else right
        val start = when {
            left == right -> end
            current.splitsPair(left) -> left - 1
            else -> left
        }

        val previous = current.getOrNull(start - 1)
        val trimLeading = previous == null || previous.isWhitespace() || previous in "([{“‘"
        val words = if (trimLeading && newText.startsWith(' ')) newText.trimStart(' ') else newText
        val prepend = start > 0 && words.isNotEmpty() &&
            isWord(current.codePointBefore(start)) && isWord(words.codePointAt(0))
        val appendSpace = end < current.length && words.isNotEmpty() &&
            isWord(words.codePointBefore(words.length)) && isWord(current.codePointAt(end))
        val inserted = if (!prepend && !appendSpace) words else buildString(words.length + 2) {
            if (prepend) append(' ')
            append(words)
            if (appendSpace) append(' ')
        }
        // Keep an automatic separator with the existing suffix: "hello bright| world".
        val cursor = start + inserted.length - (if (appendSpace) 1 else 0)
        return Edit(current.replaceRange(start, end, inserted), cursor, inserted)
    }

    private fun String.splitsPair(offset: Int) = offset > 0 && offset < length &&
        Character.isSurrogatePair(this[offset - 1], this[offset])

    private fun isWord(codePoint: Int): Boolean = Character.isLetterOrDigit(codePoint) ||
        when (Character.getType(codePoint)) {
            Character.NON_SPACING_MARK.toInt(), Character.COMBINING_SPACING_MARK.toInt(),
            Character.ENCLOSING_MARK.toInt(), Character.CONNECTOR_PUNCTUATION.toInt() -> true
            else -> false
        }
}
