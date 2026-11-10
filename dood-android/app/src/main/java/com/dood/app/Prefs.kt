package com.dood.app

import android.content.Context

/** Small settings store: the address of your DOOD server, alerts already shown, and the phone-only options. */
object Prefs {
    private fun sp(c: Context) = c.getSharedPreferences("dood", Context.MODE_PRIVATE)

    fun url(c: Context): String? = sp(c).getString("url", null)
    fun setUrl(c: Context, v: String) { sp(c).edit().putString("url", v).apply() }

    fun seen(c: Context): Set<String> = sp(c).getStringSet("seen", emptySet()) ?: emptySet()
    fun setSeen(c: Context, s: Set<String>) { sp(c).edit().putStringSet("seen", HashSet(s)).apply() }

    fun askedNotifications(c: Context): Boolean = sp(c).getBoolean("askedNotif", false)
    fun setAskedNotifications(c: Context) { sp(c).edit().putBoolean("askedNotif", true).apply() }

    // ---- phone reminders (Doodu) ----
    fun remindersOn(c: Context) = sp(c).getBoolean("remOn", false)
    fun setRemindersOn(c: Context, v: Boolean) {
        val now = System.currentTimeMillis()
        sp(c).edit().putBoolean("remOn", v).putLong("lastWater", now).putLong("lastWalk", now).apply()
    }
    fun waterEvery(c: Context) = sp(c).getInt("waterH", 2)
    fun setWaterEvery(c: Context, v: Int) { sp(c).edit().putInt("waterH", v).apply() }
    fun walkEvery(c: Context) = sp(c).getInt("walkH", 3)
    fun setWalkEvery(c: Context, v: Int) { sp(c).edit().putInt("walkH", v).apply() }
    fun briefingOn(c: Context) = sp(c).getBoolean("briefOn", true)
    fun setBriefingOn(c: Context, v: Boolean) { sp(c).edit().putBoolean("briefOn", v).apply() }
    fun briefingAt(c: Context) = sp(c).getInt("briefAt", 9 * 60 + 30)
    fun setBriefingAt(c: Context, v: Int) { sp(c).edit().putInt("briefAt", v).apply() }
    fun activeStart(c: Context) = sp(c).getInt("actStart", 9 * 60)
    fun setActiveStart(c: Context, v: Int) { sp(c).edit().putInt("actStart", v).apply() }
    fun activeEnd(c: Context) = sp(c).getInt("actEnd", 18 * 60 + 30)
    fun setActiveEnd(c: Context, v: Int) { sp(c).edit().putInt("actEnd", v).apply() }
    fun weekdaysOnly(c: Context) = sp(c).getBoolean("weekdays", true)
    fun setWeekdaysOnly(c: Context, v: Boolean) { sp(c).edit().putBoolean("weekdays", v).apply() }
    fun lastWater(c: Context) = sp(c).getLong("lastWater", 0L)
    fun setLastWater(c: Context, v: Long) { sp(c).edit().putLong("lastWater", v).apply() }
    fun lastWalk(c: Context) = sp(c).getLong("lastWalk", 0L)
    fun setLastWalk(c: Context, v: Long) { sp(c).edit().putLong("lastWalk", v).apply() }
    fun lastBriefingDay(c: Context) = sp(c).getString("lastBrief", "") ?: ""
    fun setLastBriefingDay(c: Context, v: String) { sp(c).edit().putString("lastBrief", v).apply() }

    // ---- quiet hours (no alerts, no reminders) ----
    fun quietOn(c: Context) = sp(c).getBoolean("quietOn", false)
    fun setQuietOn(c: Context, v: Boolean) { sp(c).edit().putBoolean("quietOn", v).apply() }
    fun quietStart(c: Context) = sp(c).getInt("quietStart", 22 * 60)
    fun setQuietStart(c: Context, v: Int) { sp(c).edit().putInt("quietStart", v).apply() }
    fun quietEnd(c: Context) = sp(c).getInt("quietEnd", 7 * 60)
    fun setQuietEnd(c: Context, v: Int) { sp(c).edit().putInt("quietEnd", v).apply() }

    // ---- app lock ----
    fun lockOn(c: Context) = sp(c).getBoolean("lockOn", false)
    fun setLockOn(c: Context, v: Boolean) { sp(c).edit().putBoolean("lockOn", v).apply() }

    // ---- home-screen widget numbers ----
    fun wOverdue(c: Context) = sp(c).getInt("wOver", 0)
    fun wToday(c: Context) = sp(c).getInt("wToday", 0)
    fun setWidget(c: Context, overdue: Int, today: Int) { sp(c).edit().putInt("wOver", overdue).putInt("wToday", today).apply() }

    // ---- v1.3: due dates, wrap-up, meetings, missed calls ----
    fun dueOn(c: Context) = sp(c).getBoolean("dueOn", true)
    fun setDueOn(c: Context, v: Boolean) { sp(c).edit().putBoolean("dueOn", v).apply() }
    fun dueOff(c: Context): Set<String> = sp(c).getStringSet("dueOff", emptySet()) ?: emptySet()
    fun setDueOff(c: Context, s: Set<String>) { sp(c).edit().putStringSet("dueOff", HashSet(s)).apply() }
    fun sentKeys(c: Context): Set<String> = sp(c).getStringSet("sentKeys", emptySet()) ?: emptySet()
    fun addSent(c: Context, k: String) { val s = HashSet(sentKeys(c)); s.add(k); val keep = s.toList().takeLast(300).toSet(); sp(c).edit().putStringSet("sentKeys", HashSet(keep)).apply() }
    fun wrapOn(c: Context) = sp(c).getBoolean("wrapOn", true)
    fun setWrapOn(c: Context, v: Boolean) { sp(c).edit().putBoolean("wrapOn", v).apply() }
    fun wrapAt(c: Context) = sp(c).getInt("wrapAt", 18 * 60)
    fun setWrapAt(c: Context, v: Int) { sp(c).edit().putInt("wrapAt", v).apply() }
    fun meetOn(c: Context) = sp(c).getBoolean("meetOn", false)
    fun setMeetOn(c: Context, v: Boolean) { sp(c).edit().putBoolean("meetOn", v).apply() }
    fun callOn(c: Context) = sp(c).getBoolean("callOn", false)
    fun setCallOn(c: Context, v: Boolean) { sp(c).edit().putBoolean("callOn", v).putLong("lastCall", System.currentTimeMillis()).apply() }
    fun lastCall(c: Context) = sp(c).getLong("lastCall", System.currentTimeMillis())
    fun setLastCall(c: Context, v: Long) { sp(c).edit().putLong("lastCall", v).apply() }
    fun anyChain(c: Context) = remindersOn(c) || dueOn(c) || wrapOn(c) || meetOn(c) || callOn(c)
}
