import 'package:dio/dio.dart';
import 'package:open_filex/open_filex.dart';
import 'package:package_info_plus/package_info_plus.dart';
import 'package:path_provider/path_provider.dart';

import 'api_client.dart';

class AppVersionInfo {
  final String currentVersion; // this build, e.g. 1.0.0
  final String latestVersion; // server-reported latest
  final String apkUrl;
  final String releaseNotes;
  final String webVersion;

  AppVersionInfo({
    required this.currentVersion,
    required this.latestVersion,
    required this.apkUrl,
    required this.releaseNotes,
    required this.webVersion,
  });

  bool get updateAvailable =>
      apkUrl.isNotEmpty && _isNewer(latestVersion, currentVersion);
}

/// Checks for newer app releases and installs the APK in one tap.
class UpdateService {
  static final _api = ApiClient.instance;

  static Future<String> currentVersion() async {
    final info = await PackageInfo.fromPlatform();
    return info.version; // e.g. "1.0.0" (build number excluded)
  }

  static Future<AppVersionInfo> check() async {
    final current = await currentVersion();
    try {
      final res = await _api.get('/api/app/version');
      final data = res.data is Map ? res.data as Map : const {};
      return AppVersionInfo(
        currentVersion: current,
        latestVersion: (data['latestVersion'] as String?) ?? current,
        apkUrl: (data['apkUrl'] as String?) ?? '',
        releaseNotes: (data['releaseNotes'] as String?) ?? '',
        webVersion: (data['webVersion'] as String?) ?? '',
      );
    } catch (_) {
      return AppVersionInfo(
        currentVersion: current,
        latestVersion: current,
        apkUrl: '',
        releaseNotes: '',
        webVersion: '',
      );
    }
  }

  /// Downloads the APK (reporting 0..1 progress) and opens the system installer.
  static Future<void> downloadAndInstall(
    String apkUrl, {
    void Function(double progress)? onProgress,
  }) async {
    final dir = await getTemporaryDirectory();
    final path = '${dir.path}/ai_food_update.apk';
    final dio = Dio();
    await dio.download(
      apkUrl,
      path,
      onReceiveProgress: (received, total) {
        if (total > 0 && onProgress != null) onProgress(received / total);
      },
    );
    final result = await OpenFilex.open(path);
    if (result.type != ResultType.done) {
      throw ApiException('無法開啟安裝程式：${result.message}');
    }
  }
}

/// True when [latest] is a higher semantic version than [current].
bool _isNewer(String latest, String current) {
  List<int> parse(String v) => v
      .split('+')
      .first
      .split('.')
      .map((e) => int.tryParse(e.trim()) ?? 0)
      .toList();
  final a = parse(latest);
  final b = parse(current);
  for (var i = 0; i < 3; i++) {
    final x = i < a.length ? a[i] : 0;
    final y = i < b.length ? b[i] : 0;
    if (x != y) return x > y;
  }
  return false;
}
