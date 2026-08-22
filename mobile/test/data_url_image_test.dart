import 'package:ai_food_mobile/widgets/data_url_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  const png =
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';

  testWidgets('retains decoded bytes across parent rebuilds', (tester) async {
    const dataUrl = 'data:image/png;base64,$png';

    Widget app() => MaterialApp(
      home: MediaQuery(
        data: const MediaQueryData(devicePixelRatio: 2),
        child: const DataUrlImage(dataUrl: dataUrl, width: 20, height: 10),
      ),
    );

    await tester.pumpWidget(app());
    final first =
        (tester.widget<Image>(find.byType(Image)).image as ResizeImage)
                .imageProvider
            as MemoryImage;

    await tester.pumpWidget(app());
    final second =
        (tester.widget<Image>(find.byType(Image)).image as ResizeImage)
                .imageProvider
            as MemoryImage;

    expect(identical(first.bytes, second.bytes), isTrue);
    final resized = tester.widget<Image>(find.byType(Image)).image as ResizeImage;
    expect(resized.width, 40);
    expect(resized.height, 20);
  });

  testWidgets('decodes again when the data URL changes', (tester) async {
    await tester.pumpWidget(
      const MaterialApp(
        home: DataUrlImage(
          dataUrl: 'data:image/png;base64,$png',
          width: 20,
          height: 10,
        ),
      ),
    );
    final first =
        (tester.widget<Image>(find.byType(Image)).image as ResizeImage)
                .imageProvider
            as MemoryImage;

    await tester.pumpWidget(
      const MaterialApp(
        home: DataUrlImage(dataUrl: png, width: 20, height: 10),
      ),
    );
    final second =
        (tester.widget<Image>(find.byType(Image)).image as ResizeImage)
                .imageProvider
            as MemoryImage;

    expect(identical(first.bytes, second.bytes), isFalse);
    expect(second.bytes, first.bytes);
  });
}
