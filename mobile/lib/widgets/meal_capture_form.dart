import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';

import '../models/models.dart';
import '../services/health_service.dart';
import '../services/meal_service.dart';
import '../services/saved_food_service.dart';
import 'markdown_text.dart';

const mealTypes = {
  'BREAKFAST': '早餐',
  'LUNCH': '午餐',
  'DINNER': '晚餐',
  'SNACK': '點心',
};

const aiRatings = {
  'GOOD': '✅ 較推薦',
  'OK': '⚠️ 普通',
  'LIMIT': '❌ 建議少吃',
  'MANUAL': '✎ 手動',
};

/// Mutable, editable food row used by the form and confirm dialog.
class EditableItem {
  String name;
  String estimatedAmount;
  String calories;
  String protein;
  String fat;
  String carbs;
  String aiRating;

  EditableItem({
    this.name = '',
    this.estimatedAmount = '',
    this.calories = '',
    this.protein = '',
    this.fat = '',
    this.carbs = '',
    this.aiRating = 'MANUAL',
  });

  factory EditableItem.fromAnalysis(FoodAnalysisItem f) => EditableItem(
        name: f.name,
        estimatedAmount: f.estimatedAmount,
        calories: f.calories.toString(),
        protein: f.protein.toString(),
        fat: f.fat.toString(),
        carbs: f.carbs.toString(),
        aiRating: f.aiRating,
      );

  bool get hasName => name.trim().isNotEmpty;

  MealItem toMealItem() => MealItem(
        name: name.trim(),
        estimatedAmount:
            estimatedAmount.trim().isEmpty ? '手動輸入' : estimatedAmount.trim(),
        calories: int.tryParse(calories.trim()) ?? 0,
        protein: double.tryParse(protein.trim()) ?? 0,
        fat: double.tryParse(fat.trim()) ?? 0,
        carbs: double.tryParse(carbs.trim()) ?? 0,
        aiRating: aiRating,
      );
}

class MealCaptureForm extends StatefulWidget {
  const MealCaptureForm({
    super.key,
    required this.onSaved,
    this.initialAdvice = '',
    this.showAdvice = true,
  });

  final Future<void> Function() onSaved;
  final String initialAdvice;

  /// The next-meal advice is for "today"; hide it when browsing other dates.
  final bool showAdvice;

  @override
  State<MealCaptureForm> createState() => _MealCaptureFormState();
}

class _MealCaptureFormState extends State<MealCaptureForm> {
  final _picker = ImagePicker();
  String _mealType = 'LUNCH';
  String? _imageDataUrl;
  final _descriptionCtrl = TextEditingController();
  final List<EditableItem> _manualItems = [EditableItem()];
  List<SavedFood> _savedFoods = [];
  bool _loading = false;
  bool _labelLoading = false;
  bool _adviceLoading = false;
  String? _error;
  late String _advice = widget.initialAdvice;

  @override
  void initState() {
    super.initState();
    _loadSavedFoods();
  }

  @override
  void dispose() {
    _descriptionCtrl.dispose();
    super.dispose();
  }

  Future<void> _loadSavedFoods() async {
    final foods = await SavedFoodService.list();
    if (mounted) setState(() => _savedFoods = foods);
  }

  Future<String?> _pickImageDataUrl(ImageSource source) async {
    final file = await _picker.pickImage(
        source: source, maxWidth: 1600, imageQuality: 80);
    if (file == null) return null;
    final bytes = await file.readAsBytes();
    if (bytes.length > 6 * 1024 * 1024) {
      setState(() => _error = '圖片不可超過 6MB');
      return null;
    }
    final mime = file.name.toLowerCase().endsWith('.png')
        ? 'image/png'
        : 'image/jpeg';
    return 'data:$mime;base64,${base64Encode(bytes)}';
  }

  Future<void> _chooseMealImage(ImageSource source) async {
    setState(() => _error = null);
    final url = await _pickImageDataUrl(source);
    if (url != null) setState(() => _imageDataUrl = url);
  }

  Future<void> _scanNutritionLabel(ImageSource source) async {
    setState(() {
      _error = null;
      _labelLoading = true;
    });
    try {
      final url = await _pickImageDataUrl(source);
      if (url == null) return;
      final items = await MealService.analyzeNutritionLabel(url);
      if (items.isEmpty) {
        setState(() => _error = 'AI 沒有辨識到營養標示內容，請換一張更清楚的圖片。');
        return;
      }
      setState(() {
        _manualItems.removeWhere((e) => !e.hasName);
        _manualItems.addAll(items.map(EditableItem.fromAnalysis));
      });
    } catch (e) {
      setState(() => _error = e.toString());
    } finally {
      if (mounted) setState(() => _labelLoading = false);
    }
  }

  Future<void> _submit() async {
    setState(() => _error = null);
    final desc = _descriptionCtrl.text.trim();
    final manual = _manualItems.where((e) => e.hasName).toList();
    if (_imageDataUrl == null && desc.isEmpty && manual.isEmpty) {
      setState(() => _error = '請先上傳圖片、描述餐點，或在下方手動輸入食物項目。');
      return;
    }
    setState(() => _loading = true);
    try {
      List<FoodAnalysisItem> analyzed;
      if (_imageDataUrl != null) {
        analyzed = await MealService.analyzeImage(_mealType, _imageDataUrl!);
      } else if (desc.isNotEmpty) {
        analyzed = await MealService.analyzeDescription(_mealType, desc);
      } else {
        analyzed = await MealService.analyzeManual(
            _mealType, manual.map((e) => e.toMealItem()).toList());
      }
      if (!mounted) return;
      final confirmed = await _showConfirmDialog(
          analyzed.map(EditableItem.fromAnalysis).toList());
      if (confirmed == true) await _afterSave();
    } catch (e) {
      setState(() => _error = e.toString());
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<bool?> _showConfirmDialog(List<EditableItem> items) {
    return showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      showDragHandle: true,
      builder: (ctx) => _ConfirmSheet(
        items: items,
        imageDataUrl: _imageDataUrl,
        onSave: (confirmedItems) async {
          final items = confirmedItems.map((e) => e.toMealItem()).toList();
          await MealService.createMeal(
            mealType: _mealType,
            imageDataUrl: _imageDataUrl,
            description: _descriptionCtrl.text.trim().isEmpty
                ? null
                : _descriptionCtrl.text.trim(),
            items: items,
          );
          await _writeMealToHealthConnect(items);
        },
      ),
    );
  }

  /// Write the saved meal's nutrition to Health Connect when the user has
  /// enabled it in settings. Shows the result so failures aren't silent.
  Future<void> _writeMealToHealthConnect(List<MealItem> items) async {
    if (!await HealthService.isNutritionWriteEnabled()) return;
    final calories = items.fold<int>(0, (s, e) => s + e.calories);
    final protein = items.fold<double>(0, (s, e) => s + e.protein);
    final fat = items.fold<double>(0, (s, e) => s + e.fat);
    final carbs = items.fold<double>(0, (s, e) => s + e.carbs);
    final name = items.map((e) => e.name).where((n) => n.isNotEmpty).join('、');
    final wrote = await HealthService.writeMealNutrition(
      mealType: _mealType,
      eatenAt: DateTime.now(),
      calories: calories,
      protein: protein,
      fat: fat,
      carbs: carbs,
      name: name,
    );
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(wrote
            ? '已寫入 Health Connect 營養紀錄'
            : '寫入 Health Connect 失敗，請確認已在「設定」開啟並授予寫入權限'),
      ),
    );
  }

  Future<void> _afterSave() async {
    setState(() {
      _imageDataUrl = null;
      _descriptionCtrl.clear();
      _manualItems
        ..clear()
        ..add(EditableItem());
      _adviceLoading = true;
    });
    await widget.onSaved();
    try {
      final advice = await MealService.nextMealAdvice();
      if (mounted) setState(() => _advice = advice);
    } catch (_) {
    } finally {
      if (mounted) setState(() => _adviceLoading = false);
    }
  }

  Future<void> _saveAsSavedFood(EditableItem item) async {
    if (!item.hasName) {
      setState(() => _error = '請先填寫食物名稱再儲存為常用食物。');
      return;
    }
    final mi = item.toMealItem();
    await SavedFoodService.create(
      name: mi.name,
      estimatedAmount:
          item.estimatedAmount.trim().isEmpty ? '1 份' : item.estimatedAmount.trim(),
      calories: mi.calories,
      protein: mi.protein,
      fat: mi.fat,
      carbs: mi.carbs,
    );
    await _loadSavedFoods();
  }

  void _addSavedFood(SavedFood food) {
    setState(() {
      _manualItems.removeWhere((e) => !e.hasName);
      _manualItems.add(EditableItem(
        name: food.name,
        estimatedAmount: food.estimatedAmount,
        calories: food.calories.toString(),
        protein: food.protein.toString(),
        fat: food.fat.toString(),
        carbs: food.carbs.toString(),
      ));
    });
  }

  Future<void> _imageSourceSheet(Function(ImageSource) onPick) async {
    final source = await showModalBottomSheet<ImageSource>(
      context: context,
      builder: (ctx) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            ListTile(
              leading: const Icon(Icons.camera_alt),
              title: const Text('拍照'),
              onTap: () => Navigator.pop(ctx, ImageSource.camera),
            ),
            ListTile(
              leading: const Icon(Icons.photo_library),
              title: const Text('從相簿選擇'),
              onTap: () => Navigator.pop(ctx, ImageSource.gallery),
            ),
          ],
        ),
      ),
    );
    if (source != null) onPick(source);
  }

  @override
  Widget build(BuildContext context) {
    final hasManual = _manualItems.any((e) => e.hasName);
    final submitLabel =
        _imageDataUrl != null || _descriptionCtrl.text.trim().isNotEmpty || hasManual
            ? 'AI 分析並確認'
            : '儲存餐點';
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text('新增餐點',
                style: TextStyle(fontSize: 20, fontWeight: FontWeight.w900)),
            const SizedBox(height: 4),
            const Text('拍照、上傳圖片，或直接描述你吃了什麼，AI 會先估算營養數據供你確認。',
                style: TextStyle(fontSize: 12, color: Colors.black54)),
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
            _imageSection(),
            const SizedBox(height: 12),
            TextField(
              controller: _descriptionCtrl,
              maxLines: 3,
              maxLength: 1200,
              onChanged: (_) => setState(() {}),
              decoration: const InputDecoration(
                labelText: '用文字描述餐點',
                hintText: '例如：午餐吃一碗滷肉飯、一顆滷蛋、半碗青菜和無糖豆漿。',
                border: OutlineInputBorder(),
              ),
            ),
            const SizedBox(height: 4),
            _manualSection(),
            if (_error != null) ...[
              const SizedBox(height: 10),
              Text(_error!, style: const TextStyle(color: Colors.red)),
            ],
            const SizedBox(height: 12),
            SizedBox(
              width: double.infinity,
              child: FilledButton(
                onPressed: _loading ? null : _submit,
                style: FilledButton.styleFrom(
                    padding: const EdgeInsets.symmetric(vertical: 14)),
                child: _loading
                    ? const SizedBox(
                        height: 20,
                        width: 20,
                        child: CircularProgressIndicator(
                            strokeWidth: 2, color: Colors.white))
                    : Text(submitLabel),
              ),
            ),
            const SizedBox(height: 6),
            const Text('AI 分析為估算值，請依實際份量修正。',
                style: TextStyle(fontSize: 11, color: Colors.black45)),
            if (widget.showAdvice && _adviceLoading)
              const Padding(
                padding: EdgeInsets.only(top: 12),
                child: Text('正在產生下一餐建議...',
                    style: TextStyle(color: Color(0xFFB45309))),
              ),
            if (widget.showAdvice && _advice.isNotEmpty) _adviceCard(),
          ],
        ),
      ),
    );
  }

  Widget _imageSection() {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        border: Border.all(color: const Color(0xFFFCD34D)),
        borderRadius: BorderRadius.circular(16),
        color: const Color(0xFFFFFBEB),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text('從圖片上傳食物',
              style: TextStyle(fontWeight: FontWeight.bold)),
          const SizedBox(height: 4),
          const Text('拍照或上傳餐點照片，AI 會辨識食物、估算營養並產生評分。',
              style: TextStyle(fontSize: 11, color: Colors.black54)),
          const SizedBox(height: 10),
          if (_imageDataUrl != null)
            ClipRRect(
              borderRadius: BorderRadius.circular(12),
              child: Image.memory(
                base64Decode(_imageDataUrl!.split(',').last),
                height: 180,
                width: double.infinity,
                fit: BoxFit.cover,
              ),
            ),
          const SizedBox(height: 8),
          Row(
            children: [
              Expanded(
                child: OutlinedButton.icon(
                  onPressed: () => _imageSourceSheet(_chooseMealImage),
                  icon: const Icon(Icons.add_a_photo),
                  label: Text(_imageDataUrl == null ? '選擇圖片' : '更換圖片'),
                ),
              ),
              if (_imageDataUrl != null) ...[
                const SizedBox(width: 8),
                IconButton(
                  onPressed: () => setState(() => _imageDataUrl = null),
                  icon: const Icon(Icons.close),
                  tooltip: '移除圖片',
                ),
              ],
            ],
          ),
        ],
      ),
    );
  }

  Widget _manualSection() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const SizedBox(height: 8),
        const Text('手動新增食物',
            style: TextStyle(fontWeight: FontWeight.bold)),
        const SizedBox(height: 8),
        OutlinedButton.icon(
          onPressed:
              _labelLoading ? null : () => _imageSourceSheet(_scanNutritionLabel),
          icon: _labelLoading
              ? const SizedBox(
                  height: 16, width: 16, child: CircularProgressIndicator(strokeWidth: 2))
              : const Icon(Icons.document_scanner),
          label: Text(_labelLoading ? '辨識中...' : '上傳營養標示'),
        ),
        if (_savedFoods.isNotEmpty) ...[
          const SizedBox(height: 10),
          const Text('常用食物', style: TextStyle(fontWeight: FontWeight.w600)),
          const SizedBox(height: 4),
          Wrap(
            spacing: 6,
            runSpacing: 6,
            children: _savedFoods
                .map((f) => InputChip(
                      label: Text('${f.name} · ${f.calories}kcal'),
                      onPressed: () => _addSavedFood(f),
                      onDeleted: () async {
                        await SavedFoodService.delete(f.id);
                        await _loadSavedFoods();
                      },
                    ))
                .toList(),
          ),
        ],
        const SizedBox(height: 8),
        ..._manualItems.asMap().entries.map((entry) => _manualItemEditor(
            entry.value, entry.key,
            onSaveCommon: () => _saveAsSavedFood(entry.value),
            onDelete: _manualItems.length == 1
                ? null
                : () => setState(() => _manualItems.removeAt(entry.key)))),
        const SizedBox(height: 6),
        OutlinedButton.icon(
          onPressed: () => setState(() => _manualItems.add(EditableItem())),
          icon: const Icon(Icons.add),
          label: const Text('新增另一項食物'),
        ),
      ],
    );
  }

  Widget _manualItemEditor(EditableItem item, int index,
      {VoidCallback? onSaveCommon, VoidCallback? onDelete}) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: ItemEditor(
        item: item,
        index: index,
        showRating: false,
        onChanged: () => setState(() {}),
        trailing: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            if (onSaveCommon != null)
              TextButton(onPressed: onSaveCommon, child: const Text('存常用')),
            if (onDelete != null)
              TextButton(
                  onPressed: onDelete,
                  child: const Text('刪除',
                      style: TextStyle(color: Colors.red))),
          ],
        ),
      ),
    );
  }

  Widget _adviceCard() {
    return Container(
      margin: const EdgeInsets.only(top: 14),
      width: double.infinity,
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: const Color(0xFFFFFBEB),
        borderRadius: BorderRadius.circular(16),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text('下一餐建議',
              style: TextStyle(
                  fontWeight: FontWeight.w900, color: Color(0xFF92400E))),
          const SizedBox(height: 2),
          const Text('此建議會保留到今天結束；新增下一餐後會自動更新。',
              style: TextStyle(fontSize: 11, color: Color(0xFFB45309))),
          const SizedBox(height: 6),
          MarkdownText(_advice, style: const TextStyle(color: Color(0xFF78350F))),
        ],
      ),
    );
  }
}

/// Reusable food row editor used in both the manual section and confirm sheet.
class ItemEditor extends StatelessWidget {
  const ItemEditor({
    super.key,
    required this.item,
    required this.index,
    required this.onChanged,
    this.trailing,
    this.showRating = true,
  });

  final EditableItem item;
  final int index;
  final VoidCallback onChanged;
  final Widget? trailing;
  final bool showRating;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(10),
      decoration: BoxDecoration(
        color: const Color(0xFFF5F5F4),
        borderRadius: BorderRadius.circular(12),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Text('食物 ${index + 1}',
                  style: const TextStyle(fontWeight: FontWeight.bold)),
              const Spacer(),
              if (trailing != null) trailing!,
            ],
          ),
          _field('食物名稱', item.name, (v) {
            item.name = v;
            onChanged();
          }),
          _field('份量，例如：150g', item.estimatedAmount, (v) {
            item.estimatedAmount = v;
            onChanged();
          }),
          if (showRating)
            DropdownButtonFormField<String>(
              initialValue: aiRatings.containsKey(item.aiRating)
                  ? item.aiRating
                  : 'MANUAL',
              isDense: true,
              decoration: const InputDecoration(isDense: true),
              items: aiRatings.entries
                  .map((e) =>
                      DropdownMenuItem(value: e.key, child: Text(e.value)))
                  .toList(),
              onChanged: (v) {
                item.aiRating = v ?? 'MANUAL';
                onChanged();
              },
            ),
          Row(
            children: [
              Expanded(
                  child: _numField('熱量 kcal', item.calories, (v) {
                item.calories = v;
                onChanged();
              })),
              const SizedBox(width: 8),
              Expanded(
                  child: _numField('蛋白質 g', item.protein, (v) {
                item.protein = v;
                onChanged();
              })),
            ],
          ),
          Row(
            children: [
              Expanded(
                  child: _numField('脂肪 g', item.fat, (v) {
                item.fat = v;
                onChanged();
              })),
              const SizedBox(width: 8),
              Expanded(
                  child: _numField('碳水 g', item.carbs, (v) {
                item.carbs = v;
                onChanged();
              })),
            ],
          ),
        ],
      ),
    );
  }

  Widget _field(String hint, String value, ValueChanged<String> onChanged) {
    return Padding(
      padding: const EdgeInsets.only(top: 6),
      child: TextFormField(
        initialValue: value,
        decoration: InputDecoration(hintText: hint, isDense: true),
        onChanged: onChanged,
      ),
    );
  }

  Widget _numField(String hint, String value, ValueChanged<String> onChanged) {
    return Padding(
      padding: const EdgeInsets.only(top: 6),
      child: TextFormField(
        initialValue: value,
        keyboardType: const TextInputType.numberWithOptions(decimal: true),
        decoration: InputDecoration(hintText: hint, isDense: true),
        onChanged: onChanged,
      ),
    );
  }
}

class _ConfirmSheet extends StatefulWidget {
  const _ConfirmSheet({
    required this.items,
    required this.imageDataUrl,
    required this.onSave,
  });

  final List<EditableItem> items;
  final String? imageDataUrl;
  final Future<void> Function(List<EditableItem>) onSave;

  @override
  State<_ConfirmSheet> createState() => _ConfirmSheetState();
}

class _ConfirmSheetState extends State<_ConfirmSheet> {
  late final List<EditableItem> _items = List.of(widget.items);
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
      await widget.onSave(valid);
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
      builder: (ctx, scrollController) => Padding(
        padding: EdgeInsets.only(
            left: 16,
            right: 16,
            bottom: MediaQuery.of(context).viewInsets.bottom + 16),
        child: ListView(
          controller: scrollController,
          children: [
            const Text('確認 AI 分析品項',
                style: TextStyle(fontSize: 20, fontWeight: FontWeight.w900)),
            const SizedBox(height: 4),
            const Text('請確認食物是否正確，可先修正、刪除或新增後再儲存。',
                style: TextStyle(fontSize: 12, color: Colors.black54)),
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
                  : const Text('確認並儲存餐點'),
            ),
            const SizedBox(height: 8),
          ],
        ),
      ),
    );
  }
}
