# BPA iPhone · Android 1.6 port

Source: DemoF3 commit `16f7ee232ad2b74699cf960f33c87c8caaadecc3`, version `1.6.0+51`.
Original Flutter layouts, data verification, themes, VFX, shaders and assets are reused.
DemoF3 is not modified. iPhone-specific bridges live under `ios/` and six platform adapters.

This is an initial port, not an installable or 95%-verified release.
See [PORT_STATUS.md](docs/PORT_STATUS.md).

The intended installation is a single signed app through TestFlight, including all three widgets,
without configuring Scriptable or Shortcut automations. The unsigned CI package is for inspection
and is not a normal installable iPhone app.

On macOS: `bash tool/generate_ios.sh`, `flutter pub get`, `bash tool/test_core.sh`, then
`flutter build ios --release --no-codesign`. Device signing and iPhone acceptance tests are still required.
