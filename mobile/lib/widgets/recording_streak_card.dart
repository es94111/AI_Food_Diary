import 'package:flutter/material.dart';

import '../models/models.dart';
import '../theme/app_theme.dart';

class RecordingStreakCard extends StatelessWidget {
  const RecordingStreakCard({
    super.key,
    required this.streak,
    this.isLoading = false,
  });

  final RecordingStreak? streak;
  final bool isLoading;

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    final currentStreak = streak;
    late final String message;
    if (currentStreak == null) {
      message = isLoading ? '正在載入連續記錄…' : '連續記錄目前無法載入，可以稍後再試。';
    } else if (currentStreak.currentStreak > 0) {
      message = '目前已連續記錄 ${currentStreak.currentStreak} 天，照自己的節奏繼續就好。';
    } else if (currentStreak.lastRecordedDate != null) {
      message = '最近一次記錄是 ${currentStreak.lastRecordedDate}。想繼續時，從一筆餐點或飲水開始就好。';
    } else {
      message = '每一天都可以從一筆餐點或飲水紀錄開始。';
    }

    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Icon(
                  Icons.local_fire_department_outlined,
                  color: palette.amberAccent,
                ),
                const SizedBox(width: 8),
                Text(
                  '連續記錄',
                  style: TextStyle(
                    color: palette.ink,
                    fontSize: 18,
                    fontWeight: FontWeight.w800,
                  ),
                ),
              ],
            ),
            const SizedBox(height: 6),
            Text(
              message,
              style: TextStyle(color: palette.inkSoft, height: 1.4),
            ),
            if (streak != null) ...[
              const SizedBox(height: 14),
              Row(
                children: [
                  Expanded(
                    child: _Metric(
                      label: '目前連續天數',
                      value: '${streak!.currentStreak}',
                    ),
                  ),
                  Expanded(
                    child: _Metric(
                      label: '最長連續天數',
                      value: '${streak!.longestStreak}',
                    ),
                  ),
                  Expanded(
                    child: _Metric(
                      label: '最近一次記錄',
                      value: streak!.lastRecordedDate ?? '—',
                    ),
                  ),
                ],
              ),
            ],
          ],
        ),
      ),
    );
  }
}

class _Metric extends StatelessWidget {
  const _Metric({required this.label, required this.value});

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    return Padding(
      padding: const EdgeInsets.only(right: 6),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            value,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: TextStyle(
              color: palette.ink,
              fontSize: value.length > 6 ? 13 : 19,
              fontWeight: FontWeight.w800,
            ),
          ),
          const SizedBox(height: 3),
          Text(
            label,
            maxLines: 2,
            style: TextStyle(
              color: palette.inkFaint,
              fontSize: 10,
              fontWeight: FontWeight.w600,
            ),
          ),
        ],
      ),
    );
  }
}
