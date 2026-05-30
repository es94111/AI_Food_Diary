// Basic smoke test for the AI Food Diary app.

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:ai_food_mobile/main.dart';

void main() {
  testWidgets('App boots and shows a loading indicator', (tester) async {
    await tester.pumpWidget(const AiFoodApp());

    // AppEntry starts in its loading state while it checks for a saved token.
    expect(find.byType(CircularProgressIndicator), findsOneWidget);
  });
}
