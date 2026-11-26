package com.murmur.android.text

import org.junit.Assert.assertEquals
import org.junit.Test

class TextPipelineTest {
    private data class Fixture(
        val input: String,
        val expected: PipelineResult,
        val options: PipelineOptions = PipelineOptions(pressEnterCommand = false),
        val dictionary: List<ReplacementRule> = emptyList(),
        val snippets: List<ReplacementRule> = emptyList(),
    )

    private fun checkFixtures(vararg fixtures: Fixture) {
        for ((input, expected, options, dictionary, snippets) in fixtures) {
            assertEquals(input, expected, TextPipeline.format(input, dictionary, snippets, options))
        }
    }

    // Inputs and expected outputs shared with tests/unit/textPipeline.test.ts.
    @Test
    fun desktopFormattingFixtures() {
        checkFixtures(
            Fixture(
                "um so i i think we should uh move the meeting to thursday",
                PipelineResult("So I think we should move the meeting to thursday.", wordsCorrected = 3),
            ),
            Fixture(
                "um hello there",
                PipelineResult("um hello there"),
                PipelineOptions(cleanupLevel = CleanupLevel.NONE),
            ),
            Fixture(
                "email jason at my linkedin",
                PipelineResult(
                    "Email Jayson at https://linkedin.com/in/jayson.",
                    dictionaryReplacements = 1,
                    snippetExpansions = 1,
                    usedPhrases = listOf("jason", "my linkedin"),
                ),
                dictionary = listOf(ReplacementRule("jason", "Jayson")),
                snippets = listOf(ReplacementRule("my linkedin", "https://linkedin.com/in/jayson")),
            ),
            Fixture(
                "send it now press enter",
                PipelineResult("Send it now.", pressEnter = true),
                PipelineOptions(pressEnterCommand = true),
            ),
            Fixture("see you soon", PipelineResult("See you soon"), PipelineOptions(tone = StyleTone.CASUAL)),
            Fixture("see you soon", PipelineResult("See you soon!"), PipelineOptions(tone = StyleTone.EXCITED)),
            Fixture(
                "Great work. See you soon",
                PipelineResult("great work. see you soon"),
                PipelineOptions(tone = StyleTone.VERY_CASUAL),
            ),
        )
    }

    @Test
    fun desktopSmartFormattingFixtures() {
        val corrections = listOf(
            "let's meet at 6, no 7 tomorrow" to "let's meet at 7 tomorrow",
            "Buy milk. Call mom scratch that. Walk the dog." to "Buy milk. Walk the dog.",
        )
        for ((input, expected) in corrections) {
            assertEquals(input, expected to 1, TextPipeline.backtrack(input))
        }
        val lists = listOf(
            "I need three things. One, eggs. Two, milk. Three, bread." to "I need three things.\n1. Eggs\n2. Milk\n3. Bread",
            "I have one idea about this" to null,
        )
        for ((input, expected) in lists) {
            assertEquals(input, expected, TextPipeline.numberedList(input))
        }
        assertEquals(
            "Hi Sam,\n\nCan we move our sync to Thursday?\n\nThanks,",
            TextPipeline.emailLayout("Hi Sam, can we move our sync to Thursday? Thanks"),
        )
        val punctuation = listOf(
            "hello comma how are you question mark" to "hello, how are you?",
            "a period of time" to "a period of time",
            "first line new line second line" to "first line\nsecond line",
        )
        for ((input, expected) in punctuation) {
            assertEquals(input, expected, TextPipeline.spokenPunctuation(input))
        }
        assertEquals("I know that that is fine" to 0, TextPipeline.removeDisfluencies("I know that that is fine"))
        assertEquals(
            Triple("see URL", 1, listOf("my linkedin")),
            TextPipeline.replacements("see my, linkedin", listOf(ReplacementRule("my linkedin", "URL"))),
        )
    }

    @Test
    fun cleanupAndCommandGates() {
        val raw = PipelineOptions(cleanupLevel = CleanupLevel.NONE, tone = StyleTone.EXCITED, isEmailContext = true)
        checkFixtures(
            Fixture(
                "  um hello, jay comma jay. press enter  ",
                PipelineResult(
                    "um hello, Sam comma Sam",
                    pressEnter = true,
                    dictionaryReplacements = 2,
                    snippetExpansions = 2,
                    usedPhrases = listOf("jay", "trigger"),
                ),
                raw,
                dictionary = listOf(ReplacementRule("jay", "trigger")),
                snippets = listOf(ReplacementRule("trigger", "Sam")),
            ),
            Fixture(
                "one apples, two pears. at six, no seven scratch that",
                PipelineResult("one apples, two pears. at six, no seven scratch that"),
                raw,
            ),
            Fixture("press enter", PipelineResult("Press enter.")),
            Fixture("um", PipelineResult("", wordsCorrected = 1)),
        )
        // Android's default enables the command, including when there is no text to insert.
        assertEquals(PipelineResult("", pressEnter = true), TextPipeline.format("press enter"))
    }

    @Test
    fun layoutOrderAndFeatureGates() {
        val disabled = PipelineOptions(
            smartFormatting = SmartFormatting(lists = false, backtrack = false, emails = false, spokenPunctuation = false),
            isEmailContext = true,
        )
        val emailInput = "hi Sam, please call me. thanks"
        val inlineEmail = PipelineResult("Hi Sam, please call me. Thanks.")
        checkFixtures(
            Fixture(
                "drop this full stop call mom scratch that. at six no wait make it seven",
                PipelineResult(
                    "At seven.",
                    wordsCorrected = 2,
                    appliedFeatures = listOf(AppliedFeature.BACKTRACK),
                    backtracks = 2,
                ),
            ),
            Fixture(
                "get groceries",
                PipelineResult(
                    "1. Apples\n2. Pears",
                    snippetExpansions = 1,
                    usedPhrases = listOf("get groceries"),
                    appliedFeatures = listOf(AppliedFeature.LIST),
                ),
                snippets = listOf(ReplacementRule("get groceries", "one apples, two pears")),
            ),
            Fixture(
                emailInput,
                PipelineResult("Hi Sam,\n\nPlease call me.\n\nThanks,", appliedFeatures = listOf(AppliedFeature.EMAIL)),
                PipelineOptions(isEmailContext = true),
            ),
            Fixture(emailInput, inlineEmail),
            Fixture(emailInput, inlineEmail, disabled),
            Fixture("one apples, two pears", PipelineResult("One apples, two pears."), disabled),
            Fixture("at six, no seven", PipelineResult("At six, no seven."), disabled),
            Fixture("hello comma goodbye", PipelineResult("Hello comma goodbye."), disabled),
            Fixture("Hi Sam", PipelineResult("Hi Sam."), PipelineOptions(isEmailContext = true)),
            Fixture("NASA called. I agree", PipelineResult("NASA called. I agree"), PipelineOptions(tone = StyleTone.GEN_Z)),
        )
    }

    @Test
    fun punctuationCapitalizationAndUnicodeWords() {
        checkFixtures(
            Fixture("well, um, yes", PipelineResult("Well, yes.", wordsCorrected = 1)),
            Fixture("hello period Next", PipelineResult("Hello. Next.")),
            Fixture("hello PERIOD.", PipelineResult("Hello.")),
            Fixture("hello period\nüber", PipelineResult("Hello.\nÜber.")),
            Fixture("hello. next new line bientôt", PipelineResult("Hello. Next\nBientôt.")),
            Fixture("mode i-mode i: i’ll try", PipelineResult("Mode i-mode i: I’ll try.")),
            Fixture("hello", PipelineResult("Hello")),
            Fixture("你好", PipelineResult("你好")),
            Fixture("你好 世界", PipelineResult("你好 世界.")),
            Fixture("they said “hello”", PipelineResult("They said “hello”")),
            Fixture("they said ‘hello’", PipelineResult("They said ‘hello’")),
        )
        assertEquals(5, TextPipeline.countWords("l’été mother-in-law 中文 １２ 𐐨!"))
        assertEquals(0, TextPipeline.countWords("— 😃"))
    }
}
