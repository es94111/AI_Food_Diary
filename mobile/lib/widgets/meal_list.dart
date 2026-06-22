import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';
import 'package:intl/intl.dart';

import '../models/models.dart';
import '../services/api_client.dart';
import '../services/meal_service.dart';
import '../theme/app_theme.dart';
import 'meal_capture_form.dart';

const _maxMealImages = 5;

class MealList extends StatelessWidget {
  const MealList({super.key, required this.meals, required this.onChanged});

  final List<Meal> meals;
  final Future<void> Function() onChanged;

  @override
  Widget build(BuildContext context) {
    if (meals.isEmpty) {
      return Padding(
        padding: const EdgeInsets.symmetric(vertical: 24),
        child: Center(
          child: Text('尚無餐點紀錄',
              style: TextStyle(color: context.palette.inkFaint)),
        ),
      );
    }
    return Column(
      children: meals.map((m) => _MealCard(meal: m, onChanged: onChanged)).toList(),
    );
  }
}

class _MealCard extends StatefulWidget {
  const _MealCard({required this.meal, required this.onChanged});

  final Meal meal;
  final Future<void> Function() onChanged;

  @override
  State<_MealCard> createState() => _MealCardState();
}

class _MealCardState extends State<_MealCard> {
  final _picker = ImagePicker();
  bool _uploading = false;
  String? _error;

  Meal get meal => widget.meal;

  // Legacy single-image meals may report imageCount 0 but still have a photo.
  int get _imageCount =>
      meal.imageCount > 0 ? meal.imageCount : (meal.hasImage ? 1 : 0);

  Future<void> _delete() async {
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
    await widget.onChanged();
  }

  Future<void> _edit() async {
    final saved = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      showDragHandle: true,
      builder: (ctx) => _EditMealSheet(meal: meal),
    );
    if (saved == true) await widget.onChanged();
  }

  Future<ImageSource?> _imageSourceSheet() => showModalBottomSheet<ImageSource>(
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

  /// Picks one (camera) or several (gallery) images and returns their data URLs,
  /// honouring [room] remaining slots and the 6MB per-image cap.
  Future<List<String>> _pick(ImageSource source, int room) async {
    final files = source == ImageSource.gallery
        ? await _picker.pickMultiImage(maxWidth: 1600, imageQuality: 80)
        : await _picker
            .pickImage(source: source, maxWidth: 1600, imageQuality: 80)
            .then((f) => f == null ? <XFile>[] : [f]);
    if (files.isEmpty) return [];

    final urls = <String>[];
    var skippedSize = false;
    for (final file in files) {
      if (urls.length >= room) break;
      final bytes = await file.readAsBytes();
      if (bytes.length > 6 * 1024 * 1024) {
        skippedSize = true;
        continue;
      }
      final mime =
          file.name.toLowerCase().endsWith('.png') ? 'image/png' : 'image/jpeg';
      urls.add('data:$mime;base64,${base64Encode(bytes)}');
    }
    final messages = <String>[];
    if (files.length > room) messages.add('每筆餐點最多 $_maxMealImages 張照片。');
    if (skippedSize) messages.add('部分圖片超過 6MB 已略過。');
    if (messages.isNotEmpty && mounted) setState(() => _error = messages.join(' '));
    return urls;
  }

  Future<void> _addPhotos() async {
    final room = _maxMealImages - _imageCount;
    if (room <= 0) {
      setState(() => _error = '每筆餐點最多 $_maxMealImages 張照片。');
      return;
    }
    final source = await _imageSourceSheet();
    if (source == null) return;
    setState(() => _error = null);
    final urls = await _pick(source, room);
    if (urls.isEmpty) return;
    setState(() => _uploading = true);
    try {
      await MealService.addImages(meal.id, urls);
      await widget.onChanged();
    } catch (e) {
      if (mounted) setState(() => _error = e.toString());
    } finally {
      if (mounted) setState(() => _uploading = false);
    }
  }

  Future<void> _removePhoto(int index) async {
    final confirm = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('移除照片'),
        content: const Text('確定要移除這張照片嗎？'),
        actions: [
          TextButton(
              onPressed: () => Navigator.pop(ctx, false),
              child: const Text('取消')),
          FilledButton(
              onPressed: () => Navigator.pop(ctx, true),
              child: const Text('移除')),
        ],
      ),
    );
    if (confirm != true) return;
    setState(() {
      _uploading = true;
      _error = null;
    });
    try {
      await MealService.removeImage(meal.id, index);
      await widget.onChanged();
    } catch (e) {
      if (mounted) setState(() => _error = e.toString());
    } finally {
      if (mounted) setState(() => _uploading = false);
    }
  }

  /// Renders the meal's photo(s) with a per-image remove button: a single
  /// full-width image, or a horizontally scrollable strip when there are more.
  Widget _mealImages(Map<String, String> headers, int count) {
    Widget tile(int i, double? width) => Stack(
          children: [
            ClipRRect(
              borderRadius: BorderRadius.circular(12),
              child: Image.network(
                MealService.mealImageUrl(meal, i),
                headers: headers,
                height: 160,
                width: width ?? double.infinity,
                fit: BoxFit.cover,
                errorBuilder: (_, _, _) => Container(
                  height: 120,
                  width: width ?? double.infinity,
                  alignment: Alignment.center,
                  color: context.palette.surfaceAlt,
                  child: Text('圖片載入失敗',
                      style: TextStyle(color: context.palette.inkFaint)),
                ),
              ),
            ),
            Positioned(
              top: 6,
              right: 6,
              child: Material(
                color: Colors.black54,
                shape: const CircleBorder(),
                child: InkWell(
                  customBorder: const CircleBorder(),
                  onTap: _uploading ? null : () => _removePhoto(i),
                  child: const Padding(
                    padding: EdgeInsets.all(4),
                    child: Icon(Icons.close, size: 16, color: Colors.white),
                  ),
                ),
              ),
            ),
          ],
        );
    if (count <= 1) return tile(0, null);
    return SizedBox(
      height: 160,
      child: ListView.separated(
        scrollDirection: Axis.horizontal,
        itemCount: count,
        separatorBuilder: (_, _) => const SizedBox(width: 8),
        itemBuilder: (_, i) => tile(i, 220),
      ),
    );
  }

  /// Photo area: existing images (each removable), plus an add/retroactive-upload
  /// button so meals logged without a photo can get one later.
  Widget _photoSection(Map<String, String> headers) {
    final count = _imageCount;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        if (count > 0) ...[
          const SizedBox(height: 8),
          _mealImages(headers, count),
        ],
        const SizedBox(height: 8),
        Row(
          children: [
            if (count < _maxMealImages)
              OutlinedButton.icon(
                onPressed: _uploading ? null : _addPhotos,
                icon: const Icon(Icons.add_a_photo_outlined, size: 18),
                label: Text(count > 0 ? '新增照片' : '補上傳照片'),
              ),
            if (_uploading) ...[
              const SizedBox(width: 12),
              const SizedBox(
                height: 18,
                width: 18,
                child: CircularProgressIndicator(strokeWidth: 2),
              ),
            ],
          ],
        ),
        if (_error != null)
          Padding(
            padding: const EdgeInsets.only(top: 6),
            child: Text(_error!,
                style: TextStyle(color: context.palette.danger, fontSize: 12)),
          ),
      ],
    );
  }

  @override
  Widget build(BuildContext context) {
    final headers = ApiClient.instance.sessionCookie != null
        ? {'Cookie': ApiClient.instance.sessionCookie!}
        : <String, String>{};
    final p = context.palette;
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
                    color: p.amberSurface,
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: Text(mealTypes[meal.mealType] ?? meal.mealType,
                      style: TextStyle(
                          fontSize: 12,
                          fontWeight: FontWeight.bold,
                          color: p.amberInk)),
                ),
                const SizedBox(width: 8),
                Text(DateFormat('HH:mm').format(meal.eatenAt),
                    style: TextStyle(color: p.inkFaint, fontSize: 12)),
                const Spacer(),
                Text('${fmtNum(meal.totalCalories)} kcal',
                    style: const TextStyle(fontWeight: FontWeight.w900)),
              ],
            ),
            _photoSection(headers),
            const SizedBox(height: 8),
            ...meal.items.map((it) => Padding(
                  padding: const EdgeInsets.symmetric(vertical: 2),
                  child: Row(
                    children: [
                      Expanded(
                          child: Text('${_ratingIcon(it.aiRating)} ${it.name}'
                              '${it.estimatedAmount.isNotEmpty ? ' · ${it.estimatedAmount}' : ''}')),
                      Text('${fmtNum(it.calories)} kcal',
                          style: TextStyle(color: p.inkSoft)),
                    ],
                  ),
                )),
            const SizedBox(height: 4),
            Text(
                '蛋白質 ${meal.totalProtein.toStringAsFixed(1)}g · '
                '脂肪 ${meal.totalFat.toStringAsFixed(1)}g · '
                '碳水 ${meal.totalCarbs.toStringAsFixed(1)}g',
                style: TextStyle(fontSize: 12, color: p.inkSoft)),
            const SizedBox(height: 8),
            _MacroBars(
              protein: meal.totalProtein,
              fat: meal.totalFat,
              carbs: meal.totalCarbs,
            ),
            Row(
              mainAxisAlignment: MainAxisAlignment.end,
              children: [
                TextButton.icon(
                    onPressed: _edit,
                    icon: const Icon(Icons.edit, size: 16),
                    label: const Text('編輯')),
                TextButton.icon(
                    onPressed: _delete,
                    icon: Icon(Icons.delete, size: 16, color: p.danger),
                    label: Text('刪除', style: TextStyle(color: p.danger))),
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

class _MacroBars extends StatelessWidget {
  const _MacroBars({
    required this.protein,
    required this.fat,
    required this.carbs,
  });

  final double protein;
  final double fat;
  final double carbs;

  @override
  Widget build(BuildContext context) {
    final total = protein + fat + carbs;
    int macroFlex(double value) =>
        total == 0 ? 1 : (value / total * 1000).round().clamp(1, 1000).toInt();
    final proteinFlex = macroFlex(protein);
    final fatFlex = macroFlex(fat);
    final carbsFlex = macroFlex(carbs);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        ClipRRect(
          borderRadius: BorderRadius.circular(999),
          child: SizedBox(
            height: 8,
            child: Row(
              children: [
                Expanded(
                    flex: proteinFlex,
                    child: Container(color: AppColors.protein)),
                Expanded(
                    flex: fatFlex,
                    child: Container(color: AppColors.fat)),
                Expanded(
                    flex: carbsFlex,
                    child: Container(color: AppColors.carbs)),
              ],
            ),
          ),
        ),
      ],
    );
  }
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
            calories: fmtNum(it.calories),
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
      builder: (ctx, controller) {
        final p = ctx.palette;
        return Padding(
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
                  labelText: '餐期', border: OutlineInputBorder()),
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
                            child: Text('刪除',
                                style: TextStyle(color: p.danger)),
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
              Text(_error!, style: TextStyle(color: p.danger)),
            ],
            const SizedBox(height: 12),
            FilledButton(
              onPressed: _saving ? null : _save,
              style: FilledButton.styleFrom(
                  padding: const EdgeInsets.symmetric(vertical: 14)),
              child: _saving
                  ? SizedBox(
                      height: 20,
                      width: 20,
                      child: CircularProgressIndicator(
                          strokeWidth: 2, color: p.onBrand))
                  : const Text('儲存餐期與餐點'),
            ),
            const SizedBox(height: 8),
          ],
        ),
      );
      },
    );
  }
}
