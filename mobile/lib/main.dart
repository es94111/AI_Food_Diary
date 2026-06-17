import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:sentry_flutter/sentry_flutter.dart';

import 'screens/login_screen.dart';
import 'screens/dashboard_screen.dart';
import 'services/auth_service.dart';
import 'services/background_analysis.dart';
import 'services/meal_analysis_controller.dart';


void main() async {
  WidgetsFlutterBinding.ensureInitialized();
  // Background meal analysis (Android): register the WorkManager dispatcher and
  // notification channel, then recover any job left by a previous process.
  await BackgroundAnalysis.init();
  await MealAnalysisController.instance.init();
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
      theme: ThemeData(
        colorScheme: ColorScheme.fromSeed(
          seedColor: const Color(0xFFB45309), // amber-700, matches web
          brightness: Brightness.light,
        ),
        useMaterial3: true,
        scaffoldBackgroundColor: const Color(0xFFFAF8F5),
      ),
      home: const AppEntry(),
    );
  }
}

class AppEntry extends StatefulWidget {
  const AppEntry({super.key});

  @override
  State<AppEntry> createState() => _AppEntryState();
}

class _AppEntryState extends State<AppEntry> {
  bool _loading = true;
  bool _loggedIn = false;

  @override
  void initState() {
    super.initState();
    _check();
  }

  Future<void> _check() async {
    final has = await AuthService.hasSession();
    if (!mounted) return;
    setState(() {
      _loggedIn = has;
      _loading = false;
    });
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) {
      return const Scaffold(body: Center(child: CircularProgressIndicator()));
    }
    return _loggedIn ? const DashboardScreen() : const LoginScreen();
  }
}
