package com.questhat.liveactivity

import android.Manifest
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.BitmapFactory
import android.graphics.Color
import android.net.Uri
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import kotlin.math.max

class QuestHatLiveActivityModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("QuestHatLiveActivityAndroid")

    AsyncFunction("sync") { questId: String, title: String, startsAt: Double, location: String ->
      showActivity(questId, title, startsAt.toLong(), location)
    }

    AsyncFunction("end") {
      val context = requireNotNull(appContext.reactContext)
      NotificationManagerCompat.from(context).cancel(NOTIFICATION_ID)
      true
    }
  }

  private fun showActivity(questId: String, title: String, startsAt: Long, location: String): Boolean {
    val context = requireNotNull(appContext.reactContext)
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
      ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
    ) {
      return false
    }

    createChannel(context)
    val now = System.currentTimeMillis()
    val hasStarted = startsAt <= now
    val endAt = startsAt + FIFTEEN_MINUTES_MS
    if (endAt <= now) {
      NotificationManagerCompat.from(context).cancel(NOTIFICATION_ID)
      return false
    }

    val deepLink = Intent(Intent.ACTION_VIEW, Uri.parse("questhat://listing/${Uri.encode(questId)}"))
      .setPackage(context.packageName)
      .addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP)
    val pendingIntent = PendingIntent.getActivity(
      context,
      questId.hashCode(),
      deepLink,
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
    )
    val smallIcon = context.resources.getIdentifier("notification_icon", "drawable", context.packageName)
      .takeIf { it != 0 }
      ?: context.applicationInfo.icon
    val largeIcon = BitmapFactory.decodeResource(context.resources, R.drawable.questhat_activity_logo)
    val safeTitle = title.trim().ifEmpty { "Upcoming quest" }.take(100)
    val safeLocation = location.trim().ifEmpty { "Location pending" }.take(100)
    val status = if (hasStarted) "Happening now" else "Starting soon"
    val detail = if (hasStarted) safeLocation else "$safeLocation · Countdown"

    val builder = NotificationCompat.Builder(context, CHANNEL_ID)
      .setSmallIcon(smallIcon)
      .setLargeIcon(largeIcon)
      .setColor(Color.rgb(155, 216, 228))
      .setContentTitle(safeTitle)
      .setContentText(detail)
      .setSubText("QuestHat · $status")
      .setContentIntent(pendingIntent)
      .setCategory(NotificationCompat.CATEGORY_EVENT)
      .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
      .setOngoing(true)
      .setAutoCancel(false)
      .setOnlyAlertOnce(true)
      .setSilent(true)
      .setTimeoutAfter(max(1_000L, endAt - now))
      .setStyle(NotificationCompat.BigTextStyle().bigText("$detail\nTap to open the quest."))

    if (!hasStarted) {
      builder
        .setWhen(startsAt)
        .setShowWhen(true)
        .setUsesChronometer(true)
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
        builder.setChronometerCountDown(true)
      }
    } else {
      builder.setShowWhen(false)
    }

    NotificationManagerCompat.from(context).notify(NOTIFICATION_ID, builder.build())
    return true
  }

  private fun createChannel(context: Context) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
    val manager = context.getSystemService(NotificationManager::class.java)
    val channel = NotificationChannel(
      CHANNEL_ID,
      "Active quest countdown",
      NotificationManager.IMPORTANCE_LOW,
    ).apply {
      description = "Shows an ongoing countdown when a joined quest is about to start."
      setSound(null, null)
      enableVibration(false)
      setShowBadge(false)
    }
    manager.createNotificationChannel(channel)
  }

  companion object {
    private const val CHANNEL_ID = "questhat-live-activity"
    private const val NOTIFICATION_ID = 42001
    private const val FIFTEEN_MINUTES_MS = 15L * 60L * 1000L
  }
}
