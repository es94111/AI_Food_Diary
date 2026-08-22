import 'dart:convert';

/// Must stay aligned with the server's per-metric `raw` JSON limit.
const healthSyncMaxRawJsonChars = 32 * 1024;

/// Returns whether an optional health metric `raw` value can be sent to the
/// `/api/health/sync` endpoint without being rejected by its size guard.
bool healthRawFitsSyncLimit(Object? raw) {
  if (raw == null) return true;
  try {
    return jsonEncode(raw).length <= healthSyncMaxRawJsonChars;
  } catch (_) {
    return false;
  }
}
