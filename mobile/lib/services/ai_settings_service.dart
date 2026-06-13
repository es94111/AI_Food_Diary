import 'api_client.dart';

/// One supported AI provider. Mirrors the web catalog in src/lib/ai-providers.ts.
class AiProvider {
  const AiProvider({
    required this.id,
    required this.label,
    required this.requiresBaseUrl,
    required this.defaultModel,
    required this.apiKeysUrl,
  });

  final String id;
  final String label;
  // Whether the user must enter their own base URL (OpenAI-compatible endpoints).
  final bool requiresBaseUrl;
  final String defaultModel;
  final String apiKeysUrl;
}

const List<AiProvider> kAiProviders = [
  AiProvider(
    id: 'openai',
    label: 'OpenAI',
    requiresBaseUrl: false,
    defaultModel: 'gpt-4.1-mini',
    apiKeysUrl: 'https://platform.openai.com/api-keys',
  ),
  AiProvider(
    id: 'gemini',
    label: 'Google Gemini',
    requiresBaseUrl: false,
    defaultModel: 'gemini-2.5-flash',
    apiKeysUrl: 'https://aistudio.google.com/app/apikey',
  ),
  AiProvider(
    id: 'compatible',
    label: '相容 OpenAI 的 API',
    requiresBaseUrl: true,
    defaultModel: '',
    apiKeysUrl: '',
  ),
];

AiProvider aiProviderById(String id) =>
    kAiProviders.firstWhere((p) => p.id == id, orElse: () => kAiProviders.first);

/// The user's saved AI settings. The API key itself is never returned by the
/// server — only whether one is set (hasKey).
class AiSettings {
  AiSettings({
    required this.provider,
    required this.baseUrl,
    required this.model,
    required this.hasKey,
  });

  final String provider;
  final String baseUrl;
  final String model;
  final bool hasKey;

  factory AiSettings.fromJson(Map<String, dynamic> j) => AiSettings(
        provider: (j['provider'] as String?) ?? 'openai',
        baseUrl: (j['baseUrl'] as String?) ?? '',
        model: (j['visionModel'] as String?) ?? '',
        hasKey: j['hasKey'] == true,
      );
}

class AiSettingsService {
  static final _api = ApiClient.instance;

  static Future<AiSettings> fetch() async {
    final res = await _api.get('/api/me/ai-settings');
    if (!ApiClient.ok(res)) {
      throw ApiException(ApiClient.errorMessage(res, '無法載入 AI 設定'),
          statusCode: res.statusCode);
    }
    final settings = res.data['settings'];
    return AiSettings.fromJson(
        settings is Map<String, dynamic> ? settings : <String, dynamic>{});
  }

  /// Lists the models the provider exposes (via the backend's
  /// `/api/me/ai-settings/models`, which proxies the OpenAI-compatible
  /// `GET /models`). [apiKey] is optional — the server falls back to the saved
  /// key when it's omitted, so the user need not re-type it.
  static Future<List<String>> listModels({
    required String provider,
    String? apiKey,
    String? baseUrl,
  }) async {
    final res = await _api.post('/api/me/ai-settings/models', data: {
      'provider': provider,
      if (apiKey != null && apiKey.isNotEmpty) 'apiKey': apiKey,
      if (baseUrl != null && baseUrl.isNotEmpty) 'baseUrl': baseUrl,
    });
    if (!ApiClient.ok(res)) {
      throw ApiException(ApiClient.errorMessage(res, '無法載入模型清單'),
          statusCode: res.statusCode);
    }
    final raw = res.data['models'];
    return raw is List ? raw.whereType<String>().toList() : <String>[];
  }

  static Future<void> save({
    required String provider,
    String? apiKey,
    String? baseUrl,
    required String model,
  }) async {
    final res = await _api.patch('/api/me/ai-settings', data: {
      'provider': provider,
      // Omit/blank apiKey keeps the previously saved key unchanged (server-side).
      if (apiKey != null && apiKey.isNotEmpty) 'apiKey': apiKey,
      if (baseUrl != null && baseUrl.isNotEmpty) 'baseUrl': baseUrl,
      'visionModel': model,
      'textModel': model,
    });
    if (!ApiClient.ok(res)) {
      throw ApiException(ApiClient.errorMessage(res, '儲存失敗，請確認欄位是否正確。'),
          statusCode: res.statusCode);
    }
  }
}
