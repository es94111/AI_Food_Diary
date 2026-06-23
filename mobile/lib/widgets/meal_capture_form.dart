import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';
import 'package:mobile_scanner/mobile_scanner.dart';

import '../models/models.dart';
import '../theme/app_theme.dart';
import '../services/api_client.dart';
import '../services/background_analysis.dart';
import '../services/meal_analysis_controller.dart';
import '../services/meal_service.dart';
import '../services/saved_food_service.dart';
import 'markdown_text.dart';

const mealTypes = {
  'BREAKFAST': '早餐',
  'LUNCH': '午餐',
  'DINNER': '晚餐',
  'SNACK': '點心',
};

/// 依目前時間挑「最近的餐期」：用各餐期的代表時間點，取時間距離最近者（跨午夜
/// 也算）。使用裝置本地時間，也就是使用者所在時區的當地時間。
String nearestMealType([DateTime? now]) {
  final t = now ?? DateTime.now();
  final minutes = t.hour * 60 + t.minute;
  const anchors = <(String, int)>[
    ('BREAKFAST', 7 * 60),
    ('LUNCH', 12 * 60),
    ('SNACK', 15 * 60),
    ('DINNER', 18 * 60),
    ('SNACK', 21 * 60 + 30),
  ];
  var best = anchors.first.$1;
  var bestDist = 1 << 30;
  for (final a in anchors) {
    final diff = (minutes - a.$2).abs();
    final dist = diff < 1440 - diff ? diff : 1440 - diff;
    if (dist < bestDist) {
      bestDist = dist;
      best = a.$1;
    }
  }
  return best;
}

const aiRatings = {
  'GOOD': '✅ 較推薦',
  'OK': '⚠️ 普通',
  'LIMIT': '❌ 建議少吃',
  'MANUAL': '✎ 手動',
};

/// Mutable, editable food row used by the form and confirm dialog.
class EditableItem {
  String? barcode;
  String name;
  String estimatedAmount;
  String calories;
  String protein;
  String fat;
  String carbs;
  String aiRating;

  EditableItem({
    this.barcode,
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
    calories: fmtNum(f.calories),
    protein: f.protein.toString(),
    fat: f.fat.toString(),
    carbs: f.carbs.toString(),
    aiRating: f.aiRating,
  );

  bool get hasName => name.trim().isNotEmpty;

  MealItem toMealItem() => MealItem(
    name: name.trim(),
    estimatedAmount: estimatedAmount.trim().isEmpty
        ? '手動輸入'
        : estimatedAmount.trim(),
    calories: double.tryParse(calories.trim()) ?? 0,
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

/// The three ways to log a meal, mirroring the web form's tabbed selector.
/// Only the active mode's input is shown and submitted.
enum CaptureMode { photo, describe, manual }

const _captureModeLabels = {
  CaptureMode.photo: '📷 拍照',
  CaptureMode.describe: '✍️ 描述',
  CaptureMode.manual: '⌨️ 手動',
};

/// Mirrors the web form's MAX_MEAL_IMAGES / nutrition-label cap: one batch of a
/// meal (different dishes or angles) is analysed together.
const _maxImages = 5;

const _productBarcodeFormats = [
  BarcodeFormat.ean13,
  BarcodeFormat.ean8,
  BarcodeFormat.upcA,
  BarcodeFormat.upcE,
  BarcodeFormat.code128,
];

class _MealCaptureFormState extends State<MealCaptureForm> {
  final _picker = ImagePicker();
  String _mealType = nearestMealType();
  CaptureMode _mode = CaptureMode.photo;
  bool _preciseMode = false;
  final List<String> _imageDataUrls = [];
  // Photos pulled from picked saved foods, saved as meal photos (not analysed).
  // Saved foods (with photos) picked into the meal; their image is attached to
  // the meal by reference on save instead of being copied.
  final List<String> _pickedFoodIds = [];
  final _descriptionCtrl = TextEditingController();
  final List<EditableItem> _manualItems = [EditableItem()];
  List<SavedFood> _savedFoods = [];
  bool _labelLoading = false;
  bool _barcodeLoading = false;
  bool _adviceLoading = false;
  String? _error;
  String? _pendingBarcode;
  late String _advice = widget.initialAdvice;
  bool _adviceExpanded = true;

  // The shared, navigation-surviving AI analysis. The form observes it so the
  // "AI 分析中 / 已完成" banner and the confirm sheet work even if the user
  // switched tabs while the analysis was running.
  final _analysis = MealAnalysisController.instance;
  bool _reviewing = false;

  @override
  void initState() {
    super.initState();
    _loadSavedFoods();
    _analysis.addListener(_onAnalysisChanged);
  }

  @override
  void dispose() {
    _analysis.removeListener(_onAnalysisChanged);
    _descriptionCtrl.dispose();
    super.dispose();
  }

  /// Rebuilds for the status banner, and opens the confirm sheet when the user
  /// has asked to review a finished analysis (via this form's button or the
  /// global "查看" SnackBar action on another tab).
  void _onAnalysisChanged() {
    if (!mounted) return;
    setState(() {});
    if (_analysis.isDone && _analysis.reviewRequested && !_reviewing) {
      _analysis.clearReview();
      _openReview();
    }
  }

  Future<void> _loadSavedFoods() async {
    final foods = await SavedFoodService.list();
    if (mounted) setState(() => _savedFoods = foods);
  }

  /// Picks one (camera) or several (gallery) images and returns their data URLs,
  /// honouring [room] remaining slots and the 6MB per-image cap. Surfaces a note
  /// when some files were skipped, mirroring the web form's batch validation.
  Future<List<String>> _pickImageDataUrls(ImageSource source, int room) async {
    if (room <= 0) {
      setState(() => _error = '最多上傳 $_maxImages 張圖片。');
      return [];
    }
    final List<XFile> files = source == ImageSource.gallery
        ? await _picker.pickMultiImage(maxWidth: 1600, imageQuality: 80)
        : await _picker
              .pickImage(source: source, maxWidth: 1600, imageQuality: 80)
              .then((f) => f == null ? <XFile>[] : [f]);
    if (files.isEmpty) return [];

    final messages = <String>[];
    if (files.length > room) messages.add('最多上傳 $_maxImages 張圖片。');
    var skippedSize = false;
    final urls = <String>[];
    for (final file in files) {
      if (urls.length >= room) break;
      final bytes = await file.readAsBytes();
      if (bytes.length > 6 * 1024 * 1024) {
        skippedSize = true;
        continue;
      }
      final mime = file.name.toLowerCase().endsWith('.png')
          ? 'image/png'
          : 'image/jpeg';
      urls.add('data:$mime;base64,${base64Encode(bytes)}');
    }
    if (skippedSize) messages.add('部分圖片超過 6MB 已略過。');
    if (messages.isNotEmpty) setState(() => _error = messages.join(' '));
    return urls;
  }

  Future<void> _chooseMealImages(ImageSource source) async {
    setState(() => _error = null);
    final urls = await _pickImageDataUrls(
      source,
      _maxImages - _imageDataUrls.length,
    );
    if (urls.isNotEmpty) setState(() => _imageDataUrls.addAll(urls));
  }

  Future<void> _scanNutritionLabel(ImageSource source) async {
    setState(() {
      _error = null;
      _labelLoading = true;
    });
    try {
      final urls = await _pickImageDataUrls(source, _maxImages);
      if (urls.isEmpty) return;
      final items = await MealService.analyzeNutritionLabel(urls);
      if (items.isEmpty) {
        if (mounted) setState(() => _error = 'AI 沒有辨識到營養標示內容，請換一張更清楚的圖片。');
        return;
      }
      final analyzedItems = items.map(EditableItem.fromAnalysis).toList();
      final barcode = _pendingBarcode;
      if (barcode != null && analyzedItems.isNotEmpty) {
        analyzedItems.first.barcode = barcode;
        final item = analyzedItems.first.toMealItem();
        await SavedFoodService.create(
          barcode: barcode,
          name: item.name,
          estimatedAmount: item.estimatedAmount,
          calories: item.calories,
          protein: item.protein,
          fat: item.fat,
          carbs: item.carbs,
          source: 'NUTRITION_LABEL',
          isFavorite: true,
        );
        await _loadSavedFoods();
      }
      if (!mounted) return;
      setState(() {
        _manualItems.removeWhere((e) => !e.hasName);
        _manualItems.addAll(analyzedItems);
        _pendingBarcode = null;
        _labelLoading = false;
      });
      final confirmed = await _showConfirmDialog(analyzedItems);
      if (confirmed == true) await _afterSave();
    } catch (e) {
      if (mounted) setState(() => _error = e.toString());
    } finally {
      if (mounted) setState(() => _labelLoading = false);
    }
  }

  Future<void> _submit() async {
    setState(() => _error = null);
    // Each mode submits its own input only, matching the web form: leftover
    // input from another tab never leaks into the analysis.
    final desc = _descriptionCtrl.text.trim();
    final manual = _manualItems.where((e) => e.hasName).toList();
    switch (_mode) {
      case CaptureMode.photo:
        if (_imageDataUrls.isEmpty) {
          setState(() => _error = '請先拍照或上傳餐點圖片。');
          return;
        }
      case CaptureMode.describe:
        if (desc.isEmpty) {
          setState(() => _error = '請先用文字描述你吃了什麼。');
          return;
        }
      case CaptureMode.manual:
        if (manual.isEmpty) {
          setState(() => _error = '請至少填寫一項食物名稱。');
          return;
        }
    }
    if (_analysis.isRunning) return; // one analysis at a time
    // Snapshot the inputs so the analysis is self-contained: the user can edit
    // or clear the form (or switch tabs) while it runs in the background.
    final mealType = _mealType;
    final mode = _mode;
    final images = List<String>.of(_imageDataUrls);
    // Photos from picked saved foods are attached by reference on save (not
    // analysed, not re-uploaded).
    final pickedFoodIds = List<String>.of(_pickedFoodIds);
    final manualItems = manual.map((e) => e.toMealItem()).toList();
    final precise = _preciseMode;
    setState(() => _error = null);
    // Fire and forget — the controller owns the analysis. Navigating away (or
    // even backgrounding/killing the app on Android) no longer drops the result.
    if (BackgroundAnalysis.supported) {
      // Android: run it in a WorkManager background isolate that survives the
      // app being minimised/killed and notifies on completion.
      final eatenAt = DateTime.now().toUtc().toIso8601String();
      final body = switch (mode) {
        CaptureMode.photo => <String, dynamic>{
            'mealType': mealType,
            'imageDataUrls': images,
            'precise': precise,
            'eatenAt': eatenAt,
          },
        CaptureMode.describe => <String, dynamic>{
            'mealType': mealType,
            'description': desc,
            'eatenAt': eatenAt,
          },
        CaptureMode.manual => <String, dynamic>{
            'mealType': mealType,
            'manualItems': manualItems.map((e) => e.toPayload()).toList(),
            'eatenAt': eatenAt,
          },
      };
      _analysis.startBackground(
        mealType: mealType,
        mode: mode.name,
        imageDataUrls: images,
        savedFoodImageIds: pickedFoodIds,
        description: desc,
        body: body,
      );
    } else {
      _analysis.start(
        mealType: mealType,
        mode: mode.name,
        imageDataUrls: images,
        savedFoodImageIds: pickedFoodIds,
        description: desc,
        run: () => switch (mode) {
          CaptureMode.photo =>
            MealService.analyzeImage(mealType, images, precise: precise),
          CaptureMode.describe =>
            MealService.analyzeDescription(mealType, desc),
          CaptureMode.manual => MealService.analyzeManual(mealType, manualItems),
        },
      );
    }
  }

  /// Opens the confirm/edit sheet for a finished background analysis, then saves
  /// using the captured analysis context (not the live form, which may have
  /// changed). Clears everything on a successful save.
  Future<void> _openReview() async {
    if (_reviewing || !_analysis.isDone) return;
    _reviewing = true;
    try {
      final confirmed = await _showConfirmDialog(
        _analysis.result.map(EditableItem.fromAnalysis).toList(),
      );
      if (confirmed == true) {
        _analysis.reset();
        await _afterSave();
      }
    } finally {
      _reviewing = false;
    }
  }

  /// Status banner for the background analysis: a live "分析中" hint, a "完成 →
  /// 查看結果" call to action, or the error with a retry.
  Widget _analysisBanner() {
    final p = context.palette;
    if (_analysis.isRunning) {
      return Container(
        width: double.infinity,
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(
          color: p.amberSurface,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: p.amberBorder),
        ),
        child: Row(
          children: [
            const SizedBox(
              height: 16,
              width: 16,
              child: CircularProgressIndicator(strokeWidth: 2),
            ),
            const SizedBox(width: 10),
            Expanded(
              child: Text('AI 正在分析這餐，完成後會通知你。可先切到其他分頁。',
                  style: TextStyle(fontSize: 12, color: p.amberInk)),
            ),
          ],
        ),
      );
    }
    if (_analysis.isError) {
      return Container(
        width: double.infinity,
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(
          color: p.dangerSurface,
          borderRadius: BorderRadius.circular(12),
        ),
        child: Row(
          children: [
            Expanded(
              child: Text('分析失敗：${_analysis.error ?? ''}',
                  style: TextStyle(fontSize: 12, color: p.dangerInk)),
            ),
            TextButton(
              onPressed: () => _analysis.reset(),
              child: const Text('關閉'),
            ),
          ],
        ),
      );
    }
    // done
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: p.successSurface,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: p.success.withValues(alpha: 0.4)),
      ),
      child: Row(
        children: [
          Expanded(
            child: Text('✅ AI 分析完成，點右側確認並儲存。',
                style: TextStyle(fontSize: 12, color: p.successInk)),
          ),
          FilledButton.tonal(
            onPressed: _reviewing ? null : _openReview,
            child: const Text('查看結果'),
          ),
        ],
      ),
    );
  }

  Future<bool?> _showConfirmDialog(List<EditableItem> items) {
    // Use the context captured when the analysis started (held in the
    // controller), not the live form — the user may have changed the form while
    // the analysis ran in the background.
    final mealType = _analysis.mealType;
    final mode = _analysis.mode; // 'photo' | 'describe' | 'manual'
    final images = _analysis.imageDataUrls;
    final pickedFoodIds = _analysis.savedFoodImageIds;
    final desc = _analysis.description.trim();
    return showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      showDragHandle: true,
      builder: (ctx) => _ConfirmSheet(
        items: items,
        // Includes meal photos and any photos from picked saved foods.
        imageDataUrls: List.of(images),
        onReestimate: (editedItems) async {
          final analyzed = await MealService.reestimate(
            mealType,
            editedItems.map((e) => e.toMealItem()).toList(),
          );
          return analyzed.map(EditableItem.fromAnalysis).toList();
        },
        onSave: (confirmedItems) async {
          final saveItems = confirmedItems.map((e) => e.toMealItem()).toList();
          // Nutrition is mirrored into Health Connect later, during the
          // "健康同步" flow (HealthService.syncNow), not at save time.
          await MealService.createMeal(
            mealType: mealType,
            imageDataUrls: images.isNotEmpty ? images : null,
            savedFoodImageIds: pickedFoodIds.isNotEmpty ? pickedFoodIds : null,
            description: mode == 'describe' && desc.isNotEmpty ? desc : null,
            items: saveItems,
          );
        },
      ),
    );
  }

  Future<void> _afterSave() async {
    setState(() {
      _imageDataUrls.clear();
      _pickedFoodIds.clear();
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
      barcode: item.barcode,
      name: mi.name,
      estimatedAmount: item.estimatedAmount.trim().isEmpty
          ? '1 份'
          : item.estimatedAmount.trim(),
      calories: mi.calories,
      protein: mi.protein,
      fat: mi.fat,
      carbs: mi.carbs,
      source: 'MEAL_ITEM',
      isFavorite: true,
      // Reuse the current meal photo as the food photo when saving from a photo meal.
      imageDataUrl: _imageDataUrls.isNotEmpty ? _imageDataUrls.first : null,
    );
    await _loadSavedFoods();
  }

  void _addSavedFood(SavedFood food, {bool markUsed = true}) {
    setState(() {
      _manualItems.removeWhere((e) => !e.hasName);
      _manualItems.add(
        EditableItem(
          barcode: food.barcode,
          name: food.name,
          estimatedAmount: food.estimatedAmount,
          calories: fmtNum(food.calories),
          protein: food.protein.toString(),
          fat: food.fat.toString(),
          carbs: food.carbs.toString(),
        ),
      );
    });
    // If the food has a photo, attach it to the meal by reference on save (the
    // meal points at the same stored object, not a re-uploaded copy).
    if (food.hasImage &&
        !_pickedFoodIds.contains(food.id) &&
        _pickedFoodIds.length + _imageDataUrls.length < _maxImages) {
      setState(() => _pickedFoodIds.add(food.id));
    }
    if (markUsed) {
      SavedFoodService.markUsed(food.id).then((_) => _loadSavedFoods());
    }
  }

  Future<void> _handleProductBarcode(String code) async {
    final food = await SavedFoodService.findByBarcode(code);
    if (food != null) {
      _addSavedFood(food, markUsed: false);
      return;
    }
    setState(() {
      _pendingBarcode = code;
      _error = '尚未紀錄此條碼。請上傳營養標示，系統會把辨識結果綁定到這個條碼，下次掃描即可帶入。';
    });
  }

  Future<void> _scanProductBarcode() async {
    setState(() {
      _barcodeLoading = true;
      _error = null;
    });
    try {
      final barcode = await Navigator.of(context).push<String>(
        MaterialPageRoute(
          builder: (_) => const _BarcodeScannerPage(),
          settings: const RouteSettings(name: '/barcode-scanner'),
          fullscreenDialog: true,
        ),
      );
      if (barcode == null || barcode.trim().isEmpty) return;
      await _handleProductBarcode(barcode.trim());
    } catch (e) {
      setState(() => _error = e.toString());
    } finally {
      if (mounted) setState(() => _barcodeLoading = false);
    }
  }

  Future<void> _scanProductBarcodeFromImage() async {
    setState(() {
      _barcodeLoading = true;
      _error = null;
    });
    final controller = MobileScannerController(formats: _productBarcodeFormats);
    try {
      final image = await _picker.pickImage(source: ImageSource.gallery);
      if (image == null) return;
      final capture = await controller.analyzeImage(
        image.path,
        formats: _productBarcodeFormats,
      );
      final code = capture?.barcodes
          .map((barcode) => barcode.rawValue?.trim())
          .whereType<String>()
          .where((value) => value.isNotEmpty)
          .firstOrNull;
      if (code == null) {
        setState(() => _error = '圖片中沒有讀到產品條碼，請換一張更清楚、條碼完整的圖片。');
        return;
      }
      await _handleProductBarcode(code);
    } catch (e) {
      setState(() => _error = '圖片條碼讀取失敗：$e');
    } finally {
      controller.dispose();
      if (mounted) setState(() => _barcodeLoading = false);
    }
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
    final p = context.palette;
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text(
              '新增餐點',
              style: TextStyle(fontSize: 20, fontWeight: FontWeight.w900),
            ),
            const SizedBox(height: 4),
            Text(
              '選擇一種方式記錄餐點，AI 會先估算營養數據供你確認。',
              style: TextStyle(fontSize: 12, color: p.inkSoft),
            ),
            const SizedBox(height: 12),
            DropdownButtonFormField<String>(
              initialValue: _mealType,
              decoration: const InputDecoration(
                labelText: '餐別',
                border: OutlineInputBorder(),
              ),
              items: mealTypes.entries
                  .map(
                    (e) => DropdownMenuItem(value: e.key, child: Text(e.value)),
                  )
                  .toList(),
              onChanged: (v) => setState(() => _mealType = v ?? 'LUNCH'),
            ),
            const SizedBox(height: 12),
            _modeTabs(),
            const SizedBox(height: 12),
            if (_mode == CaptureMode.photo) ...[
              _imageSection(),
              _preciseModeTile(),
            ],
            if (_mode == CaptureMode.describe) _describeSection(),
            if (_mode == CaptureMode.manual) ...[
              _savedFoodsSection(),
              const SizedBox(height: 12),
              _manualSection(),
            ],
            if (_error != null) ...[
              const SizedBox(height: 10),
              Text(_error!, style: TextStyle(color: p.danger)),
            ],
            if (_analysis.isRunning || _analysis.isDone || _analysis.isError) ...[
              const SizedBox(height: 12),
              _analysisBanner(),
            ],
            const SizedBox(height: 12),
            SizedBox(
              width: double.infinity,
              child: FilledButton(
                onPressed: _analysis.isRunning ? null : _submit,
                style: FilledButton.styleFrom(
                  padding: const EdgeInsets.symmetric(vertical: 14),
                ),
                child: _analysis.isRunning
                    ? Row(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          SizedBox(
                            height: 20,
                            width: 20,
                            child: CircularProgressIndicator(
                              strokeWidth: 2,
                              color: p.onBrand,
                            ),
                          ),
                          const SizedBox(width: 10),
                          const Text('AI 分析中（可切換分頁）'),
                        ],
                      )
                    : const Text('AI 分析並確認'),
              ),
            ),
            const SizedBox(height: 6),
            Text(
              'AI 分析為估算值，請依實際份量修正。分析會在背景執行，切換分頁也不會中斷。',
              style: TextStyle(fontSize: 11, color: p.inkFaint),
            ),
            if (widget.showAdvice && _adviceLoading)
              Padding(
                padding: const EdgeInsets.only(top: 12),
                child: Text(
                  '正在產生下一餐建議...',
                  style: TextStyle(color: p.amberAccent),
                ),
              ),
            if (widget.showAdvice && _advice.isNotEmpty) _adviceCard(),
          ],
        ),
      ),
    );
  }

  /// Segmented control to pick one of the three capture modes, mirroring the
  /// web form's pill tabs.
  Widget _modeTabs() {
    final p = context.palette;
    return Container(
      padding: const EdgeInsets.all(4),
      decoration: BoxDecoration(
        color: p.surfaceAlt,
        borderRadius: BorderRadius.circular(999),
      ),
      child: Row(
        children: CaptureMode.values.map((mode) {
          final selected = _mode == mode;
          return Expanded(
            child: GestureDetector(
              onTap: () => setState(() {
                _mode = mode;
                _error = null;
              }),
              child: Container(
                padding: const EdgeInsets.symmetric(vertical: 10),
                alignment: Alignment.center,
                decoration: BoxDecoration(
                  color: selected ? p.brand : Colors.transparent,
                  borderRadius: BorderRadius.circular(999),
                ),
                child: Text(
                  _captureModeLabels[mode]!,
                  style: TextStyle(
                    fontSize: 13,
                    fontWeight: FontWeight.w600,
                    color: selected ? p.onBrand : p.inkSoft,
                  ),
                ),
              ),
            ),
          );
        }).toList(),
      ),
    );
  }

  /// Photo-mode option: multiple recognitions, take the median (matches web).
  Widget _preciseModeTile() {
    final p = context.palette;
    return Container(
      margin: const EdgeInsets.only(top: 12),
      decoration: BoxDecoration(
        color: p.amberSurface,
        borderRadius: BorderRadius.circular(12),
      ),
      child: CheckboxListTile(
        value: _preciseMode,
        onChanged: (v) => setState(() => _preciseMode = v ?? false),
        controlAffinity: ListTileControlAffinity.leading,
        dense: true,
        activeColor: p.brand,
        contentPadding: const EdgeInsets.symmetric(horizontal: 8),
        title: Text(
          '精準模式',
          style: TextStyle(
            fontWeight: FontWeight.bold,
            color: p.amberInkSoft,
          ),
        ),
        subtitle: Text(
          '多次辨識取中位數，熱量更穩定（分析較慢、用量約 3 倍）。',
          style: TextStyle(fontSize: 11, color: p.amberAccent),
        ),
      ),
    );
  }

  Widget _describeSection() {
    final p = context.palette;
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: p.amberSurface,
        borderRadius: BorderRadius.circular(16),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            '用文字描述餐點',
            style: TextStyle(
              fontWeight: FontWeight.bold,
              color: p.amberInkSoft,
            ),
          ),
          const SizedBox(height: 4),
          Text(
            '例如：午餐吃一碗滷肉飯、一顆滷蛋、半碗青菜和無糖豆漿。',
            style: TextStyle(fontSize: 11, color: p.amberAccent),
          ),
          const SizedBox(height: 8),
          TextField(
            controller: _descriptionCtrl,
            maxLines: 3,
            maxLength: 1200,
            onChanged: (_) => setState(() {}),
            decoration: InputDecoration(
              hintText: '描述你吃了什麼、份量大概多少...',
              border: const OutlineInputBorder(),
              filled: true,
              fillColor: p.surface,
            ),
          ),
        ],
      ),
    );
  }

  Widget _imageSection() {
    final p = context.palette;
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        border: Border.all(color: p.amberBorder),
        borderRadius: BorderRadius.circular(16),
        color: p.amberSurface,
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text('從圖片上傳食物', style: TextStyle(fontWeight: FontWeight.bold)),
          const SizedBox(height: 4),
          Text(
            '可一次拍照或上傳多張餐點照片（最多 $_maxImages 張），AI 會綜合所有照片辨識食物、估算營養並產生評分。',
            style: TextStyle(fontSize: 11, color: p.inkSoft),
          ),
          if (_imageDataUrls.isNotEmpty) ...[
            const SizedBox(height: 10),
            _imageGrid(),
          ],
          const SizedBox(height: 8),
          Row(
            children: [
              Expanded(
                child: OutlinedButton.icon(
                  onPressed: _imageDataUrls.length >= _maxImages
                      ? null
                      : () => _imageSourceSheet(_chooseMealImages),
                  icon: const Icon(Icons.add_a_photo),
                  label: Text(_imageDataUrls.isEmpty ? '選擇圖片' : '新增圖片'),
                ),
              ),
              if (_imageDataUrls.isNotEmpty) ...[
                const SizedBox(width: 8),
                TextButton(
                  onPressed: () => setState(() => _imageDataUrls.clear()),
                  child: const Text('全部移除'),
                ),
              ],
            ],
          ),
        ],
      ),
    );
  }

  /// Thumbnail grid of the picked meal photos, each with a remove button.
  Widget _imageGrid() {
    return Wrap(
      spacing: 8,
      runSpacing: 8,
      children: _imageDataUrls.asMap().entries.map((entry) {
        return Stack(
          children: [
            ClipRRect(
              borderRadius: BorderRadius.circular(12),
              child: Image.memory(
                base64Decode(entry.value.split(',').last),
                height: 96,
                width: 96,
                fit: BoxFit.cover,
              ),
            ),
            Positioned(
              top: 2,
              right: 2,
              child: GestureDetector(
                onTap: () => setState(() => _imageDataUrls.removeAt(entry.key)),
                child: Container(
                  padding: const EdgeInsets.all(2),
                  decoration: const BoxDecoration(
                    color: Colors.black54,
                    shape: BoxShape.circle,
                  ),
                  child: const Icon(Icons.close, size: 16, color: Colors.white),
                ),
              ),
            ),
          ],
        );
      }).toList(),
    );
  }

  Widget _savedFoodsSection() {
    final p = context.palette;
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: p.surface,
        border: Border.all(color: p.hairline),
        borderRadius: BorderRadius.circular(16),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text('常用食物', style: TextStyle(fontWeight: FontWeight.bold)),
          const SizedBox(height: 8),
          if (_savedFoods.isEmpty)
            Text(
              '尚無常用食物，可在下方食物列按「存常用」新增。',
              style: TextStyle(fontSize: 12, color: p.inkSoft),
            )
          else
            Wrap(
              spacing: 6,
              runSpacing: 6,
              children: _savedFoods
                  .map(
                    (f) => InputChip(
                      avatar: f.hasImage
                          ? CircleAvatar(
                              backgroundImage: NetworkImage(
                                SavedFoodService.imageUrl(f.id),
                                headers: ApiClient.instance.sessionCookie != null
                                    ? {'Cookie': ApiClient.instance.sessionCookie!}
                                    : null,
                              ),
                            )
                          : null,
                      label: Text('${f.name} · ${fmtNum(f.calories)}kcal'),
                      onPressed: () => _addSavedFood(f),
                      onDeleted: () async {
                        await SavedFoodService.delete(f.id);
                        await _loadSavedFoods();
                      },
                      deleteIcon: const Icon(Icons.archive_outlined),
                    ),
                  )
                  .toList(),
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
        const Text('手動新增食物', style: TextStyle(fontWeight: FontWeight.bold)),
        const SizedBox(height: 8),
        Wrap(
          spacing: 8,
          runSpacing: 8,
          children: [
            OutlinedButton.icon(
              onPressed: _barcodeLoading ? null : _scanProductBarcode,
              icon: _barcodeLoading
                  ? const SizedBox(
                      height: 16,
                      width: 16,
                      child: CircularProgressIndicator(strokeWidth: 2),
                    )
                  : const Icon(Icons.qr_code_scanner),
              label: Text(_barcodeLoading ? '查詢中...' : '掃描產品條碼'),
            ),
            OutlinedButton.icon(
              onPressed: _barcodeLoading ? null : _scanProductBarcodeFromImage,
              icon: const Icon(Icons.image_search),
              label: const Text('上傳條碼圖片'),
            ),
          ],
        ),
        if (_pendingBarcode != null) ...[
          const SizedBox(height: 6),
          Text(
            '待綁定條碼：$_pendingBarcode',
            style: TextStyle(fontSize: 12, color: context.palette.amberAccent),
          ),
        ],
        const SizedBox(height: 8),
        OutlinedButton.icon(
          onPressed: _labelLoading
              ? null
              : () => _imageSourceSheet(_scanNutritionLabel),
          icon: _labelLoading
              ? const SizedBox(
                  height: 16,
                  width: 16,
                  child: CircularProgressIndicator(strokeWidth: 2),
                )
              : const Icon(Icons.document_scanner),
          label: Text(_labelLoading ? '辨識中...' : '上傳營養標示'),
        ),
        const SizedBox(height: 8),
        ..._manualItems.asMap().entries.map(
          (entry) => _manualItemEditor(
            entry.value,
            entry.key,
            onSaveCommon: () => _saveAsSavedFood(entry.value),
            onDelete: _manualItems.length == 1
                ? null
                : () => setState(() => _manualItems.removeAt(entry.key)),
          ),
        ),
        const SizedBox(height: 6),
        OutlinedButton.icon(
          onPressed: () => setState(() => _manualItems.add(EditableItem())),
          icon: const Icon(Icons.add),
          label: const Text('新增另一項食物'),
        ),
      ],
    );
  }

  Widget _manualItemEditor(
    EditableItem item,
    int index, {
    VoidCallback? onSaveCommon,
    VoidCallback? onDelete,
  }) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: ItemEditor(
        // Keyed by item identity so the text fields rebuild with the fresh
        // values when picking a 常用食物 (or a label scan) swaps in new objects.
        key: ObjectKey(item),
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
                child: Text('刪除',
                    style: TextStyle(color: context.palette.danger)),
              ),
          ],
        ),
      ),
    );
  }

  Widget _adviceCard() {
    final p = context.palette;
    return Container(
      margin: const EdgeInsets.only(top: 14),
      width: double.infinity,
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: p.amberSurface,
        borderRadius: BorderRadius.circular(16),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          InkWell(
            onTap: () => setState(() => _adviceExpanded = !_adviceExpanded),
            child: Row(
              children: [
                Expanded(
                  child: Text(
                    '下一餐建議',
                    style: TextStyle(
                      fontWeight: FontWeight.w900,
                      color: p.amberInk,
                    ),
                  ),
                ),
                Icon(
                  _adviceExpanded ? Icons.expand_less : Icons.expand_more,
                  color: p.amberInk,
                ),
              ],
            ),
          ),
          if (_adviceExpanded) ...[
            const SizedBox(height: 2),
            Text(
              '此建議會保留到今天結束；新增下一餐後會自動更新。',
              style: TextStyle(fontSize: 11, color: p.amberAccent),
            ),
            const SizedBox(height: 6),
            _adviceContent(p),
          ],
        ],
      ),
    );
  }

  /// Parses the stored advice string as the structured next-meal JSON. Returns
  /// null for older plain-text answers or a custom prompt override so the caller
  /// can fall back to Markdown prose instead of ever showing raw JSON.
  Map<String, dynamic>? _parseAdvice() {
    var text = _advice.trim();
    if (text.isEmpty) return null;
    final fence = RegExp(r'^```(?:json)?\s*([\s\S]*?)\s*```$', caseSensitive: false)
        .firstMatch(text);
    if (fence != null) text = fence.group(1)!.trim();
    if (!text.startsWith('{')) return null;
    try {
      final parsed = jsonDecode(text);
      if (parsed is Map<String, dynamic> &&
          (parsed.containsKey('suggestedMeal') ||
              parsed.containsKey('remainingCalories') ||
              parsed.containsKey('avoid'))) {
        return parsed;
      }
    } catch (_) {
      return null;
    }
    return null;
  }

  Widget _macroChip(AppPalette p, String label, dynamic value, String unit) {
    if (value is! num) return const SizedBox.shrink();
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(
        color: p.amberBorder.withValues(alpha: 0.35),
        borderRadius: BorderRadius.circular(999),
      ),
      child: Text(
        '$label ${value.round()}$unit',
        style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: p.amberInk),
      ),
    );
  }

  Widget _adviceContent(AppPalette p) {
    final data = _parseAdvice();
    if (data == null) {
      return MarkdownText(_advice, style: TextStyle(color: p.amberInkSoft));
    }

    final children = <Widget>[];

    final remaining = data['remainingCalories'];
    if (remaining is num) {
      children.add(Container(
        width: double.infinity,
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
        decoration: BoxDecoration(
          color: p.amberBorder.withValues(alpha: 0.3),
          borderRadius: BorderRadius.circular(12),
        ),
        child: Text(
          remaining < 0
              ? '今日已超標 ${remaining.abs().round()} kcal'
              : '今日剩餘可攝取 ${remaining.round()} kcal',
          style: TextStyle(fontWeight: FontWeight.w700, color: p.amberInk),
        ),
      ));
    }

    final meal = data['suggestedMeal'];
    if (meal is Map) {
      final mealChildren = <Widget>[];
      final name = meal['name'];
      if (name is String && name.isNotEmpty) {
        mealChildren.add(Text(name,
            style: TextStyle(fontWeight: FontWeight.w900, color: p.amberInk)));
      }
      final items = meal['items'];
      if (items is List && items.isNotEmpty) {
        mealChildren.add(const SizedBox(height: 4));
        for (final item in items) {
          mealChildren.add(Padding(
            padding: const EdgeInsets.only(top: 2),
            child: Text('• $item', style: TextStyle(fontSize: 13, color: p.amberInkSoft)),
          ));
        }
      }
      final chips = <Widget>[
        _macroChip(p, '熱量', meal['calories'], ' kcal'),
        _macroChip(p, '蛋白', meal['protein'], 'g'),
        _macroChip(p, '脂肪', meal['fat'], 'g'),
        _macroChip(p, '碳水', meal['carbs'], 'g'),
      ].where((w) => w is! SizedBox).toList();
      if (chips.isNotEmpty) {
        mealChildren.add(const SizedBox(height: 8));
        mealChildren.add(Wrap(spacing: 6, runSpacing: 6, children: chips));
      }
      final reason = meal['reason'];
      if (reason is String && reason.isNotEmpty) {
        mealChildren.add(const SizedBox(height: 8));
        mealChildren.add(Text(reason, style: TextStyle(fontSize: 13, color: p.amberInkSoft)));
      }
      if (mealChildren.isNotEmpty) {
        children.add(const SizedBox(height: 10));
        children.add(Container(
          width: double.infinity,
          padding: const EdgeInsets.all(12),
          decoration: BoxDecoration(
            color: p.surface.withValues(alpha: 0.6),
            borderRadius: BorderRadius.circular(12),
          ),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: mealChildren),
        ));
      }
    }

    final avoid = data['avoid'];
    if (avoid is List && avoid.isNotEmpty) {
      final avoidChildren = <Widget>[
        Text('建議避免', style: TextStyle(fontWeight: FontWeight.w700, color: p.amberInk)),
      ];
      for (final entry in avoid) {
        if (entry is! Map) continue;
        final item = entry['item'];
        if (item is! String || item.isEmpty) continue;
        final reason = entry['reason'];
        avoidChildren.add(Padding(
          padding: const EdgeInsets.only(top: 4),
          child: RichText(
            text: TextSpan(
              style: TextStyle(fontSize: 13, color: p.amberInkSoft),
              children: [
                TextSpan(text: item, style: const TextStyle(fontWeight: FontWeight.w700)),
                if (reason is String && reason.isNotEmpty) TextSpan(text: '：$reason'),
              ],
            ),
          ),
        ));
      }
      if (avoidChildren.length > 1) {
        children.add(const SizedBox(height: 10));
        children.add(Column(crossAxisAlignment: CrossAxisAlignment.start, children: avoidChildren));
      }
    }

    final notes = data['notes'];
    if (notes is String && notes.isNotEmpty) {
      children.add(const SizedBox(height: 10));
      children.add(Text(notes, style: TextStyle(fontSize: 11, color: p.amberAccent)));
    }

    if (children.isEmpty) {
      return MarkdownText(_advice, style: TextStyle(color: p.amberInkSoft));
    }

    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: children);
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
    final p = context.palette;
    return Container(
      padding: const EdgeInsets.all(10),
      decoration: BoxDecoration(
        color: p.surfaceAlt,
        borderRadius: BorderRadius.circular(12),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Text(
                '食物 ${index + 1}',
                style: const TextStyle(fontWeight: FontWeight.bold),
              ),
              const Spacer(),
              ?trailing,
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
                  .map(
                    (e) => DropdownMenuItem(value: e.key, child: Text(e.value)),
                  )
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
                }),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: _numField('蛋白質 g', item.protein, (v) {
                  item.protein = v;
                  onChanged();
                }),
              ),
            ],
          ),
          Row(
            children: [
              Expanded(
                child: _numField('脂肪 g', item.fat, (v) {
                  item.fat = v;
                  onChanged();
                }),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: _numField('碳水 g', item.carbs, (v) {
                  item.carbs = v;
                  onChanged();
                }),
              ),
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
    required this.imageDataUrls,
    required this.onSave,
    required this.onReestimate,
  });

  final List<EditableItem> items;
  final List<String> imageDataUrls;
  final Future<void> Function(List<EditableItem>) onSave;
  final Future<List<EditableItem>> Function(List<EditableItem>) onReestimate;

  @override
  State<_ConfirmSheet> createState() => _ConfirmSheetState();
}

class _ConfirmSheetState extends State<_ConfirmSheet> {
  late final List<EditableItem> _items = List.of(widget.items);
  bool _saving = false;
  bool _reanalyzing = false;
  String? _error;

  // Re-run AI on the edited items, replacing the list with the fresh estimate.
  Future<void> _reestimate() async {
    final valid = _items.where((e) => e.hasName).toList();
    if (valid.isEmpty) {
      setState(() => _error = '請先填寫至少一項食物名稱再重新辨識。');
      return;
    }
    setState(() {
      _reanalyzing = true;
      _error = null;
    });
    try {
      final result = await widget.onReestimate(valid);
      if (mounted) {
        setState(() {
          _items
            ..clear()
            ..addAll(result);
        });
      }
    } catch (e) {
      setState(() => _error = e.toString());
    } finally {
      if (mounted) setState(() => _reanalyzing = false);
    }
  }

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
      builder: (ctx, scrollController) {
        final p = ctx.palette;
        return Padding(
        padding: EdgeInsets.only(
          left: 16,
          right: 16,
          bottom: MediaQuery.of(context).viewInsets.bottom + 16,
        ),
        child: ListView(
          controller: scrollController,
          children: [
            const Text(
              '確認 AI 分析品項',
              style: TextStyle(fontSize: 20, fontWeight: FontWeight.w900),
            ),
            const SizedBox(height: 4),
            Text(
              '請確認食物是否正確，可先修正、刪除或新增後再儲存。',
              style: TextStyle(fontSize: 12, color: p.inkSoft),
            ),
            if (widget.imageDataUrls.isNotEmpty) ...[
              const SizedBox(height: 12),
              Wrap(
                spacing: 8,
                runSpacing: 8,
                children: widget.imageDataUrls
                    .map(
                      (url) => ClipRRect(
                        borderRadius: BorderRadius.circular(12),
                        child: Image.memory(
                          base64Decode(url.split(',').last),
                          height: 96,
                          width: 96,
                          fit: BoxFit.cover,
                        ),
                      ),
                    )
                    .toList(),
              ),
            ],
            const SizedBox(height: 12),
            ..._items.asMap().entries.map(
              (entry) => Padding(
                padding: const EdgeInsets.only(bottom: 10),
                child: ItemEditor(
                  // Keyed by item identity so the text fields rebuild with the
                  // fresh values after a re-estimate swaps in new objects.
                  key: ObjectKey(entry.value),
                  item: entry.value,
                  index: entry.key,
                  onChanged: () => setState(() {}),
                  trailing: _items.length == 1
                      ? null
                      : TextButton(
                          onPressed: () =>
                              setState(() => _items.removeAt(entry.key)),
                          child: Text(
                            '刪除',
                            style: TextStyle(color: p.danger),
                          ),
                        ),
                ),
              ),
            ),
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
            OutlinedButton.icon(
              onPressed: _saving || _reanalyzing ? null : _reestimate,
              style: OutlinedButton.styleFrom(
                padding: const EdgeInsets.symmetric(vertical: 14),
              ),
              icon: _reanalyzing
                  ? const SizedBox(
                      height: 16,
                      width: 16,
                      child: CircularProgressIndicator(strokeWidth: 2),
                    )
                  : const Icon(Icons.refresh),
              label: Text(_reanalyzing ? '重新辨識中...' : '依修改重新 AI 辨識'),
            ),
            const SizedBox(height: 4),
            Text(
              '修改食物名稱或份量後，可讓 AI 依修正內容重新估算熱量與營養素。',
              style: TextStyle(fontSize: 11, color: p.inkFaint),
            ),
            const SizedBox(height: 8),
            FilledButton(
              onPressed: _saving || _reanalyzing ? null : _save,
              style: FilledButton.styleFrom(
                padding: const EdgeInsets.symmetric(vertical: 14),
              ),
              child: _saving
                  ? SizedBox(
                      height: 20,
                      width: 20,
                      child: CircularProgressIndicator(
                        strokeWidth: 2,
                        color: p.onBrand,
                      ),
                    )
                  : const Text('確認並儲存餐點'),
            ),
            const SizedBox(height: 8),
          ],
        ),
      );
      },
    );
  }
}

class _BarcodeScannerPage extends StatefulWidget {
  const _BarcodeScannerPage();

  @override
  State<_BarcodeScannerPage> createState() => _BarcodeScannerPageState();
}

class _BarcodeScannerPageState extends State<_BarcodeScannerPage> {
  final _controller = MobileScannerController(formats: _productBarcodeFormats);
  bool _handled = false;

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  void _onDetect(BarcodeCapture capture) {
    if (_handled) return;
    final code = capture.barcodes
        .map((barcode) => barcode.rawValue?.trim())
        .whereType<String>()
        .where((value) => value.isNotEmpty)
        .firstOrNull;
    if (code == null) return;
    _handled = true;
    Navigator.of(context).pop(code);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('掃描產品條碼')),
      body: Stack(
        children: [
          MobileScanner(controller: _controller, onDetect: _onDetect),
          Center(
            child: Container(
              width: 260,
              height: 140,
              decoration: BoxDecoration(
                border: Border.all(color: Colors.white, width: 3),
                borderRadius: BorderRadius.circular(16),
              ),
            ),
          ),
          const Positioned(
            left: 16,
            right: 16,
            bottom: 32,
            child: DecoratedBox(
              decoration: BoxDecoration(
                color: Colors.black54,
                borderRadius: BorderRadius.all(Radius.circular(16)),
              ),
              child: Padding(
                padding: EdgeInsets.all(12),
                child: Text(
                  '將產品條碼對準框線。若第一次掃描未命中，回到手動紀錄上傳營養標示即可建立紀錄。',
                  textAlign: TextAlign.center,
                  style: TextStyle(color: Colors.white),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}
