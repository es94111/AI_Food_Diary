import 'package:flutter/material.dart';

import '../models/models.dart';
import '../services/api_client.dart';
import '../services/saved_food_list_logic.dart';
import '../services/saved_food_service.dart';
import '../theme/app_theme.dart';
import 'saved_food_editor.dart';

const _sortLabels = {
  SavedFoodSort.recommended: '推薦順序',
  SavedFoodSort.name: '名稱 A-Z',
  SavedFoodSort.mostUsed: '使用次數',
  SavedFoodSort.recentlyUpdated: '最近更新',
  SavedFoodSort.newest: '最新建立',
};

const _tabLabels = {
  SavedFoodTab.favorites: '常用',
  SavedFoodTab.all: '全部',
  SavedFoodTab.barcoded: '有條碼',
  SavedFoodTab.recent: '最近使用',
  SavedFoodTab.unused: '未使用',
  SavedFoodTab.possibleDuplicates: '可能重複',
  SavedFoodTab.incomplete: '資料不完整',
  SavedFoodTab.archived: '已封存',
};

class SavedFoodsManager extends StatefulWidget {
  const SavedFoodsManager({super.key});

  @override
  State<SavedFoodsManager> createState() => _SavedFoodsManagerState();
}

class _SavedFoodsManagerState extends State<SavedFoodsManager> {
  List<SavedFood> _foods = [];
  List<SavedFood> _archivedFoods = [];
  final Set<String> _selectedIds = {};
  SavedFood? _editing;
  SavedFoodTab _tab = SavedFoodTab.favorites;
  SavedFoodSort _sort = SavedFoodSort.recommended;
  String _search = '';
  bool _loading = true;
  bool _archivedLoading = false;
  bool _archivedLoaded = false;
  bool _batchArchiving = false;
  String? _error;

  List<SavedFood> get _visibleFoods => visibleSavedFoods(
    foods: _tab == SavedFoodTab.archived ? _archivedFoods : _foods,
    tab: _tab,
    sort: _sort,
    search: _search,
  );

  bool get _selectionMode => _selectedIds.isNotEmpty;

  @override
  void initState() {
    super.initState();
    _loadActive();
  }

  Future<void> _loadActive() async {
    final cached = await SavedFoodService.cachedList();
    if (cached.isNotEmpty && mounted) {
      setState(() {
        _foods = cached;
        _loading = false;
      });
    }
    try {
      final foods = await SavedFoodService.list();
      if (mounted) setState(() => _foods = foods);
    } catch (error) {
      if (mounted) setState(() => _error = error.toString());
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _loadArchived({bool force = false}) async {
    if (_archivedLoading || (_archivedLoaded && !force)) return;
    setState(() {
      _archivedLoading = true;
      _error = null;
    });
    try {
      final foods = await SavedFoodService.list(archived: true);
      if (mounted) {
        setState(() {
          _archivedFoods = foods;
          _archivedLoaded = true;
        });
      }
    } catch (error) {
      if (mounted) setState(() => _error = error.toString());
    } finally {
      if (mounted) setState(() => _archivedLoading = false);
    }
  }

  void _selectTab(SavedFoodTab tab) {
    setState(() {
      _tab = tab;
      _editing = null;
      _selectedIds.clear();
      _error = null;
    });
    if (tab == SavedFoodTab.archived) _loadArchived();
  }

  Future<void> _onSaved(SavedFood food) async {
    setState(() {
      _foods = [food, ..._foods.where((item) => item.id != food.id)];
      _archivedFoods.removeWhere((item) => item.id == food.id);
      _editing = null;
      _error = null;
    });
  }

  Future<void> _toggleFavorite(SavedFood food) async {
    try {
      final updated = await SavedFoodService.update(
        food.id,
        barcode: food.barcode,
        name: food.name,
        estimatedAmount: food.estimatedAmount,
        calories: food.calories,
        protein: food.protein,
        fat: food.fat,
        carbs: food.carbs,
        isFavorite: !food.isFavorite,
      );
      if (mounted) {
        setState(() {
          _foods = _foods
              .map((item) => item.id == updated.id ? updated : item)
              .toList();
          _error = null;
        });
      }
    } catch (error) {
      if (mounted) setState(() => _error = error.toString());
    }
  }

  Future<void> _archive(SavedFood food) async {
    try {
      await SavedFoodService.archive(food.id);
      if (!mounted) return;
      setState(() {
        _foods.removeWhere((item) => item.id == food.id);
        _selectedIds.remove(food.id);
        if (_editing?.id == food.id) _editing = null;
        _error = null;
      });
      if (_archivedLoaded) await _loadArchived(force: true);
    } catch (error) {
      if (mounted) setState(() => _error = error.toString());
    }
  }

  Future<void> _archiveSelected() async {
    if (_selectedIds.isEmpty || _batchArchiving) return;
    final confirmed =
        await showDialog<bool>(
          context: context,
          builder: (context) => AlertDialog(
            title: Text('封存 ${_selectedIds.length} 筆食物？'),
            content: const Text('封存不會影響過去的餐點紀錄，之後仍可從「已封存」還原。'),
            actions: [
              TextButton(
                onPressed: () => Navigator.pop(context, false),
                child: const Text('取消'),
              ),
              FilledButton(
                onPressed: () => Navigator.pop(context, true),
                child: const Text('批次封存'),
              ),
            ],
          ),
        ) ??
        false;
    if (!confirmed || !mounted) return;

    final ids = _selectedIds.toList(growable: false);
    setState(() {
      _batchArchiving = true;
      _error = null;
    });
    try {
      final archivedCount = await SavedFoodService.archiveBatch(ids);
      if (!mounted) return;
      final archivedIds = ids.toSet();
      setState(() {
        _foods.removeWhere((food) => archivedIds.contains(food.id));
        _selectedIds.clear();
        _error = archivedCount == ids.length
            ? null
            : '已封存 $archivedCount 筆；部分項目可能已先被移動，請重新整理。';
      });
      if (_archivedLoaded && archivedCount > 0) {
        await _loadArchived(force: true);
      }
    } catch (error) {
      if (!mounted) return;
      setState(() => _error = error.toString());
      // Earlier chunks may already have committed. Reload instead of leaving
      // archived rows visible after a later chunk fails.
      await _loadActive();
    } finally {
      if (mounted) setState(() => _batchArchiving = false);
    }
  }

  Future<void> _restore(SavedFood food) async {
    try {
      final restored = await SavedFoodService.restore(food.id);
      if (!mounted) return;
      setState(() {
        _archivedFoods.removeWhere((item) => item.id == food.id);
        _foods = [restored, ..._foods.where((item) => item.id != restored.id)];
        _error = null;
      });
    } catch (error) {
      if (mounted) setState(() => _error = error.toString());
    }
  }

  void _toggleSelection(SavedFood food) {
    if (_tab == SavedFoodTab.archived || _batchArchiving) return;
    setState(() {
      if (!_selectedIds.add(food.id)) _selectedIds.remove(food.id);
      _editing = null;
    });
  }

  @override
  Widget build(BuildContext context) {
    final waiting = _tab == SavedFoodTab.archived ? _archivedLoading : _loading;
    final visibleFoods = _visibleFoods;
    return CustomScrollView(
      keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
      slivers: [
        SliverToBoxAdapter(
          child: Padding(
            padding: const EdgeInsets.fromLTRB(16, 16, 16, 8),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  '管理常用、自建與條碼食物。封存不會影響過去餐點紀錄。',
                  style: TextStyle(
                    fontSize: 12,
                    color: context.palette.inkSoft,
                  ),
                ),
                const SizedBox(height: 12),
                SavedFoodEditor(
                  editing: _editing,
                  onSaved: _onSaved,
                  onCancelEdit: () {
                    if (mounted) setState(() => _editing = null);
                  },
                ),
                const SizedBox(height: 12),
                TextField(
                  onChanged: (value) => setState(() {
                    _search = value;
                    _selectedIds.clear();
                  }),
                  decoration: const InputDecoration(
                    labelText: '搜尋名稱或條碼',
                    prefixIcon: Icon(Icons.search),
                    border: OutlineInputBorder(),
                  ),
                ),
                const SizedBox(height: 8),
                DropdownButtonFormField<SavedFoodSort>(
                  initialValue: _sort,
                  decoration: const InputDecoration(
                    labelText: '排序',
                    prefixIcon: Icon(Icons.sort),
                    border: OutlineInputBorder(),
                  ),
                  items: _sortLabels.entries
                      .map(
                        (entry) => DropdownMenuItem(
                          value: entry.key,
                          child: Text(entry.value),
                        ),
                      )
                      .toList(),
                  onChanged: (value) {
                    if (value != null) setState(() => _sort = value);
                  },
                ),
                const SizedBox(height: 12),
                _tabs(),
                if (_selectionMode) ...[
                  const SizedBox(height: 12),
                  _selectionBar(),
                ],
                if (_error != null) ...[
                  const SizedBox(height: 12),
                  Text(
                    _error!,
                    style: TextStyle(color: context.palette.danger),
                  ),
                ],
              ],
            ),
          ),
        ),
        if (waiting)
          const SliverFillRemaining(
            hasScrollBody: false,
            child: Center(child: CircularProgressIndicator()),
          )
        else if (visibleFoods.isEmpty)
          SliverFillRemaining(
            hasScrollBody: false,
            child: Center(
              child: Text(
                '這個分類目前沒有食物。',
                style: TextStyle(color: context.palette.inkSoft),
              ),
            ),
          )
        else
          SliverPadding(
            padding: const EdgeInsets.fromLTRB(16, 0, 16, 24),
            sliver: SliverList(
              delegate: SliverChildBuilderDelegate(
                (context, index) => _foodTile(visibleFoods[index]),
                childCount: visibleFoods.length,
              ),
            ),
          ),
      ],
    );
  }

  Widget _tabs() {
    final counts = savedFoodTabCounts(_foods);
    return Wrap(
      spacing: 8,
      runSpacing: 8,
      children: _tabLabels.entries.map((entry) {
        final count = entry.key == SavedFoodTab.archived
            ? (_archivedLoaded ? _archivedFoods.length : null)
            : counts[entry.key];
        return ChoiceChip(
          label: Text('${entry.value}${count == null ? '' : ' ($count)'}'),
          selected: _tab == entry.key,
          onSelected: (_) => _selectTab(entry.key),
        );
      }).toList(),
    );
  }

  Widget _selectionBar() => Container(
    padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
    decoration: BoxDecoration(
      color: context.palette.surfaceAlt,
      borderRadius: BorderRadius.circular(12),
    ),
    child: Row(
      children: [
        Expanded(child: Text('已選取 ${_selectedIds.length} 筆')),
        TextButton(
          onPressed: _batchArchiving
              ? null
              : () => setState(() => _selectedIds.clear()),
          child: const Text('取消選取'),
        ),
        FilledButton.icon(
          onPressed: _batchArchiving ? null : _archiveSelected,
          icon: _batchArchiving
              ? const SizedBox.square(
                  dimension: 16,
                  child: CircularProgressIndicator(strokeWidth: 2),
                )
              : const Icon(Icons.archive_outlined),
          label: const Text('封存'),
        ),
      ],
    ),
  );

  Map<String, String> _authHeaders() => ApiClient.instance.sessionCookie == null
      ? const {}
      : {'Cookie': ApiClient.instance.sessionCookie!};

  Widget _foodTile(SavedFood food) {
    final archived = _tab == SavedFoodTab.archived;
    final selected = _selectedIds.contains(food.id);
    final lastUsed = food.lastUsedAt == null
        ? ''
        : ' · 上次 ${food.lastUsedAt!.month}/${food.lastUsedAt!.day}';
    return Material(
      color: selected ? context.palette.surfaceAlt : Colors.transparent,
      child: InkWell(
        onLongPress: archived || _batchArchiving
            ? null
            : () => _toggleSelection(food),
        onTap: _selectionMode && !_batchArchiving
            ? () => _toggleSelection(food)
            : null,
        child: Container(
          padding: const EdgeInsets.symmetric(vertical: 10),
          decoration: BoxDecoration(
            border: Border(bottom: BorderSide(color: context.palette.hairline)),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  if (_selectionMode && !archived) ...[
                    Checkbox(
                      value: selected,
                      onChanged: _batchArchiving
                          ? null
                          : (_) => _toggleSelection(food),
                    ),
                    const SizedBox(width: 4),
                  ],
                  if (food.hasImage) ...[
                    ClipRRect(
                      borderRadius: BorderRadius.circular(8),
                      child: Image.network(
                        SavedFoodService.imageUrl(food.id),
                        headers: _authHeaders(),
                        width: 48,
                        height: 48,
                        fit: BoxFit.cover,
                        errorBuilder: (_, _, _) => const SizedBox.shrink(),
                      ),
                    ),
                    const SizedBox(width: 10),
                  ],
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          '${food.isFavorite ? '★ ' : ''}${food.name} · ${fmtNum(food.calories)} kcal',
                          style: const TextStyle(fontWeight: FontWeight.bold),
                        ),
                        const SizedBox(height: 2),
                        Text(
                          [
                            food.estimatedAmount,
                            if (food.barcode?.isNotEmpty ?? false)
                              '條碼 ${food.barcode}',
                            '蛋白質 ${fmtNum(food.protein)}g / 脂肪 ${fmtNum(food.fat)}g / 碳水 ${fmtNum(food.carbs)}g',
                            '${savedFoodSourceLabels[food.source] ?? '手動新增'} · 使用 ${food.useCount} 次$lastUsed',
                          ].join(' · '),
                          style: TextStyle(
                            fontSize: 12,
                            color: context.palette.inkSoft,
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
              if (!_selectionMode || archived) ...[
                const SizedBox(height: 4),
                Align(
                  alignment: Alignment.centerRight,
                  child: archived
                      ? TextButton.icon(
                          onPressed: () => _restore(food),
                          icon: const Icon(Icons.unarchive_outlined),
                          label: const Text('還原'),
                        )
                      : Wrap(
                          spacing: 4,
                          children: [
                            IconButton(
                              tooltip: food.isFavorite ? '取消常用' : '設為常用',
                              icon: Icon(
                                food.isFavorite
                                    ? Icons.star
                                    : Icons.star_border,
                              ),
                              onPressed: () => _toggleFavorite(food),
                            ),
                            IconButton(
                              tooltip: '編輯',
                              icon: const Icon(Icons.edit),
                              onPressed: () => setState(() => _editing = food),
                            ),
                            IconButton(
                              tooltip: '封存',
                              icon: Icon(
                                Icons.archive_outlined,
                                color: context.palette.danger,
                              ),
                              onPressed: () => _archive(food),
                            ),
                          ],
                        ),
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }
}
