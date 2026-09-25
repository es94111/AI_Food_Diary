import 'dart:async';

import 'package:flutter/material.dart';
import 'package:sentry_flutter/sentry_flutter.dart';

import '../services/update_service.dart';
import '../theme/app_theme.dart';
import 'markdown_text.dart';

// ── Brand amber (matches the app seed colour) ───────────────────────────────
// These stay constant across themes: the hero gradient, its glow, and the
// spinner all sit on a saturated amber fill where white/amber read in both
// light and dark. Everything that sits on a card/sheet surface (text, tints,
// borders) flips via `context.palette` instead.
const _amber700 = Color(0xFFB45309);
const _amber500 = Color(0xFFF59E0B);

const _amberGradient = LinearGradient(
  begin: Alignment.topLeft,
  end: Alignment.bottomRight,
  colors: [_amber500, _amber700],
);

/// Settings card showing the current/latest version with a one-tap update.
class UpdateCard extends StatefulWidget {
  const UpdateCard({super.key});

  static bool _dialogOpen = false;

  /// Checks on startup and, if a newer version exists, prompts the user
  /// with a polished update sheet.
  static Future<void> checkAndPrompt(BuildContext context) async {
    final info = await UpdateService.check();
    if (!context.mounted) return;
    await promptIfAvailable(context, info);
  }

  /// Prompts from an already-fetched [info]. Startup can fetch the version in
  /// parallel with other non-critical refreshes without issuing it twice.
  static Future<void> promptIfAvailable(
    BuildContext context,
    AppVersionInfo info,
  ) async {
    if (!info.updateAvailable || !context.mounted) return;
    final go = await showDialog<bool>(
      context: context,
      barrierColor: Colors.black54,
      builder: (ctx) => _UpdatePromptDialog(info: info),
    );
    if (go == true && context.mounted) {
      await runUpdate(context, info.apkUrl);
    }
  }

  /// Shows the download sheet before starting the update, so an asynchronous
  /// start cannot surface an error after the user has moved to another page.
  static Future<void> runUpdate(BuildContext context, String apkUrl) async {
    if (_dialogOpen) return;
    _dialogOpen = true;
    try {
      if (!await _ensureInstallPermission(context)) return;
      if (!context.mounted || !Visibility.of(context)) return;
      await showDialog<void>(
        context: context,
        barrierDismissible: true,
        barrierColor: Colors.black54,
        builder: (_) => UpdateDownloadDialog(apkUrl: apkUrl),
      );
    } finally {
      _dialogOpen = false;
    }
  }

  static Future<bool> _ensureInstallPermission(BuildContext context) async {
    if (await UpdateService.canRequestPackageInstalls()) return true;
    if (!context.mounted) return false;

    final openSettings = await showDialog<bool>(
      context: context,
      barrierColor: Colors.black54,
      builder: (_) => const _InstallPermissionDialog(),
    );
    if (openSettings != true || !context.mounted) return false;

    try {
      await UpdateService.openInstallPermissionSettings();
    } catch (e, st) {
      await Sentry.captureException(e, stackTrace: st,
          withScope: (scope) => scope.setTag('feature', 'app_update'));
      if (context.mounted) _showError(context, '無法開啟系統設定：$e');
      return false;
    }

    // The user may have granted the permission in settings; re-check so they
    // don't have to tap the update button a second time.
    return await UpdateService.canRequestPackageInstalls();
  }

  static void _showError(BuildContext context, String message) {
    if (!context.mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        behavior: SnackBarBehavior.floating,
        backgroundColor: const Color(0xFFB91C1C),
        content: Row(
          children: [
            const Icon(Icons.error_outline, color: Colors.white, size: 20),
            const SizedBox(width: 10),
            Expanded(child: Text(message)),
          ],
        ),
      ),
    );
  }

  @override
  State<UpdateCard> createState() => _UpdateCardState();
}

class _InstallPermissionDialog extends StatelessWidget {
  const _InstallPermissionDialog();

  @override
  Widget build(BuildContext context) {
    final p = context.palette;
    return Dialog(
      backgroundColor: Colors.transparent,
      insetPadding: const EdgeInsets.symmetric(horizontal: 28, vertical: 24),
      child: Container(
        padding: const EdgeInsets.fromLTRB(24, 24, 24, 20),
        decoration: BoxDecoration(
          color: p.surface,
          borderRadius: BorderRadius.circular(24),
          boxShadow: [
            BoxShadow(
              color: Colors.black.withValues(alpha: 0.24),
              blurRadius: 36,
              offset: const Offset(0, 18),
            ),
          ],
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              width: 58,
              height: 58,
              decoration: BoxDecoration(
                gradient: _amberGradient,
                shape: BoxShape.circle,
                boxShadow: [
                  BoxShadow(
                    color: _amber500.withValues(alpha: 0.34),
                    blurRadius: 14,
                    offset: const Offset(0, 6),
                  ),
                ],
              ),
              child: const Icon(Icons.admin_panel_settings_rounded,
                  color: Colors.white, size: 28),
            ),
            const SizedBox(height: 18),
            Text('允許安裝更新',
                textAlign: TextAlign.center,
                style: TextStyle(
                    color: p.ink,
                    fontSize: 20,
                    fontWeight: FontWeight.w900)),
            const SizedBox(height: 8),
            Text(
              '請在系統設定允許 AI Food Diary 安裝未知應用程式，回到 App 後再按一次更新。',
              textAlign: TextAlign.center,
              style: TextStyle(
                  color: p.inkSoft,
                  fontSize: 13,
                  height: 1.45,
                  fontWeight: FontWeight.w500),
            ),
            const SizedBox(height: 22),
            _GradientButton(
              icon: Icons.settings_rounded,
              label: '開啟設定',
              onTap: () => Navigator.pop(context, true),
            ),
            const SizedBox(height: 8),
            TextButton(
              onPressed: () => Navigator.pop(context, false),
              style: TextButton.styleFrom(
                foregroundColor: p.inkSoft,
                minimumSize: const Size(double.infinity, 44),
              ),
              child:
                  const Text('稍後再說', style: TextStyle(fontWeight: FontWeight.w600)),
            ),
          ],
        ),
      ),
    );
  }
}

class _UpdateCardState extends State<UpdateCard> {
  AppVersionInfo? _info;
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    if (mounted) setState(() => _loading = true);
    final info = await UpdateService.check();
    if (mounted) {
      setState(() {
        _info = info;
        _loading = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final p = context.palette;
    return Container(
      decoration: BoxDecoration(
        color: p.surface,
        borderRadius: BorderRadius.circular(20),
        boxShadow: [
          BoxShadow(
            color: _amber700.withValues(alpha: 0.06),
            blurRadius: 20,
            offset: const Offset(0, 8),
          ),
        ],
      ),
      child: Padding(
        padding: const EdgeInsets.all(18),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Container(
                  width: 38,
                  height: 38,
                  decoration: BoxDecoration(
                    gradient: _amberGradient,
                    borderRadius: BorderRadius.circular(12),
                    boxShadow: [
                      BoxShadow(
                        color: _amber500.withValues(alpha: 0.35),
                        blurRadius: 10,
                        offset: const Offset(0, 4),
                      ),
                    ],
                  ),
                  child: const Icon(Icons.rocket_launch_rounded,
                      color: Colors.white, size: 20),
                ),
                const SizedBox(width: 12),
                Text('版本資訊',
                    style: TextStyle(
                        fontSize: 18,
                        fontWeight: FontWeight.w900,
                        color: p.ink)),
              ],
            ),
            const SizedBox(height: 16),
            if (_loading)
              const Padding(
                padding: EdgeInsets.symmetric(vertical: 16),
                child: Center(
                  child: SizedBox(
                    width: 26,
                    height: 26,
                    child: CircularProgressIndicator(
                        strokeWidth: 2.4, color: _amber500),
                  ),
                ),
              )
            else ...[
              _versionRow('目前版本', 'v${_info!.currentVersion}',
                  highlight: false),
              const SizedBox(height: 8),
              _versionRow(
                  '最新版本',
                  _info!.latestVersion.isEmpty
                      ? '—'
                      : 'v${_info!.latestVersion}',
                  highlight: _info!.updateAvailable),
              const SizedBox(height: 16),
              if (_info!.updateAvailable) ...[
                if (_info!.releaseNotes.isNotEmpty) ...[
                  _releaseNotes(_info!.releaseNotes),
                  const SizedBox(height: 16),
                ],
                _GradientButton(
                  icon: Icons.system_update_rounded,
                  label: '一鍵更新到 v${_info!.latestVersion}',
                  onTap: () => UpdateCard.runUpdate(context, _info!.apkUrl),
                ),
              ] else
                _upToDateRow(),
            ],
          ],
        ),
      ),
    );
  }

  Widget _versionRow(String label, String value, {required bool highlight}) {
    final p = context.palette;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
      decoration: BoxDecoration(
        color: highlight ? p.amberSurface : p.surfaceAlt,
        borderRadius: BorderRadius.circular(12),
        border: highlight ? Border.all(color: p.amberBorder) : null,
      ),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text(label,
              style: TextStyle(
                  color: highlight ? p.amberInk : p.inkSoft,
                  fontWeight: FontWeight.w600,
                  fontSize: 13)),
          Row(
            children: [
              if (highlight) ...[
                Container(
                  padding:
                      const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                  decoration: BoxDecoration(
                    gradient: _amberGradient,
                    borderRadius: BorderRadius.circular(20),
                  ),
                  child: const Text('NEW',
                      style: TextStyle(
                          color: Colors.white,
                          fontSize: 10,
                          fontWeight: FontWeight.w900,
                          letterSpacing: 0.5)),
                ),
                const SizedBox(width: 8),
              ],
              Text(value,
                  style: TextStyle(
                      fontWeight: FontWeight.w800,
                      fontSize: 15,
                      color: highlight ? p.amberAccent : p.ink)),
            ],
          ),
        ],
      ),
    );
  }

  Widget _releaseNotes(String notes) {
    final p = context.palette;
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: p.amberSurface,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: p.amberBorder),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(Icons.auto_awesome_rounded, size: 16, color: p.amberInk),
              const SizedBox(width: 6),
              Text('更新內容',
                  style: TextStyle(
                      fontWeight: FontWeight.w900,
                      color: p.amberInk,
                      fontSize: 13,
                      letterSpacing: 0.3)),
            ],
          ),
          const SizedBox(height: 8),
          MarkdownText(notes,
              style: TextStyle(
                  color: p.amberInkSoft, fontSize: 13, height: 1.5)),
        ],
      ),
    );
  }

  Widget _upToDateRow() {
    final p = context.palette;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
      decoration: BoxDecoration(
        color: p.successSurface,
        borderRadius: BorderRadius.circular(12),
      ),
      child: Row(
        children: [
          Icon(Icons.verified_rounded, color: p.success, size: 20),
          const SizedBox(width: 8),
          Text('已是最新版本',
              style: TextStyle(
                  color: p.successInk, fontWeight: FontWeight.w700)),
          const Spacer(),
          TextButton.icon(
            onPressed: _load,
            icon: const Icon(Icons.refresh_rounded, size: 16),
            label: const Text('重新檢查'),
            style: TextButton.styleFrom(
              foregroundColor: p.amberAccent,
              padding: const EdgeInsets.symmetric(horizontal: 8),
              visualDensity: VisualDensity.compact,
            ),
          ),
        ],
      ),
    );
  }
}

/// The new-version prompt: a polished dialog with a gradient hero header,
/// version transition badge, and scrollable release notes.
class _UpdatePromptDialog extends StatelessWidget {
  const _UpdatePromptDialog({required this.info});

  final AppVersionInfo info;

  @override
  Widget build(BuildContext context) {
    final maxHeight = MediaQuery.of(context).size.height * 0.75;
    final p = context.palette;
    return Dialog(
      backgroundColor: Colors.transparent,
      insetPadding: const EdgeInsets.symmetric(horizontal: 28, vertical: 24),
      child: TweenAnimationBuilder<double>(
        duration: const Duration(milliseconds: 320),
        curve: Curves.easeOutBack,
        tween: Tween(begin: 0.92, end: 1),
        builder: (_, scale, child) =>
            Transform.scale(scale: scale, child: child),
        child: ConstrainedBox(
          constraints: BoxConstraints(maxHeight: maxHeight),
          child: Container(
            decoration: BoxDecoration(
              color: p.surface,
              borderRadius: BorderRadius.circular(28),
              boxShadow: [
                BoxShadow(
                  color: Colors.black.withValues(alpha: 0.25),
                  blurRadius: 40,
                  offset: const Offset(0, 20),
                ),
              ],
            ),
            clipBehavior: Clip.antiAlias,
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                _header(),
                Flexible(
                  child: SingleChildScrollView(
                    padding: const EdgeInsets.fromLTRB(24, 20, 24, 0),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        _versionTransition(p),
                        if (info.releaseNotes.isNotEmpty) ...[
                          const SizedBox(height: 20),
                          Row(
                            children: [
                              Icon(Icons.auto_awesome_rounded,
                                  size: 16, color: p.amberInk),
                              const SizedBox(width: 6),
                              Text('更新內容',
                                  style: TextStyle(
                                      fontWeight: FontWeight.w900,
                                      color: p.amberInk,
                                      fontSize: 14,
                                      letterSpacing: 0.3)),
                            ],
                          ),
                          const SizedBox(height: 10),
                          Container(
                            width: double.infinity,
                            padding: const EdgeInsets.all(14),
                            decoration: BoxDecoration(
                              color: p.amberSurface,
                              borderRadius: BorderRadius.circular(14),
                              border: Border.all(color: p.amberBorder),
                            ),
                            child: MarkdownText(info.releaseNotes,
                                style: TextStyle(
                                    color: p.amberInkSoft,
                                    fontSize: 13,
                                    height: 1.55)),
                          ),
                        ],
                      ],
                    ),
                  ),
                ),
                _actions(context),
              ],
            ),
          ),
        ),
      ),
    );
  }

  Widget _header() {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.fromLTRB(24, 28, 24, 24),
      decoration: const BoxDecoration(gradient: _amberGradient),
      child: Column(
        children: [
          Container(
            width: 64,
            height: 64,
            decoration: BoxDecoration(
              color: Colors.white.withValues(alpha: 0.2),
              shape: BoxShape.circle,
              border:
                  Border.all(color: Colors.white.withValues(alpha: 0.4), width: 2),
            ),
            child: const Icon(Icons.rocket_launch_rounded,
                color: Colors.white, size: 32),
          ),
          const SizedBox(height: 16),
          const Text('發現新版本',
              style: TextStyle(
                  color: Colors.white,
                  fontSize: 22,
                  fontWeight: FontWeight.w900,
                  letterSpacing: 0.5)),
          const SizedBox(height: 4),
          Text('v${info.latestVersion} 已準備好',
              style: TextStyle(
                  color: Colors.white.withValues(alpha: 0.9), fontSize: 13)),
        ],
      ),
    );
  }

  Widget _versionTransition(AppPalette p) {
    return Center(
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          _versionChip('v${info.currentVersion}', muted: true, p: p),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 10),
            child: Icon(Icons.arrow_forward_rounded,
                size: 18, color: _amber700.withValues(alpha: 0.6)),
          ),
          _versionChip('v${info.latestVersion}', muted: false, p: p),
        ],
      ),
    );
  }

  Widget _versionChip(String text,
      {required bool muted, required AppPalette p}) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 7),
      decoration: BoxDecoration(
        gradient: muted ? null : _amberGradient,
        color: muted ? p.surfaceAlt : null,
        borderRadius: BorderRadius.circular(20),
      ),
      child: Text(text,
          style: TextStyle(
              color: muted ? p.inkSoft : Colors.white,
              fontWeight: FontWeight.w800,
              fontSize: 14)),
    );
  }

  Widget _actions(BuildContext context) {
    final p = context.palette;
    return Padding(
      padding: const EdgeInsets.fromLTRB(24, 20, 24, 20),
      child: Column(
        children: [
          _GradientButton(
            icon: Icons.system_update_rounded,
            label: '立即更新',
            onTap: () => Navigator.pop(context, true),
          ),
          const SizedBox(height: 8),
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            style: TextButton.styleFrom(
              foregroundColor: p.inkSoft,
              minimumSize: const Size(double.infinity, 44),
            ),
            child: const Text('稍後再說',
                style: TextStyle(fontWeight: FontWeight.w600)),
          ),
        ],
      ),
    );
  }
}

/// Download progress and errors stay in this route. Android can keep the task
/// running after the route is dismissed; late callbacks must not navigate or
/// show a snackbar on an unrelated page.
class UpdateDownloadDialog extends StatefulWidget {
  const UpdateDownloadDialog({
    super.key,
    required this.apkUrl,
    this.startDownload,
  });

  final String apkUrl;
  @visibleForTesting
  final Future<void> Function(String)? startDownload;

  @override
  State<UpdateDownloadDialog> createState() => _UpdateDownloadDialogState();
}

class _UpdateDownloadDialogState extends State<UpdateDownloadDialog> {
  bool _starting = false;
  bool _closing = false;
  String? _startError;

  @override
  void initState() {
    super.initState();
    UpdateService.status.addListener(_onStatus);
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) unawaited(_start());
    });
  }

  @override
  void dispose() {
    UpdateService.status.removeListener(_onStatus);
    super.dispose();
  }

  void _onStatus() {
    if (!mounted || _closing || ModalRoute.of(context)?.isCurrent != true) {
      return;
    }
    if (UpdateService.status.value == DownloadStatus.complete) {
      // The installer has been launched, or the completion notification can
      // open it after this app moves to the background.
      _close();
    } else {
      setState(() {});
    }
  }

  Future<void> _start() async {
    if (_starting || _closing) return;
    setState(() {
      _starting = true;
      _startError = null;
    });
    try {
      await (widget.startDownload ?? UpdateService.start)(widget.apkUrl);
    } catch (e, st) {
      if (mounted && !_closing) {
        setState(() => _startError = '無法開始下載：$e');
      }
      try {
        await Sentry.captureException(
          e,
          stackTrace: st,
          withScope: (scope) => scope.setTag('feature', 'app_update'),
        );
      } catch (_) {
        // Reporting cannot hide the actionable error in the dialog.
      }
    } finally {
      if (mounted && !_closing) setState(() => _starting = false);
    }
  }

  void _close() {
    if (_closing) return;
    _closing = true;
    Navigator.of(context).pop();
  }

  @override
  Widget build(BuildContext context) {
    final canBackground = UpdateService.backgroundSupported;
    final p = context.palette;
    final status = UpdateService.status.value;
    final failed = _startError != null ||
        (!_starting && status == DownloadStatus.failed);
    final canceled = !_starting && status == DownloadStatus.canceled && !failed;
    return PopScope(
      onPopInvokedWithResult: (didPop, _) {
        if (didPop) _closing = true;
      },
      child: Dialog(
        backgroundColor: Colors.transparent,
        insetPadding: const EdgeInsets.symmetric(horizontal: 48),
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 28, vertical: 32),
          decoration: BoxDecoration(
            color: p.surface,
            borderRadius: BorderRadius.circular(28),
            boxShadow: [
              BoxShadow(
                color: Colors.black.withValues(alpha: 0.25),
                blurRadius: 40,
                offset: const Offset(0, 20),
              ),
            ],
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              ValueListenableBuilder<double>(
                valueListenable: UpdateService.progress,
                builder: (_, value, _) {
                  if (failed || canceled) {
                    return SizedBox(
                      width: 96,
                      height: 96,
                      child: Icon(
                        failed ? Icons.error_outline : Icons.cancel_outlined,
                        color: failed ? const Color(0xFFB91C1C) : p.inkSoft,
                        size: 48,
                      ),
                    );
                  }
                  final indeterminate = value == 0;
                  return SizedBox(
                    width: 96,
                    height: 96,
                    child: Stack(
                      alignment: Alignment.center,
                      children: [
                        SizedBox(
                          width: 96,
                          height: 96,
                          child: CircularProgressIndicator(
                            value: indeterminate ? null : value,
                            strokeWidth: 7,
                            backgroundColor: p.surfaceAlt,
                            valueColor: const AlwaysStoppedAnimation<Color>(
                              _amber500,
                            ),
                            strokeCap: StrokeCap.round,
                          ),
                        ),
                        indeterminate
                            ? Icon(
                                Icons.download_rounded,
                                color: p.amberAccent,
                                size: 30,
                              )
                            : Text(
                                '${(value * 100).toStringAsFixed(0)}%',
                                style: TextStyle(
                                  fontSize: 22,
                                  fontWeight: FontWeight.w900,
                                  color: p.ink,
                                ),
                              ),
                      ],
                    ),
                  );
                },
              ),
              const SizedBox(height: 24),
              Text(
                failed
                    ? '更新失敗'
                    : canceled
                    ? '下載已取消'
                    : '下載更新中',
                style: TextStyle(
                  fontSize: 17,
                  fontWeight: FontWeight.w900,
                  color: p.ink,
                ),
              ),
              const SizedBox(height: 6),
              Text(
                failed
                    ? (_startError ?? UpdateService.lastError ?? '請稍後再試')
                    : canceled
                    ? '可重新開始下載'
                    : canBackground
                    ? '可切換到其他 App，下載會在背景繼續，完成後會通知你安裝'
                    : '請稍候，完成後將自動開啟安裝程式',
                textAlign: TextAlign.center,
                style: TextStyle(fontSize: 12.5, height: 1.4, color: p.inkSoft),
              ),
              if (failed || canceled) ...[
                const SizedBox(height: 18),
                TextButton(
                  onPressed: _starting ? null : _start,
                  child: const Text('重試下載'),
                ),
                TextButton(onPressed: _close, child: const Text('關閉')),
              ] else if (canBackground) ...[
                const SizedBox(height: 18),
                TextButton.icon(
                  onPressed: _close,
                  icon: const Icon(Icons.south_east_rounded, size: 18),
                  label: const Text('在背景繼續下載'),
                  style: TextButton.styleFrom(
                    foregroundColor: p.amberAccent,
                    textStyle: const TextStyle(fontWeight: FontWeight.w700),
                  ),
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }
}

/// A reusable full-width gradient call-to-action button with a soft glow.
class _GradientButton extends StatelessWidget {
  const _GradientButton({
    required this.icon,
    required this.label,
    required this.onTap,
  });

  final IconData icon;
  final String label;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      decoration: BoxDecoration(
        gradient: _amberGradient,
        borderRadius: BorderRadius.circular(14),
        boxShadow: [
          BoxShadow(
            color: _amber500.withValues(alpha: 0.4),
            blurRadius: 14,
            offset: const Offset(0, 6),
          ),
        ],
      ),
      child: Material(
        color: Colors.transparent,
        child: InkWell(
          onTap: onTap,
          borderRadius: BorderRadius.circular(14),
          child: Padding(
            padding: const EdgeInsets.symmetric(vertical: 15),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Icon(icon, color: Colors.white, size: 20),
                const SizedBox(width: 10),
                Flexible(
                  child: Text(label,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(
                          color: Colors.white,
                          fontSize: 15,
                          fontWeight: FontWeight.w800,
                          letterSpacing: 0.3)),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
