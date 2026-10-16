import ScreenSaver
import WebKit
import os
let log = Logger(subsystem: "com.reshapex.kgspike", category: "view")

final class FolderHandler: NSObject, WKURLSchemeHandler {
    let root: URL
    init(root: URL) { self.root = root }
    func webView(_ webView: WKWebView, start task: WKURLSchemeTask) {
        guard let url = task.request.url else { return }
        var path = url.path
        if path == "/" || path.isEmpty { path = "/index.html" }
        let file = root.appendingPathComponent(path)
        guard let data = try? Data(contentsOf: file) else {
            task.didFailWithError(NSError(domain: "spike", code: 404)); return
        }
        let mime: String
        switch file.pathExtension {
        case "html": mime = "text/html"
        case "js": mime = "text/javascript"
        case "css": mime = "text/css"
        case "svg": mime = "image/svg+xml"
        case "woff2": mime = "font/woff2"
        default: mime = "application/octet-stream"
        }
        let resp = HTTPURLResponse(url: url, statusCode: 200, httpVersion: nil,
                                   headerFields: ["Content-Type": mime, "Content-Length": "\(data.count)"])!
        task.didReceive(resp); task.didReceive(data); task.didFinish()
    }
    func webView(_ webView: WKWebView, stop task: WKURLSchemeTask) {}
}

@objc(SpikeView)
final class SpikeView: ScreenSaverView {
    private var web: WKWebView?

    override init?(frame: NSRect, isPreview: Bool) {
        super.init(frame: frame, isPreview: isPreview)
        log.notice("init preview=\(isPreview) frame=\(NSStringFromRect(frame), privacy: .public)")
        makeWeb()
    }
    private var ticker: Timer?
    let id = Int.random(in: 100...999)
    private func makeWeb() {
        guard web == nil else { return }
        let bundle = Bundle(for: SpikeView.self)
        let root = bundle.resourceURL!.appendingPathComponent("web")
        let cfg = WKWebViewConfiguration()
        cfg.setURLSchemeHandler(FolderHandler(root: root), forURLScheme: "rx")
        let w = WKWebView(frame: bounds, configuration: cfg)
        w.autoresizingMask = [.width, .height]
        w.setValue(false, forKey: "drawsBackground")
        // legacyScreenSaver windows are reported occluded, so WebKit hides the page and stops rAF.
        let sel = NSSelectorFromString("_setWindowOcclusionDetectionEnabled:")
        if w.responds(to: sel), let imp = w.method(for: sel) {
            typealias SetBool = @convention(c) (AnyObject, Selector, Bool) -> Void
            unsafeBitCast(imp, to: SetBool.self)(w, sel, false); log.notice("occlusion detection disabled")
        }
        else { log.error("WKWebView lacks _setWindowOcclusionDetectionEnabled:") }
        addSubview(w)
        web = w
        w.load(URLRequest(url: URL(string: "rx://app/index.html?seed=1&preview=\(isPreview ? 1 : 0)")!))
        ticker = Timer.scheduledTimer(withTimeInterval: 1, repeats: true) { [weak self] _ in
            self?.web?.evaluateJavaScript("window.__frames + ' vis=' + document.visibilityState") { r, e in
                log.notice("tick \(self?.id ?? 0, privacy: .public) frames=\(String(describing: r), privacy: .public) err=\(String(describing: e), privacy: .public) win=\(self?.window != nil, privacy: .public) vis=\(self?.window?.isVisible ?? false, privacy: .public) size=\(NSStringFromSize(self?.bounds.size ?? .zero), privacy: .public)")
            }
        }
    }
    required init?(coder: NSCoder) { fatalError() }
    override func startAnimation() { log.notice("startAnimation"); makeWeb(); super.startAnimation() }
    override func stopAnimation() {
        log.notice("stopAnimation")
        ticker?.invalidate(); ticker = nil
        web?.removeFromSuperview(); web = nil
        super.stopAnimation()
    }
    override var hasConfigureSheet: Bool { false }
}
