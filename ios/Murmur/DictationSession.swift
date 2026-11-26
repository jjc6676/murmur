import AVFoundation
import Combine
import MurmurCore
import UIKit

@MainActor
final class DictationSession: ObservableObject {
    let store: MurmurStore
    private(set) var state = SessionState()
    @Published private(set) var preparing = false
    @Published private(set) var historyRevision = 0
    private let audio = AVAudioSession.sharedInstance()
    private var engine: AVAudioEngine?
    private var capture: MicrophoneCapture?
    private var model: WhisperContext?
    private var inputUID: String?
    private var ipcTokens: [AnyObject] = []
    private var audioTokens: [NSObjectProtocol] = []
    private var expiry: Timer?
    private var meter: Timer?
    private var job: Task<Void, Never>?
    private var decoding: InferenceCancellation?
    private var generation = 0

    init(store: MurmurStore) {
        self.store = store
        observeCommand(MurmurIPC.startCmd) { $0.beginRecording() }
        observeCommand(MurmurIPC.stopCmd) { $0.finishRecording() }
        observeCommand(MurmurIPC.cancelCmd) { $0.cancelRecording() }
        observeAudio()
        publish() // Never advertise a session left behind by a terminated process.
    }

    deinit {
        for token in audioTokens { NotificationCenter.default.removeObserver(token) }
    }

    private func observeCommand(_ name: String, _ action: @escaping @MainActor (DictationSession) -> Void) {
        ipcTokens.append(MurmurIPC.observe(name) { [weak self] in
            DispatchQueue.main.async {
                guard let self, self.state.sessionActive else { return }
                if let deadline = self.state.sessionExpiresAt, deadline <= Date() { self.expire(); return }
                action(self)
            }
        })
    }

    private func observeAudio() {
        let center = NotificationCenter.default
        audioTokens.append(center.addObserver(forName: AVAudioSession.interruptionNotification, object: audio, queue: .main) { [weak self] note in
            guard let raw = note.userInfo?[AVAudioSessionInterruptionTypeKey] as? UInt,
                  raw == AVAudioSession.InterruptionType.began.rawValue else { return }
            MainActor.assumeIsolated { self?.audioStopped("The microphone was interrupted. Start a new session when you’re ready.") }
        })
        audioTokens.append(center.addObserver(forName: AVAudioSession.routeChangeNotification, object: audio, queue: .main) { [weak self] _ in
            MainActor.assumeIsolated {
                guard let self, self.engine != nil, self.audio.currentRoute.inputs.first?.uid != self.inputUID else { return }
                self.audioStopped("Your microphone changed. Start a new session to use the new input.")
            }
        })
        audioTokens.append(center.addObserver(forName: .AVAudioEngineConfigurationChange, object: nil, queue: .main) { [weak self] note in
            MainActor.assumeIsolated {
                guard let self, let engine = self.engine, note.object as? AVAudioEngine === engine, !engine.isRunning else { return }
                self.audioStopped("The audio configuration changed. Start a new session to reconnect.")
            }
        })
        audioTokens.append(center.addObserver(forName: AVAudioSession.mediaServicesWereResetNotification, object: audio, queue: .main) { [weak self] _ in
            MainActor.assumeIsolated { self?.audioStopped("iOS restarted its audio service. Start a new session to reconnect.") }
        })
    }

    static func microphonePermission() async -> Bool {
        await withCheckedContinuation { continuation in
            AVAudioApplication.requestRecordPermission { granted in continuation.resume(returning: granted) }
        }
    }

    func start() {
        if state.sessionActive { renew(); publish(); return }
        guard !preparing else { return }
        preparing = true
        generation += 1
        let ticket = generation
        state = SessionState(message: "Preparing your microphone and English speech model…")
        guard publish() else { return }
        job = Task {
            do {
                let allowed = await Self.microphonePermission()
                guard generation == ticket else { return }
                guard allowed else { throw DictationError("Microphone access is off. Allow Murmur to use the microphone in Settings.") }
                try audio.setCategory(.playAndRecord, mode: .measurement, options: [.mixWithOthers, .allowBluetooth])
                try audio.setActive(true)
                guard audio.isInputAvailable, !audio.currentRoute.inputs.isEmpty else {
                    throw DictationError("No microphone is available. Connect an input and try again.")
                }
                let engine = AVAudioEngine()
                let input = engine.inputNode
                let format = input.outputFormat(forBus: 0)
                let capture = try MicrophoneCapture(input: format)
                self.engine = engine
                self.capture = capture
                inputUID = audio.currentRoute.inputs.first?.uid
                capture.install(on: input, format: format)
                engine.prepare()
                try engine.start()
                let model = WhisperContext()
                self.model = model
                try await model.preload()
                guard generation == ticket else { return }
                preparing = false
                state = SessionState(sessionActive: true)
                renew()
                publish()
                job = nil
            } catch {
                guard generation == ticket else { return }
                stop(message: error.localizedDescription, failed: true)
            }
        }
    }

    private func renew() {
        let seconds = TimeInterval(max(1, store.sessionMinutes)) * 60
        state.sessionExpiresAt = Date().addingTimeInterval(seconds)
        expiry?.invalidate()
        expiry = Timer.scheduledTimer(withTimeInterval: seconds, repeats: false) { [weak self] _ in
            MainActor.assumeIsolated { self?.expire() }
        }
    }

    func historyDidChange() { historyRevision += 1 }

    func renewIfActive() {
        if state.sessionActive { renew(); publish() }
    }

    func checkDeadline() {
        if let deadline = state.sessionExpiresAt, deadline <= Date() { expire() }
    }

    private func expire() { stop(message: "Your session ended when its timer ran out.") }

    private func audioStopped(_ reason: String) {
        if preparing || state.sessionActive { stop(message: reason, failed: true) }
    }

    func stop(message: String = "Session stopped. Your microphone is off.", failed: Bool = false) {
        invalidateWork()
        expiry?.invalidate(); expiry = nil
        engine?.stop()
        engine?.inputNode.removeTap(onBus: 0)
        engine = nil
        capture = nil
        model = nil
        inputUID = nil
        try? audio.setActive(false, options: .notifyOthersOnDeactivation)
        preparing = false
        state = SessionState(phase: failed ? .error : .idle, message: message)
        publish()
    }

    private func beginRecording() {
        guard let capture, state.phase != .recording, state.phase != .transcribing else { return }
        capture.begin()
        state = SessionState(sessionActive: true, phase: .recording)
        renew()
        guard publish() else { return }
        let timer = Timer(timeInterval: 1.0 / 15, repeats: true) { [weak self] _ in
            MainActor.assumeIsolated { self?.updateMeter() }
        }
        meter = timer
        RunLoop.main.add(timer, forMode: .common)
    }

    private func updateMeter() {
        guard let capture, state.phase == .recording else { return }
        let sample = capture.meter()
        if sample.failed { audioStopped("The microphone format changed. Start a new session and try again."); return }
        if sample.atLimit { finishRecording(); return }
        state.level = sample.level
        publish(refreshUI: false)
    }

    private func finishRecording() {
        guard let capture, let model, state.phase == .recording else { return }
        meter?.invalidate(); meter = nil
        let samples = capture.finish()
        let duration = samples.count * 1000 / MicrophoneCapture.rate
        renew()
        state.level = 0
        state.phase = .transcribing
        state.message = nil
        guard publish() else { return }
        let ticket = generation
        let cancellation = InferenceCancellation()
        decoding = cancellation
        job = Task {
            defer { if generation == ticket { job = nil; decoding = nil } }
            do {
                let raw = try await model.transcribe(samples, cancellation: cancellation)
                guard generation == ticket else { return }
                let dictionary = try store.rules(kind: "dictionary").map { ($0.phrase, $0.replacement) }
                let snippets = try store.rules(kind: "snippets").map { ($0.phrase, $0.replacement) }
                let result = TextPipeline.format(raw, dictionary: dictionary, snippets: snippets)
                guard !result.text.isEmpty || result.pressEnter else { throw DictationError("No speech was recognized. Try again.") }
                state.phase = .done
                state.resultText = result.text
                state.resultId = UUID().uuidString
                state.pressEnter = result.pressEnter
                if store.historyEnabled, !result.text.isEmpty {
                    do {
                        _ = try store.addDictation(text: result.text, words: result.wordCount, durationMs: duration)
                        historyDidChange()
                    } catch { state.message = "Dictation is ready, but could not be saved in History." }
                }
            } catch {
                guard generation == ticket else { return }
                state.phase = .error
                state.message = error.localizedDescription
            }
            renew()
            publish()
        }
    }

    private func invalidateWork() {
        generation += 1
        decoding?.cancel(); decoding = nil
        job?.cancel(); job = nil
        meter?.invalidate(); meter = nil
        _ = capture?.finish()
    }

    private func cancelRecording() {
        guard state.phase == .recording || state.phase == .transcribing else { return }
        invalidateWork()
        state = SessionState(sessionActive: true)
        renew()
        publish()
    }

    @discardableResult private func publish(refreshUI: Bool = true) -> Bool {
        if refreshUI { objectWillChange.send() }
        state.updatedAt = Date()
        guard SharedState.write(state) else {
            if state.sessionActive || preparing {
                stop(message: "Murmur couldn’t share session state with its keyboard. Check available storage and App Group signing.", failed: true)
            }
            return false
        }
        MurmurIPC.post(MurmurIPC.stateChanged)
        return true
    }
}
