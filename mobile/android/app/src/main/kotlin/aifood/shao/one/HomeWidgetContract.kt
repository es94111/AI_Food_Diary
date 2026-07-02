package aifood.shao.one

object HomeWidgetContract {
    const val WIDGET_CHANNEL = "aifood.shao.one/widgets"

    const val ACTION_QUICK_CAPTURE = "aifood.shao.one.action.QUICK_CAPTURE"
    const val EXTRA_WIDGET_ACTION = "aifood.shao.one.extra.WIDGET_ACTION"
    const val ACTION_VALUE_QUICK_CAPTURE = "quick_capture"

    const val PREFS = "aifood_widgets"
    const val KEY_CONSUMED_CALORIES = "consumed_calories"
    const val KEY_TARGET_CALORIES = "target_calories"
    const val KEY_DATE_ISO = "date_iso"
    const val KEY_UPDATED_AT_MILLIS = "updated_at_millis"
}
