package com.murmur.android

import android.app.Application
import android.content.ComponentCallbacks2
import com.murmur.android.asr.ModelManager
import com.murmur.android.asr.Transcriber
import com.murmur.android.data.HISTORY_RETENTION_DAYS
import com.murmur.android.data.KEEP_HISTORY_FOREVER
import com.murmur.android.data.MurmurStore
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch

class MurmurApp : Application() {
    val store by lazy { MurmurStore(this) }
    val models by lazy { ModelManager(this) }
    internal val applicationScope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)

    override fun onCreate() {
        super.onCreate()
        applicationScope.launch(Dispatchers.IO) {
            val settings = getSharedPreferences("settings", MODE_PRIVATE)
            if (settings.getInt(HISTORY_RETENTION_DAYS, KEEP_HISTORY_FOREVER) > 0) {
                // onOpen prunes before the first reader, even if it races this startup task.
                store.writableDatabase
            }
        }
    }

    override fun onTrimMemory(level: Int) {
        super.onTrimMemory(level)
        if (level >= ComponentCallbacks2.TRIM_MEMORY_RUNNING_LOW) Transcriber.releaseIfIdle()
    }
}
