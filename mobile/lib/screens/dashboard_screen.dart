import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../models/models.dart';
import '../services/auth_service.dart';
import '../services/google_auth.dart';
import '../services/health_service.dart';
import '../services/meal_service.dart';
import '../utils/metabolism.dart';
import '../widgets/ai_settings_form.dart';
import '../widgets/health_sync_card.dart';
import '../widgets/daily_summary_popup.dart';
import '../widgets/markdown_text.dart';
import '../widgets/meal_capture_form.dart';
import '../widgets/meal_list.dart';
import '../widgets/water_card.dart';
import '../widgets/profile_form.dart';
import '../widgets/saved_foods_manager.dart';
import '../widgets/update_card.dart';
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
  double? _syncedHeight;
  // Today's measured total energy expenditure (Health Connect
  // TotalCaloriesBurned), for the net-calorie card. Null unless synced today.
  double? _todayTotalCalories;
  String _nextMealAdvice = '';
  int _tabIndex = 0;
  bool _loading = true;
  String? _error;

  static const _tabTitles = ['飲食', '健康', '設定'];

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
      // Re-display today's stored next-meal advice (persists across restarts).
      _nextMealAdvice = await MealService.peekNextMealAdvice();
    } catch (e) {
      setState(() => _error = e.toString());
    } finally {
      if (mounted) setState(() => _loading = false);
    }
    // After the dashboard is up, check for a newer app version and prompt.
    if (mounted) UpdateCard.checkAndPrompt(context);
    // Once per day, surface yesterday's pre-computed summary (peek only, no AI).
    if (mounted) _maybeShowYesterdaySummary();
  }

  // On the first open of each local day, show yesterday's summary. Normally the
  // server worker has already pre-computed it, so the peek is instant and no AI
  // runs. If it hasn't yet (first day, worker missed its window, etc.) we
  // generate it once on demand with a spinner so the user still sees it.
  Future<void> _maybeShowYesterdaySummary() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final now = DateTime.now();
      final todayKey = '${now.year}-${now.month}-${now.day}';
      if (prefs.getString('last_summary_popup_date') == todayKey) return;
      final yesterday = DateTime(now.year, now.month, now.day - 1);

      var summary = await MealService.dailySummary(yesterday); // peek, no AI
      if (summary == null && mounted) {
        summary = await _generateYesterdaySummary(yesterday);
      }
      // Mark handled for today so we don't re-generate on every open.
      await prefs.setString('last_summary_popup_date', todayKey);
      if (!mounted || summary == null) return;
      await showDailySummaryPopup(context, summary);
    } catch (_) {
      // Non-critical: never block the dashboard if the popup check fails.
    }
  }

  // Generates yesterday's summary on demand behind a blocking spinner. Returns
  // null if it couldn't be produced (no meals / no AI key / error).
  Future<DailySummary?> _generateYesterdaySummary(DateTime day) async {
    showDialog<void>(
      context: context,
      barrierDismissible: false,
      builder: (_) => const Center(
        child: Card(
          child: Padding(
            padding: EdgeInsets.all(20),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                SizedBox(
                  width: 22,
                  height: 22,
                  child: CircularProgressIndicator(strokeWidth: 2.5),
                ),
                SizedBox(width: 14),
                Text('正在整理昨日總結…'),
              ],
            ),
          ),
        ),
      ),
    );
    try {
      final summary = await MealService.dailySummary(day, generate: true);
      if (mounted) Navigator.of(context, rootNavigator: true).pop();
      return summary;
    } catch (_) {
      if (mounted) Navigator.of(context, rootNavigator: true).pop();
      return null;
    }
  }

  Future<void> _loadSyncedWeight() async {
    try {
      final status = await HealthService.status();
      final weight = status.latestByType['WEIGHT'];
      final height = status.latestByType['HEIGHT'];
      final total = status.latestByType['TOTAL_CALORIES'];
      final now = DateTime.now();
      bool isToday(DateTime d) =>
          d.year == now.year && d.month == now.month && d.day == now.day;
      if (!mounted) return;
      setState(() {
        if (weight != null && weight.unit.toLowerCase() == 'kg') {
          _syncedWeight = weight.value;
        }
        if (height != null && height.value > 0) {
          _syncedHeight = height.value; // already stored in cm
        }
        // Only today's expenditure is meaningful for today's net calories.
        _todayTotalCalories =
            (total != null && total.value > 0 && isToday(total.measuredAt))
            ? total.value
            : null;
      });
    } catch (_) {}
  }

  Future<void> _refreshUserAndMeals() async {
    try {
      _user = await AuthService.fetchMe();
    } catch (_) {}
    await _loadMeals();
  }

  Future<void> _loadMeals() async {
    try {
      final meals = _weekView
          ? await MealService.mealsForWeek(startOfLocalWeek(_selectedDate))
          : await MealService.mealsForDay(_selectedDate);
      meals.sort((a, b) => b.eatenAt.compareTo(a.eatenAt));
      if (mounted) setState(() => _meals = meals);
    } catch (e) {
      if (mounted) setState(() => _error = e.toString());
    }
  }

  Future<void> _logout() async {
    await GoogleAuth.signOut();
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

  bool get _isToday =>
      isoDate(_selectedDate) == isoDate(startOfLocalDay(DateTime.now()));

  bool get _canGoForward {
    final next = startOfLocalDay(
      _selectedDate.add(Duration(days: _weekView ? 7 : 1)),
    );
    return !next.isAfter(startOfLocalDay(DateTime.now()));
  }

  /// Steps the selected date by [days] (already ±1 day or ±7 for week view).
  /// Re-normalises to local midnight so repeated steps can't drift, and never
  /// navigates into the future (no meals exist there).
  void _changeDate(int days) {
    final candidate = startOfLocalDay(_selectedDate.add(Duration(days: days)));
    if (days > 0 && candidate.isAfter(startOfLocalDay(DateTime.now()))) return;
    setState(() => _selectedDate = candidate);
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
    final rawTotals = Totals.fromMeals(_meals);
    final totals = _weekView
        ? Totals(
            (rawTotals.calories / 7).roundToDouble(),
            rawTotals.protein / 7,
            rawTotals.fat / 7,
            rawTotals.carbs / 7,
          )
        : rawTotals;
    final metabolism = metabolismFor(
      _user?.profile,
      syncedWeightKg: _syncedWeight,
      syncedHeightCm: _syncedHeight,
    );
    final target = metabolism.target;

    return Scaffold(
      appBar: AppBar(
        title: Text(
          'AI Food Diary · ${_tabTitles[_tabIndex]}',
          style: const TextStyle(fontWeight: FontWeight.w900),
        ),
      ),
      body: IndexedStack(
        index: _tabIndex,
        children: [
          _foodTab(totals, target),
          _healthTab(metabolism),
          _settingsTab(metabolism),
        ],
      ),
      bottomNavigationBar: NavigationBar(
        selectedIndex: _tabIndex,
        onDestinationSelected: (i) => setState(() => _tabIndex = i),
        destinations: const [
          NavigationDestination(
            icon: Icon(Icons.restaurant_menu_outlined),
            selectedIcon: Icon(Icons.restaurant_menu),
            label: '飲食',
          ),
          NavigationDestination(
            icon: Icon(Icons.favorite_outline),
            selectedIcon: Icon(Icons.favorite),
            label: '健康',
          ),
          NavigationDestination(
            icon: Icon(Icons.settings_outlined),
            selectedIcon: Icon(Icons.settings),
            label: '設定',
          ),
        ],
      ),
    );
  }

  Widget _foodTab(Totals totals, int target) {
    return RefreshIndicator(
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
          if (!_weekView && _isToday && _todayTotalCalories != null) ...[
            const SizedBox(height: 12),
            _netCalorieCard(totals.calories.round(), _todayTotalCalories!),
          ],
          if (!_weekView) ...[
            const SizedBox(height: 12),
            WaterCard(
              key: ValueKey('water-${isoDate(_selectedDate)}'),
              date: _selectedDate,
              goalMl: _user?.profile?.waterGoalMl ?? 2000,
              isToday: _isToday,
              onGoalChanged: _refreshUserAndMeals,
            ),
          ],
          const SizedBox(height: 12),
          MealCaptureForm(
            onSaved: _loadMeals,
            initialAdvice: _nextMealAdvice,
            showAdvice: !_weekView && _isToday,
          ),
          const SizedBox(height: 12),
          _mealsSection(),
          const SizedBox(height: 12),
          _DailySummaryCard(date: _selectedDate, key: ValueKey(_selectedDate)),
          const SizedBox(height: 24),
        ],
      ),
    );
  }

  Widget _healthTab(MetabolismResult metabolism) {
    return RefreshIndicator(
      onRefresh: _refreshUserAndMeals,
      child: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          HealthSyncCard(onSynced: _onHealthSynced),
          const SizedBox(height: 12),
          _metabolismCard(metabolism),
          const SizedBox(height: 24),
        ],
      ),
    );
  }

  Widget _settingsTab(MetabolismResult metabolism) {
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        _accountCard(),
        const SizedBox(height: 12),
        _bodyDataCard(metabolism),
        const SizedBox(height: 12),
        const AiSettingsCard(),
        const SizedBox(height: 12),
        const SavedFoodsManagerCard(),
        if (GoogleAuth.isConfigured) ...[
          const SizedBox(height: 12),
          _GoogleLinkCard(
            linked: _user?.googleLinked ?? false,
            onChanged: _refreshUserAndMeals,
          ),
        ],
        const SizedBox(height: 12),
        const UpdateCard(),
        if (_user?.isAdmin == true) ...[
          const SizedBox(height: 12),
          const _AdminPanel(),
        ],
        const SizedBox(height: 12),
        OutlinedButton.icon(
          onPressed: _logout,
          icon: const Icon(Icons.logout),
          label: const Text('登出'),
          style: OutlinedButton.styleFrom(
            foregroundColor: Colors.red,
            padding: const EdgeInsets.symmetric(vertical: 14),
          ),
        ),
        const SizedBox(height: 24),
      ],
    );
  }

  Widget _accountCard() {
    return Card(
      child: ListTile(
        leading: const CircleAvatar(child: Icon(Icons.person)),
        title: Text(_user?.name?.isNotEmpty == true ? _user!.name! : '使用者'),
        subtitle: Text(_user?.email ?? ''),
        trailing: _user?.isAdmin == true
            ? const Chip(
                label: Text('管理員'),
                visualDensity: VisualDensity.compact,
              )
            : null,
      ),
    );
  }

  Widget _bodyDataCard(MetabolismResult metabolism) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text(
              '身體資料 / 代謝',
              style: TextStyle(fontSize: 18, fontWeight: FontWeight.w900),
            ),
            const SizedBox(height: 10),
            Row(
              children: [
                _metricBox(
                  'BMR 基礎代謝',
                  metabolism.bmr != null ? '${metabolism.bmr} kcal' : '資料不足',
                ),
                const SizedBox(width: 10),
                _metricBox('熱量目標', '${metabolism.target} kcal'),
              ],
            ),
            const SizedBox(height: 12),
            SizedBox(
              width: double.infinity,
              child: FilledButton.icon(
                onPressed: _openProfile,
                icon: const Icon(Icons.edit),
                label: const Text('編輯身體資料'),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Future<void> _onHealthSynced() async {
    await _loadSyncedWeight();
    await _persistSyncedWeightToProfile();
  }

  /// After a sync, write the latest Health Connect weight/height back into the
  /// user's profile (and recompute the calorie target) so saved settings reflect it.
  Future<void> _persistSyncedWeightToProfile() async {
    final weight = _syncedWeight;
    final profile = _user?.profile;
    final height = _syncedHeight?.round();

    final weightChanged =
        weight != null &&
        (profile?.weightKg == null ||
            (profile!.weightKg! - weight).abs() >= 0.05);
    final heightChanged =
        height != null && height > 0 && profile?.heightCm != height;
    if (!weightChanged && !heightChanged) return;

    try {
      final bmr = calculateBmr(
        gender: profile?.gender,
        birthDate: profile?.birthDate,
        heightCm: height ?? profile?.heightCm,
        weightKg: weight ?? profile?.weightKg,
      );
      final target = calorieTargetFromGoal(
        calculateTdee(bmr, profile?.activityLevel),
        profile?.goal,
      );
      await AuthService.updateProfile(
        weightKg: weightChanged ? weight : null,
        heightCm: heightChanged ? height : null,
        calorieTarget: target,
      );
      _user = await AuthService.fetchMe();
      if (mounted) setState(() {});
    } catch (_) {}
  }

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
                  icon: const Icon(Icons.chevron_left),
                ),
                TextButton(
                  onPressed: () {
                    setState(
                      () => _selectedDate = startOfLocalDay(DateTime.now()),
                    );
                    _loadMeals();
                  },
                  child: Text(label),
                ),
                IconButton(
                  onPressed: _canGoForward
                      ? () => _changeDate(_weekView ? 7 : 1)
                      : null,
                  icon: const Icon(Icons.chevron_right),
                ),
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
    final progress = target == 0
        ? 0.0
        : (totals.calories / target).clamp(0.0, 1.0);
    return Card(
      color: const Color(0xFF1C1917),
      child: Padding(
        padding: const EdgeInsets.all(20),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              _weekView ? '本週平均攝取' : '當日攝取',
              style: const TextStyle(color: Colors.white60),
            ),
            const SizedBox(height: 4),
            Row(
              crossAxisAlignment: CrossAxisAlignment.end,
              children: [
                Text(
                  fmtNum(totals.calories),
                  style: const TextStyle(
                    color: Colors.white,
                    fontSize: 44,
                    fontWeight: FontWeight.w900,
                  ),
                ),
                const Padding(
                  padding: EdgeInsets.only(bottom: 8, left: 4),
                  child: Text(
                    'kcal',
                    style: TextStyle(
                      color: Colors.white60,
                      fontSize: 16,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ),
              ],
            ),
            Text(
              '每日目標 $target kcal · ${(progress * 100).round()}%',
              style: const TextStyle(color: Colors.white38, fontSize: 13),
            ),
            const SizedBox(height: 12),
            ClipRRect(
              borderRadius: BorderRadius.circular(8),
              child: LinearProgressIndicator(
                value: progress.toDouble(),
                minHeight: 8,
                backgroundColor: Colors.white12,
                valueColor: const AlwaysStoppedAnimation(Color(0xFFF59E0B)),
              ),
            ),
            const SizedBox(height: 16),
            _macroBar(totals.protein, totals.fat, totals.carbs),
            const SizedBox(height: 16),
            Row(
              children: [
                _macro(
                  '蛋白質 ${pct(totals.protein)}%',
                  '${totals.protein.toStringAsFixed(1)}g',
                ),
                _macro(
                  '脂肪 ${pct(totals.fat)}%',
                  '${totals.fat.toStringAsFixed(1)}g',
                ),
                _macro(
                  '碳水 ${pct(totals.carbs)}%',
                  '${totals.carbs.toStringAsFixed(1)}g',
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }

  /// Net calories = intake − measured total expenditure. Sits beside the
  /// target-progress card (which uses the TDEE estimate); this one uses the
  /// *actual* Health Connect burn, so it only shows when synced today.
  Widget _netCalorieCard(int intake, double expenditure) {
    final burn = expenditure.round();
    final net = intake - burn;
    final deficit = net < 0;
    final color = deficit
        ? const Color(0xFF059669)
        : net > 0
        ? const Color(0xFFE11D48)
        : Colors.black54;
    final label = deficit ? '熱量赤字' : (net > 0 ? '熱量盈餘' : '持平');
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(20),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                const Text('當日淨熱量', style: TextStyle(color: Colors.black54)),
                const Spacer(),
                Container(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 10,
                    vertical: 4,
                  ),
                  decoration: BoxDecoration(
                    color: color.withValues(alpha: 0.12),
                    borderRadius: BorderRadius.circular(999),
                  ),
                  child: Text(
                    label,
                    style: TextStyle(
                      color: color,
                      fontWeight: FontWeight.w700,
                      fontSize: 12,
                    ),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 4),
            Row(
              crossAxisAlignment: CrossAxisAlignment.end,
              children: [
                Text(
                  net > 0 ? '+$net' : '$net',
                  style: TextStyle(
                    color: color,
                    fontSize: 40,
                    fontWeight: FontWeight.w900,
                  ),
                ),
                const Padding(
                  padding: EdgeInsets.only(bottom: 6, left: 4),
                  child: Text(
                    'kcal',
                    style: TextStyle(
                      color: Colors.black45,
                      fontSize: 14,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 2),
            Text(
              '攝取 $intake − 實測總消耗 $burn kcal',
              style: const TextStyle(color: Colors.black54, fontSize: 13),
            ),
            const Text(
              '總消耗為 Health Connect 同步的實測值（基礎＋活動）。',
              style: TextStyle(color: Colors.black38, fontSize: 11),
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
            Text(
              value,
              style: const TextStyle(
                color: Colors.white,
                fontWeight: FontWeight.w900,
                fontSize: 16,
              ),
            ),
            const SizedBox(height: 2),
            Text(
              label,
              style: const TextStyle(color: Colors.white60, fontSize: 11),
            ),
          ],
        ),
      ),
    );
  }

  Widget _macroBar(double protein, double fat, double carbs) {
    final total = protein + fat + carbs;
    int macroFlex(double value) =>
        total == 0 ? 1 : (value / total * 1000).round().clamp(1, 1000).toInt();

    return ClipRRect(
      borderRadius: BorderRadius.circular(999),
      child: SizedBox(
        height: 8,
        child: Row(
          children: [
            Expanded(
              flex: macroFlex(protein),
              child: Container(color: const Color(0xFF0EA5E9)),
            ),
            Expanded(
              flex: macroFlex(fat),
              child: Container(color: const Color(0xFFF59E0B)),
            ),
            Expanded(
              flex: macroFlex(carbs),
              child: Container(color: const Color(0xFFE11D48)),
            ),
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
            const Text(
              '代謝估算',
              style: TextStyle(fontSize: 18, fontWeight: FontWeight.w900),
            ),
            const SizedBox(height: 12),
            Row(
              children: [
                _metricBox(
                  'BMR 基礎代謝',
                  m.bmr != null ? '${m.bmr} kcal' : '資料不足',
                ),
                const SizedBox(width: 10),
                _metricBox(
                  'TDEE 每日消耗',
                  m.tdee != null ? '${m.tdee} kcal' : '資料不足',
                ),
              ],
            ),
            const SizedBox(height: 8),
            const Text(
              '使用 Mifflin-St Jeor 公式估算，需填寫性別、生日、身高、體重與活動量。',
              style: TextStyle(fontSize: 11, color: Colors.black45),
            ),
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
            Text(
              value,
              style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w900),
            ),
            const SizedBox(height: 2),
            Text(
              label,
              style: const TextStyle(fontSize: 11, color: Colors.black54),
            ),
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
            Text(
              _weekView ? '本週餐點' : '當日餐點',
              style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w900),
            ),
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

  @override
  void initState() {
    super.initState();
    _peek();
  }

  // Auto-display an already-stored summary on open (no AI spend).
  Future<void> _peek() async {
    try {
      final s = await MealService.dailySummary(widget.date);
      if (mounted && s != null) setState(() => _summary = s);
    } catch (_) {}
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final s = await MealService.dailySummary(widget.date, generate: true);
      setState(() => _summary = s);
    } catch (e) {
      setState(() => _error = e.toString());
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final canGenerate = startOfLocalDay(
      widget.date,
    ).isBefore(startOfLocalDay(DateTime.now()));

    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                const Text(
                  '今日總結',
                  style: TextStyle(fontSize: 18, fontWeight: FontWeight.w900),
                ),
                const Spacer(),
                if (_summary == null && !_loading)
                  TextButton(
                    onPressed: canGenerate ? _load : null,
                    child: const Text('產生 AI 總結'),
                  ),
              ],
            ),
            if (_summary == null && !_loading && !canGenerate)
              const Padding(
                padding: EdgeInsets.only(top: 8),
                child: Text(
                  '今日總結需等今天結束後才能產生。',
                  style: TextStyle(color: Colors.black54, fontSize: 13),
                ),
              ),
            if (_loading)
              const Padding(
                padding: EdgeInsets.symmetric(vertical: 12),
                child: Text(
                  'AI 正在分析今日飲食...',
                  style: TextStyle(color: Color(0xFFB45309)),
                ),
              ),
            if (_error != null)
              Text(_error!, style: const TextStyle(color: Colors.red)),
            if (_summary != null) ...[
              const SizedBox(height: 8),
              MarkdownText(_summary!.aiSummary),
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
                    const Text(
                      '建議',
                      style: TextStyle(
                        fontWeight: FontWeight.w900,
                        color: Color(0xFF92400E),
                      ),
                    ),
                    const SizedBox(height: 4),
                    MarkdownText(
                      _summary!.aiRecommendation,
                      style: const TextStyle(color: Color(0xFF78350F)),
                    ),
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
            const Text(
              '管理員設定',
              style: TextStyle(fontSize: 18, fontWeight: FontWeight.w900),
            ),
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

/// Settings card: bind / unbind a Google account to the current user.
class _GoogleLinkCard extends StatefulWidget {
  const _GoogleLinkCard({required this.linked, required this.onChanged});
  final bool linked;
  final Future<void> Function() onChanged;

  @override
  State<_GoogleLinkCard> createState() => _GoogleLinkCardState();
}

class _GoogleLinkCardState extends State<_GoogleLinkCard> {
  late bool _linked = widget.linked;
  bool _busy = false;

  Future<void> _bind() async {
    setState(() => _busy = true);
    try {
      final idToken = await GoogleAuth.getIdToken();
      if (idToken == null) return; // cancelled
      await AuthService.linkGoogle(idToken);
      await widget.onChanged();
      if (!mounted) return;
      setState(() => _linked = true);
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(const SnackBar(content: Text('已綁定 Google 帳號')));
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(SnackBar(content: Text('綁定失敗：$e')));
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _unbind() async {
    setState(() => _busy = true);
    try {
      await AuthService.unlinkGoogle();
      await GoogleAuth.signOut();
      await widget.onChanged();
      if (mounted) setState(() => _linked = false);
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(SnackBar(content: Text('解除綁定失敗：$e')));
      }
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
            const Text(
              'Google 帳號綁定',
              style: TextStyle(fontSize: 18, fontWeight: FontWeight.w900),
            ),
            const SizedBox(height: 8),
            if (_linked)
              Row(
                children: [
                  Icon(Icons.check_circle, color: Colors.green[600], size: 20),
                  const SizedBox(width: 6),
                  const Expanded(child: Text('已綁定 Google 帳號')),
                  TextButton(
                    onPressed: _busy ? null : _unbind,
                    child: const Text(
                      '解除綁定',
                      style: TextStyle(color: Colors.red),
                    ),
                  ),
                ],
              )
            else ...[
              const Text(
                '綁定後即可使用 Google 一鍵登入。',
                style: TextStyle(fontSize: 12, color: Colors.black54),
              ),
              const SizedBox(height: 10),
              SizedBox(
                width: double.infinity,
                child: OutlinedButton.icon(
                  onPressed: _busy ? null : _bind,
                  icon: _busy
                      ? const SizedBox(
                          height: 16,
                          width: 16,
                          child: CircularProgressIndicator(strokeWidth: 2),
                        )
                      : const Icon(Icons.link),
                  label: const Text('綁定 Google 帳號'),
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }
}
