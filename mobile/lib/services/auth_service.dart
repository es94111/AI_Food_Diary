import '../models/models.dart';
import 'api_client.dart';

class AuthService {
  static final _api = ApiClient.instance;

  static Future<bool> hasSession() => _api.hasSession();

  static Future<AppUser> login(String email, String password,
      {String? turnstileToken}) async {
    final res = await _api.post('/api/auth/login', data: {
      'email': email.trim(),
      'password': password,
      if (turnstileToken != null) 'cf-turnstile-response': turnstileToken,
    });
    if (!ApiClient.ok(res)) {
      throw ApiException(ApiClient.errorMessage(res, 'Email 或密碼錯誤'),
          statusCode: res.statusCode);
    }
    // Cookie captured by the interceptor; fetch full profile.
    return fetchMe();
  }

  static Future<AppUser> register(
      String email, String password, String? name) async {
    final res = await _api.post('/api/auth/register', data: {
      'email': email.trim(),
      'password': password,
      if (name != null && name.trim().isNotEmpty) 'name': name.trim(),
    });
    if (!ApiClient.ok(res)) {
      throw ApiException(ApiClient.errorMessage(res, '註冊失敗'),
          statusCode: res.statusCode);
    }
    return fetchMe();
  }

  static Future<AppUser> fetchMe() async {
    final res = await _api.get('/api/me');
    if (!ApiClient.ok(res)) {
      throw ApiException(ApiClient.errorMessage(res, '無法取得使用者資料'),
          statusCode: res.statusCode);
    }
    return AppUser.fromJson(res.data['user'] as Map<String, dynamic>);
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
  }) async {
    final res = await _api.patch('/api/me', data: {
      if (gender != null) 'gender': gender,
      if (birthDate != null && birthDate.isNotEmpty) 'birthDate': birthDate,
      if (heightCm != null) 'heightCm': heightCm,
      if (weightKg != null) 'weightKg': weightKg,
      if (activityLevel != null) 'activityLevel': activityLevel,
      if (goal != null) 'goal': goal,
      if (calorieTarget != null) 'calorieTarget': calorieTarget,
    });
    if (!ApiClient.ok(res)) {
      throw ApiException(ApiClient.errorMessage(res, '儲存失敗，請確認資料格式。'),
          statusCode: res.statusCode);
    }
  }

  // ---- admin ----

  static Future<bool> getRegistrationOpen() async {
    final res = await _api.get('/api/admin/settings');
    if (!ApiClient.ok(res)) {
      throw ApiException(ApiClient.errorMessage(res, '權限不足'),
          statusCode: res.statusCode);
    }
    return res.data['registrationOpen'] == true;
  }

  static Future<bool> setRegistrationOpen(bool open) async {
    final res =
        await _api.patch('/api/admin/settings', data: {'registrationOpen': open});
    if (!ApiClient.ok(res)) {
      throw ApiException(ApiClient.errorMessage(res, '更新失敗'),
          statusCode: res.statusCode);
    }
    return res.data['registrationOpen'] == true;
  }
}
