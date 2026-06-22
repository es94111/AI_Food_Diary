import 'dart:async';
import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../services/auth_service.dart';
import '../services/background_analysis.dart';
import '../services/meal_analysis_controller.dart';
import '../services/update_service.dart';
import 'dashboard_screen.dart';
import 'login_screen.dart';

/// Branded launch screen.
///
/// The app's non-critical services — WorkManager + notifications, recovery of a
/// pending background analysis, and the in-app APK downloader — are NOT needed to
/// draw the first screen, yet they used to block `runApp` and make the app feel
/// like it hung for a few seconds on cold start. They now run *behind* this
/// screen while a short macro-ring animation plays (the same amber/rose/sky
/// donut the dashboard uses), so the wait reads as an intentional splash.
///
/// Timing:
///  * The local session check runs during the animation and has the same hard
///    deadline, so it cannot leave the finished splash spinning indefinitely.
///  * Non-critical service initialization is detached from navigation. Slow or
///    failed plugins never delay entry into the dashboard/login screen.
///  * [_splashDuration] is the single source of truth for the animation wait.
///
/// (Sentry is initialised before `runApp` in main(), so it's already up by the
/// time this screen renders — the native launch screen covers that phase.)
class SplashScreen extends StatefulWidget {
  const SplashScreen({super.key});

  @override
  State<SplashScreen> createState() => _SplashScreenState();
}

class _SplashScreenState extends State<SplashScreen>
    with TickerProviderStateMixin {
  // Brand palette, mirroring the web/dashboard.
  static const _bg = Color(0xFFFAF8F5);
  static const _ink = Color(0xFF1C1917);
  static const _amber700 = Color(0xFFB45309);
  // The dashboard macro donut: 蛋白質 / 脂肪 / 碳水.
  static const _ringColors = [
    Color(0xFFFBBF24), // amber
    Color(0xFFFB7185), // rose
    Color(0xFF38BDF8), // sky
  ];

  static const _splashDuration = Duration(milliseconds: 1600);

  late final AnimationController _intro; // logo + title reveal (plays once)
  late final AnimationController _spin; // ring rotation (loops as a spinner)

  @override
  void initState() {
    super.initState();
    _intro = AnimationController(
        vsync: this, duration: _splashDuration)
      ..forward();
    _spin = AnimationController(
        vsync: this, duration: const Duration(milliseconds: 1200))
      ..repeat();
    _boot();
  }

  Future<void> _boot() async {
    // Start everything together. Only the animation and fast local session read
    // participate in navigation; plugin setup continues independently.
    unawaited(_initServices());
    final session = _hasSessionWithDeadline();
    await Future<void>.delayed(_splashDuration);
    final loggedIn = await session;

    if (!mounted) return;
    Navigator.of(context).pushReplacement(MaterialPageRoute(
      builder: (_) =>
          loggedIn ? const DashboardScreen() : const LoginScreen(),
      settings: RouteSettings(name: loggedIn ? '/dashboard' : '/login'),
    ));
  }

  Future<bool> _hasSessionWithDeadline() async {
    try {
      return await AuthService.hasSession().timeout(_splashDuration);
    } catch (_) {
      // Secure-storage failure/timeout falls back to login instead of leaving
      // the completed splash animation on screen.
      return false;
    }
  }

  Future<void> _initServices() async {
    // Keep the plugin ordering, but isolate failures so one optional service
    // cannot prevent the remaining services from starting.
    try {
      await BackgroundAnalysis.init();
    } catch (_) {}
    try {
      await MealAnalysisController.instance.init();
    } catch (_) {}
    try {
      await UpdateService.init();
    } catch (_) {}
  }

  @override
  void dispose() {
    _intro.dispose();
    _spin.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final fade = CurvedAnimation(parent: _intro, curve: Curves.easeOut);
    final pop = CurvedAnimation(parent: _intro, curve: Curves.easeOutBack);

    return Scaffold(
      backgroundColor: _bg,
      body: Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            SizedBox(
              width: 132,
              height: 132,
              child: Stack(
                alignment: Alignment.center,
                children: [
                  // Rotating macro ring doubles as the loading spinner.
                  AnimatedBuilder(
                    animation: Listenable.merge([_spin, _intro]),
                    builder: (_, _) => CustomPaint(
                      size: const Size(132, 132),
                      painter: _MacroRingPainter(
                        rotation: _spin.value * 2 * math.pi,
                        reveal: Curves.easeOut.transform(_intro.value),
                        colors: _ringColors,
                      ),
                    ),
                  ),
                  // Amber logo badge pops in at the centre.
                  ScaleTransition(
                    scale: Tween(begin: 0.6, end: 1.0).animate(pop),
                    child: FadeTransition(
                      opacity: fade,
                      child: Container(
                        width: 70,
                        height: 70,
                        decoration: BoxDecoration(
                          color: _amber700,
                          borderRadius: BorderRadius.circular(20),
                          boxShadow: [
                            BoxShadow(
                              color: _amber700.withValues(alpha: 0.35),
                              blurRadius: 18,
                              offset: const Offset(0, 6),
                            ),
                          ],
                        ),
                        child: const Icon(Icons.restaurant,
                            color: Colors.white, size: 34),
                      ),
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 26),
            FadeTransition(
              opacity: fade,
              child: SlideTransition(
                position: Tween(begin: const Offset(0, 0.4), end: Offset.zero)
                    .animate(pop),
                child: Column(
                  children: [
                    const Text(
                      'AI Food Diary',
                      style: TextStyle(
                        fontSize: 24,
                        fontWeight: FontWeight.w900,
                        color: _ink,
                        letterSpacing: 0.5,
                      ),
                    ),
                    const SizedBox(height: 6),
                    Text(
                      '拍下每一餐，讓 AI 看懂營養',
                      style: TextStyle(
                        fontSize: 13,
                        color: _ink.withValues(alpha: 0.55),
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// Paints the three-colour macro donut as a spinner. [reveal] (0..1) grows the
/// coloured arc on intro; [rotation] spins it continuously thereafter.
class _MacroRingPainter extends CustomPainter {
  _MacroRingPainter({
    required this.rotation,
    required this.reveal,
    required this.colors,
  });

  final double rotation;
  final double reveal;
  final List<Color> colors;

  @override
  void paint(Canvas canvas, Size size) {
    final center = size.center(Offset.zero);
    final radius = size.width / 2 - 6;
    const stroke = 7.0;
    final rect = Rect.fromCircle(center: center, radius: radius);

    // Faint full-circle track behind the arcs.
    canvas.drawCircle(
      center,
      radius,
      Paint()
        ..style = PaintingStyle.stroke
        ..strokeWidth = stroke
        ..color = const Color(0xFFEDE7DF),
    );

    // Three arcs filling up to 80% of the circle once fully revealed, with a
    // small gap between each so the macro split stays readable while spinning.
    final total = 2 * math.pi * 0.8 * reveal;
    final per = total / 3;
    const gap = 0.12;
    for (var i = 0; i < 3; i++) {
      final start = rotation + i * per;
      canvas.drawArc(
        rect,
        start,
        math.max(0.0, per - gap),
        false,
        Paint()
          ..style = PaintingStyle.stroke
          ..strokeWidth = stroke
          ..strokeCap = StrokeCap.round
          ..color = colors[i],
      );
    }
  }

  @override
  bool shouldRepaint(_MacroRingPainter old) =>
      old.rotation != rotation || old.reveal != reveal;
}
