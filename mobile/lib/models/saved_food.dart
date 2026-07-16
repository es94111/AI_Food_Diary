part of 'models.dart';

class SavedFood {
  final String id;
  final String? barcode;
  final String name;
  final String estimatedAmount;
  final double calories;
  final double protein;
  final double fat;
  final double carbs;
  final String source;
  final bool isFavorite;
  final int useCount;
  final DateTime? lastUsedAt;
  final DateTime? createdAt;
  final DateTime? updatedAt;
  final DateTime? archivedAt;
  final bool hasImage;

  SavedFood({
    required this.id,
    this.barcode,
    required this.name,
    required this.estimatedAmount,
    required this.calories,
    required this.protein,
    required this.fat,
    required this.carbs,
    this.source = 'MANUAL',
    this.isFavorite = false,
    this.useCount = 0,
    this.lastUsedAt,
    this.createdAt,
    this.updatedAt,
    this.archivedAt,
    this.hasImage = false,
  });

  factory SavedFood.fromJson(Map<String, dynamic> json) => SavedFood(
    id: json['id'] as String,
    barcode: json['barcode'] as String?,
    name: (json['name'] as String?) ?? '',
    estimatedAmount: (json['estimatedAmount'] as String?) ?? '',
    calories: _toDouble(json['calories']),
    protein: _toDouble(json['protein']),
    fat: _toDouble(json['fat']),
    carbs: _toDouble(json['carbs']),
    source: (json['source'] as String?) ?? 'MANUAL',
    isFavorite: json['isFavorite'] == true,
    hasImage: json['hasImage'] == true,
    useCount: _toInt(json['useCount']),
    lastUsedAt: json['lastUsedAt'] is String
        ? DateTime.tryParse(json['lastUsedAt'] as String)
        : null,
    createdAt: json['createdAt'] is String
        ? DateTime.tryParse(json['createdAt'] as String)
        : null,
    updatedAt: json['updatedAt'] is String
        ? DateTime.tryParse(json['updatedAt'] as String)
        : null,
    archivedAt: json['archivedAt'] is String
        ? DateTime.tryParse(json['archivedAt'] as String)
        : null,
  );
}
