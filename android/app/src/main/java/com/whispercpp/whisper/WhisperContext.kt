package com.whispercpp.whisper

import kotlinx.coroutines.suspendCancellableCoroutine
import java.io.File
import java.io.IOException
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.nio.FloatBuffer

/** The buffer and all its views are borrowed only for the duration of [use]. */
internal suspend fun withAudioBuffer(maxSamples: Int, use: suspend (FloatBuffer) -> Unit) {
    val bytes = try {
        WhisperLib.allocateAudio(maxSamples)
    } catch (e: LinkageError) {
        throw IllegalStateException("Could not load the speech engine on this device.", e)
    }
    try {
        use(bytes.order(ByteOrder.nativeOrder()).asFloatBuffer())
    } finally {
        WhisperLib.freeAudio(bytes)
    }
}

// Transcriber serializes every operation (including release) on a worker dispatcher.
internal class WhisperContext private constructor(private var pointer: Long) {
    suspend fun transcribeData(data: FloatBuffer, threads: Int): String {
        check(pointer != 0L)
        require(data.position() == 0)
        val direct = data.isDirect
        require(if (direct) data.order() == ByteOrder.nativeOrder() else data.hasArray() && data.arrayOffset() == 0)
        suspendCancellableCoroutine<Unit> { continuation ->
            val token = ByteBuffer.allocateDirect(1) // Zeroed; only native atomic operations access it.
            continuation.invokeOnCancellation { WhisperLib.cancelDecode(token) }
            // Stay on the mutex-owning worker until whisper_full returns, including on cancellation.
            continuation.resumeWith(runCatching {
                if (continuation.isActive) {
                    WhisperLib.fullTranscribe(
                        pointer, threads, if (direct) null else data.array(), if (direct) data else null,
                        data.limit(), token,
                    )
                }
            })
        }
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
    external fun allocateAudio(maxSamples: Int): ByteBuffer
    external fun freeAudio(bytes: ByteBuffer)
    external fun cancelDecode(token: ByteBuffer)
    external fun fullTranscribe(
        pointer: Long, threads: Int, array: FloatArray?, direct: FloatBuffer?, sampleCount: Int, token: ByteBuffer,
    )
    external fun getTextSegmentCount(pointer: Long): Int
    external fun getTextSegment(pointer: Long, index: Int): ByteArray
}
