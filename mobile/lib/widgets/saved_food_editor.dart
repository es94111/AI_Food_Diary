import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';

import '../models/models.dart';
import '../services/api_client.dart';
import '../services/saved_food_service.dart';
import '../theme/app_theme.dart';

const savedFoodSourceLabels = {
  'MANUAL': '手動新增',
  'NUTRITION_LABEL': '營養標示',
  'BARCODE': '條碼綁定',
  'MEAL_ITEM': '從餐點保存',
};

enum _ConflictAction { use, update, restore, saveAsNew }

class SavedFoodEditor extends StatefulWidget {
  const SavedFoodEditor({
    super.key,
    required this.editing,
    required this.onSaved,
    required this.onCancelEdit,
  });

  final SavedFood? editing;
  final Future<void> Function(SavedFood food) onSaved;
  final VoidCallback onCancelEdit;

  @override
  State<SavedFoodEditor> createState() => _SavedFoodEditorState();
}

class _SavedFoodEditorState extends State<SavedFoodEditor> {
  final _picker = ImagePicker();
  final _name = TextEditingController();
  final _barcode = TextEditingController();
  final _amount = TextEditingController(text: '1 份');
  final _calories = TextEditingController(text: '0');
  final _protein = TextEditingController(text: '0');
  final _fat = TextEditingController(text: '0');
  final _carbs = TextEditingController(text: '0');

  bool _expanded = false;
  bool _saving = false;
  bool _favorite = false;
  bool _removeImage = false;
  String _source = 'MANUAL';
  String? _imageDataUrl;
  String? _error;

  @override
  void initState() {
    super.initState();
    if (widget.editing != null) _populate(widget.editing!);
  }

  @override
  void didUpdateWidget(covariant SavedFoodEditor oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (widget.editing?.id != oldWidget.editing?.id) {
      final editing = widget.editing;
      if (editing == null) {
        _clearFields();
      } else {
        _populate(editing);
      }
    }
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

  void _populate(SavedFood food) {
    _name.text = food.name;
    _barcode.text = food.barcode ?? '';
    _amount.text = food.estimatedAmount;
    _calories.text = fmtNum(food.calories);
    _protein.text = fmtNum(food.protein);
    _fat.text = fmtNum(food.fat);
    _carbs.text = fmtNum(food.carbs);
    _source = food.source;
    _favorite = food.isFavorite;
    _imageDataUrl = null;
    _removeImage = false;
    _error = null;
    _expanded = true;
  }

  void _clearFields() {
    _name.clear();
    _barcode.clear();
    _amount.text = '1 份';
    _calories.text = '0';
    _protein.text = '0';
    _fat.text = '0';
    _carbs.text = '0';
    _source = 'MANUAL';
    _favorite = false;
    _imageDataUrl = null;
    _removeImage = false;
    _error = null;
  }

  void _toggleExpanded() {
    if (_expanded && widget.editing != null) widget.onCancelEdit();
    setState(() {
      _expanded = !_expanded;
      if (!_expanded) _clearFields();
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
    final mime = file.name.toLowerCase().endsWith('.png')
        ? 'image/png'
        : 'image/jpeg';
    if (!mounted) return;
    setState(() {
      _imageDataUrl = 'data:$mime;base64,${base64Encode(bytes)}';
      _removeImage = false;
    });
  }

  Future<_ConflictAction?> _chooseConflict(DuplicateFoodException error) async {
    final match =
        error.exactBarcode ??
        (error.duplicates.isEmpty ? null : error.duplicates.first);
    final names = error.duplicates.map((match) => match.food.name).join('、');
    final archived = match?.archived == true;
    final exact = error.exactBarcode != null;
    return showDialog<_ConflictAction>(
      context: context,
      builder: (context) => AlertDialog(
        title: Text(exact ? '條碼已存在' : '可能已有相同或相似食物'),
        content: Text(
          '${match?.food.name ?? names}\n\n'
          '${archived ? '這筆食物目前已封存。' : '請選擇要如何處理現有資料。'}'
          '${exact ? '\n另存時會移除重複條碼。' : ''}',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('取消'),
          ),
          if (match != null && !archived)
            TextButton(
              onPressed: () => Navigator.pop(context, _ConflictAction.use),
              child: const Text('使用'),
            ),
          if (match != null)
            TextButton(
              onPressed: () => Navigator.pop(context, _ConflictAction.update),
              child: const Text('更新'),
            ),
          if (match != null && archived)
            TextButton(
              onPressed: () => Navigator.pop(context, _ConflictAction.restore),
              child: const Text('還原'),
            ),
          FilledButton(
            onPressed: () => Navigator.pop(context, _ConflictAction.saveAsNew),
            child: const Text('另存'),
          ),
        ],
      ),
    );
  }

  Future<SavedFood> _create({
    bool allowDuplicate = false,
    bool clearBarcode = false,
  }) => SavedFoodService.create(
    barcode: clearBarcode || _barcode.text.trim().isEmpty
        ? null
        : _barcode.text.trim(),
    name: _name.text.trim(),
    estimatedAmount: _amount.text.trim().isEmpty ? '1 份' : _amount.text.trim(),
    calories: double.tryParse(_calories.text.trim()) ?? 0,
    protein: double.tryParse(_protein.text.trim()) ?? 0,
    fat: double.tryParse(_fat.text.trim()) ?? 0,
    carbs: double.tryParse(_carbs.text.trim()) ?? 0,
    source: _source,
    isFavorite: _favorite,
    imageDataUrl: _imageDataUrl,
    allowDuplicate: allowDuplicate,
  );

  Future<SavedFood> _updateConflict(SavedFoodMatch match) async {
    final enteredBarcode = _barcode.text.trim();
    final updated = await SavedFoodService.update(
      match.food.id,
      // A blank create form should not silently erase the existing barcode.
      barcode: enteredBarcode.isEmpty ? match.food.barcode : enteredBarcode,
      name: _name.text.trim(),
      estimatedAmount: _amount.text.trim().isEmpty
          ? '1 份'
          : _amount.text.trim(),
      calories: double.tryParse(_calories.text.trim()) ?? 0,
      protein: double.tryParse(_protein.text.trim()) ?? 0,
      fat: double.tryParse(_fat.text.trim()) ?? 0,
      carbs: double.tryParse(_carbs.text.trim()) ?? 0,
      isFavorite: _favorite,
      imageDataUrl: _imageDataUrl,
      removeImage: _removeImage,
    );
    return match.archived ? SavedFoodService.restore(updated.id) : updated;
  }

  Future<SavedFood?> _resolveConflict(DuplicateFoodException error) async {
    final match =
        error.exactBarcode ??
        (error.duplicates.isEmpty ? null : error.duplicates.first);
    final action = await _chooseConflict(error);
    if (action == null) return null;
    return switch (action) {
      _ConflictAction.use when match != null => match.food,
      _ConflictAction.update when match != null => _updateConflict(match),
      _ConflictAction.restore when match != null => SavedFoodService.restore(
        match.food.id,
      ),
      _ConflictAction.saveAsNew => _create(
        allowDuplicate: true,
        clearBarcode: error.exactBarcode != null,
      ),
      _ => null,
    };
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
      final editing = widget.editing;
      SavedFood food;
      if (editing != null) {
        food = await SavedFoodService.update(
          editing.id,
          barcode: _barcode.text.trim().isEmpty ? null : _barcode.text.trim(),
          name: _name.text.trim(),
          estimatedAmount: _amount.text.trim().isEmpty
              ? '1 份'
              : _amount.text.trim(),
          calories: double.tryParse(_calories.text.trim()) ?? 0,
          protein: double.tryParse(_protein.text.trim()) ?? 0,
          fat: double.tryParse(_fat.text.trim()) ?? 0,
          carbs: double.tryParse(_carbs.text.trim()) ?? 0,
          isFavorite: _favorite,
          imageDataUrl: _imageDataUrl,
          removeImage: _removeImage,
        );
      } else {
        try {
          food = await _create();
        } on DuplicateFoodException catch (error) {
          if (!mounted) return;
          final resolved = await _resolveConflict(error);
          if (resolved == null) return;
          food = resolved;
        }
      }
      await widget.onSaved(food);
      if (!mounted) return;
      widget.onCancelEdit();
      setState(() {
        _clearFields();
        _expanded = false;
      });
    } on DuplicateFoodException catch (error) {
      if (mounted) {
        setState(() => _error = error.message);
      }
    } catch (error) {
      if (mounted) setState(() => _error = error.toString());
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Material(
      color: context.palette.surfaceAlt,
      borderRadius: BorderRadius.circular(12),
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(
          children: [
            InkWell(
              onTap: _saving ? null : _toggleExpanded,
              child: Row(
                children: [
                  Expanded(
                    child: Text(
                      widget.editing == null ? '新增食物' : '編輯食物',
                      style: const TextStyle(fontWeight: FontWeight.bold),
                    ),
                  ),
                  Icon(_expanded ? Icons.expand_less : Icons.expand_more),
                ],
              ),
            ),
            if (_expanded) ...[
              const SizedBox(height: 12),
              _field(_name, '食物名稱'),
              _field(_barcode, '產品條碼（選填）', keyboard: TextInputType.number),
              _field(_amount, '份量，例如：1 份 / 100g'),
              InputDecorator(
                decoration: const InputDecoration(
                  labelText: '來源',
                  border: OutlineInputBorder(),
                ),
                child: Row(
                  children: [
                    const Icon(Icons.lock_outline, size: 18),
                    const SizedBox(width: 8),
                    Text(savedFoodSourceLabels[_source] ?? '手動新增'),
                  ],
                ),
              ),
              const SizedBox(height: 8),
              Row(
                children: [
                  Expanded(child: _numberField(_calories, '熱量 kcal')),
                  const SizedBox(width: 8),
                  Expanded(child: _numberField(_protein, '蛋白質 g')),
                ],
              ),
              Row(
                children: [
                  Expanded(child: _numberField(_fat, '脂肪 g')),
                  const SizedBox(width: 8),
                  Expanded(child: _numberField(_carbs, '碳水 g')),
                ],
              ),
              CheckboxListTile(
                contentPadding: EdgeInsets.zero,
                value: _favorite,
                onChanged: (value) =>
                    setState(() => _favorite = value ?? false),
                title: const Text('加入常用'),
                controlAffinity: ListTileControlAffinity.leading,
              ),
              _imageRow(),
              SizedBox(
                width: double.infinity,
                child: FilledButton.icon(
                  onPressed: _saving ? null : _save,
                  icon: const Icon(Icons.save),
                  label: Text(
                    _saving
                        ? '儲存中...'
                        : widget.editing == null
                        ? '新增食物'
                        : '儲存修改',
                  ),
                ),
              ),
              if (_error != null) ...[
                const SizedBox(height: 8),
                Text(_error!, style: TextStyle(color: context.palette.danger)),
              ],
            ],
          ],
        ),
      ),
    );
  }

  Map<String, String> _authHeaders() => ApiClient.instance.sessionCookie == null
      ? const {}
      : {'Cookie': ApiClient.instance.sessionCookie!};

  Widget _imageRow() {
    final editing = widget.editing;
    final hasExisting = editing != null && editing.hasImage && !_removeImage;
    final preview = _imageDataUrl != null
        ? Image.memory(
            base64Decode(_imageDataUrl!.split(',').last),
            width: 56,
            height: 56,
            fit: BoxFit.cover,
          )
        : hasExisting
        ? Image.network(
            SavedFoodService.imageUrl(editing.id),
            headers: _authHeaders(),
            width: 56,
            height: 56,
            fit: BoxFit.cover,
            errorBuilder: (_, _, _) => _noPhotoBox(),
          )
        : _noPhotoBox();
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 8),
      child: Wrap(
        spacing: 8,
        crossAxisAlignment: WrapCrossAlignment.center,
        children: [
          ClipRRect(borderRadius: BorderRadius.circular(8), child: preview),
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
              child: Text(
                '移除',
                style: TextStyle(color: context.palette.danger),
              ),
            ),
        ],
      ),
    );
  }

  Widget _noPhotoBox() => Container(
    width: 56,
    height: 56,
    color: context.palette.surface,
    alignment: Alignment.center,
    child: Text('無', style: TextStyle(color: context.palette.inkFaint)),
  );

  Widget _numberField(TextEditingController controller, String label) => _field(
    controller,
    label,
    keyboard: const TextInputType.numberWithOptions(decimal: true),
  );

  Widget _field(
    TextEditingController controller,
    String label, {
    TextInputType? keyboard,
  }) => Padding(
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
