import 'dart:async';
import 'dart:io';

import 'package:flutter/foundation.dart';
import 'package:intl/intl.dart';
import 'package:path_provider/path_provider.dart';

/// Lightweight persistent logger that writes timestamped lines to a file on the
/// device, so problems that only happen in a release build on a real phone
/// (where `debugPrint` is invisible) can be inspected after the fact.
///
/// Used to diagnose the health-sync nutrition upload: every step of the sync is
/// logged with a tag, and the user can read/share the file from the health card.
///
/// Writes are serialised through a single Future chain ([_queue]) so concurrent
/// `log` calls never interleave or corrupt a line. The file is capped at
/// [_maxBytes] and rotated (latest half kept) so it can't grow unbounded.
class AppLogger {
  AppLogger._();

  static const _fileName = 'health_sync_log.txt';
  static const _maxBytes = 512 * 1024; // 512 KB cap, then keep the latest half.
  static final _ts = DateFormat('yyyy-MM-dd HH:mm:ss.SSS');

  static File? _file;
  static Future<void> _queue = Future.value();

  static Future<File> _resolveFile() async {
    if (_file != null) return _file!;
    final dir = await getApplicationDocumentsDirectory();
    return _file = File('${dir.path}/$_fileName');
  }

  /// Appends one tagged line, e.g. `[12:00:00.123] [HealthSync] fetched 3`.
  /// Mirrors to the debug console too. Never throws — logging must not break
  /// the feature it's observing.
  static void log(String tag, String message) {
    final line = '[${_ts.format(DateTime.now())}] [$tag] $message';
    if (kDebugMode) debugPrint(line);
    _append('$line\n');
  }

  /// Logs an error (and optional stack trace) under [tag].
  static void error(String tag, Object err, [StackTrace? stack]) {
    log(tag, 'ERROR: $err');
    if (stack != null) _append('$stack\n');
  }

  static void _append(String text) {
    // Serialise every write so lines can't interleave; swallow IO errors.
    _queue = _queue.then((_) async {
      try {
        final file = await _resolveFile();
        await file.writeAsString(text,
            mode: FileMode.append, flush: true);
        await _rotateIfNeeded(file);
      } catch (_) {
        // Logging is best-effort; never surface its own failures.
      }
    });
  }

  static Future<void> _rotateIfNeeded(File file) async {
    try {
      final len = await file.length();
      if (len <= _maxBytes) return;
      // Keep the most recent half so the freshest sync stays available.
      final raw = await file.readAsBytes();
      final tail = raw.sublist(raw.length - _maxBytes ~/ 2);
      await file.writeAsBytes(tail, flush: true);
    } catch (_) {}
  }

  /// Absolute path of the log file (creating an empty one if needed).
  static Future<String> path() async => (await _resolveFile()).path;

  /// Full current contents of the log ('' when nothing has been logged yet).
  static Future<String> readAll() async {
    try {
      final file = await _resolveFile();
      if (!await file.exists()) return '';
      // Drain pending writes first so the read reflects everything logged.
      await _queue;
      return file.readAsString();
    } catch (e) {
      return '讀取紀錄失敗：$e';
    }
  }

  /// Empties the log file.
  static Future<void> clear() async {
    _queue = _queue.then((_) async {
      try {
        final file = await _resolveFile();
        await file.writeAsString('', flush: true);
      } catch (_) {}
    });
    await _queue;
  }
}
