import 'package:ai_food_mobile/services/saved_food_service.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('imageUrl serves the full image by default', () {
    expect(
      SavedFoodService.imageUrl('food-1'),
      'https://aifood.shao.one/api/saved-foods/food-1/image',
    );
  });

  test('imageUrl appends the thumbnail width when requested', () {
    expect(
      SavedFoodService.imageUrl('food-1', width: SavedFoodService.thumbWidth),
      'https://aifood.shao.one/api/saved-foods/food-1/image?w=256',
    );
  });

  test('imageUrl ignores non-positive widths', () {
    expect(
      SavedFoodService.imageUrl('food-1', width: 0),
      'https://aifood.shao.one/api/saved-foods/food-1/image',
    );
  });
}
