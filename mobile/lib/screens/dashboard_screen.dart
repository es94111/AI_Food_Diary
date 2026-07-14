import 'dart:async';

import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../models/models.dart';
import '../theme/app_theme.dart';
import '../services/api_client.dart';
import '../services/auth_service.dart';
import '../services/google_auth.dart';
import '../services/health_service.dart';
import '../services/home_widget_service.dart';
import '../services/meal_analysis_controller.dart';
import '../services/meal_service.dart';
import '../services/update_service.dart';
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
  double? _todayActiveCalories;
  String _yesterdaySummaryDateIso = '';
  String _yesterdaySummaryText = '';
  String _yesterdayRecommendationText = '';
  DailySummary? _yesterdaySummary;
  bool _yesterdaySummaryLoaded = false;
  String _nextMealAdvice = '';
  // Latest water total (ml) reported by the WaterCard, cached so the home-widget
  // publish can reuse it instead of issuing its own /api/water request.
  int _waterTotalMl = 0;
  int _tabIndex = 0;
  int _savedFoodsManagerReloadKey = 0;
  final Set<int> _mountedTabs = {0};
  bool _loading = true;
  String? _error;

  static const _tabTitles = ['飲食', '健康', '設定'];

  final _analysis = MealAnalysisController.instance;
  final _captureController = MealCaptureController();
  MealAnalysisStatus _lastAnalysisStatus = MealAnalysisStatus.idle;
  bool _quickCaptureOpening = false;

  @override
  void initState() {
    super.initState();
    HomeWidgetService.setQuickCaptureHandler(_startQuickCaptureFromWidget);
    _bootstrap();
    _analysis.addListener(_onAnalysisChanged);
  }

  @override
  void dispose() {
    HomeWidgetService.clearQuickCaptureHandler();
    _analysis.removeListener(_onAnalysisChanged);
    super.dispose();
  }

  /// Global notifier for the background meal analysis: when it finishes (on any
  /// tab) show a SnackBar with a one-tap "查看" that jumps to the 飲食 tab and
  /// opens the confirm sheet. Rebuilds for the cross-tab "分析中" progress bar.
  void _onAnalysisChanged() {
    if (!mounted) return;
    final status = _analysis.status;
    final changed = status != _lastAnalysisStatus;
    _lastAnalysisStatus = status;
    setState(() {});
    if (!changed) return;
    final messenger = ScaffoldMessenger.of(context);
    if (status == MealAnalysisStatus.done) {
      messenger
        ..hideCurrentSnackBar()
        ..showSnackBar(SnackBar(
          content: const Text('AI 分析完成'),
          duration: const Duration(seconds: 8),
          action: SnackBarAction(
            label: '查看',
            onPressed: () {
              setState(() => _tabIndex = 0);
              _analysis.requestReview();
            },
          ),
        ));
    } else if (status == MealAnalysisStatus.error) {
      messenger
        ..hideCurrentSnackBar()
        ..showSnackBar(SnackBar(
          content: Text('AI 分析失敗：${_analysis.error ?? ''}'),
          duration: const Duration(seconds: 6),
        ));
    }
  }

  Future<void> _bootstrap() async {
    // Paint instantly from whatever was cached last session, so opening the
    // app never blocks on the network before showing something. The network
    // refresh below still runs right after and silently replaces this with
    // fresh data.
    await _loadFromCache();
    try {
      _user = await AuthService.fetchMe();
      await _loadMeals();
      await _loadSyncedWeight();
    } catch (e) {
      // Keep any cached data on screen; only surface the error if we truly
      // have nothing to show.
      if (_user == null && _meals.isEmpty) {
        setState(() => _error = e.toString());
      }
    } finally {
      if (mounted) setState(() => _loading = false);
    }

    if (!mounted) return;
    final handledWidgetAction = await _consumeInitialWidgetAction();
    if (!mounted) return;

    // These jobs do not affect the first usable dashboard frame. Start them
    // after entry so they cannot serialise startup or compete with hidden-tab
    // requests for the first network connection.
    unawaited(_refreshAfterEntry(showPrompts: !handledWidgetAction));
  }

  Future<void> _refreshAfterEntry({required bool showPrompts}) async {
    await WidgetsBinding.instance.endOfFrame;
    final results = await Future.wait([
      _loadYesterdaySummaryForWidget().catchError((_) {}),
      MealService.peekNextMealAdvice().catchError((_) => ''),
      UpdateService.check(),
    ]);
    _nextMealAdvice = results[1] as String;
    final updateInfo = results[2] as AppVersionInfo;
    await _publishCalorieWidget();

    if (mounted && showPrompts) {
      await UpdateCard.promptIfAvailable(context, updateInfo);
      if (mounted) await _maybeShowYesterdaySummary();
    }

    // Health Connect can do substantial native reads and uploads. Give the user
    // a quiet interaction window before starting it, and never await it from UI.
    await Future<void>.delayed(const Duration(seconds: 30));
    if (mounted) unawaited(_syncHealthAfterEntry());
  }

  Future<void> _syncHealthAfterEntry() async {
    try {
      if (!await HealthService.hasPermissions()) return;
      await HealthService.syncNow(days: 2);
      await _loadSyncedWeight();
      await _publishCalorieWidget();
    } catch (_) {
      // The health card exposes retry/error UI. Startup refresh stays invisible.
    }
  }

  /// Reads last session's cached `/api/me` and meals-for-[_selectedDate]
  /// responses (if any) and paints them immediately, flipping off the
  /// full-screen spinner so the app opens instantly instead of waiting on the
  /// network. No-op (leaves `_loading` true) when there's nothing cached yet,
  /// e.g. right after a fresh login.
  Future<void> _loadFromCache() async {
    final cachedUser = await AuthService.cachedMe();
    final cachedMeals = await MealService.cachedMealsForDay(_selectedDate);
    if (!mounted || (cachedUser == null && cachedMeals.isEmpty)) return;
    cachedMeals.sort((a, b) => b.eatenAt.compareTo(a.eatenAt));
    setState(() {
      _user = cachedUser;
      _meals = cachedMeals;
      _loading = false;
    });
  }

  // On the first open of each local day, show yesterday's summary only when the
  // worker has already pre-computed it. Startup never falls back to a live AI
  // generation; the summary card still lets the user request that explicitly.
  Future<void> _maybeShowYesterdaySummary() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final now = DateTime.now();
      final todayKey = '${now.year}-${now.month}-${now.day}';
      if (prefs.getString('last_summary_popup_date') == todayKey) return;
      final yesterday = DateTime(now.year, now.month, now.day - 1);

      final summary = _yesterdaySummaryLoaded
          ? _yesterdaySummary
          : await MealService.dailySummary(yesterday); // peek, no AI
      if (summary == null) return;
      await prefs.setString('last_summary_popup_date', todayKey);
      if (!mounted) return;
      await showDailySummaryPopup(context, summary);
    } catch (_) {
      // Non-critical: never block the dashboard if the popup check fails.
    }
  }

  Future<void> _loadSyncedWeight() async {
    try {
      final status = await HealthService.status();
      final weight = status.latestByType['WEIGHT'];
      final height = status.latestByType['HEIGHT'];
      final total = status.latestByType['TOTAL_CALORIES'];
      final active = status.latestByType['ACTIVE_CALORIES'];
      final now = DateTime.now();
      bool isToday(DateTime d) =>
          d.year == now.year && d.month == now.month && d.day == now.day;
      if (!mounted) return;
      setState(() {
        if (weight != null && weight.unit.toLowerCase() == 'kg' &&
            weight.value > 0) {
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
        _todayActiveCalories =
            (active != null && active.value >= 0 && isToday(active.measuredAt))
            ? active.value
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
      if (!_weekView && _isToday) {
        await _publishCalorieWidget(meals);
      }
    } catch (e) {
      if (mounted) setState(() => _error = e.toString());
    }
  }

  Future<void> _logout() async {
    await GoogleAuth.signOut();
    await AuthService.logout();
    await HomeWidgetService.clearCalorieProgress();
    if (!mounted) return;
    Navigator.of(context).pushAndRemoveUntil(
      MaterialPageRoute(
          builder: (_) => const LoginScreen(),
          settings: const RouteSettings(name: '/login')),
      (route) => false,
    );
  }

  Future<bool> _consumeInitialWidgetAction() async {
    final action = await HomeWidgetService.consumeInitialAction();
    if (action != HomeWidgetService.quickCaptureAction) return false;
    await _startQuickCaptureFromWidget();
    return true;
  }

  Future<void> _startQuickCaptureFromWidget() async {
    if (_quickCaptureOpening || !mounted) return;
    _quickCaptureOpening = true;
    try {
      while (_loading && mounted) {
        await Future<void>.delayed(const Duration(milliseconds: 50));
      }
      if (!mounted) return;
      final today = startOfLocalDay(DateTime.now());
      final needsReload = _weekView || isoDate(_selectedDate) != isoDate(today);
      setState(() {
        _tabIndex = 0;
        _weekView = false;
        _selectedDate = today;
      });
      if (needsReload) await _loadMeals();
      await WidgetsBinding.instance.endOfFrame;
      if (!mounted) return;
      await _captureController.openCameraAndAnalyze();
    } finally {
      _quickCaptureOpening = false;
    }
  }

  Future<void> _publishCalorieWidget([List<Meal>? todayMeals]) async {
    if (_user == null) return;
    try {
      final today = startOfLocalDay(DateTime.now());
      final meals = todayMeals ??
          (!_weekView && _isToday
              ? _meals
              : await MealService.mealsForDay(today));
      final totals = Totals.fromMeals(meals);
      final metabolism = metabolismFor(
        _user?.profile,
        syncedWeightKg: _syncedWeight,
        syncedHeightCm: _syncedHeight,
      );
      final macroTargets =
          macroTargetsFor(metabolism.target, _user?.profile?.goal);
      await HomeWidgetService.updateCalorieProgress(
        consumedCalories: totals.calories.round(),
        targetCalories: metabolism.target,
        proteinGrams: totals.protein,
        fatGrams: totals.fat,
        carbsGrams: totals.carbs,
        proteinTargetGrams: macroTargets.protein,
        fatTargetGrams: macroTargets.fat,
        carbsTargetGrams: macroTargets.carbs,
        // Reuse the total the WaterCard already fetched, so the widget refresh
        // doesn't add its own /api/water round-trip.
        waterTotalMl: _waterTotalMl,
        waterGoalMl: _user?.profile?.waterGoalMl ?? 2000,
        yesterdaySummaryDateIso: _yesterdaySummaryDateIso,
        yesterdaySummaryText: _yesterdaySummaryText,
        yesterdayRecommendationText: _yesterdayRecommendationText,
        activeCalories: _todayActiveCalories?.round(),
        activeCaloriesDateIso:
            _todayActiveCalories == null ? '' : isoDate(today),
        dateIso: isoDate(today),
        sessionCookie: ApiClient.instance.sessionCookie,
      );
    } catch (_) {
      // Home widget sync is best-effort and should never interrupt the dashboard.
    }
  }

  Future<void> _loadYesterdaySummaryForWidget() async {
    final yesterday = startOfLocalDay(
      DateTime.now().subtract(const Duration(days: 1)),
    );
    try {
      final summary = await MealService.dailySummary(yesterday);
      _yesterdaySummary = summary;
      _yesterdaySummaryLoaded = true;
      _yesterdaySummaryDateIso = isoDate(yesterday);
      _yesterdaySummaryText = _widgetText(summary?.aiSummary ?? '');
      _yesterdayRecommendationText =
          _widgetText(summary?.aiRecommendation ?? '');
    } catch (_) {
      _yesterdaySummaryDateIso = isoDate(yesterday);
      _yesterdaySummaryText = '';
      _yesterdayRecommendationText = '';
    }
  }

  String _widgetText(String value) {
    return value
        .replaceAll(RegExp(r'[`*_>#\[\]]'), '')
        .replaceAll(RegExp(r'\s+'), ' ')
        .trim();
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
        // Cross-tab hint that a background meal analysis is in flight.
        bottom: _analysis.isRunning
            ? const PreferredSize(
                preferredSize: Size.fromHeight(4),
                child: LinearProgressIndicator(minHeight: 4),
              )
            : null,
      ),
      body: IndexedStack(
        index: _tabIndex,
        children: [
          _foodTab(totals, target),
          _mountedTabs.contains(1)
              ? _healthTab(metabolism)
              : const SizedBox.shrink(),
          _mountedTabs.contains(2)
              ? _settingsTab(metabolism)
              : const SizedBox.shrink(),
        ],
      ),
      bottomNavigationBar: NavigationBar(
        selectedIndex: _tabIndex,
        onDestinationSelected: (i) => setState(() {
          _tabIndex = i;
          _mountedTabs.add(i);
          if (i == 2) _savedFoodsManagerReloadKey++;
        }),
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
              child: Text(_error!,
                  style: TextStyle(color: context.palette.danger)),
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
              onChanged: (totalMl) {
                _waterTotalMl = totalMl;
                return _publishCalorieWidget();
              },
            ),
          ],
          const SizedBox(height: 12),
          MealCaptureForm(
            controller: _captureController,
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
        SavedFoodsManagerCard(
          key: ValueKey('saved-foods-manager-$_savedFoodsManagerReloadKey'),
        ),
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
            foregroundColor: context.palette.danger,
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
    await _publishCalorieWidget();
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
      await _publishCalorieWidget();
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
    return Container(
      decoration: BoxDecoration(
        gradient: AppColors.heroGradient,
        borderRadius: BorderRadius.circular(AppRadius.card),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.18),
            blurRadius: 20,
            offset: const Offset(0, 8),
          ),
        ],
      ),
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
                valueColor: const AlwaysStoppedAnimation(AppColors.amber),
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
        ? context.palette.success
        : net > 0
        ? context.palette.danger
        : context.palette.inkSoft;
    final label = deficit ? '熱量赤字' : (net > 0 ? '熱量盈餘' : '持平');
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(20),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Text('當日淨熱量',
                    style: TextStyle(color: context.palette.inkSoft)),
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
                Padding(
                  padding: const EdgeInsets.only(bottom: 6, left: 4),
                  child: Text(
                    'kcal',
                    style: TextStyle(
                      color: context.palette.inkFaint,
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
              style: TextStyle(color: context.palette.inkSoft, fontSize: 13),
            ),
            Text(
              '總消耗為 Health Connect 同步的實測值（基礎＋活動）。',
              style: TextStyle(color: context.palette.inkFaint, fontSize: 11),
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
              child: Container(color: AppColors.protein),
            ),
            Expanded(
              flex: macroFlex(fat),
              child: Container(color: AppColors.fat),
            ),
            Expanded(
              flex: macroFlex(carbs),
              child: Container(color: AppColors.carbs),
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
            Text(
              '使用 Mifflin-St Jeor 公式估算，需填寫性別、生日、身高、體重與活動量。',
              style: TextStyle(fontSize: 11, color: context.palette.inkFaint),
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
          color: context.palette.surfaceAlt,
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
              style: TextStyle(fontSize: 11, color: context.palette.inkSoft),
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
              Padding(
                padding: const EdgeInsets.only(top: 8),
                child: Text(
                  '今日總結需等今天結束後才能產生。',
                  style: TextStyle(color: context.palette.inkSoft, fontSize: 13),
                ),
              ),
            if (_loading)
              Padding(
                padding: const EdgeInsets.symmetric(vertical: 12),
                child: Text(
                  'AI 正在分析今日飲食...',
                  style: TextStyle(color: context.palette.brand),
                ),
              ),
            if (_error != null)
              Text(_error!, style: TextStyle(color: context.palette.danger)),
            if (_summary != null) ...[
              const SizedBox(height: 8),
              MarkdownText(_summary!.aiSummary),
              const SizedBox(height: 12),
              Container(
                width: double.infinity,
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: context.palette.amberSurface,
                  borderRadius: BorderRadius.circular(12),
                  border: Border.all(color: context.palette.amberBorder),
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      '建議',
                      style: TextStyle(
                        fontWeight: FontWeight.w900,
                        color: context.palette.amberInk,
                      ),
                    ),
                    const SizedBox(height: 4),
                    MarkdownText(
                      _summary!.aiRecommendation,
                      style: TextStyle(color: context.palette.amberInkSoft),
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
                  Icon(Icons.check_circle,
                      color: context.palette.success, size: 20),
                  const SizedBox(width: 6),
                  const Expanded(child: Text('已綁定 Google 帳號')),
                  TextButton(
                    onPressed: _busy ? null : _unbind,
                    child: Text(
                      '解除綁定',
                      style: TextStyle(color: context.palette.danger),
                    ),
                  ),
                ],
              )
            else ...[
              Text(
                '綁定後即可使用 Google 一鍵登入。',
                style: TextStyle(fontSize: 12, color: context.palette.inkSoft),
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
