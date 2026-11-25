package com.murmur.android.asr

import android.content.Context
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.io.File
import java.net.URL

class ModelManager(private val context: Context) {
    private val prefs = context.getSharedPreferences("settings", Context.MODE_PRIVATE)
    val baseFile get() = File(context.filesDir, "models/ggml-base.en.bin")
    val tinyFile get() = File(context.filesDir, "models/ggml-tiny.en.bin")
    val activeFile get() = if (prefs.getString("model", "base") == "tiny" && tinyFile.exists()) tinyFile else baseFile
    @Synchronized fun ensureBundledModel(): File { if (!baseFile.exists()) { baseFile.parentFile?.mkdirs(); val tmp=File(baseFile.path+".tmp"); context.assets.open("ggml-base.en.bin").use { input -> tmp.outputStream().use { input.copyTo(it, 1024*1024) } }; if(!tmp.renameTo(baseFile)) { tmp.copyTo(baseFile,true); tmp.delete() } }; return baseFile }
    suspend fun downloadTiny(progress: (Int)->Unit) = withContext(Dispatchers.IO) {
        tinyFile.parentFile?.mkdirs(); val tmp=File(tinyFile.path+".download"); val connection=URL("https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-tiny.en.bin").openConnection(); val total=connection.contentLengthLong
        connection.getInputStream().use { input -> tmp.outputStream().use { out -> val buf=ByteArray(1024*1024); var read:Int; var done=0L; while(input.read(buf).also{read=it}>0){out.write(buf,0,read); done+=read; if(total>0) progress((done*100/total).toInt())} } }
        if(!tmp.renameTo(tinyFile)){tmp.copyTo(tinyFile,true);tmp.delete()}; prefs.edit().putString("model","tiny").apply(); progress(100)
    }
    fun select(name:String){ if(name=="base" || (name=="tiny"&&tinyFile.exists())) prefs.edit().putString("model",name).apply() }
    fun currentName()=prefs.getString("model","base") ?: "base"
}
