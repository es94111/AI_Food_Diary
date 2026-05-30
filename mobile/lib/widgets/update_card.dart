import 'package:flutter/material.dart';

import '../services/update_service.dart';
import 'markdown_text.dart';

/// Settings card showing the current/latest version with a one-tap update.
class UpdateCard extends StatefulWidget {
  const UpdateCard({super.key});

  /// Checks on startup and, if a newer version exists, prompts the user.
  static Future<void> checkAndPrompt(BuildContext context) async {
    final info = await UpdateService.check();
    if (!info.updateAvailable || !context.mounted) return;
    final go = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text('發現新版本 v${info.latestVersion}'),
        content: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text('目前版本 v${info.currentVersion}',
                  style: const TextStyle(color: Colors.black54, fontSize: 13)),
              if (info.releaseNotes.isNotEmpty) ...[
                const SizedBox(height: 10),
                MarkdownText(info.releaseNotes),
              ],
            ],
          ),
        ),
        actions: [
          TextButton(
              onPressed: () => Navigator.pop(ctx, false),
              child: const Text('稍後')),
          FilledButton(
              onPressed: () => Navigator.pop(ctx, true),
              child: const Text('立即更新')),
        ],
      ),
    );
    if (go == true && context.mounted) {
      await runUpdate(context, info.apkUrl);
    }
  }

  /// Downloads the APK with a progress dialog, then launches the installer.
  static Future<void> runUpdate(BuildContext context, String apkUrl) async {
    final progress = ValueNotifier<double>(0);
    showDialog(
      context: context,
      barrierDismissible: false,
      builder: (_) => AlertDialog(
        title: const Text('下載更新中...'),
        content: ValueListenableBuilder<double>(
          valueListenable: progress,
          builder: (_, value, __) => Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              LinearProgressIndicator(value: value == 0 ? null : value),
              const SizedBox(height: 12),
              Text('${(value * 100).toStringAsFixed(0)}%'),
            ],
          ),
        ),
      ),
    );
    try {
      await UpdateService.downloadAndInstall(apkUrl,
          onProgress: (p) => progress.value = p);
      if (context.mounted) Navigator.of(context).pop(); // close progress
    } catch (e) {
      if (context.mounted) {
        Navigator.of(context).pop();
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text('更新失敗：$e')));
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
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text('版本資訊',
                style: TextStyle(fontSize: 18, fontWeight: FontWeight.w900)),
            const SizedBox(height: 12),
            if (_loading)
              const Padding(
                padding: EdgeInsets.symmetric(vertical: 8),
                child:
                    Center(child: CircularProgressIndicator(strokeWidth: 2)),
              )
            else ...[
              _row('目前版本', 'v${_info!.currentVersion}'),
              _row('最新版本',
                  _info!.latestVersion.isEmpty ? '—' : 'v${_info!.latestVersion}'),
              if (_info!.webVersion.isNotEmpty)
                _row('網頁版本', 'v${_info!.webVersion}'),
              const SizedBox(height: 12),
              if (_info!.updateAvailable) ...[
                if (_info!.releaseNotes.isNotEmpty) ...[
                  Container(
                    width: double.infinity,
                    padding: const EdgeInsets.all(12),
                    decoration: BoxDecoration(
                      color: const Color(0xFFFFFBEB),
                      borderRadius: BorderRadius.circular(12),
                    ),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const Text('更新內容',
                            style: TextStyle(
                                fontWeight: FontWeight.w900,
                                color: Color(0xFF92400E))),
                        const SizedBox(height: 4),
                        MarkdownText(_info!.releaseNotes,
                            style: const TextStyle(color: Color(0xFF78350F))),
                      ],
                    ),
                  ),
                  const SizedBox(height: 12),
                ],
                SizedBox(
                  width: double.infinity,
                  child: FilledButton.icon(
                    onPressed: () =>
                        UpdateCard.runUpdate(context, _info!.apkUrl),
                    icon: const Icon(Icons.system_update),
                    label: Text('一鍵更新到 v${_info!.latestVersion}'),
                  ),
                ),
              ] else
                Row(
                  children: [
                    const Icon(Icons.check_circle,
                        color: Colors.green, size: 18),
                    const SizedBox(width: 6),
                    Text('已是最新版本',
                        style: TextStyle(color: Colors.green[700])),
                    const Spacer(),
                    TextButton(onPressed: _load, child: const Text('重新檢查')),
                  ],
                ),
            ],
          ],
        ),
      ),
    );
  }

  Widget _row(String label, String value) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 3),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text(label, style: const TextStyle(color: Colors.black54)),
          Text(value, style: const TextStyle(fontWeight: FontWeight.bold)),
        ],
      ),
    );
  }
}
