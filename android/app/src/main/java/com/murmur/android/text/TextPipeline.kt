package com.murmur.android.text

data class ReplacementRule(val phrase: String, val replacement: String)

enum class CleanupLevel { NONE, LIGHT, MEDIUM, HIGH }
enum class StyleTone { FORMAL, CASUAL, EXCITED, VERY_CASUAL, GEN_Z }
enum class AppliedFeature { BACKTRACK, LIST, EMAIL }

data class SmartFormatting(
    val lists: Boolean = true,
    val backtrack: Boolean = true,
    val emails: Boolean = true,
    val spokenPunctuation: Boolean = true,
)

data class PipelineOptions(
    val cleanupLevel: CleanupLevel = CleanupLevel.LIGHT,
    val tone: StyleTone = StyleTone.FORMAL,
    val smartFormatting: SmartFormatting = SmartFormatting(),
    val isEmailContext: Boolean = false,
    val pressEnterCommand: Boolean = true,
)

data class PipelineResult(
    val text: String,
    val pressEnter: Boolean = false,
    val dictionaryReplacements: Int = 0,
    val snippetExpansions: Int = 0,
    val wordsCorrected: Int = 0,
    val usedPhrases: List<String> = emptyList(),
    val appliedFeatures: List<AppliedFeature> = emptyList(),
    val backtracks: Int = 0,
)

object TextPipeline {
    private val defaults = PipelineOptions()
    private val pressEnter = insensitive("""[\s,.]*\bpress enter\b[.!]?\s*$""")
    private val whitespace = Regex("""\s+""")
    private val words = Regex("""[\p{L}\p{N}][\p{L}\p{N}'’-]*""")
    private val fillers = insensitive("""(^|[\s,.;!?])(?:um+|uh+m*|erm+|er|ah+|hmm+|mm+|uh-huh)(?=[\s,.;!?]|$),?""")
    private val repeat = insensitive("""\b(\w+)(\s*,?\s+\1\b)+""")
    private val legitimate = setOf("that", "had", "is", "very", "so", "bye", "no", "yes", "ha", "really", "many")

    private fun insensitive(pattern: String) = Regex(pattern, RegexOption.IGNORE_CASE)

    fun countWords(text: String): Int = words.findAll(text).count()

    fun removeDisfluencies(input: String): Pair<String, Int> {
        var removed = 0
        val withoutFillers = fillers.replace(input) {
            removed++
            it.groupValues[1]
        }
        val cleaned = repeat.replace(withoutFillers) {
            val word = it.groupValues[1]
            if (word.lowercase() in legitimate) {
                it.value
            } else {
                removed += whitespace.findAll(it.value).count()
                word
            }
        }
        return tidy(cleaned) to removed
    }

    private val spacing = listOf(
        Regex("""[ \t]+""") to " ",
        Regex(""" +([,.;:!?])""") to "$1",
        Regex("""([,;:])(?=[^\s\d])""") to "$1 ",
        Regex(""",\s*([.!?])""") to "$1",
        Regex("""([.!?])\s*,""") to "$1",
        Regex(""",(\s*,)+""") to ",",
        Regex("""^[\s,;:]+""") to "",
        Regex(""" *\n *""") to "\n",
    )

    fun tidy(text: String): String = spacing.fold(text) { acc, (pattern, replacement) ->
        pattern.replace(acc, replacement)
    }.trim()

    private val punctuation = listOf(
        insensitive("""\s*\bnew paragraph\b[.,]?\s*""") to "\n\n",
        insensitive("""\s*\bnew line\b[.,]?\s*""") to "\n",
        insensitive("""\s*\bquestion mark\b[.,]?""") to "?",
        insensitive("""\s*\bexclamation (?:point|mark)\b[.,]?""") to "!",
        insensitive("""\s*\bfull stop\b[.,]?""") to ".",
        insensitive("""\s*\bcomma\b[.,]?""") to ",",
        insensitive("""\s*\bsemicolon\b[.,]?""") to ";",
        insensitive("""\s*\bcolon\b[.,]?(?=\s)""") to ":",
        // In the middle of a line only lowercase "period" before a capital is a command.
        Regex("""\s*\bperiod\b[.,]?(?=\s*$|\s*\n|\s+[A-Z])""") to ".",
        insensitive("""\s*\bperiod\b\.?(?=\s*$)""") to ".",
    )

    fun spokenPunctuation(input: String): String = punctuation.fold(input) { acc, (pattern, replacement) ->
        pattern.replace(acc, replacement)
    }

    private const val CARDINALS = "one|two|three|four|five|six|seven|eight|nine|ten"
    private const val ORDINALS = "first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth"
    private const val VALUE = """(?:\d{1,4}(?::\d{2})?(?:\s?(?:am|pm|a\.m\.|p\.m\.))?""" +
        "|zero|$CARDINALS|eleven|twelve|monday|tuesday|wednesday|thursday|friday|saturday|sunday|today|tomorrow|tonight)"
    private val correction = insensitive(
        """\b($VALUE)[,.]?\s+(?:no(?:[,.]?\s+wait)?|nope|sorry|wait|i mean|actually)[,.]?\s+""" +
            """(?:make (?:it|that)\s+|let's say\s+)?($VALUE)\b""",
    )
    private val retraction = insensitive(
        """(^|[.!?\n]\s*)[^.!?\n]*?[,.]?\s*\b(?:scratch that|delete that|never mind that)\b[.,!]?\s*""",
    )

    internal fun backtrack(text: String): Pair<String, Int> {
        var count = 0
        val corrected = correction.replace(text) {
            count++
            it.groupValues[2]
        }
        val retained = retraction.replace(corrected) {
            count++
            it.groupValues[1]
        }
        return tidy(retained) to count
    }

    fun replacements(input: String, rules: List<ReplacementRule>): Triple<String, Int, List<String>> {
        if (rules.isEmpty()) return Triple(input, 0, emptyList())
        var text = input
        var count = 0
        val used = mutableListOf<String>()
        for (rule in rules.sortedByDescending { it.phrase.length }) {
            if (rule.phrase.isBlank()) continue
            val body = rule.phrase.trim().split(whitespace).joinToString("""[\s,]+""") { Regex.escape(it) }
            val pattern = insensitive("""(?<![\p{L}\p{N}])$body(?![\p{L}\p{N}])[.,]?""")
            val preserveTrailing = !rule.replacement.endsWith('.') && !rule.replacement.endsWith(',')
            val before = count
            text = pattern.replace(text) { match ->
                count++
                val last = match.value.last()
                if (preserveTrailing && last in ".,") rule.replacement + last else rule.replacement
            }
            if (count != before && rule.phrase !in used) used += rule.phrase
        }
        return Triple(text, count, used)
    }

    private val markerNumbers = buildMap {
        for (names in listOf(CARDINALS, ORDINALS)) {
            names.split('|').forEachIndexed { index, name -> put(name, index + 1) }
        }
    }
    private val marker = insensitive(
        """(?:^|(?<=[.,;:!?\n]))\s*(?:number\s+)?(\d{1,2}|$CARDINALS|$ORDINALS)\b[,.:)]?\s+(?:is\s+)?""",
    )
    private val leadingConjunction = insensitive("""^(?:and|then)\s+""")
    private val trailingComma = insensitive("""[,;]\s*(?:and|then)?\s*$""")
    private val trailingConjunction = insensitive("""\s+(?:and|then)$""")

    /** Null means no consecutive spoken enumeration was found. */
    internal fun numberedList(text: String): String? {
        val items = mutableListOf<IntRange>()
        // Taking the earliest 1, then the earliest 2, etc. gives the longest run.
        for (match in marker.findAll(text)) {
            val name = match.groupValues[1]
            val number = name.toIntOrNull() ?: markerNumbers[name.lowercase()]
            if (number == items.size + 1) items += match.range
            if (items.size == 20) break
        }
        if (items.size < 2) return null
        return buildString {
            val intro = text.substring(0, items.first().first).trim()
            if (intro.isNotEmpty()) {
                append(if (intro.last() in ",;") intro.dropLast(1) else intro)
                if (intro.last() !in ":.!?") append(':')
                append('\n')
            }
            items.forEachIndexed { index, range ->
                val end = items.getOrNull(index + 1)?.first ?: text.length
                val item = text.substring(range.last + 1, end).trim()
                    .replaceFirst(leadingConjunction, "")
                    .replaceFirst(trailingComma, "")
                    .replaceFirst(trailingConjunction, "")
                    .removeSuffix(".")
                if (index > 0) append('\n')
                append(index + 1)
                append(". ")
                append(item.replaceFirstChar { it.uppercase() })
            }
        }
    }

    private val standaloneI = Regex("""\bi\b(?=['’\s,.!?]|$)""")
    private val sentenceStart = Regex("""(^|[.!?]\s+|\n\s*)(\p{Ll})""")
    private val toneStart = Regex("""(^|[.!?]\s+|\n)(\p{Lu})(?=\p{Ll})""")
    private val lastListItem = Regex("""\n\d+\.\s[^\n]*$""")

    private fun capitalize(text: String): String = sentenceStart.replace(text.replace(standaloneI, "I")) {
        it.groupValues[1] + it.groupValues[2].uppercase()
    }

    private fun ensureTerminal(text: String): String {
        val trimmed = text.trimEnd()
        if (trimmed.isEmpty() || trimmed.last() in ".!?:;)\"'”’]") return trimmed
        if (lastListItem.containsMatchIn(trimmed) || words.find(trimmed)?.next() == null) return trimmed
        return "$trimmed."
    }

    private val greeting = insensitive("""^(hi|hey|hello|dear|good (?:morning|afternoon|evening)|greetings)\b[^,.!\n]{0,40}[,.!]?\s*""")
    private val signoff = insensitive(
        """(?:^|[.!?]\s+)((?:thanks|thank you|best|best regards|kind regards|regards|cheers|sincerely|talk soon)[^.!?\n]{0,30})[,.!]?\s*$""",
    )

    /** Null means the input has no separable greeting and message body. */
    internal fun emailLayout(text: String): String? {
        val opening = greeting.find(text) ?: return null
        val greetingLine = opening.value.trim().trimEndOnce('.', '!').removeSuffix(",") + ","
        var body = text.substring(opening.range.last + 1).trim()
        val closing = signoff.find(body)?.groups?.get(1)
        if (closing != null) body = body.substring(0, closing.range.first).trim()
        if (body.isEmpty()) return null
        return buildString {
            append(greetingLine)
            append("\n\n")
            append(ensureTerminal(body.replaceFirstChar { it.uppercase() }))
            if (closing != null) {
                append("\n\n")
                append(closing.value.trim().trimEndOnce('.', '!'))
                append(',')
            }
        }
    }

    private fun String.trimEndOnce(a: Char, b: Char): String =
        if (endsWith(a) || endsWith(b)) dropLast(1) else this

    private fun applyTone(text: String, tone: StyleTone): String = when (tone) {
        StyleTone.FORMAL -> text
        StyleTone.CASUAL -> text.removeSuffix(".")
        StyleTone.EXCITED -> if (text.endsWith('.')) text.dropLast(1) + "!" else text
        StyleTone.VERY_CASUAL, StyleTone.GEN_Z -> toneStart.replace(text.removeSuffix(".")) {
            it.groupValues[1] + it.groupValues[2].lowercase()
        }
    }

    fun format(
        raw: String,
        dictionary: List<ReplacementRule> = emptyList(),
        snippets: List<ReplacementRule> = emptyList(),
        options: PipelineOptions = defaults,
    ): PipelineResult {
        var text = raw.trim()
        if (text.isEmpty()) return PipelineResult("")
        val command = if (options.pressEnterCommand) pressEnter.find(text) else null
        if (command != null) text = text.substring(0, command.range.first)

        val clean = options.cleanupLevel != CleanupLevel.NONE
        val smart = options.smartFormatting
        val features = mutableListOf<AppliedFeature>()
        var wordsCorrected = 0
        var backtracks = 0
        if (clean) {
            val (cleaned, removed) = removeDisfluencies(text)
            text = cleaned
            wordsCorrected = removed
            if (smart.backtrack) {
                val (corrected, count) = backtrack(text)
                text = corrected
                backtracks = count
                wordsCorrected += count
                if (count > 0) features += AppliedFeature.BACKTRACK
            }
            if (smart.spokenPunctuation) text = tidy(spokenPunctuation(text))
        }

        val (corrected, dictionaryCount, dictionaryUsed) = replacements(text, dictionary)
        val (expanded, snippetCount, snippetUsed) = replacements(corrected, snippets)
        text = expanded
        if (clean) {
            if (smart.lists) {
                numberedList(text)?.let {
                    text = it
                    features += AppliedFeature.LIST
                }
            }
            text = capitalize(text)
            val email = if (smart.emails && options.isEmailContext) emailLayout(text) else null
            if (email != null) features += AppliedFeature.EMAIL
            text = applyTone(email ?: ensureTerminal(text), options.tone)
        }
        return PipelineResult(
            text = text,
            pressEnter = command != null,
            dictionaryReplacements = dictionaryCount,
            snippetExpansions = snippetCount,
            wordsCorrected = wordsCorrected,
            usedPhrases = dictionaryUsed + snippetUsed,
            appliedFeatures = features,
            backtracks = backtracks,
        )
    }
}
