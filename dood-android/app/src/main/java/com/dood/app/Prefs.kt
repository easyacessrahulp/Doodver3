package com.dood.app

import android.content.Context

/** Small settings store: the address of your DOOD server and the alerts already shown. */
object Prefs {
    private fun sp(c: Context) = c.getSharedPreferences("dood", Context.MODE_PRIVATE)

    fun url(c: Context): String? = sp(c).getString("url", null)
    fun setUrl(c: Context, v: String) { sp(c).edit().putString("url", v).apply() }

    fun seen(c: Context): Set<String> = sp(c).getStringSet("seen", emptySet()) ?: emptySet()
    fun setSeen(c: Context, s: Set<String>) { sp(c).edit().putStringSet("seen", HashSet(s)).apply() }

    fun askedNotifications(c: Context): Boolean = sp(c).getBoolean("askedNotif", false)
    fun setAskedNotifications(c: Context) { sp(c).edit().putBoolean("askedNotif", true).apply() }
}
