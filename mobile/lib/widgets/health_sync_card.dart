import 'dart:math';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:intl/intl.dart';
import 'package:open_filex/open_filex.dart';

import '../models/models.dart';
import '../services/app_logger.dart';
import '../services/health_service.dart';
import '../theme/app_theme.dart';

class _MetricDef {
  const _MetricDef(
    this.label,
    this.type,
    this.icon,
    this.digits, {
    this.sleep = false,
  });
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
  _Status.good => AppColors.statusGood,
  _Status.warn => AppColors.statusWarn,
  _Status.bad => AppColors.statusBad,
};

String _compact(double v) => NumberFormat.decimalPattern().format(v.round());

// Metrics grouped by category, each with its own accent colour, so the health
// page reads as an infographic with related metrics kept together.
const _metricGroups = <_MetricGroup>[
  _MetricGroup('activity', '活動與能量', Icons.directions_run, AppColors.activity, [
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
  _MetricGroup('body', '身體組成', Icons.accessibility_new, AppColors.body, [
    _MetricDef('體重', 'WEIGHT', Icons.monitor_weight, 1),
    _MetricDef('身高', 'HEIGHT', Icons.height, 0),
    _MetricDef('BMI', 'BMI', Icons.calculate, 1),
    _MetricDef('體脂', 'BODY_FAT', Icons.percent, 1),
    _MetricDef('瘦體重', 'LEAN_BODY_MASS', Icons.fitness_center, 1),
    _MetricDef('體水分', 'BODY_WATER_MASS', Icons.opacity, 1),
    _MetricDef('體溫', 'BODY_TEMPERATURE', Icons.thermostat, 1),
    _MetricDef('皮膚溫度', 'SKIN_TEMPERATURE', Icons.device_thermostat, 1),
  ]),
  _MetricGroup('vitals', '生命徵象', Icons.favorite, AppColors.vitals, [
    _MetricDef('心率', 'HEART_RATE', Icons.monitor_heart, 0),
    _MetricDef('靜息心率', 'RESTING_HEART_RATE', Icons.favorite, 0),
    _MetricDef('HRV', 'HRV', Icons.show_chart, 0),
    _MetricDef('呼吸率', 'RESPIRATORY_RATE', Icons.air, 0),
    _MetricDef('血氧', 'BLOOD_OXYGEN', Icons.bloodtype, 0),
    _MetricDef('收縮壓', 'BLOOD_PRESSURE_SYSTOLIC', Icons.favorite_border, 0),
    _MetricDef('舒張壓', 'BLOOD_PRESSURE_DIASTOLIC', Icons.favorite_border, 0),
    _MetricDef('血糖', 'BLOOD_GLUCOSE', Icons.water_drop_outlined, 0),
  ]),
  _MetricGroup('sleep', '睡眠', Icons.bedtime, AppColors.sleep, [
    _MetricDef('睡眠', 'SLEEP', Icons.bedtime, 0, sleep: true),
    _MetricDef('深睡', 'SLEEP_DEEP', Icons.nightlight, 0, sleep: true),
    _MetricDef('淺睡', 'SLEEP_LIGHT', Icons.nights_stay, 0, sleep: true),
    _MetricDef('REM', 'SLEEP_REM', Icons.bedtime_outlined, 0, sleep: true),
    _MetricDef('清醒', 'SLEEP_AWAKE', Icons.wb_sunny, 0, sleep: true),
  ]),
  _MetricGroup('nutrition', '飲食與水分', Icons.restaurant, AppColors.nutrition, [
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

// Selectable sync ranges. The chosen range drives how far back Health Connect
// history (steps/weight/vitals/sleep) is pulled; the app's own meal/water
// backfill is capped separately in HealthService (see _appDataMaxDays).
const _syncRangeOptions = <(int, String)>[
  (7, '近 7 天'),
  (14, '近 14 天'),
  (30, '近 1 個月'),
  (90, '近 3 個月'),
  (365, '近 1 年'),
  (1095, '近 3 年'),
];

String _syncRangeLabel(int days) => _syncRangeOptions
    .firstWhere((o) => o.$1 == days, orElse: () => (days, '近 $days 天'))
    .$2;

class _HealthSyncCardState extends State<HealthSyncCard> {
  HealthSyncStatus? _status;
  bool _syncing = false;
  String? _message;
  bool _isError = false;
  int _syncDays = 7;

  @override
  void initState() {
    super.initState();
    _init();
  }

  Future<void> _init() async {
    await _load();
  }

  Future<void> _load() async {
    // Paint instantly from last session's cache while the real fetch below
    // refreshes it in the background.
    final cached = await HealthService.cachedStatus();
    if (cached != null && mounted) setState(() => _status = cached);
    try {
      final status = await HealthService.status();
      if (mounted) {
        setState(() {
          _status = status;
        });
      }
    } catch (_) {}
  }

  Future<void> _sync({bool mirrorMeals = true, int? days}) async {
    final syncDays = days ?? _syncDays;
    AppLogger.log(
      'HealthCard',
      '使用者觸發同步：範圍 $syncDays 天，mirrorMeals=$mirrorMeals',
    );
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
          meals = await HealthService.writeRecentMealsToHealth(days: syncDays);
        } catch (e) {
          debugPrint('HealthSync: meal mirror failed $e');
          AppLogger.log('HealthCard', '餐點寫入 Health Connect 失敗：$e');
        }
        try {
          water = await HealthService.writeRecentWaterToHealth(days: syncDays);
        } catch (e) {
          debugPrint('HealthSync: water mirror failed $e');
          AppLogger.log('HealthCard', '喝水寫入 Health Connect 失敗：$e');
        }
      }
      final report = await HealthService.syncNow(days: syncDays);
      // When mirroring, check whether Health Connect actually granted nutrition
      // write — if not, the meals never reach Samsung Health and we should say so.
      final nutritionWriteOk = mirrorMeals
          ? await HealthService.hasNutritionWritePermission()
          : true;
      await _load();
      await widget.onSynced();
      setState(() {
        _isError = false;
        final lines = <String>[];
        lines.add(
          report.synced == 0
              ? '${_syncRangeLabel(syncDays)}無健康資料'
              : '同步成功！已上傳 ${report.synced} 筆資料',
        );

        // Partial failure: some batches didn't go through (transient error /
        // timeout). The rest landed; a later re-sync safely fills the gap.
        if (report.hasFailedBatches) {
          lines.add(
            '⚠️ 有 ${report.batchesFailed}/${report.batchesTotal} 批未送出，'
            '稍後再同步一次即可補齊（不會重複）。',
          );
        }

        // Cloud nutrition: surface exactly why it did/didn't sync.
        if (report.nutritionUploaded == 0) {
          lines.add('🍽️ 營養：${_syncRangeLabel(syncDays)}沒有可同步的餐點熱量（請先記錄餐點）。');
        } else if (report.nutritionVerified) {
          lines.add('🍽️ 營養：已上傳並在雲端確認 ✓');
        } else {
          lines.add(
            '⚠️ 營養：已上傳 ${report.nutritionUploaded} 筆，但雲端未確認到，請稍後再同步一次。',
          );
        }

        // Any other uploaded type that didn't verify on read-back.
        final otherMissing = report.missingTypes
            .where((t) => t != 'NUTRITION')
            .toList();
        if (otherMissing.isNotEmpty) {
          lines.add('⚠️ 未確認：${otherMissing.join('、')}');
        }

        final mirrored = [
          if (meals > 0) '$meals 筆營養紀錄',
          if (water > 0) '$water 筆喝水紀錄',
        ];
        if (mirrored.isNotEmpty) {
          lines.add('已寫入 ${mirrored.join('、')}至 Health Connect');
        }
        if (!nutritionWriteOk) {
          lines.add(
            '⚠️ 尚未授予 Health Connect 的「營養」寫入權限，營養不會出現在三星健康。'
            '請至 Health Connect →「應用程式權限」→ 本 App，開啟「營養」的寫入。',
          );
        }
        _message = lines.join('\n');
      });
    } catch (e, stack) {
      debugPrint('HealthSync: ERROR $e');
      debugPrint('$stack');
      AppLogger.error('HealthCard', e, stack);
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
    final p = context.palette;
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text(
              '健康同步',
              style: TextStyle(fontSize: 18, fontWeight: FontWeight.w900),
            ),
            const SizedBox(height: 2),
            Text(
              '透過 Health Connect 同步步數、熱量、睡眠、運動、心率等資料。',
              style: TextStyle(fontSize: 11, color: p.inkSoft),
            ),
            _activityHero(),
            for (final g in _metricGroups) _groupSection(g),
            if (_status?.lastSyncedAt != null)
              Padding(
                padding: const EdgeInsets.only(top: 8),
                child: Text(
                  '上次同步：${DateFormat('MM/dd HH:mm').format(_status!.lastSyncedAt!)}',
                  style: TextStyle(fontSize: 11, color: p.inkFaint),
                ),
              ),
            if (_message != null) ...[
              const SizedBox(height: 10),
              Container(
                width: double.infinity,
                padding: const EdgeInsets.all(10),
                decoration: BoxDecoration(
                  color: _isError ? p.dangerSurface : p.successSurface,
                  borderRadius: BorderRadius.circular(8),
                ),
                child: Text(
                  _message!,
                  style: TextStyle(
                    color: _isError ? p.dangerInk : p.successInk,
                  ),
                ),
              ),
            ],
            const SizedBox(height: 12),
            Row(
              children: [
                const Text(
                  '同步範圍',
                  style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: DropdownButtonFormField<int>(
                    initialValue: _syncDays,
                    isExpanded: true,
                    decoration: const InputDecoration(
                      isDense: true,
                      border: OutlineInputBorder(),
                      contentPadding: EdgeInsets.symmetric(
                        horizontal: 12,
                        vertical: 8,
                      ),
                    ),
                    items: [
                      for (final o in _syncRangeOptions)
                        DropdownMenuItem(value: o.$1, child: Text(o.$2)),
                    ],
                    onChanged: _syncing
                        ? null
                        : (v) {
                            if (v != null) setState(() => _syncDays = v);
                          },
                  ),
                ),
              ],
            ),
            if (_syncDays > HealthService.appDataMaxDays) ...[
              const SizedBox(height: 6),
              Text(
                '長範圍會帶入更久的健康歷史；餐點與喝水僅回補近 ${HealthService.appDataMaxDays} 天。',
                style: TextStyle(fontSize: 11, color: p.inkSoft),
              ),
            ],
            const SizedBox(height: 12),
            SizedBox(
              width: double.infinity,
              child: FilledButton.icon(
                onPressed: _syncing ? null : _sync,
                icon: _syncing
                    ? SizedBox(
                        height: 18,
                        width: 18,
                        child: CircularProgressIndicator(
                          strokeWidth: 2,
                          color: p.onBrand,
                        ),
                      )
                    : const Icon(Icons.sync),
                label: Text(
                  _syncing ? '同步中...' : '同步${_syncRangeLabel(_syncDays)}資料',
                ),
              ),
            ),
            const SizedBox(height: 4),
            Align(
              alignment: Alignment.centerRight,
              child: TextButton.icon(
                onPressed: _showSyncLog,
                icon: const Icon(Icons.receipt_long, size: 16),
                label: const Text('查看同步紀錄', style: TextStyle(fontSize: 12)),
              ),
            ),
          ],
        ),
      ),
    );
  }

  /// Opens an in-app viewer for the persisted sync log, so a user (or tester)
  /// can see exactly why nutrition did or didn't upload — invaluable on a
  /// release build where `debugPrint` is invisible. From here the log can be
  /// refreshed, cleared, or opened in another app to share.
  Future<void> _showSyncLog() async {
    if (!mounted) return;
    await showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      showDragHandle: true,
      builder: (_) => const _SyncLogSheet(),
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
          const Text(
            '今日活動',
            style: TextStyle(
              color: Colors.white70,
              fontSize: 13,
              fontWeight: FontWeight.w600,
            ),
          ),
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
                    child: Text(
                      m == null ? '—' : _compact(m.value),
                      style: const TextStyle(
                        color: Colors.white,
                        fontSize: 14,
                        fontWeight: FontWeight.w900,
                      ),
                    ),
                  ),
                  Text(
                    m == null ? '未同步' : '${(pct * 100).round()}%',
                    style: const TextStyle(color: Colors.white54, fontSize: 9),
                  ),
                ],
              ),
            ),
          ),
        ),
        const SizedBox(height: 6),
        Text(
          label,
          style: const TextStyle(
            color: Colors.white70,
            fontSize: 11,
            fontWeight: FontWeight.w600,
          ),
        ),
        Text(
          '目標 ${_compact(target)}',
          style: const TextStyle(color: Colors.white38, fontSize: 9),
        ),
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
        .where(
          (m) => (showHistory ? _metric(m.type) : _todayMetric(m.type)) != null,
        )
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
              Text(
                group.title,
                style: const TextStyle(
                  fontSize: 15,
                  fontWeight: FontWeight.w900,
                ),
              ),
            ],
          ),
          if (chart != null) ...[const SizedBox(height: 12), chart],
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
                  _metricTile(group, m, showTime: showHistory),
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

  /// Opens the tap-to-drill-down history sheet for a metric. Tapping any sleep
  /// tile shows every stage together (stacked per night), mirroring the web.
  void _openHistory(_MetricGroup group, _MetricDef def) {
    final isSleep = group.id == 'sleep';
    final types = isSleep
        ? group.metrics.map((m) => m.type).toList()
        : [def.type];
    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      showDragHandle: true,
      builder: (_) => _HistorySheet(
        title: isSleep ? group.title : def.label,
        types: types,
        sleep: isSleep,
        metric: def,
        color: group.color,
      ),
    );
  }

  Widget _metricTile(
    _MetricGroup group,
    _MetricDef def, {
    bool showTime = false,
  }) {
    final color = group.color;
    final m = _metric(def.type);
    final status = m == null ? null : _metricStatus(def.type, m.value);
    final valueColor =
        status != null ? _statusColor(status) : context.palette.ink;
    final target = _metricTargets[def.type];
    final pct = (m != null && target != null)
        ? (m.value / target).clamp(0.0, 1.0)
        : null;
    return InkWell(
      borderRadius: BorderRadius.circular(14),
      onTap: () => _openHistory(group, def),
      child: Container(
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
            Text(
              _fmt(def),
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: TextStyle(
                fontWeight: FontWeight.w900,
                fontSize: 14,
                color: valueColor,
              ),
            ),
            Text(
              def.label,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: TextStyle(fontSize: 10, color: context.palette.inkSoft),
            ),
            if (showTime && m != null)
              Text(
                DateFormat('MM/dd HH:mm').format(m.measuredAt),
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: TextStyle(fontSize: 9, color: context.palette.inkFaint),
              ),
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
      ),
    );
  }

  /// Stacked composition bar for sleep stages (values in minutes).
  Widget? _sleepBar() {
    double v(String t) => _metric(t)?.value ?? 0;
    final segs = <(String, double, Color)>[
      ('深睡', v('SLEEP_DEEP'), AppColors.sleepDeep),
      ('淺睡', v('SLEEP_LIGHT'), AppColors.sleepLight),
      ('REM', v('SLEEP_REM'), AppColors.sleepRem),
      ('清醒', v('SLEEP_AWAKE'), AppColors.sleepAwake),
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
          decoration: BoxDecoration(color: color, shape: BoxShape.circle),
        ),
        const SizedBox(width: 4),
        Text(
          '$label $h:$mm',
          style: TextStyle(fontSize: 11, color: context.palette.inkSoft),
        ),
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
    'DEEP': AppColors.sleepDeep,
    'LIGHT': AppColors.sleepLight,
    'REM': AppColors.sleepRem,
    'AWAKE': AppColors.sleepAwake,
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
    final p = context.palette;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          '睡眠階段時間軸',
          style: TextStyle(fontSize: 12, color: p.inkSoft),
        ),
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
                        child: Text(
                          _labels[l]!,
                          style: TextStyle(
                            fontSize: 9,
                            color: p.inkFaint,
                          ),
                        ),
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
                  painter: _HypnoPainter(
                    segs,
                    start,
                    end.difference(start).inSeconds,
                    _colors,
                    p.overlay,
                  ),
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
              Text(
                fmt.format(start),
                style: TextStyle(fontSize: 9, color: p.inkFaint),
              ),
              Text(
                fmt.format(end),
                style: TextStyle(fontSize: 9, color: p.inkFaint),
              ),
            ],
          ),
        ),
      ],
    );
  }
}

class _HypnoPainter extends CustomPainter {
  _HypnoPainter(
      this.segs, this.start, this.spanSeconds, this.colors, this.trackColor);
  final List<SleepSegment> segs;
  final DateTime start;
  final int spanSeconds;
  final Map<String, Color> colors;
  final Color trackColor;

  static const _laneIndex = {'AWAKE': 0, 'REM': 1, 'LIGHT': 2, 'DEEP': 3};
  static const _laneHeight = 18.0;

  @override
  void paint(Canvas canvas, Size size) {
    if (spanSeconds <= 0) return;
    // Faint baseline per lane.
    final track = Paint()..color = trackColor;
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
      final rect = Rect.fromLTWH(
        x1,
        lane * _laneHeight + 3,
        w,
        _laneHeight - 6,
      );
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
      Rect.fromCircle(center: center, radius: radius),
      -pi / 2,
      sweep,
      false,
      arc,
    );
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
    final p = context.palette;
    final first = points.first;
    final last = points.last;
    final delta = last - first;
    final deltaColor = delta > 0
        ? AppColors.statusBad
        : delta < 0
        ? AppColors.statusGood
        : p.inkFaint;
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
            Text(
              '體重趨勢（近 14 筆）',
              style: TextStyle(fontSize: 12, color: p.inkSoft),
            ),
            Text(
              '$arrow ${delta.abs().toStringAsFixed(1)} kg',
              style: TextStyle(
                fontSize: 12,
                fontWeight: FontWeight.w700,
                color: deltaColor,
              ),
            ),
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
            Text(
              first.toStringAsFixed(1),
              style: TextStyle(fontSize: 11, color: p.inkFaint),
            ),
            Text(
              '最新 ${last.toStringAsFixed(1)} kg',
              style: TextStyle(fontSize: 11, color: p.inkFaint),
            ),
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
      final y =
          pad + (1 - (points[i] - minV) / range) * (size.height - 2 * pad);
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
        ..color = AppColors.sky,
    );
    canvas.drawCircle(
      at(points.length - 1),
      3,
      Paint()..color = AppColors.sky,
    );
  }

  @override
  bool shouldRepaint(_SparkPainter old) => old.points != points;
}

// ---- Tap-to-drill-down history ----

const _historyChartHeight = 140.0;

// Sleep stage label + colour, mirroring the web history view.
const _sleepStageMeta = <String, (String, Color)>{
  'SLEEP_DEEP': ('深睡', AppColors.sleepDeep),
  'SLEEP_LIGHT': ('淺睡', AppColors.sleepLight),
  'SLEEP_REM': ('REM', AppColors.sleepRem),
  'SLEEP_AWAKE': ('清醒', AppColors.sleepAwake),
};
// Stacking order top→bottom, so deep sleep sits at the base of each night's bar.
const _sleepStackOrder = [
  'SLEEP_AWAKE',
  'SLEEP_REM',
  'SLEEP_LIGHT',
  'SLEEP_DEEP',
];

String _histDayLabel(DateTime at) => DateFormat('M/d').format(at);

String _fmtSleepMins(double mins) {
  final t = mins.round();
  return '${t ~/ 60}:${(t % 60).toString().padLeft(2, '0')}';
}

/// Bottom sheet charting a metric's recent readings. A single metric shows a bar
/// chart + stats + reading list; the sleep tiles show every stage stacked per
/// night. Fetches /api/health/history on open (cookie session).
class _HistorySheet extends StatefulWidget {
  const _HistorySheet({
    required this.title,
    required this.types,
    required this.sleep,
    required this.metric,
    required this.color,
  });

  final String title;
  final List<String> types;
  final bool sleep;
  final _MetricDef metric;
  final Color color;

  @override
  State<_HistorySheet> createState() => _HistorySheetState();
}

class _HistorySheetState extends State<_HistorySheet> {
  List<HealthHistorySeries>? _series;
  bool _loading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final s = await HealthService.history(widget.types, limit: 30);
      if (mounted) setState(() => _series = s);
    } catch (e) {
      if (mounted) setState(() => _error = e.toString());
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  String _fmtVal(String unit, double v) => widget.metric.sleep
      ? _fmtSleepMins(v)
      : '${v.toStringAsFixed(widget.metric.digits)} $unit'.trim();

  @override
  Widget build(BuildContext context) {
    return DraggableScrollableSheet(
      expand: false,
      initialChildSize: 0.7,
      minChildSize: 0.4,
      maxChildSize: 0.95,
      builder: (ctx, controller) => ListView(
        controller: controller,
        padding: EdgeInsets.only(
          left: 16,
          right: 16,
          bottom: MediaQuery.of(context).viewInsets.bottom + 16,
        ),
        children: [
          Row(
            children: [
              Container(
                width: 10,
                height: 10,
                decoration: BoxDecoration(
                  color: widget.color,
                  shape: BoxShape.circle,
                ),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: Text(
                  '${widget.title}歷史數據',
                  style: const TextStyle(
                    fontSize: 18,
                    fontWeight: FontWeight.w900,
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 2),
          Text(
            '最近 30 筆紀錄',
            style: TextStyle(fontSize: 11, color: context.palette.inkFaint),
          ),
          const SizedBox(height: 16),
          if (_loading)
            const Padding(
              padding: EdgeInsets.symmetric(vertical: 48),
              child: Center(child: CircularProgressIndicator()),
            )
          else if (_error != null)
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 48),
              child: Center(
                child:
                    Text(_error!, style: TextStyle(color: context.palette.danger)),
              ),
            )
          else
            _content(),
        ],
      ),
    );
  }

  Widget _content() {
    final series = _series ?? const <HealthHistorySeries>[];
    final hasData = series.any((s) => s.points.isNotEmpty);
    if (!hasData) return _empty();
    return widget.sleep ? _sleepView(series) : _metricView(series.first);
  }

  Widget _empty() => Padding(
    padding: const EdgeInsets.symmetric(vertical: 48),
    child: Center(
      child: Text('尚無歷史數據',
          style: TextStyle(color: context.palette.inkFaint)),
    ),
  );

  // ---- single-metric view: bar chart + stats + reading list ----

  Widget _metricView(HealthHistorySeries s) {
    final pts = s.points;
    if (pts.isEmpty) return _empty();
    final vals = pts.map((p) => p.value).toList();
    var maxV = widget.metric.sleep ? 1.0 : 0.0;
    for (final v in vals) {
      maxV = max(maxV, v);
    }
    if (maxV <= 0) maxV = 1;
    final avg = vals.reduce((a, b) => a + b) / vals.length;
    final hi = vals.reduce(max);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        SizedBox(
          height: _historyChartHeight,
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              for (final p in pts)
                Expanded(
                  child: Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 1.5),
                    child: Container(
                      height: max(p.value / maxV * _historyChartHeight, 2),
                      decoration: BoxDecoration(
                        color: AppColors.sky.withValues(alpha: 0.8),
                        borderRadius: const BorderRadius.vertical(
                          top: Radius.circular(3),
                        ),
                      ),
                    ),
                  ),
                ),
            ],
          ),
        ),
        const SizedBox(height: 4),
        _axisLabels(pts.map((p) => p.at).toList()),
        const SizedBox(height: 14),
        Row(
          children: [
            _stat('平均', _fmtVal(s.unit, avg)),
            const SizedBox(width: 8),
            _stat('最高', _fmtVal(s.unit, hi)),
            const SizedBox(width: 8),
            _stat('最新', _fmtVal(s.unit, vals.last)),
          ],
        ),
        const SizedBox(height: 14),
        for (final p in pts.reversed)
          _readingRow(_histDayLabel(p.at), _fmtVal(s.unit, p.value)),
      ],
    );
  }

  // ---- sleep view: all stages stacked per night ----

  Widget _sleepView(List<HealthHistorySeries> series) {
    final dates = <DateTime>{};
    final sleepTotal = <DateTime, double>{};
    final stageByDate = <DateTime, Map<String, double>>{};
    for (final s in series) {
      for (final p in s.points) {
        final d = DateTime(p.at.year, p.at.month, p.at.day);
        dates.add(d);
        if (s.type == 'SLEEP') {
          sleepTotal[d] = p.value;
        } else if (_sleepStageMeta.containsKey(s.type)) {
          (stageByDate[d] ??= {})[s.type] = p.value;
        }
      }
    }
    if (dates.isEmpty) return _empty();
    final ordered = dates.toList()..sort();
    double total(DateTime d) =>
        sleepTotal[d] ??
        (stageByDate[d]?.values.fold<double>(0.0, (a, b) => a + b) ?? 0);
    final hasStages = stageByDate.isNotEmpty;
    var maxTotal = 1.0;
    for (final d in ordered) {
      maxTotal = max(maxTotal, total(d));
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        SizedBox(
          height: _historyChartHeight,
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              for (final d in ordered)
                Expanded(
                  child: Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 1.5),
                    child: _sleepColumn(
                      total(d),
                      stageByDate[d] ?? const {},
                      maxTotal,
                      hasStages,
                    ),
                  ),
                ),
            ],
          ),
        ),
        const SizedBox(height: 4),
        _axisLabels(ordered),
        if (hasStages) ...[
          const SizedBox(height: 12),
          Wrap(
            spacing: 12,
            runSpacing: 4,
            children: [
              for (final e in _sleepStageMeta.entries)
                _legendDot(e.value.$1, e.value.$2),
            ],
          ),
        ],
        const SizedBox(height: 14),
        for (final d in ordered.reversed)
          _readingRow(_histDayLabel(d), _fmtSleepMins(total(d))),
      ],
    );
  }

  Widget _sleepColumn(
    double total,
    Map<String, double> stages,
    double maxTotal,
    bool hasStages,
  ) {
    final h = max(total / maxTotal * _historyChartHeight, 2.0);
    final segs = hasStages && total > 0
        ? [
            for (final st in _sleepStackOrder)
              if ((stages[st] ?? 0) > 0) st,
          ]
        : const <String>[];
    return Align(
      alignment: Alignment.bottomCenter,
      child: ClipRRect(
        borderRadius: const BorderRadius.vertical(top: Radius.circular(3)),
        child: SizedBox(
          width: double.infinity,
          height: h,
          child: segs.isEmpty
              ? ColoredBox(color: AppColors.sleepLight.withValues(alpha: 0.8))
              : Column(
                  children: [
                    for (final st in segs)
                      Expanded(
                        flex: ((stages[st]! / total) * 1000).round().clamp(
                          1,
                          1000000,
                        ),
                        child: ColoredBox(color: _sleepStageMeta[st]!.$2),
                      ),
                  ],
                ),
        ),
      ),
    );
  }

  // ---- shared pieces ----

  Widget _axisLabels(List<DateTime> ats) {
    if (ats.isEmpty) return const SizedBox.shrink();
    final labels = <String>[_histDayLabel(ats.first)];
    if (ats.length > 2) labels.add(_histDayLabel(ats[ats.length ~/ 2]));
    labels.add(_histDayLabel(ats.last));
    return Row(
      mainAxisAlignment: MainAxisAlignment.spaceBetween,
      children: [
        for (final l in labels)
          Text(l,
              style: TextStyle(fontSize: 10, color: context.palette.inkFaint)),
      ],
    );
  }

  Widget _stat(String label, String value) => Expanded(
    child: Container(
      padding: const EdgeInsets.symmetric(vertical: 8),
      decoration: BoxDecoration(
        color: context.palette.overlay,
        borderRadius: BorderRadius.circular(12),
      ),
      child: Column(
        children: [
          Text(
            value,
            style: const TextStyle(fontWeight: FontWeight.w900, fontSize: 14),
          ),
          const SizedBox(height: 2),
          Text(
            label,
            style: TextStyle(fontSize: 10, color: context.palette.inkFaint),
          ),
        ],
      ),
    ),
  );

  Widget _readingRow(String label, String value) => Padding(
    padding: const EdgeInsets.symmetric(vertical: 5, horizontal: 4),
    child: Row(
      mainAxisAlignment: MainAxisAlignment.spaceBetween,
      children: [
        Text(
          label,
          style: TextStyle(fontSize: 13, color: context.palette.inkSoft),
        ),
        Text(
          value,
          style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w700),
        ),
      ],
    ),
  );

  Widget _legendDot(String label, Color color) => Row(
    mainAxisSize: MainAxisSize.min,
    children: [
      Container(
        width: 8,
        height: 8,
        decoration: BoxDecoration(color: color, shape: BoxShape.circle),
      ),
      const SizedBox(width: 4),
      Text(label,
          style: TextStyle(fontSize: 11, color: context.palette.inkSoft)),
    ],
  );
}

/// Bottom sheet showing the persisted health-sync log. Refresh re-reads the
/// file, 清除 empties it, and 開啟 hands the file to another app (file manager /
/// text viewer) so it can be shared off-device for debugging.
class _SyncLogSheet extends StatefulWidget {
  const _SyncLogSheet();

  @override
  State<_SyncLogSheet> createState() => _SyncLogSheetState();
}

class _SyncLogSheetState extends State<_SyncLogSheet> {
  String _log = '';
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _reload();
  }

  Future<void> _reload() async {
    setState(() => _loading = true);
    final text = await AppLogger.readAll();
    if (!mounted) return;
    setState(() {
      _log = text;
      _loading = false;
    });
  }

  Future<void> _clear() async {
    await AppLogger.clear();
    await _reload();
  }

  /// Copies the whole sync log to the clipboard — handy for pasting into a chat
  /// or bug report without juggling an external file viewer.
  Future<void> _copy() async {
    await Clipboard.setData(ClipboardData(text: _log));
    if (!mounted) return;
    ScaffoldMessenger.of(
      context,
    ).showSnackBar(const SnackBar(content: Text('已複製同步紀錄')));
  }

  Future<void> _openExternally() async {
    final path = await AppLogger.path();
    final result = await OpenFilex.open(path);
    if (result.type != ResultType.done && mounted) {
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(SnackBar(content: Text('無法開啟檔案：${result.message}')));
    }
  }

  @override
  Widget build(BuildContext context) {
    return DraggableScrollableSheet(
      expand: false,
      initialChildSize: 0.8,
      minChildSize: 0.4,
      maxChildSize: 0.95,
      builder: (ctx, controller) => Column(
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 4, 8, 4),
            child: Row(
              children: [
                const Expanded(
                  child: Text(
                    '健康同步紀錄',
                    style: TextStyle(fontSize: 18, fontWeight: FontWeight.w900),
                  ),
                ),
                IconButton(
                  tooltip: '重新整理',
                  icon: const Icon(Icons.refresh),
                  onPressed: _loading ? null : _reload,
                ),
                IconButton(
                  tooltip: '複製紀錄',
                  icon: const Icon(Icons.copy_all),
                  onPressed: (_loading || _log.trim().isEmpty) ? null : _copy,
                ),
                IconButton(
                  tooltip: '用其他 App 開啟／分享',
                  icon: const Icon(Icons.open_in_new),
                  onPressed: _loading ? null : _openExternally,
                ),
                IconButton(
                  tooltip: '清除紀錄',
                  icon: const Icon(Icons.delete_outline),
                  onPressed: _loading ? null : _clear,
                ),
              ],
            ),
          ),
          const Divider(height: 1),
          Expanded(
            child: _loading
                ? const Center(child: CircularProgressIndicator())
                : (_log.trim().isEmpty
                      ? Center(
                          child: Text(
                            '尚無紀錄，請先執行一次同步。',
                            style: TextStyle(color: ctx.palette.inkFaint),
                          ),
                        )
                      : ListView(
                          controller: controller,
                          padding: const EdgeInsets.all(16),
                          children: [
                            SelectableText(
                              _log,
                              style: const TextStyle(
                                fontSize: 11,
                                height: 1.5,
                                fontFamily: 'monospace',
                              ),
                            ),
                          ],
                        )),
          ),
        ],
      ),
    );
  }
}
