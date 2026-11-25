package com.murmur.android.text

import org.junit.Assert.*
import org.junit.Test

class TextPipelineTest {
    @Test fun removesFillersRepeatsAndFormats() {
        val result = TextPipeline.format("um so i i think we should uh move the meeting to thursday")
        assertEquals("So I think we should move the meeting to thursday.", result.text)
        assertEquals(3, result.wordsCorrected)
    }
    @Test fun appliesDictionaryAndSnippets() {
        val result = TextPipeline.format("email jason at my linkedin", listOf(ReplacementRule("jason", "Jayson")), listOf(ReplacementRule("my linkedin", "https://linkedin.com/in/jayson")))
        assertEquals("Email Jayson at https://linkedin.com/in/jayson.", result.text)
        assertEquals(1, result.dictionaryReplacements); assertEquals(1, result.snippetExpansions)
    }
    @Test fun detectsEnterCommand() { val r = TextPipeline.format("send it now press enter"); assertTrue(r.pressEnter); assertEquals("Send it now.", r.text) }
    @Test fun spokenPunctuation() {
        assertEquals("hello, how are you?", TextPipeline.spokenPunctuation("hello comma how are you question mark"))
        assertEquals("a period of time", TextPipeline.spokenPunctuation("a period of time"))
        assertEquals("first line\nsecond line", TextPipeline.spokenPunctuation("first line new line second line"))
    }
    @Test fun keepsLegitimateDouble() { assertEquals("I know that that is fine", TextPipeline.removeDisfluencies("I know that that is fine").first) }
    @Test fun replacementsCrossCommas() { assertEquals("see URL", TextPipeline.replacements("see my, linkedin", listOf(ReplacementRule("my linkedin", "URL"))).first) }
}
