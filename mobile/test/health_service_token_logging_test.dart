import 'dart:convert';
import 'dart:io';

import 'package:ai_food_mobile/services/api_client.dart';
import 'package:ai_food_mobile/services/app_logger.dart';
import 'package:ai_food_mobile/services/health_service.dart';
import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';

class _RegistrationAdapter implements HttpClientAdapter {
  _RegistrationAdapter(this.token);

  final String token;

  @override
  Future<ResponseBody> fetch(
    RequestOptions options,
    Stream<Uint8List>? requestStream,
    Future<void>? cancelFuture,
  ) async {
    expect(options.path, '/api/health/connections');
    return ResponseBody.fromString(
      jsonEncode({'token': token}),
      201,
      headers: {
        Headers.contentTypeHeader: [Headers.jsonContentType],
      },
    );
  }

  @override
  void close({bool force = false}) {}
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  const secureStorageChannel = MethodChannel(
    'plugins.it_nomads.com/flutter_secure_storage',
  );
  const pathProviderChannel = MethodChannel('plugins.flutter.io/path_provider');
  late Map<String, String> secureStore;
  late Directory logDirectory;
  late String debugOutput;
  final originalDebugPrint = debugPrint;

  setUp(() async {
    secureStore = {};
    debugOutput = '';
    logDirectory = await Directory.systemTemp.createTemp(
      'health_sync_token_logging_test_',
    );
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(secureStorageChannel, (call) async {
          final args = (call.arguments as Map?)?.cast<String, dynamic>() ?? {};
          switch (call.method) {
            case 'write':
              secureStore[args['key'] as String] = args['value'] as String;
              return null;
            case 'read':
              return secureStore[args['key'] as String];
            default:
              return null;
          }
        });
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(pathProviderChannel, (call) async {
          if (call.method == 'getApplicationDocumentsDirectory') {
            return logDirectory.path;
          }
          return null;
        });
    debugPrint = (String? message, {int? wrapWidth}) {
      debugOutput += '${message ?? ''}\n';
    };
    ApiClient.instance.debugResetForTesting();
  });

  tearDown(() {
    debugPrint = originalDebugPrint;
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(secureStorageChannel, null);
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(pathProviderChannel, null);
    ApiClient.instance.debugResetForTesting();
  });

  test(
    'registration token is stored but omitted from both log sinks',
    () async {
      const token = 'hcs_secret_bearer_token_for_regression_test';
      final dio = Dio(BaseOptions(baseUrl: ApiClient.baseUrl))
        ..httpClientAdapter = _RegistrationAdapter(token);
      ApiClient.instance.debugSetDioForTesting(dio);

      final returnedToken = await HealthService.debugEnsureTokenForTesting(
        'Test device',
      );
      final persistentLog = await AppLogger.readAll();

      expect(returnedToken, token);
      expect(secureStore['hcs_token'], token);
      expect(debugOutput, contains('connections response 201'));
      expect(persistentLog, contains('註冊同步裝置回應 201'));
      expect(debugOutput, isNot(contains(token)));
      expect(persistentLog, isNot(contains(token)));
    },
  );
}
