package com.whispercpp.whisper

import java.io.File
import java.io.IOException

// Transcriber serializes every operation (including release) on a worker dispatcher.
internal class WhisperContext private constructor(private var pointer: Long) {
    fun transcribeData(data: FloatArray, threads: Int): String {
        check(pointer != 0L)
        WhisperLib.fullTranscribe(pointer, threads, data)
        val segments = WhisperLib.getTextSegmentCount(pointer)
        if (segments == 0) return ""
        if (segments == 1) return WhisperLib.getTextSegment(pointer, 0).decodeToString()
        return buildString {
            repeat(segments) { index ->
                append(WhisperLib.getTextSegment(pointer, index).decodeToString())
            }
        }
    }

    fun release() {
        if (pointer != 0L) {
            WhisperLib.freeContext(pointer)
            pointer = 0L
        }
    }

    companion object {
        fun createContextFromFile(path: String): WhisperContext {
            val pointer = WhisperLib.initContext(path)
            check(pointer != 0L) { "Could not load the selected speech model." }
            return WhisperContext(pointer)
        }
    }
}

private object WhisperLib {
    init {
        System.loadLibrary(if (supportsFp16()) "whisper_fp16" else "whisper")
    }

    private fun supportsFp16(): Boolean {
        // Some kernels list Features per core; a worker may migrate between any of them.
        return try {
            File("/proc/cpuinfo").useLines { lines ->
                var found = false
                for (line in lines) {
                    if (!line.substringBefore(':').trim().equals("Features", ignoreCase = true)) continue
                    val flags = line.substringAfter(':').trim().split(Regex("\\s+"))
                    if ("asimdhp" !in flags || "fphp" !in flags) return@useLines false
                    found = true
                }
                found
            }
        } catch (_: IOException) {
            false
        } catch (_: SecurityException) {
            false
        }
    }

    external fun initContext(path: String): Long
    external fun freeContext(pointer: Long)
    external fun fullTranscribe(pointer: Long, threads: Int, audio: FloatArray)
    external fun getTextSegmentCount(pointer: Long): Int
    external fun getTextSegment(pointer: Long, index: Int): ByteArray
}
