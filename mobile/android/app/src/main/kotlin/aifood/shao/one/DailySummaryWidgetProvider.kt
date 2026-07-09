package aifood.shao.one

import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.Context

class DailySummaryWidgetProvider : AppWidgetProvider() {
    override fun onUpdate(
        context: Context,
        appWidgetManager: AppWidgetManager,
        appWidgetIds: IntArray,
    ) {
        HomeWidgetUpdater.updateDailySummaryWidgets(context, appWidgetManager, appWidgetIds)
    }
}
