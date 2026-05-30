package dev.fluttercommunity.plus.device_info;

import android.app.ActivityManager;
import android.content.Context;
import android.content.pm.FeatureInfo;
import android.content.pm.PackageManager;
import android.os.Build;
import android.os.Environment;
import android.os.StatFs;
import android.provider.Settings;
import androidx.annotation.NonNull;
import io.flutter.embedding.engine.plugins.FlutterPlugin;
import io.flutter.plugin.common.BinaryMessenger;
import io.flutter.plugin.common.MethodCall;
import io.flutter.plugin.common.MethodChannel;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

public final class DeviceInfoPlusPlugin implements FlutterPlugin, MethodChannel.MethodCallHandler {
    private MethodChannel methodChannel;
    private PackageManager packageManager;
    private ActivityManager activityManager;
    private android.content.ContentResolver contentResolver;

    @Override
    public void onAttachedToEngine(@NonNull FlutterPluginBinding binding) {
        setupMethodChannel(binding.getBinaryMessenger(), binding.getApplicationContext());
    }

    @Override
    public void onDetachedFromEngine(@NonNull FlutterPluginBinding binding) {
        if (methodChannel != null) {
            methodChannel.setMethodCallHandler(null);
            methodChannel = null;
        }
    }

    private void setupMethodChannel(BinaryMessenger messenger, Context context) {
        packageManager = context.getPackageManager();
        activityManager = (ActivityManager) context.getSystemService(Context.ACTIVITY_SERVICE);
        contentResolver = context.getContentResolver();
        methodChannel = new MethodChannel(messenger, "dev.fluttercommunity.plus/device_info");
        methodChannel.setMethodCallHandler(this);
    }

    @Override
    public void onMethodCall(@NonNull MethodCall call, @NonNull MethodChannel.Result result) {
        if (!"getDeviceInfo".equals(call.method)) {
            result.notImplemented();
            return;
        }

        Map<String, Object> build = new HashMap<>();
        build.put("board", Build.BOARD);
        build.put("bootloader", Build.BOOTLOADER);
        build.put("brand", Build.BRAND);
        build.put("device", Build.DEVICE);
        build.put("display", Build.DISPLAY);
        build.put("fingerprint", Build.FINGERPRINT);
        build.put("hardware", Build.HARDWARE);
        build.put("host", Build.HOST);
        build.put("id", Build.ID);
        build.put("manufacturer", Build.MANUFACTURER);
        build.put("model", Build.MODEL);
        build.put("product", Build.PRODUCT);

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N_MR1) {
            String name = Settings.Global.getString(contentResolver, Settings.Global.DEVICE_NAME);
            build.put("name", name != null ? name : "");
        }

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            build.put("supported32BitAbis", Arrays.asList(Build.SUPPORTED_32_BIT_ABIS));
            build.put("supported64BitAbis", Arrays.asList(Build.SUPPORTED_64_BIT_ABIS));
            build.put("supportedAbis", Arrays.asList(Build.SUPPORTED_ABIS));
        } else {
            build.put("supported32BitAbis", new ArrayList<String>());
            build.put("supported64BitAbis", new ArrayList<String>());
            build.put("supportedAbis", new ArrayList<String>());
        }

        build.put("tags", Build.TAGS);
        build.put("type", Build.TYPE);
        build.put("isPhysicalDevice", !isEmulator());
        build.put("systemFeatures", getSystemFeatures());

        StatFs statFs = new StatFs(Environment.getDataDirectory().getPath());
        build.put("freeDiskSize", statFs.getFreeBytes());
        build.put("totalDiskSize", statFs.getTotalBytes());

        Map<String, Object> version = new HashMap<>();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            version.put("baseOS", Build.VERSION.BASE_OS);
            version.put("previewSdkInt", Build.VERSION.PREVIEW_SDK_INT);
            version.put("securityPatch", Build.VERSION.SECURITY_PATCH);
        }
        version.put("codename", Build.VERSION.CODENAME);
        version.put("incremental", Build.VERSION.INCREMENTAL);
        version.put("release", Build.VERSION.RELEASE);
        version.put("sdkInt", Build.VERSION.SDK_INT);
        build.put("version", version);

        ActivityManager.MemoryInfo memoryInfo = new ActivityManager.MemoryInfo();
        activityManager.getMemoryInfo(memoryInfo);
        build.put("isLowRamDevice", memoryInfo.lowMemory);
        build.put("physicalRamSize", memoryInfo.totalMem / 1048576L);
        build.put("availableRamSize", memoryInfo.availMem / 1048576L);

        result.success(build);
    }

    private List<String> getSystemFeatures() {
        List<String> features = new ArrayList<>();
        FeatureInfo[] featureInfos = packageManager.getSystemAvailableFeatures();
        for (FeatureInfo featureInfo : featureInfos) {
            if (featureInfo.name != null) {
                features.add(featureInfo.name);
            }
        }
        return features;
    }

    private boolean isEmulator() {
        return (Build.BRAND.startsWith("generic") && Build.DEVICE.startsWith("generic"))
                || Build.FINGERPRINT.startsWith("generic")
                || Build.FINGERPRINT.startsWith("unknown")
                || Build.HARDWARE.contains("goldfish")
                || Build.HARDWARE.contains("ranchu")
                || Build.MODEL.contains("google_sdk")
                || Build.MODEL.contains("Emulator")
                || Build.MODEL.contains("Android SDK built for x86")
                || Build.MANUFACTURER.contains("Genymotion")
                || Build.PRODUCT.contains("sdk")
                || Build.PRODUCT.contains("vbox86p")
                || Build.PRODUCT.contains("emulator")
                || Build.PRODUCT.contains("simulator");
    }
}
