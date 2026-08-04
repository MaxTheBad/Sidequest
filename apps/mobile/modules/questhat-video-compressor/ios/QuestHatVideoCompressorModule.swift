import AVFoundation
import ExpoModulesCore
import UIKit

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

    AsyncFunction("trim") { (source: String, startSeconds: Double, endSeconds: Double) async throws -> [String: Any] in
      let sourceURL = try self.fileURL(from: source)
      let asset = AVURLAsset(url: sourceURL)
      let durationTime = try await asset.load(.duration)
      let duration = durationTime.seconds
      let videoTracks = try await asset.loadTracks(withMediaType: .video)
      let safeStart = max(0, startSeconds)
      let safeEnd = min(duration, endSeconds)

      guard duration.isFinite,
            !videoTracks.isEmpty,
            safeEnd > safeStart,
            safeEnd - safeStart <= 15.2 else {
        throw VideoCompressionError.invalidTrimRange
      }

      // Passthrough fails for common iPhone codec/container combinations. A compatible
      // quality preset reliably handles HEVC, HDR, slow-motion, and edited library clips.
      let compatiblePresets = AVAssetExportSession.exportPresets(compatibleWith: asset)
      let preferredPresets = [AVAssetExportPreset1920x1080, AVAssetExportPresetHighestQuality]
      guard let preset = preferredPresets.first(where: compatiblePresets.contains),
            let exporter = AVAssetExportSession(asset: asset, presetName: preset) else {
        throw VideoCompressionError.failed("This video format cannot be trimmed on this device.")
      }

      let outputType: AVFileType
      let outputExtension: String
      if exporter.supportedFileTypes.contains(.mp4) {
        outputType = .mp4
        outputExtension = "mp4"
      } else if exporter.supportedFileTypes.contains(.mov) {
        outputType = .mov
        outputExtension = "mov"
      } else {
        throw VideoCompressionError.failed("This video has no supported export format.")
      }
      let outputURL = FileManager.default.temporaryDirectory
        .appendingPathComponent("questhat-trimmed-" + UUID().uuidString)
        .appendingPathExtension(outputExtension)
      try? FileManager.default.removeItem(at: outputURL)

      exporter.outputURL = outputURL
      exporter.outputFileType = outputType
      exporter.shouldOptimizeForNetworkUse = true
      exporter.timeRange = CMTimeRange(
        start: CMTime(seconds: safeStart, preferredTimescale: 600),
        duration: CMTime(seconds: safeEnd - safeStart, preferredTimescale: 600)
      )

      try await self.export(exporter)
      let outputSize = try self.fileSize(at: outputURL)
      var response = self.result(url: outputURL, size: outputSize, compressed: false)
      response["duration"] = safeEnd - safeStart
      return response
    }

    AsyncFunction("deleteTemporary") { (source: String) throws -> Bool in
      let url = try self.fileURL(from: source)
      let temporaryDirectory = FileManager.default.temporaryDirectory.standardizedFileURL.path
      let standardizedURL = url.standardizedFileURL
      guard standardizedURL.path.hasPrefix(temporaryDirectory),
            standardizedURL.lastPathComponent.hasPrefix("questhat-") else {
        return false
      }
      guard FileManager.default.fileExists(atPath: standardizedURL.path) else {
        return true
      }
      try FileManager.default.removeItem(at: standardizedURL)
      return true
    }

    AsyncFunction("thumbnail") { (source: String, atSeconds: Double) async throws -> [String: Any] in
      let sourceURL = try self.fileURL(from: source)
      let asset = AVURLAsset(url: sourceURL)
      let durationTime = try await asset.load(.duration)
      let duration = durationTime.seconds
      guard duration.isFinite, duration > 0 else {
        throw VideoCompressionError.unreadableSource
      }

      let generator = AVAssetImageGenerator(asset: asset)
      generator.appliesPreferredTrackTransform = true
      generator.maximumSize = CGSize(width: 1280, height: 1280)
      generator.requestedTimeToleranceBefore = CMTime(seconds: 0.2, preferredTimescale: 600)
      generator.requestedTimeToleranceAfter = CMTime(seconds: 0.2, preferredTimescale: 600)
      let requestedTime = CMTime(seconds: min(max(0, atSeconds), max(0, duration - 0.05)), preferredTimescale: 600)
      let (cgImage, _) = try await generator.image(at: requestedTime)
      guard let jpegData = UIImage(cgImage: cgImage).jpegData(compressionQuality: 0.82) else {
        throw VideoCompressionError.failed("A preview image could not be created for this video.")
      }

      let outputURL = FileManager.default.temporaryDirectory
        .appendingPathComponent("questhat-thumbnail-" + UUID().uuidString)
        .appendingPathExtension("jpg")
      try jpegData.write(to: outputURL, options: .atomic)
      return [
        "uri": outputURL.absoluteString,
        "fileSize": jpegData.count,
        "fileName": outputURL.lastPathComponent,
        "mimeType": "image/jpeg",
      ]
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
          continuation.resume(throwing: VideoCompressionError.failed(exporter.error?.localizedDescription))
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

private enum VideoCompressionError: LocalizedError {
  case invalidSource
  case invalidTrimRange
  case unreadableSource
  case cancelled
  case failed(String?)

  var errorDescription: String? {
    switch self {
    case .invalidSource:
      return "The selected video file is unavailable."
    case .invalidTrimRange:
      return "Choose a clip between 0.5 and 15 seconds."
    case .unreadableSource:
      return "The selected video could not be read."
    case .cancelled:
      return "Video trimming was cancelled."
    case .failed(let detail):
      return detail ?? "The video could not be trimmed. Try recording or selecting it again."
    }
  }
}
