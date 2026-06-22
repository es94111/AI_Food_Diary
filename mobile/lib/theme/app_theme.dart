import 'package:flutter/material.dart';

/// Brightness-independent colours.
///
/// These read well on both light and dark surfaces, so they stay constant:
/// the macro hues (used in legends/bars), the progress accent, and the dark
/// "hero" calorie card (which is intentionally dark in both themes).
///
/// Everything that must flip between light and dark — text, surfaces, borders,
/// the brand amber, callout clusters — lives in [AppPalette] instead and is
/// resolved per-theme via `context.palette`.
class AppColors {
  AppColors._();

  // Macronutrients — one source of truth for bars + legends.
  static const Color protein = Color(0xFF0EA5E9); // sky
  static const Color fat = Color(0xFFF59E0B); // amber
  static const Color carbs = Color(0xFFF43F5E); // rose

  // Progress / accent amber (e.g. the calorie ring on the hero card).
  static const Color amber = Color(0xFFF59E0B);

  // ── Data-vis hues ──────────────────────────────────────────────────
  // Saturated mid-tones that read on both light and dark surfaces, so
  // charts/legends/metric accents reference these instead of re-hardcoding.
  static const Color sky = Color(0xFF0EA5E9); // generic chart line (= protein)

  // Health metric group accents (icon tints on the sync card).
  static const Color activity = Color(0xFFD97706); // amber-600
  static const Color body = Color(0xFF0284C7); // sky-600
  static const Color vitals = Color(0xFFE11D48); // rose-600
  static const Color sleep = Color(0xFF6366F1); // indigo-500
  static const Color nutrition = Color(0xFF059669); // emerald-600

  // Sleep stages (legend + stacked bar).
  static const Color sleepDeep = Color(0xFF4338CA);
  static const Color sleepLight = Color(0xFF818CF8);
  static const Color sleepRem = Color(0xFFC4B5FD);
  static const Color sleepAwake = Color(0xFFFCD34D);

  // Status hues for metric values (good / warn / bad). Brightness-independent
  // because they sit on neutral surfaces in both themes.
  static const Color statusGood = Color(0xFF059669);
  static const Color statusWarn = Color(0xFFD97706);
  static const Color statusBad = Color(0xFFE11D48);

  // Hero (the dark calorie card) — dark in both themes.
  static const Color heroTop = Color(0xFF292320);
  static const Color heroBottom = Color(0xFF1A1614);
  static const LinearGradient heroGradient = LinearGradient(
    begin: Alignment.topLeft,
    end: Alignment.bottomRight,
    colors: [heroTop, heroBottom],
  );
}

/// Shared shape language so every card/sheet/button rounds the same way.
class AppRadius {
  AppRadius._();
  static const double card = 20;
  static const double field = 14;
  static const double chip = 999;
}

/// Semantic, theme-aware colour tokens. Resolve with `context.palette`.
///
/// Registered as a [ThemeExtension] on both the light and dark [ThemeData], so
/// the same token (e.g. `inkSoft`, `amberSurface`) yields the right colour for
/// the active brightness without any `Theme.of(context).brightness` branching
/// at call sites.
@immutable
class AppPalette extends ThemeExtension<AppPalette> {
  const AppPalette({
    required this.scaffold,
    required this.surface,
    required this.surfaceAlt,
    required this.hairline,
    required this.ink,
    required this.inkSoft,
    required this.inkFaint,
    required this.brand,
    required this.brandStrong,
    required this.onBrand,
    required this.amberSurface,
    required this.amberBorder,
    required this.amberInk,
    required this.amberInkSoft,
    required this.amberAccent,
    required this.success,
    required this.successSurface,
    required this.successInk,
    required this.danger,
    required this.dangerSurface,
    required this.dangerInk,
    required this.water,
    required this.waterSurface,
    required this.waterTrack,
    required this.overlay,
  });

  // Surfaces & text
  final Color scaffold;
  final Color surface;
  final Color surfaceAlt;
  final Color hairline;
  final Color ink; // primary text (≈ black87)
  final Color inkSoft; // secondary text (≈ black54)
  final Color inkFaint; // tertiary text (≈ black38)

  // Brand
  final Color brand; // accent / emphasis text + button fill
  final Color brandStrong; // stronger heading accent
  final Color onBrand; // text/icon on a brand-filled surface

  // Amber callout cluster (AI advice, version notes, info banners)
  final Color amberSurface;
  final Color amberBorder;
  final Color amberInk; // heading on amber surface
  final Color amberInkSoft; // body on amber surface
  final Color amberAccent; // sub-text accent on amber surface

  // Status
  final Color success;
  final Color successSurface;
  final Color successInk;
  final Color danger;
  final Color dangerSurface;
  final Color dangerInk;

  // Water (hydration card)
  final Color water;
  final Color waterSurface;
  final Color waterTrack;

  // Faint neutral fill — progress tracks, code-span backgrounds, hover wash.
  // Dark-on-light in light mode, light-on-dark in dark mode.
  final Color overlay;

  static const AppPalette light = AppPalette(
    scaffold: Color(0xFFFAF8F5),
    surface: Color(0xFFFFFFFF),
    surfaceAlt: Color(0xFFF4F1EC),
    hairline: Color(0xFFE9E3DA),
    ink: Color(0xFF1C1917),
    inkSoft: Color(0xFF57534E),
    inkFaint: Color(0xFF8A817A),
    brand: Color(0xFFB45309),
    brandStrong: Color(0xFF92400E),
    onBrand: Color(0xFFFFFFFF),
    amberSurface: Color(0xFFFFFBEB),
    amberBorder: Color(0xFFFCD34D),
    amberInk: Color(0xFF92400E),
    amberInkSoft: Color(0xFF78350F),
    amberAccent: Color(0xFFB45309),
    success: Color(0xFF059669),
    successSurface: Color(0xFFECFDF5),
    successInk: Color(0xFF15803D),
    danger: Color(0xFFE11D48),
    dangerSurface: Color(0xFFFEF2F2),
    dangerInk: Color(0xFFB91C1C),
    water: Color(0xFF0284C7),
    waterSurface: Color(0xFFEFF8FE),
    waterTrack: Color(0xFFE0F2FE),
    overlay: Color(0x0F000000),
  );

  static const AppPalette dark = AppPalette(
    scaffold: Color(0xFF14110F),
    surface: Color(0xFF211C19),
    surfaceAlt: Color(0xFF2C2622),
    hairline: Color(0xFF3A332E),
    ink: Color(0xFFF5F0EA),
    inkSoft: Color(0xFFB8AFA5),
    inkFaint: Color(0xFF8A7F75),
    brand: Color(0xFFFBBF24), // amber-400 reads on dark
    brandStrong: Color(0xFFFCD34D),
    onBrand: Color(0xFF1A1614),
    amberSurface: Color(0xFF2A2012),
    amberBorder: Color(0xFF5A4514),
    amberInk: Color(0xFFFCD34D),
    amberInkSoft: Color(0xFFFDE68A),
    amberAccent: Color(0xFFFBBF24),
    success: Color(0xFF34D399),
    successSurface: Color(0xFF0E2A1E),
    successInk: Color(0xFF6EE7B7),
    danger: Color(0xFFFB7185),
    dangerSurface: Color(0xFF2E1416),
    dangerInk: Color(0xFFFCA5A5),
    water: Color(0xFF38BDF8),
    waterSurface: Color(0xFF0E2230),
    waterTrack: Color(0xFF16364A),
    overlay: Color(0x14FFFFFF),
  );

  @override
  AppPalette copyWith({
    Color? scaffold,
    Color? surface,
    Color? surfaceAlt,
    Color? hairline,
    Color? ink,
    Color? inkSoft,
    Color? inkFaint,
    Color? brand,
    Color? brandStrong,
    Color? onBrand,
    Color? amberSurface,
    Color? amberBorder,
    Color? amberInk,
    Color? amberInkSoft,
    Color? amberAccent,
    Color? success,
    Color? successSurface,
    Color? successInk,
    Color? danger,
    Color? dangerSurface,
    Color? dangerInk,
    Color? water,
    Color? waterSurface,
    Color? waterTrack,
    Color? overlay,
  }) {
    return AppPalette(
      scaffold: scaffold ?? this.scaffold,
      surface: surface ?? this.surface,
      surfaceAlt: surfaceAlt ?? this.surfaceAlt,
      hairline: hairline ?? this.hairline,
      ink: ink ?? this.ink,
      inkSoft: inkSoft ?? this.inkSoft,
      inkFaint: inkFaint ?? this.inkFaint,
      brand: brand ?? this.brand,
      brandStrong: brandStrong ?? this.brandStrong,
      onBrand: onBrand ?? this.onBrand,
      amberSurface: amberSurface ?? this.amberSurface,
      amberBorder: amberBorder ?? this.amberBorder,
      amberInk: amberInk ?? this.amberInk,
      amberInkSoft: amberInkSoft ?? this.amberInkSoft,
      amberAccent: amberAccent ?? this.amberAccent,
      success: success ?? this.success,
      successSurface: successSurface ?? this.successSurface,
      successInk: successInk ?? this.successInk,
      danger: danger ?? this.danger,
      dangerSurface: dangerSurface ?? this.dangerSurface,
      dangerInk: dangerInk ?? this.dangerInk,
      water: water ?? this.water,
      waterSurface: waterSurface ?? this.waterSurface,
      waterTrack: waterTrack ?? this.waterTrack,
      overlay: overlay ?? this.overlay,
    );
  }

  @override
  AppPalette lerp(ThemeExtension<AppPalette>? other, double t) {
    if (other is! AppPalette) return this;
    Color c(Color a, Color b) => Color.lerp(a, b, t)!;
    return AppPalette(
      scaffold: c(scaffold, other.scaffold),
      surface: c(surface, other.surface),
      surfaceAlt: c(surfaceAlt, other.surfaceAlt),
      hairline: c(hairline, other.hairline),
      ink: c(ink, other.ink),
      inkSoft: c(inkSoft, other.inkSoft),
      inkFaint: c(inkFaint, other.inkFaint),
      brand: c(brand, other.brand),
      brandStrong: c(brandStrong, other.brandStrong),
      onBrand: c(onBrand, other.onBrand),
      amberSurface: c(amberSurface, other.amberSurface),
      amberBorder: c(amberBorder, other.amberBorder),
      amberInk: c(amberInk, other.amberInk),
      amberInkSoft: c(amberInkSoft, other.amberInkSoft),
      amberAccent: c(amberAccent, other.amberAccent),
      success: c(success, other.success),
      successSurface: c(successSurface, other.successSurface),
      successInk: c(successInk, other.successInk),
      danger: c(danger, other.danger),
      dangerSurface: c(dangerSurface, other.dangerSurface),
      dangerInk: c(dangerInk, other.dangerInk),
      water: c(water, other.water),
      waterSurface: c(waterSurface, other.waterSurface),
      waterTrack: c(waterTrack, other.waterTrack),
      overlay: c(overlay, other.overlay),
    );
  }
}

/// Convenience access to the semantic palette: `context.palette.inkSoft`.
extension AppPaletteX on BuildContext {
  AppPalette get palette =>
      Theme.of(this).extension<AppPalette>() ?? AppPalette.light;
}

class AppTheme {
  AppTheme._();

  static const Color _seed = Color(0xFFB45309); // amber-800, matches web

  static ThemeData light() => _build(Brightness.light, AppPalette.light);
  static ThemeData dark() => _build(Brightness.dark, AppPalette.dark);

  static ThemeData _build(Brightness brightness, AppPalette p) {
    final scheme =
        ColorScheme.fromSeed(seedColor: _seed, brightness: brightness).copyWith(
          surface: p.surface,
          onSurface: p.ink,
          surfaceContainerHighest: p.surfaceAlt,
          outlineVariant: p.hairline,
          primary: p.brand,
          onPrimary: p.onBrand,
          error: p.danger,
        );

    final base = ThemeData(
      colorScheme: scheme,
      useMaterial3: true,
      brightness: brightness,
      scaffoldBackgroundColor: p.scaffold,
      splashFactory: InkSparkle.splashFactory,
      extensions: [p],
    );

    return base.copyWith(
      textTheme: base.textTheme.apply(bodyColor: p.ink, displayColor: p.ink),

      appBarTheme: AppBarThemeData(
        backgroundColor: p.scaffold,
        foregroundColor: p.ink,
        elevation: 0,
        scrolledUnderElevation: 0.5,
        centerTitle: false,
        titleTextStyle: TextStyle(
          color: p.ink,
          fontSize: 19,
          fontWeight: FontWeight.w800,
          letterSpacing: -0.2,
        ),
      ),

      cardTheme: CardThemeData(
        color: p.surface,
        elevation: 0,
        margin: EdgeInsets.zero,
        clipBehavior: Clip.antiAlias,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(AppRadius.card),
          side: BorderSide(color: p.hairline),
        ),
      ),

      navigationBarTheme: NavigationBarThemeData(
        backgroundColor: p.surface,
        indicatorColor: p.brand.withValues(alpha: 0.14),
        elevation: 3,
        height: 64,
        labelTextStyle: WidgetStateProperty.resolveWith(
          (states) => TextStyle(
            fontSize: 12,
            fontWeight: states.contains(WidgetState.selected)
                ? FontWeight.w700
                : FontWeight.w500,
            color: states.contains(WidgetState.selected)
                ? p.brandStrong
                : p.inkSoft,
          ),
        ),
        iconTheme: WidgetStateProperty.resolveWith(
          (states) => IconThemeData(
            color: states.contains(WidgetState.selected)
                ? p.brandStrong
                : p.inkSoft,
          ),
        ),
      ),

      filledButtonTheme: FilledButtonThemeData(
        style: FilledButton.styleFrom(
          backgroundColor: p.brand,
          foregroundColor: p.onBrand,
          padding: const EdgeInsets.symmetric(vertical: 14, horizontal: 20),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(AppRadius.field),
          ),
          textStyle: const TextStyle(fontSize: 15, fontWeight: FontWeight.w700),
        ),
      ),

      outlinedButtonTheme: OutlinedButtonThemeData(
        style: OutlinedButton.styleFrom(
          foregroundColor: p.brandStrong,
          side: BorderSide(color: p.hairline),
          padding: const EdgeInsets.symmetric(vertical: 14, horizontal: 20),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(AppRadius.field),
          ),
          textStyle: const TextStyle(fontSize: 15, fontWeight: FontWeight.w600),
        ),
      ),

      textButtonTheme: TextButtonThemeData(
        style: TextButton.styleFrom(
          foregroundColor: p.brandStrong,
          textStyle: const TextStyle(fontSize: 14, fontWeight: FontWeight.w600),
        ),
      ),

      chipTheme: ChipThemeData(
        backgroundColor: p.surfaceAlt,
        selectedColor: p.brand.withValues(alpha: 0.16),
        side: BorderSide.none,
        labelStyle: TextStyle(
          fontSize: 13,
          fontWeight: FontWeight.w600,
          color: p.inkSoft,
        ),
        secondaryLabelStyle: TextStyle(
          fontSize: 13,
          fontWeight: FontWeight.w700,
          color: p.brandStrong,
        ),
        shape: const StadiumBorder(),
        showCheckmark: false,
      ),

      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: p.surface,
        contentPadding: const EdgeInsets.symmetric(
          horizontal: 16,
          vertical: 16,
        ),
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(AppRadius.field),
          borderSide: BorderSide(color: p.hairline),
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(AppRadius.field),
          borderSide: BorderSide(color: p.hairline),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(AppRadius.field),
          borderSide: BorderSide(color: p.brand, width: 1.8),
        ),
        labelStyle: TextStyle(color: p.inkSoft),
      ),

      dividerTheme: DividerThemeData(color: p.hairline, thickness: 1, space: 1),

      // Inverse surface: dark bar in light mode, light bar in dark mode — text
      // is the opposite (surface) so it always contrasts.
      snackBarTheme: SnackBarThemeData(
        behavior: SnackBarBehavior.floating,
        backgroundColor: p.ink,
        contentTextStyle: TextStyle(color: p.surface, fontSize: 14),
        actionTextColor: p.brand,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(AppRadius.field),
        ),
      ),

      progressIndicatorTheme: ProgressIndicatorThemeData(color: p.brand),

      dialogTheme: DialogThemeData(backgroundColor: p.surface),
      bottomSheetTheme: BottomSheetThemeData(backgroundColor: p.surface),
    );
  }
}
