import 'dart:async';
import 'dart:io';
import 'dart:isolate';
import 'dart:ui';

import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';
import 'package:flutter_downloader/flutter_downloader.dart';
import 'package:open_filex/open_filex.dart';
import 'package:package_info_plus/package_info_plus.dart';
import 'package:path_provider/path_provider.dart';
import 'package:sentry_flutter/sentry_flutter.dart';

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

/// Coarse state of the in-flight update download, surfaced to the UI through
/// [UpdateService.status] so the progress sheet can react without knowing
/// anything about flutter_downloader.
enum DownloadStatus { idle, running, complete, failed }

/// Checks for newer app releases and installs the APK in one tap.
///
/// On Android the download is handed to the OS-level DownloadManager via
/// flutter_downloader, so it survives the app being switched away or killed and
/// shows a tappable "download complete" notification. On other platforms it
/// falls back to a foreground Dio download (updates only ship as an Android
/// APK, so this path is effectively a safety net).
class UpdateService {
  static final _api = ApiClient.instance;
  static const _channel = MethodChannel('aifood.shao.one/update');

  static Future<bool> canRequestPackageInstalls() async {
    if (!Platform.isAndroid) return true;
    try {
      final bool? result = await _channel.invokeMethod<bool>('canRequestPackageInstalls');
      return result ?? false;
    } catch (_) {
      return false;
    }
  }

  static Future<void> openInstallPermissionSettings() async {
    if (!Platform.isAndroid) return;
    await _channel.invokeMethod<void>('openUnknownAppSourcesSettings');
  }

  /// Name the background download isolate looks up to send progress back to the
  /// UI isolate. Must be stable across isolates, hence a top-level const.
  static const portName = 'ai_food_update_downloader';

  static final ReceivePort _port = ReceivePort();
  static bool _initialised = false;
  static Future<void>? _initialising;
  static Future<void>? _starting;
  static String? _taskId;
  static String? _activeApkUrl;
  static int _backgroundFailures = 0;
  static bool _recoveringBackgroundFailure = false;
  static const _maxBackgroundRetries = 1;

  /// 0..1 download progress.
  static final ValueNotifier<double> progress = ValueNotifier(0);
  static final ValueNotifier<DownloadStatus> status = ValueNotifier(
    DownloadStatus.idle,
  );

  /// Human-readable reason for the last [DownloadStatus.failed], if any.
  static String? lastError;

  /// True where the native background downloader is available.
  static bool get backgroundSupported => !kIsWeb && Platform.isAndroid;

  /// One-time setup from main(): boots flutter_downloader and wires the
  /// background isolate's progress messages to [progress]/[status]. Safe (and
  /// cheap) to call on platforms without background support — it just no-ops.
  static Future<void> init() async {
    if (!backgroundSupported || _initialised) return;
    // Splash startup is time-capped, so a user can reach the update action
    // while this initialization is still running. Share one future across all
    // callers instead of allowing enqueue() to race plugin initialization.
    final inFlight = _initialising;
    if (inFlight != null) {
      await inFlight;
      return;
    }

    final future = _initializeBackgroundDownloader();
    _initialising = future;
    try {
      await future;
      _initialised = true;
    } finally {
      _initialising = null;
    }
  }

  static Future<void> _initializeBackgroundDownloader() async {
    await FlutterDownloader.initialize(debug: kDebugMode);
    IsolateNameServer.removePortNameMapping(portName);
    IsolateNameServer.registerPortWithName(_port.sendPort, portName);
    _port.listen((message) {
      final data = message as List;
      final id = data[0] as String;
      final st = DownloadTaskStatus.fromInt(data[1] as int);
      final pr = data[2] as int;
      // Ignore callbacks for any earlier/stale task.
      if (_taskId != null && id == _taskId) {
        unawaited(_onBackgroundUpdate(st, pr));
      }
    });
    await FlutterDownloader.registerCallback(downloadCallback, step: 2);
    await _restoreSingleActiveTask();
  }

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
        apkUrl: _resolveApkUrl((data['apkUrl'] as String?) ?? ''),
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

  /// Starts the update download, resetting [progress]/[status] first. Returns
  /// once the download has been *started* (not finished) on Android — progress
  /// then flows through [progress]/[status]. On the foreground fallback it
  /// returns once the download+install attempt completes.
  static Future<void> start(String apkUrl) async {
    final inFlight = _starting;
    if (inFlight != null) {
      await inFlight;
      return;
    }

    final future = _start(apkUrl);
    _starting = future;
    try {
      await future;
    } finally {
      _starting = null;
    }
  }

  static Future<void> _start(String apkUrl) async {
    lastError = null;
    _activeApkUrl = apkUrl;
    _backgroundFailures = 0;
    if (backgroundSupported) {
      // init() normally starts from the splash screen, but that work has a
      // deadline and may still be running when the user taps update.
      await init();
      if (await _reuseSingleActiveTask()) return;
      progress.value = 0;
      status.value = DownloadStatus.running;
      await _startBackground(apkUrl);
    } else {
      progress.value = 0;
      status.value = DownloadStatus.running;
      await _foregroundDownloadAndInstall(apkUrl);
    }
  }

  // ---- Android background path (DownloadManager via flutter_downloader) ----

  static Future<void> _startBackground(String apkUrl) async {
    _activeApkUrl = apkUrl;
    final dir = await _backgroundDir();
    if (!await dir.exists()) {
      await dir.create(recursive: true);
    }
    await _removeStaleUpdateTasks();
    // Remove a stale APK so DownloadManager writes "ai_food_update.apk" rather
    // than "ai_food_update (1).apk".
    await _deleteQuietly('${dir.path}/$_fileName');
    _taskId = await FlutterDownloader.enqueue(
      url: apkUrl,
      savedDir: dir.path,
      fileName: _fileName,
      showNotification: true,
      // Tapping the completion notification opens the APK → system installer,
      // so the user can install even if the app was killed mid-download.
      openFileFromNotification: true,
      saveInPublicStorage: false,
    );
    if (_taskId == null) {
      throw StateError('無法建立背景下載任務');
    }
  }

  /// Reconnects this process to a download that survived an app restart. A
  /// single task is safe to reuse; multiple tasks are deliberately left for
  /// [start] to clean up because they may be writing the same APK concurrently.
  static Future<void> _restoreSingleActiveTask() async {
    final active = await _activeUpdateTasks();
    if (active.length != 1) return;
    _adoptTask(active.single);
  }

  /// Returns true when an existing task was adopted instead of enqueueing a
  /// duplicate. This also makes repeated taps on the update button idempotent.
  static Future<bool> _reuseSingleActiveTask() async {
    final active = await _activeUpdateTasks();
    if (active.length != 1) return false;
    _adoptTask(active.single);
    return true;
  }

  static void _adoptTask(DownloadTask task) {
    _taskId = task.taskId;
    _activeApkUrl = task.url;
    progress.value = task.progress.clamp(0, 100) / 100.0;
    status.value = DownloadStatus.running;
  }

  static Future<List<DownloadTask>> _updateTasks() async {
    final tasks = await FlutterDownloader.loadTasks() ?? const <DownloadTask>[];
    return tasks.where((task) => task.filename == _fileName).toList();
  }

  static Future<List<DownloadTask>> _activeUpdateTasks() async {
    final tasks = await _updateTasks();
    return tasks.where((task) {
      return task.status == DownloadTaskStatus.enqueued ||
          task.status == DownloadTaskStatus.running;
    }).toList();
  }

  /// Removes every old updater task before creating a replacement. Older app
  /// versions could enqueue several workers that all wrote the same filename;
  /// those workers caused Android to stop newer jobs and report "canceled".
  static Future<void> _removeStaleUpdateTasks() async {
    final tasks = await _updateTasks();
    if (tasks.isEmpty) return;

    _taskId = null; // Ignore callbacks emitted while the stale jobs stop.
    for (final task in tasks) {
      await FlutterDownloader.remove(
        taskId: task.taskId,
        shouldDeleteContent: true,
      );
    }
    // remove() updates the plugin database immediately, while WorkManager's
    // onStopped callback can finish slightly later and delete its partial file.
    // Give those callbacks time to settle before the replacement creates the
    // same filename.
    await Future<void>.delayed(const Duration(seconds: 1));
  }

  static Future<void> _onBackgroundUpdate(DownloadTaskStatus st, int pr) async {
    if (st == DownloadTaskStatus.running || st == DownloadTaskStatus.enqueued) {
      status.value = DownloadStatus.running;
      if (pr >= 0) progress.value = pr / 100.0;
    } else if (st == DownloadTaskStatus.complete) {
      progress.value = 1;
      // Launch the installer immediately while the app is in the foreground; if
      // it's backgrounded this is a no-op and the notification handles it.
      try {
        final dir = await _backgroundDir();
        final path = '${dir.path}/$_fileName';
        if (!await File(path).exists()) {
          // Seen on some devices (typically while backgrounded): DownloadManager
          // reports the task complete but the file isn't actually there, so
          // opening it would just fail with a confusing "file does not exist"
          // error. Treat it like a failed download so the existing retry /
          // foreground-fallback path gets a chance to actually produce a file.
          if (await _recoverBackgroundFailure(pr)) return;
          lastError = '無法開啟安裝程式：檔案不存在';
          status.value = DownloadStatus.failed;
          await _reportFailure(
            'Background APK install failed to open: file does not exist after completion',
            downloaderContext: _downloaderContext(
              status: st,
              rawProgress: pr,
              recovery: 'unavailable',
            ),
          );
          return;
        }
        final result = await OpenFilex.open(path);
        if (result.type != ResultType.done) {
          lastError = '無法開啟安裝程式：${result.message}';
          status.value = DownloadStatus.failed;
          await _reportFailure(
            'Background APK install failed to open: ${result.message}',
            downloaderContext: _downloaderContext(
              status: st,
              rawProgress: pr,
              recovery: 'none',
            ),
          );
          return;
        }
      } catch (e, st) {
        lastError = '無法開啟安裝程式：$e';
        status.value = DownloadStatus.failed;
        await _reportFailure(
          'Background APK install exception',
          error: e,
          stack: st,
          downloaderContext: _downloaderContext(
            status: DownloadTaskStatus.complete,
            rawProgress: pr,
            recovery: 'none',
          ),
        );
        return;
      }
      status.value = DownloadStatus.complete;
    } else if (st == DownloadTaskStatus.failed ||
        st == DownloadTaskStatus.canceled) {
      if (st == DownloadTaskStatus.failed &&
          await _recoverBackgroundFailure(pr)) {
        return;
      }

      lastError = '下載未完成，請稍後再試';
      status.value = DownloadStatus.failed;
      // A *canceled* download is a user/expected action (canceled from the
      // system download notification, or superseded by a re-enqueue), not an
      // app fault — don't report it to Sentry, the same way connectivity
      // failures are filtered out in beforeSend. Genuine failures are still
      // reported so real install problems surface.
      if (st == DownloadTaskStatus.failed) {
        await _reportFailure(
          'Background APK download failed',
          downloaderContext: _downloaderContext(
            status: st,
            rawProgress: pr,
            recovery: 'unavailable',
          ),
        );
      }
    }
  }

  static Future<bool> _recoverBackgroundFailure(int pr) async {
    if (_recoveringBackgroundFailure) return true;

    final apkUrl = _activeApkUrl;
    if (apkUrl == null || apkUrl.isEmpty) return false;

    _recoveringBackgroundFailure = true;
    try {
      if (_backgroundFailures < _maxBackgroundRetries) {
        _backgroundFailures += 1;
        lastError = null;
        progress.value = 0;
        status.value = DownloadStatus.running;
        await Future<void>.delayed(const Duration(seconds: 2));
        await _startBackground(apkUrl);
        return true;
      }

      await _removeStaleUpdateTasks();
      lastError = null;
      progress.value = 0;
      status.value = DownloadStatus.running;
      await _foregroundDownloadAndInstall(
        apkUrl,
        failureMessage: 'APK download failed after Android background retry',
        downloaderContext: _downloaderContext(
          status: DownloadTaskStatus.failed,
          rawProgress: pr,
          recovery: 'foreground_fallback',
        ),
      );
      return true;
    } catch (e, st) {
      lastError = '$e';
      status.value = DownloadStatus.failed;
      await _reportFailure(
        'Background APK download recovery failed',
        error: e,
        stack: st,
        downloaderContext: _downloaderContext(
          status: DownloadTaskStatus.failed,
          rawProgress: pr,
          recovery: 'failed',
        ),
      );
      return true;
    } finally {
      _recoveringBackgroundFailure = false;
    }
  }

  /// App-specific external dir (no storage permission needed) that the plugin's
  /// bundled FileProvider can expose to the installer; temp dir as a fallback.
  static Future<Directory> _backgroundDir() async =>
      (await getExternalStorageDirectory()) ?? await getTemporaryDirectory();

  // ---- Non-Android foreground fallback ----

  static Future<void> _foregroundDownloadAndInstall(
    String apkUrl, {
    String failureMessage = 'Foreground APK download failed',
    Map<String, Object?>? downloaderContext,
  }) async {
    try {
      final dir = await _backgroundDir();
      if (!await dir.exists()) {
        await dir.create(recursive: true);
      }
      final path = '${dir.path}/$_fileName';
      await Dio().download(
        apkUrl,
        path,
        onReceiveProgress: (received, total) {
          if (total > 0) progress.value = received / total;
        },
      );
      progress.value = 1;
      final result = await OpenFilex.open(path);
      if (result.type != ResultType.done) {
        lastError = '無法開啟安裝程式：${result.message}';
        status.value = DownloadStatus.failed;
        await _reportFailure(
          'Foreground APK install failed to open: ${result.message}',
          downloaderContext: downloaderContext,
        );
        return;
      }
      status.value = DownloadStatus.complete;
    } catch (e, st) {
      lastError = '$e';
      status.value = DownloadStatus.failed;
      await _reportFailure(
        failureMessage,
        error: e,
        stack: st,
        downloaderContext: downloaderContext,
      );
    }
  }

  /// Reports an in-app update failure to Sentry so we get notified when an
  /// install doesn't go through. Best-effort and self-contained: it swallows
  /// any reporting error so it can never mask the original failure.
  ///
  /// Uses [Sentry.captureMessage] for downloader-status failures (which carry
  /// no exception object) so they pass through `beforeSend` — that filter only
  /// drops events whose *throwable* is a connectivity error. A real download
  /// exception is forwarded as-is via [error] for a proper stack trace.
  static Future<void> _reportFailure(
    String message, {
    Object? error,
    StackTrace? stack,
    Map<String, Object?>? downloaderContext,
  }) async {
    try {
      String? version;
      try {
        version = await currentVersion();
      } catch (_) {}
      void configure(Scope scope) {
        scope.setTag('feature', 'app_update');
        scope.setContexts('app_update', {
          'message': message,
          'currentVersion': version ?? 'unknown',
          'platform': defaultTargetPlatform.name,
          if (downloaderContext != null) 'downloader': downloaderContext,
        });
      }

      if (error != null) {
        await Sentry.captureException(
          error,
          stackTrace: stack,
          withScope: configure,
        );
      } else {
        await Sentry.captureMessage(
          message,
          level: SentryLevel.error,
          withScope: configure,
        );
      }
    } catch (_) {
      /* reporting must never break the update flow */
    }
  }

  static const _fileName = 'ai_food_update.apk';

  static Map<String, Object?> _downloaderContext({
    required DownloadTaskStatus status,
    required int rawProgress,
    required String recovery,
  }) {
    final uri = Uri.tryParse(_activeApkUrl ?? '');
    return {
      'taskId': _taskId ?? 'unknown',
      'status': status.name,
      'progress': rawProgress,
      'backgroundFailures': _backgroundFailures,
      'recovery': recovery,
      'urlHost': uri?.host ?? 'unknown',
      'urlPath': uri?.path ?? 'unknown',
    };
  }

  static Future<void> _deleteQuietly(String path) async {
    try {
      final f = File(path);
      if (await f.exists()) await f.delete();
    } catch (_) {}
  }
}

/// flutter_downloader background-isolate callback. Runs in a separate isolate,
/// so it can only hand the raw (id, status, progress) tuple back to the UI
/// isolate through the registered port.
@pragma('vm:entry-point')
void downloadCallback(String id, int status, int progress) {
  IsolateNameServer.lookupPortByName(
    UpdateService.portName,
  )?.send([id, status, progress]);
}

/// The backend builds the in-app download URL from its request origin, which
/// behind a reverse proxy can be an internal address (e.g. localhost). Since
/// that endpoint always lives on our own backend, pin it to the known base URL.
String _resolveApkUrl(String raw) {
  if (raw.isEmpty) return raw;
  final i = raw.indexOf('/api/app/download');
  if (i < 0) return raw; // external APP_APK_URL — leave untouched
  return '${ApiClient.baseUrl}${raw.substring(i)}';
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
