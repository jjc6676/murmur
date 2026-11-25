package com.murmur.android.text

data class ReplacementRule(val phrase: String, val replacement: String)
data class PipelineResult(val text: String, val pressEnter: Boolean = false, val dictionaryReplacements: Int = 0, val snippetExpansions: Int = 0, val wordsCorrected: Int = 0)

object TextPipeline {
    private val fillers = Regex("(^|[\\s,.;!?])(?:um+|uh+m*|erm+|er|ah+|hmm+|mm+|uh-huh)(?=[\\s,.;!?]|$)[,]?", RegexOption.IGNORE_CASE)
    private val legitimate = setOf("that", "had", "is", "very", "so", "bye", "no", "yes", "ha", "really", "many")

    fun removeDisfluencies(input: String): Pair<String, Int> {
        var removed = 0
        var text = Regex(",\\s*(?:um+|uh+m*|erm+|er|ah+|hmm+|mm+|uh-huh)\\b[,]?", RegexOption.IGNORE_CASE).replace(input) { removed++; " " }
        text = fillers.replace(text) { removed++; it.groupValues[1] }
        text = Regex("\\b(\\w+)(\\s*,?\\s+\\1\\b)+", RegexOption.IGNORE_CASE).replace(text) {
            val word = it.groupValues[1]
            if (word.lowercase() in legitimate) it.value else { removed += it.value.trim().split(Regex("\\s+")).size - 1; word }
        }
        return tidy(text) to removed
    }

    fun tidy(text: String) = text.replace(Regex("[ \\t]+"), " ").replace(Regex(" +([,.;:!?])"), "$1")
        .replace(Regex("([,;:])(?=[^\\s\\d])"), "$1 ").replace(Regex(",\\s*([.!?])"), "$1")
        .replace(Regex("([.!?])\\s*,"), "$1").replace(Regex(",(\\s*,)+"), ",")
        .replace(Regex("^[\\s,;:]+"), "").replace(Regex(" *\\n *"), "\n").trim()

    fun spokenPunctuation(input: String): String {
        var t = input
        listOf(
            Regex("\\s*\\bnew paragraph\\b[.,]?\\s*", RegexOption.IGNORE_CASE) to "\n\n",
            Regex("\\s*\\bnew line\\b[.,]?\\s*", RegexOption.IGNORE_CASE) to "\n",
            Regex("\\s*\\bquestion mark\\b[.,]?", RegexOption.IGNORE_CASE) to "?",
            Regex("\\s*\\bexclamation (?:point|mark)\\b[.,]?", RegexOption.IGNORE_CASE) to "!",
            Regex("\\s*\\bfull stop\\b[.,]?", RegexOption.IGNORE_CASE) to ".",
            Regex("\\s*\\bcomma\\b[.,]?", RegexOption.IGNORE_CASE) to ",",
            Regex("\\s*\\bsemicolon\\b[.,]?", RegexOption.IGNORE_CASE) to ";",
            Regex("\\s*\\bcolon\\b[.,]?(?=\\s)", RegexOption.IGNORE_CASE) to ":",
            Regex("\\s*\\bperiod\\b[.]?(?=\\s*$)", setOf(RegexOption.IGNORE_CASE, RegexOption.MULTILINE)) to "."
        ).forEach { (r, v) -> t = r.replace(t, v) }
        return t
    }

    fun replacements(input: String, rules: List<ReplacementRule>): Triple<String, Int, List<String>> {
        var text = input; var count = 0; val used = mutableListOf<String>()
        rules.sortedByDescending { it.phrase.length }.forEach { rule ->
            if (rule.phrase.isBlank()) return@forEach
            val body = rule.phrase.trim().split(Regex("\\s+")).joinToString("[\\s,]+") { Regex.escape(it) }
            val regex = Regex("(?<![\\p{L}\\p{N}])$body(?![\\p{L}\\p{N}])[.,]?", RegexOption.IGNORE_CASE)
            text = regex.replace(text) { match ->
                count++; if (rule.phrase !in used) used += rule.phrase
                val trail = match.value.lastOrNull()?.takeIf { it in ".," && rule.replacement.lastOrNull() !in listOf('.', ',') }?.toString().orEmpty()
                rule.replacement + trail
            }
        }
        return Triple(text, count, used)
    }

    fun format(raw: String, dictionary: List<ReplacementRule> = emptyList(), snippets: List<ReplacementRule> = emptyList(), pressEnterCommand: Boolean = true): PipelineResult {
        var text = raw.trim(); if (text.isEmpty()) return PipelineResult("")
        val enterRegex = Regex("[\\s,.]*\\bpress enter\\b[.!]?\\s*$", RegexOption.IGNORE_CASE)
        val enter = pressEnterCommand && enterRegex.containsMatchIn(text)
        if (enter) text = enterRegex.replace(text, "")
        val (cleaned, removed) = removeDisfluencies(text)
        text = tidy(spokenPunctuation(cleaned))
        val dict = replacements(text, dictionary); text = dict.first
        val snip = replacements(text, snippets); text = snip.first
        text = Regex("\\bi\\b").replace(text, "I")
        if (text.isNotBlank()) text = text.replaceFirstChar { if (it.isLowerCase()) it.titlecase() else it.toString() }
        if (text.count { it.isLetterOrDigit() } > 1 && text.lastOrNull() !in listOf('.', '!', '?', ':', ';', ')', ']', '\"', '\'') ) text += "."
        return PipelineResult(text, enter, dict.second, snip.second, removed)
    }
}
