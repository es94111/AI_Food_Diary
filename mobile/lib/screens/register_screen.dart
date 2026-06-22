import 'package:flutter/material.dart';

import '../services/auth_service.dart';
import '../services/turnstile_service.dart';
import '../widgets/turnstile_webview.dart';
import 'dashboard_screen.dart';

class RegisterScreen extends StatefulWidget {
  const RegisterScreen({super.key});

  @override
  State<RegisterScreen> createState() => _RegisterScreenState();
}

class _RegisterScreenState extends State<RegisterScreen> {
  final _nameCtrl = TextEditingController();
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
    _nameCtrl.dispose();
    _emailCtrl.dispose();
    _passwordCtrl.dispose();
    super.dispose();
  }

  bool get _needsTurnstile => _siteKey != null;

  Future<void> _register() async {
    if (_passwordCtrl.text.length < 8) {
      setState(() => _error = '密碼至少需要 8 個字元');
      return;
    }
    if (_needsTurnstile && _turnstileToken == null) {
      setState(() => _error = '請先完成下方人機驗證');
      return;
    }
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      await AuthService.register(
          _emailCtrl.text, _passwordCtrl.text, _nameCtrl.text,
          turnstileToken: _turnstileToken);
      if (!mounted) return;
      Navigator.of(context).pushAndRemoveUntil(
        MaterialPageRoute(
            builder: (_) => const DashboardScreen(),
            settings: const RouteSettings(name: '/dashboard')),
        (route) => false,
      );
    } catch (e) {
      // A used/expired Turnstile token can't be reused — re-run the challenge
      // so the next attempt gets a fresh token.
      setState(() {
        _error = e.toString();
        _turnstileToken = null;
      });
      if (_needsTurnstile) await _turnstile.reset();
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('建立帳號')),
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(24),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 420),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  const Text('開始用照片追蹤營養與熱量。',
                      style: TextStyle(color: Colors.black54)),
                  const SizedBox(height: 20),
                  TextField(
                    controller: _nameCtrl,
                    decoration: const InputDecoration(
                        labelText: '名稱（選填）', border: OutlineInputBorder()),
                  ),
                  const SizedBox(height: 14),
                  TextField(
                    controller: _emailCtrl,
                    keyboardType: TextInputType.emailAddress,
                    decoration: const InputDecoration(
                        labelText: '電子郵件', border: OutlineInputBorder()),
                  ),
                  const SizedBox(height: 14),
                  TextField(
                    controller: _passwordCtrl,
                    obscureText: true,
                    decoration: const InputDecoration(
                        labelText: '密碼（至少 8 字元）',
                        border: OutlineInputBorder()),
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
                    onPressed: _loading ? null : _register,
                    style: FilledButton.styleFrom(
                        padding: const EdgeInsets.symmetric(vertical: 14)),
                    child: _loading
                        ? const SizedBox(
                            height: 20,
                            width: 20,
                            child: CircularProgressIndicator(
                                strokeWidth: 2, color: Colors.white))
                        : const Text('建立帳號'),
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
