import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';

import '../services/meal_analysis_controller.dart';
import '../theme/app_theme.dart';
import '../widgets/meal_capture_form.dart';

/// The entry points shown by the mobile capture source sheet.
enum CaptureLaunch { camera, gallery, describe, manual, none }

/// Full-screen mobile capture flow. The existing [MealCaptureForm] remains the
/// owner of image picking, saved-food lookup, background analysis, and save
/// semantics; this page only gives those controls a focused Android surface.
class MealCapturePage extends StatefulWidget {
  const MealCapturePage({
    super.key,
    required this.onSaved,
    this.controller,
    this.launch = CaptureLaunch.none,
    this.initialAdvice = '',
    this.savedFoodsRevision = 0,
    this.reviewExistingDraft = false,
  });

  final Future<void> Function() onSaved;
  final MealCaptureController? controller;
  final CaptureLaunch launch;
  final String initialAdvice;
  final int savedFoodsRevision;
  final bool reviewExistingDraft;

  @override
  State<MealCapturePage> createState() => _MealCapturePageState();
}

class _MealCapturePageState extends State<MealCapturePage> {
  @override
  void initState() {
    super.initState();
    if (widget.reviewExistingDraft) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted) MealAnalysisController.instance.requestReview();
      });
    }
  }

  CaptureMode get _mode => switch (widget.launch) {
    CaptureLaunch.describe => CaptureMode.describe,
    CaptureLaunch.manual => CaptureMode.manual,
    _ => CaptureMode.photo,
  };

  ImageSource? get _imageSource => switch (widget.launch) {
    CaptureLaunch.camera => ImageSource.camera,
    CaptureLaunch.gallery => ImageSource.gallery,
    _ => null,
  };

  @override
  Widget build(BuildContext context) {
    final isPhotoLaunch =
        widget.launch == CaptureLaunch.camera ||
        widget.launch == CaptureLaunch.gallery;

    return Scaffold(
      appBar: AppBar(
        title: const Text('記錄飲食'),
        leading: Semantics(
          button: true,
          label: '返回',
          child: IconButton(
            tooltip: '返回',
            icon: const Icon(Icons.arrow_back),
            onPressed: () => Navigator.of(context).maybePop(),
          ),
        ),
        bottom: MealAnalysisController.instance.isRunning
            ? const PreferredSize(
                preferredSize: Size.fromHeight(3),
                child: LinearProgressIndicator(minHeight: 3),
              )
            : null,
      ),
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.fromLTRB(16, 8, 16, 32),
          keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
          children: [
            Text(
              isPhotoLaunch ? '拍下這餐，AI 會先建立可編輯的估算草稿。' : '選擇輸入方式，確認內容後再儲存正式紀錄。',
              style: TextStyle(color: context.palette.inkSoft),
            ),
            const SizedBox(height: 12),
            MealCaptureForm(
              controller: widget.controller,
              onSaved: widget.onSaved,
              initialAdvice: widget.initialAdvice,
              savedFoodsRevision: widget.savedFoodsRevision,
              initialMode: _mode,
              initialImageSource: _imageSource,
            ),
          ],
        ),
      ),
    );
  }
}
