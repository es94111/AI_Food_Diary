import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:sentry_flutter/sentry_flutter.dart';

import 'screens/splash_screen.dart';
import 'services/api_client.dart';
import 'theme/app_theme.dart';


void main() async {
  WidgetsFlutterBinding.ensureInitialized();
  // Only Sentry initialises here, because its appRunner has to wrap runApp so
  // startup errors are captured and the tracing zone is set up before the first
  // frame. The other service inits (WorkManager/notifications, pending-analysis
  // recovery, the APK downloader) are NOT needed to draw the first screen, so
  // they run behind the animated SplashScreen instead of blocking cold start.
  await SentryFlutter.init(
    (options) {
      options.dsn = 'https://9c5384849c931702f75c03a530b30445@o4511575169040384.ingest.de.sentry.io/4511575192502352';
      // Set tracesSampleRate to 1.0 to capture 100% of transactions for tracing.
      // We recommend adjusting this value in production.
      options.tracesSampleRate = 1.0;
      // Distributed tracing: only attach sentry-trace/baggage headers to our own
      // backend, so a meal-analysis request continues into the server's LLM
      // (gen_ai) spans as one trace — and trace headers never leak elsewhere.
      // The list is final and defaults to ['.*'] (all hosts); clear it first so
      // we restrict propagation to our backend only.
      options.tracePropagationTargets
        ..clear()
        ..add('aifood.shao.one');
      // Enable structured logs (Sentry.logger.*). Off by default.
      options.enableLogs = true;
      // Release Health: session tracking drives crash-free rate / adoption.
      // On by default; stated explicitly here. release & dist are auto-derived
      // from the app version (pubspec, or CI --build-name/--build-number);
      // environment splits production vs development sessions in Sentry.
      options.enableAutoSessionTracking = true;
      options.environment = kReleaseMode ? 'production' : 'development';
      // Session Replay. Record 10% of sessions in production but every session
      // in dev so replays are easy to verify; capture 100% of sessions where an
      // error occurs regardless of environment.
      options.replay.sessionSampleRate = kReleaseMode ? 0.1 : 1.0;
      options.replay.onErrorSampleRate = 1.0;
      // Privacy: the SDK masks all text and images by default. We set both
      // explicitly so the redaction can't be silently lost in a later edit.
      // This app shows personal diet data and food photos — keep them masked.
      // (In sentry_flutter 9.x masking lives on options.privacy, not replay.)
      options.privacy.maskAllText = true;
      options.privacy.maskAllImages = true;
      // Noise filter: drop pure connectivity failures (offline, DNS lookup
      // failed, connection refused, timeouts). These are expected on mobile —
      // they say nothing about app health, but uncaught ones get reported as
      // `fatal`. Real app bugs still flow through untouched.
      options.beforeSend = (event, hint) {
        if (ApiClient.isConnectivityError(event.throwable)) return null;
        return event;
      };
    },
    appRunner: () => runApp(SentryWidget(child: const AiFoodApp())),
  );
}

class AiFoodApp extends StatelessWidget {
  const AiFoodApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'AI Food Diary',
      debugShowCheckedModeBanner: false,
      // Drives Sentry performance: auto-creates a screen-load transaction per
      // route (TTID/TTFD) and leaves navigation breadcrumbs on every event, so
      // the tracesSampleRate budget actually has transactions to sample and
      // errors carry the screen path that led to them.
      navigatorObservers: [SentryNavigatorObserver()],
      theme: AppTheme.light(),
      darkTheme: AppTheme.dark(),
      themeMode: ThemeMode.system,
      home: const SplashScreen(),
    );
  }
}
