import 'package:flutter/services.dart';

class HomeWidgetService {
  static const quickCaptureAction = 'quick_capture';
  static const _channel = MethodChannel('aifood.shao.one/widgets');

  static Future<void> Function()? _quickCaptureHandler;
  static bool _handlerInstalled = false;

  static void setQuickCaptureHandler(Future<void> Function() handler) {
    _quickCaptureHandler = handler;
    _installHandler();
  }

  static void clearQuickCaptureHandler() {
    _quickCaptureHandler = null;
  }

  static Future<String?> consumeInitialAction() async {
    _installHandler();
    try {
      return await _channel.invokeMethod<String>('consumeInitialAction');
    } on MissingPluginException {
      return null;
    } on PlatformException {
      return null;
    }
  }

  static Future<void> updateCalorieProgress({
    required int consumedCalories,
    required int targetCalories,
    required double proteinGrams,
    required double fatGrams,
    required double carbsGrams,
    required int proteinTargetGrams,
    required int fatTargetGrams,
    required int carbsTargetGrams,
    required int waterTotalMl,
    required int waterGoalMl,
    required String dateIso,
    String? sessionCookie,
  }) async {
    try {
      await _channel.invokeMethod<void>('updateCalorieProgress', {
        'consumedCalories': consumedCalories,
        'targetCalories': targetCalories,
        'proteinGrams': proteinGrams,
        'fatGrams': fatGrams,
        'carbsGrams': carbsGrams,
        'proteinTargetGrams': proteinTargetGrams,
        'fatTargetGrams': fatTargetGrams,
        'carbsTargetGrams': carbsTargetGrams,
        'waterTotalMl': waterTotalMl,
        'waterGoalMl': waterGoalMl,
        'dateIso': dateIso,
        if (sessionCookie != null && sessionCookie.isNotEmpty)
          'sessionCookie': sessionCookie,
        'updatedAtMillis': DateTime.now().millisecondsSinceEpoch,
      });
    } on MissingPluginException {
      // Non-Android platforms have no native home widget.
    } on PlatformException {
      // Widget sync must never block the dashboard.
    }
  }

  static Future<void> clearCalorieProgress() async {
    try {
      await _channel.invokeMethod<void>('clearCalorieProgress');
    } on MissingPluginException {
      // Non-Android platforms have no native home widget.
    } on PlatformException {
      // Logout should proceed even if the launcher widget cannot be refreshed.
    }
  }

  static void _installHandler() {
    if (_handlerInstalled) return;
    _handlerInstalled = true;
    _channel.setMethodCallHandler((call) async {
      if (call.method == 'quickCapture') {
        await _quickCaptureHandler?.call();
      }
    });
  }
}
