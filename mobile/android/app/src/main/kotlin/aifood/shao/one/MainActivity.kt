package aifood.shao.one

import android.content.ActivityNotFoundException
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings
import androidx.core.content.FileProvider
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.embedding.android.FlutterFragmentActivity
import io.flutter.plugin.common.MethodCall
import io.flutter.plugin.common.MethodChannel
import java.io.File

// FlutterFragmentActivity (a ComponentActivity) is required so the `health`
// plugin can register its ActivityResultLauncher and launch the Health Connect
// permission screen. Plain FlutterActivity logs "Permission launcher not found".
class MainActivity : FlutterFragmentActivity() {
    private val updateChannel = "aifood.shao.one/update"
    private var widgetChannel: MethodChannel? = null

    override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
        super.configureFlutterEngine(flutterEngine)
        MethodChannel(flutterEngine.dartExecutor.binaryMessenger, updateChannel)
            .setMethodCallHandler { call, result ->
                when (call.method) {
                    "canRequestPackageInstalls" -> {
                        result.success(canRequestPackageInstalls())
                    }
                    "openUnknownAppSourcesSettings" -> {
                        try {
                            openUnknownAppSourcesSettings()
                            result.success(true)
                        } catch (e: ActivityNotFoundException) {
                            result.error("settings_unavailable", e.message, null)
                        }
                    }
                    "openApk" -> {
                        val path = call.argument<String>("path") ?: ""
                        try {
                            openApk(File(path))
                            result.success(true)
                        } catch (e: SecurityException) {
                            result.error("open_apk_security", e.message, null)
                        } catch (e: ActivityNotFoundException) {
                            result.error("open_apk_no_activity", e.message, null)
                        } catch (e: IllegalArgumentException) {
                            result.error("open_apk_provider", e.message, null)
                        } catch (e: Exception) {
                            result.error("open_apk_failed", e.message, null)
                        }
                    }
                    else -> result.notImplemented()
                }
            }
        widgetChannel = MethodChannel(
            flutterEngine.dartExecutor.binaryMessenger,
            HomeWidgetContract.WIDGET_CHANNEL,
        )
        widgetChannel?.setMethodCallHandler { call, result ->
            when (call.method) {
                "updateCalorieProgress" -> {
                    HomeWidgetUpdater.saveDailySnapshot(
                        this,
                        consumedCalories = intArgument(call, "consumedCalories") ?: 0,
                        targetCalories = intArgument(call, "targetCalories") ?: 0,
                        proteinGrams = floatArgument(call, "proteinGrams") ?: 0f,
                        fatGrams = floatArgument(call, "fatGrams") ?: 0f,
                        carbsGrams = floatArgument(call, "carbsGrams") ?: 0f,
                        proteinTargetGrams = floatArgument(call, "proteinTargetGrams") ?: 0f,
                        fatTargetGrams = floatArgument(call, "fatTargetGrams") ?: 0f,
                        carbsTargetGrams = floatArgument(call, "carbsTargetGrams") ?: 0f,
                        waterTotalMl = intArgument(call, "waterTotalMl") ?: 0,
                        waterGoalMl = intArgument(call, "waterGoalMl") ?: 2000,
                        yesterdaySummaryDateIso =
                            call.argument<String>("yesterdaySummaryDateIso") ?: "",
                        yesterdaySummaryText =
                            call.argument<String>("yesterdaySummaryText") ?: "",
                        yesterdayRecommendationText =
                            call.argument<String>("yesterdayRecommendationText") ?: "",
                        activeCalories = intArgument(call, "activeCalories") ?: -1,
                        activeCaloriesDateIso =
                            call.argument<String>("activeCaloriesDateIso") ?: "",
                        dateIso = call.argument<String>("dateIso") ?: "",
                        updatedAtMillis =
                            longArgument(call, "updatedAtMillis") ?: System.currentTimeMillis(),
                        sessionCookie = call.argument<String>("sessionCookie"),
                    )
                    result.success(true)
                }
                "clearCalorieProgress" -> {
                    HomeWidgetUpdater.clearDailySnapshot(this)
                    result.success(true)
                }
                "consumeInitialAction" -> {
                    val action = widgetLaunchAction(intent)
                    if (action != null) clearWidgetLaunchAction(intent)
                    result.success(action)
                }
                else -> result.notImplemented()
            }
        }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        dispatchWidgetLaunchAction(intent)
    }

    private fun canRequestPackageInstalls(): Boolean {
        return Build.VERSION.SDK_INT < Build.VERSION_CODES.O ||
            packageManager.canRequestPackageInstalls()
    }

    private fun openUnknownAppSourcesSettings() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val intent = Intent(
                Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                Uri.parse("package:$packageName")
            )
            if (startSettingsIntent(intent)) return
        }

        if (!startSettingsIntent(Intent(Settings.ACTION_SECURITY_SETTINGS))) {
            throw ActivityNotFoundException("No Android settings activity can manage install permissions")
        }
    }

    /// Opens the downloaded APK with the system package installer. Uses the
    /// flutter_downloader FileProvider so the same authority already declared
    /// in AndroidManifest.xml can expose app-private files on Android 7+.
    private fun openApk(file: File) {
        if (!file.exists()) {
            throw IllegalArgumentException("APK file does not exist: ${file.path}")
        }
        val uri = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
            FileProvider.getUriForFile(
                this,
                "$packageName.flutter_downloader.provider",
                file
            )
        } else {
            Uri.fromFile(file)
        }
        val intent = Intent(Intent.ACTION_VIEW).apply {
            setDataAndType(uri, "application/vnd.android.package-archive")
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_GRANT_READ_URI_PERMISSION
        }
        try {
            startActivity(intent)
        } catch (e: ActivityNotFoundException) {
            throw ActivityNotFoundException("No package installer can handle this APK")
        }
    }

    private fun startSettingsIntent(intent: Intent): Boolean {
        return try {
            startActivity(intent)
            true
        } catch (_: ActivityNotFoundException) {
            false
        }
    }

    private fun dispatchWidgetLaunchAction(intent: Intent?) {
        val action = widgetLaunchAction(intent) ?: return
        clearWidgetLaunchAction(intent)
        widgetChannel?.invokeMethod("quickCapture", action)
    }

    private fun widgetLaunchAction(intent: Intent?): String? {
        if (intent == null) return null
        val extra = intent.getStringExtra(HomeWidgetContract.EXTRA_WIDGET_ACTION)
        return if (
            intent.action == HomeWidgetContract.ACTION_QUICK_CAPTURE ||
            extra == HomeWidgetContract.ACTION_VALUE_QUICK_CAPTURE
        ) {
            HomeWidgetContract.ACTION_VALUE_QUICK_CAPTURE
        } else {
            null
        }
    }

    private fun clearWidgetLaunchAction(intent: Intent?) {
        intent ?: return
        intent.action = Intent.ACTION_MAIN
        intent.removeExtra(HomeWidgetContract.EXTRA_WIDGET_ACTION)
    }

    private fun intArgument(call: MethodCall, name: String): Int? {
        return when (val value = call.argument<Any>(name)) {
            is Number -> value.toInt()
            is String -> value.toIntOrNull()
            else -> null
        }
    }

    private fun longArgument(call: MethodCall, name: String): Long? {
        return when (val value = call.argument<Any>(name)) {
            is Number -> value.toLong()
            is String -> value.toLongOrNull()
            else -> null
        }
    }

    private fun floatArgument(call: MethodCall, name: String): Float? {
        return when (val value = call.argument<Any>(name)) {
            is Number -> value.toFloat()
            is String -> value.toFloatOrNull()
            else -> null
        }
    }
}
