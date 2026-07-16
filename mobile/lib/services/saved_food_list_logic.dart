import '../models/models.dart';

enum SavedFoodTab {
  favorites,
  all,
  barcoded,
  recent,
  unused,
  possibleDuplicates,
  incomplete,
  archived,
}

enum SavedFoodSort { recommended, name, mostUsed, recentlyUpdated, newest }

String normalizeSavedFoodSearch(String value) =>
    value.toLowerCase().replaceAll(RegExp(r'[\s-]+'), '');

List<SavedFood> visibleSavedFoods({
  required List<SavedFood> foods,
  required SavedFoodTab tab,
  required SavedFoodSort sort,
  String search = '',
}) {
  final query = normalizeSavedFoodSearch(search);
  final duplicateIds = tab == SavedFoodTab.possibleDuplicates
      ? possibleDuplicateSavedFoodIds(foods)
      : const <String>{};
  final filtered = foods.where((food) {
    if (tab == SavedFoodTab.favorites && !food.isFavorite) return false;
    if (tab == SavedFoodTab.barcoded && (food.barcode?.isEmpty ?? true)) {
      return false;
    }
    if (tab == SavedFoodTab.recent && food.lastUsedAt == null) return false;
    if (tab == SavedFoodTab.unused && !isUnusedSavedFood(food)) return false;
    if (tab == SavedFoodTab.possibleDuplicates &&
        !duplicateIds.contains(food.id)) {
      return false;
    }
    if (tab == SavedFoodTab.incomplete && !isIncompleteSavedFood(food)) {
      return false;
    }
    if (query.isEmpty) return true;
    return normalizeSavedFoodSearch(food.name).contains(query) ||
        normalizeSavedFoodSearch(food.barcode ?? '').contains(query);
  }).toList();

  filtered.sort(
    tab == SavedFoodTab.recent
        ? _compareRecent
        : (left, right) => _compare(left, right, sort),
  );
  return tab == SavedFoodTab.recent ? filtered.take(30).toList() : filtered;
}

({List<SavedFood> favorites, List<SavedFood> recommendations})
quickAddSavedFoods(List<SavedFood> foods, {int topN = 10}) {
  if (topN <= 0) {
    return (favorites: <SavedFood>[], recommendations: <SavedFood>[]);
  }
  final favorites = foods.where((food) => food.isFavorite).take(topN).toList();
  final remaining = topN - favorites.length;
  final recommendations = foods
      .where((food) => !food.isFavorite)
      .take(remaining)
      .toList();
  return (favorites: favorites, recommendations: recommendations);
}

bool isUnusedSavedFood(SavedFood food) =>
    food.useCount == 0 && food.lastUsedAt == null;

bool isIncompleteSavedFood(SavedFood food) {
  final missingIdentity =
      food.name.trim().isEmpty || food.estimatedAmount.trim().isEmpty;
  final missingNutrition =
      food.calories == 0 &&
      food.protein == 0 &&
      food.fat == 0 &&
      food.carbs == 0;
  final missingBarcodeBinding =
      food.source == 'BARCODE' && (food.barcode?.trim().isEmpty ?? true);
  return missingIdentity || missingNutrition || missingBarcodeBinding;
}

Set<String> possibleDuplicateSavedFoodIds(List<SavedFood> foods) {
  final nameGroups = <String, List<String>>{};
  final barcodeGroups = <String, List<String>>{};
  for (final food in foods) {
    final name = _normalizeDuplicateName(food.name);
    if (name.isNotEmpty) {
      nameGroups.putIfAbsent(name, () => <String>[]).add(food.id);
    }
    final barcode = normalizeSavedFoodSearch(food.barcode ?? '');
    if (barcode.isNotEmpty) {
      barcodeGroups.putIfAbsent(barcode, () => <String>[]).add(food.id);
    }
  }
  return {
    for (final ids in [...nameGroups.values, ...barcodeGroups.values])
      if (ids.length > 1) ...ids,
  };
}

Map<SavedFoodTab, int> savedFoodTabCounts(List<SavedFood> foods) => {
  for (final tab in SavedFoodTab.values)
    if (tab != SavedFoodTab.archived)
      tab: visibleSavedFoods(
        foods: foods,
        tab: tab,
        sort: SavedFoodSort.recommended,
      ).length,
};

String _normalizeDuplicateName(String value) =>
    value.toLowerCase().replaceAll(RegExp(r'[\s\-_.,，。/\\()（）]+'), '');

int _compare(SavedFood left, SavedFood right, SavedFoodSort sort) {
  final result = switch (sort) {
    SavedFoodSort.recommended => _compareRecommended(left, right),
    SavedFoodSort.name => left.name.toLowerCase().compareTo(
      right.name.toLowerCase(),
    ),
    SavedFoodSort.mostUsed => right.useCount.compareTo(left.useCount),
    SavedFoodSort.recentlyUpdated => _compareDate(
      right.updatedAt,
      left.updatedAt,
    ),
    SavedFoodSort.newest => _compareDate(right.createdAt, left.createdAt),
  };
  return result != 0 ? result : left.name.compareTo(right.name);
}

int _compareRecommended(SavedFood left, SavedFood right) {
  final favorite = (right.isFavorite ? 1 : 0).compareTo(
    left.isFavorite ? 1 : 0,
  );
  if (favorite != 0) return favorite;
  final recent = _compareDate(right.lastUsedAt, left.lastUsedAt);
  if (recent != 0) return recent;
  final used = right.useCount.compareTo(left.useCount);
  if (used != 0) return used;
  return _compareDate(right.updatedAt, left.updatedAt);
}

int _compareRecent(SavedFood left, SavedFood right) {
  final recent = _compareDate(right.lastUsedAt, left.lastUsedAt);
  if (recent != 0) return recent;
  return right.useCount.compareTo(left.useCount);
}

int _compareDate(DateTime? left, DateTime? right) {
  final leftValue = left?.millisecondsSinceEpoch ?? -1;
  final rightValue = right?.millisecondsSinceEpoch ?? -1;
  return leftValue.compareTo(rightValue);
}
