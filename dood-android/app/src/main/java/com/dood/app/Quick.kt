package com.dood.app

import android.app.Activity
import android.app.AlertDialog
import android.content.Intent
import android.net.Uri
import android.text.Editable
import android.text.TextWatcher
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.ListView
import android.widget.ArrayAdapter
import android.widget.Toast
import org.json.JSONObject

/** Small pickers used by Contact and Scan: find a task, find a person, then call / WhatsApp / e-mail. */
object Quick {
    class Person(val id: String, val name: String, val phone: String, val email: String)

    /** Search your open tasks by words in the title. */
    fun pickTask(a: Activity, title: String, done: (id: String, title: String) -> Unit) {
        search(a, title, "Type part of the task name", { q, cb ->
            val r = Net.call(a, "GET", "/tasks?limit=25" + (if (q.isNotBlank()) "&q=" + Uri.encode(q) else ""))?.json()?.optJSONArray("items")
            val out = ArrayList<Pair<String, String>>()
            if (r != null) for (i in 0 until r.length()) { val o = r.getJSONObject(i); out.add(o.optString("id") to (o.optString("title") + (o.optString("companyName").let { c -> if (c.isNotEmpty() && c != "null") "  · $c" else "" }))) }
            cb(out)
        }) { id, label -> done(id, label.substringBefore("  ·")) }
    }

    fun pickPerson(a: Activity, done: (Person) -> Unit) {
        val cache = HashMap<String, Person>()
        search(a, "Find a person", "Type a name", { q, cb ->
            val r = Net.call(a, "GET", "/people?all=true&limit=300" + (if (q.isNotBlank()) "&q=" + Uri.encode(q) else ""))?.json()?.optJSONArray("items")
            val out = ArrayList<Pair<String, String>>()
            if (r != null) for (i in 0 until r.length()) {
                val o = r.getJSONObject(i); val nm = o.optString("name")
                if (q.isNotBlank() && !nm.lowercase().contains(q.lowercase())) continue
                val p = Person(o.optString("id"), nm, o.optString("phone").takeIf { it != "null" } ?: "", o.optString("email").takeIf { it != "null" } ?: "")
                cache[p.id] = p
                out.add(p.id to (nm + (if (p.phone.isNotEmpty()) "  · ${p.phone}" else "")))
            }
            cb(out)
        }) { id, _ -> cache[id]?.let(done) }
    }

    /** The person (if any) a task was given to. */
    fun personOfTask(a: Activity, taskId: String, done: (Person?) -> Unit) {
        Thread {
            val t = Net.call(a, "GET", "/tasks/$taskId")?.json()
            val pid = t?.optString("delegatedToId").orEmpty().let { if (it == "null") "" else it }
            var p: Person? = null
            if (pid.isNotEmpty()) {
                val arr = Net.call(a, "GET", "/people?all=true&limit=500")?.json()?.optJSONArray("items")
                if (arr != null) for (i in 0 until arr.length()) { val o = arr.getJSONObject(i); if (o.optString("id") == pid) p = Person(pid, o.optString("name"), o.optString("phone").takeIf { it != "null" } ?: "", o.optString("email").takeIf { it != "null" } ?: "") }
            }
            a.runOnUiThread { done(p) }
        }.start()
    }

    fun contact(a: Activity, p: Person) {
        val labels = ArrayList<String>(); val acts = ArrayList<() -> Unit>()
        if (p.phone.isNotEmpty()) {
            labels.add("📞 Call ${p.phone}"); acts.add { a.startActivity(Intent(Intent.ACTION_DIAL, Uri.parse("tel:" + p.phone.filter { it.isDigit() || it == '+' }))) }
            labels.add("🟢 WhatsApp"); acts.add {
                var d = p.phone.filter { it.isDigit() }; if (d.length == 10) d = "91$d"
                try { a.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse("https://wa.me/$d"))) } catch (e: Exception) { Toast.makeText(a, "WhatsApp is not on this phone", Toast.LENGTH_SHORT).show() }
            }
        }
        if (p.email.isNotEmpty()) { labels.add("✉ E-mail ${p.email}"); acts.add { a.startActivity(Intent(Intent.ACTION_SENDTO, Uri.parse("mailto:" + p.email))) } }
        if (labels.isEmpty()) { Toast.makeText(a, "${p.name} has no phone number or e-mail saved in DOOD", Toast.LENGTH_LONG).show(); return }
        AlertDialog.Builder(a).setTitle(p.name).setItems(labels.toTypedArray()) { _, w -> try { acts[w]() } catch (e: Exception) { Toast.makeText(a, "Nothing on this phone can do that", Toast.LENGTH_SHORT).show() } }.show()
    }

    private fun search(a: Activity, title: String, hint: String, fetch: (String, (List<Pair<String, String>>) -> Unit) -> Unit, pick: (String, String) -> Unit) {
        val box = LinearLayout(a); box.orientation = LinearLayout.VERTICAL; box.setPadding(T.dp(a, 16), T.dp(a, 8), T.dp(a, 16), 0)
        val et = EditText(a); et.hint = hint; et.setSingleLine(true); box.addView(et)
        val lv = ListView(a); val ad = ArrayAdapter<String>(a, android.R.layout.simple_list_item_1, ArrayList()); lv.adapter = ad
        box.addView(lv, LinearLayout.LayoutParams(android.view.ViewGroup.LayoutParams.MATCH_PARENT, T.dp(a, 300)))
        val ids = ArrayList<String>(); val labels = ArrayList<String>()
        val dlg = AlertDialog.Builder(a).setTitle(title).setView(box).setNegativeButton("Cancel", null).create()
        var token = 0
        fun run(q: String) {
            val my = ++token
            Thread { fetch(q) { res -> a.runOnUiThread {
                if (my != token) return@runOnUiThread
                ids.clear(); labels.clear(); ad.clear()
                for ((i, l) in res) { ids.add(i); labels.add(l); ad.add(l) }
                if (res.isEmpty()) ad.add("Nothing found")
                ad.notifyDataSetChanged()
            } } }.start()
        }
        et.addTextChangedListener(object : TextWatcher {
            override fun afterTextChanged(s: Editable?) { run(s?.toString()?.trim() ?: "") }
            override fun beforeTextChanged(s: CharSequence?, x: Int, y: Int, z: Int) {}
            override fun onTextChanged(s: CharSequence?, x: Int, y: Int, z: Int) {}
        })
        lv.setOnItemClickListener { _, _, pos, _ -> if (pos < ids.size) { dlg.dismiss(); pick(ids[pos], labels[pos]) } }
        dlg.show(); run("")
    }
}
