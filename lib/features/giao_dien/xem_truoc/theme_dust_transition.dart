import 'dart:async';
import 'dart:math' as math;
import 'dart:typed_data';
import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';

/// Captures the complete app, including the theme sheet. The frozen custom
/// image covers the live default UI before any theme state is changed.
class ThemeDustSurface extends StatefulWidget {
  const new({required this.child, super.key});
  final Widget child;
  static final busy = ValueNotifier<bool>(false);
  static final GlobalKey<_ThemeDustSurfaceState> _surfaceKey = GlobalKey();
  static GlobalKey get surfaceKey => _surfaceKey;

  static Future<void> delete(Future<void> Function() apply) async {
    final surface = _surfaceKey.currentState;
    if (surface == null) {
      await apply();
      return;
    }
    await surface.run(apply);
  }

  @override
  State<ThemeDustSurface> createState() => _ThemeDustSurfaceState();
}

class _ThemeDustSurfaceState extends State<ThemeDustSurface>
    with SingleTickerProviderStateMixin {
  final GlobalKey _captureKey = GlobalKey();
  late final AnimationController _clock = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 2400),
  );
  late final Future<ui.FragmentProgram> _program = ui.FragmentProgram.fromAsset(
    'shaders/theme_dust.frag',
  );
  _DustPainter? _dust;
  bool _busy = false;

  Future<void> run(Future<void> Function() apply) async {
    if (_busy) return;
    _busy = true;
    ThemeDustSurface.busy.value = true;
    ui.Image? snapshot;
    ui.FragmentShader? shader;
    try {
      final program = await _program;
      await WidgetsBinding.instance.endOfFrame;
      if (!mounted) return;
      final boundary =
          _captureKey.currentContext!.findRenderObject()!
              as RenderRepaintBoundary;
      final size = boundary.size;
      // Keep source sharp enough for colored texture fragments, cap capture
      // cost independently of device pixel density.
      snapshot = await boundary.toImage(pixelRatio: 1.5);
      shader = program.fragmentShader();
      final dust = _DustPainter(snapshot, shader, size, _clock);
      setState(() => _dust = dust);
      // The custom snapshot must have painted before default UI can mount.
      await WidgetsBinding.instance.endOfFrame;
      await apply();
      await WidgetsBinding.instance.endOfFrame;
      if (mounted) await _clock.forward(from: 0).orCancel;
    } finally {
      if (mounted) {
        setState(() => _dust = null);
        // Wait until the painter no longer references the GPU resources.
        await WidgetsBinding.instance.endOfFrame;
      }
      shader?.dispose();
      snapshot?.dispose();
      _busy = false;
      ThemeDustSurface.busy.value = false;
    }
  }

  @override
  void dispose() {
    _clock.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => Stack(
    fit: StackFit.expand,
    children: [
      RepaintBoundary(key: _captureKey, child: widget.child),
      if (_dust != null)
        Positioned.fill(
          child: PopScope(
            canPop: false,
            child: AbsorbPointer(
              child: RepaintBoundary(child: CustomPaint(painter: _dust)),
            ),
          ),
        ),
    ],
  );
}

class _DustPainter extends CustomPainter {
  new(this.image, this.shader, this.logicalSize, this.clock)
    : super(repaint: clock) {
    // Dense, textured fragments. One GPU atlas draw, no per-particle widgets,
    // no bitmap readback or buffer allocation during animation.
    final spacing = math.max(
      3.1,
      math.sqrt(logicalSize.width * logicalSize.height / 38000),
    );
    final cols = (logicalSize.width / spacing).ceil();
    final rows = (logicalSize.height / spacing).ceil();
    count = cols * rows;
    positions = Float32List(count * 2);
    births = Float32List(count);
    seeds = Float32List(count);
    rects = Float32List(count * 4);
    transforms = Float32List(count * 4);
    colors = Int32List(count);
    final ratio = image.width / logicalSize.width;
    final random = math.Random(1606);
    for (var i = 0; i < count; i++) {
      final x = ((i % cols) + .5) * spacing;
      final y = ((i ~/ cols) + .5) * spacing;
      positions[i * 2] = x;
      positions[i * 2 + 1] = y;
      final ux = x / logicalSize.width;
      final uy = y / logicalSize.height;
      births[i] =
          (uy * .72 +
              (1 - ux) * .20 +
              (_noise(ux * 9, uy * 17) * .70 + _noise(ux * 31, uy * 57) * .30) *
                  .08) *
          1.30;
      seeds[i] = random.nextDouble();
      final width = spacing * (.55 + random.nextDouble() * .65);
      final height = spacing * (.45 + random.nextDouble() * .65);
      rects[i * 4] = (x - width / 2).clamp(0, logicalSize.width) * ratio;
      rects[i * 4 + 1] = (y - height / 2).clamp(0, logicalSize.height) * ratio;
      rects[i * 4 + 2] = (x + width / 2).clamp(0, logicalSize.width) * ratio;
      rects[i * 4 + 3] = (y + height / 2).clamp(0, logicalSize.height) * ratio;
    }
    shader.setFloat(0, logicalSize.width);
    shader.setFloat(1, logicalSize.height);
    shader.setImageSampler(0, image);
    maskPaint.shader = shader;
  }

  final ui.Image image;
  final ui.FragmentShader shader;
  final Size logicalSize;
  final AnimationController clock;
  final Paint maskPaint = Paint();
  final Paint dustPaint = Paint()..filterQuality = FilterQuality.low;
  late final int count;
  late final Float32List positions;
  late final Float32List births;
  late final Float32List seeds;
  late final Float32List rects;
  late final Float32List transforms;
  late final Int32List colors;

  static double _hash(double x, double y) {
    final n = (x * 73 + y * 151) % 289;
    return (n * n * 34 + n) % 289 / 289;
  }

  static double _noise(double x, double y) {
    final ix = x.floorToDouble();
    final iy = y.floorToDouble();
    var fx = x - ix;
    var fy = y - iy;
    fx = fx * fx * (3 - 2 * fx);
    fy = fy * fy * (3 - 2 * fy);
    final a = _hash(ix, iy) * (1 - fx) + _hash(ix + 1, iy) * fx;
    final b = _hash(ix, iy + 1) * (1 - fx) + _hash(ix + 1, iy + 1) * fx;
    return a * (1 - fy) + b * fy;
  }

  @override
  void paint(Canvas canvas, Size size) {
    final elapsed = clock.value * 2.4;
    // 1.7s erosion, then 0.7s lingering dust. Snapshot is completely opaque
    // during preparation; changing the live theme cannot flash through it.
    final progress = math.max<double>(0, (elapsed - .06) / 1.25);
    if (elapsed <= .06) {
      canvas.drawImageRect(
        image,
        Rect.fromLTWH(0, 0, image.width.toDouble(), image.height.toDouble()),
        Offset.zero & logicalSize,
        dustPaint,
      );
      return;
    }
    shader.setFloat(2, progress);
    canvas.drawRect(Offset.zero & logicalSize, maskPaint);
    final ratio = logicalSize.width / image.width;
    for (var i = 0; i < count; i++) {
      final age = (progress - births[i]) * 1.25;
      final seed = seeds[i];
      final life = .45 + seed * .34;
      final j = i * 4;
      if (age < 0 || age > life) {
        transforms[j] = 0;
        transforms[j + 1] = 0;
        colors[i] = 0;
        continue;
      }
      final t = age / life;
      // Fragments detach at their own source pixel, then break down into fine
      // dust. No additive glow: RGB/texture comes entirely from the snapshot.
      final scale = ratio * (1 - .87 * t);
      final rotation = (seed - .5) * age * 3;
      final sc = math.cos(rotation) * scale;
      final ss = math.sin(rotation) * scale;
      final phase = seed * math.pi * 2;
      final drift =
          (seed - .5) * 90 * age + math.sin(phase + age * 7) * 22 * age;
      final lift = (32 + seed * 62) * age + 95 * age * age;
      final x = positions[i * 2] + drift;
      final y = positions[i * 2 + 1] - lift;
      final w = rects[j + 2] - rects[j];
      final h = rects[j + 3] - rects[j + 1];
      transforms[j] = sc;
      transforms[j + 1] = ss;
      transforms[j + 2] = x - sc * w / 2 + ss * h / 2;
      transforms[j + 3] = y - ss * w / 2 - sc * h / 2;
      final alpha = ((1 - t * t) * 255).round().clamp(0, 255);
      colors[i] = (alpha << 24) | 0xFFFFFF;
    }
    canvas.drawRawAtlas(
      image,
      transforms,
      rects,
      colors,
      BlendMode.modulate,
      null,
      dustPaint,
    );
  }

  @override
  bool shouldRepaint(covariant _DustPainter oldDelegate) => false;
}
