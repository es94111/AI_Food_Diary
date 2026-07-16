import 'package:ai_food_mobile/models/models.dart';
import 'package:ai_food_mobile/theme/app_theme.dart';
import 'package:ai_food_mobile/widgets/saved_food_editor.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  testWidgets('source is rendered read-only while editing', (tester) async {
    final savedFood = SavedFood(
      id: 'food-1',
      name: '豆漿',
      estimatedAmount: '1 杯',
      calories: 100,
      protein: 8,
      fat: 3,
      carbs: 10,
      source: 'BARCODE',
    );

    await tester.pumpWidget(
      MaterialApp(
        theme: AppTheme.light(),
        home: Scaffold(
          body: SingleChildScrollView(
            child: SavedFoodEditor(
              editing: savedFood,
              onSaved: (_) async {},
              onCancelEdit: () {},
            ),
          ),
        ),
      ),
    );

    expect(find.text('條碼綁定'), findsOneWidget);
    expect(find.byIcon(Icons.lock_outline), findsOneWidget);
    expect(find.byType(DropdownButtonFormField<String>), findsNothing);
  });
}
