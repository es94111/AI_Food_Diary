import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import '../models/models.dart';
import '../services/ai_activity_service.dart';
import '../theme/app_theme.dart';

class AiActivityDetailScreen extends StatefulWidget {
  const AiActivityDetailScreen({
    super.key,
    required this.eventId,
    this.initialEvent,
    this.loadDetail,
    this.restoreAction,
  });

  final String eventId;
  final AiActivityEvent? initialEvent;
  final AiActivityDetailLoader? loadDetail;
  final AiActivityRestoreAction? restoreAction;

  @override
  State<AiActivityDetailScreen> createState() => _AiActivityDetailScreenState();
}

class _AiActivityDetailScreenState extends State<AiActivityDetailScreen> {
  AiActivityDetail? _detail;
  String? _error;
  bool _loading = true;
  bool _restoring = false;

  AiActivityDetailLoader get _loadDetail =>
      widget.loadDetail ?? AiActivityService.fetchDetail;
  AiActivityRestoreAction get _restoreAction =>
      widget.restoreAction ?? AiActivityService.restore;

  AiActivityEvent? get _event => _detail?.event ?? widget.initialEvent;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final detail = await _loadDetail(widget.eventId);
      if (mounted) setState(() => _detail = detail);
    } catch (error) {
      final message = error.toString();
      await _load();
      if (!mounted) return;
      setState(() => _error = message);
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(SnackBar(content: Text(message)));
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _confirmRestore(AiRestorePreview preview) async {
    // Eligibility and preview are supplied by the server. The app only renders
    // them and never invents a local fallback when they are absent or conflict.
    if (!preview.eligible || preview.conflict || _restoring) return;
    final reason = await showDialog<String>(
      context: context,
      barrierDismissible: false,
      builder: (context) =>
          _RestoreConfirmationDialog(event: _event!, preview: preview),
    );
    if (reason == null || !mounted) return;

    setState(() {
      _restoring = true;
      _error = null;
    });
    try {
      await _restoreAction(
        widget.eventId,
        reason: reason,
        expectedVersion: preview.expectedVersion,
      );
      // The source event is immutable. Reload so the newly appended restore
      // event and derived restore state come from the server.
      await _load();
      if (!mounted) return;
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(const SnackBar(content: Text('已建立還原紀錄。')));
    } catch (error) {
      if (mounted) setState(() => _error = error.toString());
    } finally {
      if (mounted) setState(() => _restoring = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final event = _event;
    return Scaffold(
      appBar: AppBar(
        title: const Text(
          'AI 操作詳情',
          style: TextStyle(fontWeight: FontWeight.w800),
        ),
        actions: [
          IconButton(
            tooltip: '重新整理',
            onPressed: _loading ? null : _load,
            icon: const Icon(Icons.refresh),
          ),
        ],
        bottom: _loading && event != null
            ? const PreferredSize(
                preferredSize: Size.fromHeight(3),
                child: LinearProgressIndicator(minHeight: 3),
              )
            : null,
      ),
      body: event == null
          ? _loading
                ? const Center(child: CircularProgressIndicator())
                : _LoadFailure(message: _error, onRetry: _load)
          : ListView(
              padding: const EdgeInsets.fromLTRB(16, 12, 16, 32),
              children: [
                if (_error != null) ...[
                  _PersistentError(message: _error!, onRetry: _load),
                  const SizedBox(height: 12),
                ],
                _EventSummary(event: event),
                const SizedBox(height: 12),
                _InfoSection(
                  title: '操作資訊',
                  children: [
                    _InfoRow(
                      label: '操作時間',
                      value: DateFormat(
                        'yyyy/MM/dd HH:mm:ss',
                      ).format(event.createdAt.toLocal()),
                    ),
                    _InfoRow(label: 'AI 來源', value: event.actorSource),
                    _InfoRow(label: 'Actor 類型', value: event.actorType),
                    _InfoRow(
                      label: '使用者',
                      value: event.user?.displayName ?? '未知使用者',
                    ),
                    if (event.user?.email != null)
                      _InfoRow(label: 'Email', value: event.user!.email!),
                    _InfoRow(
                      label: 'MCP Tool',
                      value: event.mcpToolName ?? '—',
                      monospace: true,
                    ),
                    _InfoRow(label: 'Action', value: event.action),
                    _InfoRow(label: 'Status', value: event.status),
                    if (event.errorCode != null)
                      _InfoRow(
                        label: '錯誤代碼',
                        value: event.errorCode!,
                        monospace: true,
                      ),
                    if (event.errorMessage != null)
                      _InfoRow(label: '錯誤說明', value: event.errorMessage!),
                  ],
                ),
                const SizedBox(height: 12),
                _InfoSection(
                  title: '影響資料',
                  children: [
                    _InfoRow(label: 'Resource', value: event.resourceType),
                    _InfoRow(
                      label: 'Resource ID',
                      value: event.resourceId.isEmpty ? '—' : event.resourceId,
                      monospace: true,
                    ),
                    if (event.resourceVersion != null)
                      _InfoRow(
                        label: 'Resource 版本',
                        value: event.resourceVersion!,
                        monospace: true,
                      ),
                    _InfoRow(
                      label: 'Request ID',
                      value: event.requestId ?? '—',
                      monospace: true,
                    ),
                    _InfoRow(
                      label: 'Correlation ID',
                      value: event.correlationId ?? '—',
                      monospace: true,
                    ),
                    if (event.originalAiActionId != null)
                      _InfoRow(
                        label: '原 AI Action ID',
                        value: event.originalAiActionId!,
                        monospace: true,
                      ),
                  ],
                ),
                const SizedBox(height: 12),
                _StateSection(title: '操作前狀態', state: event.beforeState),
                const SizedBox(height: 12),
                _StateSection(title: '操作後狀態', state: event.afterState),
                const SizedBox(height: 12),
                _RestoreSection(
                  event: event,
                  preview: _detail?.restorePreview,
                  loading: _loading,
                  restoring: _restoring,
                  onRestore: _confirmRestore,
                ),
              ],
            ),
    );
  }
}

class _EventSummary extends StatelessWidget {
  const _EventSummary({required this.event});

  final AiActivityEvent event;

  @override
  Widget build(BuildContext context) => Card(
    margin: EdgeInsets.zero,
    child: Padding(
      padding: const EdgeInsets.all(16),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          CircleAvatar(
            backgroundColor: context.palette.amberSurface,
            foregroundColor: context.palette.amberInk,
            child: const Icon(Icons.auto_awesome_outlined),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  event.action,
                  style: const TextStyle(
                    fontSize: 18,
                    fontWeight: FontWeight.w800,
                  ),
                ),
                const SizedBox(height: 4),
                Text(
                  '${event.actorSource} · ${event.resourceType}',
                  style: TextStyle(color: context.palette.inkSoft),
                ),
                if (event.isRestored) ...[
                  const SizedBox(height: 8),
                  const Chip(
                    avatar: Icon(Icons.history, size: 17),
                    label: Text('已還原'),
                    visualDensity: VisualDensity.compact,
                  ),
                ],
              ],
            ),
          ),
        ],
      ),
    ),
  );
}

class _InfoSection extends StatelessWidget {
  const _InfoSection({required this.title, required this.children});

  final String title;
  final List<Widget> children;

  @override
  Widget build(BuildContext context) => Card(
    margin: EdgeInsets.zero,
    child: Padding(
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(
            title,
            style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w800),
          ),
          const SizedBox(height: 10),
          ...children,
        ],
      ),
    ),
  );
}

class _InfoRow extends StatelessWidget {
  const _InfoRow({
    required this.label,
    required this.value,
    this.monospace = false,
  });

  final String label;
  final String value;
  final bool monospace;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.symmetric(vertical: 6),
    child: Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        SizedBox(
          width: 112,
          child: Text(
            label,
            style: TextStyle(fontSize: 13, color: context.palette.inkSoft),
          ),
        ),
        Expanded(
          child: SelectableText(
            value,
            style: TextStyle(
              fontSize: 13,
              fontFamily: monospace ? 'monospace' : null,
            ),
          ),
        ),
      ],
    ),
  );
}

class _StateSection extends StatelessWidget {
  const _StateSection({required this.title, required this.state});

  final String title;
  final dynamic state;

  @override
  Widget build(BuildContext context) => Card(
    margin: EdgeInsets.zero,
    child: Padding(
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(
            title,
            style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w800),
          ),
          const SizedBox(height: 10),
          Container(
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              color: context.palette.surfaceAlt,
              borderRadius: BorderRadius.circular(AppRadius.field),
            ),
            child: SelectableText(
              formatAiAuditState(state),
              style: const TextStyle(fontFamily: 'monospace', fontSize: 12),
            ),
          ),
        ],
      ),
    ),
  );
}

class _RestoreSection extends StatelessWidget {
  const _RestoreSection({
    required this.event,
    required this.preview,
    required this.loading,
    required this.restoring,
    required this.onRestore,
  });

  final AiActivityEvent event;
  final AiRestorePreview? preview;
  final bool loading;
  final bool restoring;
  final ValueChanged<AiRestorePreview> onRestore;

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    final conflict = preview?.conflict == true;
    final eligible = preview?.eligible == true && !conflict;
    return Card(
      margin: EdgeInsets.zero,
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            const Text(
              '還原',
              style: TextStyle(fontSize: 16, fontWeight: FontWeight.w800),
            ),
            const SizedBox(height: 8),
            if (event.isRestored) ...[
              Text(
                '這筆 AI 操作已由授權使用者還原；原始操作紀錄仍完整保留。',
                style: TextStyle(color: palette.successInk),
              ),
              if (event.restoredAt != null)
                Padding(
                  padding: const EdgeInsets.only(top: 8),
                  child: Text(
                    '還原時間：${DateFormat('yyyy/MM/dd HH:mm:ss').format(event.restoredAt!.toLocal())}',
                  ),
                ),
              if (event.restoredBy != null)
                Text('還原者：${event.restoredBy!.displayName}'),
              if (event.restoreReason != null)
                Text('還原原因：${event.restoreReason}'),
              if (event.restoreActionId != null)
                SelectableText('Restore Event：${event.restoreActionId}'),
            ] else if (loading && preview == null)
              const Center(child: CircularProgressIndicator())
            else if (preview == null)
              Text(
                '伺服器未提供還原預覽，因此無法執行還原。',
                style: TextStyle(color: palette.inkSoft),
              )
            else if (conflict) ...[
              Container(
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: palette.dangerSurface,
                  borderRadius: BorderRadius.circular(AppRadius.field),
                ),
                child: Text(
                  preview!.conflictReason ?? '資料在 AI 操作後已發生變更，不能直接還原。',
                  style: TextStyle(color: palette.dangerInk),
                ),
              ),
              const SizedBox(height: 8),
              const Text('為避免覆蓋較新的人工或系統變更，請先處理衝突。'),
            ] else if (!preview!.eligible)
              Text(
                preview!.conflictReason ?? '這筆操作目前不符合還原條件。',
                style: TextStyle(color: palette.inkSoft),
              )
            else ...[
              const Text('還原會新增一筆補償紀錄，不會刪除或修改原始 AI Audit Event。'),
              const SizedBox(height: 12),
              FilledButton.icon(
                onPressed: restoring || !eligible
                    ? null
                    : () => onRestore(preview!),
                icon: restoring
                    ? const SizedBox.square(
                        dimension: 18,
                        child: CircularProgressIndicator(strokeWidth: 2),
                      )
                    : const Icon(Icons.history),
                label: Text(restoring ? '還原中…' : '檢視並確認還原'),
              ),
            ],
          ],
        ),
      ),
    );
  }
}

class _RestoreConfirmationDialog extends StatefulWidget {
  const _RestoreConfirmationDialog({
    required this.event,
    required this.preview,
  });

  final AiActivityEvent event;
  final AiRestorePreview preview;

  @override
  State<_RestoreConfirmationDialog> createState() =>
      _RestoreConfirmationDialogState();
}

class _RestoreConfirmationDialogState
    extends State<_RestoreConfirmationDialog> {
  final _reason = TextEditingController();
  String? _error;

  @override
  void dispose() {
    _reason.dispose();
    super.dispose();
  }

  void _submit() {
    final reason = _reason.text.trim();
    if (reason.isEmpty) {
      setState(() => _error = '請填寫還原原因。');
      return;
    }
    Navigator.pop(context, reason);
  }

  @override
  Widget build(BuildContext context) => AlertDialog(
    title: const Text('確認還原 AI 操作？'),
    content: SizedBox(
      width: 520,
      child: SingleChildScrollView(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          mainAxisSize: MainAxisSize.min,
          children: [
            const Text('請確認影響範圍。送出時伺服器會再次檢查權限、版本與衝突。'),
            const SizedBox(height: 14),
            _PreviewLine(label: '原 AI 操作', value: widget.event.action),
            _PreviewLine(
              label: '影響資料',
              value:
                  '${widget.event.resourceType} · ${widget.event.resourceId}',
            ),
            if (widget.preview.expectedVersion != null)
              _PreviewLine(
                label: '目前版本',
                value: widget.preview.expectedVersion!,
              ),
            const SizedBox(height: 12),
            _DialogState(title: '目前資料狀態', value: widget.preview.currentState),
            const SizedBox(height: 10),
            _DialogState(
              title: '還原後結果',
              value: widget.preview.afterRestoreState,
            ),
            const SizedBox(height: 14),
            TextField(
              controller: _reason,
              minLines: 2,
              maxLines: 4,
              maxLength: 500,
              autofocus: true,
              decoration: InputDecoration(
                labelText: '還原原因',
                hintText: '請說明為何要還原這筆 AI 操作',
                errorText: _error,
                border: const OutlineInputBorder(),
              ),
              onChanged: (_) {
                if (_error != null) setState(() => _error = null);
              },
            ),
          ],
        ),
      ),
    ),
    actions: [
      TextButton(
        onPressed: () => Navigator.pop(context),
        child: const Text('取消'),
      ),
      FilledButton(onPressed: _submit, child: const Text('確認還原')),
    ],
  );
}

class _PreviewLine extends StatelessWidget {
  const _PreviewLine({required this.label, required this.value});

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.symmetric(vertical: 3),
    child: Text('$label：$value'),
  );
}

class _DialogState extends StatelessWidget {
  const _DialogState({required this.title, required this.value});

  final String title;
  final dynamic value;

  @override
  Widget build(BuildContext context) => Column(
    crossAxisAlignment: CrossAxisAlignment.stretch,
    children: [
      Text(title, style: const TextStyle(fontWeight: FontWeight.w700)),
      const SizedBox(height: 4),
      Container(
        constraints: const BoxConstraints(maxHeight: 150),
        padding: const EdgeInsets.all(10),
        decoration: BoxDecoration(
          color: context.palette.surfaceAlt,
          borderRadius: BorderRadius.circular(AppRadius.field),
        ),
        child: SingleChildScrollView(
          child: SelectableText(
            formatAiAuditState(value),
            style: const TextStyle(fontFamily: 'monospace', fontSize: 12),
          ),
        ),
      ),
    ],
  );
}

class _PersistentError extends StatelessWidget {
  const _PersistentError({required this.message, required this.onRetry});

  final String message;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) => Semantics(
    liveRegion: true,
    child: Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: context.palette.dangerSurface,
        borderRadius: BorderRadius.circular(AppRadius.field),
      ),
      child: Row(
        children: [
          Icon(Icons.error_outline, color: context.palette.dangerInk),
          const SizedBox(width: 10),
          Expanded(
            child: Text(
              message,
              style: TextStyle(color: context.palette.dangerInk),
            ),
          ),
          TextButton(onPressed: onRetry, child: const Text('重試')),
        ],
      ),
    ),
  );
}

class _LoadFailure extends StatelessWidget {
  const _LoadFailure({required this.message, required this.onRetry});

  final String? message;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) => Center(
    child: Padding(
      padding: const EdgeInsets.all(24),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(Icons.error_outline, size: 40, color: context.palette.danger),
          const SizedBox(height: 12),
          Text(message ?? '無法載入 AI 操作詳情。'),
          const SizedBox(height: 12),
          FilledButton.tonal(onPressed: onRetry, child: const Text('重試')),
        ],
      ),
    ),
  );
}
