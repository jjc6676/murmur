import Foundation

public struct SessionState: Codable, Equatable {
    public enum Phase: String, Codable { case idle, recording, transcribing, done, error }

    public var sessionActive: Bool
    public var sessionExpiresAt: Date?
    public var phase: Phase
    public var level: Float
    public var message: String?
    public var resultId: String?
    public var resultText: String?
    public var pressEnter: Bool
    public var updatedAt: Date

    public init(sessionActive: Bool = false, sessionExpiresAt: Date? = nil, phase: Phase = .idle,
                level: Float = 0, message: String? = nil, resultId: String? = nil,
                resultText: String? = nil, pressEnter: Bool = false, updatedAt: Date = Date()) {
        self.sessionActive = sessionActive
        self.sessionExpiresAt = sessionExpiresAt
        self.phase = phase
        self.level = level
        self.message = message
        self.resultId = resultId
        self.resultText = resultText
        self.pressEnter = pressEnter
        self.updatedAt = updatedAt
    }
}

/// Each file has one writer: the app publishes snapshots, the keyboard publishes
/// receipts. Atomic replacement keeps the other process from reading partial JSON.
public final class SharedState {
    private init() {}
    private static let snapshot = "session-state.json"
    private static let receipt = "consumed-result.txt"

    static var container: URL? {
        FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: MurmurIPC.appGroup)
    }

    public static func read() -> SessionState? {
        container.flatMap { read(directory: $0) }
    }

    public static func read(directory: URL) -> SessionState? {
        guard let data = try? Data(contentsOf: directory.appendingPathComponent(snapshot)) else { return nil }
        return try? JSONDecoder().decode(SessionState.self, from: data)
    }

    /// Publish before posting `stateChanged`. False means the reader cannot see this update.
    @discardableResult public static func write(_ state: SessionState) -> Bool {
        guard let container else { return false }
        return write(state, directory: container)
    }

    @discardableResult public static func write(_ state: SessionState, directory: URL) -> Bool {
        do {
            try JSONEncoder().encode(state).write(to: directory.appendingPathComponent(snapshot), options: .atomic)
            return true
        } catch { return false }
    }

    @discardableResult public static func markConsumed(resultId: String) -> Bool {
        guard let container else { return false }
        return markConsumed(resultId: resultId, directory: container)
    }

    @discardableResult public static func markConsumed(resultId: String, directory: URL) -> Bool {
        do {
            try resultId.write(to: directory.appendingPathComponent(receipt), atomically: true, encoding: .utf8)
            return true
        } catch { return false }
    }

    public static func consumedResultId() -> String? {
        container.flatMap { consumedResultId(directory: $0) }
    }

    public static func consumedResultId(directory: URL) -> String? {
        try? String(contentsOf: directory.appendingPathComponent(receipt), encoding: .utf8)
    }
}
