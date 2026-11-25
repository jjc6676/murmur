package com.murmur.android

import android.app.Application
import com.murmur.android.data.MurmurStore
import com.murmur.android.asr.ModelManager

class MurmurApp : Application() {
    val store by lazy { MurmurStore(this) }
    val models by lazy { ModelManager(this) }
    override fun onCreate() {
        super.onCreate()
        kotlin.concurrent.thread(name = "murmur-model-copy") { models.ensureBundledModel() }
    }
}
