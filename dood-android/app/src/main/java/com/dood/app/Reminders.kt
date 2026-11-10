package com.dood.app

import android.Manifest
import android.app.AlarmManager
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import java.time.LocalDate
import java.util.Calendar

/** Shows one phone notification that opens DOOD when tapped. */
object Notes {
    fun post(c: Context, id: Int, channel: String, channelName: String, title: String, body: String, link: String?) {
        if (Build.VERSION.SDK_INT >= 33 && c.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) return
        val nm = c.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        nm.createNotificationChannel(NotificationChannel(channel, channelName, NotificationManager.IMPORTANCE_DEFAULT))
        val open = Intent(c, MainActivity::class.java)
        open.flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
        if (!link.isNullOrEmpty()) open.putExtra("link", link)
        val pending = PendingIntent.getActivity(c, id, open, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
        val n = Notification.Builder(c, channel)
            .setSmallIcon(R.drawable.ic_stat)
            .setContentTitle(title)
            .setContentText(body)
            .setStyle(Notification.BigTextStyle().bigText(body))
            .setContentIntent(pending)
            .setAutoCancel(true)
            .build()
        nm.notify(id, n)
    }
}

/** Posts a notification whose tap action is already built. */
fun Notes.postWith(c: Context, id: Int, channel: String, channelName: String, title: String, body: String, pending: PendingIntent) {
    if (Build.VERSION.SDK_INT >= 33 && c.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) return
    val nm = c.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    nm.createNotificationChannel(NotificationChannel(channel, channelName, NotificationManager.IMPORTANCE_DEFAULT))
    nm.notify(id, Notification.Builder(c, channel).setSmallIcon(R.drawable.ic_stat).setContentTitle(title).setContentText(body)
        .setContentIntent(pending).setAutoCancel(true).build())
}

/** Doodu's water, walk and morning-briefing reminders. They work on the phone alone, even when DOOD is closed. */
object Reminders {
    const val TICK = "com.dood.app.REMINDER_TICK"
    private const val EVERY_MS = 30 * 60 * 1000L

    /** Plans the next check (every 30 minutes). Does nothing when reminders are switched off. */
    fun schedule(c: Context, delayMs: Long = EVERY_MS) {
        val am = c.getSystemService(Context.ALARM_SERVICE) as AlarmManager
        val intent = Intent(c, ReminderReceiver::class.java)
        intent.action = TICK
        val pending = PendingIntent.getBroadcast(c, 77, intent, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
        am.cancel(pending)
        if (!Prefs.anyChain(c)) return
        am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, System.currentTimeMillis() + delayMs, pending)
    }

    /** Decides what (if anything) is due right now. Runs on a background thread. */
    fun check(c: Context) {
        if (Quiet.now(c)) return
        if (Prefs.remindersOn(c)) doodu(c)
        Extras.runAll(c)
    }

    private fun doodu(c: Context) {
        val cal = Calendar.getInstance()
        val mins = cal.get(Calendar.HOUR_OF_DAY) * 60 + cal.get(Calendar.MINUTE)
        val dow = cal.get(Calendar.DAY_OF_WEEK)
        if (Prefs.weekdaysOnly(c) && (dow == Calendar.SATURDAY || dow == Calendar.SUNDAY)) return
        if (mins < Prefs.activeStart(c) || mins > Prefs.activeEnd(c)) return
        val now = System.currentTimeMillis()
        val day = LocalDate.now().toString()

        val at = Prefs.briefingAt(c)
        if (Prefs.briefingOn(c) && mins >= at && mins <= at + 180 && Prefs.lastBriefingDay(c) != day) {
            Prefs.setLastBriefingDay(c, day)
            briefing(c)
        }
        val water = Prefs.waterEvery(c)
        if (water > 0 && now - Prefs.lastWater(c) >= water * 3_600_000L) {
            Prefs.setLastWater(c, now)
            sendWater(c)
        }
        val walk = Prefs.walkEvery(c)
        if (walk > 0 && now - Prefs.lastWalk(c) >= walk * 3_600_000L) {
            Prefs.setLastWalk(c, now)
            sendWalk(c)
        }
    }

    fun sendWater(c: Context) = Notes.post(c, 9101, "doodu", "Doodu reminders", "Time for a glass of water", "Doodu says: a glass of water keeps you sharp. Then back to work.", null)
    fun sendWalk(c: Context) = Notes.post(c, 9102, "doodu", "Doodu reminders", "Stand up and stretch", "Doodu says: you have been at the desk for a while. Take a 5-minute walk.", null)

    private fun briefing(c: Context) {
        val k = Api.counts(c)
        val body = if (k == null) "Open DOOD to see what is overdue and what is due today."
        else "${k.overdue} overdue, ${k.today} due today" + (if (k.critical > 0) ", ${k.critical} critical." else ".") + " Start with the overdue ones."
        Notes.post(c, 9103, "doodu", "Doodu reminders", "Good morning. Your briefing", body, "home")
    }
}

/** The 30-minute check. */
class ReminderReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent?) {
        val pending = goAsync()
        Thread {
            try { Reminders.check(context) } catch (e: Exception) { /* try again next time */ }
            finally { Reminders.schedule(context); pending.finish() }
        }.start()
    }
}

/** After the phone restarts or DOOD is updated, plan the reminders again. */
class BootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent?) {
        Reminders.schedule(context, 60_000L)
    }
}
