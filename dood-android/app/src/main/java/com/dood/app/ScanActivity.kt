package com.dood.app

import android.Manifest
import android.app.Activity
import android.app.AlertDialog
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Canvas
import android.graphics.ColorMatrix
import android.graphics.ColorMatrixColorFilter
import android.graphics.Paint
import android.graphics.pdf.PdfDocument
import android.net.Uri
import android.os.Bundle
import android.provider.MediaStore
import android.util.Base64
import android.widget.EditText
import android.widget.Toast
import androidx.core.content.FileProvider
import org.json.JSONObject
import java.io.File
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/** Photograph one or more pages, make a clean PDF, and attach it to a DOOD task. No screen of its own: it uses the camera and dialogs. */
class ScanActivity : Activity() {
    private val pages = ArrayList<File>()
    private var current: File? = null

    override fun onCreate(b: Bundle?) {
        super.onCreate(b)
        if (checkSelfPermission(Manifest.permission.CAMERA) != PackageManager.PERMISSION_GRANTED) requestPermissions(arrayOf(Manifest.permission.CAMERA), 1) else shoot()
    }

    override fun onRequestPermissionsResult(rc: Int, p: Array<out String>, g: IntArray) {
        super.onRequestPermissionsResult(rc, p, g)
        if (g.isNotEmpty() && g[0] == PackageManager.PERMISSION_GRANTED) shoot() else { Toast.makeText(this, "Camera permission is needed to scan", Toast.LENGTH_LONG).show(); finish() }
    }

    private fun dir(): File = File(cacheDir, "scans").also { it.mkdirs() }

    private fun shoot() {
        val f = File(dir(), "page${pages.size + 1}.jpg"); current = f
        val uri = FileProvider.getUriForFile(this, "$packageName.files", f)
        val i = Intent(MediaStore.ACTION_IMAGE_CAPTURE).putExtra(MediaStore.EXTRA_OUTPUT, uri).addFlags(Intent.FLAG_GRANT_WRITE_URI_PERMISSION)
        try { @Suppress("DEPRECATION") startActivityForResult(i, 10) } catch (e: Exception) { Toast.makeText(this, "No camera app found", Toast.LENGTH_LONG).show(); finish() }
    }

    @Suppress("DEPRECATION")
    override fun onActivityResult(rc: Int, res: Int, data: Intent?) {
        if (rc != 10) { super.onActivityResult(rc, res, data); return }
        val f = current
        if (res == RESULT_OK && f != null && f.length() > 0) pages.add(f)
        if (pages.isEmpty()) { finish(); return }
        AlertDialog.Builder(this).setCancelable(false).setTitle("${pages.size} page${if (pages.size > 1) "s" else ""} scanned")
            .setPositiveButton("Add another page") { _, _ -> shoot() }
            .setNegativeButton("Finish") { _, _ -> finishUp() }
            .setNeutralButton("Cancel") { _, _ -> finish() }.show()
    }

    private fun finishUp() {
        val name = EditText(this); name.setText("Scan-" + SimpleDateFormat("yyyyMMdd-HHmm", Locale.US).format(Date())); name.setSingleLine(true)
        AlertDialog.Builder(this).setCancelable(false).setTitle("Name the PDF").setView(name)
            .setPositiveButton("Attach to a task") { _, _ -> val n = clean(name.text.toString()); build(n) { pdf -> Quick.pickTask(this, "Attach to which task?") { id, t -> upload(pdf, id, t) } } }
            .setNegativeButton("Just share") { _, _ -> val n = clean(name.text.toString()); build(n) { pdf -> share(pdf) } }
            .setNeutralButton("Cancel") { _, _ -> finish() }.show()
    }

    private fun clean(s: String) = s.trim().replace(Regex("[^A-Za-z0-9 _.-]"), "").ifEmpty { "Scan" }

    /** One A4 page per photo, turned to a clean high-contrast look. */
    private fun build(name: String, then: (File) -> Unit) {
        Thread {
            val out = File(dir(), "$name.pdf")
            try {
                val doc = PdfDocument()
                val paint = Paint().apply {
                    val cm = ColorMatrix(); cm.setSaturation(0f)
                    val k = 1.35f; val t = (-0.5f * k + 0.5f) * 255f
                    cm.postConcat(ColorMatrix(floatArrayOf(k, 0f, 0f, 0f, t, 0f, k, 0f, 0f, t, 0f, 0f, k, 0f, t, 0f, 0f, 0f, 1f, 0f)))
                    colorFilter = ColorMatrixColorFilter(cm); isFilterBitmap = true
                }
                for ((i, f) in pages.withIndex()) {
                    val opts = BitmapFactory.Options().apply { inJustDecodeBounds = true }; BitmapFactory.decodeFile(f.path, opts)
                    var s = 1; while (opts.outWidth / s > 2000 || opts.outHeight / s > 2000) s *= 2
                    val bmp = BitmapFactory.decodeFile(f.path, BitmapFactory.Options().apply { inSampleSize = s }) ?: continue
                    val land = bmp.width > bmp.height
                    val pw = if (land) 842 else 595; val ph = if (land) 595 else 842
                    val page = doc.startPage(PdfDocument.PageInfo.Builder(pw, ph, i + 1).create())
                    val sc = minOf(pw.toFloat() / bmp.width, ph.toFloat() / bmp.height)
                    val w = bmp.width * sc; val h = bmp.height * sc
                    page.canvas.drawBitmap(bmp, null, android.graphics.RectF((pw - w) / 2, (ph - h) / 2, (pw + w) / 2, (ph + h) / 2), paint)
                    doc.finishPage(page); bmp.recycle()
                }
                out.outputStream().use { doc.writeTo(it) }; doc.close()
                runOnUiThread { then(out) }
            } catch (e: Exception) { runOnUiThread { Toast.makeText(this, "Could not make the PDF", Toast.LENGTH_LONG).show(); finish() } }
        }.start()
    }

    private fun upload(pdf: File, taskId: String, taskTitle: String) {
        Toast.makeText(this, "Uploading…", Toast.LENGTH_SHORT).show()
        Thread {
            val b64 = Base64.encodeToString(pdf.readBytes(), Base64.NO_WRAP)
            val body = JSONObject().put("fileName", pdf.name).put("mimeType", "application/pdf").put("dataBase64", b64).toString()
            val r = Net.call(this, "POST", "/tasks/$taskId/attachments", body)
            runOnUiThread {
                if (r != null && r.ok) Toast.makeText(this, "Attached to \"$taskTitle\"", Toast.LENGTH_LONG).show()
                else { Toast.makeText(this, "Could not attach it (" + (r?.code ?: "no internet") + "). Sharing the PDF instead.", Toast.LENGTH_LONG).show(); share(pdf); return@runOnUiThread }
                finish()
            }
        }.start()
    }

    private fun share(pdf: File) {
        val uri: Uri = FileProvider.getUriForFile(this, "$packageName.files", pdf)
        startActivity(Intent.createChooser(Intent(Intent.ACTION_SEND).setType("application/pdf").putExtra(Intent.EXTRA_STREAM, uri).addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION), "Share PDF"))
        finish()
    }
}
