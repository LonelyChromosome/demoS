# BPA cooc 1.0 base

First hardware target: import/open in Scriptable, verified QLDT login/sync, persisted
in-app day/week calendar. This is a base test candidate; original full-app device
parity and the previously reported Scriptable freeze are not confirmed resolved.

The imported script is about 7 KB. It presents a small local startup WebView before
network/install work, downloads pinned hash-checked runtime/UI/font, then imports
the runtime through Scriptable's documented absolute-path importModule. Sync code
is a separate 17 KB module fetched/imported only after a user login/refresh action.
No archive, full Flutter JS, CanvasKit/WASM, theme, widget script, signed Shortcut,
NFC or Clock is loaded by base. It uses a local HTML/CSS calendar with the original
classic palette, Roboto font, login layout, day cards and week rows. HTML rendering
is a new implementation, not a claimed pixel-identical Flutter/iPhone result.

Runtime data uses the existing local BPA/preferences.json and Keychain session key.
The full-app wrapped snapshot is read without discarding optional-module settings.
Original native QLDT transport/core parser/verification are reused, including exact
registration matching and prior-term exam retention. Saved data changes only after
verification/name setup and an atomic preferences commit. HTTP failures keep the
old schedule. Foreground base ownership invalidates old outstanding worker leases;
interrupted old transactions recover before reading preferences. Closing native
presentation cancels later requests/commits; no widget is created on startup.

The original full build is preserved. The installer is named BPA Base to test next
to the previous BPA script. Do not delete Scriptable or its data to install it.
First launch and first sync need internet; downloaded components and calendar are
cached locally. No real student data/cookies/tokens are sent to the resource host.
No old full-app update feed runs from base. Installing optional modules is future
work after the three base functions pass on an actual iPhone.

Build: python3 scriptable/base/build.py --release <immutable-public-source-commit>.
Generated source commit contains placeholder export; use CI's pinned installer or
the supplied file, never the placeholder repository export. Native launcher mocks,
actual base runtime/transport fixtures and Chromium/WebKit day/week UI checks are
separate from physical Scriptable import and actual-account login tests.

## Live-page session fix after first iPhone login feedback

The first base imported/opened and reached QLDT, but returned to BPA and remained
at connecting. That proves import/open progressed; actual sync did not succeed.
Original base replaced the QLDT document and fetched with native Scriptable Request.
This fix preserves the authenticated QLDT document and its edu.system.makeRequest;
registration and schedule use the original Android scripts in that live context.
A sandboxed iframe overlays BPA calendar above the portal. Refresh uses the same
live page; no second WebView or native Request replays the login session. Native
input polling now drains a JSON string synchronously rather than leaving a callback
pending across navigation. Request callbacks capture completion and ignore late
responses after timeout. Status phases are logged without credentials/student data.
Tests include the live parent transport, sandboxed UI commands, a second refresh
without replacing the portal, and retained old data after portal errors. These
checks still do not establish actual-account/iPhone success or university-site CSP
compatibility; the supplied new pinned installer is a device fix candidate.
