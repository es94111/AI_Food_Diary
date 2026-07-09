package aifood.shao.one

import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.Context

class WaterQuickAddWidgetProvider : AppWidgetProvider() {
    override fun onUpdate(
        context: Context,
        appWidgetManager: AppWidgetManager,
        appWidgetIds: IntArray,
    ) {
        HomeWidgetUpdater.updateWaterQuickAddWidgets(context, appWidgetManager, appWidgetIds)
    }
}
