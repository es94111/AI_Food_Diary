package com.aifood.mobile

import io.flutter.embedding.android.FlutterFragmentActivity

// FlutterFragmentActivity (a ComponentActivity) is required so the `health`
// plugin can register its ActivityResultLauncher and launch the Health Connect
// permission screen. Plain FlutterActivity logs "Permission launcher not found".
class MainActivity : FlutterFragmentActivity()
