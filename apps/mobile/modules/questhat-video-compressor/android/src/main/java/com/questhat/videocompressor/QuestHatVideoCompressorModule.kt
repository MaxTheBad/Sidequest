package com.questhat.videocompressor

import android.graphics.Bitmap
import android.media.MediaMetadataRetriever
import android.net.Uri
import androidx.media3.common.Effect
import androidx.media3.common.MediaItem
import androidx.media3.common.MimeTypes
import androidx.media3.effect.Presentation
import androidx.media3.transformer.EditedMediaItem
import androidx.media3.transformer.Effects
import androidx.media3.transformer.ExportException
import androidx.media3.transformer.ExportResult
import androidx.media3.transformer.Transformer
import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File
import java.io.FileOutputStream
import java.util.UUID

class QuestHatVideoCompressorModule : Module() {
  private val compressionThresholdBytes = 12L * 1024L * 1024L

  override fun definition() = ModuleDefinition {
    Name("QuestHatVideoCompressor")

    AsyncFunction("compress") { source: String, promise: Promise ->
      try {
        val input = sourceFile(source)
        if (input.length() <= compressionThresholdBytes) {
          promise.resolve(videoResult(input, false))
          return@AsyncFunction
        }
        val effects = Effects(emptyList(), listOf<Effect>(Presentation.createForHeight(1080)))
        val item = EditedMediaItem.Builder(MediaItem.fromUri(Uri.fromFile(input))).setEffects(effects).build()
        export(item, "questhat-compressed", null, promise) { output ->
          if (output.length() < input.length() * 0.95) videoResult(output, true)
          else {
            output.delete()
            videoResult(input, false)
          }
        }
      } catch (error: Exception) {
        promise.reject("ERR_VIDEO_COMPRESSION", error.message ?: "The video could not be compressed.", error)
      }
    }

    AsyncFunction("trim") { source: String, startSeconds: Double, endSeconds: Double, promise: Promise ->
      try {
        val input = sourceFile(source)
        val duration = durationSeconds(input)
        val safeStart = startSeconds.coerceAtLeast(0.0)
        val safeEnd = endSeconds.coerceAtMost(duration)
        if (!duration.isFinite() || safeEnd <= safeStart || safeEnd - safeStart > 15.2) {
          throw IllegalArgumentException("Choose a clip between 0.5 and 15 seconds.")
        }
        val clip = MediaItem.ClippingConfiguration.Builder()
          .setStartPositionMs((safeStart * 1000).toLong())
          .setEndPositionMs((safeEnd * 1000).toLong())
          .build()
        val mediaItem = MediaItem.Builder().setUri(Uri.fromFile(input)).setClippingConfiguration(clip).build()
        val editedItem = EditedMediaItem.Builder(mediaItem).build()
        export(editedItem, "questhat-trimmed", safeEnd - safeStart, promise) { output ->
          videoResult(output, false).plus("duration" to (safeEnd - safeStart))
        }
      } catch (error: Exception) {
        promise.reject("ERR_VIDEO_TRIM", error.message ?: "The video could not be trimmed.", error)
      }
    }

    AsyncFunction("thumbnail") { source: String, atSeconds: Double, promise: Promise ->
      try {
        val input = sourceFile(source)
        val retriever = MediaMetadataRetriever()
        try {
          retriever.setDataSource(input.absolutePath)
          val bitmap = retriever.getFrameAtTime((atSeconds.coerceAtLeast(0.0) * 1_000_000).toLong(), MediaMetadataRetriever.OPTION_CLOSEST_SYNC)
            ?: throw IllegalStateException("A preview image could not be created for this video.")
          val output = temporaryFile("questhat-thumbnail", "jpg")
          FileOutputStream(output).use { stream -> bitmap.compress(Bitmap.CompressFormat.JPEG, 82, stream) }
          bitmap.recycle()
          promise.resolve(mapOf("uri" to Uri.fromFile(output).toString(), "fileSize" to output.length(), "fileName" to output.name, "mimeType" to "image/jpeg"))
        } finally {
          retriever.release()
        }
      } catch (error: Exception) {
        promise.reject("ERR_VIDEO_THUMBNAIL", error.message ?: "A preview image could not be created.", error)
      }
    }

    AsyncFunction("deleteTemporary") { source: String ->
      val file = sourceFile(source)
      val cacheDirectory = requireNotNull(appContext.cacheDirectory).canonicalFile
      val canonicalFile = file.canonicalFile
      if (!canonicalFile.path.startsWith(cacheDirectory.path) || !canonicalFile.name.startsWith("questhat-")) false
      else !canonicalFile.exists() || canonicalFile.delete()
    }
  }

  private fun export(
    item: EditedMediaItem,
    prefix: String,
    duration: Double?,
    promise: Promise,
    result: (File) -> Map<String, Any>
  ) {
    val context = requireNotNull(appContext.reactContext)
    val output = temporaryFile(prefix, "mp4")
    val transformer = Transformer.Builder(context)
      .setVideoMimeType(MimeTypes.VIDEO_H264)
      .setAudioMimeType(MimeTypes.AUDIO_AAC)
      .addListener(object : Transformer.Listener {
        override fun onCompleted(composition: androidx.media3.transformer.Composition, exportResult: ExportResult) {
          promise.resolve(result(output))
        }

        override fun onError(composition: androidx.media3.transformer.Composition, exportResult: ExportResult, exportException: ExportException) {
          output.delete()
          promise.reject("ERR_VIDEO_EXPORT", exportException.message ?: "The video could not be exported.", exportException)
        }
      })
      .build()
    transformer.start(item, output.absolutePath)
  }

  private fun sourceFile(source: String): File {
    val uri = Uri.parse(source)
    val file = if (uri.scheme == "file") File(requireNotNull(uri.path)) else File(source)
    require(file.exists() && file.isFile) { "The selected video file is unavailable." }
    return file
  }

  private fun temporaryFile(prefix: String, extension: String): File {
    return File(requireNotNull(appContext.cacheDirectory), "$prefix-${UUID.randomUUID()}.$extension")
  }

  private fun durationSeconds(file: File): Double {
    val retriever = MediaMetadataRetriever()
    return try {
      retriever.setDataSource(file.absolutePath)
      (retriever.extractMetadata(MediaMetadataRetriever.METADATA_KEY_DURATION)?.toDoubleOrNull() ?: 0.0) / 1000.0
    } finally {
      retriever.release()
    }
  }

  private fun videoResult(file: File, compressed: Boolean): Map<String, Any> = mapOf(
    "uri" to Uri.fromFile(file).toString(),
    "fileSize" to file.length(),
    "fileName" to file.name,
    "mimeType" to "video/mp4",
    "compressed" to compressed
  )
}
