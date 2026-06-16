import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';

import '../models/models.dart';
import '../services/api_client.dart';
import '../services/saved_food_service.dart';

const _sourceLabels = {
  'MANUAL': '手動新增',
  'NUTRITION_LABEL': '營養標示',
  'BARCODE': '條碼綁定',
  'MEAL_ITEM': '從餐點保存',
};

enum _FoodTab { favorites, mine, barcoded, recent }

class SavedFoodsManagerCard extends StatefulWidget {
  const SavedFoodsManagerCard({super.key});

  @override
  State<SavedFoodsManagerCard> createState() => _SavedFoodsManagerCardState();
}

class _SavedFoodsManagerCardState extends State<SavedFoodsManagerCard> {
  List<SavedFood> _foods = [];
  SavedFood? _editing;
  _FoodTab _tab = _FoodTab.favorites;
  bool _loading = true;
  bool _saving = false;
  bool _favorite = false;
  String _source = 'MANUAL';
  String? _error;
  // New photo to upload (data URL) and whether to clear the existing one.
  String? _imageDataUrl;
  bool _removeImage = false;
  final _picker = ImagePicker();

  final _name = TextEditingController();
  final _barcode = TextEditingController();
  final _amount = TextEditingController(text: '1 份');
  final _calories = TextEditingController(text: '0');
  final _protein = TextEditingController(text: '0');
  final _fat = TextEditingController(text: '0');
  final _carbs = TextEditingController(text: '0');

  List<SavedFood> get _visibleFoods {
    return _foods.where((food) {
      switch (_tab) {
        case _FoodTab.favorites:
          return food.isFavorite;
        case _FoodTab.barcoded:
          return food.barcode != null && food.barcode!.isNotEmpty;
        case _FoodTab.recent:
          return food.lastUsedAt != null || food.useCount > 0;
        case _FoodTab.mine:
          return true;
      }
    }).toList();
  }

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
      _calories.text = fmtNum(food.calories);
      _protein.text = food.protein.toString();
      _fat.text = food.fat.toString();
      _carbs.text = food.carbs.toString();
      _source = food.source;
      _favorite = food.isFavorite;
      _imageDataUrl = null;
      _removeImage = false;
      _error = null;
    });
  }

  void _reset() {
    setState(() {
      _editing = null;
      _imageDataUrl = null;
      _removeImage = false;
      _name.clear();
      _barcode.clear();
      _amount.text = '1 份';
      _calories.text = '0';
      _protein.text = '0';
      _fat.text = '0';
      _carbs.text = '0';
      _source = 'MANUAL';
      _favorite = false;
      _error = null;
    });
  }

  Future<void> _pickImage() async {
    final file = await _picker.pickImage(
      source: ImageSource.gallery,
      maxWidth: 1600,
      imageQuality: 80,
    );
    if (file == null) return;
    final bytes = await file.readAsBytes();
    final mime =
        file.name.toLowerCase().endsWith('.png') ? 'image/png' : 'image/jpeg';
    setState(() {
      _imageDataUrl = 'data:$mime;base64,${base64Encode(bytes)}';
      _removeImage = false;
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
      final editing = _editing;
      if (editing == null) {
        await SavedFoodService.create(
          barcode: barcode,
          name: _name.text.trim(),
          estimatedAmount: _amount.text.trim().isEmpty
              ? '1 份'
              : _amount.text.trim(),
          calories: double.tryParse(_calories.text.trim()) ?? 0,
          protein: double.tryParse(_protein.text.trim()) ?? 0,
          fat: double.tryParse(_fat.text.trim()) ?? 0,
          carbs: double.tryParse(_carbs.text.trim()) ?? 0,
          source: _source,
          isFavorite: _favorite,
          imageDataUrl: _imageDataUrl,
        );
      } else {
        await SavedFoodService.update(
          editing.id,
          barcode: barcode,
          name: _name.text.trim(),
          estimatedAmount: _amount.text.trim().isEmpty
              ? '1 份'
              : _amount.text.trim(),
          calories: double.tryParse(_calories.text.trim()) ?? 0,
          protein: double.tryParse(_protein.text.trim()) ?? 0,
          fat: double.tryParse(_fat.text.trim()) ?? 0,
          carbs: double.tryParse(_carbs.text.trim()) ?? 0,
          source: _source,
          isFavorite: _favorite,
          imageDataUrl: _imageDataUrl,
          removeImage: _removeImage,
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

  Future<void> _toggleFavorite(SavedFood food) async {
    await SavedFoodService.update(
      food.id,
      barcode: food.barcode,
      name: food.name,
      estimatedAmount: food.estimatedAmount,
      calories: food.calories,
      protein: food.protein,
      fat: food.fat,
      carbs: food.carbs,
      source: food.source,
      isFavorite: !food.isFavorite,
    );
    await _load();
  }

  Future<void> _archive(SavedFood food) async {
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
                    '我的食物管理',
                    style: TextStyle(fontSize: 18, fontWeight: FontWeight.w900),
                  ),
                ),
                if (_editing != null)
                  TextButton(onPressed: _reset, child: const Text('取消')),
              ],
            ),
            const SizedBox(height: 4),
            const Text(
              '管理常用食物、自建食物與產品條碼。封存不會影響過去餐點紀錄。',
              style: TextStyle(fontSize: 12, color: Colors.black54),
            ),
            const SizedBox(height: 12),
            _field(_name, '食物名稱'),
            _field(_barcode, '產品條碼（選填）', keyboard: TextInputType.number),
            _field(_amount, '份量，例如：1 份 / 100g'),
            DropdownButtonFormField<String>(
              initialValue: _source,
              decoration: const InputDecoration(
                labelText: '來源',
                border: OutlineInputBorder(),
              ),
              items: _sourceLabels.entries
                  .map(
                    (e) => DropdownMenuItem(value: e.key, child: Text(e.value)),
                  )
                  .toList(),
              onChanged: (v) => setState(() => _source = v ?? 'MANUAL'),
            ),
            const SizedBox(height: 8),
            Row(
              children: [
                Expanded(
                  child: _field(
                    _calories,
                    '熱量 kcal',
                    keyboard: const TextInputType.numberWithOptions(
                      decimal: true,
                    ),
                  ),
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: _field(
                    _protein,
                    '蛋白質 g',
                    keyboard: const TextInputType.numberWithOptions(
                      decimal: true,
                    ),
                  ),
                ),
              ],
            ),
            Row(
              children: [
                Expanded(
                  child: _field(
                    _fat,
                    '脂肪 g',
                    keyboard: const TextInputType.numberWithOptions(
                      decimal: true,
                    ),
                  ),
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: _field(
                    _carbs,
                    '碳水 g',
                    keyboard: const TextInputType.numberWithOptions(
                      decimal: true,
                    ),
                  ),
                ),
              ],
            ),
            CheckboxListTile(
              contentPadding: EdgeInsets.zero,
              value: _favorite,
              onChanged: (v) => setState(() => _favorite = v ?? false),
              title: const Text('加入常用'),
              controlAffinity: ListTileControlAffinity.leading,
            ),
            _imageRow(),
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
            _tabs(),
            const SizedBox(height: 8),
            if (_loading)
              const Center(child: CircularProgressIndicator())
            else if (_visibleFoods.isEmpty)
              const Text('這個分類目前沒有食物。', style: TextStyle(color: Colors.black54))
            else
              ..._visibleFoods.map(_foodTile),
          ],
        ),
      ),
    );
  }

  Widget _tabs() {
    return Wrap(
      spacing: 8,
      children: [
        ChoiceChip(
          label: const Text('常用'),
          selected: _tab == _FoodTab.favorites,
          onSelected: (_) => setState(() => _tab = _FoodTab.favorites),
        ),
        ChoiceChip(
          label: const Text('我的新增'),
          selected: _tab == _FoodTab.mine,
          onSelected: (_) => setState(() => _tab = _FoodTab.mine),
        ),
        ChoiceChip(
          label: const Text('有條碼'),
          selected: _tab == _FoodTab.barcoded,
          onSelected: (_) => setState(() => _tab = _FoodTab.barcoded),
        ),
        ChoiceChip(
          label: const Text('最近使用'),
          selected: _tab == _FoodTab.recent,
          onSelected: (_) => setState(() => _tab = _FoodTab.recent),
        ),
      ],
    );
  }

  Map<String, String> _authHeaders() =>
      ApiClient.instance.sessionCookie != null
          ? {'Cookie': ApiClient.instance.sessionCookie!}
          : <String, String>{};

  Widget _noPhotoBox(double size) => Container(
        width: size,
        height: size,
        color: const Color(0xFFF5F5F4),
        alignment: Alignment.center,
        child: const Text('無', style: TextStyle(color: Colors.black38, fontSize: 12)),
      );

  /// Photo picker row for the create/edit form: preview + upload + remove.
  Widget _imageRow() {
    final editing = _editing;
    final hasExisting = editing != null && editing.hasImage && !_removeImage;
    Widget preview;
    if (_imageDataUrl != null) {
      preview = Image.memory(
        base64Decode(_imageDataUrl!.split(',').last),
        width: 56,
        height: 56,
        fit: BoxFit.cover,
      );
    } else if (hasExisting) {
      preview = Image.network(
        SavedFoodService.imageUrl(editing.id),
        headers: _authHeaders(),
        width: 56,
        height: 56,
        fit: BoxFit.cover,
        errorBuilder: (_, _, _) => _noPhotoBox(56),
      );
    } else {
      preview = _noPhotoBox(56);
    }
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 8),
      child: Row(
        children: [
          ClipRRect(borderRadius: BorderRadius.circular(8), child: preview),
          const SizedBox(width: 12),
          OutlinedButton.icon(
            onPressed: _pickImage,
            icon: const Icon(Icons.photo_camera_outlined, size: 18),
            label: const Text('上傳食物照片'),
          ),
          if (_imageDataUrl != null || hasExisting)
            TextButton(
              onPressed: () => setState(() {
                _imageDataUrl = null;
                _removeImage = true;
              }),
              child: const Text('移除', style: TextStyle(color: Colors.red)),
            ),
        ],
      ),
    );
  }

  Widget _foodTile(SavedFood food) {
    final lastUsed = food.lastUsedAt == null
        ? ''
        : ' · 上次 ${food.lastUsedAt!.month}/${food.lastUsedAt!.day}';
    return ListTile(
      contentPadding: EdgeInsets.zero,
      leading: food.hasImage
          ? ClipRRect(
              borderRadius: BorderRadius.circular(8),
              child: Image.network(
                SavedFoodService.imageUrl(food.id),
                headers: _authHeaders(),
                width: 48,
                height: 48,
                fit: BoxFit.cover,
                errorBuilder: (_, _, _) => _noPhotoBox(48),
              ),
            )
          : null,
      title: Text(
        '${food.isFavorite ? '★ ' : ''}${food.name} · ${fmtNum(food.calories)} kcal',
      ),
      subtitle: Text(
        [
          food.estimatedAmount,
          if (food.barcode != null) '條碼 ${food.barcode}',
          '蛋白質 ${food.protein}g / 脂肪 ${food.fat}g / 碳水 ${food.carbs}g',
          '${_sourceLabels[food.source] ?? '手動新增'} · 使用 ${food.useCount} 次$lastUsed',
        ].join(' · '),
      ),
      trailing: Wrap(
        spacing: 4,
        children: [
          IconButton(
            tooltip: food.isFavorite ? '取消常用' : '設為常用',
            icon: Icon(food.isFavorite ? Icons.star : Icons.star_border),
            onPressed: () => _toggleFavorite(food),
          ),
          IconButton(
            tooltip: '編輯',
            icon: const Icon(Icons.edit),
            onPressed: () => _edit(food),
          ),
          IconButton(
            tooltip: '封存',
            icon: const Icon(Icons.archive_outlined, color: Colors.red),
            onPressed: () => _archive(food),
          ),
        ],
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
