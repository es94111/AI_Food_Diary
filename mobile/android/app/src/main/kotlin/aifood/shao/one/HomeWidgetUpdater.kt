package aifood.shao.one

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.RectF
import android.widget.RemoteViews
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import kotlin.math.roundToInt

object HomeWidgetUpdater {
    private data class CalorieSnapshot(
        val consumedCalories: Int,
        val targetCalories: Int,
        val dateIso: String,
        val updatedAtMillis: Long,
    )

    fun saveCalorieProgress(
        context: Context,
        consumedCalories: Int,
        targetCalories: Int,
        dateIso: String,
        updatedAtMillis: Long,
    ) {
        context.getSharedPreferences(HomeWidgetContract.PREFS, Context.MODE_PRIVATE)
            .edit()
            .putInt(HomeWidgetContract.KEY_CONSUMED_CALORIES, consumedCalories.coerceAtLeast(0))
            .putInt(HomeWidgetContract.KEY_TARGET_CALORIES, targetCalories.coerceAtLeast(0))
            .putString(HomeWidgetContract.KEY_DATE_ISO, dateIso)
            .putLong(HomeWidgetContract.KEY_UPDATED_AT_MILLIS, updatedAtMillis)
            .apply()
        updateCalorieProgressWidgets(context)
    }

    fun clearCalorieProgress(context: Context) {
        context.getSharedPreferences(HomeWidgetContract.PREFS, Context.MODE_PRIVATE)
            .edit()
            .clear()
            .apply()
        updateCalorieProgressWidgets(context)
    }

    fun updateCalorieProgressWidgets(context: Context) {
        val manager = AppWidgetManager.getInstance(context)
        val component = ComponentName(context, CalorieProgressWidgetProvider::class.java)
        updateCalorieProgressWidgets(context, manager, manager.getAppWidgetIds(component))
    }

    fun updateCalorieProgressWidgets(
        context: Context,
        appWidgetManager: AppWidgetManager,
        appWidgetIds: IntArray,
    ) {
        appWidgetIds.forEach { id ->
            appWidgetManager.updateAppWidget(id, calorieProgressViews(context, id))
        }
    }

    fun updateQuickCaptureWidgets(
        context: Context,
        appWidgetManager: AppWidgetManager,
        appWidgetIds: IntArray,
    ) {
        appWidgetIds.forEach { id ->
            appWidgetManager.updateAppWidget(id, quickCaptureViews(context, id))
        }
    }

    private fun calorieProgressViews(context: Context, appWidgetId: Int): RemoteViews {
        val views = RemoteViews(context.packageName, R.layout.widget_calorie_progress)
        val snapshot = readSnapshot(context)
        val fresh = snapshot != null && snapshot.dateIso == todayIso()

        if (fresh && snapshot != null && snapshot.targetCalories > 0) {
            val consumed = snapshot.consumedCalories
            val target = snapshot.targetCalories
            val remaining = target - consumed
            val progress = (consumed.toFloat() / target.toFloat()).coerceIn(0f, 1f)
            val overTarget = remaining < 0

            views.setTextViewText(R.id.calorie_progress_percent, "${(progress * 100).roundToInt()}%")
            views.setTextViewText(R.id.calorie_consumed_target, "$consumed / $target kcal")
            views.setTextViewText(
                R.id.calorie_remaining,
                if (overTarget) "超出 ${-remaining} kcal" else "剩餘 $remaining kcal",
            )
            views.setTextColor(
                R.id.calorie_remaining,
                if (overTarget) Color.rgb(220, 38, 38) else Color.rgb(120, 53, 15),
            )
            views.setTextViewText(R.id.calorie_widget_status, "已同步今日資料")
            views.setImageViewBitmap(
                R.id.calorie_ring,
                renderRingBitmap(context, progress, overTarget),
            )
        } else {
            views.setTextViewText(R.id.calorie_progress_percent, "--")
            views.setTextViewText(R.id.calorie_consumed_target, "-- / ---- kcal")
            views.setTextViewText(R.id.calorie_remaining, "開啟 App 同步")
            views.setTextColor(R.id.calorie_remaining, Color.rgb(120, 53, 15))
            views.setTextViewText(R.id.calorie_widget_status, "等待今日熱量")
            views.setImageViewBitmap(R.id.calorie_ring, renderRingBitmap(context, 0f, false))
        }

        views.setOnClickPendingIntent(
            R.id.calorie_widget_root,
            openAppPendingIntent(context, appWidgetId),
        )
        return views
    }

    private fun quickCaptureViews(context: Context, appWidgetId: Int): RemoteViews {
        val views = RemoteViews(context.packageName, R.layout.widget_quick_capture)
        val pendingIntent = quickCapturePendingIntent(context, appWidgetId)
        views.setOnClickPendingIntent(R.id.quick_capture_widget_root, pendingIntent)
        views.setOnClickPendingIntent(R.id.quick_capture_button, pendingIntent)
        return views
    }

    private fun readSnapshot(context: Context): CalorieSnapshot? {
        val prefs = context.getSharedPreferences(HomeWidgetContract.PREFS, Context.MODE_PRIVATE)
        if (!prefs.contains(HomeWidgetContract.KEY_CONSUMED_CALORIES)) return null
        return CalorieSnapshot(
            consumedCalories = prefs.getInt(HomeWidgetContract.KEY_CONSUMED_CALORIES, 0),
            targetCalories = prefs.getInt(HomeWidgetContract.KEY_TARGET_CALORIES, 0),
            dateIso = prefs.getString(HomeWidgetContract.KEY_DATE_ISO, "") ?: "",
            updatedAtMillis = prefs.getLong(HomeWidgetContract.KEY_UPDATED_AT_MILLIS, 0L),
        )
    }

    private fun openAppPendingIntent(context: Context, requestCode: Int): PendingIntent {
        val intent = Intent(context, MainActivity::class.java)
            .setAction(Intent.ACTION_MAIN)
            .addCategory(Intent.CATEGORY_LAUNCHER)
        return PendingIntent.getActivity(
            context,
            requestCode,
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
    }

    private fun quickCapturePendingIntent(context: Context, requestCode: Int): PendingIntent {
        val intent = Intent(context, MainActivity::class.java)
            .setAction(HomeWidgetContract.ACTION_QUICK_CAPTURE)
            .putExtra(
                HomeWidgetContract.EXTRA_WIDGET_ACTION,
                HomeWidgetContract.ACTION_VALUE_QUICK_CAPTURE,
            )
            .addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP)
        return PendingIntent.getActivity(
            context,
            10_000 + requestCode,
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
    }

    private fun todayIso(): String =
        SimpleDateFormat("yyyy-MM-dd", Locale.US).format(Date())

    private fun renderRingBitmap(context: Context, progress: Float, overTarget: Boolean): Bitmap {
        val density = context.resources.displayMetrics.density
        val size = (86f * density).roundToInt().coerceAtLeast(86)
        val stroke = 8f * density
        val halfStroke = stroke / 2f
        val bitmap = Bitmap.createBitmap(size, size, Bitmap.Config.ARGB_8888)
        val canvas = Canvas(bitmap)
        val rect = RectF(halfStroke, halfStroke, size - halfStroke, size - halfStroke)
        val trackPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            style = Paint.Style.STROKE
            strokeWidth = stroke
            strokeCap = Paint.Cap.ROUND
            color = Color.rgb(241, 232, 221)
        }
        val progressPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            style = Paint.Style.STROKE
            strokeWidth = stroke
            strokeCap = Paint.Cap.ROUND
            color = if (overTarget) Color.rgb(239, 68, 68) else Color.rgb(245, 158, 11)
        }
        canvas.drawOval(rect, trackPaint)
        if (progress > 0f) {
            canvas.drawArc(rect, -90f, 360f * progress.coerceIn(0f, 1f), false, progressPaint)
        }
        return bitmap
    }
}
