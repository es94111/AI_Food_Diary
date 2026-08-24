import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:webview_flutter/webview_flutter.dart';

import '../services/api_client.dart';

bool _sameOrigin(Uri left, Uri right) {
  if (left.scheme != right.scheme || left.host != right.host) return false;
  final leftPort = left.hasPort ? left.port : (left.scheme == 'https' ? 443 : 80);
  final rightPort =
      right.hasPort ? right.port : (right.scheme == 'https' ? 443 : 80);
  return leftPort == rightPort;
}

/// Controls a [TurnstileWebView]. Tokens are single-use, so the login screen
/// resets this controller after every server attempt.
class TurnstileController {
  _TurnstileWebViewState? _state;

  void _attach(_TurnstileWebViewState state) => _state = state;

  void _detach(_TurnstileWebViewState state) {
    if (identical(_state, state)) _state = null;
  }

  Future<void> reset() async => _state?._reset();
}

/// Inline Cloudflare Turnstile widget for the native login screen.
///
/// Loading the HTML with the production API origin as [baseUrl] gives
/// siteverify the real frontend hostname instead of an opaque WebView origin.
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
      ..setNavigationDelegate(
        NavigationDelegate(
          onNavigationRequest: (request) {
            final uri = Uri.tryParse(request.url);
            if (uri == null || uri.scheme == 'about') {
              return uri == null
                  ? NavigationDecision.prevent
                  : NavigationDecision.navigate;
            }
            final baseOrigin = Uri.parse(ApiClient.baseUrl);
            final cloudflareOrigin = Uri.parse(
              'https://challenges.cloudflare.com',
            );
            if (!_sameOrigin(uri, baseOrigin) &&
                !_sameOrigin(uri, cloudflareOrigin)) {
              return NavigationDecision.prevent;
            }
            return NavigationDecision.navigate;
          },
        ),
      )
      ..addJavaScriptChannel(
        'TurnstileChannel',
        onMessageReceived: (message) {
          final value = message.message.trim();
          if (value == '__expired__' || value == '__error__') {
            widget.onExpired?.call();
          } else if (value.isNotEmpty) {
            widget.onToken(value);
          }
        },
      )
      ..loadHtmlString(
        _html(widget.siteKey),
        baseUrl: ApiClient.baseUrl,
      );
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

  Future<void> _reset() async {
    try {
      await _controller.runJavaScript(
        'if (window.turnstile) { window.turnstile.reset(); }',
      );
    } catch (_) {
      // The WebView may not be ready yet; the initial widget can still issue a
      // token and the next server rejection will trigger another reset.
    }
  }

  String _html(String siteKey) {
    final escapedSiteKey = const HtmlEscape(HtmlEscapeMode.attribute)
        .convert(siteKey);
    final siteKeyJson = jsonEncode(siteKey);
    return '''
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
       data-sitekey="$escapedSiteKey"
       data-action="login"
       data-callback="onToken"
       data-expired-callback="onExpired"
       data-error-callback="onError"
       data-theme="light"></div>
  <script>
    // Keep the site key available only to the widget markup; this assignment
    // also makes the value explicit for WebView debugging without accepting
    // any token from page storage or URL parameters.
    const turnstileSiteKey = $siteKeyJson;
    function post(message) {
      if (window.TurnstileChannel) {
        window.TurnstileChannel.postMessage(message);
      }
    }
    function onToken(token) { post(token); }
    function onExpired() { post('__expired__'); }
    function onError() { post('__error__'); }
  </script>
</body>
</html>
''';
  }

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      height: 80,
      child: WebViewWidget(controller: _controller),
    );
  }
}
