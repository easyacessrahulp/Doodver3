package com.dood.app

import android.Manifest
import android.app.AlarmManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.provider.CalendarContract
import android.provider.CallLog
import java.time.LocalDate
import java.util.Calendar

/** Phone-only helpers: statutory due dates, end-of-day wrap-up, meeting nudges and missed-call follow-ups. */
object Extras {
    fun runAll(c: Context) {
        if (Quiet.now(c)) return
        try { dueDates(c) } catch (e: Exception) { }
        try { wrapUp(c) } catch (e: Exception) { }
        try { meetings(c) } catch (e: Exception) { }
        try { missedCalls(c) } catch (e: Exception) { }
    }

    private fun minutesNow(): Int { val k = Calendar.getInstance(); return k.get(Calendar.HOUR_OF_DAY) * 60 + k.get(Calendar.MINUTE) }

    /** 3 days before, 1 day before and on the day (from 9 in the morning). Each is shown once. */
    private fun dueDates(c: Context) {
        if (!Prefs.dueOn(c) || minutesNow() < 9 * 60) return
        val today = LocalDate.now()
        val off = Prefs.dueOff(c)
        for (it in Compliance.all) {
            if (off.contains(it.id)) continue
            val d = it.next(today)
            val left = java.time.temporal.ChronoUnit.DAYS.between(today, d).toInt()
            if (left != 3 && left != 1 && left != 0) continue
            val key = "due:${it.id}:$d:$left"
            if (Prefs.sentKeys(c).contains(key)) continue
            Prefs.addSent(c, key)
            val when_ = when (left) { 0 -> "is due today"; 1 -> "is due tomorrow"; else -> "is due in 3 days" }
            Notes.post(c, 9200 + it.id.hashCode().and(0xff), "due", "Statutory due dates", "📅 ${it.name} $when_",
                "${d.dayOfMonth} ${d.month.name.lowercase().replaceFirstChar { x -> x.uppercase() }}. Open DOOD to check the task.", "tasks")
        }
    }

    private fun wrapUp(c: Context) {
        if (!Prefs.wrapOn(c)) return
        val at = Prefs.wrapAt(c); val m = minutesNow()
        if (m < at || m > at + 150) return
        val k = Calendar.getInstance(); val dow = k.get(Calendar.DAY_OF_WEEK)
        if (Prefs.weekdaysOnly(c) && (dow == Calendar.SATURDAY || dow == Calendar.SUNDAY)) return
        val key = "wrap:${LocalDate.now()}"
        if (Prefs.sentKeys(c).contains(key)) return
        val n = Api.counts(c) ?: return
        Prefs.addSent(c, key)
        val body = if (n.today == 0 && n.overdue == 0) "Everything due is done. Have a good evening."
        else "${n.today} still due today and ${n.overdue} overdue. Anything you can close before you leave?"
        Notes.post(c, 9301, "wrap", "End-of-day wrap-up", "📊 Before you leave", body, "home")
    }

    // ---------------------------------------------------------------- meetings
    private fun hasPerm(c: Context, p: String) = c.checkSelfPermission(p) == PackageManager.PERMISSION_GRANTED

    private data class Ev(val id: Long, val title: String, val begin: Long, val place: String)

    private fun events(c: Context, from: Long, to: Long): List<Ev> {
        if (!hasPerm(c, Manifest.permission.READ_CALENDAR)) return emptyList()
        val b = CalendarContract.Instances.CONTENT_URI.buildUpon(); android.content.ContentUris.appendId(b, from); android.content.ContentUris.appendId(b, to)
        val out = ArrayList<Ev>()
        c.contentResolver.query(b.build(), arrayOf(CalendarContract.Instances.EVENT_ID, CalendarContract.Instances.TITLE, CalendarContract.Instances.BEGIN, CalendarContract.Instances.ALL_DAY, CalendarContract.Instances.EVENT_LOCATION),
            null, null, CalendarContract.Instances.BEGIN + " ASC")?.use { cu ->
            while (cu.moveToNext()) {
                if (cu.getInt(3) == 1) continue
                out.add(Ev(cu.getLong(0), cu.getString(1) ?: "Meeting", cu.getLong(2), cu.getString(4) ?: ""))
            }
        }
        return out
    }

    /** Tells you about meetings starting in the next 10 minutes (as set), then plans an exact alarm for the next one. */
    fun meetings(c: Context) {
        if (!Prefs.meetOn(c)) return
        val now = System.currentTimeMillis()
        val lead = 10 * 60_000L
        for (e in events(c, now, now + lead + 5 * 60_000L)) {
            if (e.begin < now || e.begin > now + lead + 2 * 60_000L) continue
            val key = "meet:${e.id}:${e.begin}"
            if (Prefs.sentKeys(c).contains(key)) continue
            Prefs.addSent(c, key)
            val mins = ((e.begin - now) / 60_000L).toInt().coerceAtLeast(1)
            Notes.post(c, 9400 + (e.id % 90).toInt(), "meet", "Meeting nudges", "👥 Meeting in $mins minutes",
                e.title + (if (e.place.isNotBlank()) " · ${e.place}" else ""), null)
        }
        scheduleMeeting(c)
    }

    fun scheduleMeeting(c: Context) {
        val am = c.getSystemService(Context.ALARM_SERVICE) as AlarmManager
        val pi = PendingIntent.getBroadcast(c, 78, Intent(c, MeetingReceiver::class.java), PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
        am.cancel(pi)
        if (!Prefs.meetOn(c)) return
        val now = System.currentTimeMillis()
        val next = events(c, now, now + 24 * 3600_000L).firstOrNull { it.begin - 10 * 60_000L > now + 30_000L } ?: return
        am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, next.begin - 10 * 60_000L, pi)
    }

    // ---------------------------------------------------------------- missed calls
    /** A missed call (or an outgoing call nobody answered) since the last look becomes a "add a follow-up" notification. */
    private fun missedCalls(c: Context) {
        if (!Prefs.callOn(c) || !hasPerm(c, Manifest.permission.READ_CALL_LOG)) return
        val since = Prefs.lastCall(c)
        var newest = since
        c.contentResolver.query(CallLog.Calls.CONTENT_URI, arrayOf(CallLog.Calls.NUMBER, CallLog.Calls.CACHED_NAME, CallLog.Calls.DATE, CallLog.Calls.TYPE, CallLog.Calls.DURATION),
            CallLog.Calls.DATE + " > ?", arrayOf(since.toString()), CallLog.Calls.DATE + " DESC")?.use { cu ->
            var shown = 0
            while (cu.moveToNext()) {
                val date = cu.getLong(2); val type = cu.getInt(3); val dur = cu.getInt(4)
                if (date > newest) newest = date
                val missed = type == CallLog.Calls.MISSED_TYPE
                val unanswered = type == CallLog.Calls.OUTGOING_TYPE && dur == 0
                if (!(missed || unanswered) || shown >= 3) continue
                shown++
                val name = (cu.getString(1) ?: "").ifBlank { cu.getString(0) ?: "a number" }
                val i = Intent(c, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
                    .putExtra("act", "quickadd").putExtra("text", "Call back $name")
                val pi = PendingIntent.getActivity(c, (date % 100000).toInt(), i, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
                Notes.postWith(c, 9500 + (date % 90).toInt(), "calls", "Missed-call follow-up",
                    if (missed) "📵 Missed call from $name" else "📞 No answer from $name", "Tap to add a follow-up task.", pi)
            }
        }
        Prefs.setLastCall(c, newest)
    }
}

class MeetingReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent?) {
        val p = goAsync()
        Thread { try { Extras.meetings(context) } catch (e: Exception) { } finally { p.finish() } }.start()
    }
}
