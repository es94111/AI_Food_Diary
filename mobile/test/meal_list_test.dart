// Widget 測試：MealList（純呈現，不打網路）。
// 用「無照片」餐點渲染，避免 Image.network；只驗證呈現，不點擊會呼叫 service 的按鈕。
// 執行：flutter test test/meal_list_test.dart

import 'package:ai_food_mobile/models/models.dart';
import 'package:ai_food_mobile/theme/app_theme.dart';
import 'package:ai_food_mobile/widgets/meal_list.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

Meal _meal({
  String mealType = 'SNACK',
  double calories = 500,
  double protein = 5,
  double fat = 1,
  double carbs = 60,
  List<MealItem>? items,
}) =>
    Meal(
      id: 'm-1',
      mealType: mealType,
      totalCalories: calories,
      totalProtein: protein,
      totalFat: fat,
      totalCarbs: carbs,
      eatenAt: DateTime(2026, 7, 27, 12, 30),
      items: items ??
          [
            MealItem(name: '白飯', estimatedAmount: '1 碗', calories: 280, protein: 5, fat: 1, carbs: 60)
          ],
    );

Widget wrap(Widget child) => MaterialApp(
      theme: AppTheme.light(),
      home: Scaffold(body: child),
    );

void main() {
  testWidgets('empty list shows the placeholder', (tester) async {
    await tester.pumpWidget(wrap(
      MealList(meals: const [], onChanged: () async {}),
    ));
    expect(find.text('尚無餐點紀錄'), findsOneWidget);
    expect(find.byType(MealList), findsOneWidget);
  });

  testWidgets('renders a meal with its items, totals, time and actions', (tester) async {
    await tester.pumpWidget(wrap(
      MealList(meals: [_meal()], onChanged: () async {}),
    ));

    // 總熱量與時間（總計 500 kcal，與項目 280 kcal 區隔）
    expect(find.text('500 kcal'), findsOneWidget);
    expect(find.text('12:30'), findsOneWidget);

    // 項目（MANUAL → ✎；顯示份量與項目 kcal）
    expect(find.text('✎ 白飯 · 1 碗'), findsOneWidget);
    expect(find.text('280 kcal'), findsOneWidget); // 項目 kcal

    // 巨量總計行
    expect(find.text('蛋白質 5.0g · 脂肪 1.0g · 碳水 60.0g'), findsOneWidget);

    // 動作按鈕
    expect(find.text('編輯'), findsOneWidget);
    expect(find.text('刪除'), findsOneWidget);

    // 無照片 → 顯示「補上傳照片」而非 Image.network
    expect(find.text('補上傳照片'), findsOneWidget);
    expect(
      find.byWidgetPredicate((w) => w is Image && w.image is NetworkImage),
      findsNothing,
      reason: '無照片的餐點不應渲染 Image.network',
    );
  });
}