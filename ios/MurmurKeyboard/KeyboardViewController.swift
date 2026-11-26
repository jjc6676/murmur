import MurmurCore
import UIKit

final class KeyboardViewController: UIInputViewController {
    private let panel = KeyboardPanel(frame: .zero)
    private var visible = false
    private var fullAccess = false
    private var observer: AnyObject?
    private var poll: Timer?
    private var state: SessionState?
    private var lastSample: Date?
    private var insertedID: String?
    private var notice: String?
    private lazy var preferences = UserDefaults(suiteName: MurmurIPC.appGroup)
    private let feedback = UIImpactFeedbackGenerator(style: .light)

    private enum Command { case start, stop, cancel }
    private var pending: Command?
    private var ackDeadline: TimeInterval = 0
    private var afterStart: Command?
    private var startedOnTouchDown: TimeInterval?
    private var deleteTimer: Timer?
    private var didRepeatDelete = false
    private var active: Bool {
        guard let state, state.sessionActive else { return false }
        return state.sessionExpiresAt.map { $0 > Date() } ?? true
    }

    override func viewDidLoad() {
        super.viewDidLoad()
        panel.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(panel)
        let height = view.heightAnchor.constraint(equalToConstant: 260)
        height.priority = UILayoutPriority(999)
        NSLayoutConstraint.activate([height, panel.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            panel.trailingAnchor.constraint(equalTo: view.trailingAnchor), panel.topAnchor.constraint(equalTo: view.topAnchor),
            panel.bottomAnchor.constraint(equalTo: view.bottomAnchor)])

        panel.typeText = { [weak self] text in self?.insertKey(text) }
        panel.globe.addTarget(self, action: #selector(handleInputModeList(from:with:)), for: .allTouchEvents)
        panel.returnKey.addTarget(self, action: #selector(returnPressed), for: .touchUpInside)
        panel.deleteKey.addTarget(self, action: #selector(deleteDown), for: .touchDown)
        panel.deleteKey.addTarget(self, action: #selector(deleteUp), for: .touchUpInside)
        panel.deleteKey.addTarget(self, action: #selector(stopDeleteTimer), for: [.touchCancel, .touchUpOutside, .touchDragExit])
        panel.mic.addTarget(self, action: #selector(micDown), for: .touchDown)
        panel.mic.addTarget(self, action: #selector(micUp), for: .touchUpInside)
        panel.mic.addTarget(self, action: #selector(micCancelled), for: [.touchCancel, .touchUpOutside])
        panel.finish.addTarget(self, action: #selector(finishPressed), for: .touchUpInside)
        panel.cancel.addTarget(self, action: #selector(cancelPressed), for: .touchUpInside)
    }

    override func viewWillAppear(_ animated: Bool) {
        super.viewWillAppear(animated)
        fullAccess = hasFullAccess
        updateKeys()
        panel.render(fullAccess ? .inactive : .access, message: "", holding: false)
    }

    override func viewDidAppear(_ animated: Bool) {
        super.viewDidAppear(animated)
        visible = true
        if fullAccess {
            observer = MurmurIPC.observe(MurmurIPC.stateChanged) { [weak self] in
                DispatchQueue.main.async { [weak self] in self?.refresh() }
            }
            poll = timer(every: 0.1, action: #selector(pollFired(_:)), repeats: true)
        }
        refresh()
    }

    override func viewWillDisappear(_ animated: Bool) {
        super.viewWillDisappear(animated)
        visible = false
        // A disappearing keyboard will not get the release of a held touch.
        if fullAccess && (startedOnTouchDown != nil || afterStart != nil) {
            MurmurIPC.post(afterStart == .stop ? MurmurIPC.stopCmd : MurmurIPC.cancelCmd)
        }
        startedOnTouchDown = nil
        pending = nil
        afterStart = nil
        notice = nil
        observer = nil
        poll?.invalidate()
        poll = nil
        stopDeleteTimer()
    }

    override func viewWillLayoutSubviews() {
        super.viewWillLayoutSubviews()
        let hide = !needsInputModeSwitchKey
        if panel.globe.isHidden != hide { panel.globe.isHidden = hide }
    }

    override func textDidChange(_ textInput: UITextInput?) {
        super.textDidChange(textInput)
        updateKeys()
    }

    private func updateKeys() {
        switch textDocumentProxy.keyboardAppearance ?? .default {
        case .light: overrideUserInterfaceStyle = .light
        case .dark: overrideUserInterfaceStyle = .dark
        default: overrideUserInterfaceStyle = .unspecified
        }
        let title: String
        switch textDocumentProxy.returnKeyType ?? .default {
        case .go: title = "go"
        case .google: title = "Google"
        case .join: title = "join"
        case .next: title = "next"
        case .route: title = "route"
        case .search: title = "search"
        case .send: title = "send"
        case .yahoo: title = "Yahoo!"
        case .done: title = "done"
        case .emergencyCall: title = "SOS"
        case .continue: title = "continue"
        default: title = "return"
        }
        panel.returnKey.setTitle(title, for: .normal)
        panel.returnKey.accessibilityLabel = title
    }

    @objc private func refresh() {
        guard visible else { return }
        state = fullAccess ? SharedState.read() : nil
        if let state, state.phase == .done, let id = state.resultId, insertedID != id {
            if SharedState.consumedResultId() == id { insertedID = id }
            else if state.resultText != nil || state.pressEnter {
                // Set the local guard first: insertText can synchronously call back into UIKit.
                insertedID = id
                insertResult(state.resultText ?? "", pressEnter: state.pressEnter)
                SharedState.markConsumed(resultId: id)
                tick()
            }
        }
        if pending == .start && state?.phase == .recording {
            pending = nil
            if let command = afterStart { afterStart = nil; post(command) }
        } else if (pending == .stop || pending == .cancel) && state?.phase != .recording {
            pending = nil
        }
        if pending != nil && ProcessInfo.processInfo.systemUptime >= ackDeadline {
            if let command = afterStart { MurmurIPC.post(command == .stop ? MurmurIPC.stopCmd : MurmurIPC.cancelCmd) }
            pending = nil
            afterStart = nil
            notice = "Murmur didn’t respond. Open the app to check your session."
        }
        render()
        if let state, state.phase == .recording, lastSample != state.updatedAt {
            lastSample = state.updatedAt
            panel.appendLevel(state.level)
        }
    }

    private func render() {
        let mode: KeyboardPanel.Mode
        let hint: String
        if !fullAccess { mode = .access; hint = "Allow Full Access in Settings to use voice" }
        else if !active { mode = .inactive; hint = "Tap to open Murmur and start a session" }
        else if pending == .stop || pending == .cancel || afterStart != nil {
            mode = .finishing; hint = pending == .cancel || afterStart == .cancel ? "Cancelling…" : "Finishing dictation…"
        } else if pending == .start { mode = .starting; hint = "Starting dictation…" }
        else if state?.phase == .recording { mode = .recording; hint = "Listening · Tap to finish" }
        else if state?.phase == .transcribing { mode = .transcribing; hint = "Transcribing on this iPhone…" }
        else { mode = .ready; hint = "Tap to dictate or hold to talk" }
        let error = state?.phase == .error && pending == nil ? state?.message : nil
        panel.render(mode, message: notice ?? error ?? hint, holding: startedOnTouchDown != nil)
    }

    @objc private func micDown() {
        refresh()
        guard fullAccess, active, pending == nil, state?.phase != .recording, state?.phase != .transcribing else { return }
        // Start on contact so the first syllable of a hold is not lost while measuring it.
        startedOnTouchDown = ProcessInfo.processInfo.systemUptime
        post(.start)
        tick()
        render()
    }

    @objc private func micUp() {
        if let down = startedOnTouchDown {
            startedOnTouchDown = nil
            if ProcessInfo.processInfo.systemUptime - down >= 0.3 { finishPressed() }
            else { render() }
            return
        }
        // Also handles accessibility activation, which need not deliver touchDown.
        refresh()
        if !fullAccess || !active {
            notice = nil
            tick()
            ContainingAppLink.open(startSession: fullAccess, from: self) { [weak self] success in
                guard let self, !success, self.visible else { return }
                self.notice = self.fullAccess ? "Open Murmur from your Home Screen to start a session." : "Allow Full Access in Settings to use voice. Open Murmur from your Home Screen for help."
                self.render()
            }
        } else if state?.phase == .recording || pending == .start { finishPressed() }
        else if state?.phase != .transcribing && pending == nil { post(.start); tick(); render() }
    }

    @objc private func micCancelled() {
        guard startedOnTouchDown != nil else { return }
        startedOnTouchDown = nil
        cancelPressed()
    }

    @objc private func finishPressed() { endRecording(.stop) }
    @objc private func cancelPressed() { endRecording(.cancel) }

    private func endRecording(_ command: Command) {
        if pending == .start {
            // A short hold can end before the app acknowledges start. Preserve ordering.
            afterStart = command
        } else if state?.phase == .recording && pending == nil { post(command) }
        else { return }
        tick()
        render()
    }

    private func post(_ command: Command) {
        notice = nil
        pending = command
        ackDeadline = ProcessInfo.processInfo.systemUptime + 3
        switch command {
        case .start: MurmurIPC.post(MurmurIPC.startCmd)
        case .stop: MurmurIPC.post(MurmurIPC.stopCmd)
        case .cancel: MurmurIPC.post(MurmurIPC.cancelCmd)
        }
    }

    private func insertResult(_ text: String, pressEnter: Bool) {
        if let first = text.first {
            let before = textDocumentProxy.documentContextBeforeInput?.last
            let space = before.map { !$0.isWhitespace && $0.unicodeScalars.first?.properties.generalCategory != .openPunctuation } ?? false
            textDocumentProxy.insertText(space && !first.isPunctuation && !first.isWhitespace ? " " + text : text)
        }
        if pressEnter { textDocumentProxy.insertText("\n") }
    }

    private func insertKey(_ text: String) { textDocumentProxy.insertText(text); tick() }
    @objc private func returnPressed() { insertKey("\n") }

    @objc private func pollFired(_ sender: Timer) { refresh() }

    private func timer(every interval: TimeInterval, action: Selector, repeats: Bool) -> Timer {
        let result = Timer(timeInterval: interval, target: self, selector: action, userInfo: nil, repeats: repeats)
        result.fireDate = Date(timeIntervalSinceNow: interval)
        RunLoop.main.add(result, forMode: .common)
        return result
    }

    @objc private func deleteDown() {
        stopDeleteTimer()
        didRepeatDelete = false
        deleteTimer = timer(every: 0.4, action: #selector(beginDeleteRepeat(_:)), repeats: false)
    }
    @objc private func beginDeleteRepeat(_ sender: Timer) {
        didRepeatDelete = true
        deleteOne()
        deleteTimer = timer(every: 0.08, action: #selector(repeatDelete(_:)), repeats: true)
    }
    @objc private func repeatDelete(_ sender: Timer) { deleteOne() }
    private func deleteOne() { textDocumentProxy.deleteBackward(); tick() }
    @objc private func deleteUp() {
        stopDeleteTimer()
        if !didRepeatDelete { deleteOne() }
        didRepeatDelete = false
    }
    @objc private func stopDeleteTimer() { deleteTimer?.invalidate(); deleteTimer = nil }
    private func tick() {
        if fullAccess && preferences?.object(forKey: "haptics") as? Bool == false { return }
        feedback.impactOccurred()
    }
}
