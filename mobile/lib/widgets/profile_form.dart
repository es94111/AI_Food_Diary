import 'package:flutter/material.dart';

import '../models/models.dart';
import '../services/auth_service.dart';
import '../utils/metabolism.dart';

const _genders = {'MALE': '男性', 'FEMALE': '女性'};
const _activityLevels = {
  'SEDENTARY': '久坐少動',
  'LIGHT': '輕度活動',
  'MODERATE': '中度活動',
  'HIGH': '高度活動',
  'ATHLETE': '運動員等級',
};
const _goals = {'LOSE_FAT': '減脂', 'MAINTAIN': '維持', 'BUILD_MUSCLE': '增肌'};

/// BMR / TDEE profile editor, opened as a bottom sheet from the dashboard.
class ProfileFormSheet extends StatefulWidget {
  const ProfileFormSheet({super.key, required this.profile});
  final UserProfile? profile;

  @override
  State<ProfileFormSheet> createState() => _ProfileFormSheetState();
}

class _ProfileFormSheetState extends State<ProfileFormSheet> {
  late String _gender = widget.profile?.gender ?? 'MALE';
  late String _activity = widget.profile?.activityLevel ?? 'SEDENTARY';
  late String _goal = widget.profile?.goal ?? 'MAINTAIN';
  late final _birthCtrl = TextEditingController(
      text: widget.profile?.birthDate != null
          ? widget.profile!.birthDate!.split('T').first
          : '');
  late final _heightCtrl = TextEditingController(
      text: widget.profile?.heightCm?.toString() ?? '');
  late final _weightCtrl = TextEditingController(
      text: widget.profile?.weightKg?.toString() ?? '');
  bool _saving = false;
  String? _message;

  @override
  void dispose() {
    _birthCtrl.dispose();
    _heightCtrl.dispose();
    _weightCtrl.dispose();
    super.dispose();
  }

  int get _computedTarget {
    final bmr = calculateBmr(
      gender: _gender,
      birthDate: _birthCtrl.text,
      heightCm: int.tryParse(_heightCtrl.text),
      weightKg: double.tryParse(_weightCtrl.text),
    );
    final tdee = calculateTdee(bmr, _activity);
    return calorieTargetFromGoal(tdee, _goal) ??
        widget.profile?.calorieTarget ??
        2000;
  }

  Future<void> _pickBirthDate() async {
    final initial =
        DateTime.tryParse(_birthCtrl.text) ?? DateTime(2000, 1, 1);
    final picked = await showDatePicker(
      context: context,
      initialDate: initial,
      firstDate: DateTime(1900),
      lastDate: DateTime.now(),
    );
    if (picked != null) {
      setState(() => _birthCtrl.text = isoDate(picked));
    }
  }

  Future<void> _save() async {
    setState(() {
      _saving = true;
      _message = null;
    });
    try {
      await AuthService.updateProfile(
        gender: _gender,
        birthDate: _birthCtrl.text.trim().isEmpty ? null : _birthCtrl.text.trim(),
        heightCm: int.tryParse(_heightCtrl.text.trim()),
        weightKg: double.tryParse(_weightCtrl.text.trim()),
        activityLevel: _activity,
        goal: _goal,
        calorieTarget: _computedTarget,
      );
      if (mounted) Navigator.pop(context, true);
    } catch (e) {
      setState(() => _message = e.toString());
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return DraggableScrollableSheet(
      expand: false,
      initialChildSize: 0.85,
      maxChildSize: 0.95,
      builder: (ctx, controller) => Padding(
        padding: EdgeInsets.only(
            left: 16,
            right: 16,
            bottom: MediaQuery.of(context).viewInsets.bottom + 16),
        child: ListView(
          controller: controller,
          children: [
            const Text('BMR / TDEE 設定',
                style: TextStyle(fontSize: 20, fontWeight: FontWeight.w900)),
            const SizedBox(height: 4),
            const Text('填寫身體資料後會自動估算基礎代謝與每日總消耗。',
                style: TextStyle(fontSize: 12, color: Colors.black54)),
            const SizedBox(height: 16),
            DropdownButtonFormField<String>(
              initialValue: _gender,
              decoration: const InputDecoration(
                  labelText: '性別', border: OutlineInputBorder()),
              items: _genders.entries
                  .map((e) =>
                      DropdownMenuItem(value: e.key, child: Text(e.value)))
                  .toList(),
              onChanged: (v) => setState(() => _gender = v ?? 'MALE'),
            ),
            const SizedBox(height: 12),
            TextField(
              controller: _birthCtrl,
              readOnly: true,
              onTap: _pickBirthDate,
              decoration: const InputDecoration(
                labelText: '生日',
                hintText: 'YYYY-MM-DD',
                suffixIcon: Icon(Icons.calendar_today),
                border: OutlineInputBorder(),
              ),
            ),
            const SizedBox(height: 12),
            TextField(
              controller: _heightCtrl,
              keyboardType: TextInputType.number,
              onChanged: (_) => setState(() {}),
              decoration: const InputDecoration(
                  labelText: '身高 cm', border: OutlineInputBorder()),
            ),
            const SizedBox(height: 12),
            TextField(
              controller: _weightCtrl,
              keyboardType:
                  const TextInputType.numberWithOptions(decimal: true),
              onChanged: (_) => setState(() {}),
              decoration: const InputDecoration(
                  labelText: '體重 kg', border: OutlineInputBorder()),
            ),
            const SizedBox(height: 12),
            DropdownButtonFormField<String>(
              initialValue: _activity,
              decoration: const InputDecoration(
                  labelText: '活動量', border: OutlineInputBorder()),
              items: _activityLevels.entries
                  .map((e) =>
                      DropdownMenuItem(value: e.key, child: Text(e.value)))
                  .toList(),
              onChanged: (v) => setState(() => _activity = v ?? 'SEDENTARY'),
            ),
            const SizedBox(height: 12),
            DropdownButtonFormField<String>(
              initialValue: _goal,
              decoration: const InputDecoration(
                  labelText: '目標', border: OutlineInputBorder()),
              items: _goals.entries
                  .map((e) =>
                      DropdownMenuItem(value: e.key, child: Text(e.value)))
                  .toList(),
              onChanged: (v) => setState(() => _goal = v ?? 'MAINTAIN'),
            ),
            const SizedBox(height: 16),
            Container(
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: const Color(0xFFFFFBEB),
                borderRadius: BorderRadius.circular(12),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text('自動熱量目標',
                      style: TextStyle(
                          fontSize: 12,
                          fontWeight: FontWeight.w600,
                          color: Color(0xFFB45309))),
                  Text('$_computedTarget kcal',
                      style: const TextStyle(
                          fontSize: 24,
                          fontWeight: FontWeight.w900,
                          color: Color(0xFF78350F))),
                  const Text('依 TDEE 與目標自動計算：減脂 -400、增肌 +250、維持 = TDEE。',
                      style: TextStyle(
                          fontSize: 11, color: Color(0xFFB45309))),
                ],
              ),
            ),
            if (_message != null) ...[
              const SizedBox(height: 10),
              Text(_message!, style: const TextStyle(color: Colors.red)),
            ],
            const SizedBox(height: 16),
            FilledButton(
              onPressed: _saving ? null : _save,
              style: FilledButton.styleFrom(
                  padding: const EdgeInsets.symmetric(vertical: 14)),
              child: _saving
                  ? const SizedBox(
                      height: 20,
                      width: 20,
                      child: CircularProgressIndicator(
                          strokeWidth: 2, color: Colors.white))
                  : const Text('儲存身體資料'),
            ),
            const SizedBox(height: 8),
          ],
        ),
      ),
    );
  }
}
