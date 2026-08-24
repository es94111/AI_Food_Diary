import 'package:flutter/material.dart';

import '../theme/app_theme.dart';
import '../services/google_auth.dart';
import 'dashboard_screen.dart';

class LoginScreen extends StatefulWidget {
  const LoginScreen({super.key});

  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  bool _loading = false;
  bool _googleConfigChecked = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    _loadGoogleConfig();
  }

  /// Resolve the Google client id from the backend so the SSO button works
  /// even when the APK was built without the dart-define.
  Future<void> _loadGoogleConfig() async {
    await GoogleAuth.ensureConfigured();
    if (!mounted) return;
    setState(() => _googleConfigChecked = true);
  }

  Future<void> _googleLogin() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final user = await GoogleAuth.signIn();
      if (user == null) return; // cancelled
      if (!mounted) return;
      Navigator.of(context).pushReplacement(
        MaterialPageRoute(
          builder: (_) => const DashboardScreen(),
          settings: const RouteSettings(name: '/dashboard'),
        ),
      );
    } catch (e) {
      if (mounted) setState(() => _error = e.toString());
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    return Scaffold(
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(24),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 420),
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Center(
                    child: Container(
                      width: 88,
                      height: 88,
                      decoration: BoxDecoration(
                        color: palette.brand.withValues(alpha: 0.12),
                        shape: BoxShape.circle,
                      ),
                      child: Icon(Icons.restaurant,
                          size: 44, color: palette.brand),
                    ),
                  ),
                  const SizedBox(height: 16),
                  const Text(
                    'AI Food Diary',
                    textAlign: TextAlign.center,
                    style: TextStyle(
                      fontSize: 28,
                      fontWeight: FontWeight.w900,
                      letterSpacing: -0.5,
                    ),
                  ),
                  const SizedBox(height: 4),
                  Text(
                    '登入或註冊都使用 Google SSO。',
                    textAlign: TextAlign.center,
                    style: TextStyle(color: palette.inkSoft),
                  ),
                  const SizedBox(height: 28),
                  if (!_googleConfigChecked)
                    const Center(child: CircularProgressIndicator())
                  else if (GoogleAuth.isConfigured) ...[
                    OutlinedButton.icon(
                      onPressed: _loading ? null : _googleLogin,
                      style: OutlinedButton.styleFrom(
                        padding: const EdgeInsets.symmetric(vertical: 14),
                      ),
                      icon: const Icon(Icons.login),
                      label: const Text('使用 Google 登入'),
                    ),
                    const SizedBox(height: 12),
                    Text(
                      '首次使用 Google 帳號會自動建立帳號。',
                      textAlign: TextAlign.center,
                      style: TextStyle(fontSize: 12, color: palette.inkSoft),
                    ),
                  ] else
                    Text(
                      'Google 登入尚未設定，請聯絡管理員。',
                      textAlign: TextAlign.center,
                      style: TextStyle(color: palette.danger),
                    ),
                  if (_loading) ...[
                    const SizedBox(height: 16),
                    const Center(child: CircularProgressIndicator()),
                  ],
                  if (_error != null) ...[
                    const SizedBox(height: 12),
                    Text(
                      _error!,
                      textAlign: TextAlign.center,
                      style: TextStyle(color: palette.danger),
                    ),
                  ],
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}
