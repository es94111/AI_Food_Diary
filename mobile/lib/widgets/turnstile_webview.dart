import 'package:flutter/material.dart';
import 'package:webview_flutter/webview_flutter.dart';

import '../services/api_client.dart';

/// Controls a [TurnstileWebView]. Turnstile tokens are single-use — once the
/// backend verifies one (even on a failed login), it can't be reused — so after
/// a failed attempt call [reset] to re-run the challenge and get a fresh token.
class TurnstileController {
  _TurnstileWebViewState? _state;

  void _attach(_TurnstileWebViewState state) => _state = state;
  void _detach(_TurnstileWebViewState state) {
    if (identical(_state, state)) _state = null;
  }

  /// Re-runs the Turnstile challenge; a new token arrives via onToken.
  Future<void> reset() async => _state?._reset();
}

/// Inline Cloudflare Turnstile widget rendered in a small WebView, shown
/// directly below the login fields (mirroring the web layout).
///
/// The HTML is loaded with the real site origin as `baseUrl` so Cloudflare's
/// server-side hostname check passes.
class TurnstileWebView extends StatefulWidget {
  const TurnstileWebView({
    super.key,
    required this.siteKey,
    required this.onToken,
    this.onExpired,
    this.controller,
  });

  final String siteKey;
  final ValueChanged<String> onToken;
  final VoidCallback? onExpired;

  /// Optional handle for re-running the challenge (see [TurnstileController]).
  final TurnstileController? controller;

  @override
  State<TurnstileWebView> createState() => _TurnstileWebViewState();
}

class _TurnstileWebViewState extends State<TurnstileWebView> {
  late final WebViewController _controller;

  @override
  void initState() {
    super.initState();
    widget.controller?._attach(this);
    _controller = WebViewController()
      ..setJavaScriptMode(JavaScriptMode.unrestricted)
      ..setBackgroundColor(Colors.transparent)
      ..addJavaScriptChannel(
        'TurnstileChannel',
        onMessageReceived: (msg) {
          final data = msg.message.trim();
          if (data == '__expired__' || data == '__error__') {
            widget.onExpired?.call();
          } else if (data.isNotEmpty) {
            widget.onToken(data);
          }
        },
      )
      ..loadHtmlString(_html(widget.siteKey), baseUrl: ApiClient.baseUrl);
  }

  @override
  void didUpdateWidget(TurnstileWebView oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.controller != widget.controller) {
      oldWidget.controller?._detach(this);
      widget.controller?._attach(this);
    }
  }

  @override
  void dispose() {
    widget.controller?._detach(this);
    super.dispose();
  }

  /// Re-runs the Turnstile challenge so a fresh, unused token is issued.
  /// No-op if the script hasn't loaded yet (the initial challenge supplies one).
  Future<void> _reset() async {
    try {
      await _controller
          .runJavaScript('if (window.turnstile) { turnstile.reset(); }');
    } catch (_) {
      // WebView not ready — ignore.
    }
  }

  String _html(String siteKey) => '''
<!DOCTYPE html>
<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1">
  <script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer></script>
  <style>
    html,body{margin:0;padding:0;background:transparent;display:flex;justify-content:center;}
    .cf-turnstile{margin:4px 0;}
  </style>
</head>
<body>
  <div class="cf-turnstile"
       data-sitekey="$siteKey"
       data-callback="onToken"
       data-expired-callback="onExpired"
       data-error-callback="onError"
       data-theme="light"></div>
  <script>
    function post(m){ if(window.TurnstileChannel){ window.TurnstileChannel.postMessage(m); } }
    function onToken(t){ post(t); }
    function onExpired(){ post('__expired__'); }
    function onError(){ post('__error__'); }
  </script>
</body>
</html>
''';

  @override
  Widget build(BuildContext context) {
    // Turnstile's widget is ~65px tall; give it a little breathing room.
    return SizedBox(
      height: 80,
      child: WebViewWidget(controller: _controller),
    );
  }
}
