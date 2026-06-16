import 'package:flutter/material.dart';

import '../services/auth_service.dart';
import '../services/google_auth.dart';
import '../services/turnstile_service.dart';
import '../widgets/turnstile_webview.dart';
import 'dashboard_screen.dart';
import 'register_screen.dart';

class LoginScreen extends StatefulWidget {
  const LoginScreen({super.key});

  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  final _emailCtrl = TextEditingController();
  final _passwordCtrl = TextEditingController();
  bool _loading = false;
  String? _error;

  String? _siteKey;
  bool _siteKeyChecked = false;
  String? _turnstileToken;
  final _turnstile = TurnstileController();

  @override
  void initState() {
    super.initState();
    _loadSiteKey();
    _loadGoogleConfig();
  }

  /// Resolve the Google client id from the backend so the sign-in button shows
  /// even if the APK was built without the GOOGLE_SERVER_CLIENT_ID dart-define.
  Future<void> _loadGoogleConfig() async {
    await GoogleAuth.ensureConfigured();
    if (mounted) setState(() {});
  }

  Future<void> _loadSiteKey() async {
    final key = await TurnstileService.siteKey();
    if (!mounted) return;
    setState(() {
      _siteKey = (key != null && key.isNotEmpty) ? key : null;
      _siteKeyChecked = true;
    });
  }

  @override
  void dispose() {
    _emailCtrl.dispose();
    _passwordCtrl.dispose();
    super.dispose();
  }

  bool get _needsTurnstile => _siteKey != null;

  Future<void> _login() async {
    if (_needsTurnstile && _turnstileToken == null) {
      setState(() => _error = '請先完成下方人機驗證');
      return;
    }
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      await AuthService.login(_emailCtrl.text, _passwordCtrl.text,
          turnstileToken: _turnstileToken);
      if (!mounted) return;
      Navigator.of(context).pushReplacement(
        MaterialPageRoute(builder: (_) => const DashboardScreen()),
      );
    } catch (e) {
      // A used/expired Turnstile token can't be reused — re-run the challenge
      // so the next attempt gets a fresh token instead of staying stuck on
      // "請先完成下方人機驗證".
      setState(() {
        _error = e.toString();
        _turnstileToken = null;
      });
      if (_needsTurnstile) await _turnstile.reset();
    } finally {
      if (mounted) setState(() => _loading = false);
    }
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
        MaterialPageRoute(builder: (_) => const DashboardScreen()),
      );
    } catch (e) {
      setState(() => _error = e.toString());
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
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
                  const Icon(Icons.restaurant, size: 64, color: Color(0xFFB45309)),
                  const SizedBox(height: 16),
                  const Text('AI Food Diary',
                      textAlign: TextAlign.center,
                      style: TextStyle(fontSize: 28, fontWeight: FontWeight.w900)),
                  const SizedBox(height: 4),
                  const Text('回到你的 AI 飲食紀錄。',
                      textAlign: TextAlign.center,
                      style: TextStyle(color: Colors.black54)),
                  const SizedBox(height: 28),
                  TextField(
                    controller: _emailCtrl,
                    keyboardType: TextInputType.emailAddress,
                    autofillHints: const [AutofillHints.email],
                    decoration: const InputDecoration(
                        labelText: '電子郵件', border: OutlineInputBorder()),
                  ),
                  const SizedBox(height: 14),
                  TextField(
                    controller: _passwordCtrl,
                    obscureText: true,
                    onSubmitted: (_) => _login(),
                    decoration: const InputDecoration(
                        labelText: '密碼', border: OutlineInputBorder()),
                  ),
                  // Human verification sits directly below the credentials.
                  if (_needsTurnstile) ...[
                    const SizedBox(height: 14),
                    Align(
                      alignment: Alignment.centerLeft,
                      child: Text(
                        _turnstileToken == null ? '人機驗證' : '✅ 已完成人機驗證',
                        style: TextStyle(
                          fontSize: 13,
                          color: _turnstileToken == null
                              ? Colors.black54
                              : Colors.green[700],
                        ),
                      ),
                    ),
                    const SizedBox(height: 6),
                    TurnstileWebView(
                      siteKey: _siteKey!,
                      controller: _turnstile,
                      onToken: (t) => setState(() {
                        _turnstileToken = t;
                        if (_error == '請先完成下方人機驗證') _error = null;
                      }),
                      onExpired: () => setState(() => _turnstileToken = null),
                    ),
                  ],
                  if (_error != null) ...[
                    const SizedBox(height: 12),
                    Text(_error!, style: const TextStyle(color: Colors.red)),
                  ],
                  const SizedBox(height: 20),
                  FilledButton(
                    onPressed: _loading ? null : _login,
                    style: FilledButton.styleFrom(
                        padding: const EdgeInsets.symmetric(vertical: 14)),
                    child: _loading
                        ? const SizedBox(
                            height: 20,
                            width: 20,
                            child: CircularProgressIndicator(
                                strokeWidth: 2, color: Colors.white))
                        : const Text('登入'),
                  ),
                  if (GoogleAuth.isConfigured) ...[
                    const SizedBox(height: 12),
                    Row(
                      children: const [
                        Expanded(child: Divider()),
                        Padding(
                          padding: EdgeInsets.symmetric(horizontal: 8),
                          child: Text('或', style: TextStyle(color: Colors.black45)),
                        ),
                        Expanded(child: Divider()),
                      ],
                    ),
                    const SizedBox(height: 12),
                    OutlinedButton.icon(
                      onPressed: _loading ? null : _googleLogin,
                      style: OutlinedButton.styleFrom(
                          padding: const EdgeInsets.symmetric(vertical: 14)),
                      icon: const Icon(Icons.login),
                      label: const Text('使用 Google 登入'),
                    ),
                  ],
                  const SizedBox(height: 14),
                  TextButton(
                    onPressed: _loading
                        ? null
                        : () => Navigator.of(context).push(
                              MaterialPageRoute(
                                  builder: (_) => const RegisterScreen()),
                            ),
                    child: const Text('還沒有帳號？註冊'),
                  ),
                  if (!_siteKeyChecked)
                    const Padding(
                      padding: EdgeInsets.only(top: 8),
                      child: Text('檢查驗證設定中...',
                          textAlign: TextAlign.center,
                          style: TextStyle(fontSize: 11, color: Colors.black38)),
                    ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}
