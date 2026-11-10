package com.dood.app

import android.Manifest
import android.app.Activity
import android.app.KeyguardManager
import android.app.TimePickerDialog
import android.content.Context
import android.content.pm.PackageManager
import android.graphics.Color
import android.os.Build
import android.os.Bundle
import android.view.View
import android.view.ViewGroup
import android.widget.AdapterView
import android.widget.ArrayAdapter
import android.widget.Button
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.Spinner
import android.widget.Switch
import android.widget.TextView
import android.widget.Toast

private const val M = ViewGroup.LayoutParams.MATCH_PARENT
private const val W = ViewGroup.LayoutParams.WRAP_CONTENT
private val TEAL_C = Color.parseColor("#2563EB")

/** Phone-only options: Doodu's reminders, quiet hours and the app lock. Nothing here touches your DOOD server. */
class PhoneSettingsActivity : Activity() {

    private lateinit var box: LinearLayout
    private val dp by lazy { resources.displayMetrics.density }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val scroll = ScrollView(this)
        scroll.setBackgroundColor(Color.parseColor("#F2F6FD"))
        box = LinearLayout(this)
        box.orientation = LinearLayout.VERTICAL
        val pad = (20 * dp).toInt()
        box.setPadding(pad, pad, pad, pad * 2)
        scroll.addView(box, ViewGroup.LayoutParams(M, W))
        setContentView(scroll)
        build()
        if (Build.VERSION.SDK_INT >= 33 && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(arrayOf(Manifest.permission.POST_NOTIFICATIONS), 1)
        }
    }

    private fun title(t: String) {
        val v = TextView(this)
        v.text = t
        v.textSize = 18f
        v.setTextColor(TEAL_C)
        v.setTypeface(v.typeface, android.graphics.Typeface.BOLD)
        v.setPadding(0, (18 * dp).toInt(), 0, (4 * dp).toInt())
        box.addView(v, LinearLayout.LayoutParams(M, W))
    }

    private fun note(t: String) {
        val v = TextView(this)
        v.text = t
        v.textSize = 13f
        v.setTextColor(Color.parseColor("#5E6470"))
        box.addView(v, LinearLayout.LayoutParams(M, W))
    }

    private fun switch(label: String, on: Boolean, change: (Boolean) -> Unit): Switch {
        val s = Switch(this)
        s.text = label
        s.textSize = 16f
        s.isChecked = on
        s.setPadding(0, (8 * dp).toInt(), 0, (8 * dp).toInt())
        s.setOnCheckedChangeListener { _, checked -> change(checked) }
        box.addView(s, LinearLayout.LayoutParams(M, W))
        return s
    }

    private fun hhmm(m: Int): String = String.format("%02d:%02d", m / 60, m % 60)

    private fun timeRow(label: String, get: () -> Int, set: (Int) -> Unit) {
        val row = LinearLayout(this)
        row.orientation = LinearLayout.HORIZONTAL
        row.gravity = android.view.Gravity.CENTER_VERTICAL
        val t = TextView(this)
        t.text = label
        t.textSize = 16f
        row.addView(t, LinearLayout.LayoutParams(0, W, 1f))
        val b = Button(this)
        b.text = hhmm(get())
        b.setOnClickListener {
            TimePickerDialog(this, { _, h, m -> set(h * 60 + m); b.text = hhmm(h * 60 + m) }, get() / 60, get() % 60, true).show()
        }
        row.addView(b, LinearLayout.LayoutParams(W, W))
        box.addView(row, LinearLayout.LayoutParams(M, W))
    }

    private fun hoursRow(label: String, options: IntArray, get: () -> Int, set: (Int) -> Unit) {
        val row = LinearLayout(this)
        row.orientation = LinearLayout.HORIZONTAL
        row.gravity = android.view.Gravity.CENTER_VERTICAL
        val t = TextView(this)
        t.text = label
        t.textSize = 16f
        row.addView(t, LinearLayout.LayoutParams(0, W, 1f))
        val names = options.map { if (it == 0) "Off" else if (it == 1) "every hour" else "every $it hours" }
        val sp = Spinner(this)
        sp.adapter = ArrayAdapter(this, android.R.layout.simple_spinner_dropdown_item, names)
        val at = options.indexOf(get())
        sp.setSelection(if (at >= 0) at else 0)
        sp.onItemSelectedListener = object : AdapterView.OnItemSelectedListener {
            override fun onItemSelected(p: AdapterView<*>?, v: View?, pos: Int, id: Long) { set(options[pos]) }
            override fun onNothingSelected(p: AdapterView<*>?) {}
        }
        row.addView(sp, LinearLayout.LayoutParams(W, W))
        box.addView(row, LinearLayout.LayoutParams(M, W))
    }

    private fun build() {
        val head = TextView(this)
        head.text = "Phone settings"
        head.textSize = 26f
        head.setTextColor(TEAL_C)
        head.setTypeface(head.typeface, android.graphics.Typeface.BOLD)
        box.addView(head, LinearLayout.LayoutParams(M, W))
        note("These options live on this phone only. They do not change anything in DOOD.")

        title("Doodu reminders")
        note("Water, walk and a morning briefing, even when DOOD is closed.")
        switch("Remind me on this phone", Prefs.remindersOn(this)) { on ->
            Prefs.setRemindersOn(this, on)
            Reminders.schedule(this, 60_000L)
            if (on) Toast.makeText(this, "Reminders are on", Toast.LENGTH_SHORT).show()
        }
        hoursRow("Drink water", intArrayOf(0, 1, 2, 3, 4), { Prefs.waterEvery(this) }, { Prefs.setWaterEvery(this, it) })
        hoursRow("Take a walk", intArrayOf(0, 2, 3, 4), { Prefs.walkEvery(this) }, { Prefs.setWalkEvery(this, it) })
        switch("Morning briefing (overdue and due today)", Prefs.briefingOn(this)) { Prefs.setBriefingOn(this, it) }
        timeRow("Briefing time", { Prefs.briefingAt(this) }, { Prefs.setBriefingAt(this, it) })
        timeRow("Reminders start at", { Prefs.activeStart(this) }, { Prefs.setActiveStart(this, it) })
        timeRow("Reminders stop at", { Prefs.activeEnd(this) }, { Prefs.setActiveEnd(this, it) })
        switch("Monday to Friday only", Prefs.weekdaysOnly(this)) { Prefs.setWeekdaysOnly(this, it) }
        val test = Button(this)
        test.text = "Send me a test reminder"
        test.setOnClickListener { Reminders.sendWater(this); Toast.makeText(this, "Check your notifications", Toast.LENGTH_SHORT).show() }
        box.addView(test, LinearLayout.LayoutParams(M, W))

        title("Due dates and end of day")
        note("Reminders for GST, TDS, PF/ESI and tax dates, and a short wrap-up before you leave.")
        val due = Button(this)
        due.text = "Choose statutory due dates"
        due.setOnClickListener { startActivity(android.content.Intent(this, DueDatesActivity::class.java)) }
        box.addView(due, LinearLayout.LayoutParams(M, W))
        switch("End-of-day wrap-up", Prefs.wrapOn(this)) { Prefs.setWrapOn(this, it); Reminders.schedule(this, 60_000L) }
        timeRow("Wrap-up time", { Prefs.wrapAt(this) }, { Prefs.setWrapAt(this, it) })

        title("Meetings and calls")
        note("These two ask for permission. They read your phone calendar and call list on this phone only. Nothing is sent anywhere.")
        switch("Nudge me 10 minutes before a meeting", Prefs.meetOn(this)) { on ->
            Prefs.setMeetOn(this, on)
            if (on && checkSelfPermission(Manifest.permission.READ_CALENDAR) != PackageManager.PERMISSION_GRANTED) requestPermissions(arrayOf(Manifest.permission.READ_CALENDAR), 21)
            Reminders.schedule(this, 60_000L); Extras.scheduleMeeting(this)
        }
        switch("Offer a follow-up after a missed call", Prefs.callOn(this)) { on ->
            Prefs.setCallOn(this, on)
            if (on && checkSelfPermission(Manifest.permission.READ_CALL_LOG) != PackageManager.PERMISSION_GRANTED) requestPermissions(arrayOf(Manifest.permission.READ_CALL_LOG), 22)
            Reminders.schedule(this, 60_000L)
        }

        title("Quiet hours")
        note("No DOOD alerts and no reminders in this time.")
        switch("Keep quiet at night", Prefs.quietOn(this)) { Prefs.setQuietOn(this, it) }
        timeRow("Quiet from", { Prefs.quietStart(this) }, { Prefs.setQuietStart(this, it) })
        timeRow("Quiet until", { Prefs.quietEnd(this) }, { Prefs.setQuietEnd(this, it) })

        title("App lock")
        note("Ask for your phone's fingerprint, face, PIN or pattern when you open DOOD.")
        val lock = switch("Lock DOOD", Prefs.lockOn(this)) { }
        lock.setOnCheckedChangeListener { _, checked ->
            val km = getSystemService(Context.KEYGUARD_SERVICE) as KeyguardManager
            if (checked && !km.isDeviceSecure) {
                lock.isChecked = false
                Toast.makeText(this, "First set a screen lock (PIN, pattern or fingerprint) in the phone's Settings", Toast.LENGTH_LONG).show()
            } else {
                Prefs.setLockOn(this, checked)
            }
        }

        val close = Button(this)
        close.text = "Done"
        close.setBackgroundColor(TEAL_C)
        close.setTextColor(Color.WHITE)
        close.setOnClickListener { finish() }
        val lp = LinearLayout.LayoutParams(M, W)
        lp.topMargin = (24 * dp).toInt()
        box.addView(close, lp)
    }
}
