import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import '../models/models.dart';
import '../services/health_service.dart';

class _MetricDef {
  const _MetricDef(this.label, this.type, this.icon, this.digits,
      {this.sleep = false});
  final String label;
  final String type;
  final IconData icon;
  final int digits;
  final bool sleep;
}

class _MetricGroup {
  const _MetricGroup(this.title, this.icon, this.color, this.metrics);
  final String title;
  final IconData icon;
  final Color color;
  final List<_MetricDef> metrics;
}

// Metrics grouped by category, each with its own accent colour, so the health
// page reads as an infographic with related metrics kept together.
const _metricGroups = <_MetricGroup>[
  _MetricGroup('活動與能量', Icons.directions_run, Color(0xFFB45309), [
    _MetricDef('步數', 'STEPS', Icons.directions_walk, 0),
    _MetricDef('距離', 'DISTANCE', Icons.straighten, 0),
    _MetricDef('速度', 'SPEED', Icons.speed, 1),
    _MetricDef('爬樓層', 'FLIGHTS_CLIMBED', Icons.stairs, 0),
    _MetricDef('活動強度', 'ACTIVITY_INTENSITY', Icons.timer, 0),
    _MetricDef('活動熱量', 'ACTIVE_CALORIES', Icons.local_fire_department, 0),
    _MetricDef('基礎消耗', 'BASAL_CALORIES', Icons.whatshot, 0),
    _MetricDef('總消耗', 'TOTAL_CALORIES', Icons.bolt, 0),
    _MetricDef('運動', 'EXERCISE', Icons.fitness_center, 0),
  ]),
  _MetricGroup('身體組成', Icons.accessibility_new, Color(0xFF0284C7), [
    _MetricDef('體重', 'WEIGHT', Icons.monitor_weight, 1),
    _MetricDef('身高', 'HEIGHT', Icons.height, 0),
    _MetricDef('BMI', 'BMI', Icons.calculate, 1),
    _MetricDef('體脂', 'BODY_FAT', Icons.percent, 1),
    _MetricDef('瘦體重', 'LEAN_BODY_MASS', Icons.fitness_center, 1),
    _MetricDef('體水分', 'BODY_WATER_MASS', Icons.opacity, 1),
    _MetricDef('體溫', 'BODY_TEMPERATURE', Icons.thermostat, 1),
    _MetricDef('皮膚溫度', 'SKIN_TEMPERATURE', Icons.device_thermostat, 1),
  ]),
  _MetricGroup('生命徵象', Icons.favorite, Color(0xFFE11D48), [
    _MetricDef('心率', 'HEART_RATE', Icons.monitor_heart, 0),
    _MetricDef('靜息心率', 'RESTING_HEART_RATE', Icons.favorite, 0),
    _MetricDef('HRV', 'HRV', Icons.show_chart, 0),
    _MetricDef('呼吸率', 'RESPIRATORY_RATE', Icons.air, 0),
    _MetricDef('血氧', 'BLOOD_OXYGEN', Icons.bloodtype, 0),
    _MetricDef('收縮壓', 'BLOOD_PRESSURE_SYSTOLIC', Icons.favorite_border, 0),
    _MetricDef('舒張壓', 'BLOOD_PRESSURE_DIASTOLIC', Icons.favorite_border, 0),
    _MetricDef('血糖', 'BLOOD_GLUCOSE', Icons.water_drop_outlined, 0),
  ]),
  _MetricGroup('睡眠', Icons.bedtime, Color(0xFF6366F1), [
    _MetricDef('睡眠', 'SLEEP', Icons.bedtime, 0, sleep: true),
    _MetricDef('深睡', 'SLEEP_DEEP', Icons.nightlight, 0, sleep: true),
    _MetricDef('淺睡', 'SLEEP_LIGHT', Icons.nights_stay, 0, sleep: true),
    _MetricDef('REM', 'SLEEP_REM', Icons.bedtime_outlined, 0, sleep: true),
    _MetricDef('清醒', 'SLEEP_AWAKE', Icons.wb_sunny, 0, sleep: true),
  ]),
  _MetricGroup('飲食與水分', Icons.restaurant, Color(0xFF059669), [
    _MetricDef('喝水', 'WATER', Icons.water_drop, 1),
    _MetricDef('營養攝取', 'NUTRITION', Icons.restaurant, 0),
  ]),
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
      final meals = await HealthService.writeRecentMealsToHealth();
      await _load();
      await widget.onSynced();
      setState(() {
        _isError = false;
        final base = count == 0 ? '近 7 天無健康資料' : '同步成功！已上傳 $count 筆資料';
        _message =
            meals > 0 ? '$base，並寫入 $meals 筆營養紀錄至 Health Connect' : base;
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

  String _fmt(_MetricDef def) {
    final m = _status?.latestByType[def.type];
    if (m == null) return '—';
    // Sleep durations read better as H:MM than raw minutes.
    if (def.sleep) return _hhmm(m.value);
    return '${m.value.toStringAsFixed(def.digits)} ${m.unit}';
  }

  String _hhmm(double minutes) {
    final total = minutes.round();
    final h = total ~/ 60;
    final mm = (total % 60).toString().padLeft(2, '0');
    return '$h:$mm';
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
            const SizedBox(height: 4),
            for (final g in _metricGroups) _groupSection(g),
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

  /// One category: a coloured header (icon + title) followed by a grid of
  /// tinted metric tiles sharing the group's accent colour.
  Widget _groupSection(_MetricGroup group) {
    return Padding(
      padding: const EdgeInsets.only(top: 14),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Container(
                padding: const EdgeInsets.all(6),
                decoration: BoxDecoration(
                  color: group.color.withValues(alpha: 0.12),
                  borderRadius: BorderRadius.circular(10),
                ),
                child: Icon(group.icon, size: 18, color: group.color),
              ),
              const SizedBox(width: 8),
              Text(group.title,
                  style: const TextStyle(
                      fontSize: 15, fontWeight: FontWeight.w900)),
            ],
          ),
          const SizedBox(height: 8),
          GridView.count(
            crossAxisCount: 3,
            shrinkWrap: true,
            physics: const NeverScrollableScrollPhysics(),
            childAspectRatio: 1.55,
            mainAxisSpacing: 8,
            crossAxisSpacing: 8,
            children: [
              for (final m in group.metrics) _metricTile(m, group.color),
            ],
          ),
        ],
      ),
    );
  }

  Widget _metricTile(_MetricDef def, Color color) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.08),
        borderRadius: BorderRadius.circular(14),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Icon(def.icon, size: 18, color: color),
          const SizedBox(height: 4),
          Text(_fmt(def),
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: const TextStyle(
                  fontWeight: FontWeight.w900, fontSize: 14)),
          Text(def.label,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: const TextStyle(fontSize: 10, color: Colors.black54)),
        ],
      ),
    );
  }
}
