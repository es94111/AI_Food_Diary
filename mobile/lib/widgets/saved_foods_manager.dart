import 'package:flutter/material.dart';

import '../models/models.dart';
import '../services/saved_food_service.dart';

class SavedFoodsManagerCard extends StatefulWidget {
  const SavedFoodsManagerCard({super.key});

  @override
  State<SavedFoodsManagerCard> createState() => _SavedFoodsManagerCardState();
}

class _SavedFoodsManagerCardState extends State<SavedFoodsManagerCard> {
  List<SavedFood> _foods = [];
  SavedFood? _editing;
  bool _loading = true;
  bool _saving = false;
  String? _error;

  final _name = TextEditingController();
  final _barcode = TextEditingController();
  final _amount = TextEditingController(text: '1 份');
  final _calories = TextEditingController(text: '0');
  final _protein = TextEditingController(text: '0');
  final _fat = TextEditingController(text: '0');
  final _carbs = TextEditingController(text: '0');

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _name.dispose();
    _barcode.dispose();
    _amount.dispose();
    _calories.dispose();
    _protein.dispose();
    _fat.dispose();
    _carbs.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    try {
      final foods = await SavedFoodService.list();
      if (mounted) setState(() => _foods = foods);
    } catch (e) {
      if (mounted) setState(() => _error = e.toString());
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  void _edit(SavedFood food) {
    setState(() {
      _editing = food;
      _name.text = food.name;
      _barcode.text = food.barcode ?? '';
      _amount.text = food.estimatedAmount;
      _calories.text = food.calories.toString();
      _protein.text = food.protein.toString();
      _fat.text = food.fat.toString();
      _carbs.text = food.carbs.toString();
      _error = null;
    });
  }

  void _reset() {
    setState(() {
      _editing = null;
      _name.clear();
      _barcode.clear();
      _amount.text = '1 份';
      _calories.text = '0';
      _protein.text = '0';
      _fat.text = '0';
      _carbs.text = '0';
      _error = null;
    });
  }

  Future<void> _save() async {
    if (_name.text.trim().isEmpty) {
      setState(() => _error = '請填寫食物名稱。');
      return;
    }
    setState(() {
      _saving = true;
      _error = null;
    });
    try {
      final barcode = _barcode.text.trim().isEmpty
          ? null
          : _barcode.text.trim();
      final args = (
        barcode: barcode,
        name: _name.text.trim(),
        estimatedAmount: _amount.text.trim().isEmpty
            ? '1 份'
            : _amount.text.trim(),
        calories: int.tryParse(_calories.text.trim()) ?? 0,
        protein: double.tryParse(_protein.text.trim()) ?? 0,
        fat: double.tryParse(_fat.text.trim()) ?? 0,
        carbs: double.tryParse(_carbs.text.trim()) ?? 0,
      );
      final editing = _editing;
      if (editing == null) {
        await SavedFoodService.create(
          barcode: args.barcode,
          name: args.name,
          estimatedAmount: args.estimatedAmount,
          calories: args.calories,
          protein: args.protein,
          fat: args.fat,
          carbs: args.carbs,
        );
      } else {
        await SavedFoodService.update(
          editing.id,
          barcode: args.barcode,
          name: args.name,
          estimatedAmount: args.estimatedAmount,
          calories: args.calories,
          protein: args.protein,
          fat: args.fat,
          carbs: args.carbs,
        );
      }
      _reset();
      await _load();
    } catch (e) {
      setState(() => _error = e.toString());
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  Future<void> _delete(SavedFood food) async {
    await SavedFoodService.delete(food.id);
    await _load();
  }

  @override
  Widget build(BuildContext context) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                const Expanded(
                  child: Text(
                    '常用食物管理',
                    style: TextStyle(fontSize: 18, fontWeight: FontWeight.w900),
                  ),
                ),
                if (_editing != null)
                  TextButton(onPressed: _reset, child: const Text('取消')),
              ],
            ),
            const SizedBox(height: 4),
            const Text(
              '管理你自己新增的食物與產品條碼。',
              style: TextStyle(fontSize: 12, color: Colors.black54),
            ),
            const SizedBox(height: 12),
            _field(_name, '食物名稱'),
            _field(_barcode, '產品條碼（選填）', keyboard: TextInputType.number),
            _field(_amount, '份量，例如：1 份 / 100g'),
            Row(
              children: [
                Expanded(
                  child: _field(
                    _calories,
                    '熱量 kcal',
                    keyboard: TextInputType.number,
                  ),
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: _field(
                    _protein,
                    '蛋白質 g',
                    keyboard: TextInputType.number,
                  ),
                ),
              ],
            ),
            Row(
              children: [
                Expanded(
                  child: _field(_fat, '脂肪 g', keyboard: TextInputType.number),
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: _field(_carbs, '碳水 g', keyboard: TextInputType.number),
                ),
              ],
            ),
            const SizedBox(height: 8),
            SizedBox(
              width: double.infinity,
              child: FilledButton.icon(
                onPressed: _saving ? null : _save,
                icon: const Icon(Icons.save),
                label: Text(
                  _saving
                      ? '儲存中...'
                      : _editing == null
                      ? '新增食物'
                      : '儲存修改',
                ),
              ),
            ),
            if (_error != null) ...[
              const SizedBox(height: 8),
              Text(_error!, style: const TextStyle(color: Colors.red)),
            ],
            const Divider(height: 24),
            if (_loading)
              const Center(child: CircularProgressIndicator())
            else if (_foods.isEmpty)
              const Text('尚無常用食物。', style: TextStyle(color: Colors.black54))
            else
              ..._foods.map(
                (food) => ListTile(
                  contentPadding: EdgeInsets.zero,
                  title: Text('${food.name} · ${food.calories} kcal'),
                  subtitle: Text(
                    [
                      food.estimatedAmount,
                      if (food.barcode != null) '條碼 ${food.barcode}',
                      'P ${food.protein}g / F ${food.fat}g / C ${food.carbs}g',
                    ].join(' · '),
                  ),
                  trailing: Wrap(
                    spacing: 4,
                    children: [
                      IconButton(
                        tooltip: '編輯',
                        icon: const Icon(Icons.edit),
                        onPressed: () => _edit(food),
                      ),
                      IconButton(
                        tooltip: '刪除',
                        icon: const Icon(
                          Icons.delete_outline,
                          color: Colors.red,
                        ),
                        onPressed: () => _delete(food),
                      ),
                    ],
                  ),
                ),
              ),
          ],
        ),
      ),
    );
  }

  Widget _field(
    TextEditingController controller,
    String label, {
    TextInputType? keyboard,
  }) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: TextField(
        controller: controller,
        keyboardType: keyboard,
        decoration: InputDecoration(
          labelText: label,
          border: const OutlineInputBorder(),
        ),
      ),
    );
  }
}
