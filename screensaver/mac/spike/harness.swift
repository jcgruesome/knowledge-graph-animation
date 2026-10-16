import AppKit
import WebKit
import ScreenSaver

// Loads the .saver bundle in-process (no legacyScreenSaver) and checks the page it hosts.
let app = NSApplication.shared
app.setActivationPolicy(.accessory)
let path = CommandLine.arguments[1], out = CommandLine.arguments[2]
guard let b = Bundle(path: path), b.load(), let cls = b.principalClass as? ScreenSaverView.Type else { print("FAIL: bundle load"); exit(1) }
let win = NSWindow(contentRect: NSRect(x: 100, y: 100, width: 640, height: 400), styleMask: [.titled], backing: .buffered, defer: false)
let view = cls.init(frame: NSRect(x: 0, y: 0, width: 640, height: 400), isPreview: false)!
win.contentView = view
win.makeKeyAndOrderFront(nil)
view.startAnimation()
func find(_ v: NSView) -> WKWebView? { if let w = v as? WKWebView { return w }; for s in v.subviews { if let w = find(s) { return w } }; return nil }
DispatchQueue.main.asyncAfter(deadline: .now() + 4) {
    guard let w = find(view) else { print("FAIL: no webview"); exit(1) }
    w.evaluateJavaScript(""canvas=" + document.querySelectorAll("canvas").length + " beat=" + (document.getElementById("beat")||{}).textContent") { r, e in
        print("PAGE:", r ?? "nil", "ERR:", e?.localizedDescription ?? "none")
        w.takeSnapshot(with: nil) { img, _ in
            if let img, let tiff = img.tiffRepresentation, let rep = NSBitmapImageRep(data: tiff), let png = rep.representation(using: .png, properties: [:]) { try? png.write(to: URL(fileURLWithPath: out)); print("snapshot written") }
            view.stopAnimation(); exit(0)
        }
    }
}
app.run()
