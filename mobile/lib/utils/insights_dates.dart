DateTime shiftInsightsDate(
  DateTime selectedDate, {
  required bool monthly,
  required int amount,
}) {
  if (monthly) {
    return DateTime(selectedDate.year, selectedDate.month + amount, 1);
  }
  return DateTime(selectedDate.year, selectedDate.month, selectedDate.day + 7 * amount);
}
