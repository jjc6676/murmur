import XCTest
import MurmurCore

final class SharedStateTests: XCTestCase {
    func testSnapshotAndReceiptAreIndependentAcrossPublications() throws {
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: directory) }
        XCTAssertNil(SharedState.read(directory: directory))
        XCTAssertNil(SharedState.consumedResultId(directory: directory))
        let now = Date(timeIntervalSinceReferenceDate: 900_000_000.25)
        var state = SessionState(sessionActive: true, sessionExpiresAt: now.addingTimeInterval(600), phase: .done,
                                 level: 0.25, message: "Ready", resultId: "first", resultText: "Hello, 世界.\n",
                                 pressEnter: true, updatedAt: now)
        XCTAssertTrue(SharedState.write(state, directory: directory))
        XCTAssertEqual(SharedState.read(directory: directory), state)
        XCTAssertTrue(SharedState.markConsumed(resultId: "first", directory: directory))
        XCTAssertEqual(SharedState.read(directory: directory), state)
        state.phase = .recording
        state.resultId = nil
        state.resultText = nil
        state.pressEnter = false
        XCTAssertTrue(SharedState.write(state, directory: directory))
        XCTAssertEqual(SharedState.read(directory: directory), state)
        XCTAssertEqual(SharedState.consumedResultId(directory: directory), "first")
        XCTAssertTrue(SharedState.markConsumed(resultId: "second", directory: directory))
        XCTAssertEqual(SharedState.consumedResultId(directory: directory), "second")
    }

    func testFailedPublicationDoesNotDestroyLastSnapshot() throws {
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: directory) }
        let state = SessionState()
        XCTAssertTrue(SharedState.write(state, directory: directory))
        var invalid = state
        invalid.level = .nan
        XCTAssertFalse(SharedState.write(invalid, directory: directory))
        XCTAssertEqual(SharedState.read(directory: directory), state)
    }
}
