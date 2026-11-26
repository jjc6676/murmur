import XCTest
import SQLite3
import MurmurCore

final class MurmurStoreTests: XCTestCase {
    private var directory: URL!
    private var suite: String!
    private var defaults: UserDefaults!
    private var store: MurmurStore!

    override func setUpWithError() throws {
        directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        suite = "MurmurStoreTests." + directory.lastPathComponent
        defaults = try XCTUnwrap(UserDefaults(suiteName: suite))
        store = try MurmurStore(directory: directory, defaults: defaults)
    }

    override func tearDownWithError() throws {
        store = nil
        defaults?.removePersistentDomain(forName: suite)
        if FileManager.default.fileExists(atPath: directory.path) { try FileManager.default.removeItem(at: directory) }
    }

    func testHistoryCRUDSearchPaginationAndReopen() throws {
        let date = Date(timeIntervalSince1970: 12345)
        let first = try store.addDictation(text: "save 100%_today", words: 3, durationMs: 2500, at: date)
        let second = try store.addDictation(text: "save 100X tomorrow", words: 4, durationMs: 3000, at: date)
        let reader = try MurmurStore(directory: directory)
        let rows = try reader.history()
        XCTAssertEqual(rows.map(\.id), [second, first])
        XCTAssertEqual(rows.last?.text, "save 100%_today")
        XCTAssertEqual(rows.last?.words, 3)
        XCTAssertEqual(rows.last?.durationMs, 2500)
        XCTAssertEqual(rows.last?.createdAt, date)
        XCTAssertEqual(try reader.history(query: "100%_T").map(\.id), [first])
        XCTAssertEqual(try reader.history(limit: 1, offset: 1).map(\.id), [first])
        XCTAssertEqual(try reader.history(query: "'; DROP TABLE dictations;--"), [])
        XCTAssertThrowsError(try reader.history(offset: -1))
        try reader.deleteDictation(id: second)
        XCTAssertEqual(try store.history().map(\.id), [first])
        try store.deleteAll()
        XCTAssertEqual(try reader.history(), [])
    }

    func testRuleUpsertIsolationAndDeletion() throws {
        let dict = try store.addRule(kind: "dictionary", phrase: "Jason", replacement: "Jason A.")
        let snippet = try store.addRule(kind: "snippets", phrase: "Jason", replacement: "🌱\n\u{0}end")
        XCTAssertEqual(try store.addRule(kind: "dictionary", phrase: "jason", replacement: "Jayson"), dict)
        try store.deleteAll()
        let rows = try store.rules(kind: "dictionary")
        XCTAssertEqual(rows.map(\.phrase), ["jason"])
        XCTAssertEqual(rows.map(\.replacement), ["Jayson"])
        XCTAssertEqual(try store.rules(kind: "snippets").first?.replacement, "🌱\n\u{0}end")
        try store.deleteRule(id: dict)
        XCTAssertEqual(try store.rules(kind: "dictionary"), [])
        XCTAssertEqual(try store.rules(kind: "snippets").map(\.id), [snippet])
        XCTAssertThrowsError(try store.rules(kind: "other"))
        XCTAssertThrowsError(try store.addRule(kind: "other", phrase: "a", replacement: "b"))
    }

    func testWeightedWpmAndLocalCalendarStreak() throws {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = .current
        let today = try XCTUnwrap(calendar.date(from: DateComponents(year: 2025, month: 3, day: 10, hour: 0, minute: 5)))
        let yesterday = try XCTUnwrap(calendar.date(byAdding: .minute, value: -10, to: today))
        let twoDaysAgo = try XCTUnwrap(calendar.date(byAdding: .day, value: -2, to: today))
        let fourDaysAgo = try XCTUnwrap(calendar.date(byAdding: .day, value: -4, to: today))
        XCTAssertEqual(try store.stats(at: today).totalWords, 0)
        try store.addDictation(text: "old", words: 20, durationMs: 10_000, at: fourDaysAgo)
        try store.addDictation(text: "two days ago", words: 40, durationMs: 20_000, at: twoDaysAgo)
        try store.addDictation(text: "yesterday", words: 60, durationMs: 30_000, at: yesterday)
        XCTAssertEqual(try store.stats(at: today).streakDays, 0)
        let current = try store.addDictation(text: "today", words: 50, durationMs: 60_000, at: today)
        let sameDay = try store.addDictation(text: "more", words: 10, durationMs: 0, at: today)
        let stats = try store.stats(at: today)
        XCTAssertEqual(stats.totalWords, 180)
        XCTAssertEqual(stats.averageWpm, 90)
        XCTAssertEqual(stats.streakDays, 3)
        try store.deleteDictation(id: current)
        try store.deleteDictation(id: sameDay)
        XCTAssertEqual(try store.stats(at: today).streakDays, 0)
        try store.deleteAll()
        XCTAssertEqual(try store.stats().averageWpm, 0)
    }

    func testSettingsDefaultsAndPersistence() throws {
        XCTAssertTrue(store.historyEnabled)
        XCTAssertTrue(store.haptics)
        XCTAssertEqual(store.sessionMinutes, 10)
        store.historyEnabled = false
        store.haptics = false
        store.sessionMinutes = 20
        let reopened = try MurmurStore(directory: directory, defaults: defaults)
        XCTAssertFalse(reopened.historyEnabled)
        XCTAssertFalse(reopened.haptics)
        XCTAssertEqual(reopened.sessionMinutes, 20)
    }

    func testUnknownSchemaIsRejectedWithoutResettingHistory() throws {
        try store.addDictation(text: "keep", words: 1, durationMs: 0)
        store = nil
        var db: OpaquePointer?
        let path = directory.appendingPathComponent("murmur.sqlite3").path
        XCTAssertEqual(sqlite3_open(path, &db), SQLITE_OK)
        defer { sqlite3_close(db) }
        XCTAssertEqual(sqlite3_exec(db, "PRAGMA user_version=99", nil, nil, nil), SQLITE_OK)
        XCTAssertThrowsError(try MurmurStore(directory: directory)) { error in
            guard case MurmurStore.StoreError.unsupportedSchema(99) = error else {
                XCTFail("Unexpected error: \(error)"); return
            }
        }
        XCTAssertEqual(sqlite3_exec(db, "PRAGMA user_version=1", nil, nil, nil), SQLITE_OK)
        store = try MurmurStore(directory: directory)
        XCTAssertEqual(try store.history().first?.text, "keep")
    }
}
