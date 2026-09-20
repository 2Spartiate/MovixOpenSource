import Foundation
import XCTest
@testable import Movix

final class MediaProxyJournalTests: XCTestCase {
  override func tearDown() {
    MediaProxyJournal.setEnabled(false)
    super.tearDown()
  }

  func testClearRejectsAnEntryWhoseFormattingStartedBeforeClear() throws {
    MediaProxyJournal.setEnabled(true)
    let previousGeneration = try XCTUnwrap(MediaProxyJournal.captureGeneration())
    // Interleaving déterministe des deux sections critiques de record().
    MediaProxyJournal.clear()
    XCTAssertNil(MediaProxyJournal.append(body: "ancienne", capturedAt: Date(), generation: previousGeneration))
    XCTAssertTrue(MediaProxyJournal.snapshot().isEmpty)
    let currentGeneration = try XCTUnwrap(MediaProxyJournal.captureGeneration())
    XCTAssertNotNil(MediaProxyJournal.append(body: "nouvelle", capturedAt: Date(), generation: currentGeneration))
    XCTAssertEqual(MediaProxyJournal.snapshot().count, 1)
  }

  func testDisableAndReenableCannotReviveAnEntryFromThePreviousCapture() throws {
    MediaProxyJournal.setEnabled(true)
    let previousGeneration = try XCTUnwrap(MediaProxyJournal.captureGeneration())
    MediaProxyJournal.setEnabled(false)
    XCTAssertNil(MediaProxyJournal.captureGeneration())
    MediaProxyJournal.setEnabled(true)
    XCTAssertNil(MediaProxyJournal.append(body: "ancienne", capturedAt: Date(), generation: previousGeneration))
    XCTAssertTrue(MediaProxyJournal.snapshot().isEmpty)
    MediaProxyJournal.record(phase: "nouvelle", method: "GET", url: "https://example.com", requestHeaders: [:])
    XCTAssertEqual(MediaProxyJournal.snapshot().count, 1)
  }
}
