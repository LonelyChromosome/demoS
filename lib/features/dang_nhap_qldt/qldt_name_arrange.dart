import 'package:flutter/material.dart';

Future<String?> showQldtNameArrange(BuildContext context, List<String> words) => Navigator.of(context).push<String>(MaterialPageRoute<String>(fullscreenDialog: true, builder: (_) => _QldtNameArrangeScreen(words: words)));

final class _QldtNameToken {
  const _QldtNameToken({required this.id, required this.text});

  final int id;
  final String text;
}

class _QldtNameArrangeScreen extends StatefulWidget {
  const _QldtNameArrangeScreen({required this.words});

  final List<String> words;

  @override
  State<_QldtNameArrangeScreen> createState() => _QldtNameArrangeScreenState();
}

class _QldtNameArrangeScreenState extends State<_QldtNameArrangeScreen> {
  static const _blue = Color(0xFF1747B5);
  static const _ink = Color(0xFF172033);
  static const _muted = Color(0xFF64748B);
  static const _border = Color(0xFFD9E2F1);
  static const _surface = Color(0xFFF7F9FD);

  late final List<_QldtNameToken> _tokens = <_QldtNameToken>[
    for (var i = 0; i < widget.words.length; i++)
      _QldtNameToken(id: i, text: widget.words[i]),
  ];
  late final List<int> _availableOrder =
      _tokens.reversed.map((token) => token.id).toList(growable: false);
  final List<int> _selected = <int>[];
  bool _submitting = false;

  _QldtNameToken _token(int id) =>
      _tokens.firstWhere((token) => token.id == id);

  void _select(int id) {
    if (_selected.contains(id)) return;
    setState(() => _selected.add(id));
  }

  void _unselect(int id) {
    setState(() => _selected.remove(id));
  }

  void _submitName(String chosenName) {
    if (_submitting || _selected.length != _tokens.length) return;
    _submitting = true;
    Navigator.of(context).pop(chosenName);
  }

  @override
  Widget build(BuildContext context) {
    final complete = _selected.length == _tokens.length;
    final chosenName = _selected.map((id) => _token(id).text).join(' ');
    final available = _availableOrder.where((id) => !_selected.contains(id));

    final fixedTheme = ThemeData(
      useMaterial3: true,
      brightness: Brightness.light,
      scaffoldBackgroundColor: Colors.white,
      colorScheme: ColorScheme.fromSeed(
        seedColor: _blue,
        brightness: Brightness.light,
      ),
    );

    return Theme(
      data: fixedTheme,
      child: PopScope<String>(
        canPop: false,
        child: Scaffold(
          backgroundColor: Colors.white,
          body: SafeArea(
            child: Padding(
              padding: const EdgeInsets.fromLTRB(24, 28, 24, 12),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: <Widget>[
                  const Text(
                    'Xin Chào!',
                    textAlign: TextAlign.center,
                    style: TextStyle(
                      color: _ink,
                      fontSize: 30,
                      height: 1.1,
                      fontWeight: FontWeight.w900,
                    ),
                  ),
                  const SizedBox(height: 12),
                  const Text(
                    'Chúng tôi có thể gọi bạn là:',
                    textAlign: TextAlign.center,
                    style: TextStyle(
                      color: _ink,
                      fontSize: 17,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                  const SizedBox(height: 6),
                  const Text(
                    'Nhấp để sắp xếp tên của bạn',
                    textAlign: TextAlign.center,
                    style: TextStyle(
                      color: _muted,
                      fontSize: 13,
                      fontWeight: FontWeight.w500,
                    ),
                  ),
                  const SizedBox(height: 28),
                  AnimatedSize(
                    duration: const Duration(milliseconds: 200),
                    curve: Curves.easeOutCubic,
                    child: Container(
                      constraints: const BoxConstraints(minHeight: 96),
                      padding: const EdgeInsets.all(14),
                      decoration: BoxDecoration(
                        color: _surface,
                        borderRadius: BorderRadius.circular(18),
                        border: Border.all(color: _border),
                      ),
                      alignment: _selected.isEmpty
                          ? Alignment.center
                          : Alignment.topLeft,
                      child: _selected.isEmpty
                          ? const Text(
                              'Tên của bạn',
                              style: TextStyle(
                                color: Color(0xFF94A3B8),
                                fontSize: 15,
                                fontWeight: FontWeight.w600,
                              ),
                            )
                          : Wrap(
                              spacing: 9,
                              runSpacing: 9,
                              children: <Widget>[
                                for (final id in _selected)
                                  _AnimatedNameChip(
                                    key: ValueKey<String>('selected-$id'),
                                    label: _token(id).text,
                                    selectedArea: true,
                                    onTap: () => _unselect(id),
                                  ),
                              ],
                            ),
                    ),
                  ),
                  const SizedBox(height: 24),
                  AnimatedSize(
                    duration: const Duration(milliseconds: 200),
                    curve: Curves.easeOutCubic,
                    child: Wrap(
                      alignment: WrapAlignment.center,
                      spacing: 10,
                      runSpacing: 10,
                      children: <Widget>[
                        for (final id in available)
                          _AnimatedNameChip(
                            key: ValueKey<String>('available-$id'),
                            label: _token(id).text,
                            selectedArea: false,
                            onTap: () => _select(id),
                          ),
                      ],
                    ),
                  ),
                  const Spacer(),
                  Center(
                    child: AnimatedContainer(
                      duration: const Duration(milliseconds: 180),
                      curve: Curves.easeOutCubic,
                      width: 76,
                      height: 76,
                      decoration: BoxDecoration(
                        shape: BoxShape.circle,
                        color: complete ? _blue : const Color(0xFFDCE2EA),
                      ),
                      child: Material(
                        color: Colors.transparent,
                        shape: const CircleBorder(),
                        child: InkWell(
                          customBorder: const CircleBorder(),
                          onTap: complete && !_submitting
                              ? () => _submitName(chosenName)
                              : null,
                          child: Icon(
                            Icons.arrow_forward_rounded,
                            size: 40,
                            color: complete
                                ? Colors.white
                                : const Color(0xFF94A3B8),
                          ),
                        ),
                      ),
                    ),
                  ),
                  const SizedBox(height: 72),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _AnimatedNameChip extends StatelessWidget {
  const _AnimatedNameChip({
    super.key,
    required this.label,
    required this.selectedArea,
    required this.onTap,
  });

  final String label;
  final bool selectedArea;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return TweenAnimationBuilder<double>(
      tween: Tween<double>(
        begin: selectedArea ? 22 : -22,
        end: 0,
      ),
      duration: const Duration(milliseconds: 200),
      curve: Curves.easeOutCubic,
      builder: (context, offset, child) => Transform.translate(
        offset: Offset(0, offset),
        child: child,
      ),
      child: Material(
        color: Colors.white,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(13),
          side: const BorderSide(color: Color(0xFFD9E2F1)),
        ),
        child: InkWell(
          borderRadius: BorderRadius.circular(13),
          onTap: onTap,
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
            child: Text(
              label,
              style: const TextStyle(
                color: Color(0xFF172033),
                fontSize: 16,
                fontWeight: FontWeight.w700,
              ),
            ),
          ),
        ),
      ),
    );
  }
}
