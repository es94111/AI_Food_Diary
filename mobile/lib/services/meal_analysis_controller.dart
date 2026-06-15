import 'package:flutter/foundation.dart';

import '../models/models.dart';

enum MealAnalysisStatus { idle, running, done, error }

/// Holds a single in-flight AI meal analysis so it survives navigation between
/// screens/tabs. The HTTP request runs to completion regardless of which widget
/// is currently visible (a Dart future is not cancelled when a widget is hidden
/// or disposed), and the result is kept here until the user reviews and saves
/// it — so the user can switch to another tab while "AI 分析中" and come back.
class MealAnalysisController extends ChangeNotifier {
  MealAnalysisController._();
  static final MealAnalysisController instance = MealAnalysisController._();

  MealAnalysisStatus status = MealAnalysisStatus.idle;
  String? error;
  List<FoodAnalysisItem> result = const [];

  // Context captured at submit time — needed to persist the meal after the user
  // confirms, since the form's own fields may have been cleared/changed mean-
  // while (the analysis ran in the background).
  String mealType = 'LUNCH';
  String mode = 'manual'; // 'photo' | 'describe' | 'manual'
  List<String> imageDataUrls = const [];
  String description = '';

  // Set when the user taps "查看"/"查看結果"; the visible form opens the confirm
  // sheet on the next notify and then clears it.
  bool reviewRequested = false;

  bool get isRunning => status == MealAnalysisStatus.running;
  bool get isDone => status == MealAnalysisStatus.done;
  bool get isError => status == MealAnalysisStatus.error;

  /// Starts an analysis. [run] performs the actual `MealService.analyze*` call.
  /// The caller can navigate away freely while this runs.
  Future<void> start({
    required String mealType,
    required String mode,
    required List<String> imageDataUrls,
    required String description,
    required Future<List<FoodAnalysisItem>> Function() run,
  }) async {
    this.mealType = mealType;
    this.mode = mode;
    this.imageDataUrls = imageDataUrls;
    this.description = description;
    status = MealAnalysisStatus.running;
    error = null;
    result = const [];
    reviewRequested = false;
    notifyListeners();
    try {
      result = await run();
      status = MealAnalysisStatus.done;
    } catch (e) {
      error = e.toString();
      status = MealAnalysisStatus.error;
    }
    notifyListeners();
  }

  /// Ask the visible form to open the confirm sheet (only meaningful once done).
  void requestReview() {
    if (status == MealAnalysisStatus.done) {
      reviewRequested = true;
      notifyListeners();
    }
  }

  void clearReview() => reviewRequested = false;

  /// Clear all state (after a successful save, or to dismiss an error).
  void reset() {
    status = MealAnalysisStatus.idle;
    error = null;
    result = const [];
    imageDataUrls = const [];
    description = '';
    reviewRequested = false;
    notifyListeners();
  }
}
