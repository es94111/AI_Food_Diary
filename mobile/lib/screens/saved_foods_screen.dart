import 'package:flutter/material.dart';

import '../widgets/saved_foods_manager.dart';

class SavedFoodsScreen extends StatelessWidget {
  const SavedFoodsScreen({super.key});

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(title: Text('我的食物管理')),
    body: const SafeArea(child: SavedFoodsManager()),
  );
}
