package aifood.shao.one

object HomeWidgetContract {
    const val WIDGET_CHANNEL = "aifood.shao.one/widgets"

    const val ACTION_QUICK_CAPTURE = "aifood.shao.one.action.QUICK_CAPTURE"
    const val ACTION_WATER_QUICK_ADD = "aifood.shao.one.action.WATER_QUICK_ADD"
    const val EXTRA_WIDGET_ACTION = "aifood.shao.one.extra.WIDGET_ACTION"
    const val ACTION_VALUE_QUICK_CAPTURE = "quick_capture"

    const val PREFS = "aifood_widgets"

    // Encrypted (androidx.security) store; only the session cookie lives here so
    // it is never persisted in plaintext SharedPreferences.
    const val SECURE_PREFS = "aifood_widgets_secure"

    const val API_BASE_URL = "https://aifood.shao.one"
    const val KEY_CONSUMED_CALORIES = "consumed_calories"
    const val KEY_TARGET_CALORIES = "target_calories"
    const val KEY_PROTEIN_GRAMS = "protein_grams"
    const val KEY_FAT_GRAMS = "fat_grams"
    const val KEY_CARBS_GRAMS = "carbs_grams"
    const val KEY_PROTEIN_TARGET_GRAMS = "protein_target_grams"
    const val KEY_FAT_TARGET_GRAMS = "fat_target_grams"
    const val KEY_CARBS_TARGET_GRAMS = "carbs_target_grams"
    const val KEY_WATER_TOTAL_ML = "water_total_ml"
    const val KEY_WATER_GOAL_ML = "water_goal_ml"
    const val KEY_SESSION_COOKIE = "session_cookie"
    const val KEY_WATER_STATUS = "water_status"
    const val KEY_DATE_ISO = "date_iso"
    const val KEY_WATER_DATE_ISO = "water_date_iso"
    const val KEY_UPDATED_AT_MILLIS = "updated_at_millis"
}
