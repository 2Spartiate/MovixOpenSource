import Foundation
import React
import UIKit

@objc(MediaProxy)
final class MediaProxyModule: NSObject {
  private let server = MediaProxyServer.shared

  @objc static func requiresMainQueueSetup() -> Bool { false }

  @objc
  func open(
    _ url: String,
    method: String,
    headers: [String: String],
    resolve: @escaping RCTPromiseResolveBlock,
    reject: @escaping RCTPromiseRejectBlock
  ) {
    Task {
      do {
        let normalizedMethod = method.uppercased()
        guard normalizedMethod == "GET" || normalizedMethod == "HEAD",
              headers.count <= 32,
              headers.allSatisfy({ name, value in
                !name.isEmpty
                  && name.utf8.count <= 128
                  && value.utf8.count <= 8_192
                  && !name.contains("\r")
                  && !name.contains("\n")
                  && !value.contains("\r")
                  && !value.contains("\n")
              }) else {
          reject("MEDIA_PROXY_OPEN_FAILED", "Local media proxy unavailable", nil)
          return
        }

        let upstream = try MediaProxyPolicy.validatePublicHTTPSURLSyntax(url)
        let target = MediaProxyTarget(
          upstreamURL: upstream,
          method: normalizedMethod,
          headers: MediaProxyPolicy.sanitizeRequestHeaders(headers)
        )
        let localURL = try await server.open(target: target)
        resolve(localURL.absoluteString)
      } catch {
        reject("MEDIA_PROXY_OPEN_FAILED", "Local media proxy unavailable", nil)
      }
    }
  }

  @objc
  func resolveForCast(
    _ localURL: String,
    resolve: @escaping RCTPromiseResolveBlock,
    reject: @escaping RCTPromiseRejectBlock
  ) {
    Task {
      guard let url = URL(string: localURL),
            let target = await server.resolveForCast(url) else {
        reject(
          "MEDIA_PROXY_CAST_RESOLVE_FAILED",
          "Local media source unavailable",
          nil
        )
        return
      }
      let payload: [String: Any] = [
        "url": target.upstreamURL.absoluteString,
        "headers": target.headers,
        "protocolVersion": 1,
      ]
      resolve(payload)
    }
  }

  // MARK: - Journal réseau (diagnostic)
  // La requête média part du natif : sans ces méthodes, ni l'utilisateur ni un
  // inspecteur réseau ne voient les en-têtes réellement émis, et un 403
  // d'hébergeur reste indébogable. Tout est en mémoire, éteint par défaut.
  // Parité avec MediaProxyModule.kt.

  @objc
  func setJournalEnabled(
    _ enabled: Bool,
    resolve: @escaping RCTPromiseResolveBlock,
    reject: @escaping RCTPromiseRejectBlock
  ) {
    MediaProxyJournal.setEnabled(enabled)
    resolve(enabled)
  }

  @objc
  func getJournal(
    _ resolve: @escaping RCTPromiseResolveBlock,
    reject: @escaping RCTPromiseRejectBlock
  ) {
    resolve(MediaProxyJournal.snapshot())
  }

  @objc
  func clearJournal(
    _ resolve: @escaping RCTPromiseResolveBlock,
    reject: @escaping RCTPromiseRejectBlock
  ) {
    MediaProxyJournal.clear()
    resolve(true)
  }

  @objc
  func copyDiagnosticText(
    _ text: String,
    resolve: @escaping RCTPromiseResolveBlock,
    reject: @escaping RCTPromiseRejectBlock
  ) {
    guard text.utf8.count <= 256_000 else {
      reject("DIAGNOSTICS_COPY_FAILED", "Journal trop volumineux pour la copie", nil)
      return
    }
    DispatchQueue.main.async {
      UIPasteboard.general.string = text
      resolve(true)
    }
  }

  @objc
  func shareDiagnosticText(
    _ text: String,
    resolve: @escaping RCTPromiseResolveBlock,
    reject: @escaping RCTPromiseRejectBlock
  ) {
    DispatchQueue.global(qos: .utility).async {
      do {
        guard let data = text.data(using: .utf8), data.count <= 8 * 1024 * 1024 else {
          reject("DIAGNOSTICS_EXPORT_FAILED", "Journal trop volumineux", nil)
          return
        }
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent("movix-diagnostics", isDirectory: true)
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        let oldFiles = (try? FileManager.default.contentsOfDirectory(at: directory, includingPropertiesForKeys: [.contentModificationDateKey])) ?? []
        for old in oldFiles {
          if let date = try? old.resourceValues(forKeys: [.contentModificationDateKey]).contentModificationDate,
             date < Date().addingTimeInterval(-86400) {
            try? FileManager.default.removeItem(at: old)
          }
        }
        let file = directory.appendingPathComponent("movix-diagnostic-\(UUID().uuidString).txt")
        try data.write(to: file, options: .atomic)
        DispatchQueue.main.async {
          // Les paramètres et le journal sont des modales RN : présenter depuis
          // le contrôleur visible, et ancrer aussi la feuille sur iPad.
          guard let presenter = RCTPresentedViewController(), presenter.viewIfLoaded?.window != nil,
                !(presenter is UIActivityViewController) else {
            try? FileManager.default.removeItem(at: file)
            reject("DIAGNOSTICS_SHARE_FAILED", "Écran de partage indisponible", nil)
            return
          }
          let sheet = UIActivityViewController(activityItems: [file], applicationActivities: nil)
          if let popover = sheet.popoverPresentationController {
            popover.sourceView = presenter.view
            popover.sourceRect = CGRect(x: presenter.view.bounds.midX, y: presenter.view.bounds.midY, width: 1, height: 1)
            popover.permittedArrowDirections = []
          }
          sheet.completionWithItemsHandler = { _, completed, _, error in
            try? FileManager.default.removeItem(at: file)
            if error != nil {
              reject("DIAGNOSTICS_SHARE_FAILED", "Partage impossible", nil)
            } else {
              resolve(completed)
            }
          }
          presenter.present(sheet, animated: true)
        }
      } catch {
        reject("DIAGNOSTICS_EXPORT_FAILED", "Création du fichier impossible", nil)
      }
    }
  }

  @objc
  func recordJournalEntry(
    _ phase: String,
    method: String,
    url: String,
    headers: [String: String],
    statusCode: NSNumber,
    error: String?,
    resolve: @escaping RCTPromiseResolveBlock,
    reject: @escaping RCTPromiseRejectBlock
  ) {
    let code = statusCode.intValue
    MediaProxyJournal.record(
      phase: phase,
      method: method,
      url: url,
      requestHeaders: MediaProxyPolicy.sanitizeRequestHeaders(headers),
      statusCode: code > 0 ? code : nil,
      error: error
    )
    resolve(true)
  }
}
