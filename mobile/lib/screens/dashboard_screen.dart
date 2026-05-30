import 'package:flutter/material.dart';

import '../models/models.dart';
import '../services/auth_service.dart';
import '../services/health_service.dart';
import '../services/meal_service.dart';
import '../utils/metabolism.dart';
import '../widgets/health_sync_card.dart';
import '../widgets/meal_capture_form.dart';
import '../widgets/meal_list.dart';
import '../widgets/profile_form.dart';
import 'login_screen.dart';

class DashboardScreen extends StatefulWidget {
  const DashboardScreen({super.key});

  @override
  State<DashboardScreen> createState() => _DashboardScreenState();
}

class _DashboardScreenState extends State<DashboardScreen> {
  AppUser? _user;
  bool _weekView = false;
  DateTime _selectedDate = startOfLocalDay(DateTime.now());
  List<Meal> _meals = [];
  double? _syncedWeight;
  bool _loading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _bootstrap();
  }

  Future<void> _bootstrap() async {
    try {
      _user = await AuthService.fetchMe();
      await _loadMeals();
      await _loadSyncedWeight();
    } catch (e) {
      setState(() => _error = e.toString());
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _loadSyncedWeight() async {
    try {
      final status = await HealthService.status();
      final weight = status.latestByType['WEIGHT'];
      if (weight != null && weight.unit.toLowerCase() == 'kg' && mounted) {
        setState(() => _syncedWeight = weight.value);
      }
    } catch (_) {}
  }

  Future<void> _refreshUserAndMeals() async {
    try {
      _user = await AuthService.fetchMe();
    } catch (_) {}
    await _loadMeals();
  }

  Future<void> _loadMeals() async {
    final meals = _weekView
        ? await MealService.mealsForWeek(startOfLocalWeek(_selectedDate))
        : await MealService.mealsForDay(_selectedDate);
    meals.sort((a, b) => b.eatenAt.compareTo(a.eatenAt));
    if (mounted) setState(() => _meals = meals);
  }

  Future<void> _logout() async {
    await AuthService.logout();
    if (!mounted) return;
    Navigator.of(context).pushAndRemoveUntil(
      MaterialPageRoute(builder: (_) => const LoginScreen()),
      (route) => false,
    );
  }

  Future<void> _openProfile() async {
    final saved = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      showDragHandle: true,
      builder: (_) => ProfileFormSheet(profile: _user?.profile),
    );
    if (saved == true) await _refreshUserAndMeals();
  }

  String _weekdayZh(DateTime d) =>
      const ['一', '二', '三', '四', '五', '六', '日'][d.weekday - 1];

  void _changeDate(int days) {
    setState(() => _selectedDate = _selectedDate.add(Duration(days: days)));
    _loadMeals();
  }

  void _setView(bool week) {
    if (_weekView == week) return;
    setState(() => _weekView = week);
    _loadMeals();
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) {
      return const Scaffold(body: Center(child: CircularProgressIndicator()));
    }
    final totals = Totals.fromMeals(_meals);
    final metabolism =
        metabolismFor(_user?.profile, syncedWeightKg: _syncedWeight);
    final target = metabolism.target;

    return Scaffold(
      appBar: AppBar(
        title: const Text('AI Food Diary',
            style: TextStyle(fontWeight: FontWeight.w900)),
        actions: [
          IconButton(
              onPressed: _openProfile,
              icon: const Icon(Icons.person),
              tooltip: '身體資料'),
          IconButton(
              onPressed: _logout,
              icon: const Icon(Icons.logout),
              tooltip: '登出'),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: _refreshUserAndMeals,
        child: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            if (_error != null)
              Padding(
                padding: const EdgeInsets.only(bottom: 12),
                child: Text(_error!, style: const TextStyle(color: Colors.red)),
              ),
            _dateSwitcher(),
            const SizedBox(height: 12),
            _calorieCard(totals, target),
            const SizedBox(height: 12),
            _metabolismCard(metabolism),
            const SizedBox(height: 12),
            HealthSyncCard(onSynced: _onHealthSynced),
            const SizedBox(height: 12),
            MealCaptureForm(onSaved: _loadMeals),
            const SizedBox(height: 12),
            _mealsSection(),
            const SizedBox(height: 12),
            _DailySummaryCard(date: _selectedDate, key: ValueKey(_selectedDate)),
            if (_user?.isAdmin == true) ...[
              const SizedBox(height: 12),
              const _AdminPanel(),
            ],
            const SizedBox(height: 24),
          ],
        ),
      ),
    );
  }

  Future<void> _onHealthSynced() => _loadSyncedWeight();

  Widget _dateSwitcher() {
    final label = _weekView
        ? '${isoDate(startOfLocalWeek(_selectedDate))} — '
            '${isoDate(startOfLocalWeek(_selectedDate).add(const Duration(days: 6)))}'
        : '${isoDate(_selectedDate)} (${_weekdayZh(_selectedDate)})';
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(8),
        child: Column(
          children: [
            Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                ChoiceChip(
                  label: const Text('每日'),
                  selected: !_weekView,
                  onSelected: (_) => _setView(false),
                ),
                const SizedBox(width: 8),
                ChoiceChip(
                  label: const Text('每週'),
                  selected: _weekView,
                  onSelected: (_) => _setView(true),
                ),
              ],
            ),
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                IconButton(
                    onPressed: () => _changeDate(_weekView ? -7 : -1),
                    icon: const Icon(Icons.chevron_left)),
                TextButton(
                  onPressed: () {
                    setState(() =>
                        _selectedDate = startOfLocalDay(DateTime.now()));
                    _loadMeals();
                  },
                  child: Text(label),
                ),
                IconButton(
                    onPressed: () => _changeDate(_weekView ? 7 : 1),
                    icon: const Icon(Icons.chevron_right)),
              ],
            ),
          ],
        ),
      ),
    );
  }

  Widget _calorieCard(Totals totals, int target) {
    final macroTotal = totals.protein + totals.fat + totals.carbs;
    int pct(double v) => macroTotal == 0 ? 0 : ((v / macroTotal) * 100).round();
    final progress =
        target == 0 ? 0.0 : (totals.calories / target).clamp(0.0, 1.0);
    return Card(
      color: const Color(0xFF1C1917),
      child: Padding(
        padding: const EdgeInsets.all(20),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(_weekView ? '本週攝取' : '當日攝取',
                style: const TextStyle(color: Colors.white60)),
            const SizedBox(height: 4),
            Row(
              crossAxisAlignment: CrossAxisAlignment.end,
              children: [
                Text('${totals.calories}',
                    style: const TextStyle(
                        color: Colors.white,
                        fontSize: 44,
                        fontWeight: FontWeight.w900)),
                const Padding(
                  padding: EdgeInsets.only(bottom: 8, left: 4),
                  child: Text('kcal',
                      style: TextStyle(
                          color: Colors.white60,
                          fontSize: 16,
                          fontWeight: FontWeight.w600)),
                ),
              ],
            ),
            Text('目標 $target kcal · ${(progress * 100).round()}%',
                style: const TextStyle(color: Colors.white38, fontSize: 13)),
            const SizedBox(height: 12),
            ClipRRect(
              borderRadius: BorderRadius.circular(8),
              child: LinearProgressIndicator(
                value: progress.toDouble(),
                minHeight: 8,
                backgroundColor: Colors.white12,
                valueColor:
                    const AlwaysStoppedAnimation(Color(0xFFF59E0B)),
              ),
            ),
            const SizedBox(height: 16),
            Row(
              children: [
                _macro('蛋白質 ${pct(totals.protein)}%',
                    '${totals.protein.toStringAsFixed(1)}g'),
                _macro('脂肪 ${pct(totals.fat)}%',
                    '${totals.fat.toStringAsFixed(1)}g'),
                _macro('碳水 ${pct(totals.carbs)}%',
                    '${totals.carbs.toStringAsFixed(1)}g'),
              ],
            ),
          ],
        ),
      ),
    );
  }

  Widget _macro(String label, String value) {
    return Expanded(
      child: Container(
        margin: const EdgeInsets.symmetric(horizontal: 3),
        padding: const EdgeInsets.symmetric(vertical: 10),
        decoration: BoxDecoration(
          color: Colors.white.withValues(alpha: 0.10),
          borderRadius: BorderRadius.circular(14),
        ),
        child: Column(
          children: [
            Text(value,
                style: const TextStyle(
                    color: Colors.white,
                    fontWeight: FontWeight.w900,
                    fontSize: 16)),
            const SizedBox(height: 2),
            Text(label,
                style: const TextStyle(color: Colors.white60, fontSize: 11)),
          ],
        ),
      ),
    );
  }

  Widget _metabolismCard(MetabolismResult m) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text('代謝估算',
                style: TextStyle(fontSize: 18, fontWeight: FontWeight.w900)),
            const SizedBox(height: 12),
            Row(
              children: [
                _metricBox(
                    'BMR 基礎代謝', m.bmr != null ? '${m.bmr} kcal' : '資料不足'),
                const SizedBox(width: 10),
                _metricBox(
                    'TDEE 每日消耗', m.tdee != null ? '${m.tdee} kcal' : '資料不足'),
              ],
            ),
            const SizedBox(height: 8),
            const Text('使用 Mifflin-St Jeor 公式估算，需填寫性別、生日、身高、體重與活動量。',
                style: TextStyle(fontSize: 11, color: Colors.black45)),
            Align(
              alignment: Alignment.centerRight,
              child: TextButton.icon(
                onPressed: _openProfile,
                icon: const Icon(Icons.edit, size: 16),
                label: const Text('編輯身體資料'),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _metricBox(String label, String value) {
    return Expanded(
      child: Container(
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(
          color: const Color(0xFFF5F5F4),
          borderRadius: BorderRadius.circular(12),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(value,
                style: const TextStyle(
                    fontSize: 18, fontWeight: FontWeight.w900)),
            const SizedBox(height: 2),
            Text(label,
                style: const TextStyle(fontSize: 11, color: Colors.black54)),
          ],
        ),
      ),
    );
  }

  Widget _mealsSection() {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(_weekView ? '本週餐點' : '當日餐點',
                style: const TextStyle(
                    fontSize: 18, fontWeight: FontWeight.w900)),
            const SizedBox(height: 8),
            MealList(meals: _meals, onChanged: _loadMeals),
          ],
        ),
      ),
    );
  }
}

/// AI daily summary card — fetched on demand (it can be slow / cost tokens).
class _DailySummaryCard extends StatefulWidget {
  const _DailySummaryCard({required this.date, super.key});
  final DateTime date;

  @override
  State<_DailySummaryCard> createState() => _DailySummaryCardState();
}

class _DailySummaryCardState extends State<_DailySummaryCard> {
  DailySummary? _summary;
  bool _loading = false;
  String? _error;

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final s = await MealService.dailySummary(widget.date);
      setState(() => _summary = s);
    } catch (e) {
      setState(() => _error = e.toString());
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                const Text('今日總結',
                    style: TextStyle(
                        fontSize: 18, fontWeight: FontWeight.w900)),
                const Spacer(),
                if (_summary == null && !_loading)
                  TextButton(
                      onPressed: _load, child: const Text('產生 AI 總結')),
              ],
            ),
            if (_loading)
              const Padding(
                padding: EdgeInsets.symmetric(vertical: 12),
                child: Text('AI 正在分析今日飲食...',
                    style: TextStyle(color: Color(0xFFB45309))),
              ),
            if (_error != null)
              Text(_error!, style: const TextStyle(color: Colors.red)),
            if (_summary != null) ...[
              const SizedBox(height: 8),
              Text(_summary!.aiSummary),
              const SizedBox(height: 12),
              Container(
                width: double.infinity,
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: const Color(0xFFFFFBEB),
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text('建議',
                        style: TextStyle(
                            fontWeight: FontWeight.w900,
                            color: Color(0xFF92400E))),
                    const SizedBox(height: 4),
                    Text(_summary!.aiRecommendation,
                        style: const TextStyle(color: Color(0xFF78350F))),
                  ],
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }
}

class _AdminPanel extends StatefulWidget {
  const _AdminPanel();

  @override
  State<_AdminPanel> createState() => _AdminPanelState();
}

class _AdminPanelState extends State<_AdminPanel> {
  bool? _open;
  bool _busy = false;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final open = await AuthService.getRegistrationOpen();
      if (mounted) setState(() => _open = open);
    } catch (_) {}
  }

  Future<void> _toggle(bool value) async {
    setState(() => _busy = true);
    try {
      final result = await AuthService.setRegistrationOpen(value);
      setState(() => _open = result);
    } catch (_) {
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text('管理員設定',
                style: TextStyle(fontSize: 18, fontWeight: FontWeight.w900)),
            SwitchListTile(
              contentPadding: EdgeInsets.zero,
              title: const Text('開放公開註冊'),
              subtitle: const Text('關閉後僅管理員可建立新帳號'),
              value: _open ?? true,
              onChanged: _busy || _open == null ? null : _toggle,
            ),
          ],
        ),
      ),
    );
  }
}
