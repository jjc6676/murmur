package com.murmur.android

import android.os.SystemClock
import android.util.Log
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import com.murmur.android.asr.ModelId
import com.murmur.android.asr.Transcriber
import com.murmur.android.text.TextPipeline
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import java.nio.ByteBuffer
import java.nio.ByteOrder

@RunWith(AndroidJUnit4::class)
class WhisperInstrumentedTest {
    private val app get() = ApplicationProvider.getApplicationContext<MurmurApp>()
    private val model = ModelId.BASE_EN

    @Test
    fun bundledModelTranscribesFixture() = runBlocking {
        val samples = fixtureSamples()
        val start = SystemClock.elapsedRealtime()
        try {
            Transcriber.preloadWithModel(app, model)
            Log.i("MurmurWhisperTest", "loadMs=${SystemClock.elapsedRealtime() - start}")
            for (threads in listOf(4, 6)) {
                val decodeStart = SystemClock.elapsedRealtime()
                val raw = Transcriber.transcribeWithModel(app, samples, threads, model)
                Log.i("MurmurWhisperTest", "threads=$threads decodeMs=${SystemClock.elapsedRealtime() - decodeStart}")
                assertEquals(
                    "So I think we should move the meeting to Thursday. Thanks.",
                    TextPipeline.format(raw).text,
                )
            }
        } finally {
            Transcriber.release()
        }
    }

    @Test
    fun bundledModelRecognizesSpeechAfterFirstWindow() = runBlocking {
        val speech = fixtureSamples()
        val offset = 31 * 16_000
        val samples = FloatArray(offset + speech.size)
        speech.copyInto(samples, destinationOffset = offset)
        try {
            val text = Transcriber.transcribeWithModel(app, samples, 4, model)
            assertTrue("Expected speech from the second window", text.contains("Thursday", ignoreCase = true))
        } finally {
            Transcriber.release()
        }
    }

    private fun fixtureSamples(): FloatArray {
        val assets = InstrumentationRegistry.getInstrumentation().context.assets
        val bytes = assets.open("dictation-ptt.wav").use { it.readBytes() }
        val wav = ByteBuffer.wrap(bytes).order(ByteOrder.LITTLE_ENDIAN)
        // This RIFF fixture has a LIST metadata chunk between fmt and data.
        wav.position(12)
        while (wav.remaining() >= 8) {
            val id = wav.int
            val length = wav.int
            require(length in 0..wav.remaining())
            if (id == 0x61746164) { // "data", little endian
                return FloatArray(length / 2) { wav.short / 32768f }
            }
            wav.position(wav.position() + length + (length and 1))
        }
        error("No PCM data in fixture")
    }
}
