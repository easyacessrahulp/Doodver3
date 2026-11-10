package com.dood.app

import android.content.ContentValues
import android.content.Context
import android.os.Environment
import android.os.Handler
import android.os.Looper
import android.provider.MediaStore
import android.util.Base64
import android.webkit.JavascriptInterface
import android.widget.Toast

/** Lets the DOOD web page hand a downloaded file (backup, export) to the phone's Downloads folder. */
class Bridge(private val ctx: Context) {

    @JavascriptInterface
    fun save(base64: String, mime: String, name: String) {
        try {
            val bytes = Base64.decode(base64, Base64.DEFAULT)
            val values = ContentValues()
            values.put(MediaStore.Downloads.DISPLAY_NAME, name)
            values.put(MediaStore.Downloads.MIME_TYPE, if (mime.isEmpty()) "application/octet-stream" else mime)
            values.put(MediaStore.Downloads.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS)
            val uri = ctx.contentResolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values)
                ?: throw IllegalStateException("Could not create the file")
            ctx.contentResolver.openOutputStream(uri)?.use { it.write(bytes) }
            toast("Saved to Downloads: $name")
        } catch (e: Exception) {
            toast("Could not save the file")
        }
    }

    private fun toast(message: String) {
        Handler(Looper.getMainLooper()).post { Toast.makeText(ctx, message, Toast.LENGTH_LONG).show() }
    }
}
