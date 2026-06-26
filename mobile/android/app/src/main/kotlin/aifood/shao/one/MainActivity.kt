package aifood.shao.one

import android.content.ActivityNotFoundException
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.embedding.android.FlutterFragmentActivity
import io.flutter.plugin.common.MethodChannel

// FlutterFragmentActivity (a ComponentActivity) is required so the `health`
// plugin can register its ActivityResultLauncher and launch the Health Connect
// permission screen. Plain FlutterActivity logs "Permission launcher not found".
class MainActivity : FlutterFragmentActivity() {
    private val updateChannel = "aifood.shao.one/update"

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
}
