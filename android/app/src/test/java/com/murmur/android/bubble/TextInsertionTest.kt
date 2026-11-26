package com.murmur.android.bubble

import org.junit.Assert.assertEquals
import org.junit.Test

class TextInsertionTest {
    private fun checkEdit(before: String, start: Int, end: Int, words: String, after: String, cursor: Int) {
        val result = TextInsertion.insert(before, start, end, words)
        assertEquals(after, result.text)
        assertEquals(cursor, result.cursor)
    }

    @Test fun insertsBeforeSuffixAndAdvancesCursorPastLeadingSpace() {
        checkEdit("one three", 3, 3, "two", "one two three", 7)
    }

    @Test fun replacesForwardAndBackwardSelections() {
        checkEdit("one six three", 4, 7, "two", "one two three", 7)
        checkEdit("one six three", 7, 4, "two", "one two three", 7)
    }

    @Test fun respectsWhitespaceAndOpeningBrackets() {
        for (prefix in listOf("one ", "one\n", "(", "[", "{")) {
            checkEdit(prefix, prefix.length, prefix.length, "two", "${prefix}two", prefix.length + 3)
            checkEdit(prefix, prefix.length, prefix.length, " two", "${prefix}two", prefix.length + 3)
        }
        checkEdit("one", 3, 3, " two", "one two", 7)
    }

    @Test fun insertsAtStartWithoutLeadingSpace() {
        checkEdit(" tail", 0, 0, "head", "head tail", 4)
        checkEdit("", 0, 0, "hi", "hi", 2)
    }

    @Test fun punctuationAttachesAndMissingSelectionAppends() {
        checkEdit("hello", 5, 5, "!", "hello!", 6)
        checkEdit("hello", -1, -1, "again", "hello again", 11)
    }
}
