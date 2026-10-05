import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';

import '../models/models.dart';
import '../services/api_client.dart';
import '../services/meal_bundle_service.dart';
import '../services/saved_food_service.dart';
import '../theme/app_theme.dart';

class MealBundlesScreen extends StatefulWidget {
  const MealBundlesScreen({super.key});

  @override
  State<MealBundlesScreen> createState() => _MealBundlesScreenState();
}

class _MealBundlesScreenState extends State<MealBundlesScreen> {
  List<MealBundle> _bundles = [];
  bool _loading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final bundles = await MealBundleService.list();
      if (mounted) setState(() => _bundles = bundles);
    } catch (error) {
      if (mounted) setState(() => _error = error.toString());
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _edit([MealBundle? bundle]) async {
    final saved = await Navigator.of(context).push<MealBundle>(
      MaterialPageRoute(
        builder: (_) => MealBundleEditorScreen(bundle: bundle),
        settings: RouteSettings(name: bundle == null ? '/meal-bundles/new' : '/meal-bundles/${bundle.id}/edit'),
      ),
    );
    if (saved == null || !mounted) return;
    setState(() {
      _bundles = [saved, ..._bundles.where((entry) => entry.id != saved.id)];
    });
  }

  Future<void> _delete(MealBundle bundle) async {
    final confirm = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('刪除餐組'),
        content: Text('確定刪除「${bundle.name}」嗎？'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('取消')),
          FilledButton(onPressed: () => Navigator.pop(context, true), child: const Text('刪除')),
        ],
      ),
    );
    if (confirm != true) return;
    try {
      await MealBundleService.delete(bundle.id);
      if (mounted) setState(() => _bundles.removeWhere((entry) => entry.id == bundle.id));
    } catch (error) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(error.toString())));
    }
  }

  @override
  Widget build(BuildContext context) {
    final p = context.palette;
    final headers = ApiClient.instance.sessionCookie != null
        ? {'Cookie': ApiClient.instance.sessionCookie!}
        : <String, String>{};
    return Scaffold(
      appBar: AppBar(title: const Text('我的餐組')),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: () => _edit(),
        icon: const Icon(Icons.add),
        label: const Text('新增餐組'),
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : RefreshIndicator(
              onRefresh: _load,
              child: ListView(
                padding: const EdgeInsets.fromLTRB(16, 8, 16, 96),
                children: [
                  Text('將常吃的食物存成一組，記錄時可一次加入並繼續修改。', style: TextStyle(color: p.inkSoft)),
                  if (_error != null) ...[
                    const SizedBox(height: 12),
                    Text(_error!, style: TextStyle(color: p.danger)),
                  ],
                  if (_bundles.isEmpty && _error == null)
                    const Padding(
                      padding: EdgeInsets.symmetric(vertical: 32),
                      child: Center(child: Text('尚未建立餐組。')),
                    ),
                  const SizedBox(height: 12),
                  ..._bundles.map((bundle) => Card(
                    margin: const EdgeInsets.only(bottom: 10),
                    child: ListTile(
                      leading: bundle.hasImage
                          ? ClipRRect(
                              borderRadius: BorderRadius.circular(10),
                              child: Image.network(
                                MealBundleService.imageUrl(bundle.id),
                                headers: headers,
                                width: 52,
                                height: 52,
                                fit: BoxFit.cover,
                                errorBuilder: (_, __, ___) => const Icon(Icons.restaurant),
                              ),
                            )
                          : const CircleAvatar(child: Icon(Icons.restaurant_menu)),
                      title: Text(bundle.name, style: const TextStyle(fontWeight: FontWeight.bold)),
                      subtitle: Text('${bundle.items.length} 項 · ${fmtNum(bundle.items.fold<double>(0, (sum, item) => sum + item.calories))} kcal\n${bundle.items.map((item) => item.name).join('、')}', maxLines: 2, overflow: TextOverflow.ellipsis),
                      isThreeLine: true,
                      trailing: PopupMenuButton<String>(
                        onSelected: (action) => action == 'edit' ? _edit(bundle) : _delete(bundle),
                        itemBuilder: (_) => const [
                          PopupMenuItem(value: 'edit', child: Text('編輯')),
                          PopupMenuItem(value: 'delete', child: Text('刪除')),
                        ],
                      ),
                      onTap: () => _edit(bundle),
                    ),
                  )),
                ],
              ),
            ),
    );
  }
}

class MealBundleEditorScreen extends StatefulWidget {
  const MealBundleEditorScreen({super.key, this.bundle});

  final MealBundle? bundle;

  @override
  State<MealBundleEditorScreen> createState() => _MealBundleEditorScreenState();
}

class _MealBundleEditorScreenState extends State<MealBundleEditorScreen> {
  final _picker = ImagePicker();
  final _name = TextEditingController();
  final List<_BundleItemDraft> _items = [];
  List<SavedFood> _foods = [];
  String? _imageDataUrl;
  bool _removeImage = false;
  bool _loadingFoods = true;
  bool _saving = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    _name.text = widget.bundle?.name ?? '';
    _items.addAll(widget.bundle?.items.map(_BundleItemDraft.fromItem) ?? [_BundleItemDraft()]);
    _loadFoods();
  }

  Future<void> _loadFoods() async {
    try {
      _foods = await SavedFoodService.list();
    } catch (_) {}
    if (mounted) setState(() => _loadingFoods = false);
  }

  Future<void> _pickPhoto() async {
    final file = await _picker.pickImage(source: ImageSource.gallery, maxWidth: 1600, imageQuality: 80);
    if (file == null) return;
    final bytes = await file.readAsBytes();
    if (bytes.length > 6 * 1024 * 1024) {
      setState(() => _error = '圖片超過 6 MB，請選擇較小的圖片。');
      return;
    }
    final mime = file.name.toLowerCase().endsWith('.png') ? 'image/png' : 'image/jpeg';
    setState(() {
      _imageDataUrl = 'data:$mime;base64,${base64Encode(bytes)}';
      _removeImage = false;
      _error = null;
    });
  }

  void _selectFood(_BundleItemDraft item, String? id) {
    final food = _foods.where((entry) => entry.id == id).firstOrNull;
    if (food == null) {
      item.savedFoodId = null;
    } else {
      item.savedFoodId = food.id;
      item.name.text = food.name;
      item.amount.text = food.estimatedAmount;
      item.calories.text = fmtNum(food.calories);
      item.protein.text = food.protein.toString();
      item.fat.text = food.fat.toString();
      item.carbs.text = food.carbs.toString();
    }
    setState(() {});
  }

  Future<void> _save() async {
    final items = _items.where((item) => item.name.text.trim().isNotEmpty).map((item) => item.toItem()).toList();
    if (_name.text.trim().isEmpty || items.isEmpty) {
      setState(() => _error = '請輸入餐組名稱，並至少加入一項食物。');
      return;
    }
    setState(() {
      _saving = true;
      _error = null;
    });
    try {
      final saved = widget.bundle == null
          ? await MealBundleService.create(name: _name.text.trim(), items: items, imageDataUrl: _imageDataUrl)
          : await MealBundleService.update(
              widget.bundle!.id,
              name: _name.text.trim(),
              items: items,
              imageDataUrl: _imageDataUrl,
              removeImage: _removeImage,
            );
      if (mounted) Navigator.pop(context, saved);
    } catch (error) {
      if (mounted) setState(() => _error = error.toString());
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  void dispose() {
    _name.dispose();
    for (final item in _items) {
      item.dispose();
    }
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final p = context.palette;
    final headers = ApiClient.instance.sessionCookie != null
        ? {'Cookie': ApiClient.instance.sessionCookie!}
        : <String, String>{};
    final bundle = widget.bundle;
    final showExistingImage = bundle?.hasImage == true && !_removeImage && _imageDataUrl == null;
    return Scaffold(
      appBar: AppBar(title: Text(bundle == null ? '新增餐組' : '編輯餐組')),
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            TextField(controller: _name, maxLength: 120, decoration: const InputDecoration(labelText: '餐組名稱', border: OutlineInputBorder())),
            const SizedBox(height: 12),
            Card(
              child: Padding(
                padding: const EdgeInsets.all(12),
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  const Text('照片（選填）', style: TextStyle(fontWeight: FontWeight.bold)),
                  const SizedBox(height: 8),
                  if (_imageDataUrl != null)
                    Image.memory(base64Decode(_imageDataUrl!.split(',').last), height: 150, width: double.infinity, fit: BoxFit.cover)
                  else if (showExistingImage)
                    Image.network(MealBundleService.imageUrl(bundle!.id), headers: headers, height: 150, width: double.infinity, fit: BoxFit.cover,
                      errorBuilder: (_, __, ___) => const SizedBox(height: 80, child: Center(child: Icon(Icons.broken_image_outlined))))
                  else
                    Text('尚未選擇照片', style: TextStyle(color: p.inkSoft)),
                  const SizedBox(height: 8),
                  Wrap(spacing: 8, children: [
                    OutlinedButton.icon(onPressed: _pickPhoto, icon: const Icon(Icons.photo_library_outlined), label: const Text('選擇照片')),
                    if (_imageDataUrl != null || showExistingImage)
                      TextButton(onPressed: () => setState(() { _imageDataUrl = null; _removeImage = bundle?.hasImage == true; }), child: const Text('移除照片')),
                  ]),
                ]),
              ),
            ),
            const SizedBox(height: 12),
            const Text('食物項目', style: TextStyle(fontSize: 17, fontWeight: FontWeight.bold)),
            if (_loadingFoods) const LinearProgressIndicator(),
            const SizedBox(height: 8),
            ..._items.asMap().entries.map((entry) => _itemCard(entry.key, entry.value)),
            OutlinedButton.icon(
              onPressed: () => setState(() => _items.add(_BundleItemDraft())),
              icon: const Icon(Icons.add),
              label: const Text('新增食物項目'),
            ),
            if (_error != null) ...[
              const SizedBox(height: 8),
              Text(_error!, style: TextStyle(color: p.danger)),
            ],
            const SizedBox(height: 80),
          ],
        ),
      ),
      bottomNavigationBar: SafeArea(
        top: false,
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: FilledButton(
            onPressed: _saving ? null : _save,
            child: _saving ? const CircularProgressIndicator() : const Text('儲存餐組'),
          ),
        ),
      ),
    );
  }

  Widget _itemCard(int index, _BundleItemDraft item) {
    final p = context.palette;
    return Card(
      margin: const EdgeInsets.only(bottom: 10),
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Row(children: [
            Expanded(child: Text('項目 ${index + 1}', style: const TextStyle(fontWeight: FontWeight.bold))),
            IconButton(
              tooltip: '移除項目',
              onPressed: _items.length <= 1 ? null : () => setState(() { _items.removeAt(index).dispose(); }),
              icon: Icon(Icons.delete_outline, color: p.danger),
            ),
          ]),
          DropdownButtonFormField<String>(
            initialValue: _foods.any((food) => food.id == item.savedFoodId) ? item.savedFoodId! : '',
            decoration: const InputDecoration(labelText: '選擇我的食物（選填）', border: OutlineInputBorder()),
            items: [
              const DropdownMenuItem(value: '', child: Text('自訂食物')),
              ..._foods.map((food) => DropdownMenuItem(value: food.id, child: Text(food.name, overflow: TextOverflow.ellipsis))),
            ],
            onChanged: (id) => _selectFood(item, id == null || id.isEmpty ? null : id),
          ),
          const SizedBox(height: 8),
          TextField(controller: item.name, maxLength: 120, decoration: const InputDecoration(labelText: '名稱', counterText: '')),
          TextField(controller: item.amount, maxLength: 120, decoration: const InputDecoration(labelText: '份量', counterText: '')),
          const SizedBox(height: 8),
          Row(children: [
            Expanded(child: TextField(controller: item.calories, keyboardType: const TextInputType.numberWithOptions(decimal: true), decoration: const InputDecoration(labelText: '熱量 kcal'))),
            const SizedBox(width: 8),
            Expanded(child: TextField(controller: item.protein, keyboardType: const TextInputType.numberWithOptions(decimal: true), decoration: const InputDecoration(labelText: '蛋白質 g'))),
          ]),
          Row(children: [
            Expanded(child: TextField(controller: item.fat, keyboardType: const TextInputType.numberWithOptions(decimal: true), decoration: const InputDecoration(labelText: '脂肪 g'))),
            const SizedBox(width: 8),
            Expanded(child: TextField(controller: item.carbs, keyboardType: const TextInputType.numberWithOptions(decimal: true), decoration: const InputDecoration(labelText: '碳水 g'))),
          ]),
        ]),
      ),
    );
  }
}

class _BundleItemDraft {
  _BundleItemDraft({
    this.savedFoodId,
    String name = '',
    String amount = '',
    String calories = '0',
    String protein = '0',
    String fat = '0',
    String carbs = '0',
  }) : name = TextEditingController(text: name),
       amount = TextEditingController(text: amount),
       calories = TextEditingController(text: calories),
       protein = TextEditingController(text: protein),
       fat = TextEditingController(text: fat),
       carbs = TextEditingController(text: carbs);

  factory _BundleItemDraft.fromItem(MealBundleItem item) => _BundleItemDraft(
    savedFoodId: item.savedFoodId,
    name: item.name,
    amount: item.estimatedAmount,
    calories: fmtNum(item.calories),
    protein: item.protein.toString(),
    fat: item.fat.toString(),
    carbs: item.carbs.toString(),
  );

  String? savedFoodId;
  final TextEditingController name;
  final TextEditingController amount;
  final TextEditingController calories;
  final TextEditingController protein;
  final TextEditingController fat;
  final TextEditingController carbs;

  MealBundleItem toItem() => MealBundleItem(
    savedFoodId: savedFoodId,
    name: name.text.trim(),
    estimatedAmount: amount.text.trim().isEmpty ? '未估算' : amount.text.trim(),
    calories: double.tryParse(calories.text) ?? 0,
    protein: double.tryParse(protein.text) ?? 0,
    fat: double.tryParse(fat.text) ?? 0,
    carbs: double.tryParse(carbs.text) ?? 0,
  );

  void dispose() {
    name.dispose();
    amount.dispose();
    calories.dispose();
    protein.dispose();
    fat.dispose();
    carbs.dispose();
  }
}
