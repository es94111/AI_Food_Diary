package aifood.shao.one

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import org.json.JSONObject
import java.io.OutputStreamWriter
import java.net.HttpURLConnection
import java.net.URL
import java.text.SimpleDateFormat
import java.time.Instant
import java.util.Date
import java.util.Locale
import java.util.TimeZone

class WaterQuickAddReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != HomeWidgetContract.ACTION_WATER_QUICK_ADD) return
        val appContext = context.applicationContext
        val pendingResult = goAsync()
        HomeWidgetUpdater.updateWaterStatus(appContext, "新增中...")

        Thread {
            try {
                val cookie = HomeWidgetUpdater.sessionCookie(appContext)
                if (cookie.isNullOrBlank()) {
                    HomeWidgetUpdater.updateWaterStatus(appContext, "請先開 App 登入")
                } else {
                    postWater(cookie, 250)
                    val totalMl = fetchWaterTotal(cookie)
                    HomeWidgetUpdater.saveWaterSnapshot(
                        appContext,
                        waterTotalMl = totalMl,
                        status = "+250 ml 已記錄",
                    )
                }
            } catch (_: Exception) {
                HomeWidgetUpdater.updateWaterStatus(appContext, "同步失敗，稍後再試")
            } finally {
                pendingResult.finish()
            }
        }.start()
    }

    private fun postWater(cookie: String, amountMl: Int) {
        val connection = openConnection("${HomeWidgetContract.API_BASE_URL}/api/water", cookie)
        connection.requestMethod = "POST"
        connection.setRequestProperty("Content-Type", "application/json")
        connection.doOutput = true
        val body = JSONObject()
            .put("amountMl", amountMl)
            .put("drankAt", Instant.now().toString())
            .toString()
        OutputStreamWriter(connection.outputStream, Charsets.UTF_8).use { writer ->
            writer.write(body)
        }
        val code = connection.responseCode
        connection.disconnect()
        if (code !in 200..299) throw IllegalStateException("Water add failed: $code")
    }

    private fun fetchWaterTotal(cookie: String): Int {
        val date = SimpleDateFormat("yyyy-MM-dd", Locale.US).format(Date())
        val tzOffset = TimeZone.getDefault().getOffset(System.currentTimeMillis()) / 60_000
        val url = "${HomeWidgetContract.API_BASE_URL}/api/water?date=$date&tzOffset=$tzOffset"
        val connection = openConnection(url, cookie)
        connection.requestMethod = "GET"
        val code = connection.responseCode
        if (code !in 200..299) {
            connection.disconnect()
            throw IllegalStateException("Water fetch failed: $code")
        }
        val text = connection.inputStream.bufferedReader(Charsets.UTF_8).use { it.readText() }
        connection.disconnect()
        return JSONObject(text).optInt("totalMl", 0)
    }

    private fun openConnection(url: String, cookie: String): HttpURLConnection {
        return (URL(url).openConnection() as HttpURLConnection).apply {
            connectTimeout = 8_000
            readTimeout = 8_000
            setRequestProperty("Cookie", cookie)
            setRequestProperty("Accept", "application/json")
        }
    }
}
