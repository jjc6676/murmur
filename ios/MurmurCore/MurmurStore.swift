import Foundation
import SQLite3

public final class MurmurStore {
    public struct Dictation: Identifiable, Equatable {
        public let id: Int64
        public let text: String
        public let words: Int
        public let durationMs: Int
        public let createdAt: Date
    }

    public struct Rule: Identifiable, Equatable {
        public let id: Int64
        public let kind: String
        public let phrase: String
        public let replacement: String
    }

    public struct Stats: Equatable {
        public let totalWords: Int
        public let averageWpm: Int
        public let streakDays: Int
    }

    public enum StoreError: LocalizedError {
        case missingAppGroup, invalidPage, invalidRuleKind, invalidDictation, unsupportedSchema(Int)
        case sqlite(code: Int32, message: String)
        public var errorDescription: String? {
            switch self {
            case .missingAppGroup: return "The Murmur shared container is unavailable."
            case .invalidPage: return "Page size and offset must be nonnegative."
            case .invalidRuleKind: return "Unknown Murmur rule kind."
            case .invalidDictation: return "Word count and duration must be nonnegative."
            case let .unsupportedSchema(version): return "Unsupported Murmur database version: \(version)."
            case let .sqlite(code, message): return "Murmur database error \(code): \(message)"
            }
        }
    }

    private let queue = DispatchQueue(label: "com.jjc6676.murmur.store")
    private let db: Connection
    private let defaults: UserDefaults

    public convenience init() throws {
        guard let directory = SharedState.container else { throw StoreError.missingAppGroup }
        try self.init(directory: directory)
    }

    public convenience init(directory: URL) throws {
        guard let defaults = UserDefaults(suiteName: MurmurIPC.appGroup) else { throw StoreError.missingAppGroup }
        try self.init(directory: directory, defaults: defaults)
    }

    public init(directory: URL, defaults: UserDefaults) throws {
        self.defaults = defaults
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        self.db = try Connection(directory.appendingPathComponent("murmur.sqlite3"))
        try migrate()
    }

    public var historyEnabled: Bool {
        get { (defaults.object(forKey: "history_enabled") as? NSNumber)?.boolValue ?? true }
        set { defaults.set(newValue, forKey: "history_enabled") }
    }
    public var sessionMinutes: Int {
        get { max(1, (defaults.object(forKey: "session_minutes") as? NSNumber)?.intValue ?? 10) }
        set { defaults.set(max(1, newValue), forKey: "session_minutes") }
    }
    public var haptics: Bool {
        get { (defaults.object(forKey: "haptics") as? NSNumber)?.boolValue ?? true }
        set { defaults.set(newValue, forKey: "haptics") }
    }

    private func migrate() throws {
        // BEGIN IMMEDIATE locks out another app/extension opener before we read
        // user_version. Both schema and version commit (or roll back) together.
        try db.exec("BEGIN IMMEDIATE")
        do {
            let version = try db.statement("PRAGMA user_version") { stmt -> Int in
                _ = try db.stepRow(stmt)
                return Int(sqlite3_column_int(stmt, 0))
            }
            switch version {
            case 0:
                try db.exec("""
                    CREATE TABLE dictations (
                        id INTEGER PRIMARY KEY, text TEXT NOT NULL,
                        words INTEGER NOT NULL CHECK(words >= 0),
                        duration_ms INTEGER NOT NULL CHECK(duration_ms >= 0), created_at REAL NOT NULL
                    );
                    CREATE INDEX dictations_recent ON dictations(created_at DESC, id DESC);
                    CREATE TABLE rules (
                        id INTEGER PRIMARY KEY,
                        kind TEXT NOT NULL CHECK(kind IN ('dictionary','snippets')),
                        phrase TEXT NOT NULL COLLATE NOCASE, replacement TEXT NOT NULL,
                        UNIQUE(kind, phrase)
                    );
                    PRAGMA user_version = 1;
                    """)
            case 1: break
            default: throw StoreError.unsupportedSchema(version)
            }
            try db.exec("COMMIT")
        } catch {
            try? db.exec("ROLLBACK")
            throw error
        }
    }

    /// The recorder checks `historyEnabled` before requesting a history entry.
    @discardableResult public func addDictation(text: String, words: Int, durationMs: Int, at date: Date = Date()) throws -> Int64 {
        guard words >= 0, durationMs >= 0 else { throw StoreError.invalidDictation }
        return try queue.sync {
            try db.statement("INSERT INTO dictations(text,words,duration_ms,created_at) VALUES(?,?,?,?)") { stmt in
                try db.bind(text, at: 1, to: stmt)
                try db.check(sqlite3_bind_int64(stmt, 2, Int64(words)))
                try db.check(sqlite3_bind_int64(stmt, 3, Int64(durationMs)))
                try db.check(sqlite3_bind_double(stmt, 4, date.timeIntervalSince1970))
                try db.finish(stmt)
            }
            return sqlite3_last_insert_rowid(db.handle)
        }
    }

    /// Search uses literal substring matching; user input cannot inject SQL or LIKE wildcards.
    public func history(query: String = "", limit: Int = 50, offset: Int = 0) throws -> [Dictation] {
        guard limit >= 0, offset >= 0 else { throw StoreError.invalidPage }
        return try queue.sync {
            let filter = query.isEmpty ? "" : " WHERE instr(lower(text),lower(?3)) > 0"
            let sql = "SELECT id,text,words,duration_ms,created_at FROM dictations" + filter +
                " ORDER BY created_at DESC, id DESC LIMIT ?1 OFFSET ?2"
            return try db.statement(sql) { stmt in
                try db.check(sqlite3_bind_int64(stmt, 1, Int64(limit)))
                try db.check(sqlite3_bind_int64(stmt, 2, Int64(offset)))
                if !query.isEmpty { try db.bind(query, at: 3, to: stmt) }
                var rows: [Dictation] = []
                while try db.stepRow(stmt) {
                    rows.append(Dictation(id: sqlite3_column_int64(stmt, 0), text: Connection.text(stmt, 1),
                                          words: Int(sqlite3_column_int64(stmt, 2)), durationMs: Int(sqlite3_column_int64(stmt, 3)),
                                          createdAt: Date(timeIntervalSince1970: sqlite3_column_double(stmt, 4))))
                }
                return rows
            }
        }
    }

    public func deleteDictation(id: Int64) throws { try delete(id, sql: "DELETE FROM dictations WHERE id=?") }

    /// Clears dictation history only, leaving personal rules and settings intact.
    public func deleteAll() throws { try queue.sync { try db.exec("DELETE FROM dictations") } }

    /// Count consecutive local calendar days starting today, not consecutive 24-hour windows.
    public func stats(at date: Date = Date()) throws -> Stats {
        try queue.sync {
            let sql = """
                SELECT CAST(julianday(date(?1,'unixepoch','localtime')) -
                            julianday(date(created_at,'unixepoch','localtime')) AS INTEGER) AS days_ago,
                       SUM(words), TOTAL(duration_ms)
                FROM dictations GROUP BY days_ago ORDER BY days_ago ASC
                """
            return try db.statement(sql) { stmt in
                try db.check(sqlite3_bind_double(stmt, 1, date.timeIntervalSince1970))
                var words = 0, streak = 0
                var duration = 0.0
                while try db.stepRow(stmt) {
                    words += Int(sqlite3_column_int64(stmt, 1))
                    duration += sqlite3_column_double(stmt, 2)
                    if Int(sqlite3_column_int64(stmt, 0)) == streak { streak += 1 }
                }
                let rate = duration > 0 ? Double(words) * 60_000 / duration : 0
                return Stats(totalWords: words, averageWpm: rate >= Double(Int.max) ? Int.max : Int(rate), streakDays: streak)
            }
        }
    }

    private func checkKind(_ kind: String) throws {
        guard kind == "dictionary" || kind == "snippets" else { throw StoreError.invalidRuleKind }
    }

    public func rules(kind: String) throws -> [Rule] {
        try checkKind(kind)
        return try queue.sync {
            try db.statement("SELECT id,phrase,replacement FROM rules WHERE kind=? ORDER BY phrase") { stmt in
                try db.bind(kind, at: 1, to: stmt)
                var rows: [Rule] = []
                while try db.stepRow(stmt) {
                    rows.append(Rule(id: sqlite3_column_int64(stmt, 0), kind: kind, phrase: Connection.text(stmt, 1),
                                     replacement: Connection.text(stmt, 2)))
                }
                return rows
            }
        }
    }

    @discardableResult public func addRule(kind: String, phrase: String, replacement: String) throws -> Int64 {
        try checkKind(kind)
        return try queue.sync {
            let sql = """
                INSERT INTO rules(kind,phrase,replacement) VALUES(?,?,?) ON CONFLICT(kind,phrase)
                DO UPDATE SET phrase=excluded.phrase, replacement=excluded.replacement RETURNING id
                """
            return try db.statement(sql) { stmt in
                try db.bind(kind, at: 1, to: stmt)
                try db.bind(phrase, at: 2, to: stmt)
                try db.bind(replacement, at: 3, to: stmt)
                guard try db.stepRow(stmt) else { throw StoreError.sqlite(code: SQLITE_ERROR, message: "Missing rule ID") }
                let id = sqlite3_column_int64(stmt, 0)
                try db.finish(stmt)
                return id
            }
        }
    }

    public func deleteRule(id: Int64) throws { try delete(id, sql: "DELETE FROM rules WHERE id=?") }

    private func delete(_ id: Int64, sql: String) throws {
        try queue.sync {
            try db.statement(sql) { stmt in
                try db.check(sqlite3_bind_int64(stmt, 1, id))
                try db.finish(stmt)
            }
        }
    }
}

/// Single connection owned by MurmurStore's serial queue. Statements never escape their scope.
private final class Connection {
    let handle: OpaquePointer
    private static let transient = unsafeBitCast(-1, to: sqlite3_destructor_type.self)

    init(_ file: URL) throws {
        var opened: OpaquePointer?
        let code = sqlite3_open_v2(file.path, &opened, SQLITE_OPEN_READWRITE | SQLITE_OPEN_CREATE, nil)
        guard code == SQLITE_OK, let opened else {
            let message = opened.map { String(cString: sqlite3_errmsg($0)) } ?? "Cannot open database"
            sqlite3_close(opened)
            throw MurmurStore.StoreError.sqlite(code: code, message: message)
        }
        self.handle = opened
        try check(sqlite3_busy_timeout(opened, 3000))
        try exec("PRAGMA journal_mode=WAL")
    }

    deinit { sqlite3_close(handle) }

    func check(_ code: Int32, expected: Int32 = SQLITE_OK) throws {
        guard code == expected else {
            throw MurmurStore.StoreError.sqlite(code: code, message: String(cString: sqlite3_errmsg(handle)))
        }
    }
    func exec(_ sql: String) throws { try check(sqlite3_exec(handle, sql, nil, nil, nil)) }
    func statement<T>(_ sql: String, _ body: (OpaquePointer) throws -> T) throws -> T {
        var stmt: OpaquePointer?
        try check(sqlite3_prepare_v2(handle, sql, -1, &stmt, nil))
        guard let stmt else { throw MurmurStore.StoreError.sqlite(code: SQLITE_ERROR, message: "Empty statement") }
        defer { sqlite3_finalize(stmt) }
        return try body(stmt)
    }
    func stepRow(_ stmt: OpaquePointer) throws -> Bool {
        let code = sqlite3_step(stmt)
        if code == SQLITE_ROW { return true }
        try check(code, expected: SQLITE_DONE)
        return false
    }
    func finish(_ stmt: OpaquePointer) throws { try check(sqlite3_step(stmt), expected: SQLITE_DONE) }
    func bind(_ value: String, at index: Int32, to stmt: OpaquePointer) throws {
        guard let bytes = Int32(exactly: value.utf8.count) else { throw MurmurStore.StoreError.sqlite(code: SQLITE_TOOBIG, message: "Text too long") }
        try check(value.withCString { sqlite3_bind_text(stmt, index, $0, bytes, Self.transient) })
    }
    static func text(_ stmt: OpaquePointer, _ index: Int32) -> String {
        guard let bytes = sqlite3_column_text(stmt, index) else { return "" }
        return String(decoding: UnsafeBufferPointer(start: bytes, count: Int(sqlite3_column_bytes(stmt, index))), as: UTF8.self)
    }
}
