// Widget 測試：MarkdownText（純呈現，無網路）。
// 驗證 AI 文字用的最小 Markdown 渲染：標題、清單、數字清單、粗體/斜體/code。
// 執行：flutter test test/markdown_text_test.dart

import 'package:ai_food_mobile/theme/app_theme.dart';
import 'package:ai_food_mobile/widgets/markdown_text.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

/// MarkdownText 把內文渲染為 RichText；用 toPlainText() 比對內容。
Finder richTextWith(String plain) => find.byWidgetPredicate(
      (w) => w is RichText && w.text.toPlainText() == plain,
    );

Widget wrap(Widget child) => MaterialApp(
      theme: AppTheme.light(),
      home: Scaffold(body: child),
    );

void main() {
  testWidgets('renders a plain paragraph', (tester) async {
    await tester.pumpWidget(wrap(const MarkdownText('Hello world')));
    expect(richTextWith('Hello world'), findsOneWidget);
  });

  testWidgets('renders # / ## / ### headings', (tester) async {
    await tester.pumpWidget(wrap(const MarkdownText(
      '# 大標\n## 中標\n### 小標',
    )));
    expect(richTextWith('大標'), findsOneWidget);
    expect(richTextWith('中標'), findsOneWidget);
    expect(richTextWith('小標'), findsOneWidget);
  });

  testWidgets('renders bullet and numbered lists', (tester) async {
    await tester.pumpWidget(wrap(const MarkdownText(
      '- 蘋果\n- 香蕉\n1. 第一\n2. 第二',
    )));
    expect(find.text('•  '), findsNWidgets(2)); // 兩個項目符號 Text
    expect(richTextWith('蘋果'), findsOneWidget);
    expect(richTextWith('香蕉'), findsOneWidget);
    expect(find.text('1.  '), findsOneWidget);
    expect(find.text('2.  '), findsOneWidget);
    expect(richTextWith('第一'), findsOneWidget);
    expect(richTextWith('第二'), findsOneWidget);
  });

  testWidgets('renders inline **bold**, *italic* and `code`', (tester) async {
    await tester.pumpWidget(wrap(const MarkdownText('**粗**\n*斜*\n`碼`')));
    expect(richTextWith('粗'), findsOneWidget);
    expect(richTextWith('斜'), findsOneWidget);
    expect(richTextWith('碼'), findsOneWidget);
  });

  testWidgets('renders a line mixing plain text with inline bold', (tester) async {
    await tester.pumpWidget(wrap(const MarkdownText('這是 **重點** 細節')));
    expect(richTextWith('這是 重點 細節'), findsOneWidget);
  });

  testWidgets('collapses blank lines to spacers', (tester) async {
    await tester.pumpWidget(wrap(const MarkdownText('A\n\nB')));
    expect(richTextWith('A'), findsOneWidget);
    expect(richTextWith('B'), findsOneWidget);
    // 空白行插入一個高度 6 的 SizedBox
    expect(
      find.byWidgetPredicate((w) => w is SizedBox && (w.height == 6)),
      findsOneWidget,
    );
  });
}