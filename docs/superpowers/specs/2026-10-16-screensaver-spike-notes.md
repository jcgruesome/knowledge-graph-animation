# macOS screensaver spike notes (2026-10-16, macOS 27.0.1, arm64, Command Line Tools only)

## Works (verified in-process with `screensaver/mac/spike/harness.swift`)
- Build without Xcode: `swiftc -O -emit-library -Xlinker -bundle -module-name KGSpike -target arm64-apple-macosx14.0 -framework ScreenSaver -framework WebKit -o <bundle>/Contents/MacOS/KGSpike SpikeView.swift`, hand-written `Info.plist` (`NSPrincipalClass` = `@objc(SpikeView)` class name, `CFBundlePackageType` BNDL), then `codesign --force --sign - <bundle>` (ad-hoc).
- `ScreenSaverView` subclass hosting `WKWebView`, page served through a custom `WKURLSchemeHandler` (`rx://app/index.html?...`) mapping to `Contents/Resources/web`. Module scripts, top-level await and WebGL2 all work. The query string is ignored when mapping to files.
- The real `pnpm build` output (`dist/`) renders in that host: WebGL scene, bloom, HUD, labels.

## Not verifiable from the CLI
- `ScreenSaverEngine` ignores `defaults -currentHost write com.apple.screensaver moduleDict` on macOS 27 and showed the lock screen. The `legacyScreenSaver` sandbox path (System Settings selection, preview pane, fullscreen) must be checked by hand: select "KGSpike" in System Settings > Screen Saver.
- GPU/fps at density 1/2/3 not yet measured (do in Task 4 inside the real host).
