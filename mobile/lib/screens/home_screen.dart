import 'package:flutter/material.dart';
import '../services/api_service.dart';
import '../services/health_service.dart';
import 'login_screen.dart';

class HomeScreen extends StatefulWidget {
  const HomeScreen({super.key});

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  bool _syncing = false;
  String? _message;
  Map<String, dynamic>? _status;

  @override
  void initState() {
    super.initState();
    _loadStatus();
  }

  Future<void> _loadStatus() async {
    try {
      final s = await ApiService.getSyncStatus();
      setState(() { _status = s; });
    } catch (_) {}
  }

  Future<void> _sync() async {
    setState(() { _syncing = true; _message = null; });
    try {
      final granted = await HealthService.requestPermissions();
      if (!granted) {
        setState(() { _message = '請授予 Health Connect 權限'; });
        return;
      }
      final metrics = await HealthService.fetchLast7Days();
      if (metrics.isEmpty) {
        setState(() { _message = '近 7 天無健康資料'; });
        return;
      }
      await ApiService.syncMetrics(metrics);
      await _loadStatus();
      setState(() { _message = '同步成功！已上傳 ${metrics.length} 筆資料'; });
    } catch (e) {
      setState(() { _message = '同步失敗：$e'; });
    } finally {
      setState(() { _syncing = false; });
    }
  }

  Future<void> _logout() async {
    await ApiService.clearToken();
    if (mounted) {
      Navigator.of(context).pushReplacement(
        MaterialPageRoute(builder: (_) => const LoginScreen()),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final latest = _status?['latestByType'] as Map<String, dynamic>?;

    return Scaffold(
      appBar: AppBar(
        title: const Text('健康同步'),
        actions: [
          IconButton(icon: const Icon(Icons.logout), onPressed: _logout),
        ],
      ),
      body: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            if (_status != null) ...[
              const Text('最新數據', style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
              const SizedBox(height: 12),
              _MetricCard(icon: Icons.directions_walk, label: '步數', data: latest?['STEPS'], unit: '步'),
              _MetricCard(icon: Icons.monitor_weight, label: '體重', data: latest?['WEIGHT'], unit: 'kg'),
              _MetricCard(icon: Icons.local_fire_department, label: '活動熱量', data: latest?['ACTIVE_CALORIES'], unit: 'kcal'),
              const SizedBox(height: 8),
              if (_status?['lastSyncedAt'] != null)
                Text('上次同步：${_status!['lastSyncedAt']}', style: TextStyle(color: Colors.grey[600], fontSize: 12)),
              const SizedBox(height: 24),
            ],
            if (_message != null) ...[
              Container(
                width: double.infinity,
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: _message!.contains('失敗') || _message!.contains('請授予')
                      ? Colors.red[50]
                      : Colors.green[50],
                  borderRadius: BorderRadius.circular(8),
                ),
                child: Text(_message!),
              ),
              const SizedBox(height: 16),
            ],
            SizedBox(
              width: double.infinity,
              child: FilledButton.icon(
                onPressed: _syncing ? null : _sync,
                icon: _syncing
                    ? const SizedBox(height: 20, width: 20, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                    : const Icon(Icons.sync),
                label: Text(_syncing ? '同步中...' : '同步近 7 天資料'),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _MetricCard extends StatelessWidget {
  final IconData icon;
  final String label;
  final Map<String, dynamic>? data;
  final String unit;

  const _MetricCard({required this.icon, required this.label, this.data, required this.unit});

  @override
  Widget build(BuildContext context) {
    final value = data?['value'];
    return Card(
      margin: const EdgeInsets.only(bottom: 8),
      child: ListTile(
        leading: Icon(icon, color: Colors.green),
        title: Text(label),
        trailing: value != null
            ? Text('$value $unit', style: const TextStyle(fontWeight: FontWeight.bold))
            : const Text('—', style: TextStyle(color: Colors.grey)),
      ),
    );
  }
}
