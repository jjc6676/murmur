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

    @Test fun separatesWordsAtEitherReplacementBoundary() {
        checkEdit("hello world", 6, 6, "bright", "hello bright world", 12)
        val edit = TextInsertion.insert("left/right", 5, 4, "and")
        assertEquals("left and right", edit.text)
        assertEquals(" and ", edit.inserted)
        assertEquals(8, edit.cursor)
        checkEdit("(ok)", 1, 3, "yes", "(yes)", 4)
        checkEdit("left,right", 4, 5, "", "leftright", 4)
    }

    @Test fun continuesDictationBeforeTheSuffixSeparator() {
        val first = TextInsertion.insert("hello world", 6, 6, "bright")
        checkEdit(first.text, first.cursor, first.cursor, "blue", "hello bright blue world", 17)
        checkEdit(first.text, first.cursor, first.cursor, "!", "hello bright! world", 13)
        // Whitespace explicitly supplied by the caller remains part of the inserted text.
        checkEdit("hello world", 6, 6, "bright ", "hello bright world", 13)
    }

    @Test fun wordBoundariesUseCodePointsIncludingCombiningMarks() {
        val letter = "\uD801\uDC00" // Deseret capital letter, two UTF-16 units.
        checkEdit("${letter}e\u0301", 2, 2, letter, "$letter $letter e\u0301", 5)
        checkEdit("e\u0301", 2, 2, "oui", "e\u0301 oui", 6)
    }

    @Test fun caretInsideSurrogatePairMovesAfterItWithoutDeletingIt() {
        val face = "\uD83D\uDE00"
        checkEdit("a${face}z", 2, 2, "x", "a${face}x z", 4)
    }

    @Test fun selectionExpandsSplitSurrogatePairsInEitherDirection() {
        val face = "\uD83D\uDE00"
        val before = "a${face}b${face}c"
        checkEdit(before, 2, 5, "new", "a new c", 5)
        checkEdit(before, 5, 2, "new", "a new c", 5)
    }
}
