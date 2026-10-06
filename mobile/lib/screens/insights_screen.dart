import 'dart:async';
import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../models/insights.dart';
import '../services/insights_service.dart';
import '../theme/app_theme.dart';
import '../utils/insights_dates.dart';
import '../utils/metabolism.dart';

class InsightsScreen extends StatefulWidget {
  const InsightsScreen({super.key});

  @override
  State<InsightsScreen> createState() => _InsightsScreenState();
}

class _InsightsScreenState extends State<InsightsScreen> {
  String _period = 'week';
  DateTime _selectedDate = startOfLocalDay(DateTime.now());
  InsightsSnapshot? _snapshot;
  String? _error;
  bool _loading = true;
  int _loadGeneration = 0;

  @override
  void initState() {
    super.initState();
    unawaited(_load(_period, _selectedDate));
  }

  Future<void> _load(String period, DateTime date) async {
    final generation = ++_loadGeneration;
    if (mounted) {
      setState(() {
        _loading = true;
        _error = null;
      });
    }
    try {
      final result = await InsightsService.fetch(period: period, date: date);
      if (!mounted || generation != _loadGeneration) return;
      setState(() => _snapshot = result);
    } catch (error) {
      if (!mounted || generation != _loadGeneration) return;
      setState(() => _error = error.toString());
    } finally {
      if (mounted && generation == _loadGeneration) {
        setState(() => _loading = false);
      }
    }
  }

  void _setPeriod(String value) {
    if (value == _period) return;
    setState(() => _period = value);
    unawaited(_load(value, _selectedDate));
  }

  void _movePeriod(int amount) {
    final next = shiftInsightsDate(
      _selectedDate,
      monthly: _period == 'month',
      amount: amount,
    );
    setState(() => _selectedDate = next);
    unawaited(_load(_period, next));
  }

  String _rangeLabel(InsightsSnapshot snapshot) {
    if (_period == 'month') {
      return snapshot.startDate.substring(0, 7);
    }
    final end = DateTime.tryParse(snapshot.endDateExclusive);
    final lastDay = end == null ? '' : isoDate(end.subtract(const Duration(days: 1)));
    return '${snapshot.startDate} — $lastDay';
  }

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    final snapshot = _snapshot;
    final days = snapshot?.days ?? const <InsightDay>[];
    final loggedDays = days.where((day) => day.mealCount > 0).toList();
    final averageCalories = days.isEmpty
        ? 0.0
        : days.fold<double>(0, (sum, day) => sum + day.calories) / days.length;
    final withinGoal = loggedDays
        .where((day) => day.calories <= (snapshot?.targetCalories ?? 0))
        .length;

    return RefreshIndicator(
      onRefresh: () => _load(_period, _selectedDate),
      child: ListView(
        padding: const EdgeInsets.fromLTRB(16, 8, 16, 28),
        children: [
          Row(
            children: [
              ChoiceChip(
                label: const Text('週'),
                selected: _period == 'week',
                onSelected: (_) => _setPeriod('week'),
              ),
              const SizedBox(width: 8),
              ChoiceChip(
                label: const Text('月'),
                selected: _period == 'month',
                onSelected: (_) => _setPeriod('month'),
              ),
              const Spacer(),
              IconButton(
                tooltip: '上一個區間',
                onPressed: () => _movePeriod(-1),
                icon: const Icon(Icons.chevron_left),
              ),
              Flexible(
                child: Text(
                  snapshot == null ? '載入中' : _rangeLabel(snapshot),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(
                    color: palette.inkSoft,
                    fontSize: 12,
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ),
              IconButton(
                tooltip: '下一個區間',
                onPressed: () => _movePeriod(1),
                icon: const Icon(Icons.chevron_right),
              ),
            ],
          ),
          if (_error != null) ...[
            _MessageCard(
              icon: Icons.cloud_off_outlined,
              text: _error!,
              action: TextButton(
                onPressed: () => unawaited(_load(_period, _selectedDate)),
                child: const Text('重試'),
              ),
            ),
            const SizedBox(height: 12),
          ],
          if (_loading && snapshot == null)
            const Padding(
              padding: EdgeInsets.symmetric(vertical: 48),
              child: Center(child: CircularProgressIndicator()),
            ),
          if (snapshot != null) ...[
            _SummaryGrid(
              averageCalories: averageCalories,
              targetCalories: snapshot.targetCalories,
              withinGoal: withinGoal,
              loggedDays: loggedDays.length,
              daysCount: days.length,
            ),
            const SizedBox(height: 12),
            if (loggedDays.isEmpty) ...[
              _MessageCard(
                icon: Icons.restaurant_outlined,
                text: '這段期間尚無飲食紀錄。記錄餐點後，熱量與營養素趨勢會顯示在這裡。',
              ),
              const SizedBox(height: 12),
            ],
            _TrendCard(
              title: '熱量目標達成',
              averageLabel: '${averageCalories.round()} kcal / 日',
              days: days,
              value: (day) => day.calories,
              target: snapshot.targetCalories.toDouble(),
              color: AppColors.amber,
              unit: 'kcal',
            ),
            const SizedBox(height: 12),
            _TrendCard(
              title: '蛋白質',
              averageLabel: '${_average(days, (day) => day.protein).toStringAsFixed(1)} g / 日',
              days: days,
              value: (day) => day.protein,
              color: AppColors.protein,
              unit: 'g',
            ),
            const SizedBox(height: 12),
            _TrendCard(
              title: '脂肪',
              averageLabel: '${_average(days, (day) => day.fat).toStringAsFixed(1)} g / 日',
              days: days,
              value: (day) => day.fat,
              color: AppColors.fat,
              unit: 'g',
            ),
            const SizedBox(height: 12),
            _TrendCard(
              title: '碳水',
              averageLabel: '${_average(days, (day) => day.carbs).toStringAsFixed(1)} g / 日',
              days: days,
              value: (day) => day.carbs,
              color: AppColors.carbs,
              unit: 'g',
            ),
            const SizedBox(height: 12),
            _WeightCard(points: snapshot.weightPoints),
          ],
        ],
      ),
    );
  }
}

class _SummaryGrid extends StatelessWidget {
  const _SummaryGrid({
    required this.averageCalories,
    required this.targetCalories,
    required this.withinGoal,
    required this.loggedDays,
    required this.daysCount,
  });

  final double averageCalories;
  final int targetCalories;
  final int withinGoal;
  final int loggedDays;
  final int daysCount;

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    final percent = targetCalories > 0
        ? (averageCalories / targetCalories * 100).round()
        : 0;
    return GridView.count(
      crossAxisCount: 2,
      shrinkWrap: true,
      physics: const NeverScrollableScrollPhysics(),
      crossAxisSpacing: 10,
      mainAxisSpacing: 10,
      childAspectRatio: 1.55,
      children: [
        _SummaryTile(
          label: '每日平均熱量',
          value: loggedDays == 0 ? '—' : '${averageCalories.round()} kcal',
          note: '目標 $targetCalories kcal',
          palette: palette,
        ),
        _SummaryTile(
          label: '平均目標進度',
          value: loggedDays == 0 ? '—' : '$percent%',
          note: '以整段期間日平均計算',
          palette: palette,
        ),
        _SummaryTile(
          label: '目標內天數',
          value: loggedDays == 0 ? '—' : '$withinGoal / $loggedDays',
          note: '僅計算有紀錄日',
          palette: palette,
        ),
        _SummaryTile(
          label: '區間天數',
          value: '$daysCount 天',
          note: '週／月日平均的計算範圍',
          palette: palette,
        ),
      ],
    );
  }
}

class _SummaryTile extends StatelessWidget {
  const _SummaryTile({
    required this.label,
    required this.value,
    required this.note,
    required this.palette,
  });

  final String label;
  final String value;
  final String note;
  final AppPalette palette;

  @override
  Widget build(BuildContext context) => Container(
        padding: const EdgeInsets.all(13),
        decoration: BoxDecoration(
          color: palette.surface,
          borderRadius: BorderRadius.circular(AppRadius.field),
          border: Border.all(color: palette.hairline),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Text(label, style: TextStyle(color: palette.inkSoft, fontSize: 11)),
            const SizedBox(height: 5),
            Text(
              value,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: TextStyle(
                color: palette.ink,
                fontSize: 19,
                fontWeight: FontWeight.w800,
              ),
            ),
            Text(
              note,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: TextStyle(color: palette.inkFaint, fontSize: 9),
            ),
          ],
        ),
      );
}

class _TrendCard extends StatelessWidget {
  const _TrendCard({
    required this.title,
    required this.averageLabel,
    required this.days,
    required this.value,
    required this.color,
    required this.unit,
    this.target,
  });

  final String title;
  final String averageLabel;
  final List<InsightDay> days;
  final double Function(InsightDay) value;
  final Color color;
  final String unit;
  final double? target;

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    final maxValue = math.max(
      1.0,
      math.max(target ?? 0, days.fold<double>(0, (max, day) => math.max(max, value(day)).toDouble())),
    ).toDouble();
    final width = math.max(280.0, days.length * (days.length > 14 ? 23.0 : 40.0)).toDouble();
    final targetFraction = target == null
        ? null
        : (target! / maxValue).clamp(0.0, 1.0).toDouble();

    return Container(
      padding: const EdgeInsets.fromLTRB(16, 15, 16, 12),
      decoration: BoxDecoration(
        color: palette.surface,
        borderRadius: BorderRadius.circular(AppRadius.card),
        border: Border.all(color: palette.hairline),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(title,
                    style: TextStyle(
                        color: palette.ink,
                        fontSize: 16,
                        fontWeight: FontWeight.w800)),
              ),
              Text(averageLabel,
                  style: TextStyle(
                      color: palette.inkSoft,
                      fontSize: 11,
                      fontWeight: FontWeight.w700)),
            ],
          ),
          if (target != null) ...[
            const SizedBox(height: 4),
            Text('每日目標 ${target!.round()} $unit · 超標與目標內分色',
                style: TextStyle(color: palette.inkFaint, fontSize: 10)),
          ],
          const SizedBox(height: 14),
          SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            child: SizedBox(
              width: width,
              child: Column(
                children: [
                  SizedBox(
                    height: 132,
                    child: Stack(
                      children: [
                        if (targetFraction != null)
                          Positioned.fill(
                            child: CustomPaint(
                              painter: _TargetLinePainter(
                                fraction: targetFraction,
                                color: palette.inkFaint.withValues(alpha: 0.55),
                              ),
                            ),
                          ),
                        Row(
                          crossAxisAlignment: CrossAxisAlignment.end,
                          children: [
                            for (final day in days)
                              Expanded(
                                child: Padding(
                                  padding: const EdgeInsets.symmetric(horizontal: 3),
                                  child: Semantics(
                                    label: '${day.date} ${value(day).round()} $unit${day.mealCount == 0 ? '，無紀錄' : ''}',
                                    child: Tooltip(
                                      message: '${day.date} · ${value(day).toStringAsFixed(1)} $unit',
                                      child: Align(
                                        alignment: Alignment.bottomCenter,
                                        child: Container(
                                          height: day.mealCount == 0
                                              ? 2
                                              : math.max(3.0, 122 * value(day) / maxValue).toDouble(),
                                          decoration: BoxDecoration(
                                            color: day.mealCount == 0
                                                ? palette.surfaceAlt
                                                : target != null && value(day) > target!
                                                    ? AppColors.statusBad
                                                    : color,
                                            borderRadius: const BorderRadius.vertical(
                                                top: Radius.circular(5)),
                                          ),
                                        ),
                                      ),
                                    ),
                                  ),
                                ),
                              ),
                          ],
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 5),
                  Row(
                    children: [
                      for (var i = 0; i < days.length; i++)
                        Expanded(
                          child: Text(
                            _dayNumber(days[i].date, i, days.length),
                            textAlign: TextAlign.center,
                            style: TextStyle(color: palette.inkFaint, fontSize: 9),
                          ),
                        ),
                    ],
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}

String _dayNumber(String date, int index, int count) {
  if (count <= 14 || index == 0 || index == count - 1 || index % 7 == 0) {
    return int.tryParse(date.substring(8))?.toString() ?? '';
  }
  return '';
}

class _TargetLinePainter extends CustomPainter {
  const _TargetLinePainter({required this.fraction, required this.color});

  final double fraction;
  final Color color;

  @override
  void paint(Canvas canvas, Size size) {
    final y = size.height * (1 - fraction);
    final paint = Paint()
      ..color = color
      ..strokeWidth = 1
      ..style = PaintingStyle.stroke;
    const dash = 5.0;
    const gap = 4.0;
    for (var x = 0.0; x < size.width; x += dash + gap) {
      canvas.drawLine(Offset(x, y), Offset(math.min(x + dash, size.width).toDouble(), y), paint);
    }
  }

  @override
  bool shouldRepaint(covariant _TargetLinePainter oldDelegate) =>
      oldDelegate.fraction != fraction || oldDelegate.color != color;
}

class _WeightCard extends StatelessWidget {
  const _WeightCard({required this.points});
  final List<InsightWeightPoint> points;

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: palette.surface,
        borderRadius: BorderRadius.circular(AppRadius.card),
        border: Border.all(color: palette.hairline),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Text('體重變化',
                    style: TextStyle(
                        color: palette.ink,
                        fontSize: 16,
                        fontWeight: FontWeight.w800)),
              ),
              if (points.isNotEmpty)
                Text('最新 ${points.last.value.toStringAsFixed(1)} kg',
                    style: TextStyle(
                        color: palette.inkSoft,
                        fontSize: 11,
                        fontWeight: FontWeight.w700)),
            ],
          ),
          const SizedBox(height: 14),
          if (points.isEmpty)
            Text(
              '這段期間沒有體重紀錄。連結健康資料或新增體重紀錄後，趨勢會顯示在這裡。',
              style: TextStyle(color: palette.inkSoft, fontSize: 12),
            )
          else ...[
            Semantics(
              label: '體重趨勢，從 ${points.first.value.toStringAsFixed(1)} 公斤至 ${points.last.value.toStringAsFixed(1)} 公斤',
              child: SizedBox(
                height: 150,
                width: double.infinity,
                child: CustomPaint(
                  painter: _WeightLinePainter(
                    points: points,
                    color: AppColors.sky,
                    gridColor: palette.hairline,
                  ),
                ),
              ),
            ),
            const SizedBox(height: 5),
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text(_shortDate(points.first.at),
                    style: TextStyle(color: palette.inkFaint, fontSize: 10)),
                Text(_shortDate(points.last.at),
                    style: TextStyle(color: palette.inkFaint, fontSize: 10)),
              ],
            ),
          ],
        ],
      ),
    );
  }
}

class _WeightLinePainter extends CustomPainter {
  const _WeightLinePainter({
    required this.points,
    required this.color,
    required this.gridColor,
  });

  final List<InsightWeightPoint> points;
  final Color color;
  final Color gridColor;

  @override
  void paint(Canvas canvas, Size size) {
    final gridPaint = Paint()
      ..color = gridColor
      ..strokeWidth = 1;
    for (var i = 0; i < 3; i++) {
      final y = 18 + i * (size.height - 36) / 2;
      canvas.drawLine(Offset(0, y), Offset(size.width, y), gridPaint);
    }

    final values = points.map((point) => point.value).toList();
    final minValue = values.reduce((a, b) => a < b ? a : b);
    final maxValue = values.reduce((a, b) => a > b ? a : b);
    final spread = maxValue - minValue;
    final chartHeight = size.height - 36;
    final path = Path();
    final positions = <Offset>[];
    for (var i = 0; i < points.length; i++) {
      final x = points.length == 1 ? size.width / 2 : i * size.width / (points.length - 1);
      final y = 18 + chartHeight * (spread == 0 ? 0.5 : 1 - (values[i] - minValue) / spread);
      final position = Offset(x, y);
      positions.add(position);
      if (i == 0) {
        path.moveTo(x, y);
      } else {
        path.lineTo(x, y);
      }
    }
    final linePaint = Paint()
      ..color = color
      ..strokeWidth = 2.5
      ..strokeCap = StrokeCap.round
      ..strokeJoin = StrokeJoin.round
      ..style = PaintingStyle.stroke;
    if (positions.length > 1) canvas.drawPath(path, linePaint);
    final dotPaint = Paint()..color = color;
    for (final point in positions) {
      canvas.drawCircle(point, 4, dotPaint);
    }
  }

  @override
  bool shouldRepaint(covariant _WeightLinePainter oldDelegate) =>
      oldDelegate.points != points ||
      oldDelegate.color != color ||
      oldDelegate.gridColor != gridColor;
}

class _MessageCard extends StatelessWidget {
  const _MessageCard({required this.icon, required this.text, this.action});

  final IconData icon;
  final String text;
  final Widget? action;

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: palette.surfaceAlt,
        borderRadius: BorderRadius.circular(AppRadius.field),
      ),
      child: Row(
        children: [
          Icon(icon, color: palette.inkSoft, size: 20),
          const SizedBox(width: 10),
          Expanded(
            child: Text(text,
                style: TextStyle(color: palette.inkSoft, fontSize: 12)),
          ),
          if (action != null) action!,
        ],
      ),
    );
  }
}

double _average(List<InsightDay> days, double Function(InsightDay) value) =>
    days.isEmpty
        ? 0
        : days.fold<double>(0, (sum, day) => sum + value(day)) / days.length;

String _shortDate(DateTime value) => '${value.month}/${value.day}';
