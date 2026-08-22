import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:cached_network_image/cached_network_image.dart';
import 'package:image_picker/image_picker.dart';
import 'package:mobile_scanner/mobile_scanner.dart';

import '../models/models.dart';
import '../theme/app_theme.dart';
import '../services/background_analysis.dart';
import '../services/image_cache_service.dart';
import '../services/meal_analysis_controller.dart';
import '../services/meal_service.dart';
import '../services/saved_food_list_logic.dart';
import '../services/saved_food_service.dart';
import 'data_url_image.dart';
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

enum _SavedFoodConflictAction { use, update, restore, saveAsNew }

/// Mutable, editable food row used by the form and confirm dialog.
class EditableItem {
  String? savedFoodId;
  String? barcode;
  String name;
  String estimatedAmount;
  String calories;
  String protein;
  String fat;
  String carbs;
  String aiRating;

  EditableItem({
    this.savedFoodId,
    this.barcode,
    this.name = '',
    this.estimatedAmount = '',
    this.calories = '',
    this.protein = '',
    this.fat = '',
    this.carbs = '',
    this.aiRating = 'MANUAL',
  });

  factory EditableItem.fromAnalysis(
    FoodAnalysisItem f, {
    String? savedFoodId,
  }) => EditableItem(
    savedFoodId: savedFoodId,
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
    this.controller,
    this.initialAdvice = '',
    this.showAdvice = true,
    this.savedFoodsRevision = 0,
    this.initialMode = CaptureMode.photo,
    this.initialImageSource,
  });

  final Future<void> Function() onSaved;
  final MealCaptureController? controller;
  final String initialAdvice;

  /// The next-meal advice is for "today"; hide it when browsing other dates.
  final bool showAdvice;
  final int savedFoodsRevision;
  final CaptureMode initialMode;
  final ImageSource? initialImageSource;

  @override
  State<MealCaptureForm> createState() => _MealCaptureFormState();
}

class MealCaptureController {
  Object? _owner;
  Future<void> Function()? _openCameraAndAnalyze;

  Future<void> openCameraAndAnalyze() async {
    await _openCameraAndAnalyze?.call();
  }

  void _attach(Object owner, Future<void> Function() callback) {
    _owner = owner;
    _openCameraAndAnalyze = callback;
  }

  void _detach(Object owner) {
    if (_owner == owner) {
      _owner = null;
      _openCameraAndAnalyze = null;
    }
  }
}

/// The three ways to log a meal, mirroring the web form's tabbed selector.
/// Only the active mode's input is shown and submitted.
enum CaptureMode { photo, describe, manual }

const _captureModeLabels = {
  CaptureMode.photo: '拍照',
  CaptureMode.describe: '描述',
  CaptureMode.manual: '手動',
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
  late CaptureMode _mode;
  bool _preciseMode = false;
  final List<String> _imageDataUrls = [];
  // Photos pulled from picked saved foods, saved as meal photos (not analysed).
  // Saved foods (with photos) picked into the meal; their image is attached to
  // the meal by reference on save instead of being copied.
  final List<String> _pickedFoodIds = [];
  final _descriptionCtrl = TextEditingController();
  final _foodSearchCtrl = TextEditingController();
  final List<EditableItem> _manualItems = [EditableItem()];
  List<SavedFood> _savedFoods = [];
  bool _labelLoading = false;
  bool _barcodeLoading = false;
  bool _adviceLoading = false;
  String? _error;
  String? _pendingBarcode;
  final _brandCtrl = TextEditingController();
  final _brandItemNameCtrl = TextEditingController();
  bool _brandSearchLoading = false;
  String? _brandSearchError;
  // null = not searched yet; [] = searched, no candidates (FR-007).
  List<BrandSearchCandidate>? _brandCandidates;
  EditableItem? _brandDraft;
  bool _brandSaving = false;
  late String _advice = widget.initialAdvice;
  bool _adviceExpanded = true;

  // The shared, navigation-surviving AI analysis. The form observes it so the
  // "AI 分析中 / 已完成" banner and the review page work even if the user
  // switched tabs while the analysis was running.
  final _analysis = MealAnalysisController.instance;
  bool _reviewing = false;

  @override
  void initState() {
    super.initState();
    _mode = widget.initialMode;
    _loadSavedFoods();
    _analysis.addListener(_onAnalysisChanged);
    widget.controller?._attach(this, _openCameraAndAnalyze);
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      if (widget.initialImageSource != null) {
        _chooseMealImages(widget.initialImageSource!);
      }
      if (_analysis.isDone && _analysis.reviewRequested && !_reviewing) {
        _onAnalysisChanged();
      }
    });
  }

  @override
  void didUpdateWidget(covariant MealCaptureForm oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.controller != widget.controller) {
      oldWidget.controller?._detach(this);
      widget.controller?._attach(this, _openCameraAndAnalyze);
    }
    if (oldWidget.initialAdvice != widget.initialAdvice &&
        widget.initialAdvice.isNotEmpty &&
        _advice.isEmpty) {
      _advice = widget.initialAdvice;
    }
    if (oldWidget.savedFoodsRevision != widget.savedFoodsRevision) {
      _loadSavedFoods();
    }
  }

  @override
  void dispose() {
    widget.controller?._detach(this);
    _analysis.removeListener(_onAnalysisChanged);
    _descriptionCtrl.dispose();
    _foodSearchCtrl.dispose();
    _brandCtrl.dispose();
    _brandItemNameCtrl.dispose();
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
    List<SavedFood> foods;
    try {
      foods = await SavedFoodService.list();
    } catch (_) {
      // Quick-add suggestions are non-critical (e.g. an expired session); keep
      // whatever list is already showing instead of crashing the form.
      return;
    }
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
    if (!mounted || files.isEmpty) return [];

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
    if (mounted && messages.isNotEmpty) {
      setState(() => _error = messages.join(' '));
    }
    return urls;
  }

  Future<void> _chooseMealImages(ImageSource source) async {
    setState(() => _error = null);
    try {
      final urls = await _pickImageDataUrls(
        source,
        _maxImages - _imageDataUrls.length,
      );
      if (!mounted) return;
      if (urls.isNotEmpty) setState(() => _imageDataUrls.addAll(urls));
    } catch (e) {
      // e.g. PlatformException(camera_access_denied, ...) when the user denies
      // camera/gallery permission — surface it instead of crashing the form.
      if (mounted) setState(() => _error = '無法選擇圖片：$e');
    }
  }

  Future<void> _openCameraAndAnalyze() async {
    if (_analysis.isRunning) {
      setState(() => _error = 'AI 正在分析上一餐，完成後再拍下一餐。');
      return;
    }
    setState(() {
      _mode = CaptureMode.photo;
      _mealType = nearestMealType();
      _imageDataUrls.clear();
      _pickedFoodIds.clear();
      _descriptionCtrl.clear();
      _error = null;
    });
    try {
      final urls = await _pickImageDataUrls(ImageSource.camera, _maxImages);
      if (!mounted || urls.isEmpty) return;
      setState(() => _imageDataUrls.addAll(urls));
      await _submit();
    } catch (e) {
      if (mounted) setState(() => _error = '快速拍照失敗：$e');
    }
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
        final saved = await _createSavedFoodWithWarning(
          analyzedItems.first,
          source: 'NUTRITION_LABEL',
        );
        if (saved != null) {
          _applySavedFood(analyzedItems.first, saved);
          await _loadSavedFoods();
        }
      }
      if (!mounted) return;
      setState(() {
        _manualItems.removeWhere((e) => !e.hasName);
        _manualItems.addAll(analyzedItems);
        if (analyzedItems.first.savedFoodId != null) _pendingBarcode = null;
        _labelLoading = false;
      });
      final confirmed = await _showConfirmDialog(
        analyzedItems,
        mealTypeOverride: _mealType,
      );
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
    final savedFoodIds = mode == CaptureMode.manual
        ? manual.map((e) => e.savedFoodId).toList()
        : <String?>[];
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
        savedFoodIds: savedFoodIds,
        description: desc,
        body: body,
      );
    } else {
      _analysis.start(
        mealType: mealType,
        mode: mode.name,
        imageDataUrls: images,
        savedFoodImageIds: pickedFoodIds,
        savedFoodIds: savedFoodIds,
        description: desc,
        run: () => switch (mode) {
          CaptureMode.photo => MealService.analyzeImage(
            mealType,
            images,
            precise: precise,
          ),
          CaptureMode.describe => MealService.analyzeDescription(
            mealType,
            desc,
          ),
          CaptureMode.manual => MealService.analyzeManual(
            mealType,
            manualItems,
          ),
        },
      );
    }
  }

  /// Opens the full-screen confirm/edit page for a finished background analysis, then saves
  /// using the captured analysis context (not the live form, which may have
  /// changed). Clears everything on a successful save.
  Future<void> _openReview() async {
    if (_reviewing || !_analysis.isDone) return;
    _reviewing = true;
    try {
      final confirmed = await _showConfirmDialog(
        _analysis.result.asMap().entries.map((entry) {
          final savedFoodId = entry.key < _analysis.savedFoodIds.length
              ? _analysis.savedFoodIds[entry.key]
              : null;
          return EditableItem.fromAnalysis(
            entry.value,
            savedFoodId: savedFoodId,
          );
        }).toList(),
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
              child: Text(
                'AI 正在分析這餐，完成後會通知你。可先切到其他分頁。',
                style: TextStyle(fontSize: 12, color: p.amberInk),
              ),
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
              child: Text(
                '分析失敗：${_analysis.error ?? ''}',
                style: TextStyle(fontSize: 12, color: p.dangerInk),
              ),
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
            child: Text(
              'AI 分析完成，尚未儲存。請確認內容後再儲存。',
              style: TextStyle(fontSize: 12, color: p.successInk),
            ),
          ),
          FilledButton.tonal(
            onPressed: _reviewing ? null : _openReview,
            child: const Text('查看草稿'),
          ),
        ],
      ),
    );
  }

  Future<bool?> _showConfirmDialog(
    List<EditableItem> items, {
    String? mealTypeOverride,
  }) {
    // Use the context captured when the analysis started (held in the
    // controller), not the live form — the user may have changed the form while
    // the analysis ran in the background.
    final mealType = mealTypeOverride ?? _analysis.mealType;
    final mode = _analysis.mode; // 'photo' | 'describe' | 'manual'
    final images = _analysis.imageDataUrls;
    final pickedFoodIds = _analysis.savedFoodImageIds;
    final desc = _analysis.description.trim();
    return Navigator.of(context).push<bool>(
      MaterialPageRoute(
        fullscreenDialog: true,
        settings: const RouteSettings(name: '/capture/review'),
        builder: (_) => _ConfirmSheet(
        items: items,
        // Includes meal photos and any photos from picked saved foods.
        imageDataUrls: List.of(images),
        onReestimate: (editedItems) async {
          final analyzed = await MealService.reestimate(
            mealType,
            editedItems.map((e) => e.toMealItem()).toList(),
          );
          return analyzed.asMap().entries.map((entry) {
            final savedFoodId = entry.key < editedItems.length
                ? editedItems[entry.key].savedFoodId
                : null;
            return EditableItem.fromAnalysis(
              entry.value,
              savedFoodId: savedFoodId,
            );
          }).toList();
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
          final usedFoodIds = confirmedItems
              .map((item) => item.savedFoodId)
              .whereType<String>()
              .toSet();
          await Future.wait(
            usedFoodIds.map((id) async {
              try {
                await SavedFoodService.markUsed(id);
              } catch (_) {
                // The meal is already saved; usage ranking is best-effort only.
              }
            }),
          );
        },
        ),
      ),
    );
  }

  Future<void> _afterSave() async {
    // The background analysis can finish (and the user confirm the review
    // page) after they've navigated away from this screen, so this must not
    // assume the form is still mounted.
    if (!mounted) return;
    setState(() {
      _imageDataUrls.clear();
      _pickedFoodIds.clear();
      _descriptionCtrl.clear();
      _foodSearchCtrl.clear();
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
      setState(() => _error = '請先填寫食物名稱再存到我的食物。');
      return;
    }
    final saved = await _createSavedFoodWithWarning(
      item,
      source: 'MEAL_ITEM',
      imageDataUrl: _imageDataUrls.isNotEmpty ? _imageDataUrls.first : null,
    );
    if (saved == null) return;
    _applySavedFood(item, saved);
    await _loadSavedFoods();
  }

  void _applySavedFood(EditableItem item, SavedFood saved) {
    item
      ..savedFoodId = saved.id
      ..barcode = saved.barcode
      ..name = saved.name
      ..estimatedAmount = saved.estimatedAmount
      ..calories = fmtNum(saved.calories)
      ..protein = fmtNum(saved.protein)
      ..fat = fmtNum(saved.fat)
      ..carbs = fmtNum(saved.carbs);
  }

  bool get _brandDraftIncomplete {
    final draft = _brandDraft;
    if (draft == null) return true;
    return draft.calories.trim().isEmpty ||
        draft.protein.trim().isEmpty ||
        draft.fat.trim().isEmpty ||
        draft.carbs.trim().isEmpty;
  }

  void _resetBrandSearch() {
    setState(() {
      _brandCtrl.clear();
      _brandItemNameCtrl.clear();
      _brandSearchLoading = false;
      _brandSearchError = null;
      _brandCandidates = null;
      _brandDraft = null;
    });
  }

  void _selectBrandCandidate(BrandSearchCandidate candidate) {
    setState(() {
      _brandDraft = EditableItem(
        name: candidate.name,
        estimatedAmount: candidate.packageInfo ?? '',
        calories: candidate.calories == null ? '' : fmtNum(candidate.calories!),
        protein: candidate.protein == null ? '' : fmtNum(candidate.protein!),
        fat: candidate.fat == null ? '' : fmtNum(candidate.fat!),
        carbs: candidate.carbs == null ? '' : fmtNum(candidate.carbs!),
      );
    });
  }

  Future<void> _runBrandSearch() async {
    final brand = _brandCtrl.text.trim();
    final itemName = _brandItemNameCtrl.text.trim();
    if (brand.isEmpty || itemName.isEmpty) {
      setState(() => _brandSearchError = brand.isEmpty ? '請先填寫廠牌。' : '請先填寫品項名稱。');
      return;
    }
    setState(() {
      _brandSearchError = null;
      _brandSearchLoading = true;
      _brandCandidates = null;
      _brandDraft = null;
    });
    try {
      final candidates = await MealService.analyzeBrandSearch(brand, itemName);
      if (!mounted) return;
      setState(() => _brandCandidates = candidates);
      if (candidates.length == 1) _selectBrandCandidate(candidates.first);
    } catch (e) {
      if (mounted) setState(() => _brandSearchError = e.toString());
    } finally {
      if (mounted) setState(() => _brandSearchLoading = false);
    }
  }

  Future<void> _saveBrandSearchFood() async {
    final draft = _brandDraft;
    if (draft == null || _brandDraftIncomplete) return;
    if (!draft.hasName) {
      setState(() => _brandSearchError = '請填寫食物名稱。');
      return;
    }
    setState(() {
      _brandSaving = true;
      _brandSearchError = null;
      // Add to the meal being recorded now (like a nutrition-label scan does);
      // _applySavedFood below syncs it once the "我的食物" write completes.
      _manualItems.removeWhere((e) => !e.hasName);
      _manualItems.add(draft);
    });
    final saved = await _createSavedFoodWithWarning(
      draft,
      source: 'BRAND_SEARCH',
      brand: _brandCtrl.text.trim(),
    );
    if (saved != null) {
      _applySavedFood(draft, saved);
      await _loadSavedFoods();
    }
    if (!mounted) return;
    setState(() => _brandSaving = false);
    if (saved != null) _resetBrandSearch();
  }

  Future<SavedFood?> _createSavedFoodWithWarning(
    EditableItem item, {
    required String source,
    String? imageDataUrl,
    String? brand,
  }) async {
    final mealItem = item.toMealItem();
    Future<SavedFood> create(
      bool allowDuplicate, {
      bool clearBarcode = false,
    }) => SavedFoodService.create(
      barcode: clearBarcode ? null : item.barcode,
      name: mealItem.name,
      brand: brand,
      estimatedAmount: item.estimatedAmount.trim().isEmpty
          ? '1 份'
          : item.estimatedAmount.trim(),
      calories: mealItem.calories,
      protein: mealItem.protein,
      fat: mealItem.fat,
      carbs: mealItem.carbs,
      source: source,
      isFavorite: false,
      imageDataUrl: imageDataUrl,
      allowDuplicate: allowDuplicate,
    );

    try {
      return await create(false);
    } on DuplicateFoodException catch (error) {
      if (!mounted) return null;
      final match =
          error.exactBarcode ??
          (error.duplicates.isEmpty ? null : error.duplicates.first);
      final archived = match?.archived == true;
      final exact = error.exactBarcode != null;
      final action = await showDialog<_SavedFoodConflictAction>(
        context: context,
        builder: (context) => AlertDialog(
          title: Text(exact ? '條碼已存在' : '可能已有相同或相似食物'),
          content: Text(
            '${match?.food.name ?? ''}\n\n'
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
                onPressed: () =>
                    Navigator.pop(context, _SavedFoodConflictAction.use),
                child: const Text('使用'),
              ),
            if (match != null)
              TextButton(
                onPressed: () =>
                    Navigator.pop(context, _SavedFoodConflictAction.update),
                child: const Text('更新'),
              ),
            if (match != null && archived)
              TextButton(
                onPressed: () =>
                    Navigator.pop(context, _SavedFoodConflictAction.restore),
                child: const Text('還原'),
              ),
            FilledButton(
              onPressed: () =>
                  Navigator.pop(context, _SavedFoodConflictAction.saveAsNew),
              child: const Text('另存'),
            ),
          ],
        ),
      );
      if (action == null) return null;
      try {
        switch (action) {
          case _SavedFoodConflictAction.use:
            return match?.food;
          case _SavedFoodConflictAction.update:
            if (match == null) return null;
            final updated = await SavedFoodService.update(
              match.food.id,
              barcode: (item.barcode?.trim().isEmpty ?? true)
                  ? match.food.barcode
                  : item.barcode,
              name: mealItem.name,
              brand: brand,
              estimatedAmount: item.estimatedAmount.trim().isEmpty
                  ? '1 份'
                  : item.estimatedAmount.trim(),
              calories: mealItem.calories,
              protein: mealItem.protein,
              fat: mealItem.fat,
              carbs: mealItem.carbs,
              isFavorite: match.food.isFavorite,
              imageDataUrl: imageDataUrl,
            );
            return match.archived
                ? await SavedFoodService.restore(updated.id)
                : updated;
          case _SavedFoodConflictAction.restore:
            return match == null
                ? null
                : await SavedFoodService.restore(match.food.id);
          case _SavedFoodConflictAction.saveAsNew:
            return await create(true, clearBarcode: exact);
        }
      } catch (retryError) {
        if (mounted) setState(() => _error = retryError.toString());
        return null;
      }
    } catch (error) {
      if (mounted) setState(() => _error = error.toString());
      return null;
    }
  }

  void _addSavedFood(SavedFood food) {
    setState(() {
      _manualItems.removeWhere((e) => !e.hasName);
      _manualItems.add(
        EditableItem(
          savedFoodId: food.id,
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
  }

  Future<void> _handleProductBarcode(String code) async {
    final food = await SavedFoodService.findByBarcode(code);
    if (food != null) {
      _addSavedFood(food);
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
              // 快速加入的圖片 chips 載入完成時只重繪這一區，不會連帶重繪
              // 整個表單（表單很長時，整份重繪是滑動卡頓的主因之一）。
              RepaintBoundary(child: _savedFoodsSection()),
              const SizedBox(height: 12),
              RepaintBoundary(child: _manualSection()),
            ],
            if (_error != null) ...[
              const SizedBox(height: 10),
              Text(_error!, style: TextStyle(color: p.danger)),
            ],
            if (_analysis.isRunning ||
                _analysis.isDone ||
                _analysis.isError) ...[
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
                    : const Text('開始分析'),
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
            if (widget.showAdvice && _advice.isNotEmpty)
              // 建議卡獨立重繪：Markdown 解析與重排不會連帶重繪整個表單。
              RepaintBoundary(child: _adviceCard()),
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
            child: Semantics(
              button: true,
              selected: selected,
              label: '記錄方式 ${_captureModeLabels[mode]}',
              child: Material(
                color: Colors.transparent,
                child: InkWell(
                  borderRadius: BorderRadius.circular(999),
                  onTap: () => setState(() {
                    _mode = mode;
                    _error = null;
                  }),
                  child: Container(
                    constraints: const BoxConstraints(minHeight: 48),
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
          style: TextStyle(fontWeight: FontWeight.bold, color: p.amberInkSoft),
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
              child: DataUrlImage(
                dataUrl: entry.value,
                height: 96,
                width: 96,
              ),
            ),
            Positioned(
              top: 0,
              right: 0,
              child: Semantics(
                button: true,
                label: '移除第 ${entry.key + 1} 張相片',
                child: Material(
                  color: Colors.black54,
                  shape: const CircleBorder(),
                  child: InkWell(
                    customBorder: const CircleBorder(),
                    onTap: () =>
                        setState(() => _imageDataUrls.removeAt(entry.key)),
                    child: const SizedBox(
                      width: 48,
                      height: 48,
                      child: Icon(Icons.close, size: 18, color: Colors.white),
                    ),
                  ),
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
    final search = _foodSearchCtrl.text;
    final hasSearch = search.trim().isNotEmpty;
    final searchResults = hasSearch
        ? visibleSavedFoods(
            foods: _savedFoods,
            tab: SavedFoodTab.all,
            sort: SavedFoodSort.recommended,
            search: search,
          ).take(20).toList()
        : const <SavedFood>[];
    final quickAdd = quickAddSavedFoods(_savedFoods);
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
          const Text('快速加入', style: TextStyle(fontWeight: FontWeight.bold)),
          const SizedBox(height: 8),
          if (_savedFoods.isNotEmpty) ...[
            TextField(
              controller: _foodSearchCtrl,
              onChanged: (_) => setState(() {}),
              decoration: InputDecoration(
                hintText: '搜尋食物名稱或條碼，快速加入',
                isDense: true,
                border: const OutlineInputBorder(),
                filled: true,
                fillColor: p.surface,
              ),
            ),
            const SizedBox(height: 8),
          ],
          if (hasSearch && searchResults.isEmpty)
            Text(
              '找不到符合「$search」的食物',
              style: TextStyle(fontSize: 12, color: p.inkSoft),
            )
          else if (hasSearch)
            _quickAddGroup('符合結果', searchResults)
          else if (quickAdd.favorites.isEmpty && quickAdd.recommendations.isEmpty)
            Text(
              '尚無可快速加入的食物，可在下方食物列存到我的食物。',
              style: TextStyle(fontSize: 12, color: p.inkSoft),
            )
          else ...[
            if (quickAdd.favorites.isNotEmpty)
              _quickAddGroup('常用', quickAdd.favorites),
            if (quickAdd.recommendations.isNotEmpty)
              _quickAddGroup('推薦', quickAdd.recommendations),
          ],
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
        _brandSearchSection(),
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

  Widget _brandSearchSection() {
    final p = context.palette;
    final canSearch =
        _brandCtrl.text.trim().isNotEmpty &&
        _brandItemNameCtrl.text.trim().isNotEmpty;
    final candidates = _brandCandidates;
    return Container(
      width: double.infinity,
      margin: const EdgeInsets.symmetric(vertical: 8),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: p.surfaceAlt,
        borderRadius: BorderRadius.circular(12),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text('品牌搜尋', style: TextStyle(fontWeight: FontWeight.bold)),
          const SizedBox(height: 4),
          Text(
            '分別輸入廠牌與品項名稱，AI 會搜尋公開營養標示並整理成候選供你確認。',
            style: TextStyle(fontSize: 12, color: p.inkSoft),
          ),
          const SizedBox(height: 8),
          TextField(
            controller: _brandCtrl,
            onChanged: (_) => setState(() {}),
            decoration: const InputDecoration(
              hintText: '廠牌，例如：光泉',
              isDense: true,
              border: OutlineInputBorder(),
            ),
          ),
          const SizedBox(height: 8),
          TextField(
            controller: _brandItemNameCtrl,
            onChanged: (_) => setState(() {}),
            decoration: const InputDecoration(
              hintText: '品項名稱，例如：保久乳',
              isDense: true,
              border: OutlineInputBorder(),
            ),
          ),
          const SizedBox(height: 8),
          SizedBox(
            width: double.infinity,
            child: FilledButton(
              onPressed: (!_brandSearchLoading && canSearch)
                  ? _runBrandSearch
                  : null,
              child: Text(_brandSearchLoading ? '搜尋中...' : '搜尋營養標示'),
            ),
          ),
          if (_brandSearchError != null) ...[
            const SizedBox(height: 8),
            Text(_brandSearchError!, style: TextStyle(color: p.danger)),
          ],
          if (candidates != null && candidates.isEmpty) ...[
            const SizedBox(height: 10),
            Container(
              width: double.infinity,
              padding: const EdgeInsets.all(10),
              decoration: BoxDecoration(
                color: p.surface,
                borderRadius: BorderRadius.circular(10),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text('查無符合的營養標示資料，可改用下列方式新增：'),
                  const SizedBox(height: 8),
                  Wrap(
                    spacing: 8,
                    children: [
                      OutlinedButton(
                        onPressed: _resetBrandSearch,
                        child: const Text('改用手動輸入'),
                      ),
                      OutlinedButton(
                        onPressed: () {
                          _resetBrandSearch();
                          setState(() => _mode = CaptureMode.photo);
                        },
                        child: const Text('改用拍照上傳'),
                      ),
                    ],
                  ),
                ],
              ),
            ),
          ],
          if (candidates != null && candidates.length > 1 && _brandDraft == null) ...[
            const SizedBox(height: 10),
            Text(
              '找到 ${candidates.length} 筆候選，請選擇正確的商品：',
              style: TextStyle(
                fontSize: 12,
                fontWeight: FontWeight.bold,
                color: p.amberAccent,
              ),
            ),
            const SizedBox(height: 6),
            ...candidates.map(
              (candidate) => Padding(
                padding: const EdgeInsets.only(bottom: 6),
                child: InkWell(
                  onTap: () => _selectBrandCandidate(candidate),
                  child: Container(
                    width: double.infinity,
                    padding: const EdgeInsets.all(10),
                    decoration: BoxDecoration(
                      color: p.surface,
                      borderRadius: BorderRadius.circular(10),
                    ),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          candidate.name,
                          style: const TextStyle(fontWeight: FontWeight.bold),
                        ),
                        Text(
                          candidate.packageInfo ?? '包裝規格未知',
                          style: TextStyle(fontSize: 12, color: p.inkSoft),
                        ),
                      ],
                    ),
                  ),
                ),
              ),
            ),
          ],
          if (_brandDraft != null) ...[
            const SizedBox(height: 10),
            Text(
              'AI 估算值，請確認或修改後送出',
              style: TextStyle(
                fontSize: 12,
                fontWeight: FontWeight.bold,
                color: p.amberAccent,
              ),
            ),
            const SizedBox(height: 6),
            ItemEditor(
              key: ObjectKey(_brandDraft),
              item: _brandDraft!,
              index: 0,
              showRating: false,
              onChanged: () => setState(() {}),
            ),
            const SizedBox(height: 6),
            Row(
              children: [
                if (candidates != null && candidates.length > 1)
                  TextButton(
                    onPressed: () => setState(() => _brandDraft = null),
                    child: const Text('重新選擇'),
                  ),
                const Spacer(),
                FilledButton(
                  onPressed: (!_brandSaving && !_brandDraftIncomplete)
                      ? _saveBrandSearchFood
                      : null,
                  child: Text(_brandSaving ? '儲存中...' : '確認並存入我的食物'),
                ),
              ],
            ),
          ],
        ],
      ),
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
        // 不要在每次打字時重建整個表單：欄位本身會維護自己的文字狀態，
        // item 也是在原地被修改，送出時直接讀取即可。每次都 setState 會連
        // 帶重建「快速加入」的圖片 chips 與建議卡，導致手動新增時嚴重卡頓。
        onChanged: () {},
        trailing: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            if (onSaveCommon != null)
              TextButton(onPressed: onSaveCommon, child: const Text('存到我的食物')),
            if (onDelete != null)
              TextButton(
                onPressed: onDelete,
                child: Text(
                  '刪除',
                  style: TextStyle(color: context.palette.danger),
                ),
              ),
          ],
        ),
      ),
    );
  }

  Widget _quickAddGroup(String label, List<SavedFood> foods) {
    final p = context.palette;
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(label, style: TextStyle(fontSize: 12, color: p.inkSoft)),
          const SizedBox(height: 4),
          Wrap(
            spacing: 6,
            runSpacing: 6,
            children: foods
                .map(
                  (food) => ActionChip(
                    // 只解碼「顯示大小 × 裝置像素密度」的解析度。常用食物的照
                    // 片是拍照原圖（可能 1600px 以上），縮圖只顯示約 40px，解
                    // 整張原圖是手動輸入畫面滑動卡頓的主因之一（與餐點照片
                    // 同樣的修法）。
                    avatar: food.hasImage
                        ? CircleAvatar(
                            backgroundImage: ResizeImage(
                              // 只下載伺服器端的縮圖（256px），不要抓整張原
                              // 圖。照片是拍照原圖（可能 1600px 以上），縮圖
                              // 只顯示約 40px，抓整張原圖是手動輸入畫面圖片
                              // 載入慢、滑動卡頓的主因之一。
                              CachedNetworkImageProvider(
                                SavedFoodService.imageUrl(
                                  food.id,
                                  width: SavedFoodService.thumbWidth,
                                ),
                                headers: ImageCacheService.authHeaders(),
                                cacheManager: FoodImageCacheManager.instance,
                              ),
                              width: (40 *
                                      MediaQuery.devicePixelRatioOf(context))
                                  .round(),
                              height: (40 *
                                      MediaQuery.devicePixelRatioOf(context))
                                  .round(),
                            ),
                          )
                        : null,
                    label: Text('${food.name} · ${fmtNum(food.calories)}kcal'),
                    onPressed: () => _addSavedFood(food),
                  ),
                )
                .toList(),
          ),
        ],
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
    final fence = RegExp(
      r'^```(?:json)?\s*([\s\S]*?)\s*```$',
      caseSensitive: false,
    ).firstMatch(text);
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
        style: TextStyle(
          fontSize: 12,
          fontWeight: FontWeight.w600,
          color: p.amberInk,
        ),
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
      children.add(
        Container(
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
        ),
      );
    }

    final meal = data['suggestedMeal'];
    if (meal is Map) {
      final mealChildren = <Widget>[];
      final name = meal['name'];
      if (name is String && name.isNotEmpty) {
        mealChildren.add(
          Text(
            name,
            style: TextStyle(fontWeight: FontWeight.w900, color: p.amberInk),
          ),
        );
      }
      final items = meal['items'];
      if (items is List && items.isNotEmpty) {
        mealChildren.add(const SizedBox(height: 4));
        for (final item in items) {
          mealChildren.add(
            Padding(
              padding: const EdgeInsets.only(top: 2),
              child: Text(
                '• $item',
                style: TextStyle(fontSize: 13, color: p.amberInkSoft),
              ),
            ),
          );
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
        mealChildren.add(
          Text(reason, style: TextStyle(fontSize: 13, color: p.amberInkSoft)),
        );
      }
      if (mealChildren.isNotEmpty) {
        children.add(const SizedBox(height: 10));
        children.add(
          Container(
            width: double.infinity,
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              color: p.surface.withValues(alpha: 0.6),
              borderRadius: BorderRadius.circular(12),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: mealChildren,
            ),
          ),
        );
      }
    }

    final avoid = data['avoid'];
    if (avoid is List && avoid.isNotEmpty) {
      final avoidChildren = <Widget>[
        Text(
          '建議避免',
          style: TextStyle(fontWeight: FontWeight.w700, color: p.amberInk),
        ),
      ];
      for (final entry in avoid) {
        if (entry is! Map) continue;
        final item = entry['item'];
        if (item is! String || item.isEmpty) continue;
        final reason = entry['reason'];
        avoidChildren.add(
          Padding(
            padding: const EdgeInsets.only(top: 4),
            child: RichText(
              text: TextSpan(
                style: TextStyle(fontSize: 13, color: p.amberInkSoft),
                children: [
                  TextSpan(
                    text: item,
                    style: const TextStyle(fontWeight: FontWeight.w700),
                  ),
                  if (reason is String && reason.isNotEmpty)
                    TextSpan(text: '：$reason'),
                ],
              ),
            ),
          ),
        );
      }
      if (avoidChildren.length > 1) {
        children.add(const SizedBox(height: 10));
        children.add(
          Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: avoidChildren,
          ),
        );
      }
    }

    final notes = data['notes'];
    if (notes is String && notes.isNotEmpty) {
      children.add(const SizedBox(height: 10));
      children.add(
        Text(notes, style: TextStyle(fontSize: 11, color: p.amberAccent)),
      );
    }

    if (children.isEmpty) {
      return MarkdownText(_advice, style: TextStyle(color: p.amberInkSoft));
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: children,
    );
  }
}

/// Reusable food row editor used in both the manual section and confirm sheet.
///
/// Callers key this widget with `ObjectKey(item)`, so a new [State] (and thus
/// fresh controllers) is only created when [item] itself is swapped for a
/// different object (e.g. picking a saved food). While the same item is being
/// typed into, the Element — and these controllers — persist across parent
/// rebuilds instead of re-reading `item`'s fields, so an unrelated rebuild
/// (image loading, the AI analysis banner, etc.) never stomps the user's
/// cursor position mid-keystroke.
class ItemEditor extends StatefulWidget {
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
  State<ItemEditor> createState() => _ItemEditorState();
}

class _ItemEditorState extends State<ItemEditor> {
  late final _nameCtrl = TextEditingController(text: widget.item.name)
    ..addListener(_onNameChanged);
  late final _amountCtrl =
      TextEditingController(text: widget.item.estimatedAmount)
        ..addListener(_onAmountChanged);
  late final _calCtrl = TextEditingController(text: widget.item.calories)
    ..addListener(_onCaloriesChanged);
  late final _proteinCtrl = TextEditingController(text: widget.item.protein)
    ..addListener(_onProteinChanged);
  late final _fatCtrl = TextEditingController(text: widget.item.fat)
    ..addListener(_onFatChanged);
  late final _carbsCtrl = TextEditingController(text: widget.item.carbs)
    ..addListener(_onCarbsChanged);

  void _onNameChanged() {
    widget.item.name = _nameCtrl.text;
    widget.onChanged();
  }

  void _onAmountChanged() {
    widget.item.estimatedAmount = _amountCtrl.text;
    widget.onChanged();
  }

  void _onCaloriesChanged() {
    widget.item.calories = _calCtrl.text;
    widget.onChanged();
  }

  void _onProteinChanged() {
    widget.item.protein = _proteinCtrl.text;
    widget.onChanged();
  }

  void _onFatChanged() {
    widget.item.fat = _fatCtrl.text;
    widget.onChanged();
  }

  void _onCarbsChanged() {
    widget.item.carbs = _carbsCtrl.text;
    widget.onChanged();
  }

  @override
  void dispose() {
    _nameCtrl.dispose();
    _amountCtrl.dispose();
    _calCtrl.dispose();
    _proteinCtrl.dispose();
    _fatCtrl.dispose();
    _carbsCtrl.dispose();
    super.dispose();
  }

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
                '食物 ${widget.index + 1}',
                style: const TextStyle(fontWeight: FontWeight.bold),
              ),
              const Spacer(),
              ?widget.trailing,
            ],
          ),
          _field('食物名稱', _nameCtrl),
          _field('份量，例如：150g', _amountCtrl),
          if (widget.showRating)
            Padding(
              padding: const EdgeInsets.only(top: 8),
              child: Row(
                children: [
                  Icon(
                    widget.item.aiRating == 'MANUAL'
                        ? Icons.edit_outlined
                        : Icons.auto_awesome_outlined,
                    size: 16,
                    color: p.amberInk,
                  ),
                  const SizedBox(width: 6),
                  Text(
                    widget.item.aiRating == 'MANUAL'
                        ? '手動輸入'
                        : 'AI 估算・待確認',
                    style: TextStyle(
                      fontSize: 12,
                      fontWeight: FontWeight.w700,
                      color: p.amberInk,
                    ),
                  ),
                ],
              ),
            ),
          Row(
            children: [
              Expanded(child: _numField('熱量 kcal', _calCtrl)),
              const SizedBox(width: 8),
              Expanded(child: _numField('蛋白質 g', _proteinCtrl)),
            ],
          ),
          Row(
            children: [
              Expanded(child: _numField('脂肪 g', _fatCtrl)),
              const SizedBox(width: 8),
              Expanded(child: _numField('碳水 g', _carbsCtrl)),
            ],
          ),
        ],
      ),
    );
  }

  Widget _field(String hint, TextEditingController controller) {
    return Padding(
      padding: const EdgeInsets.only(top: 6),
      child: TextFormField(
        controller: controller,
        decoration: InputDecoration(hintText: hint, isDense: true),
      ),
    );
  }

  Widget _numField(String hint, TextEditingController controller) {
    return Padding(
      padding: const EdgeInsets.only(top: 6),
      child: TextFormField(
        controller: controller,
        keyboardType: const TextInputType.numberWithOptions(decimal: true),
        decoration: InputDecoration(hintText: hint, isDense: true),
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
    final p = context.palette;
    return Scaffold(
      appBar: AppBar(
        title: const Text('AI 估算・待確認'),
        leading: IconButton(
          tooltip: '返回',
          icon: const Icon(Icons.arrow_back),
          onPressed: _saving ? null : () => Navigator.of(context).maybePop(),
        ),
      ),
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 16),
          child: ListView(
            padding: const EdgeInsets.only(bottom: 24),
            children: [
              const Text(
                'AI 估算・待確認',
                style: TextStyle(fontSize: 20, fontWeight: FontWeight.w900),
              ),
              const SizedBox(height: 4),
              Text(
                'AI 已完成初步估算。請檢查食物與份量，再確認並儲存這份紀錄。',
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
                          child: DataUrlImage(
                            dataUrl: url,
                            height: 96,
                            width: 96,
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
                    // 同手動輸入區：不要每次打字都重建整個確認頁，欄位狀態
                    // 由 TextFormField 自己維護，item 原地修改即可。
                    onChanged: () {},
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
                label: Text(_reanalyzing ? '重新分析中...' : '重新分析'),
              ),
              const SizedBox(height: 4),
              Text(
                '修改食物名稱或份量後，可讓 AI 依修正內容重新估算熱量與營養素。',
                style: TextStyle(fontSize: 11, color: p.inkFaint),
              ),
              const SizedBox(height: 8),
            ],
          ),
        ),
      ),
      bottomNavigationBar: SafeArea(
        top: false,
        child: Container(
          padding: const EdgeInsets.fromLTRB(16, 10, 16, 10),
          decoration: BoxDecoration(
            color: p.surface,
            border: Border(top: BorderSide(color: p.hairline)),
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              if (_error != null) ...[
                Text(
                  '儲存未完成，草稿仍保留：$_error',
                  style: TextStyle(color: p.dangerInk),
                ),
                const SizedBox(height: 6),
              ],
              FilledButton(
                onPressed: _saving || _reanalyzing ? null : _save,
                child: _saving
                    ? SizedBox(
                        height: 20,
                        width: 20,
                        child: CircularProgressIndicator(
                          strokeWidth: 2,
                          color: p.onBrand,
                        ),
                      )
                    : const Text('確認並儲存'),
              ),
            ],
          ),
        ),
      ),
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
