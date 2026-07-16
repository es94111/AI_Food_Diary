import 'package:ai_food_mobile/models/models.dart';
import 'package:ai_food_mobile/services/saved_food_list_logic.dart';
import 'package:ai_food_mobile/services/saved_food_service.dart';
import 'package:flutter_test/flutter_test.dart';

SavedFood food(
  int index, {
  bool favorite = false,
  String? name,
  String? barcode,
  String amount = '1 份',
  double? calories,
  double protein = 1,
  double fat = 1,
  double carbs = 1,
  String source = 'MANUAL',
  DateTime? lastUsedAt,
  int useCount = 0,
}) => SavedFood(
  id: 'food-$index',
  name: name ?? '食物 $index',
  barcode: barcode,
  estimatedAmount: amount,
  calories: calories ?? index.toDouble(),
  protein: protein,
  fat: fat,
  carbs: carbs,
  source: source,
  isFavorite: favorite,
  lastUsedAt: lastUsedAt,
  useCount: useCount,
  createdAt: DateTime(2026, 1, 1).add(Duration(days: index)),
  updatedAt: DateTime(2026, 2, 1).add(Duration(days: index)),
);

void main() {
  test('quick add is capped at ten with favorites first', () {
    final foods = [
      for (var i = 0; i < 12; i++) food(i, favorite: true),
      for (var i = 12; i < 27; i++) food(i),
    ];

    final result = quickAddSavedFoods(foods);

    expect(result.favorites, hasLength(10));
    expect(result.recommendations, isEmpty);
    expect(
      result.favorites.length + result.recommendations.length,
      lessThanOrEqualTo(10),
    );

    final mixed = quickAddSavedFoods([
      for (var i = 0; i < 6; i++) food(i, favorite: true),
      for (var i = 6; i < 20; i++) food(i),
    ]);
    expect(mixed.favorites, hasLength(6));
    expect(mixed.recommendations, hasLength(4));
    expect(mixed.recommendations.last.id, 'food-9');
  });

  test('recent foods are sorted by last use and capped at thirty', () {
    final base = DateTime(2026, 7, 1);
    final foods = [
      for (var i = 0; i < 35; i++)
        food(i, lastUsedAt: base.add(Duration(hours: i))),
    ];

    final result = visibleSavedFoods(
      foods: foods,
      tab: SavedFoodTab.recent,
      sort: SavedFoodSort.name,
    );

    expect(result, hasLength(30));
    expect(result.first.id, 'food-34');
    expect(result.last.id, 'food-5');
  });

  test('search matches normalized names and barcodes', () {
    final foods = [
      food(1, name: 'Protein Bar', barcode: '471-123 456'),
      food(2, name: '無糖豆漿', barcode: '999999'),
    ];

    final byName = visibleSavedFoods(
      foods: foods,
      tab: SavedFoodTab.all,
      sort: SavedFoodSort.recommended,
      search: 'proteinbar',
    );
    final byBarcode = visibleSavedFoods(
      foods: foods,
      tab: SavedFoodTab.all,
      sort: SavedFoodSort.recommended,
      search: '471123456',
    );

    expect(byName.single.id, 'food-1');
    expect(byBarcode.single.id, 'food-1');
  });

  test('most-used sorting uses count before the stable name tie-breaker', () {
    final foods = [
      food(1, name: 'B', useCount: 3),
      food(2, name: 'A', useCount: 7),
      food(3, name: 'C', useCount: 3),
    ];

    final result = visibleSavedFoods(
      foods: foods,
      tab: SavedFoodTab.all,
      sort: SavedFoodSort.mostUsed,
    );

    expect(result.map((item) => item.name), ['A', 'B', 'C']);
  });

  test('smart views use deterministic predicates and expose counts', () {
    final foods = [
      food(1, name: '從未使用'),
      food(2, name: '已使用', useCount: 1),
      food(3, name: 'Protein Bar', useCount: 1),
      food(4, name: 'protein-bar', useCount: 1),
      food(
        5,
        name: '缺營養',
        calories: 0,
        protein: 0,
        fat: 0,
        carbs: 0,
        useCount: 1,
      ),
      food(6, name: '缺份量', amount: '', useCount: 1),
      food(7, name: '缺條碼', source: 'BARCODE', useCount: 1),
    ];

    final unused = visibleSavedFoods(
      foods: foods,
      tab: SavedFoodTab.unused,
      sort: SavedFoodSort.name,
    );
    final duplicates = visibleSavedFoods(
      foods: foods,
      tab: SavedFoodTab.possibleDuplicates,
      sort: SavedFoodSort.name,
    );
    final incomplete = visibleSavedFoods(
      foods: foods,
      tab: SavedFoodTab.incomplete,
      sort: SavedFoodSort.name,
    );
    final counts = savedFoodTabCounts(foods);

    expect(unused.map((item) => item.id), ['food-1']);
    expect(duplicates.map((item) => item.id), ['food-3', 'food-4']);
    expect(
      incomplete.map((item) => item.id),
      unorderedEquals(['food-5', 'food-6', 'food-7']),
    );
    expect(counts[SavedFoodTab.unused], 1);
    expect(counts[SavedFoodTab.possibleDuplicates], 2);
    expect(counts[SavedFoodTab.incomplete], 3);
  });

  test('update payload explicitly clears barcode and never mutates source', () {
    final payload = savedFoodUpdatePayload(
      barcode: null,
      name: '豆漿',
      estimatedAmount: '1 杯',
      calories: 100,
      protein: 8,
      fat: 3,
      carbs: 10,
      isFavorite: false,
    );

    expect(payload, containsPair('barcode', null));
    expect(payload, isNot(contains('source')));
  });
}
