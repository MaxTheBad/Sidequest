import AVFoundation
import ExpoModulesCore

public final class QuestHatVideoCompressorModule: Module {
  private let compressionThresholdBytes: Int64 = 12 * 1024 * 1024

  public func definition() -> ModuleDefinition {
    Name("QuestHatVideoCompressor")

    AsyncFunction("compress") { (source: String) async throws -> [String: Any] in
      let sourceURL = try self.fileURL(from: source)
      let sourceSize = try self.fileSize(at: sourceURL)

      guard sourceSize > self.compressionThresholdBytes else {
        return self.result(url: sourceURL, size: sourceSize, compressed: false)
      }

      let asset = AVURLAsset(url: sourceURL)
      let preset = AVAssetExportPreset1920x1080
      guard AVAssetExportSession.exportPresets(compatibleWith: asset).contains(preset),
            let exporter = AVAssetExportSession(asset: asset, presetName: preset) else {
        return self.result(url: sourceURL, size: sourceSize, compressed: false)
      }

      let outputURL = FileManager.default.temporaryDirectory
        .appendingPathComponent("questhat-" + UUID().uuidString)
        .appendingPathExtension("mp4")
      try? FileManager.default.removeItem(at: outputURL)

      exporter.outputURL = outputURL
      exporter.outputFileType = .mp4
      exporter.shouldOptimizeForNetworkUse = true

      try await self.export(exporter)
      let outputSize = try self.fileSize(at: outputURL)

      guard outputSize < Int64(Double(sourceSize) * 0.95) else {
        try? FileManager.default.removeItem(at: outputURL)
        return self.result(url: sourceURL, size: sourceSize, compressed: false)
      }

      return self.result(url: outputURL, size: outputSize, compressed: true)
    }
  }

  private func fileURL(from source: String) throws -> URL {
    if let url = URL(string: source), url.isFileURL {
      return url
    }
    guard source.hasPrefix("/") else {
      throw VideoCompressionError.invalidSource
    }
    return URL(fileURLWithPath: source)
  }

  private func fileSize(at url: URL) throws -> Int64 {
    let values = try url.resourceValues(forKeys: [.fileSizeKey])
    guard let size = values.fileSize else {
      throw VideoCompressionError.unreadableSource
    }
    return Int64(size)
  }

  private func export(_ exporter: AVAssetExportSession) async throws {
    try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<Void, Error>) in
      exporter.exportAsynchronously {
        switch exporter.status {
        case .completed:
          continuation.resume()
        case .cancelled:
          continuation.resume(throwing: VideoCompressionError.cancelled)
        default:
          continuation.resume(throwing: exporter.error ?? VideoCompressionError.failed)
        }
      }
    }
  }

  private func result(url: URL, size: Int64, compressed: Bool) -> [String: Any] {
    let mimeType = url.pathExtension.lowercased() == "mov" ? "video/quicktime" : "video/mp4"
    return [
      "uri": url.absoluteString,
      "fileSize": size,
      "fileName": url.lastPathComponent,
      "mimeType": mimeType,
      "compressed": compressed,
    ]
  }
}

private enum VideoCompressionError: Error {
  case invalidSource
  case unreadableSource
  case cancelled
  case failed
}
