part of 'models.dart';

class MealBundleItem {
  final String? savedFoodId;
  final String name;
  final String estimatedAmount;
  final double calories;
  final double protein;
  final double fat;
  final double carbs;
  final String aiRating;

  const MealBundleItem({
    this.savedFoodId,
    required this.name,
    required this.estimatedAmount,
    required this.calories,
    required this.protein,
    required this.fat,
    required this.carbs,
    this.aiRating = 'MANUAL',
  });

  factory MealBundleItem.fromJson(Map<String, dynamic> json) => MealBundleItem(
    savedFoodId: json['savedFoodId'] as String?,
    name: (json['name'] as String?) ?? '',
    estimatedAmount: (json['estimatedAmount'] as String?) ?? '',
    calories: _toDouble(json['calories']),
    protein: _toDouble(json['protein']),
    fat: _toDouble(json['fat']),
    carbs: _toDouble(json['carbs']),
    aiRating: (json['aiRating'] as String?) ?? 'MANUAL',
  );

  Map<String, dynamic> toPayload() => {
    if (savedFoodId != null) 'savedFoodId': savedFoodId,
    'name': name,
    'estimatedAmount': estimatedAmount,
    'calories': calories,
    'protein': protein,
    'fat': fat,
    'carbs': carbs,
    'aiRating': aiRating,
  };
}

class MealBundle {
  final String id;
  final String name;
  final bool hasImage;
  final String? imageUrl;
  final DateTime? createdAt;
  final DateTime? updatedAt;
  final List<MealBundleItem> items;

  const MealBundle({
    required this.id,
    required this.name,
    this.hasImage = false,
    this.imageUrl,
    this.createdAt,
    this.updatedAt,
    required this.items,
  });

  factory MealBundle.fromJson(Map<String, dynamic> json) => MealBundle(
    id: json['id'] as String,
    name: (json['name'] as String?) ?? '',
    hasImage: json['hasImage'] == true,
    imageUrl: json['imageUrl'] as String?,
    createdAt: json['createdAt'] is String
        ? DateTime.tryParse(json['createdAt'] as String)
        : null,
    updatedAt: json['updatedAt'] is String
        ? DateTime.tryParse(json['updatedAt'] as String)
        : null,
    items: (json['items'] as List?)
            ?.whereType<Map>()
            .map((entry) => MealBundleItem.fromJson(Map<String, dynamic>.from(entry)))
            .toList() ??
        const [],
  );
}
