package com.dood.app

import android.content.Context
import android.graphics.Color
import android.graphics.Typeface
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.TextView

/** The new bottom bar: Home, Tasks, Chats, Reviews, More. A blue line slides under the chosen item. */
class BottomBar(private val c: Context, selected: String, private val onPick: (String) -> Unit) {
    private val items = listOf("home" to "⌂|Home", "tasks" to "☑|Tasks", "chats" to "💬|Chats", "reviews" to "📄|Reviews", "more" to "⋯|More")
    private val labels = HashMap<String, TextView>()
    private val lines = HashMap<String, View>()
    private val badges = HashMap<String, TextView>()
    val view: View

    init {
        val col = LinearLayout(c); col.orientation = LinearLayout.VERTICAL; col.setBackgroundColor(Color.WHITE); col.elevation = T.dp(c, 10).toFloat()
        val top = View(c); top.setBackgroundColor(T.LINE)
        col.addView(top, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 1))
        val row = LinearLayout(c); row.orientation = LinearLayout.HORIZONTAL
        for ((id, label) in items) {
            val cell = FrameLayout(c)
            val p = label.split("|")
            val t = TextView(c); t.text = p[0] + "\n" + p[1]; t.gravity = Gravity.CENTER; t.textSize = 11f
            t.setPadding(0, T.dp(c, 9), 0, T.dp(c, 8))
            cell.addView(t, FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT))
            labels[id] = t
            val line = View(c); line.background = T.shape(T.B2, 6f); line.visibility = View.INVISIBLE
            cell.addView(line, FrameLayout.LayoutParams(T.dp(c, 34), T.dp(c, 3), Gravity.TOP or Gravity.CENTER_HORIZONTAL))
            lines[id] = line
            val b = TextView(c); b.setTextColor(Color.WHITE); b.textSize = 9f; b.gravity = Gravity.CENTER
            b.background = T.shape(T.RED, 40f); b.setPadding(T.dp(c, 5), 0, T.dp(c, 5), 0); b.visibility = View.GONE
            cell.addView(b, FrameLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT, Gravity.TOP or Gravity.CENTER_HORIZONTAL).also { it.leftMargin = T.dp(c, 22); it.topMargin = T.dp(c, 4) })
            badges[id] = b
            cell.setOnClickListener { onPick(id) }
            row.addView(cell, LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f))
        }
        col.addView(row)
        view = col
        setSelected(selected)
    }

    fun setSelected(id: String?) {
        for ((k, t) in labels) {
            val on = k == id
            t.setTextColor(if (on) T.B2 else T.MUT)
            t.setTypeface(null, if (on) Typeface.BOLD else Typeface.NORMAL)
            val l = lines[k]!!
            if (on && l.visibility != View.VISIBLE) { l.visibility = View.VISIBLE; l.scaleX = 0f; l.animate().scaleX(1f).setDuration(260).start() }
            else if (!on) l.visibility = View.INVISIBLE
        }
    }

    fun badge(id: String, n: Int) {
        val b = badges[id] ?: return
        b.text = if (n > 99) "99+" else n.toString()
        b.visibility = if (n > 0) View.VISIBLE else View.GONE
    }
}
