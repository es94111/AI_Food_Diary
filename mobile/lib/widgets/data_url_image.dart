import 'dart:convert';
import 'dart:typed_data';

import 'package:flutter/material.dart';

/// A memory-backed thumbnail that decodes its data URL only when the URL
/// changes, rather than allocating the full byte buffer on every parent build.
class DataUrlImage extends StatefulWidget {
  const DataUrlImage({
    super.key,
    required this.dataUrl,
    required this.width,
    required this.height,
    this.fit = BoxFit.cover,
  });

  final String dataUrl;
  final double width;
  final double height;
  final BoxFit fit;

  @override
  State<DataUrlImage> createState() => _DataUrlImageState();
}

class _DataUrlImageState extends State<DataUrlImage> {
  late Uint8List _bytes = _decode(widget.dataUrl);

  @override
  void didUpdateWidget(DataUrlImage oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.dataUrl != widget.dataUrl) {
      _bytes = _decode(widget.dataUrl);
    }
  }

  static Uint8List _decode(String dataUrl) {
    final separator = dataUrl.indexOf(',');
    return base64Decode(
      separator < 0 ? dataUrl : dataUrl.substring(separator + 1),
    );
  }

  @override
  Widget build(BuildContext context) {
    final pixelRatio = MediaQuery.devicePixelRatioOf(context);
    return Image.memory(
      _bytes,
      width: widget.width,
      height: widget.height,
      fit: widget.fit,
      cacheWidth: (widget.width * pixelRatio).ceil(),
      cacheHeight: (widget.height * pixelRatio).ceil(),
    );
  }
}
