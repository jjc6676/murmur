package com.murmur.android.data

import android.content.Context
import android.database.sqlite.SQLiteDatabase
import android.database.sqlite.SQLiteOpenHelper
import com.murmur.android.text.ReplacementRule

data class Dictation(val id: Long, val text: String, val words: Int, val durationMs: Long, val createdAt: Long)
class MurmurStore(context: Context) : SQLiteOpenHelper(context, "murmur.db", null, 1) {
    override fun onCreate(db: SQLiteDatabase) { db.execSQL("CREATE TABLE dictations(id INTEGER PRIMARY KEY,text TEXT NOT NULL,words INTEGER NOT NULL,duration_ms INTEGER NOT NULL,created_at INTEGER NOT NULL)"); db.execSQL("CREATE TABLE dictionary(id INTEGER PRIMARY KEY,phrase TEXT NOT NULL,replacement TEXT NOT NULL)"); db.execSQL("CREATE TABLE snippets(id INTEGER PRIMARY KEY,phrase TEXT NOT NULL,replacement TEXT NOT NULL)") }
    override fun onUpgrade(db: SQLiteDatabase, oldVersion: Int, newVersion: Int) = Unit
    fun addDictation(text: String, durationMs: Long) = writableDatabase.execSQL("INSERT INTO dictations(text,words,duration_ms,created_at) VALUES(?,?,?,?)", arrayOf(text, text.split(Regex("\\s+")).size, durationMs, System.currentTimeMillis()))
    fun dictations(query: String = ""): List<Dictation> { val out= mutableListOf<Dictation>(); readableDatabase.rawQuery("SELECT id,text,words,duration_ms,created_at FROM dictations WHERE text LIKE ? ORDER BY created_at DESC", arrayOf("%$query%")).use { while(it.moveToNext()) out += Dictation(it.getLong(0),it.getString(1),it.getInt(2),it.getLong(3),it.getLong(4)) }; return out }
    fun deleteDictation(id: Long) = writableDatabase.delete("dictations", "id=?", arrayOf(id.toString()))
    fun rules(table: String): List<Pair<Long, ReplacementRule>> { require(table in setOf("dictionary","snippets")); val out= mutableListOf<Pair<Long,ReplacementRule>>(); readableDatabase.rawQuery("SELECT id,phrase,replacement FROM $table ORDER BY phrase COLLATE NOCASE",null).use { while(it.moveToNext()) out += it.getLong(0) to ReplacementRule(it.getString(1),it.getString(2)) }; return out }
    fun saveRule(table: String, id: Long?, phrase: String, replacement: String) { require(table in setOf("dictionary","snippets")); if(id==null) writableDatabase.execSQL("INSERT INTO $table(phrase,replacement) VALUES(?,?)",arrayOf(phrase,replacement)) else writableDatabase.execSQL("UPDATE $table SET phrase=?,replacement=? WHERE id=?",arrayOf(phrase,replacement,id)) }
    fun deleteRule(table:String,id:Long) { require(table in setOf("dictionary","snippets")); writableDatabase.delete(table,"id=?",arrayOf(id.toString())) }
}
