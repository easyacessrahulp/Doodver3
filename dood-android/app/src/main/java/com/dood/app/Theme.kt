package com.dood.app

import android.content.Context
import android.graphics.Color
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.widget.LinearLayout
import android.widget.TextView

/** The blue look of DOOD on this phone: colours, rounded shapes and small animations. */
object T {
    val NAVY = Color.parseColor("#0B1F3A")
    val B1 = Color.parseColor("#0B3D91")
    val B2 = Color.parseColor("#2563EB")
    val SKY = Color.parseColor("#E8F1FF")
    val BG = Color.parseColor("#F2F6FD")
    val INK = Color.parseColor("#13233D")
    val MUT = Color.parseColor("#62728C")
    val LINE = Color.parseColor("#DDE6F4")
    val CY = Color.parseColor("#22D3EE")
    val RED = Color.parseColor("#E5484D")

    fun dp(c: Context, v: Int): Int = (v * c.resources.displayMetrics.density).toInt()

    fun gradient(r: Float = 0f, bottomOnly: Boolean = false, c: Context? = null): GradientDrawable {
        val g = GradientDrawable(GradientDrawable.Orientation.TL_BR, intArrayOf(B1, B2))
        if (bottomOnly && c != null) { val x = dp(c, 22).toFloat(); g.cornerRadii = floatArrayOf(0f, 0f, 0f, 0f, x, x, x, x) }
        else if (r > 0f) g.cornerRadius = r
        return g
    }

    fun shape(color: Int, radius: Float, stroke: Int = 0): GradientDrawable {
        val g = GradientDrawable(); g.setColor(color); g.cornerRadius = radius
        if (stroke != 0) g.setStroke(2, stroke)
        return g
    }

    fun circle(color: Int): GradientDrawable { val g = GradientDrawable(); g.shape = GradientDrawable.OVAL; g.setColor(color); return g }

    /** A rounded blue bar for the top of a screen, with a title (and a back arrow when needed). */
    fun topBar(c: Context, title: String, back: (() -> Unit)?): LinearLayout {
        val bar = LinearLayout(c)
        bar.orientation = LinearLayout.HORIZONTAL
        bar.gravity = Gravity.CENTER_VERTICAL
        bar.background = gradient(bottomOnly = true, c = c)
        bar.elevation = dp(c, 6).toFloat()
        bar.setPadding(dp(c, 14), dp(c, 14), dp(c, 14), dp(c, 16))
        if (back != null) {
            val b = TextView(c); b.text = "‹"; b.textSize = 30f; b.setTextColor(Color.WHITE)
            b.setPadding(0, 0, dp(c, 12), dp(c, 4)); b.setOnClickListener { back() }
            bar.addView(b)
        }
        val t = TextView(c); t.text = title; t.textSize = 20f; t.setTextColor(Color.WHITE); t.setTypeface(t.typeface, Typeface.BOLD)
        t.tag = "title"
        bar.addView(t, LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f))
        return bar
    }

    fun avatar(c: Context, name: String, size: Int = 42, group: Boolean = false): TextView {
        val t = TextView(c)
        val parts = name.trim().split(" ").filter { it.isNotEmpty() }
        t.text = if (group) "👥" else (parts.take(2).joinToString("") { it.first().uppercase() }.ifEmpty { "?" })
        t.gravity = Gravity.CENTER; t.setTextColor(Color.WHITE); t.setTypeface(t.typeface, Typeface.BOLD); t.textSize = 15f
        t.background = GradientDrawable(GradientDrawable.Orientation.TL_BR, intArrayOf(Color.parseColor("#60A5FA"), B2)).also { it.shape = GradientDrawable.OVAL }
        t.layoutParams = LinearLayout.LayoutParams(dp(c, size), dp(c, size))
        return t
    }

    /** Soft slide-up and fade-in, used when a screen or a new message appears. */
    fun appear(v: View, delay: Long = 0) {
        v.alpha = 0f; v.translationY = 24f
        v.animate().alpha(1f).translationY(0f).setStartDelay(delay).setDuration(260).start()
    }
}
