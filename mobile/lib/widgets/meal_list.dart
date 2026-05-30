import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import '../models/models.dart';
import '../services/api_client.dart';
import '../services/meal_service.dart';
import 'meal_capture_form.dart';

class MealList extends StatelessWidget {
  const MealList({super.key, required this.meals, required this.onChanged});

  final List<Meal> meals;
  final Future<void> Function() onChanged;

  @override
  Widget build(BuildContext context) {
    if (meals.isEmpty) {
      return const Padding(
        padding: EdgeInsets.symmetric(vertical: 24),
        child: Center(
          child: Text('尚無餐點紀錄', style: TextStyle(color: Colors.black45)),
        ),
      );
    }
    return Column(
      children: meals.map((m) => _MealCard(meal: m, onChanged: onChanged)).toList(),
    );
  }
}

class _MealCard extends StatelessWidget {
  const _MealCard({required this.meal, required this.onChanged});

  final Meal meal;
  final Future<void> Function() onChanged;

  Future<void> _delete(BuildContext context) async {
    final confirm = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('刪除餐點'),
        content: const Text('確定要刪除這筆餐點紀錄嗎？'),
        actions: [
          TextButton(
              onPressed: () => Navigator.pop(ctx, false),
              child: const Text('取消')),
          FilledButton(
              onPressed: () => Navigator.pop(ctx, true),
              child: const Text('刪除')),
        ],
      ),
    );
    if (confirm != true) return;
    await MealService.deleteMeal(meal.id);
    await onChanged();
  }

  Future<void> _edit(BuildContext context) async {
    final saved = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      showDragHandle: true,
      builder: (ctx) => _EditMealSheet(meal: meal),
    );
    if (saved == true) await onChanged();
  }

  @override
  Widget build(BuildContext context) {
    final headers = ApiClient.instance.sessionCookie != null
        ? {'Cookie': ApiClient.instance.sessionCookie!}
        : <String, String>{};
    return Card(
      margin: const EdgeInsets.only(bottom: 10),
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Container(
                  padding:
                      const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                  decoration: BoxDecoration(
                    color: const Color(0xFFFFFBEB),
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: Text(mealTypes[meal.mealType] ?? meal.mealType,
                      style: const TextStyle(
                          fontSize: 12,
                          fontWeight: FontWeight.bold,
                          color: Color(0xFF92400E))),
                ),
                const SizedBox(width: 8),
                Text(DateFormat('HH:mm').format(meal.eatenAt),
                    style: const TextStyle(color: Colors.black45, fontSize: 12)),
                const Spacer(),
                Text('${meal.totalCalories} kcal',
                    style: const TextStyle(fontWeight: FontWeight.w900)),
              ],
            ),
            if (meal.hasImage) ...[
              const SizedBox(height: 8),
              ClipRRect(
                borderRadius: BorderRadius.circular(12),
                child: Image.network(
                  MealService.imageUrl(meal.imageStorageKey!),
                  headers: headers,
                  height: 160,
                  width: double.infinity,
                  fit: BoxFit.cover,
                  errorBuilder: (_, __, ___) => const SizedBox.shrink(),
                ),
              ),
            ],
            const SizedBox(height: 8),
            ...meal.items.map((it) => Padding(
                  padding: const EdgeInsets.symmetric(vertical: 2),
                  child: Row(
                    children: [
                      Expanded(
                          child: Text('${_ratingIcon(it.aiRating)} ${it.name}'
                              '${it.estimatedAmount.isNotEmpty ? ' · ${it.estimatedAmount}' : ''}')),
                      Text('${it.calories} kcal',
                          style: const TextStyle(color: Colors.black54)),
                    ],
                  ),
                )),
            const SizedBox(height: 4),
            Text(
                'P ${meal.totalProtein.toStringAsFixed(1)}g · '
                'F ${meal.totalFat.toStringAsFixed(1)}g · '
                'C ${meal.totalCarbs.toStringAsFixed(1)}g',
                style: const TextStyle(fontSize: 12, color: Colors.black54)),
            Row(
              mainAxisAlignment: MainAxisAlignment.end,
              children: [
                TextButton.icon(
                    onPressed: () => _edit(context),
                    icon: const Icon(Icons.edit, size: 16),
                    label: const Text('編輯')),
                TextButton.icon(
                    onPressed: () => _delete(context),
                    icon: const Icon(Icons.delete, size: 16, color: Colors.red),
                    label: const Text('刪除',
                        style: TextStyle(color: Colors.red))),
              ],
            ),
          ],
        ),
      ),
    );
  }

  String _ratingIcon(String rating) => switch (rating) {
        'GOOD' => '✅',
        'OK' => '⚠️',
        'LIMIT' => '❌',
        _ => '✎',
      };
}

class _EditMealSheet extends StatefulWidget {
  const _EditMealSheet({required this.meal});
  final Meal meal;

  @override
  State<_EditMealSheet> createState() => _EditMealSheetState();
}

class _EditMealSheetState extends State<_EditMealSheet> {
  late String _mealType = widget.meal.mealType;
  late final List<EditableItem> _items = widget.meal.items
      .map((it) => EditableItem(
            name: it.name,
            estimatedAmount: it.estimatedAmount,
            calories: it.calories.toString(),
            protein: it.protein.toString(),
            fat: it.fat.toString(),
            carbs: it.carbs.toString(),
            aiRating: it.aiRating,
          ))
      .toList();
  bool _saving = false;
  String? _error;

  Future<void> _save() async {
    final valid = _items.where((e) => e.hasName).toList();
    if (valid.isEmpty) {
      setState(() => _error = '至少需要保留一項食物。');
      return;
    }
    setState(() {
      _saving = true;
      _error = null;
    });
    try {
      await MealService.updateMeal(
          widget.meal.id, _mealType, valid.map((e) => e.toMealItem()).toList());
      if (mounted) Navigator.pop(context, true);
    } catch (e) {
      setState(() => _error = e.toString());
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return DraggableScrollableSheet(
      expand: false,
      initialChildSize: 0.85,
      maxChildSize: 0.95,
      builder: (ctx, controller) => Padding(
        padding: EdgeInsets.only(
            left: 16,
            right: 16,
            bottom: MediaQuery.of(context).viewInsets.bottom + 16),
        child: ListView(
          controller: controller,
          children: [
            const Text('編輯餐點',
                style: TextStyle(fontSize: 20, fontWeight: FontWeight.w900)),
            const SizedBox(height: 12),
            DropdownButtonFormField<String>(
              initialValue: _mealType,
              decoration: const InputDecoration(
                  labelText: '餐別', border: OutlineInputBorder()),
              items: mealTypes.entries
                  .map((e) =>
                      DropdownMenuItem(value: e.key, child: Text(e.value)))
                  .toList(),
              onChanged: (v) => setState(() => _mealType = v ?? 'LUNCH'),
            ),
            const SizedBox(height: 12),
            ..._items.asMap().entries.map((entry) => Padding(
                  padding: const EdgeInsets.only(bottom: 10),
                  child: ItemEditor(
                    item: entry.value,
                    index: entry.key,
                    onChanged: () => setState(() {}),
                    trailing: _items.length == 1
                        ? null
                        : TextButton(
                            onPressed: () =>
                                setState(() => _items.removeAt(entry.key)),
                            child: const Text('刪除',
                                style: TextStyle(color: Colors.red)),
                          ),
                  ),
                )),
            OutlinedButton.icon(
              onPressed: () => setState(() => _items.add(EditableItem())),
              icon: const Icon(Icons.add),
              label: const Text('新增食物品項'),
            ),
            if (_error != null) ...[
              const SizedBox(height: 10),
              Text(_error!, style: const TextStyle(color: Colors.red)),
            ],
            const SizedBox(height: 12),
            FilledButton(
              onPressed: _saving ? null : _save,
              style: FilledButton.styleFrom(
                  padding: const EdgeInsets.symmetric(vertical: 14)),
              child: _saving
                  ? const SizedBox(
                      height: 20,
                      width: 20,
                      child: CircularProgressIndicator(
                          strokeWidth: 2, color: Colors.white))
                  : const Text('儲存修改'),
            ),
            const SizedBox(height: 8),
          ],
        ),
      ),
    );
  }
}
