import Foundation

/// Local formatting stages run in the same order as `src/shared/textPipeline.ts`.
public struct TextPipeline {
    public enum CleanupLevel { case none, light, medium, high }
    public enum Tone { case formal, casual, excited, veryCasual, genZ }
    public enum Feature: Equatable { case backtrack, list, email }

    public struct SmartFormatting {
        public var lists: Bool
        public var backtrack: Bool
        public var emails: Bool
        public var spokenPunctuation: Bool
        public init(lists: Bool = true, backtrack: Bool = true, emails: Bool = true, spokenPunctuation: Bool = true) {
            self.lists = lists; self.backtrack = backtrack
            self.emails = emails; self.spokenPunctuation = spokenPunctuation
        }
    }

    public struct Options {
        public var cleanupLevel: CleanupLevel
        public var tone: Tone
        public var smartFormatting: SmartFormatting
        public var isEmailContext: Bool
        public var pressEnterCommand: Bool
        public init(cleanupLevel: CleanupLevel = .light, tone: Tone = .formal,
                    smartFormatting: SmartFormatting = .init(), isEmailContext: Bool = false,
                    pressEnterCommand: Bool = true) {
            self.cleanupLevel = cleanupLevel; self.tone = tone; self.smartFormatting = smartFormatting
            self.isEmailContext = isEmailContext; self.pressEnterCommand = pressEnterCommand
        }
    }

    public struct Result {
        public fileprivate(set) var text = ""
        public fileprivate(set) var pressEnter = false
        public fileprivate(set) var wordCount = 0
        public fileprivate(set) var numDictionaryReplacements = 0
        public fileprivate(set) var numSnippetExpansions = 0
        public fileprivate(set) var numWordsCorrected = 0
        public fileprivate(set) var usedPhrases: [String] = []
        public fileprivate(set) var appliedFeatures: [Feature] = []
    }

    // Only application-authored constant patterns use this initializer. User rules
    // are built from escaped literals below and never interpreted as regex syntax.
    private static func re(_ pattern: String) -> NSRegularExpression {
        try! NSRegularExpression(pattern: pattern)
    }
    private static let word = re(#"[\p{L}\p{N}][\p{L}\p{N}'’-]*"#)
    private static let pressEnter = re(#"(?i)[\s,.]*\bpress enter\b[.!]?\s*$"#)
    private static let filler = re(#"(?i)(^|[\s,.;!?])(?:um+|uh+m*|erm+|er|ah+|hmm+|mm+|uh-huh)(?=[\s,.;!?]|$),?"#)
    private static let repetition = re(#"(?i)\b([a-z0-9_]+)(?:\s*,?\s+\1\b)+"#)
    private static let legitimate: Set<String> = ["that", "had", "is", "very", "so", "bye", "no", "yes", "ha", "really", "many"]
    private static let spacing: [(NSRegularExpression, String)] = [
        (re(#"[ \t]+"#), " "), (re(#" +([,.;:!?])"#), "$1"), (re(#"([,;:])(?=[^\s\d])"#), "$1 "),
        (re(#",\s*([.!?])"#), "$1"), (re(#"([.!?])\s*,"#), "$1"), (re(#",(?:\s*,)+"#), ","),
        (re(#"^[\s,;:]+"#), ""), (re(#" *\n *"#), "\n")
    ]
    private static let spoken: [(NSRegularExpression, String)] = [
        (re(#"(?i)\s*\bnew paragraph\b[.,]?\s*"#), "\n\n"), (re(#"(?i)\s*\bnew line\b[.,]?\s*"#), "\n"),
        (re(#"(?i)\s*\bquestion mark\b[.,]?"#), "?"), (re(#"(?i)\s*\bexclamation (?:point|mark)\b[.,]?"#), "!"),
        (re(#"(?i)\s*\bfull stop\b[.,]?"#), "."), (re(#"(?i)\s*\bcomma\b[.,]?"#), ","),
        (re(#"(?i)\s*\bsemicolon\b[.,]?"#), ";"), (re(#"(?i)\s*\bcolon\b[.,]?(?=\s)"#), ":"),
        (re(#"\s*\bperiod\b[.,]?(?=\s*$|\s*\n|\s+[A-Z])"#), "."), (re(#"(?i)\s*\bperiod\b\.?(?=\s*$)"#), ".")
    ]
    private static let cardinals = "one|two|three|four|five|six|seven|eight|nine|ten"
    private static let ordinals = "first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth"
    private static let value = #"(?:[0-9]{1,4}(?::[0-9]{2})?(?:\s?(?:am|pm|a\.m\.|p\.m\.))?|zero|\#(cardinals)|eleven|twelve|monday|tuesday|wednesday|thursday|friday|saturday|sunday|today|tomorrow|tonight)"#
    private static let correction = re(#"(?i)\b(\#(value))[,.]?\s+(?:no|nope|sorry|wait|i mean|actually)[,.]?\s+(?:make (?:it|that)\s+|let's say\s+)?(\#(value))\b"#)
    private static let retraction = re(#"(?i)(^|[.!?\n]\s*)[^.!?\n]*?[,.]?\s*\b(?:scratch that|delete that|never mind that)\b[.,!]?\s*"#)
    private static let marker = re(#"(?i)(?:^|(?<=[.,;:!?\n]))\s*(?:number\s+)?([0-9]{1,2}|\#(cardinals)|\#(ordinals))\b[,.:)]?\s+(?:is\s+)?"#)
    private static let markerValues: [String: Int] = {
        var values: [String: Int] = [:]
        for names in [cardinals, ordinals] {
            for (index, name) in names.split(separator: "|").enumerated() { values[String(name)] = index + 1 }
        }
        return values
    }()
    private static let itemTrim: [(NSRegularExpression, String)] = [
        (re(#"(?i)^(?:and|then)\s+"#), ""), (re(#"(?i)[,;]\s*(?:and|then)?\s*$"#), ""),
        (re(#"(?i)\s+(?:and|then)$"#), ""), (re(#"\.$"#), "")
    ]
    private static let standaloneI = re(#"\bi\b(?=['’\s,.!?]|$)"#)
    private static let sentence = re(#"(^|[.!?]\s+|\n\s*)(\p{Ll})"#)
    private static let casualSentence = re(#"(^|[.!?]\s+|\n)(\p{Lu})(?=\p{Ll})"#)
    private static let lastItem = re(#"\n[0-9]+\.\s[^\n]*$"#)
    private static let greeting = re(#"(?i)^(?:hi|hey|hello|dear|good (?:morning|afternoon|evening)|greetings)\b[^,.!\n]{0,40}[,.!]?\s*"#)
    private static let signoff = re(#"(?i)(?:^|[.!?]\s+)((?:thanks|thank you|best|best regards|kind regards|regards|cheers|sincerely|talk soon)[^.!?\n]{0,30})[,.!]?\s*$"#)

    public static func countWords(_ text: String) -> Int {
        word.numberOfMatches(in: text, range: text.fullRange)
    }

    private static func substitute(_ text: String, _ rules: [(NSRegularExpression, String)]) -> String {
        rules.reduce(text) { $1.0.substitute($0, template: $1.1) }
    }
    private static func tidy(_ text: String) -> String { substitute(text, spacing).trimmed }

    private static func removeDisfluencies(_ input: String, removed: inout Int) -> String {
        let stripped = filler.transform(input) { source, m in
            removed += 1
            return source.substring(with: m.range(at: 1))
        }
        return repetition.transform(stripped) { source, m in
            let word = source.substring(with: m.range(at: 1))
            let match = source.substring(with: m.range)
            guard !legitimate.contains(word.lowercased()) else { return match }
            removed += match.split(whereSeparator: \.isWhitespace).count - 1
            return word
        }
    }

    private static func backtrack(_ text: String, removed: inout Int) -> String {
        let corrected = correction.transform(text) { source, m in
            removed += 1
            return source.substring(with: m.range(at: 2))
        }
        return retraction.transform(corrected) { source, m in
            removed += 1
            return source.substring(with: m.range(at: 1))
        }
    }

    private static func replacements(_ text: String, _ rules: [(String, String)], count: inout Int, used: inout [String]) -> String {
        var output = text
        for (phrase, replacement) in rules.sorted(by: { $0.0.utf16.count > $1.0.utf16.count }) {
            let parts = phrase.split(whereSeparator: \.isWhitespace)
            guard !parts.isEmpty else { continue }
            let literal = parts.map { NSRegularExpression.escapedPattern(for: String($0)) }.joined(separator: #"[\s,]+"#)
            guard let regex = try? NSRegularExpression(pattern: #"(?i)(?<![\p{L}\p{N}])\#(literal)(?![\p{L}\p{N}])[.,]?"#) else { continue }
            let previous = count
            output = regex.transform(output) { source, m in
                count += 1
                if replacement.last != ".", replacement.last != "," {
                    let last = source.character(at: NSMaxRange(m.range) - 1)
                    if last == 46 { return replacement + "." }
                    if last == 44 { return replacement + "," }
                }
                return replacement
            }
            if count != previous && !used.contains(phrase) { used.append(phrase) }
        }
        return output
    }

    private static func listLayout(_ text: String) -> String? {
        let source = text as NSString
        var hits: [NSRange] = []
        // The earliest possible 1, then earliest 2, etc., yields the longest subsequence.
        marker.enumerateMatches(in: text, range: text.fullRange) { m, _, stop in
            guard let m else { return }
            let name = source.substring(with: m.range(at: 1)).lowercased()
            if (Int(name) ?? markerValues[name]) == hits.count + 1 { hits.append(m.range) }
            if hits.count == 20 { stop.pointee = true }
        }
        guard hits.count >= 2 else { return nil }
        var output = source.substring(to: hits[0].location).trimmed
        if let last = output.last {
            if ",;".contains(last) { output.removeLast() }
            if !":.!?".contains(last) { output += ":" }
            output += "\n"
        }
        for (index, range) in hits.enumerated() {
            let end = index + 1 < hits.count ? hits[index + 1].location : source.length
            let start = NSMaxRange(range)
            let item = source.substring(with: NSRange(location: start, length: end - start)).trimmed
            if index > 0 { output += "\n" }
            output += "\(index + 1). " + substitute(item, itemTrim).uppercasingFirst
        }
        return output
    }

    private static func terminal(_ text: String) -> String {
        guard let last = text.last, !".!?:;)\"'”’]".contains(last), lastItem.first(in: text) == nil else { return text }
        guard let first = word.first(in: text) else { return text }
        let start = NSMaxRange(first.range)
        let rest = NSRange(location: start, length: text.utf16.count - start)
        return word.firstMatch(in: text, range: rest) == nil ? text : text + "."
    }

    private static func emailLayout(_ text: String) -> String? {
        guard let opening = greeting.first(in: text) else { return nil }
        let source = text as NSString
        var header = source.substring(with: opening.range).trimmed
        if let last = header.last, ".!".contains(last) { header.removeLast() }
        if header.last != "," { header += "," }
        var body = source.substring(from: NSMaxRange(opening.range)).trimmed
        var closing = ""
        if let match = signoff.first(in: body) {
            let original = body as NSString
            closing = original.substring(with: match.range(at: 1)).trimmed
            if let last = closing.last, ".!".contains(last) { closing.removeLast() }
            body = original.substring(to: match.range(at: 1).location).trimmed
        }
        guard !body.isEmpty else { return nil }
        return header + "\n\n" + terminal(body.uppercasingFirst) + (closing.isEmpty ? "" : "\n\n" + closing + ",")
    }

    private static func applyTone(_ text: String, _ tone: Tone) -> String {
        guard tone != .formal else { return text }
        var out = text
        if out.last == "." {
            out.removeLast()
            if tone == .excited { out += "!" }
        }
        guard tone == .veryCasual || tone == .genZ else { return out }
        return casualSentence.transform(out) { source, m in
            source.substring(with: m.range(at: 1)) + source.substring(with: m.range(at: 2)).lowercased()
        }
    }

    public static func format(_ raw: String, dictionary: [(String, String)] = [], snippets: [(String, String)] = [],
                              options: Options = .init()) -> Result {
        var result = Result()
        var text = raw.trimmed
        guard !text.isEmpty else { return result }
        if options.pressEnterCommand, let m = pressEnter.first(in: text) {
            result.pressEnter = true
            text = (text as NSString).substring(to: m.range.location)
        }
        let smart = options.smartFormatting
        let clean = options.cleanupLevel != .none
        if clean {
            text = tidy(removeDisfluencies(text, removed: &result.numWordsCorrected))
            if smart.backtrack {
                let before = result.numWordsCorrected
                text = tidy(backtrack(text, removed: &result.numWordsCorrected))
                if result.numWordsCorrected > before { result.appliedFeatures.append(.backtrack) }
            }
            if smart.spokenPunctuation { text = tidy(substitute(text, spoken)) }
        }
        var used: [String] = []
        text = replacements(text, dictionary, count: &result.numDictionaryReplacements, used: &used)
        result.usedPhrases = used
        used.removeAll(keepingCapacity: true)
        text = replacements(text, snippets, count: &result.numSnippetExpansions, used: &used)
        result.usedPhrases += used
        if clean {
            if smart.lists, let list = listLayout(text) { text = list; result.appliedFeatures.append(.list) }
            text = sentence.transform(standaloneI.substitute(text, template: "I")) { source, m in
                source.substring(with: m.range(at: 1)) + source.substring(with: m.range(at: 2)).uppercased()
            }
            if smart.emails && options.isEmailContext, let email = emailLayout(text) {
                text = email; result.appliedFeatures.append(.email)
            } else {
                text = terminal(text.trimmingTrailingWhitespace)
            }
            text = applyTone(text, options.tone)
        }
        result.text = text
        result.wordCount = countWords(text)
        return result
    }
}

private extension String {
    var fullRange: NSRange { NSRange(location: 0, length: utf16.count) }
    var trimmed: String { trimmingCharacters(in: .whitespacesAndNewlines) }
    var trimmingTrailingWhitespace: String {
        guard last?.isWhitespace == true else { return self }
        guard let end = lastIndex(where: { !$0.isWhitespace }) else { return "" }
        return String(self[...end])
    }
    var uppercasingFirst: String { prefix(1).uppercased() + dropFirst() }
}

private extension NSRegularExpression {
    func first(in text: String) -> NSTextCheckingResult? { firstMatch(in: text, range: text.fullRange) }
    func substitute(_ text: String, template: String) -> String {
        stringByReplacingMatches(in: text, range: text.fullRange, withTemplate: template)
    }
    /// Build in match order; replacement strings are literal, even `$1` and backslashes.
    func transform(_ text: String, body: (NSString, NSTextCheckingResult) -> String) -> String {
        let source = text as NSString
        var offset = 0
        var output = ""
        withoutActuallyEscaping(body) { replace in
            enumerateMatches(in: text, range: text.fullRange) { match, _, _ in
                guard let match else { return }
                output += source.substring(with: NSRange(location: offset, length: match.range.location - offset))
                output += replace(source, match)
                offset = NSMaxRange(match.range)
            }
        }
        guard offset != 0 else { return text }
        output += source.substring(from: offset)
        return output
    }
}
