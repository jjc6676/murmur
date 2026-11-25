package com.murmur.android.asr

import android.content.Context
import com.whispercpp.whisper.WhisperContext
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import java.io.File
import java.nio.ByteBuffer
import java.nio.ByteOrder

object Transcriber {
    private val mutex = Mutex()
    private var modelPath: String? = null
    private var whisper: WhisperContext? = null

    private suspend fun ensureLoadedLocked(context: Context) {
        val manager = (context.applicationContext as com.murmur.android.MurmurApp).models
        manager.ensureBundledModel()
        val file = manager.activeFile
        if (modelPath != file.path) {
            whisper?.release()
            whisper = WhisperContext.createContextFromFile(file.path)
            modelPath = file.path
        }
    }

    suspend fun load(context: Context): Long = mutex.withLock {
        val started = android.os.SystemClock.elapsedRealtime()
        ensureLoadedLocked(context)
        android.os.SystemClock.elapsedRealtime() - started
    }

    suspend fun transcribe(context: Context, samples: FloatArray, threads: Int? = null): String = mutex.withLock {
        ensureLoadedLocked(context)
        val selected = threads ?: context.getSharedPreferences("settings", Context.MODE_PRIVATE)
            .getInt("threads", 4).coerceIn(1, 6)
        whisper!!.transcribeData(samples, selected).trim()
    }

    fun wavPcm16(file: File): FloatArray { val bytes=file.readBytes(); require(bytes.size>44); val start=44; val result=FloatArray((bytes.size-start)/2); val bb=ByteBuffer.wrap(bytes,start,bytes.size-start).order(ByteOrder.LITTLE_ENDIAN); for(i in result.indices) result[i]=bb.short/32768f; return result }
    fun pcm16(bytes:ByteArray):FloatArray { val bb=ByteBuffer.wrap(bytes).order(ByteOrder.LITTLE_ENDIAN); return FloatArray(bytes.size/2){bb.short/32768f} }
}
