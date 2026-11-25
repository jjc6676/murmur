package com.murmur.android.asr

import android.annotation.SuppressLint
import android.media.AudioFormat
import android.media.AudioRecord
import android.media.MediaRecorder
import java.io.ByteArrayOutputStream
import kotlin.concurrent.thread
import kotlin.math.abs

class PcmRecorder {
    @Volatile private var running=false; private var record:AudioRecord?=null; private val output=ByteArrayOutputStream(); @Volatile var level:Float=0f; private set
    @SuppressLint("MissingPermission") fun start(){ if(running)return; output.reset(); val min=AudioRecord.getMinBufferSize(16000,AudioFormat.CHANNEL_IN_MONO,AudioFormat.ENCODING_PCM_16BIT).coerceAtLeast(4096); record=AudioRecord(MediaRecorder.AudioSource.VOICE_RECOGNITION,16000,AudioFormat.CHANNEL_IN_MONO,AudioFormat.ENCODING_PCM_16BIT,min*2); record!!.startRecording(); running=true; thread(name="murmur-recorder"){val buf=ByteArray(min);while(running){val n=record?.read(buf,0,buf.size)?:0;if(n>0){output.write(buf,0,n); var peak=0; var i=0;while(i+1<n){val sample=(buf[i].toInt() or (buf[i+1].toInt() shl 8)).toShort().toInt();peak=maxOf(peak,abs(sample));i+=2};level=peak/32768f}}} }
    fun stop():ByteArray { running=false; try{record?.stop()}catch(_:Exception){};record?.release();record=null;level=0f;return output.toByteArray() }
    fun isRunning()=running
}
