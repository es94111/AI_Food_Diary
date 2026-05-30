import 'package:flutter/material.dart';
import 'package:webview_flutter/webview_flutter.dart';

import '../services/api_client.dart';

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
  });

  final String siteKey;
  final ValueChanged<String> onToken;
  final VoidCallback? onExpired;

  @override
  State<TurnstileWebView> createState() => _TurnstileWebViewState();
}

class _TurnstileWebViewState extends State<TurnstileWebView> {
  late final WebViewController _controller;

  @override
  void initState() {
    super.initState();
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
