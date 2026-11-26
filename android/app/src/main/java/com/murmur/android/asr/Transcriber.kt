package com.murmur.android.asr

import android.content.Context
import android.util.Log
import com.murmur.android.MurmurApp
import com.whispercpp.whisper.WhisperContext
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.currentCoroutineContext
import kotlinx.coroutines.delay
import kotlinx.coroutines.ensureActive
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.nio.FloatBuffer

class TranscriptionException(message: String, cause: Throwable) : Exception(message, cause)

object Transcriber {
    private val mutex = Mutex()
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)
    private var idleRelease: Job? = null
    private data class Loaded(val path: String, val context: WhisperContext)
    private var loaded: Loaded? = null
    private val nonSpeech = Regex(
        """(?i)\[(?:blank[_ ]audio|silence|music|applause|laughter|inaudible)\]|\((?:silence|music|applause|laughter|inaudible)\)""",
    )

    /** Warm the selected model only when the bubble is enabled and not snoozed. */
    suspend fun preload(context: Context) {
        preloadWithModel(context, null)
    }

    internal suspend fun preloadWithModel(context: Context, model: ModelId?) {
        withModel(context, model) {}
    }

    suspend fun transcribe(context: Context, samples: FloatArray, threads: Int? = null): String =
        transcribeWithModel(context, samples, threads, null)

    internal suspend fun transcribe(context: Context, samples: FloatBuffer, threads: Int? = null): String =
        decode(context, samples, threads, null)

    internal suspend fun transcribeWithModel(
        context: Context,
        samples: FloatArray,
        threads: Int?,
        model: ModelId?,
    ): String = decode(context, FloatBuffer.wrap(samples), threads, model)

    private suspend fun decode(context: Context, samples: FloatBuffer, threads: Int?, model: ModelId?): String {
        val sampleCount = samples.limit()
        if (sampleCount == 0) return ""
        return withModel(context, model) { whisper ->
            val count = threads ?: context.getSharedPreferences("settings", Context.MODE_PRIVATE).getInt("threads", 4)
            val text = try {
                whisper.transcribeData(samples, count.coerceIn(1, 6))
            } catch (e: CancellationException) {
                throw e
            } catch (e: IllegalStateException) {
                currentCoroutineContext().ensureActive()
                throw TranscriptionException("Speech decoding failed. Please try again.", e)
            }
            val result = nonSpeech.replace(text, "").trim()
            if (com.murmur.android.BuildConfig.DEBUG) {
                var peak = 0f
                var sumSquares = 0.0
                for (i in 0 until sampleCount) {
                    val sample = samples.get(i)
                    peak = maxOf(peak, kotlin.math.abs(sample))
                    sumSquares += sample * sample
                }
                val rms = kotlin.math.sqrt(sumSquares / sampleCount)
                Log.d("MurmurTranscriber", "samples=$sampleCount peak=$peak rms=$rms chars=${result.length}")
            }
            result
        }
    }

    /** Memory pressure: do not queue a release behind a load or an active dictation. */
    fun releaseIfIdle() {
        if (!mutex.tryLock()) return
        scope.launch {
            try {
                releaseLocked()
            } finally {
                mutex.unlock()
            }
        }
    }

    // The caller never blocks Main, even if native inference is still running.
    fun release() {
        scope.launch {
            mutex.withLock { releaseLocked() }
        }
    }

    private fun releaseLocked() {
        idleRelease?.cancel()
        idleRelease = null
        val old = loaded
        loaded = null
        old?.context?.release()
    }

    private suspend fun <T> withModel(
        context: Context,
        model: ModelId?,
        action: suspend (WhisperContext) -> T,
    ): T = withContext(Dispatchers.Default) {
        mutex.withLock {
            idleRelease?.cancel()
            idleRelease = null
            try {
                val manager = (context.applicationContext as MurmurApp).models
                val file = if (model == null) manager.ensureActiveInstalled() else manager.ensureInstalled(model)
                val current = loaded
                val whisper = if (current != null && current.path == file.path) {
                    current.context
                } else {
                    releaseLocked()
                    WhisperContext.createContextFromFile(file.path).also { loaded = Loaded(file.path, it) }
                }
                currentCoroutineContext().ensureActive()
                action(whisper)
            } catch (e: CancellationException) {
                throw e
            } catch (e: IllegalStateException) {
                throw TranscriptionException(e.message ?: "Could not load the speech model.", e)
            } catch (e: LinkageError) {
                throw TranscriptionException("Could not load the speech engine on this device.", e)
            } finally {
                if (loaded != null) {
                    idleRelease = scope.launch {
                        delay(60_000L)
                        mutex.withLock {
                            currentCoroutineContext().ensureActive()
                            releaseLocked()
                        }
                    }
                }
            }
        }
    }

    fun pcm16(bytes: ByteArray): FloatArray {
        val buffer = ByteBuffer.wrap(bytes).order(ByteOrder.LITTLE_ENDIAN)
        return FloatArray(bytes.size / 2) { buffer.short / 32768f }
    }
}
