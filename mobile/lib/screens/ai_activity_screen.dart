import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import '../models/models.dart';
import '../services/ai_activity_service.dart';
import '../theme/app_theme.dart';
import 'ai_activity_detail_screen.dart';

class AiActivityScreen extends StatefulWidget {
  const AiActivityScreen({
    super.key,
    this.loadPage,
    this.loadDetail,
    this.restoreAction,
  });

  final AiActivityPageLoader? loadPage;
  final AiActivityDetailLoader? loadDetail;
  final AiActivityRestoreAction? restoreAction;

  @override
  State<AiActivityScreen> createState() => _AiActivityScreenState();
}

class _AiActivityScreenState extends State<AiActivityScreen> {
  AiActivityQuery _query = const AiActivityQuery();
  List<AiActivityEvent> _events = const [];
  String? _nextCursor;
  String? _error;
  bool _loading = true;
  bool _loadingMore = false;
  int _loadGeneration = 0;

  AiActivityPageLoader get _loadPage =>
      widget.loadPage ?? AiActivityService.fetchPage;
  AiActivityDetailLoader get _loadDetail =>
      widget.loadDetail ?? AiActivityService.fetchDetail;
  AiActivityRestoreAction get _restoreAction =>
      widget.restoreAction ?? AiActivityService.restore;

  @override
  void initState() {
    super.initState();
    _refresh();
  }

  Future<void> _refresh() async {
    final generation = ++_loadGeneration;
    setState(() {
      _loading = true;
      _loadingMore = false;
      _error = null;
    });
    try {
      final page = await _loadPage(_query.withCursor(null));
      if (!mounted || generation != _loadGeneration) return;
      setState(() {
        _events = page.events;
        _nextCursor = page.nextCursor;
      });
    } catch (error) {
      if (!mounted || generation != _loadGeneration) return;
      setState(() => _error = error.toString());
    } finally {
      if (mounted && generation == _loadGeneration) {
        setState(() => _loading = false);
      }
    }
  }

  Future<void> _loadMore() async {
    final cursor = _nextCursor;
    if (cursor == null || _loadingMore) return;
    final generation = _loadGeneration;
    setState(() {
      _loadingMore = true;
      _error = null;
    });
    try {
      final page = await _loadPage(_query.withCursor(cursor));
      if (!mounted || generation != _loadGeneration) return;
      final existingIds = _events.map((event) => event.id).toSet();
      setState(() {
        _events = [
          ..._events,
          ...page.events.where((event) => existingIds.add(event.id)),
        ];
        _nextCursor = page.nextCursor;
      });
    } catch (error) {
      if (mounted && generation == _loadGeneration) {
        setState(() => _error = error.toString());
      }
    } finally {
      if (mounted && generation == _loadGeneration) {
        setState(() => _loadingMore = false);
      }
    }
  }

  Future<void> _openFilters() async {
    final next = await showModalBottomSheet<AiActivityQuery>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      showDragHandle: true,
      builder: (context) => _AiActivityFilterSheet(initial: _query),
    );
    if (next == null || !mounted) return;
    setState(() => _query = next);
    await _refresh();
  }

  Future<void> _openDetail(AiActivityEvent event) async {
    await Navigator.of(context).push<void>(
      MaterialPageRoute(
        builder: (_) => AiActivityDetailScreen(
          eventId: event.id,
          initialEvent: event,
          loadDetail: _loadDetail,
          restoreAction: _restoreAction,
        ),
        settings: RouteSettings(name: '/ai-activity/${event.id}'),
      ),
    );
    // Restore state is derived from newly appended audit events. Always refresh
    // after returning instead of mutating the original event in memory.
    if (mounted) await _refresh();
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(
      title: const Text(
        'AI 操作紀錄',
        style: TextStyle(fontWeight: FontWeight.w800),
      ),
      actions: [
        IconButton(
          tooltip: '篩選',
          onPressed: _openFilters,
          icon: Badge(
            isLabelVisible: _query.hasFilters,
            child: const Icon(Icons.filter_list),
          ),
        ),
      ],
    ),
    body: RefreshIndicator(
      onRefresh: _refresh,
      child: ListView(
        physics: const AlwaysScrollableScrollPhysics(),
        padding: const EdgeInsets.fromLTRB(16, 12, 16, 32),
        children: [
          Text(
            '查看由 ChatGPT、MCP 或其他 AI 代理建立資料時留下的不可變更紀錄。還原只能由你在此確認執行。',
            style: TextStyle(color: context.palette.inkSoft),
          ),
          if (_query.hasFilters) ...[
            const SizedBox(height: 12),
            _ActiveFilters(
              query: _query,
              onClear: () async {
                setState(() => _query = const AiActivityQuery());
                await _refresh();
              },
            ),
          ],
          if (_error != null) ...[
            const SizedBox(height: 12),
            _MessageCard(
              icon: Icons.error_outline,
              message: _error!,
              actionLabel: '重試',
              onAction: _refresh,
            ),
          ],
          const SizedBox(height: 12),
          if (_loading && _events.isEmpty)
            const Padding(
              padding: EdgeInsets.symmetric(vertical: 64),
              child: Center(child: CircularProgressIndicator()),
            )
          else if (_events.isEmpty)
            const _EmptyActivity()
          else ...[
            for (final event in _events) ...[
              _ActivityCard(event: event, onTap: () => _openDetail(event)),
              const SizedBox(height: 10),
            ],
            if (_nextCursor != null)
              Padding(
                padding: const EdgeInsets.only(top: 4),
                child: OutlinedButton.icon(
                  onPressed: _loadingMore ? null : _loadMore,
                  icon: _loadingMore
                      ? const SizedBox.square(
                          dimension: 18,
                          child: CircularProgressIndicator(strokeWidth: 2),
                        )
                      : const Icon(Icons.expand_more),
                  label: Text(_loadingMore ? '載入中…' : '載入更多'),
                ),
              ),
          ],
        ],
      ),
    ),
  );
}

class _ActivityCard extends StatelessWidget {
  const _ActivityCard({required this.event, required this.onTap});

  final AiActivityEvent event;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    final success =
        event.status.toUpperCase().contains('SUCCEEDED') ||
        event.status.toUpperCase() == 'SUCCESS';
    final failed =
        event.status.toUpperCase().contains('FAILED') ||
        event.status.toUpperCase() == 'ERROR';
    final statusColor = failed
        ? palette.dangerInk
        : success
        ? palette.successInk
        : palette.amberInk;
    final statusBackground = failed
        ? palette.dangerSurface
        : success
        ? palette.successSurface
        : palette.amberSurface;

    return Card(
      margin: EdgeInsets.zero,
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Expanded(
                    child: Text(
                      '${_sourceLabel(event.actorSource)} · ${event.user?.displayName ?? '未知使用者'}',
                      style: const TextStyle(fontWeight: FontWeight.w800),
                    ),
                  ),
                  Container(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 9,
                      vertical: 4,
                    ),
                    decoration: BoxDecoration(
                      color: statusBackground,
                      borderRadius: BorderRadius.circular(AppRadius.chip),
                    ),
                    child: Text(
                      _statusLabel(event.status),
                      style: TextStyle(
                        color: statusColor,
                        fontSize: 11,
                        fontWeight: FontWeight.w800,
                      ),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 8),
              Text(
                _actionLabel(event.action),
                style: const TextStyle(
                  fontSize: 16,
                  fontWeight: FontWeight.w700,
                ),
              ),
              const SizedBox(height: 4),
              Text(
                '${event.resourceType} · ${event.resourceId.isEmpty ? '未建立資源' : event.resourceId}',
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
                style: TextStyle(fontSize: 13, color: palette.inkSoft),
              ),
              const SizedBox(height: 10),
              Row(
                children: [
                  Expanded(
                    child: Text(
                      DateFormat(
                        'yyyy/MM/dd HH:mm:ss',
                      ).format(event.createdAt.toLocal()),
                      style: TextStyle(fontSize: 12, color: palette.inkFaint),
                    ),
                  ),
                  if (event.mcpToolName != null)
                    Flexible(
                      child: Text(
                        event.mcpToolName!,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(
                          fontSize: 12,
                          color: palette.inkSoft,
                          fontFamily: 'monospace',
                        ),
                      ),
                    ),
                  if (event.isRestored) ...[
                    const SizedBox(width: 8),
                    const Icon(Icons.history, size: 17),
                    const SizedBox(width: 3),
                    const Text('已還原', style: TextStyle(fontSize: 12)),
                  ],
                  const SizedBox(width: 4),
                  const Icon(Icons.chevron_right),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _ActiveFilters extends StatelessWidget {
  const _ActiveFilters({required this.query, required this.onClear});

  final AiActivityQuery query;
  final VoidCallback onClear;

  @override
  Widget build(BuildContext context) => Container(
    padding: const EdgeInsets.fromLTRB(12, 8, 6, 8),
    decoration: BoxDecoration(
      color: context.palette.surfaceAlt,
      borderRadius: BorderRadius.circular(AppRadius.field),
    ),
    child: Row(
      children: [
        const Icon(Icons.filter_alt_outlined, size: 20),
        const SizedBox(width: 8),
        const Expanded(child: Text('已套用篩選條件')),
        TextButton(onPressed: onClear, child: const Text('清除')),
      ],
    ),
  );
}

class _MessageCard extends StatelessWidget {
  const _MessageCard({
    required this.icon,
    required this.message,
    this.actionLabel,
    this.onAction,
  });

  final IconData icon;
  final String message;
  final String? actionLabel;
  final VoidCallback? onAction;

  @override
  Widget build(BuildContext context) => Container(
    padding: const EdgeInsets.all(12),
    decoration: BoxDecoration(
      color: context.palette.dangerSurface,
      borderRadius: BorderRadius.circular(AppRadius.field),
    ),
    child: Row(
      children: [
        Icon(icon, color: context.palette.dangerInk),
        const SizedBox(width: 10),
        Expanded(
          child: Text(
            message,
            style: TextStyle(color: context.palette.dangerInk),
          ),
        ),
        if (actionLabel != null && onAction != null)
          TextButton(onPressed: onAction, child: Text(actionLabel!)),
      ],
    ),
  );
}

class _EmptyActivity extends StatelessWidget {
  const _EmptyActivity();

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.symmetric(vertical: 64),
    child: Column(
      children: [
        Icon(
          Icons.auto_awesome_outlined,
          size: 40,
          color: context.palette.inkFaint,
        ),
        const SizedBox(height: 12),
        const Text('沒有符合條件的 AI 操作紀錄'),
        const SizedBox(height: 4),
        Text(
          'AI 透過 MCP 建立資料後，紀錄會顯示在這裡。',
          textAlign: TextAlign.center,
          style: TextStyle(fontSize: 13, color: context.palette.inkSoft),
        ),
      ],
    ),
  );
}

class _AiActivityFilterSheet extends StatefulWidget {
  const _AiActivityFilterSheet({required this.initial});

  final AiActivityQuery initial;

  @override
  State<_AiActivityFilterSheet> createState() => _AiActivityFilterSheetState();
}

class _AiActivityFilterSheetState extends State<_AiActivityFilterSheet> {
  late DateTime? _from;
  late DateTime? _to;
  late final TextEditingController _user;
  late final TextEditingController _source;
  late final TextEditingController _tool;
  late final TextEditingController _action;
  late String _resource;
  late String _status;

  @override
  void initState() {
    super.initState();
    _from = widget.initial.from;
    _to = widget.initial.to;
    _user = TextEditingController(text: widget.initial.userId);
    _source = TextEditingController(text: widget.initial.actorSource);
    _tool = TextEditingController(text: widget.initial.mcpToolName);
    _action = TextEditingController(text: widget.initial.action);
    _resource =
        const {
          'MEAL',
          'SAVED_FOOD',
          'WATER_LOG',
        }.contains(widget.initial.resourceType)
        ? widget.initial.resourceType!
        : '';
    _status =
        const {'started', 'succeeded', 'failed'}.contains(widget.initial.status)
        ? widget.initial.status!
        : '';
  }

  @override
  void dispose() {
    _user.dispose();
    _source.dispose();
    _tool.dispose();
    _action.dispose();
    super.dispose();
  }

  Future<DateTime?> _pickDate(DateTime? current) => showDatePicker(
    context: context,
    initialDate: current ?? DateTime.now(),
    firstDate: DateTime(2020),
    lastDate: DateTime.now(),
  );

  void _apply() {
    final from = _from == null
        ? null
        : DateTime(_from!.year, _from!.month, _from!.day);
    final to = _to == null
        ? null
        : DateTime(_to!.year, _to!.month, _to!.day + 1);
    Navigator.pop(
      context,
      AiActivityQuery(
        from: from,
        to: to,
        userId: _user.text,
        actorSource: _source.text,
        mcpToolName: _tool.text,
        resourceType: _resource,
        action: _action.text,
        status: _status,
      ),
    );
  }

  @override
  Widget build(BuildContext context) => Padding(
    padding: EdgeInsets.fromLTRB(
      16,
      0,
      16,
      16 + MediaQuery.viewInsetsOf(context).bottom,
    ),
    child: SingleChildScrollView(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const Text(
            '篩選 AI 操作紀錄',
            style: TextStyle(fontSize: 20, fontWeight: FontWeight.w800),
          ),
          const SizedBox(height: 16),
          Row(
            children: [
              Expanded(
                child: _DateButton(
                  label: '開始日期',
                  value: _from,
                  onPressed: () async {
                    final value = await _pickDate(_from);
                    if (value != null && mounted) setState(() => _from = value);
                  },
                ),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: _DateButton(
                  label: '結束日期',
                  value: _to,
                  onPressed: () async {
                    final value = await _pickDate(_to);
                    if (value != null && mounted) setState(() => _to = value);
                  },
                ),
              ),
            ],
          ),
          const SizedBox(height: 10),
          _FilterField(
            controller: _user,
            label: '使用者 ID',
            icon: Icons.person_outline,
          ),
          _FilterField(
            controller: _source,
            label: 'AI 來源',
            hint: '例如 chatgpt_mcp',
            icon: Icons.auto_awesome_outlined,
          ),
          _FilterField(
            controller: _tool,
            label: 'MCP Tool',
            hint: '例如 create_meal',
            icon: Icons.build_outlined,
          ),
          _FilterDropdown(
            label: 'Resource',
            icon: Icons.inventory_2_outlined,
            value: _resource,
            options: const {
              '': '全部',
              'MEAL': 'Meal',
              'SAVED_FOOD': 'Saved food',
              'WATER_LOG': 'Water log',
            },
            onChanged: (value) => setState(() => _resource = value),
          ),
          _FilterField(
            controller: _action,
            label: 'Action',
            icon: Icons.bolt_outlined,
          ),
          _FilterDropdown(
            label: 'Status',
            icon: Icons.info_outline,
            value: _status,
            options: const {
              '': '全部',
              'started': 'Started',
              'succeeded': 'Succeeded',
              'failed': 'Failed',
            },
            onChanged: (value) => setState(() => _status = value),
          ),
          const SizedBox(height: 12),
          Row(
            children: [
              Expanded(
                child: TextButton(
                  onPressed: () =>
                      Navigator.pop(context, const AiActivityQuery()),
                  child: const Text('清除全部'),
                ),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: FilledButton(
                  onPressed: _apply,
                  child: const Text('套用篩選'),
                ),
              ),
            ],
          ),
        ],
      ),
    ),
  );
}

class _DateButton extends StatelessWidget {
  const _DateButton({
    required this.label,
    required this.value,
    required this.onPressed,
  });

  final String label;
  final DateTime? value;
  final VoidCallback onPressed;

  @override
  Widget build(BuildContext context) => OutlinedButton.icon(
    onPressed: onPressed,
    icon: const Icon(Icons.calendar_today_outlined, size: 18),
    label: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(label, style: const TextStyle(fontSize: 11)),
        Text(
          value == null ? '不限' : DateFormat('yyyy/MM/dd').format(value!),
          maxLines: 1,
        ),
      ],
    ),
    style: OutlinedButton.styleFrom(
      alignment: Alignment.centerLeft,
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 9),
    ),
  );
}

class _FilterField extends StatelessWidget {
  const _FilterField({
    required this.controller,
    required this.label,
    required this.icon,
    this.hint,
  });

  final TextEditingController controller;
  final String label;
  final String? hint;
  final IconData icon;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.only(top: 10),
    child: TextField(
      controller: controller,
      maxLength: 128,
      buildCounter:
          (_, {required currentLength, required isFocused, maxLength}) => null,
      decoration: InputDecoration(
        labelText: label,
        hintText: hint,
        prefixIcon: Icon(icon),
        border: const OutlineInputBorder(),
      ),
    ),
  );
}

class _FilterDropdown extends StatelessWidget {
  const _FilterDropdown({
    required this.label,
    required this.icon,
    required this.value,
    required this.options,
    required this.onChanged,
  });

  final String label;
  final IconData icon;
  final String value;
  final Map<String, String> options;
  final ValueChanged<String> onChanged;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.only(top: 10),
    child: DropdownButtonFormField<String>(
      initialValue: value,
      decoration: InputDecoration(
        labelText: label,
        prefixIcon: Icon(icon),
        border: const OutlineInputBorder(),
      ),
      items: options.entries
          .map(
            (entry) => DropdownMenuItem<String>(
              value: entry.key,
              child: Text(entry.value),
            ),
          )
          .toList(growable: false),
      onChanged: (next) => onChanged(next ?? ''),
    ),
  );
}

String _sourceLabel(String source) => switch (source.toLowerCase()) {
  'chatgpt_mcp' => 'ChatGPT MCP',
  'chatgpt' => 'ChatGPT',
  'mcp' => 'MCP',
  _ => source,
};

String _statusLabel(String status) => switch (status.toUpperCase()) {
  'SUCCESS' || 'SUCCEEDED' || 'AI_CREATE_SUCCEEDED' => '成功',
  'FAILED' || 'ERROR' || 'AI_CREATE_FAILED' => '失敗',
  'STARTED' || 'AI_CREATE_STARTED' => '處理中',
  _ => status,
};

String _actionLabel(String action) => switch (action.toUpperCase()) {
  'AI_CREATE_STARTED' => 'AI 建立作業已開始',
  'AI_CREATE_SUCCEEDED' => 'AI 已建立資料',
  'AI_CREATE_FAILED' => 'AI 建立資料失敗',
  'USER_RESTORE_STARTED' => '使用者開始還原',
  'USER_RESTORE_SUCCEEDED' => '使用者已完成還原',
  'USER_RESTORE_FAILED' => '使用者還原失敗',
  _ => action,
};
