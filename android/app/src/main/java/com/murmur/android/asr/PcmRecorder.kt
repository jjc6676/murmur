package com.murmur.android.asr

import android.annotation.SuppressLint
import android.media.AudioFormat
import android.media.AudioRecord
import android.media.MediaRecorder
import android.os.SystemClock
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.currentCoroutineContext
import kotlinx.coroutines.delay
import kotlinx.coroutines.ensureActive
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import kotlin.math.abs

/** A single capture. The UI can request a finish, or cancel record() to discard it. */
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

    class Capture(val samples: FloatArray) {
        val atLimit get() = samples.size == MAX_SAMPLES
        val durationMs get() = samples.size * 1000L / SAMPLE_RATE
    }

    @Volatile private var finishRequested = false
    @Volatile var level = 0f
        private set

    fun finish() {
        finishRequested = true
    }

    @SuppressLint("MissingPermission")
    suspend fun record(): Capture = withContext(Dispatchers.IO) {
        device.withLock {
            if (finishRequested) return@withLock Capture(FloatArray(0))
            val minBytes = AudioRecord.getMinBufferSize(SAMPLE_RATE, CHANNEL, FORMAT)
            check(minBytes > 0) { "Unsupported microphone format" }
            val audio = AudioRecord(
                MediaRecorder.AudioSource.VOICE_RECOGNITION, SAMPLE_RATE, CHANNEL, FORMAT,
                minBytes.coerceAtLeast(4096),
            )
            val chunks = ArrayList<ShortArray>()
            var count = 0
            try {
                check(audio.state == AudioRecord.STATE_INITIALIZED) { "Microphone unavailable" }
                audio.startRecording()
                check(audio.recordingState == AudioRecord.RECORDSTATE_RECORDING) {
                    "Microphone did not start"
                }
                // Join even on cancellation (structured concurrency) before releasing or
                // consuming any samples. Non-blocking reads never need a cross-thread stop.
                coroutineScope {
                    launch {
                        var lastRead = SystemClock.elapsedRealtime()
                        while (!finishRequested && count < MAX_SAMPLES) {
                            currentCoroutineContext().ensureActive()
                            val index = count / CHUNK_SAMPLES
                            val offset = count % CHUNK_SAMPLES
                            if (index == chunks.size) chunks.add(ShortArray(CHUNK_SAMPLES))
                            val chunk = chunks[index]
                            val room = minOf(chunk.size - offset, MAX_SAMPLES - count)
                            val n = audio.read(chunk, offset, room, AudioRecord.READ_NON_BLOCKING)
                            check(n >= 0) { "Microphone read failed ($n)" }
                            if (n == 0) {
                                check(SystemClock.elapsedRealtime() - lastRead < 3000) {
                                    "Microphone stopped providing audio"
                                }
                                delay(15)
                                continue
                            }
                            lastRead = SystemClock.elapsedRealtime()
                            var peak = 0
                            for (i in offset until offset + n) {
                                peak = maxOf(peak, abs(chunk[i].toInt()))
                            }
                            level = peak / 32768f
                            count += n
                        }
                    }.join()
                }
            } finally {
                try {
                    if (audio.recordingState == AudioRecord.RECORDSTATE_RECORDING) audio.stop()
                } finally {
                    audio.release()
                    level = 0f
                }
            }
            Capture(FloatArray(count) { chunks[it / CHUNK_SAMPLES][it % CHUNK_SAMPLES] / 32768f })
        }
    }
}
