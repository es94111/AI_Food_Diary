import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import '../models/models.dart';
import '../services/health_service.dart';

class HealthSyncCard extends StatefulWidget {
  const HealthSyncCard({super.key, required this.onSynced});

  /// Called after a successful sync so the dashboard can refresh weight/metabolism.
  final Future<void> Function() onSynced;

  @override
  State<HealthSyncCard> createState() => _HealthSyncCardState();
}

class _HealthSyncCardState extends State<HealthSyncCard> {
  HealthSyncStatus? _status;
  List<HealthConnection> _connections = [];
  bool _syncing = false;
  String? _message;
  bool _isError = false;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final status = await HealthService.status();
      final conns = await HealthService.connections();
      if (mounted) {
        setState(() {
          _status = status;
          _connections = conns;
        });
      }
    } catch (_) {}
  }

  Future<void> _sync() async {
    setState(() {
      _syncing = true;
      _message = null;
    });
    try {
      final count = await HealthService.syncNow();
      await _load();
      await widget.onSynced();
      setState(() {
        _isError = false;
        _message = count == 0 ? '近 7 天無健康資料' : '同步成功！已上傳 $count 筆資料';
      });
    } catch (e, stack) {
      debugPrint('HealthSync: ERROR $e');
      debugPrint('$stack');
      setState(() {
        _isError = true;
        _message = e.toString();
      });
    } finally {
      if (mounted) setState(() => _syncing = false);
    }
  }

  String _fmt(String type, int digits) {
    final m = _status?.latestByType[type];
    if (m == null) return '尚未同步';
    return '${m.value.toStringAsFixed(digits)} ${m.unit}';
  }

  @override
  Widget build(BuildContext context) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text('健康同步',
                style: TextStyle(fontSize: 18, fontWeight: FontWeight.w900)),
            const SizedBox(height: 2),
            const Text('透過 Health Connect 同步步數、體重與活動熱量。',
                style: TextStyle(fontSize: 11, color: Colors.black54)),
            const SizedBox(height: 12),
            GridView.count(
              crossAxisCount: 2,
              shrinkWrap: true,
              physics: const NeverScrollableScrollPhysics(),
              childAspectRatio: 2.6,
              mainAxisSpacing: 8,
              crossAxisSpacing: 8,
              children: [
                _metric('最新步數', _fmt('STEPS', 0), Icons.directions_walk),
                _metric('活動熱量', _fmt('ACTIVE_CALORIES', 0),
                    Icons.local_fire_department),
                _metric('最新體重', _fmt('WEIGHT', 1), Icons.monitor_weight),
                _metric('睡眠', _fmt('SLEEP', 1), Icons.bedtime),
              ],
            ),
            if (_status?.lastSyncedAt != null)
              Padding(
                padding: const EdgeInsets.only(top: 8),
                child: Text(
                    '上次同步：${DateFormat('MM/dd HH:mm').format(_status!.lastSyncedAt!)}',
                    style:
                        const TextStyle(fontSize: 11, color: Colors.black45)),
              ),
            if (_message != null) ...[
              const SizedBox(height: 10),
              Container(
                width: double.infinity,
                padding: const EdgeInsets.all(10),
                decoration: BoxDecoration(
                  color: _isError ? Colors.red[50] : Colors.green[50],
                  borderRadius: BorderRadius.circular(8),
                ),
                child: Text(_message!,
                    style: TextStyle(
                        color: _isError
                            ? Colors.red[900]
                            : Colors.green[900])),
              ),
            ],
            const SizedBox(height: 12),
            SizedBox(
              width: double.infinity,
              child: FilledButton.icon(
                onPressed: _syncing ? null : _sync,
                icon: _syncing
                    ? const SizedBox(
                        height: 18,
                        width: 18,
                        child: CircularProgressIndicator(
                            strokeWidth: 2, color: Colors.white))
                    : const Icon(Icons.sync),
                label: Text(_syncing ? '同步中...' : '同步近 7 天資料'),
              ),
            ),
            if (_connections.where((c) => c.isActive).isNotEmpty) ...[
              const SizedBox(height: 12),
              const Text('已連結裝置',
                  style: TextStyle(fontWeight: FontWeight.w600, fontSize: 13)),
              ..._connections.where((c) => c.isActive).map((c) => ListTile(
                    dense: true,
                    contentPadding: EdgeInsets.zero,
                    leading: const Icon(Icons.smartphone, size: 20),
                    title: Text(c.deviceName ?? c.provider),
                    subtitle: c.lastSyncedAt != null
                        ? Text(
                            '上次同步 ${DateFormat('MM/dd HH:mm').format(c.lastSyncedAt!)}')
                        : const Text('尚未同步'),
                    trailing: TextButton(
                      onPressed: () async {
                        await HealthService.revokeConnection(c.id);
                        await _load();
                      },
                      child: const Text('撤銷',
                          style: TextStyle(color: Colors.red)),
                    ),
                  )),
            ],
          ],
        ),
      ),
    );
  }

  Widget _metric(String label, String value, IconData icon) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
      decoration: BoxDecoration(
        color: const Color(0xFFF5F5F4),
        borderRadius: BorderRadius.circular(12),
      ),
      child: Row(
        children: [
          Icon(icon, size: 20, color: const Color(0xFFB45309)),
          const SizedBox(width: 8),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Text(value,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(
                        fontWeight: FontWeight.w900, fontSize: 14)),
                Text(label,
                    style: const TextStyle(
                        fontSize: 10, color: Colors.black54)),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
