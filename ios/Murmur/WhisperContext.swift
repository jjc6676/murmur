import Foundation
import whisper

struct DictationError: LocalizedError {
    let errorDescription: String?
    init(_ description: String) { errorDescription = description }
}

// whisper_full can run inside a background audio session, where Metal commands are disallowed.
actor WhisperContext {
    private var context: OpaquePointer?

    deinit { if let context { whisper_free(context) } }

    func preload() throws {
        guard context == nil else { return }
        guard let url = Bundle.main.url(forResource: "ggml-base.en", withExtension: "bin") else {
            throw DictationError("The English speech model is missing from this installation.")
        }
        var options = whisper_context_default_params()
        options.use_gpu = false
        guard let loaded = whisper_init_from_file_with_params(url.path, options) else {
            throw DictationError("Murmur couldn’t open the English speech model.")
        }
        context = loaded
    }

    func transcribe(_ audio: [Float], cancellation: InferenceCancellation) throws -> String {
        try Task.checkCancellation()
        guard let context, !audio.isEmpty else { throw DictationError("No audio was captured. Try again.") }
        var params = whisper_full_default_params(WHISPER_SAMPLING_GREEDY)
        params.n_threads = Int32(min(6, max(4, ProcessInfo.processInfo.activeProcessorCount - 2)))
        params.no_context = true
        params.no_timestamps = true
        params.single_segment = audio.count <= 16_000 * 15
        params.translate = false
        params.print_special = false
        params.print_progress = false
        params.print_realtime = false
        params.print_timestamps = false
        params.suppress_nst = true
        // ggml may invoke the callback on a worker thread, not the calling Swift task.
        params.abort_callback = { pointer in
            guard let pointer else { return false }
            return Unmanaged<InferenceCancellation>.fromOpaque(pointer).takeUnretainedValue().isCancelled
        }
        params.abort_callback_user_data = Unmanaged.passUnretained(cancellation).toOpaque()
        let status = withExtendedLifetime(cancellation) {
            "en".withCString { language in
                params.language = language
                return audio.withUnsafeBufferPointer {
                    whisper_full(context, params, $0.baseAddress, Int32($0.count))
                }
            }
        }
        try Task.checkCancellation()
        guard status == 0 else { throw DictationError("Speech decoding failed. Please dictate again.") }
        var text = ""
        for index in 0..<whisper_full_n_segments(context) {
            if let fragment = whisper_full_get_segment_text(context, index) { text += String(cString: fragment) }
        }
        return text
    }
}

final class InferenceCancellation: @unchecked Sendable {
    private let lock = NSLock()
    private var cancelled = false
    var isCancelled: Bool {
        lock.lock(); defer { lock.unlock() }
        return cancelled
    }
    func cancel() {
        lock.lock(); defer { lock.unlock() }
        cancelled = true
    }
}
