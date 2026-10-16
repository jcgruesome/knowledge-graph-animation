import AppKit
import WebKit
import ScreenSaver

let app = NSApplication.shared
app.setActivationPolicy(.accessory)
let path = CommandLine.arguments[1], out = CommandLine.arguments[2]
guard let b = Bundle(path: path), b.load(), let cls = b.principalClass as? ScreenSaverView.Type else { print("FAIL: bundle load"); exit(1) }
let win = NSWindow(contentRect: NSRect(x: 100, y: 100, width: 960, height: 540), styleMask: [.titled], backing: .buffered, defer: false)
let view = cls.init(frame: NSRect(x: 0, y: 0, width: 960, height: 540), isPreview: false)!
win.contentView = view
win.makeKeyAndOrderFront(nil)
view.startAnimation()
func find(_ v: NSView) -> WKWebView? { if let w = v as? WKWebView { return w }; for s in v.subviews { if let w = find(s) { return w } }; return nil }
func probe(_ label: String, _ done: @escaping () -> Void) {
    guard let w = find(view) else { print("\(label) FAIL no webview (error view?)", view.subviews.map { "\($0)" }); done(); return }
    w.evaluateJavaScript("location.search + ' vis=' + document.visibilityState + ' frames=' + (window.__frames ? window.__frames() : -1) + ' canvas=' + document.querySelectorAll('canvas').length + ' alpha=' + 1") { r, e in
        print(label, r ?? "nil", e?.localizedDescription ?? "")
        done()
    }
}
DispatchQueue.main.asyncAfter(deadline: .now() + 6) { probe("t=6") {} }
DispatchQueue.main.asyncAfter(deadline: .now() + 66) {
    probe("t=66") {
        if let w = find(view) { w.takeSnapshot(with: nil) { img, _ in
            if let img, let tiff = img.tiffRepresentation, let rep = NSBitmapImageRep(data: tiff), let png = rep.representation(using: .png, properties: [:]) { try? png.write(to: URL(fileURLWithPath: out)) }
            view.stopAnimation(); print("alpha after reroll:", w.alphaValue); exit(0)
        } } else { exit(1) }
    }
}
app.run()
