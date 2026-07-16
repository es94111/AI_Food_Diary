import 'dart:async';

import 'package:flutter/widgets.dart';

import '../models/models.dart';
import 'background_analysis.dart';

enum MealAnalysisStatus { idle, running, done, error }

/// Holds the current meal AI analysis so it survives navigation. Two execution
/// paths feed the same state:
///
///  * [start] — runs the analysis in the foreground isolate (used on iOS and as
///    a fallback). Survives switching tabs/screens within the app.
///  * [startBackground] — hands the analysis to a WorkManager background isolate
///    (Android) that keeps running when the app is minimised or killed and posts
///    a system notification when done. The foreground app polls the result file
///    (a Timer while running, plus on app resume and cold start).
class MealAnalysisController extends ChangeNotifier
    with WidgetsBindingObserver {
  MealAnalysisController._();
  static final MealAnalysisController instance = MealAnalysisController._();

  MealAnalysisStatus status = MealAnalysisStatus.idle;
  String? error;
  List<FoodAnalysisItem> result = const [];

  // Context captured at submit time — needed to persist the meal after confirm.
  String mealType = 'LUNCH';
  String mode = 'manual'; // 'photo' | 'describe' | 'manual'
  List<String> imageDataUrls = const [];
  // Saved foods (with photos) picked into the meal; their image is attached by
  // reference on save instead of being copied into [imageDataUrls].
  List<String> savedFoodImageIds = const [];
  List<String?> savedFoodIds = const [];
  String description = '';

  bool reviewRequested = false;

  bool _background = false;
  Timer? _pollTimer;
  bool _observing = false;

  bool get isRunning => status == MealAnalysisStatus.running;
  bool get isDone => status == MealAnalysisStatus.done;
  bool get isError => status == MealAnalysisStatus.error;

  /// One-time wiring from main(): observe the app lifecycle (to poll the
  /// background result on resume) and recover any job left over from a previous
  /// process (e.g. the app was killed while analysing, then reopened from the
  /// completion notification).
  Future<void> init() async {
    if (!_observing) {
      WidgetsBinding.instance.addObserver(this);
      _observing = true;
    }
    await _recoverPending();
  }

  /// Foreground analysis. [run] performs the actual `MealService.analyze*` call.
  Future<void> start({
    required String mealType,
    required String mode,
    required List<String> imageDataUrls,
    List<String> savedFoodImageIds = const [],
    List<String?> savedFoodIds = const [],
    required String description,
    required Future<List<FoodAnalysisItem>> Function() run,
  }) async {
    _begin(
      mealType: mealType,
      mode: mode,
      imageDataUrls: imageDataUrls,
      savedFoodImageIds: savedFoodImageIds,
      savedFoodIds: savedFoodIds,
      description: description,
      background: false,
    );
    try {
      result = await run();
      status = MealAnalysisStatus.done;
    } catch (e) {
      error = e.toString();
      status = MealAnalysisStatus.error;
    }
    notifyListeners();
  }

  /// Background analysis (Android). [body] is the exact POST body for [mode].
  Future<void> startBackground({
    required String mealType,
    required String mode,
    required List<String> imageDataUrls,
    List<String> savedFoodImageIds = const [],
    List<String?> savedFoodIds = const [],
    required String description,
    required Map<String, dynamic> body,
  }) async {
    _begin(
      mealType: mealType,
      mode: mode,
      imageDataUrls: imageDataUrls,
      savedFoodImageIds: savedFoodImageIds,
      savedFoodIds: savedFoodIds,
      description: description,
      background: true,
    );
    try {
      await BackgroundAnalysis.enqueue(
        mode: mode,
        mealType: mealType,
        imageDataUrls: imageDataUrls,
        savedFoodImageIds: savedFoodImageIds,
        savedFoodIds: savedFoodIds,
        description: description,
        body: body,
      );
    } catch (e) {
      _background = false;
      error = e.toString();
      status = MealAnalysisStatus.error;
      notifyListeners();
      return;
    }
    _startPolling();
  }

  void _begin({
    required String mealType,
    required String mode,
    required List<String> imageDataUrls,
    List<String> savedFoodImageIds = const [],
    List<String?> savedFoodIds = const [],
    required String description,
    required bool background,
  }) {
    this.mealType = mealType;
    this.mode = mode;
    this.imageDataUrls = imageDataUrls;
    this.savedFoodImageIds = savedFoodImageIds;
    this.savedFoodIds = savedFoodIds;
    this.description = description;
    status = MealAnalysisStatus.running;
    error = null;
    result = const [];
    reviewRequested = false;
    _background = background;
    notifyListeners();
  }

  void _startPolling() {
    _pollTimer?.cancel();
    _pollTimer = Timer.periodic(
      const Duration(seconds: 2),
      (_) => _pollBackground(),
    );
  }

  Future<void> _pollBackground() async {
    if (!_background || !isRunning) {
      _pollTimer?.cancel();
      _pollTimer = null;
      return;
    }
    final data = await BackgroundAnalysis.pollResult();
    if (data == null) return;
    _pollTimer?.cancel();
    _pollTimer = null;
    _background = false;
    await BackgroundAnalysis.clearJobFiles();
    _applyResult(data);
  }

  void _applyResult(Map<String, dynamic> data) {
    if (data['status'] == 'done') {
      final foods = (data['foods'] as List?) ?? const [];
      result = foods
          .map((e) => FoodAnalysisItem.fromJson(e as Map<String, dynamic>))
          .toList();
      status = MealAnalysisStatus.done;
    } else {
      error = (data['error'] as String?) ?? 'AI 分析失敗';
      status = MealAnalysisStatus.error;
    }
    notifyListeners();
  }

  /// Picks up a job left by a previous process: a finished result, or an
  /// in-flight request whose result hasn't landed yet.
  Future<void> _recoverPending() async {
    if (!BackgroundAnalysis.supported) return;
    final ctx = await BackgroundAnalysis.readContext();
    final data = await BackgroundAnalysis.pollResult();
    if (data != null) {
      if (ctx != null) _applyContext(ctx);
      await BackgroundAnalysis.clearJobFiles();
      _applyResult(data);
      return;
    }
    // No result yet — is a job still running (and not stale)?
    final age = await BackgroundAnalysis.pendingRequestAge();
    if (ctx != null && age != null && age < const Duration(minutes: 10)) {
      _applyContext(ctx);
      status = MealAnalysisStatus.running;
      _background = true;
      notifyListeners();
      _startPolling();
    } else if (age != null) {
      await BackgroundAnalysis.clearJobFiles(); // stale, give up
    }
  }

  void _applyContext(Map<String, dynamic> ctx) {
    mealType = (ctx['mealType'] as String?) ?? mealType;
    mode = (ctx['mode'] as String?) ?? mode;
    imageDataUrls =
        (ctx['imageDataUrls'] as List?)?.map((e) => e.toString()).toList() ??
        const [];
    savedFoodImageIds =
        (ctx['savedFoodImageIds'] as List?)
            ?.map((e) => e.toString())
            .toList() ??
        const [];
    savedFoodIds =
        (ctx['savedFoodIds'] as List?)?.map((e) => e?.toString()).toList() ??
        const [];
    description = (ctx['description'] as String?) ?? '';
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed && _background && isRunning) {
      _pollBackground();
    }
  }

  void requestReview() {
    if (status == MealAnalysisStatus.done) {
      reviewRequested = true;
      notifyListeners();
    }
  }

  void clearReview() => reviewRequested = false;

  void reset() {
    _pollTimer?.cancel();
    _pollTimer = null;
    _background = false;
    status = MealAnalysisStatus.idle;
    error = null;
    result = const [];
    imageDataUrls = const [];
    savedFoodImageIds = const [];
    savedFoodIds = const [];
    description = '';
    reviewRequested = false;
    BackgroundAnalysis.clearNotifications();
    BackgroundAnalysis.clearJobFiles();
    notifyListeners();
  }
}
