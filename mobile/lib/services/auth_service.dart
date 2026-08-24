import 'package:sentry_flutter/sentry_flutter.dart';

import '../models/models.dart';
import 'api_client.dart';

class AuthService {
  static final _api = ApiClient.instance;

  static Future<bool> hasSession() => _api.hasSession();

  static Future<AppUser> loginWithGoogle(
    String idToken, {
    required String turnstileToken,
  }) async {
    final res = await _api.post('/api/auth/google', data: {
      'idToken': idToken,
      'cf-turnstile-response': turnstileToken,
    });
    if (!ApiClient.ok(res)) {
      Sentry.logger.warn('Google login failed', attributes: {
        'status': SentryAttribute.int(res.statusCode ?? 0),
      });
      throw ApiException(ApiClient.errorMessage(res, 'Google 登入失敗'),
          statusCode: res.statusCode);
    }
    Sentry.logger.info('Google login succeeded');
    return fetchMe();
  }

  static Future<AppUser> fetchMe() async {
    final res = await _api.get('/api/me', cache: true);
    if (!ApiClient.ok(res)) {
      throw ApiException(ApiClient.errorMessage(res, '無法取得使用者資料'),
          statusCode: res.statusCode);
    }
    return AppUser.fromJson(res.data['user'] as Map<String, dynamic>);
  }

  /// Last cached profile from a previous [fetchMe], or null if none yet. Lets
  /// the dashboard paint instantly on open instead of waiting on the network.
  static Future<AppUser?> cachedMe() async {
    final data = await _api.cached('/api/me');
    if (data is! Map<String, dynamic>) return null;
    final user = data['user'];
    if (user is! Map<String, dynamic>) return null;
    try {
      return AppUser.fromJson(user);
    } catch (_) {
      return null;
    }
  }

  static Future<void> linkGoogle(String idToken) async {
    final res = await _api.post('/api/auth/google/link', data: {'idToken': idToken});
    if (!ApiClient.ok(res)) {
      throw ApiException(ApiClient.errorMessage(res, 'Google 綁定失敗'),
          statusCode: res.statusCode);
    }
  }

  static Future<void> logout() async {
    try {
      await _api.post('/api/auth/logout');
    } catch (_) {
      // ignore network errors on logout
    }
    await _api.clearSession();
  }

  static Future<void> updateProfile({
    String? gender,
    String? birthDate,
    int? heightCm,
    double? weightKg,
    String? activityLevel,
    String? goal,
    int? calorieTarget,
    int? waterGoalMl,
  }) async {
    final res = await _api.patch('/api/me', data: {
      'gender': ?gender,
      if (birthDate != null && birthDate.isNotEmpty) 'birthDate': birthDate,
      'heightCm': ?heightCm,
      'weightKg': ?weightKg,
      'activityLevel': ?activityLevel,
      'goal': ?goal,
      'calorieTarget': ?calorieTarget,
      'waterGoalMl': ?waterGoalMl,
    });
    if (!ApiClient.ok(res)) {
      throw ApiException(ApiClient.errorMessage(res, '儲存失敗，請確認資料格式。'),
          statusCode: res.statusCode);
    }
  }

}
