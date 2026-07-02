package aifood.shao.one

import android.content.ActivityNotFoundException
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.embedding.android.FlutterFragmentActivity
import io.flutter.plugin.common.MethodCall
import io.flutter.plugin.common.MethodChannel

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
                    HomeWidgetUpdater.saveCalorieProgress(
                        this,
                        intArgument(call, "consumedCalories") ?: 0,
                        intArgument(call, "targetCalories") ?: 0,
                        call.argument<String>("dateIso") ?: "",
                        longArgument(call, "updatedAtMillis") ?: System.currentTimeMillis(),
                    )
                    result.success(true)
                }
                "clearCalorieProgress" -> {
                    HomeWidgetUpdater.clearCalorieProgress(this)
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
}
