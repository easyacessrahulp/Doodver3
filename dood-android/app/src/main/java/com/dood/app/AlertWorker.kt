package com.dood.app

import android.Manifest
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.webkit.CookieManager
import androidx.work.Worker
import androidx.work.WorkerParameters
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL

/**
 * Every ~15 minutes asks your DOOD server for new notifications (using the sign-in the app already has)
 * and shows them as phone alerts. It only reads; it never changes anything in DOOD.
 */
class AlertWorker(context: Context, params: WorkerParameters) : Worker(context, params) {

    override fun doWork(): Result {
        val ctx = applicationContext
        if (Quiet.now(ctx)) return Result.success()      // quiet hours chosen on this phone: show them later
        val base = Prefs.url(ctx) ?: return Result.success()
        val cookie = CookieManager.getInstance().getCookie(base)
        if (cookie.isNullOrEmpty()) return Result.success()      // not signed in yet
        try { Extras.runAll(ctx) } catch (e: Exception) { /* next round */ }
        try { DoodWidget.refresh(ctx) } catch (e: Exception) { /* the widget keeps its old numbers */ }
        try {
            val conn = URL("$base/api/v1/notifications?unread=true&limit=10").openConnection() as HttpURLConnection
            conn.connectTimeout = 15000
            conn.readTimeout = 15000
            conn.setRequestProperty("Cookie", cookie)
            conn.setRequestProperty("Accept", "application/json")
            if (conn.responseCode != 200) { conn.disconnect(); return Result.success() }
            val text = conn.inputStream.bufferedReader().use { it.readText() }
            conn.disconnect()

            val items = JSONObject(text).optJSONArray("items") ?: return Result.success()
            val seen = Prefs.seen(ctx).toMutableList()
            var shown = 0
            for (i in 0 until items.length()) {
                val o = items.getJSONObject(i)
                val id = o.optString("id")
                if (id.isEmpty() || seen.contains(id)) continue
                seen.add(id)
                if (shown < 3) { show(ctx, o, id); shown++ }
            }
            Prefs.setSeen(ctx, seen.takeLast(200).toSet())
        } catch (e: Exception) {
            return Result.success()      // try again at the next 15-minute round
        }
        return Result.success()
    }

    private fun text(o: JSONObject, key: String): String = if (o.isNull(key)) "" else o.optString(key)

    private fun show(ctx: Context, o: JSONObject, id: String) {
        if (Build.VERSION.SDK_INT >= 33 &&
            ctx.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
        ) return
        val nm = ctx.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        nm.createNotificationChannel(NotificationChannel("dood", "DOOD alerts", NotificationManager.IMPORTANCE_DEFAULT))

        val open = Intent(ctx, MainActivity::class.java)
        open.flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
        open.putExtra("link", text(o, "link"))
        val pending = PendingIntent.getActivity(ctx, id.hashCode(), open, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)

        val title = text(o, "title").ifEmpty { "DOOD" }
        val body = text(o, "body")
        val n = Notification.Builder(ctx, "dood")
            .setSmallIcon(R.drawable.ic_stat)
            .setContentTitle(title)
            .setContentText(body)
            .setStyle(Notification.BigTextStyle().bigText(body))
            .setContentIntent(pending)
            .setAutoCancel(true)
            .build()
        nm.notify(id.hashCode(), n)
    }
}
