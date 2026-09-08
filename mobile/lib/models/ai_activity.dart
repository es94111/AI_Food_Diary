part of 'models.dart';

/// The authenticated user attributed to an audit event.
class AiActivityUser {
  const AiActivityUser({required this.id, this.name, this.email});

  final String id;
  final String? name;
  final String? email;

  String get displayName {
    final trimmedName = name?.trim();
    if (trimmedName != null && trimmedName.isNotEmpty) return trimmedName;
    final trimmedEmail = email?.trim();
    if (trimmedEmail != null && trimmedEmail.isNotEmpty) return trimmedEmail;
    return id;
  }

  factory AiActivityUser.fromJson(Map<String, dynamic> json) => AiActivityUser(
    id: _auditString(json['id']) ?? '',
    name: _auditString(json['name']),
    email: _auditString(json['email']),
  );

  static AiActivityUser? fromValue(dynamic value) {
    if (value is Map) {
      return AiActivityUser.fromJson(Map<String, dynamic>.from(value));
    }
    final id = _auditString(value);
    return id == null ? null : AiActivityUser(id: id);
  }
}

/// One immutable AI audit event returned by `/api/ai-activity`.
class AiActivityEvent {
  const AiActivityEvent({
    required this.id,
    required this.createdAt,
    required this.actorType,
    required this.actorSource,
    required this.action,
    required this.resourceType,
    required this.resourceId,
    required this.status,
    this.user,
    this.mcpToolName,
    this.beforeState,
    this.afterState,
    this.requestId,
    this.correlationId,
    this.errorCode,
    this.errorMessage,
    this.isRestored = false,
    this.restoredAt,
    this.restoredBy,
    this.restoreActionId,
    this.originalAiActionId,
    this.restoreReason,
    this.resourceVersion,
  });

  final String id;
  final DateTime createdAt;
  final AiActivityUser? user;
  final String actorType;
  final String actorSource;
  final String action;
  final String resourceType;
  final String resourceId;
  final String? mcpToolName;
  final dynamic beforeState;
  final dynamic afterState;
  final String? requestId;
  final String? correlationId;
  final String status;
  final String? errorCode;
  final String? errorMessage;
  final bool isRestored;
  final DateTime? restoredAt;
  final AiActivityUser? restoredBy;
  final String? restoreActionId;
  final String? originalAiActionId;
  final String? restoreReason;
  final String? resourceVersion;

  factory AiActivityEvent.fromJson(Map<String, dynamic> json) {
    final resource = json['resource'] is Map
        ? Map<String, dynamic>.from(json['resource'] as Map)
        : const <String, dynamic>{};
    final timestamp = _auditDate(
      json['timestamp'] ?? json['occurredAt'] ?? json['createdAt'],
    );
    return AiActivityEvent(
      id: _auditString(json['id']) ?? '',
      createdAt: timestamp,
      user:
          AiActivityUser.fromValue(json['user']) ??
          (_auditString(json['userId']) == null
              ? null
              : AiActivityUser(
                  id: _auditString(json['userId'])!,
                  name: _auditString(json['userName']),
                  email: _auditString(json['userEmail']),
                )),
      actorType: _auditString(json['actorType']) ?? 'unknown',
      actorSource: _auditString(json['actorSource']) ?? 'unknown',
      action: _auditString(json['action']) ?? 'unknown',
      resourceType:
          _auditString(json['resourceType'] ?? resource['type']) ?? 'unknown',
      resourceId: _auditString(json['resourceId'] ?? resource['id']) ?? '',
      mcpToolName: _auditString(json['mcpToolName']),
      beforeState: json['beforeState'],
      afterState: json['afterState'],
      requestId: _auditString(json['requestId']),
      correlationId: _auditString(json['correlationId']),
      status: _auditString(json['status']) ?? 'unknown',
      errorCode: _auditString(json['errorCode']),
      errorMessage: _auditString(json['errorMessage']),
      isRestored: json['isRestored'] == true || json['restored'] == true,
      restoredAt: _auditNullableDate(json['restoredAt']),
      restoredBy: AiActivityUser.fromValue(
        json['restoredBy'] ?? json['restoredByUser'],
      ),
      restoreActionId: _auditString(json['restoreActionId']),
      originalAiActionId: _auditString(json['originalAiActionId']),
      restoreReason: _auditString(json['restoreReason']),
      resourceVersion: _auditString(json['resourceVersion']),
    );
  }
}

class AiActivityPage {
  const AiActivityPage({required this.events, this.nextCursor});

  final List<AiActivityEvent> events;
  final String? nextCursor;

  factory AiActivityPage.fromJson(Map<String, dynamic> json) {
    final events = json['events'] is List ? json['events'] as List : const [];
    return AiActivityPage(
      events: events
          .whereType<Map>()
          .map(
            (event) =>
                AiActivityEvent.fromJson(Map<String, dynamic>.from(event)),
          )
          .toList(growable: false),
      nextCursor: _auditString(json['nextCursor']),
    );
  }
}

/// Server-computed restore eligibility and conflict preview.
///
/// The app must never infer these fields from a cached event. The restore API
/// repeats the same authorization and version checks at execution time.
class AiRestorePreview {
  const AiRestorePreview({
    required this.eligible,
    required this.conflict,
    this.conflictReason,
    this.currentState,
    this.afterRestoreState,
    this.expectedVersion,
  });

  final bool eligible;
  final bool conflict;
  final String? conflictReason;
  final dynamic currentState;
  final dynamic afterRestoreState;
  final String? expectedVersion;

  factory AiRestorePreview.fromJson(Map<String, dynamic> json) {
    final conflictValue = json['conflict'];
    final conflictDetails = conflictValue is Map
        ? Map<String, dynamic>.from(conflictValue)
        : const <String, dynamic>{};
    return AiRestorePreview(
      eligible: json['eligible'] == true,
      conflict: conflictValue == true || conflictValue is Map,
      conflictReason: _auditString(
        json['conflictReason'] ?? conflictDetails['reason'],
      ),
      currentState: json['currentState'],
      afterRestoreState: json['afterRestoreState'] ?? json['restoredState'],
      expectedVersion: _auditString(json['expectedVersion']),
    );
  }
}

class AiActivityDetail {
  const AiActivityDetail({required this.event, this.restorePreview});

  final AiActivityEvent event;
  final AiRestorePreview? restorePreview;

  factory AiActivityDetail.fromJson(Map<String, dynamic> json) {
    final eventValue = json['event'];
    if (eventValue is! Map) {
      throw const FormatException('Invalid AI activity detail response');
    }
    final previewValue = json['restorePreview'];
    return AiActivityDetail(
      event: AiActivityEvent.fromJson(Map<String, dynamic>.from(eventValue)),
      restorePreview: previewValue is Map
          ? AiRestorePreview.fromJson(Map<String, dynamic>.from(previewValue))
          : null,
    );
  }
}

/// Filters accepted by the AI activity list endpoint.
class AiActivityQuery {
  const AiActivityQuery({
    this.from,
    this.to,
    this.userId,
    this.actorSource,
    this.mcpToolName,
    this.resourceType,
    this.action,
    this.status,
    this.cursor,
    this.limit = 30,
  });

  final DateTime? from;
  final DateTime? to;
  final String? userId;
  final String? actorSource;
  final String? mcpToolName;
  final String? resourceType;
  final String? action;
  final String? status;
  final String? cursor;
  final int limit;

  bool get hasFilters =>
      from != null ||
      to != null ||
      _hasAuditText(userId) ||
      _hasAuditText(actorSource) ||
      _hasAuditText(mcpToolName) ||
      _hasAuditText(resourceType) ||
      _hasAuditText(action) ||
      _hasAuditText(status);

  AiActivityQuery withCursor(String? value) => AiActivityQuery(
    from: from,
    to: to,
    userId: userId,
    actorSource: actorSource,
    mcpToolName: mcpToolName,
    resourceType: resourceType,
    action: action,
    status: status,
    cursor: value,
    limit: limit,
  );

  Map<String, dynamic> toQueryParameters() => {
    if (from != null) 'from': from!.toUtc().toIso8601String(),
    if (to != null) 'to': to!.toUtc().toIso8601String(),
    if (_hasAuditText(userId)) 'userId': userId!.trim(),
    if (_hasAuditText(actorSource)) 'actorSource': actorSource!.trim(),
    if (_hasAuditText(mcpToolName)) 'mcpToolName': mcpToolName!.trim(),
    if (_hasAuditText(resourceType)) 'resourceType': resourceType!.trim(),
    if (_hasAuditText(action)) 'action': action!.trim(),
    if (_hasAuditText(status)) 'status': status!.trim(),
    if (_hasAuditText(cursor)) 'cursor': cursor!.trim(),
    'limit': limit.clamp(1, 100),
  };
}

/// Formats an audit snapshot as inert, selectable text.
///
/// Strings are deliberately not parsed as HTML or Markdown. Structured JSON is
/// pretty-printed only; it is never interpreted as instructions or markup.
String formatAiAuditState(dynamic value) {
  if (value == null) return '—';
  if (value is String) return value.trim().isEmpty ? '—' : value;
  try {
    return const JsonEncoder.withIndent('  ').convert(value);
  } catch (_) {
    return value.toString();
  }
}

String? _auditString(dynamic value) {
  if (value == null) return null;
  final text = value is String ? value : value.toString();
  final trimmed = text.trim();
  return trimmed.isEmpty ? null : trimmed;
}

bool _hasAuditText(String? value) => value != null && value.trim().isNotEmpty;

DateTime _auditDate(dynamic value) =>
    _auditNullableDate(value) ??
    DateTime.fromMillisecondsSinceEpoch(0, isUtc: true);

DateTime? _auditNullableDate(dynamic value) {
  final text = _auditString(value);
  return text == null ? null : DateTime.tryParse(text);
}
