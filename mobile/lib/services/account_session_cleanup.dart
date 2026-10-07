typedef AccountCleanupTask = Future<void> Function();

class AccountSessionCleanup {
  static Future<void> run({
    required AccountCleanupTask cancelAnalysis,
    required void Function() deactivateHealthSync,
    required AccountCleanupTask signOutGoogle,
    required AccountCleanupTask revokeOnServer,
    required AccountCleanupTask clearLocalSession,
    required AccountCleanupTask clearHealthToken,
    required AccountCleanupTask clearHomeWidget,
    required bool revokeServerSession,
    required bool clearHealthTokenOnDelete,
  }) async {
    await _ignoreFailure(cancelAnalysis);
    try {
      deactivateHealthSync();
    } catch (_) {}
    await _ignoreFailure(signOutGoogle);
    if (revokeServerSession) await _ignoreFailure(revokeOnServer);

    Object? firstError;
    StackTrace? firstStackTrace;

    Future<void> runMandatory(AccountCleanupTask task) async {
      try {
        await task();
      } catch (error, stackTrace) {
        firstError ??= error;
        firstStackTrace ??= stackTrace;
      }
    }

    await runMandatory(clearLocalSession);
    if (clearHealthTokenOnDelete) await runMandatory(clearHealthToken);
    await runMandatory(clearHomeWidget);

    if (firstError != null) {
      Error.throwWithStackTrace(firstError!, firstStackTrace!);
    }
  }

  static Future<void> _ignoreFailure(AccountCleanupTask task) async {
    try {
      await task();
    } catch (_) {}
  }
}
