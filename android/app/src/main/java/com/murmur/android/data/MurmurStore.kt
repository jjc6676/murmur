package com.murmur.android.data

import android.content.Context
import android.database.sqlite.SQLiteDatabase
import android.database.sqlite.SQLiteOpenHelper
import java.time.LocalDate
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.withContext

data class Dictation(
    val id: Long,
    val text: String,
    val words: Int,
    val durationMs: Long,
    val createdAt: Long,
)

data class Stats(val totalWords: Long, val averageWpm: Int, val streakDays: Int)

class MurmurStore(context: Context) : SQLiteOpenHelper(context, "murmur.db", null, SCHEMA_VERSION) {
    private val changes = MutableStateFlow(0L)
    val revision: StateFlow<Long> = changes.asStateFlow()

    override fun onCreate(db: SQLiteDatabase) {
        db.execSQL(
            """CREATE TABLE dictations(
                id INTEGER PRIMARY KEY,
                text TEXT NOT NULL,
                words INTEGER NOT NULL,
                duration_ms INTEGER NOT NULL,
                created_at INTEGER NOT NULL
            )""",
        )
        for (table in listOf("dictionary", "snippets")) {
            db.execSQL(
                """CREATE TABLE $table(
                    id INTEGER PRIMARY KEY,
                    phrase TEXT NOT NULL,
                    replacement TEXT NOT NULL
                )""",
            )
        }
    }

    override fun onUpgrade(db: SQLiteDatabase, oldVersion: Int, newVersion: Int) {
        // SQLiteOpenHelper wraps the entire upgrade in a transaction.
        for (version in oldVersion until newVersion) {
            val migrate = migrations[version]
                ?: error("Missing murmur.db migration from $version to ${version + 1}")
            migrate(db)
        }
    }

    suspend fun history(query: String, limit: Int = 50, offset: Int = 0): List<Dictation> =
        withContext(Dispatchers.IO) {
            require(limit >= 0 && offset >= 0)
            val filter = if (query.isEmpty()) "" else "WHERE text LIKE ? ESCAPE '\\'"
            val args = if (query.isEmpty()) {
                arrayOf(limit.toString(), offset.toString())
            } else {
                val literal = query.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
                arrayOf("%$literal%", limit.toString(), offset.toString())
            }
            val sql = """SELECT id, text, words, duration_ms, created_at FROM dictations
                         $filter ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?"""
            readableDatabase.rawQuery(sql, args).use { cursor ->
                buildList {
                    while (cursor.moveToNext()) {
                        add(
                            Dictation(
                                cursor.getLong(0), cursor.getString(1), cursor.getInt(2),
                                cursor.getLong(3), cursor.getLong(4),
                            ),
                        )
                    }
                }
            }
        }

    suspend fun stats(): Stats = withContext(Dispatchers.IO) {
        val sql = """SELECT date(created_at / 1000, 'unixepoch', 'localtime') AS day,
                            SUM(words), SUM(duration_ms)
                     FROM dictations GROUP BY day ORDER BY day DESC"""
        var words = 0L
        var durationMs = 0L
        var streak = 0
        var expected = LocalDate.now()
        var expectedDay = expected.toString()
        readableDatabase.rawQuery(sql, null).use { cursor ->
            while (cursor.moveToNext()) {
                words += cursor.getLong(1)
                durationMs += cursor.getLong(2)
                if (cursor.getString(0) == expectedDay) {
                    streak++
                    expected = expected.minusDays(1)
                    expectedDay = expected.toString()
                }
            }
        }
        val averageWpm = if (durationMs > 0) (words * 60_000.0 / durationMs).toInt() else 0
        Stats(words, averageWpm, streak)
    }

    suspend fun addDictation(text: String, words: Int, durationMs: Long) = write { db ->
        db.execSQL(
            "INSERT INTO dictations(text, words, duration_ms, created_at) VALUES(?, ?, ?, ?)",
            arrayOf(text, words, durationMs, System.currentTimeMillis()),
        )
    }

    suspend fun deleteDictation(id: Long) = write { db ->
        db.delete("dictations", "id = ?", arrayOf(id.toString()))
    }

    suspend fun rules(kind: String): List<Pair<String, String>> = withContext(Dispatchers.IO) {
        val table = ruleTable(kind)
        // v1 allowed duplicate phrases. Expose the newest entry for each addressable key.
        val sql = """SELECT phrase, replacement, MAX(id) FROM $table
                     GROUP BY phrase ORDER BY phrase COLLATE NOCASE, phrase"""
        readableDatabase.rawQuery(sql, null).use { cursor ->
            buildList {
                while (cursor.moveToNext()) add(cursor.getString(0) to cursor.getString(1))
            }
        }
    }

    suspend fun addRule(kind: String, from: String, to: String) = write { db ->
        val table = ruleTable(kind)
        db.beginTransaction()
        try {
            db.delete(table, "phrase = ?", arrayOf(from))
            db.execSQL("INSERT INTO $table(phrase, replacement) VALUES(?, ?)", arrayOf(from, to))
            db.setTransactionSuccessful()
        } finally {
            db.endTransaction()
        }
    }

    suspend fun deleteRule(kind: String, from: String) = write { db ->
        db.delete(ruleTable(kind), "phrase = ?", arrayOf(from))
    }

    private suspend fun write(action: (SQLiteDatabase) -> Unit): Unit = withContext(Dispatchers.IO) {
        action(writableDatabase)
        changes.update { it + 1 }
    }

    private fun ruleTable(kind: String): String {
        require(kind == "dictionary" || kind == "snippets") { "Unknown rule kind: $kind" }
        return kind
    }

    private companion object {
        const val SCHEMA_VERSION = 1

        // Key N upgrades schema N to N+1; register a tested step before bumping the version.
        val migrations: Map<Int, (SQLiteDatabase) -> Unit> = emptyMap()
    }
}
