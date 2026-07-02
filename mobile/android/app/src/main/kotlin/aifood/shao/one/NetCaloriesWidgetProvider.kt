package aifood.shao.one

import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.Context

class NetCaloriesWidgetProvider : AppWidgetProvider() {
    override fun onUpdate(
        context: Context,
        appWidgetManager: AppWidgetManager,
        appWidgetIds: IntArray,
    ) {
        HomeWidgetUpdater.updateNetCaloriesWidgets(context, appWidgetManager, appWidgetIds)
    }
}
