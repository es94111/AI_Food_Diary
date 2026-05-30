import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import '../models/models.dart';
import '../services/health_service.dart';

class _MetricDef {
  const _MetricDef(this.label, this.type, this.icon, this.digits);
  final String label;
  final String type;
  final IconData icon;
  final int digits;
}

const _displayMetrics = <_MetricDef>[
  // activity / energy
  _MetricDef('步數', 'STEPS', Icons.directions_walk, 0),
  _MetricDef('距離', 'DISTANCE', Icons.straighten, 0),
  _MetricDef('速度', 'SPEED', Icons.speed, 1),
  _MetricDef('爬樓層', 'FLIGHTS_CLIMBED', Icons.stairs, 0),
  _MetricDef('活動強度', 'ACTIVITY_INTENSITY', Icons.timer, 0),
  _MetricDef('活動熱量', 'ACTIVE_CALORIES', Icons.local_fire_department, 0),
  _MetricDef('基礎消耗', 'BASAL_CALORIES', Icons.whatshot, 0),
  _MetricDef('總消耗', 'TOTAL_CALORIES', Icons.bolt, 0),
  _MetricDef('運動', 'EXERCISE', Icons.fitness_center, 0),
  // body
  _MetricDef('體重', 'WEIGHT', Icons.monitor_weight, 1),
  _MetricDef('身高', 'HEIGHT', Icons.height, 0),
  _MetricDef('BMI', 'BMI', Icons.calculate, 1),
  _MetricDef('體脂', 'BODY_FAT', Icons.percent, 1),
  _MetricDef('瘦體重', 'LEAN_BODY_MASS', Icons.fitness_center, 1),
  _MetricDef('體水分', 'BODY_WATER_MASS', Icons.opacity, 1),
  _MetricDef('體溫', 'BODY_TEMPERATURE', Icons.thermostat, 1),
  _MetricDef('皮膚溫度', 'SKIN_TEMPERATURE', Icons.device_thermostat, 1),
  // vitals
  _MetricDef('心率', 'HEART_RATE', Icons.monitor_heart, 0),
  _MetricDef('靜息心率', 'RESTING_HEART_RATE', Icons.favorite, 0),
  _MetricDef('HRV', 'HRV', Icons.show_chart, 0),
  _MetricDef('呼吸率', 'RESPIRATORY_RATE', Icons.air, 0),
  _MetricDef('血氧', 'BLOOD_OXYGEN', Icons.bloodtype, 0),
  _MetricDef('收縮壓', 'BLOOD_PRESSURE_SYSTOLIC', Icons.favorite_border, 0),
  _MetricDef('舒張壓', 'BLOOD_PRESSURE_DIASTOLIC', Icons.favorite_border, 0),
  _MetricDef('血糖', 'BLOOD_GLUCOSE', Icons.water_drop_outlined, 0),
  // sleep
  _MetricDef('睡眠', 'SLEEP', Icons.bedtime, 0),
  _MetricDef('深睡', 'SLEEP_DEEP', Icons.nightlight, 0),
  _MetricDef('淺睡', 'SLEEP_LIGHT', Icons.nights_stay, 0),
  _MetricDef('REM', 'SLEEP_REM', Icons.bedtime_outlined, 0),
  _MetricDef('清醒', 'SLEEP_AWAKE', Icons.wb_sunny, 0),
  // nutrition / hydration
  _MetricDef('喝水', 'WATER', Icons.water_drop, 1),
  _MetricDef('營養攝取', 'NUTRITION', Icons.restaurant, 0),
];

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
            const Text('透過 Health Connect 同步步數、熱量、睡眠、運動、心率等資料。',
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
                for (final m in _displayMetrics)
                  _metric(m.label, _fmt(m.type, m.digits), m.icon),
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
