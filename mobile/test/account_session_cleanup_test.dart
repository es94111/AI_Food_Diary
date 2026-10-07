import 'package:flutter_test/flutter_test.dart';

import 'package:ai_food_mobile/services/account_session_cleanup.dart';

void main() {
  test('optional cleanup failures do not skip session, health token, or cache cleanup', () async {
    final calls = <String>[];

    await AccountSessionCleanup.run(
      cancelAnalysis: () async {
        calls.add('cancel');
        throw StateError('cancel failed');
      },
      deactivateHealthSync: () {
        calls.add('deactivate');
        throw StateError('deactivate failed');
      },
      signOutGoogle: () async {
        calls.add('google');
        throw StateError('Google sign-out failed');
      },
      revokeOnServer: () async {
        calls.add('revoke');
        throw StateError('server logout failed');
      },
      clearLocalSession: () async => calls.add('session'),
      clearHealthToken: () async => calls.add('health-token'),
      clearHomeWidget: () async => calls.add('home-widget'),
      revokeServerSession: true,
      clearHealthTokenOnDelete: true,
    );

    expect(calls, [
      'cancel',
      'deactivate',
      'google',
      'revoke',
      'session',
      'health-token',
      'home-widget',
    ]);
  });

  test('logout warns and navigates after mandatory cleanup fails', () async {
    final calls = <String>[];

    final succeeded = await AccountSessionCleanup.runLogoutAndNavigate(
      cleanup: () async {
        calls.add('cleanup');
        throw StateError('local cleanup failed');
      },
      showFailureWarning: () async => calls.add('warning'),
      navigateToLogin: () => calls.add('login'),
    );

    expect(succeeded, isFalse);
    expect(calls, ['cleanup', 'warning', 'login']);
  });

  test('logout still navigates when its warning cannot be shown', () async {
    final calls = <String>[];

    final succeeded = await AccountSessionCleanup.runLogoutAndNavigate(
      cleanup: () async => throw StateError('local cleanup failed'),
      showFailureWarning: () async => throw StateError('screen disposed'),
      navigateToLogin: () => calls.add('login'),
    );

    expect(succeeded, isFalse);
    expect(calls, ['login']);
  });

  test(
    'all mandatory local cleanup steps are attempted before reporting failure',
    () async {
      final calls = <String>[];

      await expectLater(
        AccountSessionCleanup.run(
          cancelAnalysis: () async {},
          deactivateHealthSync: () {},
          signOutGoogle: () async {},
          revokeOnServer: () async {},
          clearLocalSession: () async {
            calls.add('session');
            throw StateError('cache clear failed');
          },
          clearHealthToken: () async => calls.add('health-token'),
          clearHomeWidget: () async => calls.add('home-widget'),
          revokeServerSession: false,
          clearHealthTokenOnDelete: true,
        ),
        throwsA(isA<StateError>()),
      );

      expect(calls, ['session', 'health-token', 'home-widget']);
    },
  );
}
