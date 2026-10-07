import 'dart:async';

import 'package:flutter/material.dart';

import '../services/local_reminder_service.dart';

class LocalRemindersCard extends StatefulWidget {
  const LocalRemindersCard({super.key, this.controller});

  final ReminderSettingsController? controller;

  @override
  State<LocalRemindersCard> createState() => _LocalRemindersCardState();
}

class _LocalRemindersCardState extends State<LocalRemindersCard>
    with WidgetsBindingObserver {
  late final ReminderSettingsController _controller =
      widget.controller ?? LocalReminderService.instance;
  ReminderSettings _settings = const ReminderSettings();
  bool _loading = true;
  bool _busy = false;
  bool? _permissionGranted;
  String? _error;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _refresh();
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed && _controller.supported) {
      unawaited(_refresh());
    }
  }

  Future<void> _refresh() async {
    try {
      final settings = await _controller.loadSettings();
      bool? permission = false;
      if (_controller.supported) {
        try {
          permission = await _controller.notificationPermissionGranted();
        } catch (_) {
          permission = null;
        }
      }
      if (!mounted) return;
      setState(() {
        _settings = settings;
        _permissionGranted = permission;
        _loading = false;
        _error = null;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _loading = false;
        _error = '無法載入提醒設定，請稍後再試。';
      });
    }
  }

  Future<void> _save(
    ReminderSettings next, {
    bool requestPermission = false,
  }) async {
    if (_busy) return;
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      if (requestPermission) {
        try {
          await _controller.requestNotificationPermission();
        } catch (_) {
          // Keep the requested setting so the permission notice can guide the user.
        }
      }
      await _controller.saveSettings(next);
      if (mounted) setState(() => _settings = next);
      bool? permission;
      try {
        permission = await _controller.notificationPermissionGranted();
      } catch (_) {
        permission = null;
      }
      if (!mounted) return;
      setState(() => _permissionGranted = permission);
    } catch (_) {
      if (mounted) setState(() => _error = '儲存提醒時發生問題，請再試一次。');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _chooseTime(ReminderKind kind) async {
    final minutes = _settings.minutesFor(kind);
    final selected = await showTimePicker(
      context: context,
      initialTime: TimeOfDay(hour: minutes ~/ 60, minute: minutes % 60),
      helpText: '選擇提醒時間',
    );
    if (selected == null || !mounted) return;
    await _save(
      _settings.withMinutes(kind, selected.hour * 60 + selected.minute),
    );
  }

  Future<void> _openNotificationSettings() async {
    try {
      final opened = await _controller.openNotificationSettings();
      if (opened == false && mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(const SnackBar(content: Text('無法開啟系統通知設定。')));
      }
    } catch (_) {
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(const SnackBar(content: Text('無法開啟系統通知設定。')));
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(16, 16, 16, 12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text(
              '日常提醒',
              style: TextStyle(fontSize: 18, fontWeight: FontWeight.w900),
            ),
            const SizedBox(height: 4),
            const Text(
              '提醒只在這部裝置排程，預設關閉；系統省電設定可能讓通知稍有延遲。',
              style: TextStyle(fontSize: 13),
            ),
            if (_loading) ...[
              const SizedBox(height: 12),
              const LinearProgressIndicator(),
            ] else if (!_controller.supported) ...[
              const SizedBox(height: 12),
              const Text('本機提醒目前僅支援 Android。'),
            ] else ...[
              const SizedBox(height: 8),
              for (final kind in ReminderKind.values) _reminderTile(kind),
              if (_settings.anyEnabled && _permissionGranted != true)
                _permissionNotice(),
              if (_error != null) ...[
                const SizedBox(height: 8),
                Text(
                  _error!,
                  style: TextStyle(color: Theme.of(context).colorScheme.error),
                ),
              ],
            ],
          ],
        ),
      ),
    );
  }

  Widget _reminderTile(ReminderKind kind) {
    final minutes = _settings.minutesFor(kind);
    final time =
        '${(minutes ~/ 60).toString().padLeft(2, '0')}:'
        '${(minutes % 60).toString().padLeft(2, '0')}';
    final title = switch (kind) {
      ReminderKind.mealLog => '提醒我記錄餐點',
      ReminderKind.water => '喝水提醒',
      ReminderKind.dailyReview => '每日進度回顧',
    };
    final icon = switch (kind) {
      ReminderKind.mealLog => Icons.restaurant_outlined,
      ReminderKind.water => Icons.water_drop_outlined,
      ReminderKind.dailyReview => Icons.nightlight_outlined,
    };

    return ListTile(
      contentPadding: EdgeInsets.zero,
      leading: Icon(icon),
      title: Text(title),
      subtitle: const Text('每天在所選時間提醒'),
      trailing: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          TextButton(
            onPressed: _busy ? null : () => _chooseTime(kind),
            child: Text(time),
          ),
          Switch(
            value: _settings.enabledFor(kind),
            onChanged: _busy
                ? null
                : (enabled) => _save(
                    _settings.withEnabled(kind, enabled),
                    requestPermission: enabled,
                  ),
          ),
        ],
      ),
    );
  }

  Widget _permissionNotice() {
    return Container(
      width: double.infinity,
      margin: const EdgeInsets.only(top: 8),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: Theme.of(context).colorScheme.errorContainer,
        borderRadius: BorderRadius.circular(12),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text('系統通知尚未開啟，已選取的提醒目前不會送達。請在系統設定允許通知，返回後會重新排程。'),
          const SizedBox(height: 4),
          TextButton.icon(
            onPressed: _busy ? null : _openNotificationSettings,
            icon: const Icon(Icons.settings_outlined),
            label: const Text('開啟通知設定'),
          ),
        ],
      ),
    );
  }
}
