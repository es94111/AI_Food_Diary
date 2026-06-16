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
      // Enable structured logs (Sentry.logger.*). Off by default.
      options.enableLogs = true;
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
