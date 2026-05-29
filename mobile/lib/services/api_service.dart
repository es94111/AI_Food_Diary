import 'package:dio/dio.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

class ApiService {
  static const _baseUrl = 'https://aifood.shao.one';
  static const _tokenKey = 'hcs_token';
  static const _storage = FlutterSecureStorage();

  static Dio _dio() {
    return Dio(BaseOptions(
      baseUrl: _baseUrl,
      connectTimeout: const Duration(seconds: 10),
      receiveTimeout: const Duration(seconds: 10),
    ));
  }

  static Future<String?> getToken() async {
    return _storage.read(key: _tokenKey);
  }

  static Future<void> saveToken(String token) async {
    await _storage.write(key: _tokenKey, value: token);
  }

  static Future<void> clearToken() async {
    await _storage.delete(key: _tokenKey);
  }

  static Future<String> login(String email, String password) async {
    final dio = _dio();
    final res = await dio.post('/api/auth/login', data: {
      'email': email,
      'password': password,
    });

    final cookie = res.headers['set-cookie']?.first ?? '';
    final sessionCookie = cookie.split(';').first;

    final connRes = await dio.post(
      '/api/health/connections',
      data: {'provider': 'HEALTH_CONNECT', 'deviceName': 'Android'},
      options: Options(headers: {'Cookie': sessionCookie}),
    );

    final token = connRes.data['token'] as String;
    await saveToken(token);
    return token;
  }

  static Future<void> syncMetrics(List<Map<String, dynamic>> metrics) async {
    final token = await getToken();
    if (token == null) throw Exception('未登入');

    final dio = _dio();
    await dio.post(
      '/api/health/sync',
      data: {'source': 'HEALTH_CONNECT', 'metrics': metrics},
      options: Options(headers: {'Authorization': 'Bearer $token'}),
    );
  }

  static Future<Map<String, dynamic>> getSyncStatus() async {
    final token = await getToken();
    if (token == null) throw Exception('未登入');

    final dio = _dio();
    final res = await dio.get(
      '/api/health/sync',
      options: Options(headers: {'Authorization': 'Bearer $token'}),
    );
    return res.data as Map<String, dynamic>;
  }
}
