import 'package:flutter/material.dart';

/// Minimal Markdown renderer for AI-generated text (advice / summaries).
///
/// Handles the subset the model actually emits — headings (#/##/###), bullet
/// lists (-/*), numbered lists, blank-line spacing, and inline **bold**,
/// *italic* and `code` — without pulling a third-party package.
class MarkdownText extends StatelessWidget {
  const MarkdownText(this.data, {super.key, this.style});

  final String data;
  final TextStyle? style;

  @override
  Widget build(BuildContext context) {
    final base = (DefaultTextStyle.of(context).style).merge(style);
    final lines = data.replaceAll('\r\n', '\n').split('\n');
    final children = <Widget>[];

    for (final raw in lines) {
      final line = raw.trimRight();
      if (line.trim().isEmpty) {
        children.add(const SizedBox(height: 6));
        continue;
      }

      final heading = RegExp(r'^(#{1,3})\s+(.*)$').firstMatch(line.trimLeft());
      if (heading != null) {
        final level = heading.group(1)!.length;
        final size = (base.fontSize ?? 14) + (level == 1 ? 4 : level == 2 ? 2 : 1);
        children.add(Padding(
          padding: const EdgeInsets.only(top: 4, bottom: 2),
          child: RichText(
            text: TextSpan(
              style: base.copyWith(fontWeight: FontWeight.w800, fontSize: size),
              children: _inline(heading.group(2)!, base.copyWith(
                  fontWeight: FontWeight.w800, fontSize: size)),
            ),
          ),
        ));
        continue;
      }

      final bullet = RegExp(r'^\s*[-*]\s+(.*)$').firstMatch(line);
      if (bullet != null) {
        children.add(_bulletRow('•', bullet.group(1)!, base));
        continue;
      }

      final numbered = RegExp(r'^\s*(\d+)[.)]\s+(.*)$').firstMatch(line);
      if (numbered != null) {
        children.add(_bulletRow('${numbered.group(1)}.', numbered.group(2)!, base));
        continue;
      }

      children.add(Padding(
        padding: const EdgeInsets.symmetric(vertical: 2),
        child: RichText(text: TextSpan(style: base, children: _inline(line, base))),
      ));
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      mainAxisSize: MainAxisSize.min,
      children: children,
    );
  }

  Widget _bulletRow(String marker, String text, TextStyle base) {
    return Padding(
      padding: const EdgeInsets.only(left: 2, top: 2, bottom: 2),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('$marker  ', style: base),
          Expanded(
            child: RichText(
                text: TextSpan(style: base, children: _inline(text, base))),
          ),
        ],
      ),
    );
  }

  /// Parses inline **bold**, *italic* and `code` into spans.
  List<InlineSpan> _inline(String text, TextStyle base) {
    final pattern = RegExp(r'\*\*(.+?)\*\*|\*(.+?)\*|`(.+?)`');
    final spans = <InlineSpan>[];
    var index = 0;
    for (final m in pattern.allMatches(text)) {
      if (m.start > index) {
        spans.add(TextSpan(text: text.substring(index, m.start)));
      }
      if (m.group(1) != null) {
        spans.add(TextSpan(
            text: m.group(1),
            style: base.copyWith(fontWeight: FontWeight.bold)));
      } else if (m.group(2) != null) {
        spans.add(TextSpan(
            text: m.group(2),
            style: base.copyWith(fontStyle: FontStyle.italic)));
      } else if (m.group(3) != null) {
        spans.add(TextSpan(
            text: m.group(3),
            style: base.copyWith(
                fontFamily: 'monospace',
                backgroundColor: const Color(0x11000000))));
      }
      index = m.end;
    }
    if (index < text.length) spans.add(TextSpan(text: text.substring(index)));
    if (spans.isEmpty) spans.add(TextSpan(text: text));
    return spans;
  }
}
