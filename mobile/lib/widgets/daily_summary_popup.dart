import 'package:flutter/material.dart';

import '../models/models.dart';
import '../theme/app_theme.dart';
import 'markdown_text.dart';

/// Shows yesterday's pre-computed AI summary as a popup dialog. The summary is
/// generated ahead of time by the server worker, so this never triggers AI.
Future<void> showDailySummaryPopup(BuildContext context, DailySummary summary) {
  return showDialog<void>(
    context: context,
    builder: (ctx) {
      final maxHeight = MediaQuery.of(ctx).size.height * 0.8;
      final p = ctx.palette;
      return Dialog(
        insetPadding: const EdgeInsets.all(20),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
        child: ConstrainedBox(
          constraints: BoxConstraints(maxHeight: maxHeight),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Padding(
                padding: const EdgeInsets.fromLTRB(20, 16, 8, 4),
                child: Row(
                  children: [
                    const Expanded(
                      child: Text(
                        '昨日總結',
                        style: TextStyle(fontSize: 20, fontWeight: FontWeight.w900),
                      ),
                    ),
                    IconButton(
                      icon: const Icon(Icons.close),
                      onPressed: () => Navigator.of(ctx).pop(),
                    ),
                  ],
                ),
              ),
              Padding(
                padding: const EdgeInsets.fromLTRB(20, 0, 20, 8),
                child: Text(
                  '攝取 ${fmtNum(summary.totalCalories)} kcal',
                  style: TextStyle(color: p.inkSoft),
                ),
              ),
              Flexible(
                child: SingleChildScrollView(
                  padding: const EdgeInsets.fromLTRB(20, 0, 20, 8),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      MarkdownText(summary.aiSummary),
                      if (summary.aiRecommendation.trim().isNotEmpty) ...[
                        const SizedBox(height: 12),
                        Container(
                          width: double.infinity,
                          padding: const EdgeInsets.all(12),
                          decoration: BoxDecoration(
                            color: p.amberSurface,
                            borderRadius: BorderRadius.circular(12),
                          ),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                '建議',
                                style: TextStyle(
                                  fontWeight: FontWeight.w900,
                                  color: p.amberInk,
                                ),
                              ),
                              const SizedBox(height: 4),
                              MarkdownText(
                                summary.aiRecommendation,
                                style: TextStyle(color: p.amberInkSoft),
                              ),
                            ],
                          ),
                        ),
                      ],
                    ],
                  ),
                ),
              ),
              Padding(
                padding: const EdgeInsets.fromLTRB(20, 4, 20, 16),
                child: SizedBox(
                  width: double.infinity,
                  child: FilledButton(
                    onPressed: () => Navigator.of(ctx).pop(),
                    child: const Text('知道了'),
                  ),
                ),
              ),
            ],
          ),
        ),
      );
    },
  );
}
