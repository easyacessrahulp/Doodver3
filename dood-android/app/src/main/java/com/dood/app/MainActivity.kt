package com.dood.app

import android.Manifest
import android.annotation.SuppressLint
import android.app.Activity
import android.app.DownloadManager
import android.app.KeyguardManager
import android.app.AlertDialog
import android.content.Context
import android.graphics.drawable.GradientDrawable
import android.net.ConnectivityManager
import android.net.Network
import android.speech.RecognizerIntent
import org.json.JSONObject
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Color
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Environment
import android.text.InputType
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.webkit.CookieManager
import android.webkit.MimeTypeMap
import android.webkit.PermissionRequest
import android.webkit.URLUtil
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import android.os.Handler
import android.os.Looper
import android.widget.Button
import android.widget.EditText
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.TextView
import android.widget.Toast
import androidx.swiperefreshlayout.widget.SwipeRefreshLayout
import androidx.work.Constraints
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.NetworkType
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import java.util.concurrent.TimeUnit

private const val MATCH = ViewGroup.LayoutParams.MATCH_PARENT
private const val WRAP = ViewGroup.LayoutParams.WRAP_CONTENT
private const val REQ_FILE = 1
private const val REQ_PERM = 2
private const val REQ_NOTIF = 3
private const val REQ_SPEECH = 4
private const val REQ_LOCK = 5
private val TEAL = Color.parseColor("#2563EB")
private val CSS_BLUE = """
:root:not([data-theme=dark]){--accent:#2563EB;--accent-hover:#1D4ED8;--accent-bg:#E8F1FF;--blue-bg:#E8F1FF;--bg:#F2F6FD;--line:#DDE6F4;--radius:14px;--shadow:0 2px 10px rgba(37,99,235,.08)}
.m-bar{display:none!important}
.topbar{background:linear-gradient(135deg,#0B3D91,#2563EB)!important;border-bottom:0!important;border-radius:0 0 20px 20px;box-shadow:0 6px 18px rgba(37,99,235,.30);color:#fff}
.topbar .brand-btn,.topbar .top-btn,.topbar .user-btn,.topbar .user-btn small,.topbar button{color:#fff!important}
.topbar input,.topbar select{color:#13233D!important;background:#fff!important}
.topbar .top-btn em{background:#fff!important;color:#0B3D91!important}
button.primary,.qa{background:linear-gradient(135deg,#2563EB,#0B3D91)!important;border-color:transparent!important;color:#fff!important}
.card{border-radius:16px;border-color:#EAF0FA}
body{overscroll-behavior-y:contain}
main{animation:doodIn .28s cubic-bezier(.2,.8,.2,1)}@keyframes doodIn{from{opacity:0;transform:translateY(8px)}}
button{transition:transform .12s,background .15s}button:active{transform:scale(.97)}
"""

/** DOOD for Android: your DOOD server shown full-screen, with file upload, microphone, downloads and phone alerts. */
class MainActivity : Activity() {

    private lateinit var root: FrameLayout
    private lateinit var swipe: SwipeRefreshLayout
    private lateinit var web: WebView
    private lateinit var setup: LinearLayout
    private lateinit var urlBox: EditText
    private lateinit var cover: LinearLayout
    private lateinit var handle: TextView
    private lateinit var bar: BottomBar
    private lateinit var fab: TextView
    private val ui = Handler(Looper.getMainLooper())
    private var polling = false
    private var chatPoll = 0
    private var pendingQuickAdd: String? = null
    private var errorShown = false
    private var lastLeft = 0L
    private var netCallback: ConnectivityManager.NetworkCallback? = null

    private var baseUrl: String = ""
    private var fileCallback: ValueCallback<Array<Uri>>? = null
    private var pendingPermission: PermissionRequest? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        root = FrameLayout(this)
        setContentView(root)
        buildWeb()
        buildSetup()
        buildHandle()
        buildCover()
        baseUrl = Prefs.url(this) ?: ""
        if (baseUrl.isEmpty()) showSetup() else openApp(intent?.getStringExtra("link"), false)
        askNotificationPermission()
        handleIntent(intent)
        watchNetwork()
        Reminders.schedule(this, 60_000L)
    }

    private val pollTab = object : Runnable {
        override fun run() {
            if (!polling) return
            if (setup.visibility != View.VISIBLE && !errorShown) web.evaluateJavascript("location.hash") { r ->
                val h = (r ?: "").trim('"').removePrefix("#").substringBefore("/")
                bar.setSelected(when (h) { "", "home" -> "home"; "tasks", "kanban", "attention" -> "tasks"; "reviews" -> "reviews"; else -> null })
            }
            if (chatPoll++ % 20 == 0) Thread {
                val j = Net.call(this@MainActivity, "GET", "/chat/rooms")?.json()
                if (j != null) runOnUiThread { bar.badge("chats", j.optInt("unread")) }
            }.start()
            ui.postDelayed(this, 1500)
        }
    }

    override fun onResume() {
        super.onResume()
        polling = true; ui.post(pollTab)
        Thread { try { Extras.runAll(this); Extras.scheduleMeeting(this) } catch (e: Exception) { } }.start()
        val km = getSystemService(Context.KEYGUARD_SERVICE) as KeyguardManager
        if (Prefs.lockOn(this) && km.isDeviceSecure && cover.visibility != View.VISIBLE &&
            (lastLeft == 0L || System.currentTimeMillis() - lastLeft > 30_000)
        ) lockNow()
    }

    override fun onDestroy() {
        super.onDestroy()
        polling = false
        try { netCallback?.let { getSystemService(ConnectivityManager::class.java).unregisterNetworkCallback(it) } } catch (e: Exception) { /* already gone */ }
    }

    override fun onNewIntent(intent: Intent?) {
        super.onNewIntent(intent)
        val link = intent?.getStringExtra("link")
        if (baseUrl.isNotEmpty() && !link.isNullOrEmpty()) {
            if ((link == "home" || link == "tasks" || link == "reviews") && !errorShown && web.url?.startsWith(baseUrl) == true) nav(link) else openApp(link, false)
        }
        handleIntent(intent)
    }

    /** Shortcuts (long-press the icon) and "Share to DOOD" from other apps. */
    private fun handleIntent(i: Intent?) {
        if (i == null) return
        when {
            i.action == Intent.ACTION_SEND && i.type?.startsWith("text/") == true -> {
                val t = i.getStringExtra(Intent.EXTRA_TEXT) ?: ""
                if (t.isNotBlank()) { pendingQuickAdd = t; i.action = null; web.postDelayed({ runPendingQuickAdd() }, 600) }
            }
            i.getStringExtra("act") == "quickadd" -> { pendingQuickAdd = i.getStringExtra("text") ?: ""; i.removeExtra("act"); i.removeExtra("text"); web.postDelayed({ runPendingQuickAdd() }, 600) }
            i.getStringExtra("act") == "more" -> { i.removeExtra("act"); web.evaluateJavascript("window.dispatchEvent(new CustomEvent('cc-sheet',{detail:'more'}));", null) }
            i.getStringExtra("act") == "settings" -> { i.removeExtra("act"); startActivity(Intent(this, PhoneSettingsActivity::class.java)) }
        }
    }

    /** Opens DOOD's own "new task" box, with the text already in it. Needs you to be signed in. */
    private fun runPendingQuickAdd() {
        val t = pendingQuickAdd ?: return
        if (baseUrl.isEmpty() || setup.visibility == View.VISIBLE) return
        pendingQuickAdd = null
        val js = "window.dispatchEvent(new CustomEvent('cc-quickadd',{detail:{text:" + JSONObject.quote(t) + "}}));"
        web.evaluateJavascript(js, null)
    }

    // ---------------------------------------------------------------- screens

    @SuppressLint("SetJavaScriptEnabled")
    private fun buildWeb() {
        web = WebView(this)
        swipe = SwipeRefreshLayout(this)
        swipe.addView(web, ViewGroup.LayoutParams(MATCH, MATCH))
        swipe.setColorSchemeColors(TEAL)
        swipe.setOnRefreshListener { web.reload() }
        swipe.setOnChildScrollUpCallback { _, _ -> web.scrollY > 0 }
        val main = LinearLayout(this); main.orientation = LinearLayout.VERTICAL
        main.addView(swipe, LinearLayout.LayoutParams(MATCH, 0, 1f))
        bar = BottomBar(this, "home") { id -> tab(id) }
        main.addView(bar.view)
        root.addView(main, FrameLayout.LayoutParams(MATCH, MATCH))
        fab = TextView(this); fab.text = "+"; fab.textSize = 30f; fab.setTextColor(Color.WHITE); fab.gravity = Gravity.CENTER
        fab.background = T.gradient(r = 400f); fab.elevation = T.dp(this, 8).toFloat()
        fab.setOnClickListener { web.evaluateJavascript("window.dispatchEvent(new Event('cc-fab-toggle'));", null) }
        fab.setOnLongClickListener { speak(); true }
        root.addView(fab, FrameLayout.LayoutParams(T.dp(this, 54), T.dp(this, 54), Gravity.BOTTOM or Gravity.END).also { it.setMargins(0, 0, T.dp(this, 16), T.dp(this, 78)) })

        val s = web.settings
        s.javaScriptEnabled = true
        s.domStorageEnabled = true
        s.mediaPlaybackRequiresUserGesture = false
        s.allowFileAccess = false
        s.userAgentString = s.userAgentString + " DOODApp/1.3"
        CookieManager.getInstance().setAcceptCookie(true)
        web.addJavascriptInterface(Bridge(this), "DoodApp")

        web.webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(view: WebView?, request: WebResourceRequest?): Boolean {
                val uri = request?.url ?: return false
                return handleUrl(uri)
            }

            override fun onPageFinished(view: WebView?, url: String?) {
                swipe.isRefreshing = false
                CookieManager.getInstance().flush()
                if (url != null && url.startsWith(baseUrl) && !errorShown) {
                    view?.evaluateJavascript("(function(){var s=document.getElementById('dood-blue');if(!s){s=document.createElement('style');s.id='dood-blue';document.head.appendChild(s);}s.textContent=" + JSONObject.quote(CSS_BLUE) + ";})();", null)
                }
                if (pendingQuickAdd != null && url != null && url.startsWith(baseUrl)) web.postDelayed({ runPendingQuickAdd() }, 2500)
            }

            override fun onReceivedError(view: WebView?, request: WebResourceRequest?, error: WebResourceError?) {
                if (request != null && request.isForMainFrame) showError()
            }
        }

        web.webChromeClient = object : WebChromeClient() {
            override fun onShowFileChooser(
                webView: WebView?,
                filePathCallback: ValueCallback<Array<Uri>>?,
                fileChooserParams: WebChromeClient.FileChooserParams?
            ): Boolean {
                if (filePathCallback == null || fileChooserParams == null) return false
                fileCallback?.onReceiveValue(null)
                fileCallback = filePathCallback
                return try {
                    @Suppress("DEPRECATION")
                    startActivityForResult(fileChooserParams.createIntent(), REQ_FILE)
                    true
                } catch (e: Exception) {
                    fileCallback = null
                    false
                }
            }

            override fun onPermissionRequest(request: PermissionRequest?) {
                if (request == null) return
                runOnUiThread { handlePermission(request) }
            }
        }

        web.setDownloadListener { url, userAgent, contentDisposition, mime, _ ->
            download(url, userAgent, contentDisposition, mime)
        }
    }

    private fun buildSetup() {
        setup = LinearLayout(this)
        setup.orientation = LinearLayout.VERTICAL
        setup.gravity = Gravity.CENTER
        setup.background = GradientDrawable(GradientDrawable.Orientation.TL_BR, intArrayOf(T.NAVY, T.B1, T.B2))
        val pad = (24 * resources.displayMetrics.density).toInt()
        setup.setPadding(pad, pad, pad, pad)

        val logo = TextView(this)
        logo.text = "dood"
        logo.textSize = 48f
        logo.setTextColor(Color.WHITE)
        logo.setTypeface(logo.typeface, android.graphics.Typeface.BOLD)
        logo.gravity = Gravity.CENTER
        setup.addView(logo, LinearLayout.LayoutParams(MATCH, WRAP))
        logo.alpha = 0f; logo.translationY = 30f
        logo.animate().alpha(1f).translationY(0f).setDuration(700).start()

        val help = TextView(this)
        help.text = "Type the web address of your DOOD, for example\ndood.yourcompany.in"
        help.textSize = 16f
        help.setTextColor(Color.parseColor("#DBE8FF"))
        help.gravity = Gravity.CENTER
        help.setPadding(0, pad / 2, 0, pad / 2)
        setup.addView(help, LinearLayout.LayoutParams(MATCH, WRAP))

        urlBox = EditText(this)
        urlBox.hint = "DOOD address"
        urlBox.inputType = InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_VARIATION_URI
        urlBox.setSingleLine(true)
        urlBox.setTextColor(Color.WHITE); urlBox.setHintTextColor(Color.parseColor("#9DB7DE"))
        urlBox.background = T.shape(Color.parseColor("#33FFFFFF"), T.dp(this, 16).toFloat())
        urlBox.setPadding(T.dp(this, 16), T.dp(this, 14), T.dp(this, 16), T.dp(this, 14))
        setup.addView(urlBox, LinearLayout.LayoutParams(MATCH, WRAP))

        val go = Button(this)
        go.text = "Open DOOD"
        go.background = T.shape(Color.WHITE, T.dp(this, 16).toFloat())
        go.setTextColor(T.B1)
        go.setOnClickListener { saveAddress() }
        val lp = LinearLayout.LayoutParams(MATCH, WRAP)
        lp.topMargin = pad / 2
        setup.addView(go, lp)

        root.addView(setup, FrameLayout.LayoutParams(MATCH, MATCH))
        setup.visibility = View.GONE
    }

    private fun showSetup() {
        urlBox.setText(Prefs.url(this) ?: "")
        swipe.visibility = View.GONE
        setup.visibility = View.VISIBLE
        handle.visibility = View.GONE
    }

    private fun saveAddress() {
        var u = urlBox.text.toString().trim().trimEnd('/')
        if (u.isEmpty()) return
        if (!u.startsWith("http://") && !u.startsWith("https://")) {
            val plain = Regex("^[0-9.]+(:[0-9]+)?(/.*)?$").matches(u) || u.startsWith("localhost")
            u = (if (plain) "http://" else "https://") + u
        }
        Prefs.setUrl(this, u)
        baseUrl = u
        openApp(null, true)
    }

    private fun openApp(link: String?, replaceAlerts: Boolean) {
        errorShown = false
        setup.visibility = View.GONE
        swipe.visibility = View.VISIBLE
        if (cover.visibility != View.VISIBLE) handle.visibility = View.VISIBLE
        val target = if (link.isNullOrEmpty()) "$baseUrl/" else "$baseUrl/#$link"
        web.loadUrl(target)
        scheduleAlerts(replaceAlerts)
    }

    private fun showError() {
        errorShown = true
        val html = "<html><head><meta name='viewport' content='width=device-width,initial-scale=1'></head>" +
            "<body style='font-family:sans-serif;padding:32px;text-align:center;color:#1F2328;background:#F2F6FD'>" +
            "<h1 style='color:#2563EB'>dood</h1>" +
            "<h3>DOOD cannot connect</h3>" +
            "<p>You seem to be offline. Check your internet or office Wi-Fi. DOOD opens again by itself when the connection is back.</p>" +
            "<p><a href='dood-app://retry' style='display:inline-block;background:#2563EB;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none'>Try again</a></p>" +
            "<p><a href='dood-app://change' style='color:#2563EB'>Change the DOOD address</a></p>" +
            "</body></html>"
        web.loadDataWithBaseURL(null, html, "text/html", "utf-8", null)
    }

    // ---------------------------------------------------------------- phone-only extras

    private fun buildHandle() {
        handle = TextView(this)
        handle.text = "\u22EE"
        handle.textSize = 22f
        handle.gravity = Gravity.CENTER
        handle.setTextColor(Color.WHITE)
        val bg = GradientDrawable()
        bg.setColor(Color.parseColor("#992563EB"))
        val r = 14 * resources.displayMetrics.density
        bg.cornerRadii = floatArrayOf(0f, 0f, r, r, r, r, 0f, 0f)
        handle.background = bg
        handle.setOnClickListener { showMenu() }
        val w = (26 * resources.displayMetrics.density).toInt()
        val h = (56 * resources.displayMetrics.density).toInt()
        val lp = FrameLayout.LayoutParams(w, h, Gravity.START or Gravity.CENTER_VERTICAL)
        root.addView(handle, lp)
    }

    private fun showMenu() {
        val items = arrayOf("Speak a new task", "Call or message someone", "Scan a document to PDF", "Due-date reminders (GST, TDS, PF...)", "Phone settings: reminders, quiet hours, lock", "Reload DOOD", "Change the DOOD address")
        android.app.AlertDialog.Builder(this)
            .setTitle("DOOD on this phone")
            .setItems(items) { _, which ->
                when (which) {
                    0 -> speak()
                    1 -> contactMenu()
                    2 -> startActivity(Intent(this, ScanActivity::class.java))
                    3 -> startActivity(Intent(this, DueDatesActivity::class.java))
                    4 -> startActivity(Intent(this, PhoneSettingsActivity::class.java))
                    5 -> web.reload()
                    6 -> showSetup()
                }
            }
            .show()
    }

    /** Bottom-bar taps. Chats is a native screen; the others change the page inside DOOD without reloading it. */
    private fun tab(id: String) {
        when (id) {
            "chats" -> { startActivity(Intent(this, ChatListActivity::class.java)); overridePendingTransition(android.R.anim.fade_in, android.R.anim.fade_out) }
            "more" -> web.evaluateJavascript("window.dispatchEvent(new CustomEvent('cc-sheet',{detail:'more'}));", null)
            else -> nav(id)
        }
    }

    private fun nav(page: String) {
        if (errorShown || web.url?.startsWith(baseUrl) != true) { openApp(page, false); return }
        web.evaluateJavascript("location.hash='#$page';", null)
        bar.setSelected(page)
    }

    private fun contactMenu() {
        AlertDialog.Builder(this).setTitle("Call or message")
            .setItems(arrayOf("The person on a task", "Search people")) { _, w ->
                if (w == 0) Quick.pickTask(this, "Which task?") { id, _ ->
                    Quick.personOfTask(this, id) { p ->
                        if (p != null) Quick.contact(this, p)
                        else { Toast.makeText(this, "That task is not given to anyone. Pick the person.", Toast.LENGTH_SHORT).show(); Quick.pickPerson(this) { x -> Quick.contact(this, x) } }
                    }
                } else Quick.pickPerson(this) { x -> Quick.contact(this, x) }
            }.show()
    }

    private fun speak() {
        val i = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH)
        i.putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
        i.putExtra(RecognizerIntent.EXTRA_PROMPT, "Say your task")
        try {
            @Suppress("DEPRECATION")
            startActivityForResult(i, REQ_SPEECH)
        } catch (e: Exception) {
            Toast.makeText(this, "Voice typing is not available on this phone", Toast.LENGTH_LONG).show()
        }
    }

    private fun buildCover() {
        cover = LinearLayout(this)
        cover.orientation = LinearLayout.VERTICAL
        cover.gravity = Gravity.CENTER
        cover.background = GradientDrawable(GradientDrawable.Orientation.TL_BR, intArrayOf(T.NAVY, T.B1, T.B2))
        cover.isClickable = true
        val logo = TextView(this)
        logo.text = "dood"
        logo.textSize = 48f
        logo.setTextColor(Color.WHITE)
        logo.setTypeface(logo.typeface, android.graphics.Typeface.BOLD)
        logo.gravity = Gravity.CENTER
        cover.addView(logo, LinearLayout.LayoutParams(MATCH, WRAP))
        val b = Button(this)
        b.text = "Unlock"
        b.background = T.shape(Color.WHITE, T.dp(this, 16).toFloat())
        b.setTextColor(T.B1)
        b.setOnClickListener { lockNow() }
        val lp = LinearLayout.LayoutParams(WRAP, WRAP)
        lp.topMargin = (24 * resources.displayMetrics.density).toInt()
        cover.addView(b, lp)
        root.addView(cover, FrameLayout.LayoutParams(MATCH, MATCH))
        cover.visibility = View.GONE
    }

    /** Covers DOOD and asks for the phone's fingerprint, face, PIN or pattern. */
    private fun lockNow() {
        val km = getSystemService(Context.KEYGUARD_SERVICE) as KeyguardManager
        cover.visibility = View.VISIBLE
        handle.visibility = View.GONE
        @Suppress("DEPRECATION")
        val ask = km.createConfirmDeviceCredentialIntent("Unlock DOOD", "Use your fingerprint, face, PIN or pattern")
        if (ask == null) { cover.visibility = View.GONE; handle.visibility = View.VISIBLE; return }
        @Suppress("DEPRECATION")
        startActivityForResult(ask, REQ_LOCK)
    }

    /** When the internet comes back and DOOD was showing the "cannot connect" page, open it again by itself. */
    private fun watchNetwork() {
        try {
            val cm = getSystemService(ConnectivityManager::class.java)
            val cb = object : ConnectivityManager.NetworkCallback() {
                override fun onAvailable(network: Network) {
                    runOnUiThread { if (errorShown && baseUrl.isNotEmpty()) openApp(null, false) }
                }
            }
            cm.registerDefaultNetworkCallback(cb)
            netCallback = cb
        } catch (e: Exception) { /* not important */ }
    }

    // ---------------------------------------------------------------- behaviour

    private fun handleUrl(uri: Uri): Boolean {
        if (uri.scheme == "dood-app") {
            if (uri.host == "change") showSetup() else if (uri.host == "retry") openApp(null, false)
            return true
        }
        val own = Uri.parse(baseUrl).host
        if ((uri.scheme == "http" || uri.scheme == "https") && uri.host == own) return false
        // DOOD's "Email" button opens a Gmail or Outlook compose page. On a phone, hand it to the e-mail app instead.
        val mail = mailIntent(uri)
        if (mail != null) {
            try { startActivity(mail); return true } catch (e: Exception) {
                Toast.makeText(this, "No e-mail app is set up on this phone. Opening in the browser.", Toast.LENGTH_LONG).show()
            }
        }
        // Google sign-in is not allowed inside an app window, so it opens in the phone's browser. Come back to DOOD when done.
        if (uri.host == "accounts.google.com") {
            Toast.makeText(this, "Finish the Google sign-in in the browser, then come back to DOOD.", Toast.LENGTH_LONG).show()
        }
        try {
            startActivity(Intent(Intent.ACTION_VIEW, uri))      // WhatsApp, e-mail, phone calls, other sites
        } catch (e: Exception) {
            Toast.makeText(this, "Nothing on this phone can open that link", Toast.LENGTH_SHORT).show()
        }
        return true
    }

    /** Turns a Gmail / Outlook "compose" web address into a normal e-mail intent (to, cc, subject, message already filled). */
    private fun mailIntent(uri: Uri): Intent? {
        val host = uri.host ?: return null
        val to: String; val cc: String; val subject: String; val body: String
        if (host == "mail.google.com" && uri.getQueryParameter("view") == "cm") {
            to = uri.getQueryParameter("to") ?: ""; cc = uri.getQueryParameter("cc") ?: ""
            subject = uri.getQueryParameter("su") ?: ""; body = uri.getQueryParameter("body") ?: ""
        } else if (host == "outlook.office.com" && (uri.path ?: "").contains("compose")) {
            to = uri.getQueryParameter("to") ?: ""; cc = uri.getQueryParameter("cc") ?: ""
            subject = uri.getQueryParameter("subject") ?: ""; body = uri.getQueryParameter("body") ?: ""
        } else return null
        val i = Intent(Intent.ACTION_SENDTO, Uri.parse("mailto:"))
        val toList = to.split(",", ";").map { it.trim() }.filter { it.isNotEmpty() }
        val ccList = cc.split(",", ";").map { it.trim() }.filter { it.isNotEmpty() }
        if (toList.isNotEmpty()) i.putExtra(Intent.EXTRA_EMAIL, toList.toTypedArray())
        if (ccList.isNotEmpty()) i.putExtra(Intent.EXTRA_CC, ccList.toTypedArray())
        i.putExtra(Intent.EXTRA_SUBJECT, subject)
        i.putExtra(Intent.EXTRA_TEXT, body)
        return i
    }

    private fun handlePermission(request: PermissionRequest) {
        if (request.origin.host != Uri.parse(baseUrl).host) { request.deny(); return }
        val need = ArrayList<String>()
        for (r in request.resources) {
            if (r == PermissionRequest.RESOURCE_AUDIO_CAPTURE) need.add(Manifest.permission.RECORD_AUDIO)
            if (r == PermissionRequest.RESOURCE_VIDEO_CAPTURE) need.add(Manifest.permission.CAMERA)
        }
        val missing = need.filter { checkSelfPermission(it) != PackageManager.PERMISSION_GRANTED }
        if (missing.isEmpty()) {
            request.grant(request.resources)
        } else {
            pendingPermission = request
            requestPermissions(missing.toTypedArray(), REQ_PERM)
        }
    }

    private fun download(url: String, userAgent: String?, contentDisposition: String?, mime: String?) {
        if (url.startsWith("blob:")) {
            // Files that DOOD builds in the page (backups, exports): ask the page for the bytes.
            val ext = MimeTypeMap.getSingleton().getExtensionFromMimeType(mime ?: "") ?: "bin"
            val name = "DOOD-download.$ext"
            val js = "(function(){var x=new XMLHttpRequest();x.open('GET','" + url + "',true);x.responseType='blob';" +
                "x.onload=function(){var r=new FileReader();r.onloadend=function(){" +
                "DoodApp.save(String(r.result).split(',')[1]||'','" + (mime ?: "") + "','" + name + "');};" +
                "r.readAsDataURL(x.response);};x.send();})();"
            web.evaluateJavascript(js, null)
            return
        }
        try {
            val name = URLUtil.guessFileName(url, contentDisposition, mime)
            val req = DownloadManager.Request(Uri.parse(url))
            if (!mime.isNullOrEmpty()) req.setMimeType(mime)
            val cookie = CookieManager.getInstance().getCookie(url)
            if (!cookie.isNullOrEmpty()) req.addRequestHeader("Cookie", cookie)
            if (!userAgent.isNullOrEmpty()) req.addRequestHeader("User-Agent", userAgent)
            req.setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED)
            req.setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, name)
            (getSystemService(Context.DOWNLOAD_SERVICE) as DownloadManager).enqueue(req)
            Toast.makeText(this, "Downloading $name", Toast.LENGTH_SHORT).show()
        } catch (e: Exception) {
            Toast.makeText(this, "Could not download the file", Toast.LENGTH_SHORT).show()
        }
    }

    private fun scheduleAlerts(replace: Boolean) {
        val work = PeriodicWorkRequestBuilder<AlertWorker>(15, TimeUnit.MINUTES)
            .setConstraints(Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build())
            .build()
        WorkManager.getInstance(this).enqueueUniquePeriodicWork(
            "dood-alerts",
            if (replace) ExistingPeriodicWorkPolicy.UPDATE else ExistingPeriodicWorkPolicy.KEEP,
            work
        )
    }

    private fun askNotificationPermission() {
        if (Build.VERSION.SDK_INT >= 33 && !Prefs.askedNotifications(this) &&
            checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
        ) {
            Prefs.setAskedNotifications(this)
            requestPermissions(arrayOf(Manifest.permission.POST_NOTIFICATIONS), REQ_NOTIF)
        }
    }

    // ---------------------------------------------------------------- Android callbacks

    @Suppress("DEPRECATION")
    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        if (requestCode == REQ_SPEECH) {
            val said = data?.getStringArrayListExtra(RecognizerIntent.EXTRA_RESULTS)?.firstOrNull()
            if (resultCode == RESULT_OK && !said.isNullOrBlank()) { pendingQuickAdd = said; runPendingQuickAdd() }
        } else if (requestCode == REQ_LOCK) {
            if (resultCode == RESULT_OK) { cover.visibility = View.GONE; handle.visibility = View.VISIBLE }
        } else if (requestCode == REQ_FILE) {
            fileCallback?.onReceiveValue(WebChromeClient.FileChooserParams.parseResult(resultCode, data))
            fileCallback = null
        } else {
            super.onActivityResult(requestCode, resultCode, data)
        }
    }

    override fun onRequestPermissionsResult(requestCode: Int, permissions: Array<out String>, grantResults: IntArray) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        if (requestCode == REQ_PERM) {
            val p = pendingPermission
            pendingPermission = null
            if (p != null) {
                if (grantResults.isNotEmpty() && grantResults.all { it == PackageManager.PERMISSION_GRANTED }) p.grant(p.resources) else p.deny()
            }
        }
    }

    @Suppress("DEPRECATION")
    override fun onBackPressed() {
        if (setup.visibility != View.VISIBLE && web.canGoBack()) web.goBack() else super.onBackPressed()
    }

    override fun onPause() {
        super.onPause()
        lastLeft = System.currentTimeMillis()
        CookieManager.getInstance().flush()
    }
}
