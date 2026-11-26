package com.murmur.android.asr

import android.content.Context
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.currentCoroutineContext
import kotlinx.coroutines.ensureActive
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import java.io.File
import java.io.IOException
import java.io.InputStream
import java.io.OutputStream
import java.net.HttpURLConnection
import java.net.URL
import java.nio.file.Files
import java.nio.file.StandardCopyOption.ATOMIC_MOVE
import java.nio.file.StandardCopyOption.REPLACE_EXISTING
import java.security.MessageDigest

private const val TINY_URL = "https://huggingface.co/ggerganov/whisper.cpp/resolve/" +
    "5359861c739e955e79d9a303bcbc70fb988958b1/ggml-tiny.en.bin"

enum class ModelId(val fileName: String) {
    BASE_EN("ggml-base.en.bin"),
    TINY_EN("ggml-tiny.en.bin"),
}

sealed interface DownloadState {
    data object Idle : DownloadState
    data class Running(val progress: Float) : DownloadState
    data class Failed(val message: String) : DownloadState
}

data class ModelState(
    val active: ModelId,
    val installed: Set<ModelId>,
    val download: DownloadState,
)

@OptIn(ExperimentalStdlibApi::class)
private class Fingerprint(val size: Long, hex: String) {
    val sha256 = hex.hexToByteArray()
}

private val fingerprints = mapOf(
    ModelId.BASE_EN to Fingerprint(
        147964211L, "a03779c86df3323075f5e796cb2ce5029f00ec8869eee3fdfb897afe36c6d002",
    ),
    ModelId.TINY_EN to Fingerprint(
        77704715L, "921e4cf8686fdd993dcd081a5da5b6c365bfde1162e72b08d75ac75289920b1f",
    ),
)

class ModelManager(private val context: Context) {
    private val prefs = context.getSharedPreferences("settings", Context.MODE_PRIVATE)
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private val directory = File(context.filesDir, "models")
    private val locks = ModelId.entries.associateWith { Mutex() }
    // Each entry is accessed only under that model's lock. The live files are app-private.
    private val verified = BooleanArray(ModelId.entries.size)
    private val mutableState = MutableStateFlow(
        ModelState(
            active = if (prefs.getString("model", "base") == "tiny") ModelId.TINY_EN else ModelId.BASE_EN,
            // Base ships in the APK; selecting it need not extract the asset.
            installed = setOf(ModelId.BASE_EN),
            download = DownloadState.Idle,
        ),
    )
    val state: StateFlow<ModelState> = mutableState.asStateFlow()

    init {
        scope.launch {
            // Older releases wrote Tiny directly to its live path. Never trust existence alone.
            locks.getValue(ModelId.TINY_EN).withLock {
                verifyExisting(ModelId.TINY_EN)
            }
        }
    }

    @Synchronized
    fun select(id: ModelId) {
        if (id !in state.value.installed) return
        prefs.edit().putString("model", if (id == ModelId.TINY_EN) "tiny" else "base").apply()
        mutableState.update { it.copy(active = id) }
    }

    @Synchronized
    fun startDownload(id: ModelId) {
        if (id in state.value.installed || state.value.download is DownloadState.Running) return
        mutableState.update { it.copy(download = DownloadState.Running(0f)) }
        scope.launch {
            try {
                locks.getValue(id).withLock {
                    if (!verifyExisting(id)) {
                        val connection = URL(TINY_URL).openConnection() as HttpURLConnection
                        try {
                            connection.connectTimeout = 15_000
                            connection.readTimeout = 30_000
                            connection.inputStream.use { install(id, it, reportProgress = true) }
                        } finally {
                            connection.disconnect()
                        }
                    }
                }
                mutableState.update { it.copy(download = DownloadState.Idle) }
            } catch (e: CancellationException) {
                mutableState.update { it.copy(download = DownloadState.Idle) }
                throw e
            } catch (_: Exception) {
                mutableState.update {
                    it.copy(download = DownloadState.Failed("Could not install Tiny. Check your connection and free storage, then retry."))
                }
            }
        }
    }

    suspend fun ensureActiveInstalled(): File = ensureInstalled(state.value.active)

    internal suspend fun ensureInstalled(id: ModelId): File = withContext(Dispatchers.IO) {
        try {
            locks.getValue(id).withLock {
                if (!verifyExisting(id)) {
                    check(id == ModelId.BASE_EN) { "Tiny is not installed. Download it or select Base in Settings." }
                    context.assets.open(id.fileName).use { install(id, it, reportProgress = false) }
                }
                File(directory, id.fileName)
            }
        } catch (e: CancellationException) {
            throw e
        } catch (e: IllegalStateException) {
            throw e
        } catch (e: Exception) {
            throw IllegalStateException("Could not prepare the speech model. Check free storage and try again.", e)
        }
    }

    private suspend fun verifyExisting(id: ModelId): Boolean {
        val file = File(directory, id.fileName)
        val valid = try {
            file.length() == fingerprints.getValue(id).size &&
                (verified[id.ordinal] || file.inputStream().use { checkStream(id, it, null, false) })
        } catch (_: IOException) {
            false
        } catch (_: SecurityException) {
            false
        }
        if (valid) {
            if (!verified[id.ordinal]) markVerified(id)
            return true
        }
        verified[id.ordinal] = false
        if (id == ModelId.TINY_EN) mutableState.update { it.copy(installed = it.installed - id) }
        return false
    }

    private fun markVerified(id: ModelId) {
        verified[id.ordinal] = true
        mutableState.update { it.copy(installed = it.installed + id) }
    }

    private suspend fun install(id: ModelId, input: InputStream, reportProgress: Boolean) {
        Files.createDirectories(directory.toPath())
        // A stable staging path also recovers from a process killed during the previous write.
        val temp = File(directory, "${id.fileName}.tmp")
        try {
            temp.outputStream().use { out ->
                if (!checkStream(id, input, out, reportProgress)) throw IOException("Invalid model checksum or size")
                out.fd.sync()
            }
            currentCoroutineContext().ensureActive()
            Files.move(temp.toPath(), File(directory, id.fileName).toPath(), ATOMIC_MOVE, REPLACE_EXISTING)
            markVerified(id)
        } finally {
            temp.delete()
        }
    }

    private suspend fun checkStream(
        id: ModelId,
        input: InputStream,
        output: OutputStream?,
        reportProgress: Boolean,
    ): Boolean {
        val expected = fingerprints.getValue(id)
        val digest = MessageDigest.getInstance("SHA-256")
        val buffer = ByteArray(128 * 1024)
        val jobContext = currentCoroutineContext()
        var total = 0L
        while (true) {
            jobContext.ensureActive()
            val count = input.read(buffer)
            if (count < 0) break
            total += count
            if (total > expected.size) return false
            digest.update(buffer, 0, count)
            output?.write(buffer, 0, count)
            if (reportProgress) {
                mutableState.update { it.copy(download = DownloadState.Running(total.toFloat() / expected.size)) }
            }
        }
        return total == expected.size && digest.digest().contentEquals(expected.sha256)
    }
}
