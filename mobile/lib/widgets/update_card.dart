import 'package:flutter/material.dart';

import '../services/update_service.dart';
import 'markdown_text.dart';

// ── Shared palette (warm amber, matches the app seed color) ─────────────────
const _amber700 = Color(0xFFB45309);
const _amber500 = Color(0xFFF59E0B);
const _amber400 = Color(0xFFFBBF24);
const _amberTint = Color(0xFFFFFBEB);
const _brown900 = Color(0xFF78350F);
const _brown700 = Color(0xFF92400E);

const _amberGradient = LinearGradient(
  begin: Alignment.topLeft,
  end: Alignment.bottomRight,
  colors: [_amber500, _amber700],
);

/// Settings card showing the current/latest version with a one-tap update.
class UpdateCard extends StatefulWidget {
  const UpdateCard({super.key});

  /// Checks on startup and, if a newer version exists, prompts the user
  /// with a polished update sheet.
  static Future<void> checkAndPrompt(BuildContext context) async {
    final info = await UpdateService.check();
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

  /// Downloads the APK with an animated progress dialog, then launches
  /// the installer.
  static Future<void> runUpdate(BuildContext context, String apkUrl) async {
    final progress = ValueNotifier<double>(0);
    showDialog(
      context: context,
      barrierDismissible: false,
      barrierColor: Colors.black54,
      builder: (_) => _DownloadDialog(progress: progress),
    );
    try {
      await UpdateService.downloadAndInstall(apkUrl,
          onProgress: (p) => progress.value = p);
      if (context.mounted) Navigator.of(context).pop(); // close progress
    } catch (e) {
      if (context.mounted) {
        Navigator.of(context).pop();
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            behavior: SnackBarBehavior.floating,
            backgroundColor: const Color(0xFFB91C1C),
            content: Row(
              children: [
                const Icon(Icons.error_outline, color: Colors.white, size: 20),
                const SizedBox(width: 10),
                Expanded(child: Text('更新失敗：$e')),
              ],
            ),
          ),
        );
      }
    } finally {
      progress.dispose();
    }
  }

  @override
  State<UpdateCard> createState() => _UpdateCardState();
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
    return Container(
      decoration: BoxDecoration(
        color: Colors.white,
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
                const Text('版本資訊',
                    style: TextStyle(
                        fontSize: 18,
                        fontWeight: FontWeight.w900,
                        color: _brown900)),
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
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
      decoration: BoxDecoration(
        color: highlight ? _amberTint : const Color(0xFFF8F7F5),
        borderRadius: BorderRadius.circular(12),
        border: highlight
            ? Border.all(color: _amber400.withValues(alpha: 0.5))
            : null,
      ),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text(label,
              style: TextStyle(
                  color: highlight ? _brown700 : Colors.black54,
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
                      color: highlight ? _amber700 : _brown900)),
            ],
          ),
        ],
      ),
    );
  }

  Widget _releaseNotes(String notes) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: _amberTint,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: _amber400.withValues(alpha: 0.4)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const Icon(Icons.auto_awesome_rounded,
                  size: 16, color: _brown700),
              const SizedBox(width: 6),
              const Text('更新內容',
                  style: TextStyle(
                      fontWeight: FontWeight.w900,
                      color: _brown700,
                      fontSize: 13,
                      letterSpacing: 0.3)),
            ],
          ),
          const SizedBox(height: 8),
          MarkdownText(notes,
              style: const TextStyle(
                  color: _brown900, fontSize: 13, height: 1.5)),
        ],
      ),
    );
  }

  Widget _upToDateRow() {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
      decoration: BoxDecoration(
        color: const Color(0xFFF0FDF4),
        borderRadius: BorderRadius.circular(12),
      ),
      child: Row(
        children: [
          const Icon(Icons.verified_rounded,
              color: Color(0xFF16A34A), size: 20),
          const SizedBox(width: 8),
          const Text('已是最新版本',
              style: TextStyle(
                  color: Color(0xFF15803D), fontWeight: FontWeight.w700)),
          const Spacer(),
          TextButton.icon(
            onPressed: _load,
            icon: const Icon(Icons.refresh_rounded, size: 16),
            label: const Text('重新檢查'),
            style: TextButton.styleFrom(
              foregroundColor: _amber700,
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
              color: Colors.white,
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
                        _versionTransition(),
                        if (info.releaseNotes.isNotEmpty) ...[
                          const SizedBox(height: 20),
                          Row(
                            children: [
                              const Icon(Icons.auto_awesome_rounded,
                                  size: 16, color: _brown700),
                              const SizedBox(width: 6),
                              const Text('更新內容',
                                  style: TextStyle(
                                      fontWeight: FontWeight.w900,
                                      color: _brown700,
                                      fontSize: 14,
                                      letterSpacing: 0.3)),
                            ],
                          ),
                          const SizedBox(height: 10),
                          Container(
                            width: double.infinity,
                            padding: const EdgeInsets.all(14),
                            decoration: BoxDecoration(
                              color: _amberTint,
                              borderRadius: BorderRadius.circular(14),
                              border: Border.all(
                                  color: _amber400.withValues(alpha: 0.4)),
                            ),
                            child: MarkdownText(info.releaseNotes,
                                style: const TextStyle(
                                    color: _brown900,
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

  Widget _versionTransition() {
    return Center(
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          _versionChip('v${info.currentVersion}', muted: true),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 10),
            child: Icon(Icons.arrow_forward_rounded,
                size: 18, color: _amber700.withValues(alpha: 0.6)),
          ),
          _versionChip('v${info.latestVersion}', muted: false),
        ],
      ),
    );
  }

  Widget _versionChip(String text, {required bool muted}) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 7),
      decoration: BoxDecoration(
        gradient: muted ? null : _amberGradient,
        color: muted ? const Color(0xFFF1EFEC) : null,
        borderRadius: BorderRadius.circular(20),
      ),
      child: Text(text,
          style: TextStyle(
              color: muted ? Colors.black54 : Colors.white,
              fontWeight: FontWeight.w800,
              fontSize: 14)),
    );
  }

  Widget _actions(BuildContext context) {
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
              foregroundColor: Colors.black45,
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

/// Animated download dialog: a circular progress ring with the percentage
/// in the center, plus a subtle status line.
class _DownloadDialog extends StatelessWidget {
  const _DownloadDialog({required this.progress});

  final ValueNotifier<double> progress;

  @override
  Widget build(BuildContext context) {
    return Dialog(
      backgroundColor: Colors.transparent,
      insetPadding: const EdgeInsets.symmetric(horizontal: 48),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 28, vertical: 32),
        decoration: BoxDecoration(
          color: Colors.white,
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
              valueListenable: progress,
              builder: (_, value, _) {
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
                          backgroundColor: const Color(0xFFF1EFEC),
                          valueColor:
                              const AlwaysStoppedAnimation<Color>(_amber500),
                          strokeCap: StrokeCap.round,
                        ),
                      ),
                      indeterminate
                          ? const Icon(Icons.download_rounded,
                              color: _amber700, size: 30)
                          : Text('${(value * 100).toStringAsFixed(0)}%',
                              style: const TextStyle(
                                  fontSize: 22,
                                  fontWeight: FontWeight.w900,
                                  color: _brown900)),
                    ],
                  ),
                );
              },
            ),
            const SizedBox(height: 24),
            const Text('下載更新中',
                style: TextStyle(
                    fontSize: 17,
                    fontWeight: FontWeight.w900,
                    color: _brown900)),
            const SizedBox(height: 6),
            Text('請稍候，完成後將自動開啟安裝程式',
                textAlign: TextAlign.center,
                style: TextStyle(
                    fontSize: 12.5,
                    height: 1.4,
                    color: Colors.black.withValues(alpha: 0.5))),
          ],
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
