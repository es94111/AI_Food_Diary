import 'package:ai_food_mobile/services/background_analysis.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('only the meal analysis task is executed by the dispatcher', () {
    expect(isMealAnalysisTask(BackgroundAnalysis.taskName), isTrue);
  });

  test('a queued legacy daily-goal task is ignored before its input is read', () {
    // The previous build's daily-summary task persisted a session cookie in its
    // WorkManager input. The dispatcher must reject the task name itself, so a
    // stale credential can never be read or used after sign-out.
    expect(isMealAnalysisTask('ai_food_daily_goal_summary'), isFalse);
  });
}
