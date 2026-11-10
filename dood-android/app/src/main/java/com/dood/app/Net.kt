package com.dood.app

import android.content.Context
import android.webkit.CookieManager
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL

/** Talks to your DOOD server with the sign-in the app already has. Call only from a background thread. */
object Net {
    class Res(val code: Int, val text: String) {
        val ok get() = code in 200..299
        fun json(): JSONObject? = try { JSONObject(text) } catch (e: Exception) { null }
    }

    fun call(c: Context, method: String, path: String, body: String? = null): Res? {
        val base = Prefs.url(c) ?: return null
        val cookie = CookieManager.getInstance().getCookie(base)
        if (cookie.isNullOrEmpty()) return null
        return try {
            val conn = URL("$base/api/v1$path").openConnection() as HttpURLConnection
            conn.requestMethod = method
            conn.connectTimeout = 15000; conn.readTimeout = 30000
            conn.setRequestProperty("Cookie", cookie)
            conn.setRequestProperty("Accept", "application/json")
            conn.setRequestProperty("x-requested-with", "command-centre")
            if (body != null) {
                conn.doOutput = true
                conn.setRequestProperty("Content-Type", "application/json")
                conn.outputStream.use { it.write(body.toByteArray()) }
            } else if (method == "POST") {
                conn.doOutput = true
                conn.setRequestProperty("Content-Type", "application/json")
                conn.outputStream.use { it.write("{}".toByteArray()) }
            }
            val code = conn.responseCode
            val stream = if (code in 200..399) conn.inputStream else conn.errorStream
            val text = stream?.bufferedReader()?.use { it.readText() } ?: ""
            conn.disconnect()
            Res(code, text)
        } catch (e: Exception) { null }
    }
}
