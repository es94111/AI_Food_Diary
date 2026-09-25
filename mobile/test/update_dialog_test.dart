import 'dart:async';

import 'package:ai_food_mobile/services/update_service.dart';
import 'package:ai_food_mobile/theme/app_theme.dart';
import 'package:ai_food_mobile/widgets/update_card.dart';
import 'package:flutter/material.dart';
import 'package:flutter_downloader/flutter_downloader.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  setUp(() {
    UpdateService.lastError = null;
    UpdateService.status.value = DownloadStatus.idle;
    UpdateService.progress.value = 0;
  });

  testWidgets('dismissed update dialog leaves the next page untouched', (
    tester,
  ) async {
    final started = Completer<void>();
    await tester.pumpWidget(
      MaterialApp(
        theme: AppTheme.light(),
        home: Scaffold(
          body: Builder(
            builder: (context) {
              return TextButton(
                onPressed: () => showDialog<void>(
                  context: context,
                  builder: (_) => UpdateDownloadDialog(
                    apkUrl: 'https://example.com/update.apk',
                    startDownload: (_) => started.future,
                  ),
                ),
                child: const Text('更新'),
              );
            },
          ),
        ),
      ),
    );

    await tester.tap(find.text('更新'));
    await tester.pump(const Duration(milliseconds: 300));
    await tester.tapAt(const Offset(5, 5));
    await tester.pump(); // The dialog is still in its closing animation.

    final context = tester.element(find.text('更新'));
    unawaited(
      Navigator.of(context).push(
        MaterialPageRoute<void>(
          builder: (_) => const Scaffold(body: Text('其他頁面')),
        ),
      ),
    );
    await tester.pump();
    UpdateService.lastError = '測試下載失敗';
    UpdateService.status.value = DownloadStatus.failed;
    await tester.pump(const Duration(milliseconds: 400));

    expect(find.text('其他頁面'), findsOneWidget);
    expect(find.byType(SnackBar), findsNothing);
    UpdateService.status.value = DownloadStatus.complete;
    await tester.pump();
    expect(find.text('其他頁面'), findsOneWidget);
    started.complete();
  });

  testWidgets('real failure stays in the update dialog and can retry', (
    tester,
  ) async {
    var starts = 0;
    await tester.pumpWidget(
      MaterialApp(
        theme: AppTheme.light(),
        home: Scaffold(
          body: Builder(
            builder: (context) {
              return TextButton(
                onPressed: () => showDialog<void>(
                  context: context,
                  builder: (_) => UpdateDownloadDialog(
                    apkUrl: 'https://example.com/update.apk',
                    startDownload: (_) async {
                      starts++;
                      UpdateService.status.value = DownloadStatus.running;
                    },
                  ),
                ),
                child: const Text('更新'),
              );
            },
          ),
        ),
      ),
    );

    await tester.tap(find.text('更新'));
    await tester.pump(const Duration(milliseconds: 300));
    UpdateService.lastError = '連線中斷';
    UpdateService.status.value = DownloadStatus.failed;
    await tester.pump();

    expect(find.text('更新失敗'), findsOneWidget);
    expect(find.text('連線中斷'), findsOneWidget);
    expect(find.byType(SnackBar), findsNothing);
    await tester.tap(find.text('重試下載'));
    await tester.pump();
    expect(starts, 2);
    expect(find.text('下載更新中'), findsOneWidget);
    UpdateService.status.value = DownloadStatus.canceled;
    await tester.pump();
    expect(find.text('下載已取消'), findsOneWidget);
    expect(find.byType(SnackBar), findsNothing);
  });

  testWidgets('update started from a tab does not open over another tab', (
    tester,
  ) async {
    final tab = ValueNotifier<int>(0);
    late BuildContext updateContext;
    await tester.pumpWidget(MaterialApp(
      home: Scaffold(
        body: ValueListenableBuilder<int>(
          valueListenable: tab,
          builder: (_, index, _) => IndexedStack(
            index: index,
            children: [
              Builder(builder: (context) {
                updateContext = context;
                return const Text('更新頁面');
              }),
              const Text('其他頁面'),
            ],
          ),
        ),
      ),
    ));

    tab.value = 1;
    await tester.pump();
    unawaited(UpdateCard.runUpdate(updateContext, 'https://example.com/update.apk'));
    await tester.pump();
    expect(find.text('其他頁面'), findsOneWidget);
    expect(find.byType(UpdateDownloadDialog), findsNothing);
    tab.dispose();
  });

  test('canceled background download is not a failure', () async {
    await UpdateService.handleBackgroundUpdate(DownloadTaskStatus.canceled, 0);
    expect(UpdateService.status.value, DownloadStatus.canceled);
    expect(UpdateService.lastError, isNull);
  });
}
