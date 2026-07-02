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
    data class DailySnapshot(
        val consumedCalories: Int,
        val targetCalories: Int,
        val proteinGrams: Float,
        val fatGrams: Float,
        val carbsGrams: Float,
        val proteinTargetGrams: Float,
        val fatTargetGrams: Float,
        val carbsTargetGrams: Float,
        val waterTotalMl: Int,
        val waterGoalMl: Int,
        val dateIso: String,
        val waterDateIso: String,
        val updatedAtMillis: Long,
        val waterStatus: String,
    )

    fun saveDailySnapshot(
        context: Context,
        consumedCalories: Int,
        targetCalories: Int,
        proteinGrams: Float,
        fatGrams: Float,
        carbsGrams: Float,
        proteinTargetGrams: Float,
        fatTargetGrams: Float,
        carbsTargetGrams: Float,
        waterTotalMl: Int,
        waterGoalMl: Int,
        dateIso: String,
        updatedAtMillis: Long,
        sessionCookie: String?,
    ) {
        context.getSharedPreferences(HomeWidgetContract.PREFS, Context.MODE_PRIVATE)
            .edit()
            .putInt(HomeWidgetContract.KEY_CONSUMED_CALORIES, consumedCalories.coerceAtLeast(0))
            .putInt(HomeWidgetContract.KEY_TARGET_CALORIES, targetCalories.coerceAtLeast(0))
            .putFloat(HomeWidgetContract.KEY_PROTEIN_GRAMS, proteinGrams.coerceAtLeast(0f))
            .putFloat(HomeWidgetContract.KEY_FAT_GRAMS, fatGrams.coerceAtLeast(0f))
            .putFloat(HomeWidgetContract.KEY_CARBS_GRAMS, carbsGrams.coerceAtLeast(0f))
            .putFloat(HomeWidgetContract.KEY_PROTEIN_TARGET_GRAMS, proteinTargetGrams.coerceAtLeast(0f))
            .putFloat(HomeWidgetContract.KEY_FAT_TARGET_GRAMS, fatTargetGrams.coerceAtLeast(0f))
            .putFloat(HomeWidgetContract.KEY_CARBS_TARGET_GRAMS, carbsTargetGrams.coerceAtLeast(0f))
            .putInt(HomeWidgetContract.KEY_WATER_TOTAL_ML, waterTotalMl.coerceAtLeast(0))
            .putInt(HomeWidgetContract.KEY_WATER_GOAL_ML, waterGoalMl.coerceAtLeast(0))
            .putString(HomeWidgetContract.KEY_DATE_ISO, dateIso)
            .putString(HomeWidgetContract.KEY_WATER_DATE_ISO, dateIso)
            .putLong(HomeWidgetContract.KEY_UPDATED_AT_MILLIS, updatedAtMillis)
            .putString(HomeWidgetContract.KEY_WATER_STATUS, "點一下 +250 ml")
            .apply()
        if (!sessionCookie.isNullOrBlank()) {
            SecureWidgetStore.putSessionCookie(context, sessionCookie)
        }
        updateAllWidgets(context)
    }

    fun saveWaterSnapshot(
        context: Context,
        waterTotalMl: Int,
        dateIso: String = todayIso(),
        status: String = "+250 ml 已記錄",
    ) {
        context.getSharedPreferences(HomeWidgetContract.PREFS, Context.MODE_PRIVATE)
            .edit()
            .putInt(HomeWidgetContract.KEY_WATER_TOTAL_ML, waterTotalMl.coerceAtLeast(0))
            .putString(HomeWidgetContract.KEY_WATER_DATE_ISO, dateIso)
            .putLong(HomeWidgetContract.KEY_UPDATED_AT_MILLIS, System.currentTimeMillis())
            .putString(HomeWidgetContract.KEY_WATER_STATUS, status)
            .apply()
        updateWaterQuickAddWidgets(context)
    }

    fun updateWaterStatus(context: Context, status: String) {
        context.getSharedPreferences(HomeWidgetContract.PREFS, Context.MODE_PRIVATE)
            .edit()
            .putString(HomeWidgetContract.KEY_WATER_STATUS, status)
            .apply()
        updateWaterQuickAddWidgets(context)
    }

    fun sessionCookie(context: Context): String? =
        SecureWidgetStore.sessionCookie(context)

    fun clearDailySnapshot(context: Context) {
        context.getSharedPreferences(HomeWidgetContract.PREFS, Context.MODE_PRIVATE)
            .edit()
            .clear()
            .apply()
        SecureWidgetStore.clear(context)
        updateAllWidgets(context)
    }

    fun updateAllWidgets(context: Context) {
        updateCalorieProgressWidgets(context)
        updateMacroOverviewWidgets(context)
        updateWaterQuickAddWidgets(context)
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

    fun updateMacroOverviewWidgets(context: Context) {
        val manager = AppWidgetManager.getInstance(context)
        val component = ComponentName(context, MacroOverviewWidgetProvider::class.java)
        updateMacroOverviewWidgets(context, manager, manager.getAppWidgetIds(component))
    }

    fun updateMacroOverviewWidgets(
        context: Context,
        appWidgetManager: AppWidgetManager,
        appWidgetIds: IntArray,
    ) {
        appWidgetIds.forEach { id ->
            appWidgetManager.updateAppWidget(id, macroOverviewViews(context, id))
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

    fun updateWaterQuickAddWidgets(context: Context) {
        val manager = AppWidgetManager.getInstance(context)
        val component = ComponentName(context, WaterQuickAddWidgetProvider::class.java)
        updateWaterQuickAddWidgets(context, manager, manager.getAppWidgetIds(component))
    }

    fun updateWaterQuickAddWidgets(
        context: Context,
        appWidgetManager: AppWidgetManager,
        appWidgetIds: IntArray,
    ) {
        appWidgetIds.forEach { id ->
            appWidgetManager.updateAppWidget(id, waterQuickAddViews(context, id))
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
                renderRingBitmap(context, progress, overTarget, 86f),
            )
        } else {
            views.setTextViewText(R.id.calorie_progress_percent, "--")
            views.setTextViewText(R.id.calorie_consumed_target, "-- / ---- kcal")
            views.setTextViewText(R.id.calorie_remaining, "開啟 App 同步")
            views.setTextColor(R.id.calorie_remaining, Color.rgb(120, 53, 15))
            views.setTextViewText(R.id.calorie_widget_status, "等待今日熱量")
            views.setImageViewBitmap(R.id.calorie_ring, renderRingBitmap(context, 0f, false, 86f))
        }

        views.setOnClickPendingIntent(
            R.id.calorie_widget_root,
            openAppPendingIntent(context, appWidgetId),
        )
        return views
    }

    private fun macroOverviewViews(context: Context, appWidgetId: Int): RemoteViews {
        val views = RemoteViews(context.packageName, R.layout.widget_macro_overview)
        val snapshot = readSnapshot(context)
        val fresh = snapshot != null && snapshot.dateIso == todayIso()

        if (fresh && snapshot != null && snapshot.targetCalories > 0) {
            val calorieProgress =
                (snapshot.consumedCalories.toFloat() / snapshot.targetCalories).coerceIn(0f, 1f)
            val remaining = snapshot.targetCalories - snapshot.consumedCalories
            val overTarget = remaining < 0

            views.setTextViewText(R.id.macro_calorie_percent, "${(calorieProgress * 100).roundToInt()}%")
            views.setTextViewText(
                R.id.macro_calorie_text,
                "${snapshot.consumedCalories} / ${snapshot.targetCalories} kcal",
            )
            views.setTextViewText(
                R.id.macro_remaining_text,
                if (overTarget) "超出 ${-remaining} kcal" else "剩餘 $remaining kcal",
            )
            views.setImageViewBitmap(
                R.id.macro_calorie_ring,
                renderRingBitmap(context, calorieProgress, overTarget, 72f),
            )
            bindMacroRow(
                context,
                views,
                R.id.macro_protein_bar,
                R.id.macro_protein_value,
                snapshot.proteinGrams,
                snapshot.proteinTargetGrams,
                Color.rgb(14, 165, 233),
            )
            bindMacroRow(
                context,
                views,
                R.id.macro_fat_bar,
                R.id.macro_fat_value,
                snapshot.fatGrams,
                snapshot.fatTargetGrams,
                Color.rgb(251, 113, 133),
            )
            bindMacroRow(
                context,
                views,
                R.id.macro_carbs_bar,
                R.id.macro_carbs_value,
                snapshot.carbsGrams,
                snapshot.carbsTargetGrams,
                Color.rgb(56, 189, 248),
            )
            views.setTextViewText(R.id.macro_widget_status, "已同步今日資料")
        } else {
            views.setTextViewText(R.id.macro_calorie_percent, "--")
            views.setTextViewText(R.id.macro_calorie_text, "-- / ---- kcal")
            views.setTextViewText(R.id.macro_remaining_text, "開啟 App 同步")
            views.setTextViewText(R.id.macro_protein_value, "-- / --g")
            views.setTextViewText(R.id.macro_fat_value, "-- / --g")
            views.setTextViewText(R.id.macro_carbs_value, "-- / --g")
            views.setTextViewText(R.id.macro_widget_status, "等待今日營養資料")
            views.setImageViewBitmap(R.id.macro_calorie_ring, renderRingBitmap(context, 0f, false, 72f))
            views.setImageViewBitmap(R.id.macro_protein_bar, renderBarBitmap(context, 0f, Color.rgb(14, 165, 233)))
            views.setImageViewBitmap(R.id.macro_fat_bar, renderBarBitmap(context, 0f, Color.rgb(251, 113, 133)))
            views.setImageViewBitmap(R.id.macro_carbs_bar, renderBarBitmap(context, 0f, Color.rgb(56, 189, 248)))
        }

        views.setOnClickPendingIntent(
            R.id.macro_widget_root,
            openAppPendingIntent(context, 20_000 + appWidgetId),
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

    private fun waterQuickAddViews(context: Context, appWidgetId: Int): RemoteViews {
        val views = RemoteViews(context.packageName, R.layout.widget_water_quick_add)
        val snapshot = readSnapshot(context)
        val fresh = snapshot != null && snapshot.waterDateIso == todayIso()
        val total = if (fresh && snapshot != null) snapshot.waterTotalMl else 0
        val goal = snapshot?.waterGoalMl?.takeIf { it > 0 } ?: 2000
        val progress = (total.toFloat() / goal.toFloat()).coerceIn(0f, 1f)

        views.setTextViewText(R.id.water_total_goal, "$total / $goal ml")
        views.setTextViewText(R.id.water_percent, "${(progress * 100).roundToInt()}%")
        views.setTextViewText(
            R.id.water_widget_status,
            if (fresh && snapshot != null) snapshot.waterStatus else "點一下 +250 ml",
        )
        views.setImageViewBitmap(
            R.id.water_progress_bar,
            renderBarBitmap(context, progress, Color.rgb(14, 165, 233), 150f, 9f),
        )

        val pendingIntent = waterQuickAddPendingIntent(context, appWidgetId)
        views.setOnClickPendingIntent(R.id.water_widget_root, pendingIntent)
        views.setOnClickPendingIntent(R.id.water_add_button, pendingIntent)
        return views
    }

    private fun bindMacroRow(
        context: Context,
        views: RemoteViews,
        barId: Int,
        valueId: Int,
        value: Float,
        target: Float,
        color: Int,
    ) {
        val progress = if (target > 0f) (value / target).coerceIn(0f, 1f) else 0f
        views.setTextViewText(valueId, "${fmtGram(value)} / ${fmtGram(target)}g")
        views.setImageViewBitmap(barId, renderBarBitmap(context, progress, color))
    }

    private fun readSnapshot(context: Context): DailySnapshot? {
        val prefs = context.getSharedPreferences(HomeWidgetContract.PREFS, Context.MODE_PRIVATE)
        if (!prefs.contains(HomeWidgetContract.KEY_CONSUMED_CALORIES)) return null
        return DailySnapshot(
            consumedCalories = prefs.getInt(HomeWidgetContract.KEY_CONSUMED_CALORIES, 0),
            targetCalories = prefs.getInt(HomeWidgetContract.KEY_TARGET_CALORIES, 0),
            proteinGrams = prefs.getFloat(HomeWidgetContract.KEY_PROTEIN_GRAMS, 0f),
            fatGrams = prefs.getFloat(HomeWidgetContract.KEY_FAT_GRAMS, 0f),
            carbsGrams = prefs.getFloat(HomeWidgetContract.KEY_CARBS_GRAMS, 0f),
            proteinTargetGrams = prefs.getFloat(HomeWidgetContract.KEY_PROTEIN_TARGET_GRAMS, 0f),
            fatTargetGrams = prefs.getFloat(HomeWidgetContract.KEY_FAT_TARGET_GRAMS, 0f),
            carbsTargetGrams = prefs.getFloat(HomeWidgetContract.KEY_CARBS_TARGET_GRAMS, 0f),
            waterTotalMl = prefs.getInt(HomeWidgetContract.KEY_WATER_TOTAL_ML, 0),
            waterGoalMl = prefs.getInt(HomeWidgetContract.KEY_WATER_GOAL_ML, 2000),
            dateIso = prefs.getString(HomeWidgetContract.KEY_DATE_ISO, "") ?: "",
            waterDateIso = prefs.getString(HomeWidgetContract.KEY_WATER_DATE_ISO, "") ?: "",
            updatedAtMillis = prefs.getLong(HomeWidgetContract.KEY_UPDATED_AT_MILLIS, 0L),
            waterStatus = prefs.getString(HomeWidgetContract.KEY_WATER_STATUS, "點一下 +250 ml")
                ?: "點一下 +250 ml",
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

    private fun waterQuickAddPendingIntent(context: Context, requestCode: Int): PendingIntent {
        val intent = Intent(context, WaterQuickAddReceiver::class.java)
            .setAction(HomeWidgetContract.ACTION_WATER_QUICK_ADD)
        return PendingIntent.getBroadcast(
            context,
            30_000 + requestCode,
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
    }

    private fun todayIso(): String =
        SimpleDateFormat("yyyy-MM-dd", Locale.US).format(Date())

    private fun fmtGram(value: Float): String = value.roundToInt().toString()

    private fun renderRingBitmap(
        context: Context,
        progress: Float,
        overTarget: Boolean,
        sizeDp: Float,
    ): Bitmap {
        val density = context.resources.displayMetrics.density
        val size = (sizeDp * density).roundToInt().coerceAtLeast(sizeDp.roundToInt())
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

    private fun renderBarBitmap(
        context: Context,
        progress: Float,
        barColor: Int,
        widthDp: Float = 138f,
        heightDp: Float = 8f,
    ): Bitmap {
        val density = context.resources.displayMetrics.density
        val width = (widthDp * density).roundToInt().coerceAtLeast(widthDp.roundToInt())
        val height = (heightDp * density).roundToInt().coerceAtLeast(heightDp.roundToInt())
        val radius = height / 2f
        val bitmap = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888)
        val canvas = Canvas(bitmap)
        val rect = RectF(0f, 0f, width.toFloat(), height.toFloat())
        canvas.drawRoundRect(
            rect,
            radius,
            radius,
            Paint(Paint.ANTI_ALIAS_FLAG).apply { color = Color.rgb(231, 229, 228) },
        )
        if (progress > 0f) {
            val filled = RectF(0f, 0f, width * progress.coerceIn(0f, 1f), height.toFloat())
            canvas.drawRoundRect(
                filled,
                radius,
                radius,
                Paint(Paint.ANTI_ALIAS_FLAG).apply { color = barColor },
            )
        }
        return bitmap
    }

}
