// Basic smoke test for the AI Food Diary app.

import 'package:flutter_test/flutter_test.dart';

import 'package:ai_food_mobile/main.dart';

void main() {
  testWidgets('App boots into the branded splash screen', (tester) async {
    await tester.pumpWidget(const AiFoodApp());

    expect(find.text('AI Food Diary'), findsOneWidget);
    expect(find.text('拍下每一餐，讓 AI 看懂營養'), findsOneWidget);

    // Let the splash deadline finish before teardown so no timer is leaked.
    await tester.pump(const Duration(milliseconds: 1600));
  });
}
