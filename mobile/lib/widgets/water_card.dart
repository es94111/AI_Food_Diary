import 'package:flutter/material.dart';

import '../models/models.dart';
import '../services/auth_service.dart';
import '../services/water_service.dart';

/// Daily water-intake card: shows today's total vs goal with a progress bar,
/// quick-add presets (100/500/800 ml) plus a free custom amount, and the day's
/// entries with delete. Goal is stored on the user profile and editable inline.
class WaterCard extends StatefulWidget {
  const WaterCard({
    super.key,
    required this.date,
    required this.goalMl,
    required this.isToday,
    this.onGoalChanged,
  });

  final DateTime date;
  final int goalMl;
  final bool isToday;
  final Future<void> Function()? onGoalChanged;

  @override
  State<WaterCard> createState() => _WaterCardState();
}

class _WaterCardState extends State<WaterCard> {
  static const _presets = [100, 500, 800];
  static const _accent = Color(0xFF0284C7);

  List<WaterLog> _logs = [];
  int _totalMl = 0;
  bool _busy = false;
  late int _goalMl = widget.goalMl;

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void didUpdateWidget(WaterCard oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.goalMl != widget.goalMl) _goalMl = widget.goalMl;
    if (oldWidget.date != widget.date) _load();
  }

  Future<void> _load() async {
    try {
      final result = await WaterService.forDay(widget.date);
      if (!mounted) return;
      setState(() {
        _logs = result.logs;
        _totalMl = result.totalMl;
      });
    } catch (_) {}
  }

  Future<void> _add(int amountMl) async {
    if (_busy) return;
    setState(() => _busy = true);
    try {
      await WaterService.add(amountMl);
      await _load();
    } catch (e) {
      _toast('$e');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _delete(String id) async {
    if (_busy) return;
    setState(() => _busy = true);
    try {
      await WaterService.delete(id);
      await _load();
    } catch (e) {
      _toast('$e');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  void _toast(String msg) {
    if (mounted) {
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(msg)));
    }
  }

  Future<void> _addCustom() async {
    final controller = TextEditingController();
    final amount = await showDialog<int>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('自訂喝水量'),
        content: TextField(
          controller: controller,
          autofocus: true,
          keyboardType: TextInputType.number,
          decoration: const InputDecoration(suffixText: 'ml', hintText: '例如 350'),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('取消')),
          FilledButton(
            onPressed: () => Navigator.pop(ctx, int.tryParse(controller.text.trim())),
            child: const Text('新增'),
          ),
        ],
      ),
    );
    if (amount != null && amount > 0) await _add(amount);
  }

  Future<void> _editGoal() async {
    final controller = TextEditingController(text: '$_goalMl');
    final goal = await showDialog<int>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('每日喝水目標'),
        content: TextField(
          controller: controller,
          autofocus: true,
          keyboardType: TextInputType.number,
          decoration: const InputDecoration(suffixText: 'ml'),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('取消')),
          FilledButton(
            onPressed: () => Navigator.pop(ctx, int.tryParse(controller.text.trim())),
            child: const Text('儲存'),
          ),
        ],
      ),
    );
    if (goal == null || goal < 100 || goal > 10000) return;
    setState(() => _busy = true);
    try {
      await AuthService.updateProfile(waterGoalMl: goal);
      if (mounted) setState(() => _goalMl = goal);
      await widget.onGoalChanged?.call();
    } catch (e) {
      _toast('$e');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final percent =
        _goalMl > 0 ? (_totalMl / _goalMl).clamp(0.0, 1.0).toDouble() : 0.0;

    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text('喝水',
                        style:
                            TextStyle(fontSize: 18, fontWeight: FontWeight.w900)),
                    const SizedBox(height: 2),
                    Row(
                      crossAxisAlignment: CrossAxisAlignment.end,
                      children: [
                        Text('$_totalMl',
                            style: const TextStyle(
                                fontSize: 32,
                                fontWeight: FontWeight.w900,
                                color: _accent)),
                        Padding(
                          padding: const EdgeInsets.only(bottom: 4, left: 4),
                          child: Text('/ $_goalMl ml',
                              style: const TextStyle(
                                  color: Colors.black45,
                                  fontWeight: FontWeight.w600)),
                        ),
                      ],
                    ),
                  ],
                ),
                const Spacer(),
                TextButton.icon(
                  onPressed: _busy ? null : _editGoal,
                  icon: const Icon(Icons.flag_outlined, size: 16),
                  label: Text('目標 · ${(percent * 100).round()}%'),
                ),
              ],
            ),
            const SizedBox(height: 8),
            ClipRRect(
              borderRadius: BorderRadius.circular(8),
              child: LinearProgressIndicator(
                value: percent,
                minHeight: 8,
                backgroundColor: const Color(0xFFE0F2FE),
                valueColor: const AlwaysStoppedAnimation(_accent),
              ),
            ),
            const SizedBox(height: 14),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: [
                for (final amount in _presets)
                  ActionChip(
                    label: Text('+$amount ml',
                        style: const TextStyle(
                            fontWeight: FontWeight.w700, color: _accent)),
                    backgroundColor: const Color(0xFFEFF8FE),
                    side: BorderSide.none,
                    onPressed: _busy ? null : () => _add(amount),
                  ),
                ActionChip(
                  avatar: const Icon(Icons.add, size: 18, color: Colors.black54),
                  label: const Text('自訂'),
                  onPressed: _busy ? null : _addCustom,
                ),
              ],
            ),
            const SizedBox(height: 8),
            if (_logs.isEmpty)
              Padding(
                padding: const EdgeInsets.only(top: 6),
                child: Text(
                  widget.isToday ? '今天還沒記錄喝水。' : '這天沒有喝水紀錄。',
                  style: const TextStyle(color: Colors.black45, fontSize: 13),
                ),
              )
            else
              ..._logs.map((log) => ListTile(
                    contentPadding: EdgeInsets.zero,
                    dense: true,
                    leading: const Icon(Icons.water_drop_outlined,
                        color: _accent, size: 20),
                    title: Text('${log.amountMl} ml',
                        style: const TextStyle(fontWeight: FontWeight.w600)),
                    trailing: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Text(_time(log.drankAt),
                            style: const TextStyle(
                                color: Colors.black38, fontSize: 12)),
                        IconButton(
                          icon: const Icon(Icons.close, size: 18),
                          color: Colors.black26,
                          onPressed: _busy ? null : () => _delete(log.id),
                        ),
                      ],
                    ),
                  )),
          ],
        ),
      ),
    );
  }

  String _time(DateTime t) =>
      '${t.hour.toString().padLeft(2, '0')}:${t.minute.toString().padLeft(2, '0')}';
}
