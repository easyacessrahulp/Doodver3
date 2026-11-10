package com.dood.app

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.widget.RemoteViews

/** Home-screen widget: how many tasks are overdue and due today. Tap it to open DOOD. */
class DoodWidget : AppWidgetProvider() {
    override fun onUpdate(context: Context, appWidgetManager: AppWidgetManager, appWidgetIds: IntArray) {
        for (id in appWidgetIds) appWidgetManager.updateAppWidget(id, views(context))
        val pending = goAsync()
        Thread {
            try { refresh(context) } catch (e: Exception) { /* keep the numbers shown before */ }
            finally { pending.finish() }
        }.start()
    }

    companion object {
        fun views(c: Context): RemoteViews {
            val v = RemoteViews(c.packageName, R.layout.widget)
            v.setTextViewText(R.id.w_over, Prefs.wOverdue(c).toString())
            v.setTextViewText(R.id.w_today, Prefs.wToday(c).toString())
            val open = Intent(c, MainActivity::class.java)
            open.flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
            val pending = PendingIntent.getActivity(c, 5, open, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
            v.setOnClickPendingIntent(R.id.w_root, pending)
            return v
        }

        /** Fetches fresh numbers and redraws every widget. Call from a background thread. */
        fun refresh(c: Context) {
            val k = Api.counts(c) ?: return
            Prefs.setWidget(c, k.overdue, k.today)
            val mgr = AppWidgetManager.getInstance(c)
            val ids = mgr.getAppWidgetIds(ComponentName(c, DoodWidget::class.java))
            for (id in ids) mgr.updateAppWidget(id, views(c))
        }
    }
}
