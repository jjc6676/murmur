package com.murmur.android.asr

import android.annotation.SuppressLint
import android.media.AudioFormat
import android.media.AudioRecord
import android.media.MediaRecorder
import android.os.SystemClock
import com.whispercpp.whisper.withAudioBuffer
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.currentCoroutineContext
import kotlinx.coroutines.delay
import kotlinx.coroutines.ensureActive
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import java.nio.FloatBuffer
import kotlin.math.abs

/** A single capture. Finish to transcribe, or cancel the caller's job to discard it. */
internal class PcmRecorder {
    companion object {
        const val SAMPLE_RATE = 16_000
        const val LIMIT_MINUTES = 5
        private const val MAX_SAMPLES = SAMPLE_RATE * 60 * LIMIT_MINUTES
        private const val CHUNK_SAMPLES = 8_192
        private const val CHANNEL = AudioFormat.CHANNEL_IN_MONO
        private const val FORMAT = AudioFormat.ENCODING_PCM_16BIT

        // A new editor (or service instance) must wait for the old device to be released.
        private val device = Mutex()
    }

    class Capture(val samples: FloatBuffer) {
        val atLimit get() = samples.limit() == MAX_SAMPLES
        val durationMs get() = samples.limit() * 1000L / SAMPLE_RATE
    }

    @Volatile private var finishRequested = false
    @Volatile var level = 0f
        private set

    fun finish() {
        finishRequested = true
    }

    /** [consume] runs on the caller's dispatcher; its audio must not escape the callback. */
    suspend fun withCapture(consume: suspend (Capture) -> Unit) {
        val callerContext = currentCoroutineContext().minusKey(Job)
        withContext(Dispatchers.IO) {
            withAudioBuffer(MAX_SAMPLES) { samples ->
                device.withLock {
                    if (!finishRequested) recordInto(samples)
                }
                samples.flip()
                withContext(callerContext) { consume(Capture(samples)) }
            }
        }
    }

    @SuppressLint("MissingPermission")
    private suspend fun recordInto(samples: FloatBuffer) {
        val minBytes = AudioRecord.getMinBufferSize(SAMPLE_RATE, CHANNEL, FORMAT)
        check(minBytes > 0) { "Unsupported microphone format" }
        val chunk = ShortArray(CHUNK_SAMPLES)
        val audio = AudioRecord(
            MediaRecorder.AudioSource.VOICE_RECOGNITION, SAMPLE_RATE, CHANNEL, FORMAT,
            minBytes.coerceAtLeast(4096),
        )
        try {
            check(audio.state == AudioRecord.STATE_INITIALIZED) { "Microphone unavailable" }
            audio.startRecording()
            check(audio.recordingState == AudioRecord.RECORDSTATE_RECORDING) { "Microphone did not start" }
            var lastRead = SystemClock.elapsedRealtime()
            while (!finishRequested && samples.hasRemaining()) {
                currentCoroutineContext().ensureActive()
                val room = minOf(chunk.size, samples.remaining())
                val n = audio.read(chunk, 0, room, AudioRecord.READ_NON_BLOCKING)
                check(n >= 0) { "Microphone read failed ($n)" }
                if (n == 0) {
                    check(SystemClock.elapsedRealtime() - lastRead < 3000) { "Microphone stopped providing audio" }
                    delay(15)
                    continue
                }
                lastRead = SystemClock.elapsedRealtime()
                var peak = 0
                for (i in 0 until n) {
                    val sample = chunk[i].toInt()
                    samples.put(sample / 32768f)
                    peak = maxOf(peak, abs(sample))
                }
                level = peak / 32768f
            }
        } finally {
            try {
                if (audio.recordingState == AudioRecord.RECORDSTATE_RECORDING) audio.stop()
            } finally {
                audio.release()
                level = 0f
            }
        }
    }
}
