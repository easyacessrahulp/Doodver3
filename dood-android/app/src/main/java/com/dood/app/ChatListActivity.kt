package com.dood.app

import android.app.Activity
import android.app.AlertDialog
import android.content.Intent
import android.graphics.Color
import android.graphics.Typeface
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.text.Editable
import android.text.TextWatcher
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.widget.EditText
import android.widget.FrameLayout
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

private const val M = ViewGroup.LayoutParams.MATCH_PARENT
private const val W = ViewGroup.LayoutParams.WRAP_CONTENT

/** Your chats, shown like a chat app. Uses the chat DOOD already has on the server. */
class ChatListActivity : Activity() {
    private lateinit var list: LinearLayout
    private lateinit var empty: TextView
    private lateinit var bar: BottomBar
    private val h = Handler(Looper.getMainLooper())
    private var rooms: JSONArray = JSONArray()
    private var filter = ""
    private var running = false
    private var firstDraw = true
    private val tick = object : Runnable { override fun run() { if (running) { load(); h.postDelayed(this, 8000) } } }

    override fun onCreate(b: Bundle?) {
        super.onCreate(b)
        val root = LinearLayout(this); root.orientation = LinearLayout.VERTICAL; root.setBackgroundColor(T.BG)
        root.addView(T.topBar(this, "Chats", null))
        val search = EditText(this)
        search.hint = "Search chats"; search.setSingleLine(true); search.textSize = 15f
        search.background = T.shape(Color.WHITE, T.dp(this, 22).toFloat(), T.LINE)
        search.setPadding(T.dp(this, 16), T.dp(this, 10), T.dp(this, 16), T.dp(this, 10))
        search.addTextChangedListener(object : TextWatcher {
            override fun afterTextChanged(s: Editable?) { filter = s?.toString()?.trim()?.lowercase() ?: ""; draw() }
            override fun beforeTextChanged(s: CharSequence?, a: Int, b: Int, c: Int) {}
            override fun onTextChanged(s: CharSequence?, a: Int, b: Int, c: Int) {}
        })
        root.addView(search, LinearLayout.LayoutParams(M, W).also { it.setMargins(T.dp(this, 14), T.dp(this, 12), T.dp(this, 14), T.dp(this, 4)) })
        val frame = FrameLayout(this)
        val sv = ScrollView(this)
        list = LinearLayout(this); list.orientation = LinearLayout.VERTICAL
        list.setPadding(T.dp(this, 10), 0, T.dp(this, 10), T.dp(this, 90))
        sv.addView(list)
        frame.addView(sv, FrameLayout.LayoutParams(M, M))
        empty = TextView(this); empty.text = "Loading your chats…"; empty.setTextColor(T.MUT); empty.gravity = Gravity.CENTER
        frame.addView(empty, FrameLayout.LayoutParams(M, M))
        val fab = TextView(this); fab.text = "✎"; fab.textSize = 24f; fab.setTextColor(Color.WHITE); fab.gravity = Gravity.CENTER
        fab.background = T.gradient(r = 200f); fab.elevation = T.dp(this, 8).toFloat()
        fab.setOnClickListener { newChat() }
        frame.addView(fab, FrameLayout.LayoutParams(T.dp(this, 56), T.dp(this, 56), Gravity.BOTTOM or Gravity.END).also { it.setMargins(0, 0, T.dp(this, 18), T.dp(this, 18)) })
        root.addView(frame, LinearLayout.LayoutParams(M, 0, 1f))
        bar = BottomBar(this, "chats") { id -> goTab(id) }
        root.addView(bar.view)
        setContentView(root)
    }

    private fun goTab(id: String) {
        if (id == "chats") return
        val i = Intent(this, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_REORDER_TO_FRONT or Intent.FLAG_ACTIVITY_SINGLE_TOP)
        if (id == "more") i.putExtra("act", "more") else i.putExtra("link", id)
        startActivity(i); overridePendingTransition(android.R.anim.fade_in, android.R.anim.fade_out); finish()
    }

    override fun onResume() { super.onResume(); running = true; h.post(tick) }
    override fun onPause() { super.onPause(); running = false; h.removeCallbacks(tick) }

    private fun load() {
        Thread {
            val r = Net.call(this, "GET", "/chat/rooms")
            val j = r?.json()
            runOnUiThread {
                if (j == null) { if (rooms.length() == 0) empty.text = "Could not load chats.\nOpen DOOD once and sign in, then come back." ; return@runOnUiThread }
                rooms = j.optJSONArray("items") ?: JSONArray()
                bar.badge("chats", j.optInt("unread"))
                draw()
            }
        }.start()
    }

    private fun draw() {
        list.removeAllViews()
        var n = 0
        for (i in 0 until rooms.length()) {
            val r = rooms.getJSONObject(i)
            val title = r.optString("title").ifEmpty { r.optString("name") }
            if (filter.isNotEmpty() && !title.lowercase().contains(filter)) continue
            n++
            val row = LinearLayout(this); row.orientation = LinearLayout.HORIZONTAL; row.gravity = Gravity.CENTER_VERTICAL
            row.setPadding(T.dp(this, 6), T.dp(this, 11), T.dp(this, 6), T.dp(this, 11))
            row.addView(T.avatar(this, title, 46, r.optString("kind") == "GROUP"))
            val mid = LinearLayout(this); mid.orientation = LinearLayout.VERTICAL
            val tt = TextView(this); tt.text = (if (r.optString("kind") == "TASK") "☑ " else "") + title; tt.setTextColor(T.INK); tt.textSize = 16f
            tt.setTypeface(tt.typeface, Typeface.BOLD); tt.setSingleLine(true); tt.ellipsize = android.text.TextUtils.TruncateAt.END
            val pv = TextView(this); pv.text = r.optString("lastBody").ifEmpty { "No messages yet" }; pv.setTextColor(T.MUT); pv.textSize = 13f
            pv.setSingleLine(true); pv.ellipsize = android.text.TextUtils.TruncateAt.END
            mid.addView(tt); mid.addView(pv)
            row.addView(mid, LinearLayout.LayoutParams(0, W, 1f).also { it.leftMargin = T.dp(this, 12) })
            val right = LinearLayout(this); right.orientation = LinearLayout.VERTICAL; right.gravity = Gravity.END
            val tm = TextView(this); tm.text = whenText(r.optString("lastAt")); tm.setTextColor(T.MUT); tm.textSize = 11f
            right.addView(tm)
            val un = r.optInt("unread")
            if (un > 0) {
                val u = TextView(this); u.text = un.toString(); u.setTextColor(Color.WHITE); u.textSize = 11f; u.setTypeface(u.typeface, Typeface.BOLD)
                u.background = T.shape(T.B2, 40f); u.setPadding(T.dp(this, 7), 1, T.dp(this, 7), 1)
                right.addView(u, LinearLayout.LayoutParams(W, W).also { it.topMargin = T.dp(this, 4); it.gravity = Gravity.END })
                tt.setTextColor(T.INK); pv.setTextColor(T.INK)
            }
            row.addView(right)
            val id = r.optString("id")
            row.setOnClickListener {
                startActivity(Intent(this, ChatActivity::class.java).putExtra("roomId", id).putExtra("title", title).putExtra("group", r.optString("kind") != "DIRECT"))
                overridePendingTransition(android.R.anim.fade_in, android.R.anim.fade_out)
            }
            list.addView(row)
            if (firstDraw) T.appear(row, (n * 40L).coerceAtMost(400))
            val div = View(this); div.setBackgroundColor(Color.parseColor("#E8EEF9")); list.addView(div, LinearLayout.LayoutParams(M, 1).also { it.leftMargin = T.dp(this, 64) })
        }
        firstDraw = false
        empty.visibility = if (n == 0) View.VISIBLE else View.GONE
        if (n == 0) empty.text = if (rooms.length() == 0) "No chats yet. Tap the pencil to start one." else "No chat matches your search."
    }

    private fun whenText(iso: String): String {
        if (iso.isEmpty()) return ""
        return try {
            val f = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss", Locale.US); f.timeZone = TimeZone.getTimeZone("UTC")
            val d = f.parse(iso.take(19)) ?: return ""
            val now = Date()
            val day = SimpleDateFormat("yyyyMMdd", Locale.US)
            when {
                day.format(d) == day.format(now) -> SimpleDateFormat("h:mm a", Locale.getDefault()).format(d).lowercase()
                now.time - d.time < 36 * 3600_000L -> "Yesterday"
                else -> SimpleDateFormat("d MMM", Locale.getDefault()).format(d)
            }
        } catch (e: Exception) { "" }
    }

    private fun newChat() {
        Thread {
            val r = Net.call(this, "GET", "/team")?.json()
            runOnUiThread {
                val items = r?.optJSONArray("items")
                if (items == null) { Toast.makeText(this, "Could not load your team. Check the internet.", Toast.LENGTH_LONG).show(); return@runOnUiThread }
                val ids = ArrayList<String>(); val names = ArrayList<String>()
                for (i in 0 until items.length()) { val o = items.getJSONObject(i); if (!o.optBoolean("me")) { ids.add(o.optString("id")); names.add(o.optString("name") + (o.optString("designation").let { if (it.isNotEmpty() && it != "null") " · $it" else "" })) } }
                val picked = BooleanArray(ids.size)
                AlertDialog.Builder(this).setTitle("New chat. Pick one person, or several for a group")
                    .setMultiChoiceItems(names.toTypedArray(), picked) { _, w, on -> picked[w] = on }
                    .setPositiveButton("Next") { _, _ ->
                        val chosen = ids.filterIndexed { i, _ -> picked[i] }
                        when {
                            chosen.isEmpty() -> {}
                            chosen.size == 1 -> startDirect(chosen[0])
                            else -> askGroupName(chosen)
                        }
                    }.setNegativeButton("Cancel", null).show()
            }
        }.start()
    }

    private fun startDirect(userId: String) {
        Thread {
            val r = Net.call(this, "POST", "/chat/direct", JSONObject().put("userId", userId).toString())
            openRoom(r)
        }.start()
    }

    private fun askGroupName(ids: List<String>) {
        val e = EditText(this); e.hint = "Group name"
        AlertDialog.Builder(this).setTitle("Name the group").setView(e)
            .setPositiveButton("Create") { _, _ ->
                val name = e.text.toString().trim()
                if (name.isEmpty()) return@setPositiveButton
                Thread {
                    val r = Net.call(this, "POST", "/chat/groups", JSONObject().put("name", name).put("memberIds", JSONArray(ids)).toString())
                    openRoom(r, name, true)
                }.start()
            }.setNegativeButton("Cancel", null).show()
    }

    private fun openRoom(r: Net.Res?, name: String = "Chat", group: Boolean = false) {
        runOnUiThread {
            val j = r?.json()
            val id = j?.optString("id").orEmpty().ifEmpty { j?.optJSONObject("room")?.optString("id").orEmpty() }
            if (r == null || !r.ok || id.isEmpty()) { Toast.makeText(this, "Could not start the chat", Toast.LENGTH_LONG).show(); return@runOnUiThread }
            val t = j?.optString("title").orEmpty().ifEmpty { j?.optJSONObject("room")?.optString("title").orEmpty() }.ifEmpty { name }
            startActivity(Intent(this, ChatActivity::class.java).putExtra("roomId", id).putExtra("title", t).putExtra("group", group))
        }
    }
}
