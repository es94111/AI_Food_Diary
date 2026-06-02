import 'dart:math';

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
  const _MetricGroup(this.id, this.title, this.icon, this.color, this.metrics);
  final String id;
  final String title;
  final IconData icon;
  final Color color;
  final List<_MetricDef> metrics;
}

// Daily goals: turns a bare number into "how am I doing". Sleep is in minutes.
const _metricTargets = <String, double>{
  'STEPS': 10000,
  'ACTIVE_CALORIES': 500,
  'EXERCISE': 30,
  'WATER': 2,
  'SLEEP': 480,
};

enum _Status { good, warn, bad }

// Colour semantics for metrics with a clinical normal range. Returns null when
// "good/bad" is context-dependent (e.g. live heart rate).
_Status? _metricStatus(String type, double v) {
  switch (type) {
    case 'RESTING_HEART_RATE':
      if (v < 45 || v > 85) return _Status.bad;
      if (v > 70) return _Status.warn;
      return _Status.good;
    case 'BLOOD_OXYGEN':
      if (v < 90) return _Status.bad;
      if (v < 95) return _Status.warn;
      return _Status.good;
    case 'BMI':
      if (v >= 30 || v < 17) return _Status.bad;
      if (v >= 25 || v < 18.5) return _Status.warn;
      return _Status.good;
    case 'BLOOD_PRESSURE_SYSTOLIC':
      if (v >= 140) return _Status.bad;
      if (v >= 120) return _Status.warn;
      return _Status.good;
    case 'BLOOD_PRESSURE_DIASTOLIC':
      if (v >= 90) return _Status.bad;
      if (v >= 80) return _Status.warn;
      return _Status.good;
    default:
      return null;
  }
}

Color _statusColor(_Status s) => switch (s) {
      _Status.good => const Color(0xFF059669),
      _Status.warn => const Color(0xFFD97706),
      _Status.bad => const Color(0xFFE11D48),
    };

String _compact(double v) => NumberFormat.decimalPattern().format(v.round());

// Metrics grouped by category, each with its own accent colour, so the health
// page reads as an infographic with related metrics kept together.
const _metricGroups = <_MetricGroup>[
  _MetricGroup('activity', '活動與能量', Icons.directions_run, Color(0xFFB45309), [
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
  _MetricGroup('body', '身體組成', Icons.accessibility_new, Color(0xFF0284C7), [
    _MetricDef('體重', 'WEIGHT', Icons.monitor_weight, 1),
    _MetricDef('身高', 'HEIGHT', Icons.height, 0),
    _MetricDef('BMI', 'BMI', Icons.calculate, 1),
    _MetricDef('體脂', 'BODY_FAT', Icons.percent, 1),
    _MetricDef('瘦體重', 'LEAN_BODY_MASS', Icons.fitness_center, 1),
    _MetricDef('體水分', 'BODY_WATER_MASS', Icons.opacity, 1),
    _MetricDef('體溫', 'BODY_TEMPERATURE', Icons.thermostat, 1),
    _MetricDef('皮膚溫度', 'SKIN_TEMPERATURE', Icons.device_thermostat, 1),
  ]),
  _MetricGroup('vitals', '生命徵象', Icons.favorite, Color(0xFFE11D48), [
    _MetricDef('心率', 'HEART_RATE', Icons.monitor_heart, 0),
    _MetricDef('靜息心率', 'RESTING_HEART_RATE', Icons.favorite, 0),
    _MetricDef('HRV', 'HRV', Icons.show_chart, 0),
    _MetricDef('呼吸率', 'RESPIRATORY_RATE', Icons.air, 0),
    _MetricDef('血氧', 'BLOOD_OXYGEN', Icons.bloodtype, 0),
    _MetricDef('收縮壓', 'BLOOD_PRESSURE_SYSTOLIC', Icons.favorite_border, 0),
    _MetricDef('舒張壓', 'BLOOD_PRESSURE_DIASTOLIC', Icons.favorite_border, 0),
    _MetricDef('血糖', 'BLOOD_GLUCOSE', Icons.water_drop_outlined, 0),
  ]),
  _MetricGroup('sleep', '睡眠', Icons.bedtime, Color(0xFF6366F1), [
    _MetricDef('睡眠', 'SLEEP', Icons.bedtime, 0, sleep: true),
    _MetricDef('深睡', 'SLEEP_DEEP', Icons.nightlight, 0, sleep: true),
    _MetricDef('淺睡', 'SLEEP_LIGHT', Icons.nights_stay, 0, sleep: true),
    _MetricDef('REM', 'SLEEP_REM', Icons.bedtime_outlined, 0, sleep: true),
    _MetricDef('清醒', 'SLEEP_AWAKE', Icons.wb_sunny, 0, sleep: true),
  ]),
  _MetricGroup('nutrition', '飲食與水分', Icons.restaurant, Color(0xFF059669), [
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
  bool _syncing = false;
  String? _message;
  bool _isError = false;

  @override
  void initState() {
    super.initState();
    _init();
  }

  Future<void> _init() async {
    await _load();
    await _maybeAutoSync();
  }

  Future<void> _load() async {
    try {
      final status = await HealthService.status();
      if (mounted) {
        setState(() {
          _status = status;
        });
      }
    } catch (_) {}
  }

  /// Auto-sync once when the app opens, but only if Health Connect read access
  /// is already granted — so we never pop a permission dialog unprompted. The
  /// meal-mirror write (which can itself prompt) is left to the manual button.
  Future<void> _maybeAutoSync() async {
    try {
      if (await HealthService.hasPermissions() && mounted) {
        await _sync(mirrorMeals: false);
      }
    } catch (_) {}
  }

  Future<void> _sync({bool mirrorMeals = true}) async {
    setState(() {
      _syncing = true;
      _message = null;
    });
    try {
      // Mirror freshly logged meals into Health Connect *before* reading it back,
      // otherwise the meal just logged isn't visible to this sync and today's
      // nutrition lags one sync behind. Best-effort: a write failure must not
      // block the core health-data sync.
      var meals = 0;
      var water = 0;
      if (mirrorMeals) {
        try {
          meals = await HealthService.writeRecentMealsToHealth();
        } catch (e) {
          debugPrint('HealthSync: meal mirror failed $e');
        }
        try {
          water = await HealthService.writeRecentWaterToHealth();
        } catch (e) {
          debugPrint('HealthSync: water mirror failed $e');
        }
      }
      final count = await HealthService.syncNow();
      await _load();
      await widget.onSynced();
      setState(() {
        _isError = false;
        final base = count == 0 ? '近 7 天無健康資料' : '同步成功！已上傳 $count 筆資料';
        final mirrored = [
          if (meals > 0) '$meals 筆營養紀錄',
          if (water > 0) '$water 筆喝水紀錄',
        ];
        _message = mirrored.isNotEmpty
            ? '$base，並寫入 ${mirrored.join('、')}至 Health Connect'
            : base;
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

  HealthMetricValue? _metric(String type) => _status?.latestByType[type];

  bool _isToday(DateTime d) {
    final now = DateTime.now();
    return d.year == now.year && d.month == now.month && d.day == now.day;
  }

  /// Latest reading for [type], but only if it was measured today. Used for
  /// daily snapshots (activity, vitals, sleep, nutrition) where stale data is
  /// misleading. Body composition uses [_metric] directly to keep older values.
  HealthMetricValue? _todayMetric(String type) {
    final m = _metric(type);
    return (m != null && _isToday(m.measuredAt)) ? m : null;
  }

  String _fmt(_MetricDef def) {
    final m = _metric(def.type);
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
            _activityHero(),
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
          ],
        ),
      ),
    );
  }

  /// Apple-style activity rings: the day's hero summary for the health card.
  Widget _activityHero() {
    const rings = [
      ('STEPS', '步數', Color(0xFFFBBF24)),
      ('ACTIVE_CALORIES', '活動熱量', Color(0xFFFB7185)),
      ('EXERCISE', '運動', Color(0xFF34D399)),
    ];
    if (!rings.any((r) => _todayMetric(r.$1) != null)) {
      return const SizedBox.shrink();
    }
    return Container(
      margin: const EdgeInsets.only(top: 14),
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: const Color(0xFF1C1917),
        borderRadius: BorderRadius.circular(20),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text('今日活動',
              style: TextStyle(
                  color: Colors.white70,
                  fontSize: 13,
                  fontWeight: FontWeight.w600)),
          const SizedBox(height: 12),
          Row(
            children: [
              for (final r in rings)
                Expanded(child: _heroRing(r.$1, r.$2, r.$3)),
            ],
          ),
        ],
      ),
    );
  }

  Widget _heroRing(String type, String label, Color color) {
    final m = _todayMetric(type);
    final target = _metricTargets[type] ?? 1;
    final pct = m == null ? 0.0 : m.value / target;
    return Column(
      children: [
        SizedBox(
          height: 64,
          width: 64,
          child: CustomPaint(
            painter: _RingPainter(pct, color),
            child: Center(
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  FittedBox(
                    child: Text(m == null ? '—' : _compact(m.value),
                        style: const TextStyle(
                            color: Colors.white,
                            fontSize: 14,
                            fontWeight: FontWeight.w900)),
                  ),
                  Text(m == null ? '未同步' : '${(pct * 100).round()}%',
                      style: const TextStyle(
                          color: Colors.white54, fontSize: 9)),
                ],
              ),
            ),
          ),
        ),
        const SizedBox(height: 6),
        Text(label,
            style: const TextStyle(
                color: Colors.white70,
                fontSize: 11,
                fontWeight: FontWeight.w600)),
        Text('目標 ${_compact(target)}',
            style: const TextStyle(color: Colors.white38, fontSize: 9)),
      ],
    );
  }

  /// One category: a coloured header, an optional chart (weight trend / sleep
  /// stages), then a grid of tinted tiles. Tiles with no synced data are hidden,
  /// and the whole section collapses when nothing is available.
  Widget _groupSection(_MetricGroup group) {
    // Body composition keeps older readings (shown with their timestamp); every
    // other group is a daily snapshot, so only today's data is displayed.
    final showHistory = group.id == 'body';
    final present = group.metrics
        .where((m) =>
            (showHistory ? _metric(m.type) : _todayMetric(m.type)) != null)
        .toList();
    final chart = _groupChart(group);
    if (present.isEmpty && chart == null) return const SizedBox.shrink();
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
          if (chart != null) ...[
            const SizedBox(height: 12),
            chart,
          ],
          if (present.isNotEmpty) ...[
            const SizedBox(height: 8),
            GridView.count(
              crossAxisCount: 3,
              shrinkWrap: true,
              physics: const NeverScrollableScrollPhysics(),
              // Body tiles carry an extra timestamp line, so give them more height.
              childAspectRatio: showHistory ? 1.05 : 1.4,
              mainAxisSpacing: 8,
              crossAxisSpacing: 8,
              children: [
                for (final m in present)
                  _metricTile(m, group.color, showTime: showHistory),
              ],
            ),
          ],
        ],
      ),
    );
  }

  Widget? _groupChart(_MetricGroup group) {
    if (group.id == 'sleep') {
      // Sleep belongs to one night; hide the chart unless it's last night's.
      if (_todayMetric('SLEEP') == null) return null;
      final segs = _metric('SLEEP')?.sleepStages ?? const <SleepSegment>[];
      final bar = _sleepBar();
      final hypno = segs.length >= 2 ? _Hypnogram(segments: segs) : null;
      if (hypno == null && bar == null) return null;
      return Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          ?hypno,
          if (hypno != null && bar != null) const SizedBox(height: 14),
          ?bar,
        ],
      );
    }
    if (group.id == 'body') {
      final series = _status?.weightSeries ?? const <double>[];
      return series.length >= 2 ? _Sparkline(points: series) : null;
    }
    return null;
  }

  Widget _metricTile(_MetricDef def, Color color, {bool showTime = false}) {
    final m = _metric(def.type);
    final status = m == null ? null : _metricStatus(def.type, m.value);
    final valueColor = status != null ? _statusColor(status) : Colors.black87;
    final target = _metricTargets[def.type];
    final pct = (m != null && target != null)
        ? (m.value / target).clamp(0.0, 1.0)
        : null;
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
              style: TextStyle(
                  fontWeight: FontWeight.w900,
                  fontSize: 14,
                  color: valueColor)),
          Text(def.label,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: const TextStyle(fontSize: 10, color: Colors.black54)),
          if (showTime && m != null)
            Text(DateFormat('MM/dd HH:mm').format(m.measuredAt),
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(fontSize: 9, color: Colors.black38)),
          if (pct != null) ...[
            const SizedBox(height: 5),
            ClipRRect(
              borderRadius: BorderRadius.circular(3),
              child: LinearProgressIndicator(
                value: pct,
                minHeight: 4,
                color: color,
                backgroundColor: color.withValues(alpha: 0.15),
              ),
            ),
          ],
        ],
      ),
    );
  }

  /// Stacked composition bar for sleep stages (values in minutes).
  Widget? _sleepBar() {
    double v(String t) => _metric(t)?.value ?? 0;
    final segs = <(String, double, Color)>[
      ('深睡', v('SLEEP_DEEP'), const Color(0xFF4338CA)),
      ('淺睡', v('SLEEP_LIGHT'), const Color(0xFF818CF8)),
      ('REM', v('SLEEP_REM'), const Color(0xFFC4B5FD)),
      ('清醒', v('SLEEP_AWAKE'), const Color(0xFFFCD34D)),
    ];
    final total = segs.fold<double>(0, (s, e) => s + e.$2);
    if (total <= 0) return null;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        ClipRRect(
          borderRadius: BorderRadius.circular(6),
          child: Row(
            children: [
              for (final s in segs)
                if (s.$2 > 0)
                  Expanded(
                    flex: s.$2.round().clamp(1, 100000),
                    child: Container(height: 10, color: s.$3),
                  ),
            ],
          ),
        ),
        const SizedBox(height: 8),
        Wrap(
          spacing: 12,
          runSpacing: 4,
          children: [
            for (final s in segs)
              if (s.$2 > 0) _sleepLegend(s.$1, s.$2, s.$3),
          ],
        ),
      ],
    );
  }

  Widget _sleepLegend(String label, double minutes, Color color) {
    final t = minutes.round();
    final h = t ~/ 60;
    final mm = (t % 60).toString().padLeft(2, '0');
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Container(
            width: 8,
            height: 8,
            decoration: BoxDecoration(color: color, shape: BoxShape.circle)),
        const SizedBox(width: 4),
        Text('$label $h:$mm',
            style: const TextStyle(fontSize: 11, color: Colors.black54)),
      ],
    );
  }
}

/// Hypnogram: a per-night timeline of which sleep stage occurred at what clock
/// time. Lanes run top→bottom (awake → deep); each segment is a coloured block
/// positioned horizontally by its start/end within the night's span.
class _Hypnogram extends StatelessWidget {
  const _Hypnogram({required this.segments});
  final List<SleepSegment> segments;

  static const _lanes = ['AWAKE', 'REM', 'LIGHT', 'DEEP'];
  static const _labels = {
    'AWAKE': '清醒',
    'REM': 'REM',
    'LIGHT': '淺睡',
    'DEEP': '深睡',
  };
  static const _colors = {
    'DEEP': Color(0xFF4338CA),
    'LIGHT': Color(0xFF818CF8),
    'REM': Color(0xFFC4B5FD),
    'AWAKE': Color(0xFFFCD34D),
  };
  static const _laneHeight = 18.0;
  static const _labelWidth = 30.0;

  @override
  Widget build(BuildContext context) {
    final segs = [...segments]..sort((a, b) => a.start.compareTo(b.start));
    final start = segs.first.start;
    final end = segs.map((s) => s.end).reduce((a, b) => a.isAfter(b) ? a : b);
    if (!end.isAfter(start)) return const SizedBox.shrink();
    final fmt = DateFormat('HH:mm');
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Text('睡眠階段時間軸',
            style: TextStyle(fontSize: 12, color: Colors.black54)),
        const SizedBox(height: 6),
        Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            SizedBox(
              width: _labelWidth,
              child: Column(
                children: [
                  for (final l in _lanes)
                    SizedBox(
                      height: _laneHeight,
                      child: Align(
                        alignment: Alignment.centerRight,
                        child: Text(_labels[l]!,
                            style: const TextStyle(
                                fontSize: 9, color: Colors.black45)),
                      ),
                    ),
                ],
              ),
            ),
            const SizedBox(width: 6),
            Expanded(
              child: SizedBox(
                height: _lanes.length * _laneHeight,
                child: CustomPaint(
                  painter: _HypnoPainter(segs, start,
                      end.difference(start).inSeconds, _colors),
                ),
              ),
            ),
          ],
        ),
        const SizedBox(height: 4),
        Padding(
          padding: const EdgeInsets.only(left: _labelWidth + 6),
          child: Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text(fmt.format(start),
                  style: const TextStyle(fontSize: 9, color: Colors.black38)),
              Text(fmt.format(end),
                  style: const TextStyle(fontSize: 9, color: Colors.black38)),
            ],
          ),
        ),
      ],
    );
  }
}

class _HypnoPainter extends CustomPainter {
  _HypnoPainter(this.segs, this.start, this.spanSeconds, this.colors);
  final List<SleepSegment> segs;
  final DateTime start;
  final int spanSeconds;
  final Map<String, Color> colors;

  static const _laneIndex = {'AWAKE': 0, 'REM': 1, 'LIGHT': 2, 'DEEP': 3};
  static const _laneHeight = 18.0;

  @override
  void paint(Canvas canvas, Size size) {
    if (spanSeconds <= 0) return;
    // Faint baseline per lane.
    final track = Paint()..color = const Color(0x11000000);
    for (var i = 0; i < 4; i++) {
      final y = i * _laneHeight + _laneHeight / 2;
      canvas.drawRect(Rect.fromLTWH(0, y, size.width, 1), track);
    }
    for (final s in segs) {
      final lane = _laneIndex[s.stage];
      final color = colors[s.stage];
      if (lane == null || color == null) continue;
      final x1 = s.start.difference(start).inSeconds / spanSeconds * size.width;
      final x2 = s.end.difference(start).inSeconds / spanSeconds * size.width;
      final w = (x2 - x1).clamp(1.5, size.width);
      final rect = Rect.fromLTWH(x1, lane * _laneHeight + 3, w, _laneHeight - 6);
      canvas.drawRRect(
        RRect.fromRectAndRadius(rect, const Radius.circular(2)),
        Paint()..color = color,
      );
    }
  }

  @override
  bool shouldRepaint(_HypnoPainter old) =>
      old.segs != segs || old.spanSeconds != spanSeconds;
}

/// Apple-style activity ring painter (background track + rounded progress arc).
class _RingPainter extends CustomPainter {
  _RingPainter(this.percent, this.color);
  final double percent;
  final Color color;

  @override
  void paint(Canvas canvas, Size size) {
    const stroke = 7.0;
    final center = Offset(size.width / 2, size.height / 2);
    final radius = (size.shortestSide - stroke) / 2;
    final track = Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = stroke
      ..color = color.withValues(alpha: 0.15);
    canvas.drawCircle(center, radius, track);
    final arc = Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = stroke
      ..strokeCap = StrokeCap.round
      ..color = color;
    final sweep = 2 * pi * percent.clamp(0.0, 1.0);
    canvas.drawArc(
        Rect.fromCircle(center: center, radius: radius), -pi / 2, sweep, false, arc);
  }

  @override
  bool shouldRepaint(_RingPainter old) =>
      old.percent != percent || old.color != color;
}

/// Lightweight inline weight trend line — no chart library, just a polyline.
class _Sparkline extends StatelessWidget {
  const _Sparkline({required this.points});
  final List<double> points;

  @override
  Widget build(BuildContext context) {
    final first = points.first;
    final last = points.last;
    final delta = last - first;
    final deltaColor = delta > 0
        ? const Color(0xFFE11D48)
        : delta < 0
            ? const Color(0xFF059669)
            : Colors.black45;
    final arrow = delta > 0
        ? '▲'
        : delta < 0
            ? '▼'
            : '＝';
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            const Text('體重趨勢（近 14 筆）',
                style: TextStyle(fontSize: 12, color: Colors.black54)),
            Text('$arrow ${delta.abs().toStringAsFixed(1)} kg',
                style: TextStyle(
                    fontSize: 12,
                    fontWeight: FontWeight.w700,
                    color: deltaColor)),
          ],
        ),
        const SizedBox(height: 4),
        SizedBox(
          height: 48,
          width: double.infinity,
          child: CustomPaint(painter: _SparkPainter(points)),
        ),
        Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            Text(first.toStringAsFixed(1),
                style: const TextStyle(fontSize: 11, color: Colors.black38)),
            Text('最新 ${last.toStringAsFixed(1)} kg',
                style: const TextStyle(fontSize: 11, color: Colors.black38)),
          ],
        ),
      ],
    );
  }
}

class _SparkPainter extends CustomPainter {
  _SparkPainter(this.points);
  final List<double> points;

  @override
  void paint(Canvas canvas, Size size) {
    if (points.length < 2) return;
    final minV = points.reduce(min);
    final maxV = points.reduce(max);
    final range = (maxV - minV).abs() < 1e-9 ? 1.0 : maxV - minV;
    const pad = 4.0;
    Offset at(int i) {
      final x = pad + (i / (points.length - 1)) * (size.width - 2 * pad);
      final y = pad + (1 - (points[i] - minV) / range) * (size.height - 2 * pad);
      return Offset(x, y);
    }

    final path = Path()..moveTo(at(0).dx, at(0).dy);
    for (var i = 1; i < points.length; i++) {
      path.lineTo(at(i).dx, at(i).dy);
    }
    canvas.drawPath(
      path,
      Paint()
        ..style = PaintingStyle.stroke
        ..strokeWidth = 2
        ..strokeCap = StrokeCap.round
        ..strokeJoin = StrokeJoin.round
        ..color = const Color(0xFF0EA5E9),
    );
    canvas.drawCircle(
        at(points.length - 1), 3, Paint()..color = const Color(0xFF0EA5E9));
  }

  @override
  bool shouldRepaint(_SparkPainter old) => old.points != points;
}
