package com.dood.app

import android.Manifest
import android.annotation.SuppressLint
import android.app.Activity
import android.app.DownloadManager
import android.content.Context
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
private val TEAL = Color.parseColor("#0F766E")

/** DOOD for Android: your DOOD server shown full-screen, with file upload, microphone, downloads and phone alerts. */
class MainActivity : Activity() {

    private lateinit var root: FrameLayout
    private lateinit var swipe: SwipeRefreshLayout
    private lateinit var web: WebView
    private lateinit var setup: LinearLayout
    private lateinit var urlBox: EditText

    private var baseUrl: String = ""
    private var fileCallback: ValueCallback<Array<Uri>>? = null
    private var pendingPermission: PermissionRequest? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        root = FrameLayout(this)
        setContentView(root)
        buildWeb()
        buildSetup()
        baseUrl = Prefs.url(this) ?: ""
        if (baseUrl.isEmpty()) showSetup() else openApp(intent?.getStringExtra("link"), false)
        askNotificationPermission()
    }

    override fun onNewIntent(intent: Intent?) {
        super.onNewIntent(intent)
        val link = intent?.getStringExtra("link")
        if (baseUrl.isNotEmpty() && !link.isNullOrEmpty()) openApp(link, false)
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
        root.addView(swipe, FrameLayout.LayoutParams(MATCH, MATCH))

        val s = web.settings
        s.javaScriptEnabled = true
        s.domStorageEnabled = true
        s.mediaPlaybackRequiresUserGesture = false
        s.allowFileAccess = false
        s.userAgentString = s.userAgentString + " DOODApp/1.1"
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
        setup.setBackgroundColor(Color.parseColor("#F7F7F5"))
        val pad = (24 * resources.displayMetrics.density).toInt()
        setup.setPadding(pad, pad, pad, pad)

        val logo = TextView(this)
        logo.text = "dood"
        logo.textSize = 48f
        logo.setTextColor(TEAL)
        logo.setTypeface(logo.typeface, android.graphics.Typeface.BOLD)
        logo.gravity = Gravity.CENTER
        setup.addView(logo, LinearLayout.LayoutParams(MATCH, WRAP))

        val help = TextView(this)
        help.text = "Type the web address of your DOOD, for example\ndood.yourcompany.in"
        help.textSize = 16f
        help.setTextColor(Color.parseColor("#3D4350"))
        help.gravity = Gravity.CENTER
        help.setPadding(0, pad / 2, 0, pad / 2)
        setup.addView(help, LinearLayout.LayoutParams(MATCH, WRAP))

        urlBox = EditText(this)
        urlBox.hint = "DOOD address"
        urlBox.inputType = InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_VARIATION_URI
        urlBox.setSingleLine(true)
        setup.addView(urlBox, LinearLayout.LayoutParams(MATCH, WRAP))

        val go = Button(this)
        go.text = "Open DOOD"
        go.setBackgroundColor(TEAL)
        go.setTextColor(Color.WHITE)
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
        setup.visibility = View.GONE
        swipe.visibility = View.VISIBLE
        val target = if (link.isNullOrEmpty()) "$baseUrl/" else "$baseUrl/#$link"
        web.loadUrl(target)
        scheduleAlerts(replaceAlerts)
    }

    private fun showError() {
        val html = "<html><head><meta name='viewport' content='width=device-width,initial-scale=1'></head>" +
            "<body style='font-family:sans-serif;padding:32px;text-align:center;color:#1F2328;background:#F7F7F5'>" +
            "<h1 style='color:#0F766E'>dood</h1>" +
            "<h3>DOOD cannot connect</h3>" +
            "<p>Check your internet or office Wi-Fi, then try again.</p>" +
            "<p><a href='dood-app://retry' style='display:inline-block;background:#0F766E;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none'>Try again</a></p>" +
            "<p><a href='dood-app://change' style='color:#0F766E'>Change the DOOD address</a></p>" +
            "</body></html>"
        web.loadDataWithBaseURL(null, html, "text/html", "utf-8", null)
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
        if (requestCode == REQ_FILE) {
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
        CookieManager.getInstance().flush()
    }
}
