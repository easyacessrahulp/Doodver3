package com.dood.app

import android.app.Activity
import android.graphics.Color
import android.graphics.Typeface
import android.os.Bundle
import android.view.Gravity
import android.view.ViewGroup
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.Switch
import android.widget.TextView
import java.time.LocalDate
import java.time.temporal.ChronoUnit
import java.util.Locale

/** Choose which statutory due dates (GST, TDS, PF/ESI, tax) the phone reminds you about. */
class DueDatesActivity : Activity() {
    override fun onCreate(b: Bundle?) {
        super.onCreate(b)
        val root = LinearLayout(this); root.orientation = LinearLayout.VERTICAL; root.setBackgroundColor(T.BG)
        root.addView(T.topBar(this, "Due-date reminders") { finish() })
        val sv = ScrollView(this); val box = LinearLayout(this); box.orientation = LinearLayout.VERTICAL
        box.setPadding(T.dp(this, 14), T.dp(this, 14), T.dp(this, 14), T.dp(this, 30)); sv.addView(box)
        root.addView(sv, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f))
        setContentView(root)

        val today = LocalDate.now()
        val off = Prefs.dueOff(this).toMutableSet()
        val nextItem = Compliance.all.filter { !off.contains(it.id) }.minByOrNull { it.next(today) }

        val hero = LinearLayout(this); hero.orientation = LinearLayout.VERTICAL; hero.background = T.gradient(r = T.dp(this, 18).toFloat()); hero.setPadding(T.dp(this, 16), T.dp(this, 14), T.dp(this, 16), T.dp(this, 14))
        val h1 = TextView(this); h1.text = "Next up"; h1.setTextColor(Color.parseColor("#CFE0FF")); h1.textSize = 12f
        val d = nextItem?.next(today)
        val h2 = TextView(this); h2.textSize = 18f; h2.setTextColor(Color.WHITE); h2.setTypeface(h2.typeface, Typeface.BOLD)
        h2.text = if (nextItem != null && d != null) "${nextItem.name} · ${d.dayOfMonth} ${month(d)}" else "No reminders chosen"
        val h3 = TextView(this); h3.setTextColor(Color.parseColor("#DCE8FF")); h3.textSize = 13f
        h3.text = if (d != null) "in ${ChronoUnit.DAYS.between(today, d)} days · reminders 3 days before, 1 day before and on the day" else "Switch some on below"
        hero.addView(h1); hero.addView(h2); hero.addView(h3)
        box.addView(hero); T.appear(hero)

        val master = Switch(this); master.text = "Remind me about due dates"; master.textSize = 16f; master.isChecked = Prefs.dueOn(this)
        master.setPadding(T.dp(this, 4), T.dp(this, 14), T.dp(this, 4), T.dp(this, 6))
        master.setOnCheckedChangeListener { _, on -> Prefs.setDueOn(this, on); Reminders.schedule(this, 60_000L) }
        box.addView(master)

        for ((i, it) in Compliance.all.withIndex()) {
            val card = LinearLayout(this); card.orientation = LinearLayout.HORIZONTAL; card.gravity = Gravity.CENTER_VERTICAL
            card.background = T.shape(Color.WHITE, T.dp(this, 14).toFloat(), Color.parseColor("#EAF0FA")); card.elevation = 2f
            card.setPadding(T.dp(this, 14), T.dp(this, 12), T.dp(this, 12), T.dp(this, 12))
            val col = LinearLayout(this); col.orientation = LinearLayout.VERTICAL
            val n = TextView(this); n.text = it.name; n.textSize = 16f; n.setTextColor(T.INK); n.setTypeface(n.typeface, Typeface.BOLD)
            val r = TextView(this); r.text = it.rule + " · next " + it.next(today).let { x -> "${x.dayOfMonth} ${month(x)}" }; r.textSize = 12f; r.setTextColor(T.MUT)
            col.addView(n); col.addView(r)
            card.addView(col, LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f))
            val sw = Switch(this); sw.isChecked = !off.contains(it.id)
            sw.setOnCheckedChangeListener { _, on -> if (on) off.remove(it.id) else off.add(it.id); Prefs.setDueOff(this, off) }
            card.addView(sw)
            box.addView(card, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT).also { lp -> lp.topMargin = T.dp(this, 8) })
            T.appear(card, 60L * i)
        }
        val note = TextView(this)
        note.text = "These are the usual dates. The government sometimes extends a date, so confirm on the portal. Reminders are on this phone only. Nothing is added to DOOD."
        note.textSize = 12f; note.setTextColor(T.MUT); note.setPadding(T.dp(this, 4), T.dp(this, 14), T.dp(this, 4), 0)
        box.addView(note)
    }

    private fun month(d: LocalDate) = d.month.name.lowercase(Locale.ENGLISH).replaceFirstChar { it.uppercase() }.take(3)
}
