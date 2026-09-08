import 'package:flutter/material.dart';

import '../screens/ai_activity_screen.dart';

/// Settings entry for the human-only AI activity and restore workflow.
class AiActivitySettingsEntry extends StatelessWidget {
  const AiActivitySettingsEntry({super.key, this.destinationBuilder});

  /// Test seam for verifying navigation without issuing API requests.
  final WidgetBuilder? destinationBuilder;

  @override
  Widget build(BuildContext context) => Card(
    child: ListTile(
      leading: const Icon(Icons.manage_history_outlined),
      title: const Text('AI 操作紀錄'),
      subtitle: const Text('查看 AI 建立內容、執行結果與安全還原紀錄'),
      trailing: const Icon(Icons.chevron_right),
      onTap: () => Navigator.of(context).push(
        MaterialPageRoute<void>(
          builder: destinationBuilder ?? (_) => const AiActivityScreen(),
          settings: const RouteSettings(name: '/ai-activity'),
        ),
      ),
    ),
  );
}
