package com.murmur.android

import android.util.Log
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import com.murmur.android.asr.Transcriber
import com.murmur.android.text.TextPipeline
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Test
import org.junit.runner.RunWith
import java.io.File

@RunWith(AndroidJUnit4::class)
class WhisperInstrumentedTest {
 @Test fun bundledModelTranscribesFixture()=runBlocking {
   val app=ApplicationProvider.getApplicationContext<MurmurApp>()
   val wav=File(app.cacheDir,"dictation-ptt.wav")
   InstrumentationRegistry.getInstrumentation().context.assets.open("dictation-ptt.wav").use { input -> wav.outputStream().use { input.copyTo(it) } }
   val samples=Transcriber.wavPcm16(wav)
   val loadMs=Transcriber.load(app)
   val start4=System.currentTimeMillis();val raw4=Transcriber.transcribe(app,samples,4);val run4Ms=System.currentTimeMillis()-start4
   val start6=System.currentTimeMillis();val raw6=Transcriber.transcribe(app,samples,6);val run6Ms=System.currentTimeMillis()-start6
   val cleaned4=TextPipeline.format(raw4).text
   val cleaned6=TextPipeline.format(raw6).text
   Log.i("MurmurWhisperTest","loadMs=$loadMs run4Ms=$run4Ms run6Ms=$run6Ms raw4=$raw4 raw6=$raw6")
   val expected="So I think we should move the meeting to Thursday. Thanks."
   assertEquals(expected,cleaned4)
   assertEquals(expected,cleaned6)
 }
}
