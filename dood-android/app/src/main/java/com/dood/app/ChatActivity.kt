package com.dood.app

import android.app.Activity
import android.app.AlertDialog
import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.content.Intent
import android.graphics.Color
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.view.inputmethod.EditorInfo
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import android.widget.Toast
import org.json.JSONArray
import org.json.JSONObject
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone

/** One conversation. New messages appear by themselves every few seconds while this screen is open. */
class ChatActivity : Activity() {
    private lateinit var box: LinearLayout
    private lateinit var scroll: ScrollView
    private lateinit var input: EditText
    private lateinit var roomId: String
    private var myId = ""
    private var lastSig = ""
    private var seen = HashSet<String>()
    private val h = Handler(Looper.getMainLooper())
    private var running = false
    private val tick = object : Runnable { override fun run() { if (running) { load(); h.postDelayed(this, 4000) } } }

    override fun onCreate(b: Bundle?) {
        super.onCreate(b)
        roomId = intent.getStringExtra("roomId") ?: run { finish(); return }
        val title = intent.getStringExtra("title") ?: "Chat"
        val root = LinearLayout(this); root.orientation = LinearLayout.VERTICAL; root.setBackgroundColor(T.BG)
        val top = T.topBar(this, "", { finish() })
        val av = T.avatar(this, title, 38, intent.getBooleanExtra("group", false)).also { (it.layoutParams as LinearLayout.LayoutParams).rightMargin = T.dp(this, 10) }
        top.addView(av, 1)
        (top.findViewWithTag<TextView>("title")).text = title
        root.addView(top)
        scroll = ScrollView(this)
        box = LinearLayout(this); box.orientation = LinearLayout.VERTICAL; box.setPadding(T.dp(this, 12), T.dp(this, 8), T.dp(this, 12), T.dp(this, 8))
        scroll.addView(box)
        root.addView(scroll, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f))
        val inRow = LinearLayout(this); inRow.orientation = LinearLayout.HORIZONTAL; inRow.gravity = Gravity.CENTER_VERTICAL
        inRow.setBackgroundColor(Color.WHITE); inRow.elevation = T.dp(this, 8).toFloat()
        inRow.setPadding(T.dp(this, 10), T.dp(this, 8), T.dp(this, 10), T.dp(this, 8))
        input = EditText(this); input.hint = "Type a message"; input.maxLines = 4; input.textSize = 15f
        input.background = T.shape(T.BG, T.dp(this, 22).toFloat())
        input.setPadding(T.dp(this, 16), T.dp(this, 10), T.dp(this, 16), T.dp(this, 10))
        input.imeOptions = EditorInfo.IME_FLAG_NO_EXTRACT_UI
        inRow.addView(input, LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f))
        val sendBtn = TextView(this); sendBtn.text = "➤"; sendBtn.textSize = 18f; sendBtn.setTextColor(Color.WHITE); sendBtn.gravity = Gravity.CENTER
        sendBtn.background = T.circle(T.B2)
        sendBtn.setOnClickListener { send() }
        inRow.addView(sendBtn, LinearLayout.LayoutParams(T.dp(this, 42), T.dp(this, 42)).also { it.leftMargin = T.dp(this, 8) })
        root.addView(inRow)
        setContentView(root)
        window.setSoftInputMode(android.view.WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE)
    }

    override fun onResume() { super.onResume(); running = true; h.post(tick) }
    override fun onPause() { super.onPause(); running = false; h.removeCallbacks(tick) }
    override fun finish() { super.finish(); overridePendingTransition(android.R.anim.fade_in, android.R.anim.fade_out) }

    private fun load() {
        Thread {
            if (myId.isEmpty()) {
                val t = Net.call(this, "GET", "/team")?.json()?.optJSONArray("items")
                if (t != null) for (i in 0 until t.length()) if (t.getJSONObject(i).optBoolean("me")) myId = t.getJSONObject(i).optString("id")
            }
            val j = Net.call(this, "GET", "/chat/rooms/$roomId/messages?limit=100")?.json()
            if (j != null) {
                val items = j.optJSONArray("items") ?: JSONArray()
                val sig = items.length().toString() + ":" + (if (items.length() > 0) items.getJSONObject(items.length() - 1).optString("id") else "")
                if (sig != lastSig) {
                    runOnUiThread { lastSig = sig; draw(items) }
                    Net.call(this, "POST", "/chat/rooms/$roomId/read")
                }
            }
        }.start()
    }

    private fun draw(items: JSONArray) {
        val atBottom = scroll.getChildAt(0).bottom - (scroll.height + scroll.scrollY) < T.dp(this, 80)
        val first = seen.isEmpty()
        box.removeAllViews()
        var lastDay = ""
        for (i in 0 until items.length()) {
            val m = items.getJSONObject(i)
            val d = parse(m.optString("createdAt"))
            val day = if (d != null) SimpleDateFormat("yyyyMMdd", Locale.US).format(d) else ""
            if (day != lastDay && d != null) { lastDay = day; box.addView(dayChip(d)) }
            val mine = m.optString("authorId") == myId
            val id = m.optString("id")
            val v = bubble(m, mine, d)
            box.addView(v)
            if (!first && !seen.contains(id)) T.appear(v)
            seen.add(id)
        }
        if (first || atBottom) scroll.post { scroll.fullScroll(View.FOCUS_DOWN) }
    }

    private fun parse(iso: String): Date? = try {
        val f = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss", Locale.US); f.timeZone = TimeZone.getTimeZone("UTC"); f.parse(iso.take(19))
    } catch (e: Exception) { null }

    private fun dayChip(d: Date): View {
        val now = Date(); val f = SimpleDateFormat("yyyyMMdd", Locale.US)
        val label = if (f.format(d) == f.format(now)) "Today" else if (now.time - d.time < 36 * 3600_000L) "Yesterday" else SimpleDateFormat("d MMM yyyy", Locale.getDefault()).format(d)
        val t = TextView(this); t.text = label; t.textSize = 11f; t.setTextColor(T.MUT); t.gravity = Gravity.CENTER
        t.background = T.shape(Color.parseColor("#DCE8FA"), 40f); t.setPadding(T.dp(this, 12), T.dp(this, 3), T.dp(this, 12), T.dp(this, 3))
        val w = LinearLayout(this); w.gravity = Gravity.CENTER; w.setPadding(0, T.dp(this, 8), 0, T.dp(this, 4)); w.addView(t); return w
    }

    private fun bubble(m: JSONObject, mine: Boolean, d: Date?): View {
        val body = m.optString("body")
        val kind = m.optString("kind")
        val col = LinearLayout(this); col.orientation = LinearLayout.VERTICAL
        if (!mine && intent.getBooleanExtra("group", false)) {
            val n = TextView(this); n.text = m.optString("authorName"); n.textSize = 11f; n.setTextColor(T.B2); n.setTypeface(n.typeface, android.graphics.Typeface.BOLD); col.addView(n)
        }
        if (kind == "DECISION") { val k = TextView(this); k.text = "⚑ Decision"; k.textSize = 11f; k.setTextColor(if (mine) Color.WHITE else T.B1); col.addView(k) }
        val t = TextView(this); t.text = body; t.textSize = 15f; t.setTextColor(if (mine) Color.WHITE else T.INK); t.setTextIsSelectable(false); col.addView(t)
        val rt = m.optString("refTaskTitle")
        if (rt.isNotEmpty() && rt != "null") { val r = TextView(this); r.text = "☑ $rt"; r.textSize = 12f; r.setTextColor(if (mine) Color.WHITE else T.B2); r.setPadding(0, T.dp(this, 4), 0, 0); col.addView(r) }
        val time = TextView(this); time.text = if (d != null) SimpleDateFormat("h:mm a", Locale.getDefault()).format(d).lowercase() else ""
        time.textSize = 10f; time.setTextColor(if (mine) Color.parseColor("#CFE0FF") else T.MUT); time.gravity = Gravity.END; col.addView(time)
        col.setPadding(T.dp(this, 12), T.dp(this, 8), T.dp(this, 12), T.dp(this, 6))
        val r = T.dp(this, 18).toFloat(); val s = T.dp(this, 5).toFloat()
        val bg = android.graphics.drawable.GradientDrawable()
        if (mine) { bg.colors = intArrayOf(T.B2, Color.parseColor("#1D4ED8")); bg.orientation = android.graphics.drawable.GradientDrawable.Orientation.TL_BR; bg.cornerRadii = floatArrayOf(r, r, r, r, s, s, r, r) }
        else { bg.setColor(Color.WHITE); bg.cornerRadii = floatArrayOf(r, r, r, r, r, r, s, s) }
        col.background = bg; col.elevation = 2f
        val wrap = LinearLayout(this); wrap.gravity = if (mine) Gravity.END else Gravity.START
        wrap.setPadding(if (mine) T.dp(this, 48) else 0, T.dp(this, 3), if (mine) 0 else T.dp(this, 48), T.dp(this, 3))
        wrap.addView(col)
        col.setOnLongClickListener { actions(body); true }
        return wrap
    }

    private fun actions(body: String) {
        AlertDialog.Builder(this).setTitle(if (body.length > 60) body.take(60) + "…" else body)
            .setItems(arrayOf("Make a task", "Mark as a decision", "Copy")) { _, w ->
                when (w) {
                    0 -> startActivity(Intent(this, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_REORDER_TO_FRONT or Intent.FLAG_ACTIVITY_SINGLE_TOP).putExtra("act", "quickadd").putExtra("text", body))
                    1 -> post(body, "DECISION")
                    2 -> { (getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager).setPrimaryClip(ClipData.newPlainText("message", body)); Toast.makeText(this, "Copied", Toast.LENGTH_SHORT).show() }
                }
            }.show()
    }

    private fun send() {
        val t = input.text.toString().trim()
        if (t.isEmpty()) return
        input.setText("")
        post(t, "TEXT")
    }

    private fun post(text: String, kind: String) {
        Thread {
            val r = Net.call(this, "POST", "/chat/rooms/$roomId/messages", JSONObject().put("body", text).put("kind", kind).toString())
            runOnUiThread { if (r == null || !r.ok) Toast.makeText(this, "Message not sent. Check the internet.", Toast.LENGTH_LONG).show() else { lastSig = ""; load() } }
        }.start()
    }
}
