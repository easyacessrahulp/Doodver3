package com.dood.app

import android.content.Context
import android.webkit.CookieManager
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.time.LocalDate
import java.util.Calendar

/** Reads (never changes) the numbers DOOD already provides, using the sign-in the app already has. */
object Api {
    data class Counts(val overdue: Int, val today: Int, val critical: Int)

    /** Overdue / due today / critical counts, or null when not signed in or offline. Call from a background thread. */
    fun counts(c: Context): Counts? {
        val base = Prefs.url(c) ?: return null
        val cookie = CookieManager.getInstance().getCookie(base)
        if (cookie.isNullOrEmpty()) return null
        return try {
            val conn = URL("$base/api/v1/messages?today=" + LocalDate.now().toString()).openConnection() as HttpURLConnection
            conn.connectTimeout = 15000
            conn.readTimeout = 15000
            conn.setRequestProperty("Cookie", cookie)
            conn.setRequestProperty("Accept", "application/json")
            if (conn.responseCode != 200) { conn.disconnect(); return null }
            val text = conn.inputStream.bufferedReader().use { it.readText() }
            conn.disconnect()
            val o = JSONObject(text).optJSONObject("counts") ?: return null
            Counts(o.optInt("overdue"), o.optInt("today"), o.optInt("critical"))
        } catch (e: Exception) {
            null
        }
    }
}

/** Quiet hours chosen on this phone: no DOOD alerts or reminders in this window. */
object Quiet {
    fun now(c: Context): Boolean {
        if (!Prefs.quietOn(c)) return false
        val cal = Calendar.getInstance()
        val m = cal.get(Calendar.HOUR_OF_DAY) * 60 + cal.get(Calendar.MINUTE)
        val s = Prefs.quietStart(c)
        val e = Prefs.quietEnd(c)
        return if (s <= e) (m >= s && m < e) else (m >= s || m < e)
    }
}
