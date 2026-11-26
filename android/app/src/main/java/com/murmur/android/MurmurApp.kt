package com.murmur.android

import android.app.Application
import android.content.ComponentCallbacks2
import com.murmur.android.asr.ModelManager
import com.murmur.android.asr.Transcriber
import com.murmur.android.data.MurmurStore

class MurmurApp : Application() {
    val store by lazy { MurmurStore(this) }
    val models by lazy { ModelManager(this) }

    override fun onTrimMemory(level: Int) {
        super.onTrimMemory(level)
        if (level >= ComponentCallbacks2.TRIM_MEMORY_RUNNING_LOW) Transcriber.release()
    }
}
