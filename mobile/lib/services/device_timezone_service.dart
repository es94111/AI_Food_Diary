import 'package:flutter/services.dart';

import 'api_client.dart';

/// Reads Android's IANA timezone ID and persists it through the shared profile
/// timezone endpoint used by the Web client.
class DeviceTimezoneService {
  static const _channel = MethodChannel('aifood.shao.one/timezone');

  static Future<String?> localTimeZoneId() async {
    try {
      final timezone = await _channel.invokeMethod<String>('getTimeZoneId');
      final normalized = timezone?.trim();
      return normalized == null || normalized.isEmpty ? null : normalized;
    } catch (_) {
      return null;
    }
  }

  static Future<void> report(String timezone) async {
    try {
      await ApiClient.instance.post(
        '/api/me/timezone',
        data: {'timezone': timezone},
      );
    } catch (_) {
      // Streak requests also include the zone directly, so reporting is best effort.
    }
  }
}
