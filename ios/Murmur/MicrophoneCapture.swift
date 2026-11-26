import Accelerate
import AVFoundation

/// One instance per live input route. Idle taps discard the buffer without conversion or retention.
final class MicrophoneCapture: @unchecked Sendable {
    static let rate = 16_000
    static let sampleLimit = rate * 60 * 5
    private let lock = NSLock()
    private let converter: AVAudioConverter
    private let output: AVAudioFormat
    private var converted: AVAudioPCMBuffer?
    private var samples: [Float] = []
    private var recording = false
    private var peak: Float = 0
    private var failed = false

    init(input: AVAudioFormat) throws {
        guard input.sampleRate > 0, input.channelCount > 0,
              let mono = AVAudioFormat(commonFormat: .pcmFormatFloat32, sampleRate: Double(Self.rate), channels: 1, interleaved: false),
              let converter = AVAudioConverter(from: input, to: mono) else {
            throw DictationError("This microphone is unavailable. Check the audio input and try again.")
        }
        converter.primeMethod = .none
        output = mono
        self.converter = converter
    }

    func install(on input: AVAudioInputNode, format: AVAudioFormat) {
        input.installTap(onBus: 0, bufferSize: 1_024, format: format) { [self] buffer, _ in
            append(buffer)
        }
    }

    func begin() {
        lock.lock(); defer { lock.unlock() }
        converter.reset()
        samples.removeAll(keepingCapacity: true)
        samples.reserveCapacity(Self.rate * 3)
        peak = 0
        failed = false
        recording = true
    }

    func finish() -> [Float] {
        lock.lock(); defer { lock.unlock() }
        recording = false
        peak = 0
        converted = nil
        let result = samples
        samples = []
        return result
    }

    func meter() -> (level: Float, atLimit: Bool, failed: Bool) {
        lock.lock(); defer { lock.unlock() }
        let value = peak
        peak = 0
        return (value, samples.count >= Self.sampleLimit, failed)
    }

    func append(_ buffer: AVAudioPCMBuffer) {
        lock.lock(); defer { lock.unlock() }
        guard recording, !failed, samples.count < Self.sampleLimit else { return }
        let capacity = AVAudioFrameCount(ceil(Double(buffer.frameLength) * output.sampleRate / buffer.format.sampleRate)) + 16
        if converted == nil || converted!.frameCapacity < capacity {
            converted = AVAudioPCMBuffer(pcmFormat: output, frameCapacity: capacity)
        }
        guard let converted else { failed = true; return }
        converted.frameLength = 0
        var supplied = false
        var error: NSError?
        let status = converter.convert(to: converted, error: &error) { _, inputStatus in
            if supplied { inputStatus.pointee = .noDataNow; return nil }
            supplied = true
            inputStatus.pointee = .haveData
            return buffer
        }
        guard status != .error, let values = converted.floatChannelData?[0] else { failed = true; return }
        let count = min(Int(converted.frameLength), Self.sampleLimit - samples.count)
        guard count > 0 else { return }
        samples.append(contentsOf: UnsafeBufferPointer(start: values, count: count))
        var blockPeak: Float = 0
        vDSP_maxmgv(values, 1, &blockPeak, vDSP_Length(count))
        peak = max(peak, min(1, blockPeak))
    }
}
