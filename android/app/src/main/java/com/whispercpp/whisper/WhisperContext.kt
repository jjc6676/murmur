package com.whispercpp.whisper

import java.util.concurrent.Executors
import kotlinx.coroutines.asCoroutineDispatcher
import kotlinx.coroutines.withContext

class WhisperContext private constructor(private var pointer: Long) {
    private val dispatcher = Executors.newSingleThreadExecutor().asCoroutineDispatcher()
    suspend fun transcribeData(data: FloatArray, threads: Int = 4): String = withContext(dispatcher) {
        check(pointer != 0L)
        WhisperLib.fullTranscribe(pointer, threads.coerceIn(1, 8), data)
        buildString { repeat(WhisperLib.getTextSegmentCount(pointer)) { append(WhisperLib.getTextSegment(pointer, it)) } }
    }
    suspend fun release() = withContext(dispatcher) { if (pointer != 0L) { WhisperLib.freeContext(pointer); pointer = 0L }; dispatcher.close() }
    companion object {
        fun createContextFromFile(path: String): WhisperContext {
            val pointer = WhisperLib.initContext(path)
            check(pointer != 0L) { "Could not load Whisper model: $path" }
            return WhisperContext(pointer)
        }
    }
}

private object WhisperLib {
    init { System.loadLibrary("whisper") }
    external fun initContext(path: String): Long
    external fun freeContext(pointer: Long)
    external fun fullTranscribe(pointer: Long, threads: Int, audio: FloatArray)
    external fun getTextSegmentCount(pointer: Long): Int
    external fun getTextSegment(pointer: Long, index: Int): String
}
