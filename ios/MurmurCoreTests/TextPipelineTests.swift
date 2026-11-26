import XCTest
import MurmurCore

final class TextPipelineTests: XCTestCase {
    func testFillersRepetitionAndCapitalization() {
        let result = TextPipeline.format("um so i i think we should uh move the meeting to thursday")
        XCTAssertEqual(result.text, "So I think we should move the meeting to thursday.")
        XCTAssertEqual(result.numWordsCorrected, 3)
        XCTAssertEqual(result.wordCount, 10)
        XCTAssertEqual(TextPipeline.format("I know that that is fine").text, "I know that that is fine.")
    }

    func testNoCleanupStillExpandsLiteralRules() {
        let options = TextPipeline.Options(cleanupLevel: .none)
        XCTAssertEqual(TextPipeline.format("um hello there", options: options).text, "um hello there")
        let result = TextPipeline.format("my, linkedin, PRESS ENTER!", snippets: [("my linkedin", "$1\\profile")], options: options)
        XCTAssertTrue(result.pressEnter)
        XCTAssertEqual(result.text, "$1\\profile")
    }

    func testDictionaryBeforeSnippetsAndCaseInsensitiveMatches() {
        let result = TextPipeline.format("email jason at my linkedin", dictionary: [("Jason", "Jayson")],
                                         snippets: [("my linkedin", "https://linkedin.com/in/jayson")])
        XCTAssertEqual(result.text, "Email Jayson at https://linkedin.com/in/jayson.")
        XCTAssertEqual(result.numDictionaryReplacements, 1)
        XCTAssertEqual(result.numSnippetExpansions, 1)
        XCTAssertEqual(result.usedPhrases, ["Jason", "my linkedin"])
        XCTAssertEqual(TextPipeline.format("see my, linkedin", snippets: [("my linkedin", "URL")]).text, "See URL.")
        XCTAssertEqual(TextPipeline.format("my linked in", dictionary: [("linked in", "linkedin")], snippets: [("my linkedin", "URL")]).text, "URL")
    }

    func testRulesPreferLongPhrasesWithLiteralPunctuationAndUnicodeBoundaries() {
        let result = TextPipeline.format("élan élanx. A+B, my long name. my name", dictionary: [
            ("name", "X"), ("my long name", "Y"), ("a+b", "C++"), ("élan", "E")
        ])
        XCTAssertEqual(result.text, "E élanx. C++, Y. My X.")
        XCTAssertEqual(result.numDictionaryReplacements, 4)
        XCTAssertEqual(TextPipeline.countWords("🌱 l’été — 你好 co-op 900"), 4)
    }

    func testPressEnterOnlyAtEndAndCanBeDisabled() {
        let result = TextPipeline.format("send it now press enter")
        XCTAssertTrue(result.pressEnter)
        XCTAssertEqual(result.text, "Send it now.")
        let alone = TextPipeline.format("Press enter.")
        XCTAssertTrue(alone.pressEnter)
        XCTAssertEqual(alone.wordCount, 0)
        XCTAssertEqual(alone.text, "")
        XCTAssertFalse(TextPipeline.format("press enter now").pressEnter)
        XCTAssertEqual(TextPipeline.format("press enter", options: .init(pressEnterCommand: false)).text, "Press enter.")
    }

    func testWritingTones() {
        XCTAssertEqual(TextPipeline.format("see you soon", options: .init(tone: .casual)).text, "See you soon")
        XCTAssertEqual(TextPipeline.format("see you soon", options: .init(tone: .excited)).text, "See you soon!")
        XCTAssertEqual(TextPipeline.format("Great work. See you soon", options: .init(tone: .veryCasual)).text, "great work. see you soon")
        XCTAssertEqual(TextPipeline.format("NASA called. I know", options: .init(tone: .genZ)).text, "NASA called. I know")
    }

    func testBacktracksCorrectionsAndRetractsSentences() {
        let result = TextPipeline.format("let's meet at 6, no 7 tomorrow")
        XCTAssertEqual(result.text, "Let's meet at 7 tomorrow.")
        XCTAssertEqual(result.numWordsCorrected, 1)
        XCTAssertEqual(result.appliedFeatures, [.backtrack])
        XCTAssertEqual(TextPipeline.format("Buy milk. Call mom scratch that. Walk the dog.").text, "Buy milk. Walk the dog.")
        XCTAssertEqual(TextPipeline.format("Meet on Thursday actually make it Friday").text, "Meet on Friday.")
        XCTAssertEqual(TextPipeline.format("at 6, no 7", options: .init(smartFormatting: .init(backtrack: false))).text, "At 6, no 7.")
    }

    func testListLayoutRequiresConsecutiveClauseMarkers() {
        let result = TextPipeline.format("I need three things. One, eggs. Two, milk. Three, bread.")
        XCTAssertEqual(result.text, "I need three things.\n1. Eggs\n2. Milk\n3. Bread")
        XCTAssertEqual(result.appliedFeatures, [.list])
        XCTAssertEqual(TextPipeline.format("first is tea, second is coffee").text, "1. Tea\n2. Coffee")
        XCTAssertEqual(TextPipeline.format("I have one idea about this").appliedFeatures, [])
        XCTAssertEqual(TextPipeline.format("One, milk. Three, eggs.").appliedFeatures, [])
        XCTAssertEqual(TextPipeline.format("One, milk. Two, eggs.", options: .init(smartFormatting: .init(lists: false))).text, "One, milk. Two, eggs.")
    }

    func testEmailGreetingBodyAndSignoff() {
        let input = "Hi Sam, can we move our sync to Thursday? Thanks"
        let result = TextPipeline.format(input, options: .init(isEmailContext: true))
        XCTAssertEqual(result.text, "Hi Sam,\n\nCan we move our sync to Thursday?\n\nThanks,")
        XCTAssertEqual(result.appliedFeatures, [.email])
        XCTAssertFalse(TextPipeline.format(input).appliedFeatures.contains(.email))
        XCTAssertEqual(TextPipeline.format("Hi Sam", options: .init(isEmailContext: true)).text, "Hi Sam.")
    }

    func testSpokenPunctuationAndNewlines() {
        XCTAssertEqual(TextPipeline.format("hello comma how are you question mark").text, "Hello, how are you?")
        XCTAssertEqual(TextPipeline.format("a period of time").text, "A period of time.")
        XCTAssertEqual(TextPipeline.format("first line new line second line").text, "First line\nSecond line.")
        XCTAssertEqual(TextPipeline.format("hello new paragraph how are you exclamation point").text, "Hello\n\nHow are you!")
        XCTAssertEqual(TextPipeline.format("hello comma", options: .init(smartFormatting: .init(spokenPunctuation: false))).text, "Hello comma.")
    }
}
