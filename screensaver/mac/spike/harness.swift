import AppKit
import WebKit
import ScreenSaver

let app = NSApplication.shared
app.setActivationPolicy(.accessory)
let path = CommandLine.arguments[1], out = CommandLine.arguments[2]
guard let b = Bundle(path: path), b.load(), let cls = b.principalClass as? ScreenSaverView.Type else { print("FAIL: bundle load"); exit(1) }
let win = NSWindow(contentRect: NSRect(x: 0, y: 100, width: 3840, height: 1080), styleMask: [.titled], backing: .buffered, defer: false)
let view = cls.init(frame: NSRect(x: 0, y: 0, width: 3840, height: 1080), isPreview: false)!
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
var lastF = -1
let t0 = Date()
Timer.scheduledTimer(withTimeInterval: 1, repeats: true) { _ in
    guard let w = find(view) else { return }
    w.evaluateJavaScript("(window.__frames ? window.__frames() : -1) + ' ' + location.search.slice(0,18)") { r, _ in
        let s = "\(r ?? "nil")"; let n = Int(s.split(separator: " ").first ?? "") ?? -1
        let fps = lastF >= 0 && n >= lastF ? n - lastF : -1
        print(String(format: "t=%.0f frames=%d fps~%d %@", Date().timeIntervalSince(t0), n, fps, s)); lastF = n
    }
}
DispatchQueue.main.asyncAfter(deadline: .now() + 75) {
    probe("t=66") {
        if let w = find(view) { w.takeSnapshot(with: nil) { img, _ in
            if let img, let tiff = img.tiffRepresentation, let rep = NSBitmapImageRep(data: tiff), let png = rep.representation(using: .png, properties: [:]) { try? png.write(to: URL(fileURLWithPath: out)) }
            view.stopAnimation(); print("alpha after reroll:", w.alphaValue); exit(0)
        } } else { exit(1) }
    }
}
app.run()
